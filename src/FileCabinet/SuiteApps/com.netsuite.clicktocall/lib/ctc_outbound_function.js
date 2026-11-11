// @ts-check
/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Outbound TwiML: one Twilio Function service, published by NetSuite.
 *
 *   Rep clicks Call ─▶ Device.connect({ To, CallerId })
 *     └─▶ TwiML App Voice URL = https://{domain}/dial   (this module sets it)
 *           /dial:   <Dial answerOnBridge record="record-from-answer-dual">
 *                      <Number url="https://{domain}/notice">{To}</Number>
 *                    </Dial>            (url only when NOTICE_ON is 'true')
 *                    To must start with a prefix in ALLOWED_PREFIXES
 *                    (country allow-list, toll-fraud guard), else <Say>.
 *           /notice: <Say>{NOTICE_TEXT, "AI" read as "A I"}</Say>
 *
 * The recording stays on the PARENT call (the rep's browser leg), so the
 * transcript lookup (Calls/{sid}/Recordings) is unchanged. The notice plays
 * to the called party after they answer and before the legs bridge, so it
 * is outside the recording (spike 2026-11-03).
 *
 * Twilio objects (fixed unique names, so publish is idempotent):
 *   service     UniqueName ctc-outbound (IncludeCredentials false)
 *   environment UniqueName production, DomainSuffix prod
 *   functions   FriendlyName ctc-dial (Path /dial), ctc-notice (Path /notice),
 *               Visibility protected (Twilio checks X-Twilio-Signature)
 *   build       Runtime node22 (RUNTIME)
 *   variables   NOTICE_ON, NOTICE_TEXT, NOTICE_VER, CALLER_ID_DEFAULT,
 *               ALLOWED_PREFIXES ('+1,+44' or '*'; see allowedPrefixes)
 *
 * publishOutbound sequence (steps, in order):
 *   probe       GET  serverless.twilio.com/v1/Services (Serverless access)
 *   service     find by UniqueName, else POST /Services
 *   environment GET  /Services/{ZS}/Environments, else POST
 *   functions   GET  /Services/{ZS}/Functions, else POST per function
 *   upload      POST serverless-upload.twilio.com/.../Functions/{ZH}/Versions
 *               (multipart body built by hand; skipped when the code hash
 *               is unchanged and the stored build still exists)
 *   build       POST /Services/{ZS}/Builds (FunctionVersions twice, Runtime),
 *               then GET .../Builds/{ZB}/Status at most MAX_BUILD_POLLS
 *               times. Still building → { ok:false, pending:true }; the
 *               build SID is kept in custrecord_ctc_out_fn_pending_build and
 *               publishOutbound(cfg, { resume: true }) finishes it.
 *   variables   GET + POST .../Environments/{ZE}/Variables (only changed values)
 *   deployment  POST .../Environments/{ZE}/Deployments { BuildSid }, then
 *               record.submitFields of the build, code version/hash and
 *               custrecord_ctc_out_pub_notice_ver (what Twilio now serves)
 *   voiceUrl    GET + POST /2010-04-01/.../Applications/{AP}.json
 *               (the first publish stores the old Voice URL for unpublish)
 *   save        record.submitFields on the config record (published_at, ...)
 * The TwiML App Voice URL changes only after a completed deployment. On a
 * republish the app already points at the Function, so the deployment
 * itself makes the new notice live: the live notice version is saved right
 * after it, before the voiceUrl and save steps, so a later failure cannot
 * leave the consent log (noticeForCall) on the old version.
 *
 * Governance (N/https call = 10 units, config submitFields = 2 units):
 *   first publish, worst case: 20 calls + MAX_BUILD_POLLS polls
 *     = 30 calls = 300 units, + about 10 units of submitFields.
 *   republish, code unchanged (text / on-off change): about 9 calls = 90 units.
 *   resume: 1-10 polls + 7 calls = 80-170 units.
 *   unpublish: 2-4 calls = 20-40 units.
 *   outboundStatus: 1-2 calls = 10-20 units (TwiML App; environment when published).
 * Polling stops early when the script has fewer than MIN_USAGE_TO_POLL
 * units left. SuiteScript has no sleep: each poll is one N/https call.
 *
 * Auth: the existing API key (lib/ctc_twilio_admin buildSecureAuthHeader);
 * the secret value never enters script scope.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/runtime', 'N/record', 'N/log', './ctc_config', './ctc_twilio_admin'],
       (runtime, record, log, config, twilio) => {

    /** Bump when DIAL_SOURCE / NOTICE_SOURCE / RUNTIME change. */
    // 2: country allow-list (ALLOWED_PREFIXES) in /dial (2026-11-11).
    const FN_CODE_VERSION = '2';
    const RUNTIME = 'node22';

    const SERVICE_UNIQUE_NAME = 'ctc-outbound';
    const SERVICE_FRIENDLY_NAME = 'CTC Outbound';
    const ENV_UNIQUE_NAME = 'production';
    const ENV_DOMAIN_SUFFIX = 'prod';
    const FUNCTIONS = [
        { key: 'dial', friendlyName: 'ctc-dial', path: '/dial' },
        { key: 'notice', friendlyName: 'ctc-notice', path: '/notice' }
    ];

    const SERVERLESS_SERVICES = 'https://serverless.twilio.com/v1/Services';
    const UPLOAD_SERVICES = 'https://serverless-upload.twilio.com/v1/Services';
    const FORM_TYPE = 'application/x-www-form-urlencoded';

    const MAX_BUILD_POLLS = 10;
    const MIN_USAGE_TO_POLL = 200;

    const SERVERLESS_ACCESS_ERROR = 'Your Twilio API key has no Serverless access. ' +
        'Add Serverless permissions to this key.';

    // Strict SID shapes, checked before a SID goes into a URL path.
    const SID = {
        service: /^ZS[0-9a-f]{32}$/,
        environment: /^ZE[0-9a-f]{32}$/,
        fn: /^ZH[0-9a-f]{32}$/,
        version: /^ZN[0-9a-f]{32}$/,
        build: /^ZB[0-9a-f]{32}$/,
        variable: /^ZV[0-9a-f]{32}$/,
        deployment: /^ZD[0-9a-f]{32}$/,
        app: /^AP[0-9a-f]{32}$/
    };
    const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.twil\.io$/;
    // Any ctc-outbound Function /dial URL (also one of an older, deleted service).
    const OUR_DIAL_URL_RE = /^https:\/\/ctc-outbound-[a-z0-9-]+\.twil\.io\/dial$/;

    const STEP_LABELS = {
        probe: 'Check Serverless access',
        service: 'Function service',
        environment: 'Environment',
        functions: 'Functions',
        upload: 'Upload code',
        build: 'Build',
        variables: 'Notice settings',
        deployment: 'Deploy',
        voiceUrl: 'TwiML App Voice URL',
        save: 'Save in NetSuite'
    };

    /* ------------------------------------------------------------------ */
    /* Function sources (deployed to Twilio as plain JS)                  */
    /* ------------------------------------------------------------------ */
    // Plain strings joined with '\n' (no template literals). A backslash in
    // the Function code is written twice here.

    const DIAL_SOURCE = [
        '// CTC outbound dial. Generated by NetSuite Click-to-Call; edit in the',
        '// NetSuite Setup Wizard, not here.',
        'exports.handler = function (context, event, callback) {',
        '  var twiml = new Twilio.twiml.VoiceResponse();',
        '  var to = String(event.To || \'\');',
        '  if (!/^\\+?[0-9]{7,15}$/.test(to)) {',
        '    twiml.say(\'This number cannot be dialed.\');',
        '    return callback(null, twiml);',
        '  }',
        '  // E.164: 10 digits are NANP; other numbers without + get one.',
        '  if (to.charAt(0) !== \'+\') to = to.length === 10 ? \'+1\' + to : \'+\' + to;',
        '  // Country allow-list (toll-fraud guard). Empty or missing: nothing is allowed.',
        '  var allow = String(context.ALLOWED_PREFIXES || \'\');',
        '  var ok = allow === \'*\';',
        '  var prefixes = allow.split(\',\');',
        '  for (var i = 0; !ok && i < prefixes.length; i++) {',
        '    var p = prefixes[i].trim();',
        '    if (/^\\+[1-9][0-9]{0,5}$/.test(p) && to.indexOf(p) === 0) ok = true;',
        '  }',
        '  if (!ok) {',
        '    console.warn(\'CTC dial blocked: country not allowed (\' + to.slice(0, 4) + \'...)\');',
        '    twiml.say(\'This number is outside the countries your administrator allows.\');',
        '    return callback(null, twiml);',
        '  }',
        '  var attrs = { answerOnBridge: true, record: \'record-from-answer-dual\' };',
        '  var callerId = event.CallerId || context.CALLER_ID_DEFAULT;',
        '  if (callerId) attrs.callerId = callerId;',
        '  var dial = twiml.dial(attrs);',
        '  if (context.NOTICE_ON === \'true\') {',
        '    dial.number({ url: \'https://\' + context.DOMAIN_NAME + \'/notice\' }, to);',
        '  } else {',
        '    dial.number(to);',
        '  }',
        '  return callback(null, twiml);',
        '};',
        ''
    ].join('\n');

    const NOTICE_SOURCE = [
        '// CTC outbound recording notice. Generated by NetSuite Click-to-Call.',
        '// "AI" is spoken as two letters.',
        'exports.handler = function (context, event, callback) {',
        '  var twiml = new Twilio.twiml.VoiceResponse();',
        '  var text = String(context.NOTICE_TEXT || \'\').replace(/\\bAI\\b/g, \'A I\');',
        '  if (text) twiml.say(text);',
        '  return callback(null, twiml);',
        '};',
        ''
    ].join('\n');

    const SOURCES = { dial: DIAL_SOURCE, notice: NOTICE_SOURCE };

    /* ------------------------------------------------------------------ */
    /* Pure helpers                                                       */
    /* ------------------------------------------------------------------ */

    /**
     * Stable 53-bit string hash (cyrb53), as 14 hex characters. Not for
     * security: it only tells whether the code changed since the last build.
     */
    const hashString = (str) => {
        let h1 = 0xdeadbeef;
        let h2 = 0x41c6ce57;
        for (let i = 0; i < str.length; i++) {
            const ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
        return ('00000000000000' + n.toString(16)).slice(-14);
    };

    /** Hash of everything that goes into a build. */
    const codeHash = () => hashString([FN_CODE_VERSION, RUNTIME, DIAL_SOURCE, NOTICE_SOURCE].join('\n--\n'));

    /**
     * Build a multipart/form-data body by hand (N/https has no helper).
     * One string, CRLF line ends. Same layout the spike proved:
     *   fields (in order), then the file part.
     *
     * @param {Array<{name: string, value: string}>} fields
     * @param {{name: string, filename: string, contentType: string, content: string}} file
     * @param {string} [boundary] fixed boundary (tests); default random
     * @returns {{body: string, contentType: string}}
     */
    const buildMultipart = (fields, file, boundary) => {
        const b = boundary || ('----ctcBoundary' + Date.now().toString(16) +
                               Math.floor(Math.random() * 0xffffffff).toString(16));
        let body = '';
        (fields || []).forEach((f) => {
            body += '--' + b + '\r\n' +
                    'Content-Disposition: form-data; name="' + f.name + '"\r\n' +
                    '\r\n' + String(f.value) + '\r\n';
        });
        if (file) {
            body += '--' + b + '\r\n' +
                    'Content-Disposition: form-data; name="' + file.name + '"; filename="' + file.filename + '"\r\n' +
                    'Content-Type: ' + file.contentType + '\r\n' +
                    '\r\n' + file.content + '\r\n';
        }
        body += '--' + b + '--\r\n';
        return { body: body, contentType: 'multipart/form-data; boundary=' + b };
    };

    /** Build request body: FunctionVersions repeated, then Runtime. */
    const buildRequestBody = (versionSids) =>
        versionSids.map((sid) => 'FunctionVersions=' + encodeURIComponent(sid)).join('&') +
        '&Runtime=' + encodeURIComponent(RUNTIME);

    /** E.164 (+digits); a 10-digit number without + is North American. '' when no digits. */
    const toE164 = (raw) => {
        const s = raw == null ? '' : String(raw).trim();
        const digits = s.replace(/[^0-9]/g, '');
        if (!digits) return '';
        if (s.charAt(0) !== '+' && digits.length === 10) return '+1' + digits;
        return '+' + digits;
    };

    /** https://{domain}/dial, or '' when the domain is not a twil.io domain. */
    const functionUrl = (domain) =>
        (typeof domain === 'string' && DOMAIN_RE.test(domain) ? 'https://' + domain + '/dial' : '');

    /** A publish completed at least once and its domain is stored. */
    const isPublished = (cfg) => !!(cfg && cfg.outPublishedAt && functionUrl(cfg.outFnDomain));

    /** Published with Function code from an older SuiteApp version. */
    const needsRepublish = (cfg) => isPublished(cfg) && String(cfg.outFnCodeVersion || '') !== FN_CODE_VERSION;

    /**
     * The notice for a new outbound call, from config only (no Twilio
     * call). It plays when the Function is published and the last publish
     * put a notice live (outPublishedNoticeVersion > 0). A saved but not
     * yet published change does not count: Twilio still runs the old one.
     *
     * @returns {{played: boolean, version: number}}
     */
    const noticeForCall = (cfg) => {
        const v = cfg ? Number(cfg.outPublishedNoticeVersion) || 0 : 0;
        const played = isPublished(cfg) && v > 0;
        return { played: played, version: played ? v : 0 };
    };

    /** Notice version a deployment with these settings makes live (0 = no notice). */
    const livePublishedNoticeVersion = (cfg) =>
        (cfg && cfg.outNoticeOn === true ? (Number(cfg.outNoticeVersion) || 1) : 0);

    /* ---- Country allow-list (toll-fraud guard, review H5) ---- */

    // Two-digit ITU country codes. Codes 1 and 7 have one digit; every
    // other code has three. Country codes are prefix-free.
    const TWO_DIGIT_CC = ['20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45',
        '46', '47', '48', '49', '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63', '64',
        '65', '66', '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98'];

    /** '+44' for '+442071234567'; '' when there is no number. */
    const countryCodeOf = (e164) => {
        const d = String(e164 || '').replace(/[^0-9]/g, '');
        if (!d) return '';
        if (d.charAt(0) === '1' || d.charAt(0) === '7') return '+' + d.charAt(0);
        if (TWO_DIGIT_CC.indexOf(d.slice(0, 2)) !== -1) return '+' + d.slice(0, 2);
        return d.length >= 3 ? '+' + d.slice(0, 3) : '';
    };

    /**
     * Parse the config allow-list: prefixes split by commas, semicolons or
     * spaces, each '+' (optional) and 1-6 digits, not starting with 0
     * ('+1', '+44', '+1416'), or '*' (every country). Bad entries are
     * dropped. Returns unique '+digits' entries, or ['*'].
     * @param {*} raw
     * @returns {string[]}
     */
    const parseAllowedPrefixes = (raw) => {
        const out = [];
        const tokens = String(raw == null ? '' : raw).split(/[\s,;]+/);
        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            if (t === '*') return ['*'];
            const m = /^\+?([1-9][0-9]{0,5})$/.exec(t);
            if (m && out.indexOf('+' + m[1]) === -1) out.push('+' + m[1]);
        }
        return out;
    };

    /**
     * The country prefixes reps may call through the Function.
     * source 'config': custrecord_ctc_out_allowed_cc; 'caller-id': the
     * default caller ID's country code (config blank or no valid entry);
     * 'fallback': '+1' when there is no caller ID either.
     * @returns {{list: string[], text: string, source: string}}
     */
    const allowedPrefixes = (cfg) => {
        let list = parseAllowedPrefixes(cfg && cfg.outAllowedCc);
        let source = 'config';
        if (!list.length) {
            const cc = countryCodeOf(toE164(cfg && cfg.phoneNumber));
            list = [cc || '+1'];
            source = cc ? 'caller-id' : 'fallback';
        }
        return { list: list, text: list.join(','), source: source };
    };

    /** Saved allow-list differs from the one the last publish put live. */
    const allowListPending = (cfg) =>
        isPublished(cfg) && String(cfg.outPublishedAllowedCc || '') !== allowedPrefixes(cfg).text;

    /** Variables the Function reads (all strings). */
    const desiredVariables = (cfg) => {
        const vars = {
            NOTICE_ON: cfg.outNoticeOn === true ? 'true' : 'false',
            NOTICE_TEXT: cfg.outNoticeText || config.DEFAULT_OUTBOUND_NOTICE,
            NOTICE_VER: String(cfg.outNoticeVersion || 1),
            ALLOWED_PREFIXES: allowedPrefixes(cfg).text
        };
        const callerId = toE164(cfg.phoneNumber);
        if (callerId) vars.CALLER_ID_DEFAULT = callerId;
        return vars;
    };

    const errText = (e) => (e && e.message ? e.message : String(e));

    /* ------------------------------------------------------------------ */
    /* Twilio calls                                                       */
    /* ------------------------------------------------------------------ */

    const listUrl = (path) => SERVERLESS_SERVICES + path + (path.indexOf('?') >= 0 ? '&' : '?') + 'PageSize=100';

    /** 401 / 403 on a Serverless call means the key has no Serverless access. */
    const serverlessError = (res, what) => {
        if (res.status === 401 || res.status === 403) return SERVERLESS_ACCESS_ERROR;
        return what + ': ' + (res.errorMessage || ('HTTP ' + res.status));
    };

    /**
     * Find-or-create one Serverless object.
     * @returns {{ok: boolean, item?: Object, created?: boolean, message?: string}}
     */
    const findOrCreate = (auth, listPath, listKey, match, createParams, sidRe, what) => {
        const list = twilio.httpGetJson(listUrl(listPath), auth);
        if (!list.ok) return { ok: false, message: serverlessError(list, 'Could not list the ' + what) };
        const items = (list.body && list.body[listKey]) || [];
        const found = items.filter(match)[0];
        if (found && sidRe.test(String(found.sid || ''))) return { ok: true, item: found, created: false };
        const made = twilio.httpPostForm(SERVERLESS_SERVICES + listPath, auth, createParams);
        if (!made.ok) return { ok: false, message: serverlessError(made, 'Could not create the ' + what) };
        if (!made.body || !sidRe.test(String(made.body.sid || ''))) {
            return { ok: false, message: 'Twilio did not return a valid SID for the ' + what };
        }
        return { ok: true, item: made.body, created: true };
    };

    /** GET .../Builds/{ZB}/Status → 'building' | 'completed' | 'failed' | '' (unknown). */
    const buildStatus = (auth, zs, zb) => {
        const res = twilio.httpGetJson(SERVERLESS_SERVICES + '/' + zs + '/Builds/' + zb + '/Status', auth);
        if (!res.ok) return { ok: false, status: '', res: res };
        return { ok: true, status: String((res.body && res.body.status) || '') };
    };

    const saveConfig = (cfg, values) => {
        record.submitFields({ type: 'customrecord_ctc_config', id: cfg.id, values: values });
    };

    /* ------------------------------------------------------------------ */
    /* Publish                                                            */
    /* ------------------------------------------------------------------ */

    const stepRecorder = () => {
        const steps = [];
        const add = (key, status, detail) => {
            steps.push({ key: key, label: STEP_LABELS[key], status: status, detail: detail || '' });
        };
        const fail = (key, detail) => {
            add(key, 'failed', detail);
            log.error({ title: 'CTC Outbound — ' + key + ' failed', details: detail });
            return { ok: false, steps: steps, message: detail };
        };
        return { steps: steps, add: add, fail: fail };
    };

    /**
     * Poll the build up to `maxPolls` times (fewer when governance is low).
     * @returns {string} last known status
     */
    const pollBuild = (auth, zs, zb, initialStatus, maxPolls) => {
        let status = initialStatus;
        for (let i = 0; i < maxPolls && status !== 'completed' && status !== 'failed'; i++) {
            if (runtime.getCurrentScript().getRemainingUsage() < MIN_USAGE_TO_POLL) break;
            const res = buildStatus(auth, zs, zb);
            if (res.ok) status = res.status;
        }
        return status;
    };

    /**
     * Variables, deployment, TwiML App Voice URL, save. Runs once the build
     * is completed. ctx: { auth, zs, ze, domain, zb }.
     */
    const finishPublish = (cfg, ctx, rec) => {
        const base = SERVERLESS_SERVICES + '/' + ctx.zs + '/Environments/' + ctx.ze;

        // variables
        const existing = twilio.httpGetJson(base + '/Variables?PageSize=100', ctx.auth);
        if (!existing.ok) return rec.fail('variables', serverlessError(existing, 'Could not read the variables'));
        const byKey = {};
        ((existing.body && existing.body.variables) || []).forEach((v) => { if (v && v.key) byKey[v.key] = v; });
        const desired = desiredVariables(cfg);
        let changed = 0;
        const keys = Object.keys(desired);
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            const cur = byKey[k];
            if (cur && String(cur.value) === desired[k]) continue;
            const res = cur && SID.variable.test(String(cur.sid || ''))
                ? twilio.httpPostForm(base + '/Variables/' + cur.sid, ctx.auth, { Value: desired[k] })
                : twilio.httpPostForm(base + '/Variables', ctx.auth, { Key: k, Value: desired[k] });
            if (!res.ok) return rec.fail('variables', serverlessError(res, 'Could not save ' + k));
            changed++;
        }
        rec.add('variables', 'ok', changed ? changed + ' updated' : 'Unchanged');

        // deployment
        const dep = twilio.httpPostForm(base + '/Deployments', ctx.auth, { BuildSid: ctx.zb });
        if (!dep.ok) return rec.fail('deployment', serverlessError(dep, 'Could not deploy the build'));
        if (!dep.body || !SID.deployment.test(String(dep.body.sid || ''))) {
            return rec.fail('deployment', 'Twilio did not return a valid deployment SID');
        }
        // The environment now serves this build with these variables. On a
        // republish the TwiML App already points here, so the new notice is
        // live NOW: record its version before any later step can fail, so
        // the consent log (noticeForCall → logCall) matches what Twilio plays.
        // A first publish is not live until published_at is saved below
        // (noticeForCall needs it), so this early write is safe there too.
        try {
            saveConfig(cfg, {
                custrecord_ctc_out_fn_build: ctx.zb,
                custrecord_ctc_out_fn_pending_build: '',
                custrecord_ctc_out_fn_code_ver: FN_CODE_VERSION,
                custrecord_ctc_out_fn_hash: codeHash(),
                custrecord_ctc_out_pub_notice_ver: livePublishedNoticeVersion(cfg),
                custrecord_ctc_out_pub_allowed_cc: allowedPrefixes(cfg).text
            });
        } catch (e) {
            return rec.fail('deployment', 'Deployed in Twilio, but NetSuite could not record the ' +
                            'live notice version: ' + errText(e) + '. Publish again.');
        }
        rec.add('deployment', 'ok', 'Live at ' + ctx.domain);

        // TwiML App Voice URL (only after a completed deployment)
        const fnUrl = functionUrl(ctx.domain);
        const app = twilio.getApplication(cfg, cfg.twimlAppSid);
        if (!app.ok) return rec.fail('voiceUrl', 'Could not read the TwiML App: ' + (app.errorMessage || app.status));
        const current = app.application.voiceUrl || '';
        let prevSaved = '';
        if (current === fnUrl) {
            rec.add('voiceUrl', 'skipped', 'Already points at the Function');
        } else {
            if (!cfg.outPrevVoiceUrl && current && !OUR_DIAL_URL_RE.test(current)) {
                // Keep the old Voice URL before it is changed, so unpublish can restore it.
                try { saveConfig(cfg, { custrecord_ctc_out_prev_voiceurl: current }); prevSaved = current; }
                catch (e) {
                    return rec.fail('voiceUrl', 'NetSuite could not store the current Voice URL, ' +
                                    'so it was not changed: ' + errText(e));
                }
            }
            const set = twilio.setApplicationVoiceUrl(cfg, cfg.twimlAppSid, fnUrl);
            if (!set.ok) return rec.fail('voiceUrl', 'Could not update the TwiML App: ' + (set.errorMessage || set.status));
            rec.add('voiceUrl', 'ok', prevSaved ? 'Updated; the earlier Voice URL is kept for unpublish' : 'Updated');
        }

        // save
        const publishedAt = new Date().toISOString();
        try {
            saveConfig(cfg, {
                custrecord_ctc_out_fn_service: ctx.zs,
                custrecord_ctc_out_fn_env: ctx.ze,
                custrecord_ctc_out_fn_build: ctx.zb,
                custrecord_ctc_out_fn_pending_build: '',
                custrecord_ctc_out_fn_domain: ctx.domain,
                custrecord_ctc_out_fn_code_ver: FN_CODE_VERSION,
                custrecord_ctc_out_fn_hash: codeHash(),
                custrecord_ctc_out_published_at: publishedAt,
                custrecord_ctc_out_pub_notice_ver: livePublishedNoticeVersion(cfg),
                custrecord_ctc_out_pub_allowed_cc: allowedPrefixes(cfg).text
            });
        } catch (e) {
            return rec.fail('save', 'The Function is live, but NetSuite could not save the publish details: ' +
                            errText(e) + '. Publish again.');
        }
        rec.add('save', 'ok', '');

        log.audit({
            title: 'CTC Outbound — published',
            details: 'service=' + twilio.maskSid(ctx.zs) + ' build=' + twilio.maskSid(ctx.zb) +
                     ' noticeOn=' + (cfg.outNoticeOn === true) + ' noticeVer=' + cfg.outNoticeVersion +
                     ' code=' + FN_CODE_VERSION
        });
        return { ok: true, steps: rec.steps, functionUrl: fnUrl, publishedAt: publishedAt };
    };

    /** Build is not finished yet: keep it for resume and say so. */
    const pendingResult = (rec) => {
        const detail = 'Twilio is still building the Function. Check again in a few seconds.';
        rec.add('build', 'pending', detail);
        return { ok: false, pending: true, steps: rec.steps, message: detail };
    };

    /**
     * Publish (or republish) the outbound Function and point the TwiML App
     * at it. Never throws for Twilio errors; see the module comment for the
     * sequence and governance.
     *
     * @param {Object} cfg config from ctc_config.loadConfig()
     * @param {{resume?: boolean, maxPolls?: number}} [opts]
     *   resume: finish the stored pending build (if any) instead of
     *   starting again. maxPolls: build status polls in this request.
     * @returns {{ok: boolean, pending?: boolean, message?: string,
     *            steps: Array<{key: string, label: string,
     *                          status: 'ok'|'skipped'|'failed'|'pending', detail: string}>,
     *            functionUrl?: string, publishedAt?: string}}
     */
    const publishOutbound = (cfg, opts) => {
        const rec = stepRecorder();
        const maxPolls = opts && typeof opts.maxPolls === 'number' ? opts.maxPolls : MAX_BUILD_POLLS;

        if (!cfg || !cfg.id) return rec.fail('probe', 'Configuration not found');
        if (typeof cfg.twimlAppSid !== 'string' || !SID.app.test(cfg.twimlAppSid)) {
            return rec.fail('probe', 'Choose a TwiML App in the Voice settings first.');
        }
        let auth;
        try { auth = twilio.buildSecureAuthHeader(cfg); }
        catch (e) { return rec.fail('probe', 'Connect Twilio first: ' + errText(e)); }

        // Resume a build that an earlier request left running.
        const canResume = !!(opts && opts.resume === true) &&
            SID.build.test(cfg.outFnPendingBuild || '') &&
            SID.service.test(cfg.outFnService || '') &&
            SID.environment.test(cfg.outFnEnv || '') &&
            DOMAIN_RE.test(cfg.outFnDomain || '');
        if (canResume) {
            ['probe', 'service', 'environment', 'functions', 'upload'].forEach((k) => {
                rec.add(k, 'skipped', 'Done in an earlier request');
            });
            const ctx = { auth: auth, zs: cfg.outFnService, ze: cfg.outFnEnv,
                          domain: cfg.outFnDomain, zb: cfg.outFnPendingBuild };
            const status = pollBuild(auth, ctx.zs, ctx.zb, '', Math.max(1, maxPolls));
            if (status === 'failed') {
                try { saveConfig(cfg, { custrecord_ctc_out_fn_pending_build: '' }); }
                catch (e) { log.error({ title: 'CTC Outbound — clear pending build failed', details: errText(e) }); }
                return rec.fail('build', 'Twilio could not build the Function. Publish again.');
            }
            if (status !== 'completed') return pendingResult(rec);
            rec.add('build', 'ok', 'Completed');
            return finishPublish(cfg, ctx, rec);
        }

        // probe (also lists the services)
        const services = twilio.httpGetJson(listUrl(''), auth);
        if (!services.ok) {
            return rec.fail('probe', services.status === 401 || services.status === 403
                ? SERVERLESS_ACCESS_ERROR
                : 'Twilio did not answer: ' + (services.errorMessage || services.status));
        }
        rec.add('probe', 'ok', '');

        // service
        let svc = ((services.body && services.body.services) || [])
            .filter((s) => s && s.unique_name === SERVICE_UNIQUE_NAME)[0];
        let svcCreated = false;
        if (!svc || !SID.service.test(String(svc.sid || ''))) {
            const made = twilio.httpPostForm(SERVERLESS_SERVICES, auth, {
                UniqueName: SERVICE_UNIQUE_NAME,
                FriendlyName: SERVICE_FRIENDLY_NAME,
                IncludeCredentials: 'false'
            });
            if (!made.ok) return rec.fail('service', serverlessError(made, 'Could not create the service'));
            if (!made.body || !SID.service.test(String(made.body.sid || ''))) {
                return rec.fail('service', 'Twilio did not return a valid service SID');
            }
            svc = made.body;
            svcCreated = true;
        }
        const zs = svc.sid;
        rec.add('service', 'ok', (svcCreated ? 'Created ' : 'Found ') + SERVICE_UNIQUE_NAME);

        // environment
        const env = findOrCreate(auth, '/' + zs + '/Environments', 'environments',
            (e) => e && e.unique_name === ENV_UNIQUE_NAME,
            { UniqueName: ENV_UNIQUE_NAME, DomainSuffix: ENV_DOMAIN_SUFFIX },
            SID.environment, 'environment');
        if (!env.ok) return rec.fail('environment', env.message || 'Environment failed');
        const ze = env.item.sid;
        const domain = String(env.item.domain_name || '');
        if (!DOMAIN_RE.test(domain)) return rec.fail('environment', 'Twilio did not return a valid domain');
        rec.add('environment', 'ok', (env.created ? 'Created ' : 'Found ') + domain);

        // functions
        const fnList = twilio.httpGetJson(listUrl('/' + zs + '/Functions'), auth);
        if (!fnList.ok) return rec.fail('functions', serverlessError(fnList, 'Could not list the functions'));
        const fnItems = (fnList.body && fnList.body.functions) || [];
        const fnSids = {};
        let fnCreated = 0;
        for (let i = 0; i < FUNCTIONS.length; i++) {
            const def = FUNCTIONS[i];
            const found = fnItems.filter((f) => f && f.friendly_name === def.friendlyName)[0];
            if (found && SID.fn.test(String(found.sid || ''))) { fnSids[def.key] = found.sid; continue; }
            const made = twilio.httpPostForm(SERVERLESS_SERVICES + '/' + zs + '/Functions', auth,
                                             { FriendlyName: def.friendlyName });
            if (!made.ok) return rec.fail('functions', serverlessError(made, 'Could not create ' + def.friendlyName));
            if (!made.body || !SID.fn.test(String(made.body.sid || ''))) {
                return rec.fail('functions', 'Twilio did not return a valid function SID');
            }
            fnSids[def.key] = made.body.sid;
            fnCreated++;
        }
        rec.add('functions', 'ok', fnCreated ? fnCreated + ' created' : 'Found');

        const ctx = { auth: auth, zs: zs, ze: ze, domain: domain, zb: '' };

        // Code unchanged: reuse the live build's function versions (no
        // upload), but still make a NEW build. Twilio refuses to deploy the
        // build an environment already serves ("Environment already has
        // requested deployment", seen live 2026-11-03), and new variable
        // values (the notice text) only reach callers with a new deployment.
        let versions = [];
        if (zs === cfg.outFnService && SID.build.test(cfg.outFnBuild || '') && cfg.outFnHash === codeHash()) {
            const cur = twilio.httpGetJson(SERVERLESS_SERVICES + '/' + zs + '/Builds/' + cfg.outFnBuild, auth);
            const fv = (cur.ok && cur.body && cur.body.function_versions) || [];
            const sids = fv.map((v) => String((v && v.sid) || '')).filter((sid) => SID.version.test(sid));
            if (sids.length === FUNCTIONS.length) {
                versions = sids;
                rec.add('upload', 'skipped', 'Code unchanged');
            }
        }
        const reused = versions.length > 0;

        // upload one version per function
        for (let i = 0; !reused && i < FUNCTIONS.length; i++) {
            const def = FUNCTIONS[i];
            const mp = buildMultipart(
                [{ name: 'Path', value: def.path }, { name: 'Visibility', value: 'protected' }],
                { name: 'Content', filename: def.path.slice(1) + '.js',
                  contentType: 'application/javascript', content: SOURCES[def.key] });
            const up = twilio.httpPostBody(UPLOAD_SERVICES + '/' + zs + '/Functions/' + fnSids[def.key] + '/Versions',
                                           auth, mp.body, mp.contentType);
            if (!up.ok) return rec.fail('upload', serverlessError(up, 'Could not upload ' + def.path));
            if (!up.body || !SID.version.test(String(up.body.sid || ''))) {
                return rec.fail('upload', 'Twilio did not return a valid version SID');
            }
            versions.push(up.body.sid);
        }
        if (!reused) rec.add('upload', 'ok', versions.length + ' files');

        // build
        const built = twilio.httpPostBody(SERVERLESS_SERVICES + '/' + zs + '/Builds', auth,
                                          buildRequestBody(versions), FORM_TYPE);
        if (!built.ok) return rec.fail('build', serverlessError(built, 'Could not start the build'));
        if (!built.body || !SID.build.test(String(built.body.sid || ''))) {
            return rec.fail('build', 'Twilio did not return a valid build SID');
        }
        ctx.zb = built.body.sid;
        try {
            // Kept for resume. Nothing points at this build yet.
            saveConfig(cfg, {
                custrecord_ctc_out_fn_service: zs,
                custrecord_ctc_out_fn_env: ze,
                custrecord_ctc_out_fn_domain: domain,
                custrecord_ctc_out_fn_pending_build: ctx.zb
            });
        } catch (e) {
            log.error({ title: 'CTC Outbound — store pending build failed', details: errText(e) });
        }
        const status = pollBuild(auth, zs, ctx.zb, String(built.body.status || ''), maxPolls);
        if (status === 'failed') {
            try { saveConfig(cfg, { custrecord_ctc_out_fn_pending_build: '' }); }
            catch (e) { log.error({ title: 'CTC Outbound — clear pending build failed', details: errText(e) }); }
            return rec.fail('build', 'Twilio could not build the Function. Publish again.');
        }
        if (status !== 'completed') return pendingResult(rec);
        rec.add('build', 'ok', 'Completed');
        return finishPublish(cfg, ctx, rec);
    };

    /* ------------------------------------------------------------------ */
    /* Unpublish                                                          */
    /* ------------------------------------------------------------------ */

    /**
     * Restore the TwiML App's earlier Voice URL, delete the ctc-outbound
     * service, and clear the stored SIDs / domain / build / hash. The
     * notice text, on/off and version stay.
     *
     * Steps: voiceUrl, service, save. When the app still points at the
     * Function and no earlier Voice URL is stored, it stops before the
     * delete (calls would fail otherwise).
     *
     * @returns {{ok: boolean, message?: string, steps: Array<Object>}}
     */
    const unpublishOutbound = (cfg) => {
        const r = stepRecorder();
        if (!cfg || !cfg.id) return r.fail('voiceUrl', 'Configuration not found');
        let auth;
        try { auth = twilio.buildSecureAuthHeader(cfg); }
        catch (e) { return r.fail('voiceUrl', 'Connect Twilio first: ' + errText(e)); }

        const fnUrl = functionUrl(cfg.outFnDomain);
        const prev = cfg.outPrevVoiceUrl || '';

        // voiceUrl
        if (typeof cfg.twimlAppSid === 'string' && SID.app.test(cfg.twimlAppSid)) {
            const app = twilio.getApplication(cfg, cfg.twimlAppSid);
            if (!app.ok && app.status === 404) {
                r.add('voiceUrl', 'skipped', 'The TwiML App was not found');
            } else if (!app.ok) {
                return r.fail('voiceUrl', 'Could not read the TwiML App: ' + (app.errorMessage || app.status));
            } else {
                const current = app.application.voiceUrl || '';
                const pointsAtUs = (fnUrl && current === fnUrl) || OUR_DIAL_URL_RE.test(current);
                if (!pointsAtUs) {
                    r.add('voiceUrl', 'skipped', 'The TwiML App does not point at the Function');
                } else if (!prev) {
                    return r.fail('voiceUrl', 'No earlier Voice URL is stored. Set the TwiML App ' +
                                  'Voice URL in the Twilio Console, then remove again.');
                } else {
                    const set = twilio.setApplicationVoiceUrl(cfg, cfg.twimlAppSid, prev);
                    if (!set.ok) {
                        return r.fail('voiceUrl', 'Could not restore the Voice URL: ' +
                                      (set.errorMessage || set.status));
                    }
                    r.add('voiceUrl', 'ok', 'Restored the earlier Voice URL');
                    // Calls no longer reach the Function: no notice from now on,
                    // even if a later step fails (consent log, noticeForCall).
                    try { saveConfig(cfg, { custrecord_ctc_out_pub_notice_ver: 0 }); }
                    catch (e) {
                        log.error({ title: 'CTC Outbound — clear live notice version failed',
                                    details: errText(e) });
                    }
                }
            }
        } else {
            r.add('voiceUrl', 'skipped', 'No TwiML App is set');
        }

        // service
        let zs = SID.service.test(cfg.outFnService || '') ? cfg.outFnService : '';
        if (!zs) {
            const list = twilio.httpGetJson(listUrl(''), auth);
            if (!list.ok) return r.fail('service', serverlessError(list, 'Could not list the services'));
            const found = ((list.body && list.body.services) || [])
                .filter((s) => s && s.unique_name === SERVICE_UNIQUE_NAME)[0];
            zs = found && SID.service.test(String(found.sid || '')) ? found.sid : '';
        }
        if (!zs) {
            r.add('service', 'skipped', 'No Function service to delete');
        } else {
            const del = twilio.httpDelete(SERVERLESS_SERVICES + '/' + zs, auth);
            if (!del.ok && del.status !== 404) {
                return r.fail('service', serverlessError(del, 'Could not delete the service'));
            }
            r.add('service', 'ok', del.ok ? 'Deleted ' + SERVICE_UNIQUE_NAME : 'Already deleted');
        }

        // save
        try {
            saveConfig(cfg, {
                custrecord_ctc_out_fn_service: '',
                custrecord_ctc_out_fn_env: '',
                custrecord_ctc_out_fn_build: '',
                custrecord_ctc_out_fn_pending_build: '',
                custrecord_ctc_out_fn_domain: '',
                custrecord_ctc_out_fn_code_ver: '',
                custrecord_ctc_out_fn_hash: '',
                custrecord_ctc_out_prev_voiceurl: '',
                custrecord_ctc_out_published_at: '',
                custrecord_ctc_out_pub_notice_ver: 0,
                custrecord_ctc_out_pub_allowed_cc: ''
            });
        } catch (e) {
            return r.fail('save', 'Removed in Twilio, but NetSuite could not clear the stored details: ' + errText(e));
        }
        r.add('save', 'ok', '');
        log.audit({ title: 'CTC Outbound — unpublished', details: 'service=' + twilio.maskSid(zs) });
        return { ok: true, steps: r.steps };
    };

    /* ------------------------------------------------------------------ */
    /* Status (read-only)                                                 */
    /* ------------------------------------------------------------------ */

    /**
     * Read-only status. One Twilio call (GET the TwiML App) when an app
     * SID is set, plus one (GET the service environment) when published.
     *
     * @returns {{published: boolean, pending: boolean, functionUrl: string,
     *            appVoiceUrl: string|null, voiceUrlMatches: boolean|null,
     *            functionExists: boolean|null, functionMessage?: string,
     *            needsRepublish: boolean,
     *            drift: {voiceUrl: 'pass'|'fail'|'unknown',
     *                    functionCode: 'pass'|'fail'|'unknown',
     *                    functionService: 'pass'|'fail'|'unknown'}}}
     *   voiceUrlMatches is null when the app cannot be read.
     *   drift.voiceUrl: 'unknown' until published or when the app cannot be read.
     *   drift.functionCode: a NetSuite comparison (stored code version).
     *   drift.functionService: the service/environment still exist in
     *   Twilio ('fail' + functionMessage when deleted; 'unknown' when not
     *   published or Twilio did not answer).
     */
    const outboundStatus = (cfg) => {
        const published = isPublished(cfg);
        const fnUrl = functionUrl(cfg && cfg.outFnDomain);
        let appVoiceUrl = null;
        let voiceUrlMatches = null;
        if (cfg && typeof cfg.twimlAppSid === 'string' && SID.app.test(cfg.twimlAppSid)) {
            try {
                const app = twilio.getApplication(cfg, cfg.twimlAppSid);
                if (app && app.ok) {
                    appVoiceUrl = app.application.voiceUrl || '';
                    voiceUrlMatches = !!fnUrl && appVoiceUrl === fnUrl;
                }
            } catch (e) {
                log.error({ title: 'CTC Outbound — status read failed', details: errText(e) });
            }
        }
        const fn = published ? functionExists(cfg) : { exists: null, message: '' };
        const republish = needsRepublish(cfg);
        return {
            published: published,
            pending: !!(cfg && SID.build.test(cfg.outFnPendingBuild || '')),
            functionUrl: fnUrl,
            appVoiceUrl: appVoiceUrl,
            voiceUrlMatches: voiceUrlMatches,
            functionExists: fn.exists,
            // undefined (left out of JSON) unless the Function is missing.
            functionMessage: fn.message || undefined,
            needsRepublish: republish,
            drift: {
                voiceUrl: !published || voiceUrlMatches === null ? 'unknown' : (voiceUrlMatches ? 'pass' : 'fail'),
                functionCode: !published ? 'unknown' : (republish ? 'fail' : 'pass'),
                functionService: fn.exists === null ? 'unknown' : (fn.exists ? 'pass' : 'fail')
            }
        };
    };

    const FUNCTION_MISSING_MESSAGE = 'The outbound Function is missing in Twilio, so outbound ' +
        'calls fail. Publish again.';

    /**
     * Does the published service + environment still exist in Twilio?
     * One GET (10 units). 404 → { exists:false, message }; any other
     * failure → { exists:null } (unknown, not a false alarm).
     */
    const functionExists = (cfg) => {
        const zs = cfg && cfg.outFnService;
        const ze = cfg && cfg.outFnEnv;
        if (!SID.service.test(zs || '') || !SID.environment.test(ze || '')) {
            return { exists: false, message: FUNCTION_MISSING_MESSAGE };
        }
        try {
            const auth = twilio.buildSecureAuthHeader(cfg);
            const res = twilio.httpGetJson(SERVERLESS_SERVICES + '/' + zs + '/Environments/' + ze, auth);
            if (res && res.ok) return { exists: true, message: '' };
            if (res && res.status === 404) return { exists: false, message: FUNCTION_MISSING_MESSAGE };
            return { exists: null, message: '' };
        } catch (e) {
            log.error({ title: 'CTC Outbound — function check failed', details: errText(e) });
            return { exists: null, message: '' };
        }
    };

    return {
        FN_CODE_VERSION,
        RUNTIME,
        SERVICE_UNIQUE_NAME,
        MAX_BUILD_POLLS,
        SERVERLESS_ACCESS_ERROR,
        DIAL_SOURCE,
        NOTICE_SOURCE,
        STEP_LABELS,
        hashString,
        codeHash,
        buildMultipart,
        buildRequestBody,
        functionUrl,
        isPublished,
        needsRepublish,
        noticeForCall,
        countryCodeOf,
        parseAllowedPrefixes,
        allowedPrefixes,
        allowListPending,
        desiredVariables,
        publishOutbound,
        unpublishOutbound,
        outboundStatus
    };
});
