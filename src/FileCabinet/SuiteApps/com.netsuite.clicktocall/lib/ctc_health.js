// @ts-check
/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Health read model (Phase 1, 2026-11-03): one call reads every signal the
 * Admin Console needs and gives each a severity and at most one action.
 * Spec: docs/specs/state-catalog/README.md §2 (Signals). Served by the
 * Setup Wizard API action wizardLoadHealth (ctc_sl_wizard_api.js).
 *
 *   loadHealth({ loadPresence }) →
 *     { ok: true, checkedAt, signals: { <key>: Signal }, attention: [Signal] }
 *     { ok: false, error: 'config_not_found' }   (no config record)
 *   Signal = { key, title, value, severity, detail, action? }
 *     severity  'ok' | 'warn' | 'problem' | 'unknown'
 *     action    { label, route }  route = an Admin Console page hash:
 *               '#/inbound', '#/phones', '#/outbound', '#/transcripts',
 *               '#/health' (SPA app/routes.ts). Every warn / problem
 *               signal has one.
 *   attention = the 'problem' signals, then the 'warn' signals, in signal
 *   order. 'unknown' (could not check) is not in attention.
 *
 * Two layers:
 *   build*  pure: inputs → Signal. All severity rules live here.
 *   read*   one data read each (SuiteQL, N/search, N/llm). They throw on
 *           failure; loadHealth runs every signal inside guard(), so one
 *           failed read gives that signal 'unknown' (short detail) and the
 *           other signals still load. The action never fails as a whole
 *           (except when there is no config record).
 *
 * Governance (Suitelet limit 1,000 units). Shared reads, once per call:
 *   loadOutboundConfig: config search 10 + record.load 2       12
 *   readRoutingState:   record.load                              2
 *   loadRoutes:         assignment search                       10
 * Per signal:
 *   transcriptBacklog   one SuiteQL query                       10
 *   pollerRuns          one scheduledscriptinstance search      10  (watermark: config, 0)
 *   aiQuota             N/llm remaining usage                    0
 *   repPhones           presence loader: 2 searches             20
 *   numberRouting       Twilio GET IncomingPhoneNumbers         10
 *   routingChanged      shared reads + hashing                   0
 *   outboundNotice      Twilio GET TwiML App + GET environment  20  (environment only when published)
 *   intelligence        Twilio GET Intelligence Services        10
 *   fallbackOwner       config                                   0
 * Total about 104 units; never more than 4 Twilio GETs (40 units).
 *
 * Time: every "age" is computed from ISO UTC values or in the database
 * (pollerRuns formula), so the server and user time zones do not matter.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/query', 'N/search', 'N/log',
        './ctc_config', './ctc_twilio_admin', './ctc_inbound_routing',
        './ctc_outbound_function', './ctc_llm_analysis'],
       (query, search, log, config, twilio, routing, outbound, llmAnalysis) => {

    /* ------------------------------------------------------------------ */
    /* Constants                                                          */
    /* ------------------------------------------------------------------ */

    const SIGNAL_KEYS = ['transcriptBacklog', 'pollerRuns', 'aiQuota', 'repPhones',
        'numberRouting', 'routingChanged', 'outboundNotice', 'intelligence', 'fallbackOwner'];

    const TITLES = {
        transcriptBacklog: 'Transcripts',
        pollerRuns: 'Transcript and call sync jobs',
        aiQuota: 'AI usage left',
        repPhones: 'Rep phones',
        numberRouting: 'Phone numbers',
        routingChanged: 'Inbound routing',
        outboundNotice: 'Outbound recording notice',
        intelligence: 'Intelligence service',
        fallbackOwner: 'Fallback call owner'
    };

    /** Admin Console pages (SPA setup_wizard/app/routes.ts SECTIONS). */
    const ROUTES = {
        inbound: '#/inbound',
        phones: '#/phones',
        outbound: '#/outbound',
        transcripts: '#/transcripts',
        health: '#/health'
    };

    const MINUTE_MS = 60 * 1000;
    const HOUR_MS = 60 * MINUTE_MS;
    /** Backlog counts cover calls that started in the last 7 days. */
    const BACKLOG_WINDOW_MS = 7 * 24 * HOUR_MS;
    /**
     * An open call (processed F) older than this is stuck: the longest
     * bounded wait is 25 h (lib/ctc_transcript_utils transientWaitExpired)
     * plus about 1 h of poller runs.
     */
    const STUCK_AFTER_MS = 26 * HOUR_MS;

    const POLL_SCRIPT_ID = 'customscript_ctc_ss_poll';
    const POLL_DEPLOYMENTS = {
        transcripts: 'customdeploy_ctc_ss_poll',
        reconcile: 'customdeploy_ctc_ss_poll_recon'
    };
    /** Rows of recent runs read (both deployments together). */
    const POLLER_ROWS = 30;
    /** No run for longer than this: warn (normal gap 15 min). */
    const POLLER_STALE_MINUTES = 45;
    /**
     * No run for longer than this: problem. The schedule has one overnight
     * gap in the account time zone (local midnight to the first of the
     * 00/06/12/18 UTC starts), at most 6 h, so a shorter silence can be normal.
     */
    const POLLER_GAP_MINUTES = 390;
    /** Reconcile watermark age: warn above the overnight gap, problem above 24 h. */
    const WATERMARK_WARN_MINUTES = POLLER_GAP_MINUTES;
    const WATERMARK_PROBLEM_MINUTES = 24 * 60;

    /** AI usage left: warn below 50, problem below the analysis reserve (10). */
    const AI_WARN_BELOW = 50;
    const AI_PROBLEM_BELOW = (llmAnalysis && llmAnalysis.QUOTA_RESERVE_THRESHOLD) || 10;

    const SEVERITY_RANK = { problem: 0, warn: 1, unknown: 2, ok: 3 };

    /* ------------------------------------------------------------------ */
    /* Helpers                                                            */
    /* ------------------------------------------------------------------ */

    const errText = (e) => (e && e.message ? e.message : String(e));
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
    const num = (v) => {
        const n = Number(v);
        return isFinite(n) ? n : 0;
    };

    /**
     * @param {string} key
     * @param {*} value
     * @param {string} severity
     * @param {string} detail
     * @param {{label: string, route: string}} [action]
     */
    const signal = (key, value, severity, detail, action) => {
        const s = { key: key, title: TITLES[key] || key, value: value, severity: severity, detail: detail || '' };
        if (action) s.action = action;
        return s;
    };

    const republishAction = () => ({ label: 'Publish again', route: ROUTES.inbound });
    const transcriptsAction = () => ({ label: 'See Transcripts & AI', route: ROUTES.transcripts });

    /** Pure. The non-ok, non-unknown signals: problem first, then warn. */
    const buildAttention = (signals) => SIGNAL_KEYS
        .map((k) => signals[k])
        .filter((s) => s && (s.severity === 'problem' || s.severity === 'warn'))
        .map((s, i) => ({ s: s, i: i }))
        .sort((a, b) => (SEVERITY_RANK[a.s.severity] - SEVERITY_RANK[b.s.severity]) || (a.i - b.i))
        .map((x) => ({ key: x.s.key, title: x.s.title, severity: x.s.severity, detail: x.s.detail,
                       action: x.s.action }));

    /** The Twilio Studio webhook URL a number uses when it is on the flow. */
    const flowWebhookUrl = (accountSid, flowSid) =>
        'https://webhooks.twilio.com/v1/Accounts/' + accountSid + '/Flows/' + flowSid;

    /* ------------------------------------------------------------------ */
    /* Pure signal builders                                               */
    /* ------------------------------------------------------------------ */

    /**
     * transcriptBacklog. counts = { logged, processing, failed, noTranscript,
     * transcribed } for calls started in the last 7 days, plus
     * cleanupPending (recording delete not done yet) and stuck (open calls
     * past the bounded waits), any age.
     * problem: stuck > 0. warn: failed > 0 or cleanupPending > 0.
     */
    const buildTranscriptBacklog = (counts) => {
        const c = counts || {};
        const value = {
            windowDays: 7,
            logged: num(c.logged),
            processing: num(c.processing),
            failed: num(c.failed),
            noTranscript: num(c.noTranscript),
            transcribed: num(c.transcribed),
            cleanupPending: num(c.cleanupPending),
            stuck: num(c.stuck),
            // Calls that got an AI analysis since monthStart (UTC month):
            // the Click-to-Call share of the N/llm usage (AI quota meter).
            analysedThisMonth: num(c.analysedThisMonth),
            monthStart: String(c.monthStart || '')
        };
        if (value.stuck > 0) {
            return signal('transcriptBacklog', value, 'problem',
                plural(value.stuck, 'call is', 'calls are') + ' still open after more than 26 hours. ' +
                'Check the Twilio credentials and the Intelligence service.', transcriptsAction());
        }
        const parts = [];
        if (value.failed > 0) parts.push(plural(value.failed, 'call', 'calls') + ' failed in the last 7 days');
        if (value.cleanupPending > 0) {
            parts.push(plural(value.cleanupPending, 'recording is', 'recordings are') + ' not deleted from Twilio yet');
        }
        if (parts.length) return signal('transcriptBacklog', value, 'warn', parts.join('. ') + '.', transcriptsAction());
        const open = value.logged + value.processing;
        return signal('transcriptBacklog', value, 'ok',
            open ? plural(open, 'call waits', 'calls wait') + ' for a transcript.' : 'No calls wait for a transcript.');
    };

    /**
     * Pure. Group run rows by deployment. Each row:
     * { deployment, status, minutesAgo } (minutesAgo null = unreadable).
     */
    const summarizeRuns = (rows, deploymentId) => {
        const mine = (rows || []).filter((r) => String(r.deployment || '').toLowerCase() === deploymentId);
        const ran = mine.filter((r) => ['complete', 'processing', 'failed'].indexOf(r.status) !== -1);
        const last = ran[0] || null;
        return {
            deploymentId: deploymentId,
            runs: mine.length,
            lastStatus: last ? last.status : '',
            minutesSinceLastRun: last ? last.minutesAgo : null,
            failedRecent: mine.filter((r) => r.status === 'failed').length
        };
    };

    /**
     * pollerRuns. input = { rows, watermark, nowMs }.
     * problem: a deployment has no run in POLLER_GAP_MINUTES (6.5 h), or the
     * reconcile watermark is older than 24 h. warn: no run in
     * POLLER_STALE_MINUTES (45; normal during the overnight gap), a recent
     * run failed, the watermark is older than 6.5 h, or there is no watermark yet.
     * unknown: the run times cannot be read.
     */
    const buildPollerRuns = (input) => {
        const i = input || {};
        const nowMs = i.nowMs || Date.now();
        const transcripts = summarizeRuns(i.rows, POLL_DEPLOYMENTS.transcripts);
        const reconcile = summarizeRuns(i.rows, POLL_DEPLOYMENTS.reconcile);
        const wmMs = Date.parse(String(i.watermark || ''));
        const watermarkMinutes = isNaN(wmMs) ? null : Math.max(0, Math.round((nowMs - wmMs) / MINUTE_MS));
        const value = {
            transcripts: transcripts,
            reconcile: reconcile,
            watermark: String(i.watermark || ''),
            watermarkMinutes: watermarkMinutes,
            staleAfterMinutes: POLLER_STALE_MINUTES
        };
        const jobs = [{ name: 'Transcript job', j: transcripts }, { name: 'Call sync job', j: reconcile }];

        const problems = [];
        const warns = [];
        let unreadable = false;
        jobs.forEach(({ name, j }) => {
            if (j.runs > 0 && j.lastStatus && j.minutesSinceLastRun === null) unreadable = true;
            else if (!j.lastStatus || j.minutesSinceLastRun > POLLER_GAP_MINUTES) {
                problems.push(name + ': no run in the last ' + Math.round(POLLER_GAP_MINUTES / 60) + ' hours');
            } else if (j.minutesSinceLastRun > POLLER_STALE_MINUTES) {
                warns.push(name + ': last run ' + j.minutesSinceLastRun + ' minutes ago (runs pause overnight)');
            }
            if (j.failedRecent > 0) warns.push(name + ': ' + plural(j.failedRecent, 'recent run', 'recent runs') + ' failed');
        });
        if (watermarkMinutes === null) {
            warns.push('Call sync has not finished a run yet');
        } else if (watermarkMinutes > WATERMARK_PROBLEM_MINUTES) {
            problems.push('Call sync is ' + Math.round(watermarkMinutes / 60) + ' hours behind');
        } else if (watermarkMinutes > WATERMARK_WARN_MINUTES) {
            warns.push('Call sync is ' + watermarkMinutes + ' minutes behind');
        }

        if (problems.length) {
            return signal('pollerRuns', value, 'problem', problems.concat(warns).join('. ') + '.', transcriptsAction());
        }
        if (unreadable) return signal('pollerRuns', value, 'unknown', 'The run times could not be read.');
        if (warns.length) return signal('pollerRuns', value, 'warn', warns.join('. ') + '.', transcriptsAction());
        return signal('pollerRuns', value, 'ok', 'Both jobs ran in the last ' + POLLER_STALE_MINUTES + ' minutes.');
    };

    /**
     * aiQuota. remaining = requests left (no total: Oracle publishes none).
     * problem below 10 (the analysis reserve: calls are saved without AI),
     * warn below 50, unknown when the runtime cannot tell.
     */
    const buildAiQuota = (remaining) => {
        if (remaining === null || remaining === undefined || !isFinite(Number(remaining))) {
            return signal('aiQuota', null, 'unknown', 'NetSuite did not report the AI usage left.');
        }
        const n = Number(remaining);
        if (n < AI_PROBLEM_BELOW) {
            return signal('aiQuota', n, 'problem', n + ' AI requests left. New calls are saved without AI analysis.',
                transcriptsAction());
        }
        if (n < AI_WARN_BELOW) return signal('aiQuota', n, 'warn', 'Only ' + n + ' AI requests left.', transcriptsAction());
        return signal('aiQuota', n, 'ok', n + ' AI requests left.');
    };

    /**
     * repPhones. input = { inboundEnabled, routes, presence: [presence item] }.
     * Only reps who ring for a routed number. A rep receives calls when the
     * phone reported in the last 12 min (not stale), can receive, has the
     * inbound grant and its token identity matches.
     * warn: inbound on and a routed rep is not receiving.
     */
    const buildRepPhones = (input) => {
        const i = input || {};
        const inboundEnabled = i.inboundEnabled === true;
        const byId = {};
        (i.presence || []).forEach((p) => { if (p && p.employeeId) byId[String(p.employeeId)] = p; });
        const seen = {};
        const reps = [];
        (i.routes || []).forEach((r) => {
            const id = String(r.employeeId || '');
            if (!id || seen[id]) return;
            seen[id] = true;
            const p = byId[id] || null;
            const receiving = !!p && !p.stale && p.canReceive === true &&
                              p.incomingGranted === true && p.identityMatch === true;
            reps.push({
                employeeId: id,
                employeeName: (p && p.employeeName) || r.employeeName || '',
                receiving: receiving,
                state: p ? p.state : '',
                stale: p ? p.stale !== false : true,
                canReceive: !!(p && p.canReceive),
                incomingGranted: !!(p && p.incomingGranted),
                identityMatch: !!(p && p.identityMatch),
                lastError: (p && p.lastError) || '',
                lastSeen: (p && p.lastSeen) || ''
            });
        });
        const value = { inboundEnabled: inboundEnabled, reps: reps };
        if (!reps.length) return signal('repPhones', value, 'ok', 'No rep rings for a routed number.');
        const notReceiving = reps.filter((r) => !r.receiving);
        if (!inboundEnabled) return signal('repPhones', value, 'ok', 'Inbound calls are off.');
        if (notReceiving.length) {
            const names = notReceiving.map((r) => r.employeeName || ('Employee ' + r.employeeId));
            return signal('repPhones', value, 'warn',
                'Not receiving calls: ' + names.join(', ') + '. Ask the rep to open the phone (or reload it).',
                { label: 'See rep phones', route: ROUTES.health });
        }
        return signal('repPhones', value, 'ok', 'Every routed rep can receive calls.');
    };

    /**
     * numberRouting. input = { inboundEnabled, accountSid, flowSid, routes,
     * defaultCallerId, list: { ok, items, hasMore } }.
     * problem: the default caller ID or a routed number is not in Twilio,
     * or (inbound on, flow published) a routed number does not point at
     * the flow. unknown: the list did not load, or Twilio has more numbers
     * than were read and something looks missing.
     */
    const buildNumberRouting = (input) => {
        const i = input || {};
        const inboundEnabled = i.inboundEnabled === true;
        const flowSid = String(i.flowSid || '');
        const list = i.list || { ok: false };
        if (!list.ok) {
            return signal('numberRouting', null, 'unknown',
                'The Twilio number list did not load' + (list.errorMessage ? ': ' + list.errorMessage : '.'));
        }
        const flowUrl = flowSid ? flowWebhookUrl(i.accountSid, flowSid) : '';
        const bySid = {};
        // Keyed by the last 10 digits (the lookupCaller rule): the config
        // caller ID may be stored in a display form ("1 (855) 557-5596"),
        // Twilio answers in E.164.
        const digits = (v) => String(v || '').replace(/[^0-9]/g, '').slice(-10);
        const byDigits = {};
        (list.items || []).forEach((n) => {
            if (n && n.sid) bySid[n.sid] = n;
            if (n && n.phoneNumber) byDigits[digits(n.phoneNumber)] = n;
        });
        const numbers = (i.routes || []).map((r) => {
            const t = bySid[r.phoneSid] || null;
            return {
                phoneSid: r.phoneSid,
                phoneNumber: r.phoneNumber,
                employeeId: r.employeeId,
                employeeName: r.employeeName || '',
                inTwilio: !!t,
                // null when there is no flow to compare with.
                onFlow: !t || !flowUrl ? null : String(t.voiceUrl || '') === flowUrl,
                voiceUrl: t ? String(t.voiceUrl || '') : ''
            };
        });
        const callerId = String(i.defaultCallerId || '');
        const value = {
            inboundEnabled: inboundEnabled,
            flowSid: flowSid,
            defaultCallerId: callerId ? { phoneNumber: callerId, inTwilio: !!byDigits[digits(callerId)] } : null,
            numbers: numbers,
            hasMore: !!list.hasMore
        };

        const missing = [];
        if (callerId && !byDigits[digits(callerId)]) missing.push(callerId);
        numbers.forEach((n) => { if (!n.inTwilio) missing.push(n.phoneNumber || n.phoneSid); });
        if (missing.length) {
            if (value.hasMore) {
                return signal('numberRouting', value, 'unknown',
                    'Twilio lists more numbers than were read; not checked.');
            }
            return signal('numberRouting', value, 'problem', 'Not in the Twilio account: ' + missing.join(', ') + '.',
                { label: 'Open Phones & reps', route: ROUTES.phones });
        }
        if (inboundEnabled && flowUrl) {
            const off = numbers.filter((n) => n.onFlow === false);
            if (off.length) {
                return signal('numberRouting', value, 'problem',
                    'Not on the routing flow (calls do not ring the rep): ' +
                    off.map((n) => n.phoneNumber).join(', ') + '.', republishAction());
            }
            return signal('numberRouting', value, 'ok',
                numbers.length ? 'Every routed number is in Twilio and on the routing flow.'
                               : 'The default caller ID is in Twilio.');
        }
        if (!callerId && !numbers.length) return signal('numberRouting', value, 'ok', 'No numbers to check.');
        return signal('numberRouting', value, 'ok',
            'The default caller ID and every routed number are in Twilio.');
    };

    /**
     * routingChanged (Inbound routing). input = { inboundEnabled, flowSid,
     * stateRead: { ok, state, error }, current: routingHashes(...) | null }.
     *   off       → ok
     *   on, no flow SID → warn "not published"
     *   no stored state (published before tracking) → unknown + Publish again
     *   last attempt failed / partial → problem
     *   routesHash differs → warn "Routing changed after the last publish"
     *   builder version differs → warn "update available"
     *   flowHash differs → warn "settings changed"
     */
    const buildRoutingChanged = (input) => {
        const i = input || {};
        const read = i.stateRead || { ok: false };
        const st = read.ok ? read.state : null;
        const cur = i.current || null;
        const value = {
            inboundEnabled: i.inboundEnabled === true,
            published: !!i.flowSid,
            result: st ? String(st.result || '') : '',
            publishedAt: st ? String(st.publishedAt || '') : '',
            lastAttemptAt: st ? String(st.at || '') : '',
            revision: st && st.revision != null ? st.revision : null,
            failedNumbers: st && Array.isArray(st.failedNumbers) ? st.failedNumbers : [],
            routesChanged: null,
            settingsChanged: null
        };
        if (!value.inboundEnabled) return signal('routingChanged', value, 'ok', 'Inbound calls are off.');
        if (!i.flowSid) {
            return signal('routingChanged', value, 'warn', 'Inbound calls are on, but the routing is not published.',
                { label: 'Publish', route: ROUTES.inbound });
        }
        if (!read.ok) return signal('routingChanged', value, 'unknown', 'The stored routing state could not be read.');
        if (!st) {
            return signal('routingChanged', value, 'unknown',
                'No publish record yet. Publish again to start tracking changes.', republishAction());
        }
        if (st.result === 'failed') {
            return signal('routingChanged', value, 'problem',
                'The last publish failed' + (st.message ? ': ' + st.message : '.'), republishAction());
        }
        if (st.result === 'partial') {
            const n = value.failedNumbers.length;
            return signal('routingChanged', value, 'problem',
                'Routing is only partly published' +
                (n ? ': ' + value.failedNumbers.join(', ') + ' not updated.' : '.'), republishAction());
        }
        if (!cur) return signal('routingChanged', value, 'unknown', 'The rep assignments could not be read.');
        value.routesChanged = cur.routesHash !== st.routesHash;
        value.settingsChanged = !!cur.flowHash && cur.flowHash !== st.flowHash;
        if (value.routesChanged) {
            return signal('routingChanged', value, 'warn', 'Routing changed after the last publish.', republishAction());
        }
        if (String(st.builderVersion || '') !== String(cur.builderVersion || '')) {
            return signal('routingChanged', value, 'warn', 'An update to the routing flow is available.', republishAction());
        }
        if (value.settingsChanged) {
            return signal('routingChanged', value, 'warn',
                'Inbound call settings changed after the last publish.', republishAction());
        }
        return signal('routingChanged', value, 'ok', 'The live routing matches NetSuite.');
    };

    /**
     * outboundNotice. input = { cfg (loadOutboundConfig), status
     * (outbound.outboundStatus(cfg) or null) }.
     * problem: the Function is missing, or the TwiML App does not point at
     * it. warn: notice on but never published, saved changes not live,
     * build pending, or a newer Function version exists.
     */
    const buildOutboundNotice = (input) => {
        const i = input || {};
        const cfg = i.cfg || {};
        const st = i.status || null;
        const noticeOn = cfg.outNoticeOn === true;
        const published = outbound.isPublished(cfg);
        const noticeVersion = cfg.outNoticeVersion || 1;
        const publishedNoticeVersion = cfg.outPublishedNoticeVersion || 0;
        const value = {
            noticeOn: noticeOn,
            published: published,
            pending: st ? !!st.pending : !!cfg.outFnPendingBuild,
            changesPending: published && (noticeOn ? noticeVersion : 0) !== publishedNoticeVersion,
            needsRepublish: outbound.needsRepublish(cfg),
            functionExists: st ? st.functionExists : null,
            voiceUrlMatches: st ? st.voiceUrlMatches : null
        };
        const act = { label: 'Open Outbound calls', route: ROUTES.outbound };
        if (!published) {
            if (noticeOn) return signal('outboundNotice', value, 'warn', 'The notice is on but not published.', act);
            return signal('outboundNotice', value, 'ok', 'Not published (the notice is off).');
        }
        if (value.functionExists === false) {
            return signal('outboundNotice', value, 'problem',
                'The outbound Function is missing in Twilio, so outbound calls fail. Publish again.', act);
        }
        if (value.voiceUrlMatches === false) {
            return signal('outboundNotice', value, 'problem',
                'The TwiML App does not point at the published Function.', act);
        }
        if (value.pending) return signal('outboundNotice', value, 'warn', 'A publish is still building.', act);
        if (value.needsRepublish) return signal('outboundNotice', value, 'warn', 'A newer version is available. Publish again.', act);
        if (value.changesPending) return signal('outboundNotice', value, 'warn', 'Saved notice changes are not live yet.', act);
        if (value.voiceUrlMatches === null || value.functionExists === null) {
            return signal('outboundNotice', value, 'unknown', 'Twilio could not be checked.');
        }
        return signal('outboundNotice', value, 'ok', noticeOn ? 'The notice is live.' : 'Published; no notice plays.');
    };

    /**
     * intelligence. input = { serviceSid, list: { ok, items } }.
     * problem: the saved service is not in Twilio, or its auto-transcribe
     * is off (recordings are not transcribed). warn: no service saved.
     */
    const buildIntelligence = (input) => {
        const i = input || {};
        const sid = String(i.serviceSid || '');
        const list = i.list || { ok: false };
        const act = { label: 'Open Transcripts & AI', route: ROUTES.transcripts };
        if (!sid) {
            return signal('intelligence', { serviceSid: '', exists: null, autoTranscribe: null, friendlyName: '' },
                'warn', 'No Intelligence service is saved.', act);
        }
        if (!list.ok) {
            return signal('intelligence', { serviceSid: sid, exists: null, autoTranscribe: null, friendlyName: '' },
                'unknown', 'The Twilio service list did not load' + (list.errorMessage ? ': ' + list.errorMessage : '.'));
        }
        const svc = (list.items || []).filter((s) => s && s.sid === sid)[0] || null;
        const value = {
            serviceSid: sid,
            exists: !!svc,
            autoTranscribe: svc && typeof svc.autoTranscribe === 'boolean' ? svc.autoTranscribe : null,
            friendlyName: svc ? String(svc.friendlyName || '') : ''
        };
        if (!svc) return signal('intelligence', value, 'problem', 'The saved service is not in the Twilio account.', act);
        if (value.autoTranscribe === false) {
            return signal('intelligence', value, 'problem',
                'Auto-transcribe is off in Twilio, so calls get no transcript. Turn it on in the Twilio Console.', act);
        }
        if (value.autoTranscribe === null) {
            return signal('intelligence', value, 'unknown', 'Twilio did not report auto-transcribe.');
        }
        return signal('intelligence', value, 'ok', 'Auto-transcribe is on.');
    };

    /** fallbackOwner. warn: inbound on and no fallback owner set. */
    const buildFallbackOwner = (input) => {
        const i = input || {};
        const value = { inboundEnabled: i.inboundEnabled === true, fallbackOwnerId: String(i.fallbackOwnerId || '') };
        if (!value.inboundEnabled) return signal('fallbackOwner', value, 'ok', 'Inbound calls are off.');
        if (!value.fallbackOwnerId) {
            return signal('fallbackOwner', value, 'warn',
                'No fallback owner: calls to numbers with no rep are not logged.', { label: 'Open Inbound', route: ROUTES.inbound });
        }
        return signal('fallbackOwner', value, 'ok', 'A fallback owner is set.');
    };

    /* ------------------------------------------------------------------ */
    /* Readers (each throws on failure; loadHealth guards them)           */
    /* ------------------------------------------------------------------ */

    /**
     * One SuiteQL query (10 units). Calls started in the last 7 days by
     * status, plus cleanup pending and stuck calls of any age. The cut-offs
     * are ISO UTC binds compared with custevent_ctc_call_started (ISO UTC
     * text), so no database time zone is involved.
     */
    const readTranscriptBacklog = (nowMs) => {
        const since = new Date(nowMs - BACKLOG_WINDOW_MS).toISOString();
        const now = new Date(nowMs);
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
        const earliest = monthStart < since ? monthStart : since;
        const stuckBefore = new Date(nowMs - STUCK_AFTER_MS).toISOString();
        const status = 'TO_CHAR(custevent_ctc_call_status)';
        const started = 'TO_CHAR(custevent_ctc_call_started)';
        const inWindow = (s) => "SUM(CASE WHEN " + status + " = '" + s + "' AND " + started + ' >= ? THEN 1 ELSE 0 END)';
        const sql =
            'SELECT ' +
            inWindow('Logged') + ' AS logged, ' +
            inWindow('Processing') + ' AS processing, ' +
            inWindow('Failed') + ' AS failed, ' +
            inWindow('No transcript') + ' AS notranscript, ' +
            inWindow('Transcribed') + ' AS transcribed, ' +
            "SUM(CASE WHEN custevent_ctc_recording_cleanup_pending = 'T' THEN 1 ELSE 0 END) AS cleanuppending, " +
            "SUM(CASE WHEN custevent_ctc_processed = 'F' AND " + started + ' < ? THEN 1 ELSE 0 END) AS stuck, ' +
            'SUM(CASE WHEN custevent_ctc_ai_brief IS NOT NULL AND ' + started + ' >= ? THEN 1 ELSE 0 END) AS analysed ' +
            'FROM phonecall ' +
            'WHERE custevent_ctc_call_sid IS NOT NULL ' +
            '  AND (' + started + " >= ? OR custevent_ctc_processed = 'F' " +
            "       OR custevent_ctc_recording_cleanup_pending = 'T')";
        const params = [since, since, since, since, since, stuckBefore, monthStart, earliest];
        const rows = query.runSuiteQL({ query: sql, params: params }).asMappedResults();
        const r = rows[0] || {};
        return {
            logged: num(r.logged),
            processing: num(r.processing),
            failed: num(r.failed),
            noTranscript: num(r.notranscript),
            transcribed: num(r.transcribed),
            cleanupPending: num(r.cleanuppending),
            stuck: num(r.stuck),
            analysedThisMonth: num(r.analysed),
            monthStart: monthStart
        };
    };

    /**
     * One N/search on scheduledscriptinstance (10 units): the latest runs
     * of the transcripts and reconcile deployments, newest first. Minutes
     * since each run start are computed in the database: SYSDATE - start
     * date, both on the server clock, so the user's date format and time
     * zone never reach JavaScript. Live-checked 2026-11-03: CURRENT_DATE is
     * the USER's time zone and gave ages off by the user-to-server offset
     * (+120 min for a Central user). Any failure → the signal is 'unknown'.
     * @returns {Array<{deployment: string, status: string, minutesAgo: (number|null), started: string}>}
     */
    const readPollerRows = () => {
        const deployments = [POLL_DEPLOYMENTS.transcripts, POLL_DEPLOYMENTS.reconcile];
        const results = search.create({
            type: 'scheduledscriptinstance',
            filters: [
                ['script.scriptid', 'is', POLL_SCRIPT_ID], 'AND',
                [['scriptdeployment.scriptid', 'is', deployments[0]], 'OR',
                 ['scriptdeployment.scriptid', 'is', deployments[1]]]
            ],
            columns: [
                search.createColumn({ name: 'datecreated', sort: search.Sort.DESC }),
                search.createColumn({ name: 'startdate' }),
                search.createColumn({ name: 'status' }),
                search.createColumn({ name: 'scriptid', join: 'scriptdeployment' }),
                search.createColumn({
                    name: 'formulanumeric',
                    formula: 'ROUND((SYSDATE - NVL({startdate}, {datecreated})) * 1440)'
                })
            ]
        }).run().getRange({ start: 0, end: POLLER_ROWS });
        return results.map((r) => {
            const raw = r.getValue({ name: 'formulanumeric' });
            const minutes = raw === '' || raw === null || raw === undefined ? NaN : Number(raw);
            return {
                deployment: String(r.getValue({ name: 'scriptid', join: 'scriptdeployment' }) || '').toLowerCase(),
                status: String(r.getValue({ name: 'status' }) || '').toLowerCase(),
                // A negative age or one over a year means the formula is wrong here.
                minutesAgo: isFinite(minutes) && minutes >= -5 && minutes < 525600 ? Math.max(0, minutes) : null,
                started: String(r.getValue({ name: 'startdate' }) || r.getValue({ name: 'datecreated' }) || '')
            };
        });
    };

    /* ------------------------------------------------------------------ */
    /* loadHealth                                                         */
    /* ------------------------------------------------------------------ */

    /**
     * Run `fn` for one signal; on any error return 'unknown' with a short
     * detail and log the full error.
     */
    const guard = (key, fn) => {
        try {
            return fn();
        } catch (e) {
            log.error({ title: 'CTC Health — ' + key + ' failed', details: errText(e) });
            return signal(key, null, 'unknown', 'Could not check: ' + errText(e).slice(0, 120));
        }
    };

    /**
     * @param {{loadPresence?: function(): {items: Array<Object>}, nowMs?: number}} [opts]
     *   loadPresence: the wizard's presence loader (2 searches).
     */
    const loadHealth = (opts) => {
        const o = opts || {};
        const nowMs = o.nowMs || Date.now();

        let cfg;
        try { cfg = config.loadOutboundConfig(); }
        catch (e) {
            log.error({ title: 'CTC Health — config not loaded', details: errText(e) });
            return { ok: false, error: 'config_not_found' };
        }

        // Shared reads. A failed read only makes the signals that need it unknown.
        let routes = null;
        let routesError = '';
        try { routes = routing.loadRoutes(); }
        catch (e) {
            routesError = errText(e);
            log.error({ title: 'CTC Health — load routes failed', details: routesError });
        }
        const needRoutes = (key, fn) => guard(key, () => {
            if (!routes) throw new Error('the rep assignments could not be read (' + routesError + ')');
            return fn(routes);
        });

        const signals = {};
        signals.transcriptBacklog = guard('transcriptBacklog',
            () => buildTranscriptBacklog(readTranscriptBacklog(nowMs)));
        signals.pollerRuns = guard('pollerRuns',
            () => buildPollerRuns({ rows: readPollerRows(), watermark: cfg.reconWatermark, nowMs: nowMs }));
        signals.aiQuota = guard('aiQuota', () => buildAiQuota(llmAnalysis.remainingUsage()));
        signals.repPhones = needRoutes('repPhones', (r) => {
            if (typeof o.loadPresence !== 'function') throw new Error('no presence loader');
            const presence = o.loadPresence();
            return buildRepPhones({ inboundEnabled: cfg.inboundEnabled, routes: r,
                                    presence: (presence && presence.items) || [] });
        });
        signals.numberRouting = needRoutes('numberRouting', (r) => buildNumberRouting({
            inboundEnabled: cfg.inboundEnabled,
            accountSid: cfg.accountSid,
            flowSid: cfg.studioFlowSid,
            routes: r,
            defaultCallerId: cfg.phoneNumber,
            list: twilio.listPhoneNumbers(cfg)
        }));
        signals.routingChanged = guard('routingChanged', () => {
            // Off needs no reads at all.
            if (!cfg.inboundEnabled) return buildRoutingChanged({ inboundEnabled: false });
            return buildRoutingChanged({
                inboundEnabled: true,
                flowSid: cfg.studioFlowSid,
                stateRead: config.readRoutingState(cfg.id),
                current: routes ? routing.routingHashes(routes, cfg) : null
            });
        });
        signals.outboundNotice = guard('outboundNotice', () => buildOutboundNotice({
            cfg: cfg,
            status: outbound.outboundStatus(cfg)
        }));
        signals.intelligence = guard('intelligence', () => buildIntelligence({
            serviceSid: cfg.intelServiceSid,
            list: cfg.intelServiceSid ? twilio.listIntelServices(cfg) : { ok: false }
        }));
        signals.fallbackOwner = guard('fallbackOwner', () => buildFallbackOwner({
            inboundEnabled: cfg.inboundEnabled,
            fallbackOwnerId: cfg.fallbackOwnerId
        }));

        return {
            ok: true,
            checkedAt: new Date(nowMs).toISOString(),
            signals: signals,
            attention: buildAttention(signals)
        };
    };

    return {
        SIGNAL_KEYS,
        POLL_DEPLOYMENTS,
        POLLER_STALE_MINUTES,
        AI_WARN_BELOW,
        AI_PROBLEM_BELOW,
        STUCK_AFTER_MS,
        buildTranscriptBacklog,
        buildPollerRuns,
        buildAiQuota,
        buildRepPhones,
        buildNumberRouting,
        buildRoutingChanged,
        buildOutboundNotice,
        buildIntelligence,
        buildFallbackOwner,
        buildAttention,
        readTranscriptBacklog,
        readPollerRows,
        loadHealth
    };
});
