// @ts-check
/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Inbound routing: one Twilio Studio flow for all inbound numbers,
 * generated and published by NetSuite.
 *
 *   rep assignments ──routesFromAssignments──▶ routes (one per phone SID)
 *   routes ──buildFlowDefinition──▶ Studio definition
 *   publishRouting: create/update the flow, store its SID on the config
 *   record, point each routed number's VoiceUrl at the flow, and only
 *   when every number is pointed store the publish time.
 *
 * Flow shape (per route n):
 *   Trigger ─incomingCall─▶ split_dialed ─To == route n─▶ ring_n
 *   ring_n (connect-call-to client <employeeId>) ─callCompleted─▶ answered_n
 *   answered_n: DialCallStatus completed / answered → end, else → talked_n
 *   talked_n: DialCallDuration > 0 → end, else → no_answer
 *   split_dialed noMatch → no_answer (say-play message)
 *
 * Voicemail (voicemailOn, default on): no_answer is the greeting, then
 *   no_answer ─audioComplete─▶ voicemail (record-voicemail, max length
 *   voicemailMaxSeconds, finish on '#', beep, trim silence, transcribe
 *   false) ─recordingComplete / noAudio─▶ voicemail_goodbye (say-play)
 *   voicemail ─hangup─▶ end (the caller hung up after the message; Twilio
 *   keeps the recording).
 * Unrouted numbers (split_dialed noMatch) and a flow with no routes take
 * the same path. Twilio attaches the voicemail recording to the caller's
 * (parent) call. Legacy <Record> transcription stays off: Conversational
 * Intelligence transcribes the recording like a call recording, and the
 * poller reads it (lib/ctc_call_reconcile logs the Phone Call).
 * With voicemail off, no_answer plays and the call ends (as before).
 *
 * Inbound recording (recordInbound): every ring_n has `record: true`.
 * Studio's Connect Call To exposes only this boolean (no channel or trim
 * option). Twilio attaches the recording to the PARENT call (the caller's
 * inbound leg), not to the child leg that rang `client:<id>`; the poller
 * finds it through the child call's parent_call_sid. With
 * recordingNoticeOn, one say-play `recording_notice` sits between the
 * Trigger and split_dialed, so every routed caller hears it once:
 *   Trigger ─incomingCall─▶ recording_notice ─audioComplete─▶ split_dialed
 *
 * The answered_n split is essential: connect-call-to fires callCompleted
 * for answered AND unanswered dials, so without it every answered call
 * would also play the no-answer message.
 *
 * The client identity is the NetSuite employee internal id (string), which
 * matches the identity in the phone token (lib/ctc_twilio_jwt.js).
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/search', 'N/record', 'N/runtime', 'N/log',
        './ctc_config', './ctc_twilio_admin'],
       (search, record, runtime, log, config, twilio) => {

    const MAX_ROUTES = 50;
    const FLOW_FRIENDLY_NAME = 'CTC Inbound Routing';
    // Units kept in reserve before each number update (https.post = 10).
    const MIN_USAGE_PER_NUMBER = 100;

    // Grid for the Studio canvas.
    const COL_WIDTH = 400;
    const ROW_HEIGHT = 220;

    const VOICEMAIL_GOODBYE = 'Thank you for your message. Goodbye.';
    // Seconds of silence that end a voicemail (Studio default 5).
    const VOICEMAIL_SILENCE_SECONDS = 5;

    const TRIGGER_EVENTS_WITHOUT_NEXT = [
        'incomingMessage',
        'incomingConversationMessage',
        'incomingRequest',
        'incomingParent'
    ];

    /**
     * Normalize a phone number to E.164 (+digits). A 10-digit number
     * without a leading + is treated as North American (+1). Returns ''
     * when there are no digits.
     */
    const toE164 = (raw) => {
        const s = raw == null ? '' : String(raw).trim();
        const digits = s.replace(/[^0-9]/g, '');
        if (!digits) return '';
        if (s.charAt(0) !== '+' && digits.length === 10) return '+1' + digits;
        return '+' + digits;
    };

    const isTrue = (v) => v === true || v === 'T';

    /**
     * Pure. Rows are rep-assignment rows in stable order:
     *   { phoneSid, phoneNumber, employeeId, employeeName?, isPrimary?, isInactive? }
     * Returns one route per phone SID: the primary employee, else the
     * first assigned employee. Inactive rows, rows without an employee,
     * and numbers without digits are skipped. A second phone SID with
     * the same E.164 number is skipped (Studio would never reach it).
     *
     * @returns {Array<{phoneSid: string, phoneNumber: string, employeeId: string, employeeName: string}>}
     */
    const routesFromAssignments = (rows) => {
        const byPhone = {};
        const order = [];
        (Array.isArray(rows) ? rows : []).forEach((row) => {
            if (!row || isTrue(row.isInactive)) return;
            const phoneSid = row.phoneSid ? String(row.phoneSid) : '';
            const employeeId = row.employeeId == null ? '' : String(row.employeeId).trim();
            const phoneNumber = toE164(row.phoneNumber);
            if (!phoneSid || !employeeId || !phoneNumber) return;

            const candidate = {
                phoneSid: phoneSid,
                phoneNumber: phoneNumber,
                employeeId: employeeId,
                employeeName: row.employeeName ? String(row.employeeName) : ''
            };
            const current = byPhone[phoneSid];
            if (!current) {
                byPhone[phoneSid] = { route: candidate, primary: isTrue(row.isPrimary) };
                order.push(phoneSid);
            } else if (!current.primary && isTrue(row.isPrimary)) {
                byPhone[phoneSid] = { route: candidate, primary: true };
            }
        });

        const seenNumbers = {};
        const routes = [];
        order.forEach((sid) => {
            const route = byPhone[sid].route;
            if (seenNumbers[route.phoneNumber]) return;
            seenNumbers[route.phoneNumber] = true;
            routes.push(route);
        });
        return routes;
    };

    /**
     * Read active rep assignments (oldest first) and build routes.
     */
    const loadRoutes = () => {
        const results = search.create({
            type: 'customrecord_ctc_rep_assignment',
            filters: [['isinactive', 'is', 'F']],
            columns: [
                { name: 'internalid', sort: search.Sort.ASC },
                'custrecord_ctc_ra_employee',
                'custrecord_ctc_ra_phone_sid',
                'custrecord_ctc_ra_phone_number',
                'custrecord_ctc_ra_is_primary'
            ]
        }).run().getRange({ start: 0, end: 1000 });

        return routesFromAssignments(results.map((r) => ({
            phoneSid: r.getValue('custrecord_ctc_ra_phone_sid'),
            phoneNumber: r.getValue('custrecord_ctc_ra_phone_number'),
            employeeId: r.getValue('custrecord_ctc_ra_employee'),
            employeeName: r.getText('custrecord_ctc_ra_employee') || '',
            isPrimary: r.getValue('custrecord_ctc_ra_is_primary')
        })));
    };

    /**
     * Pure. Build the Studio flow definition for the routes.
     * Throws when there are more than MAX_ROUTES routes.
     *
     * @param {Array<{phoneNumber: string, employeeId: string}>} routes
     * @param {{ringSeconds: number, noAnswerMessage: string,
     *          recordInbound?: boolean, recordingNoticeOn?: boolean,
     *          recordingNotice?: string, voicemailOn?: boolean,
     *          voicemailMaxSeconds?: number}} opts
     *   recordInbound sets `record: true` on every ring widget (default
     *   false). recordingNoticeOn adds the recording_notice say-play; it
     *   applies only when recordInbound is on and there are routes.
     *   voicemailOn (default false here; the config default is on) adds
     *   the voicemail + voicemail_goodbye widgets after no_answer.
     *   voicemailMaxSeconds is clamped to 30-300 (default 120).
     */
    const buildFlowDefinition = (routes, opts) => {
        const list = Array.isArray(routes) ? routes : [];
        if (list.length > MAX_ROUTES) {
            throw new Error('too_many_routes: ' + list.length + ' routes; the limit is ' + MAX_ROUTES);
        }
        const ringSeconds = (opts && opts.ringSeconds) || config.DEFAULT_RING_SECONDS || 20;
        const voicemailOn = !!(opts && opts.voicemailOn === true);
        const message = (opts && opts.noAnswerMessage) ||
            (voicemailOn ? config.DEFAULT_VOICEMAIL_GREETING : config.DEFAULT_NOANSWER_MESSAGE) || '';
        const maxRaw = parseInt(String((opts && opts.voicemailMaxSeconds) || ''), 10);
        const minVm = config.MIN_VOICEMAIL_MAX_SECONDS || 30;
        const maxVm = config.MAX_VOICEMAIL_MAX_SECONDS || 300;
        const voicemailMaxSeconds = isNaN(maxRaw)
            ? (config.DEFAULT_VOICEMAIL_MAX_SECONDS || 120)
            : Math.min(Math.max(maxRaw, minVm), maxVm);
        const recordCalls = !!(opts && opts.recordInbound === true);
        const notice = (opts && opts.recordingNotice) || config.DEFAULT_RECORDING_NOTICE || '';

        const hasRoutes = list.length > 0;
        const hasNotice = hasRoutes && recordCalls && !!(opts && opts.recordingNoticeOn === true) && !!notice;
        // Rows below the notice shift down one when it is present.
        const row0 = hasNotice ? 1 : 0;
        const states = [];

        states.push({
            name: 'Trigger',
            type: 'trigger',
            transitions: /** @type {Array<Object>} */ (
                [{ next: hasNotice ? 'recording_notice' : (hasRoutes ? 'split_dialed' : 'no_answer'),
                   event: 'incomingCall' }]
            ).concat(TRIGGER_EVENTS_WITHOUT_NEXT.map((event) => ({ event: event }))),
            properties: { offset: { x: 0, y: 0 } }
        });

        if (hasNotice) {
            states.push({
                name: 'recording_notice',
                type: 'say-play',
                transitions: [{ next: 'split_dialed', event: 'audioComplete' }],
                properties: {
                    offset: { x: 0, y: ROW_HEIGHT },
                    loop: 1,
                    say: notice
                }
            });
        }

        if (hasRoutes) {
            states.push({
                name: 'split_dialed',
                type: 'split-based-on',
                transitions: /** @type {Array<Object>} */ (
                    [{ next: 'no_answer', event: 'noMatch' }]
                ).concat(list.map((route, i) => ({
                    next: 'ring_' + (i + 1),
                    event: 'match',
                    conditions: [{
                        friendly_name: route.phoneNumber,
                        arguments: ['{{trigger.call.To}}'],
                        type: 'equal_to',
                        value: route.phoneNumber
                    }]
                }))),
                properties: {
                    input: '{{trigger.call.To}}',
                    offset: { x: 0, y: ROW_HEIGHT * (row0 + 1) }
                }
            });
        }

        list.forEach((route, i) => {
            const n = i + 1;
            const x = i * COL_WIDTH;
            states.push({
                name: 'ring_' + n,
                type: 'connect-call-to',
                transitions: [
                    { next: 'answered_' + n, event: 'callCompleted' },
                    { event: 'hangup' }
                ],
                properties: {
                    offset: { x: x, y: ROW_HEIGHT * (row0 + 2) },
                    caller_id: '{{contact.channel.address}}',
                    noun: 'client',
                    to: String(route.employeeId),
                    timeout: ringSeconds,
                    record: recordCalls
                }
            });
            // An answered call ends with DialCallStatus 'completed' OR
            // 'answered' (seen live when the rep hangs up from the browser),
            // so both end the flow. talked_n is the safety net: any talk time
            // means the call was answered. Only a call with neither reaches
            // the no-answer message / voicemail.
            const dialStatus = '{{widgets.ring_' + n + '.DialCallStatus}}';
            states.push({
                name: 'answered_' + n,
                type: 'split-based-on',
                transitions: [
                    { next: 'talked_' + n, event: 'noMatch' },
                    {
                        event: 'match',
                        conditions: [{
                            friendly_name: 'answered',
                            arguments: [dialStatus],
                            type: 'equal_to',
                            value: 'completed'
                        }]
                    },
                    {
                        event: 'match',
                        conditions: [{
                            friendly_name: 'answered (rep hung up)',
                            arguments: [dialStatus],
                            type: 'equal_to',
                            value: 'answered'
                        }]
                    }
                ],
                properties: {
                    input: dialStatus,
                    offset: { x: x, y: ROW_HEIGHT * (row0 + 3) }
                }
            });
            const dialDuration = '{{widgets.ring_' + n + '.DialCallDuration}}';
            states.push({
                name: 'talked_' + n,
                type: 'split-based-on',
                transitions: [
                    { next: 'no_answer', event: 'noMatch' },
                    {
                        event: 'match',
                        conditions: [{
                            friendly_name: 'had talk time',
                            arguments: [dialDuration],
                            type: 'greater_than',
                            value: '0'
                        }]
                    }
                ],
                properties: {
                    input: dialDuration,
                    offset: { x: x + 200, y: ROW_HEIGHT * (row0 + 3) }
                }
            });
        });

        const noAnswerY = hasRoutes ? ROW_HEIGHT * (row0 + 4) : ROW_HEIGHT;
        states.push({
            name: 'no_answer',
            type: 'say-play',
            transitions: [voicemailOn ? { next: 'voicemail', event: 'audioComplete' }
                                      : { event: 'audioComplete' }],
            properties: {
                offset: { x: 0, y: noAnswerY },
                loop: 1,
                say: message
            }
        });

        if (voicemailOn) {
            // Studio Record Voicemail widget. Property names as in Studio
            // flow JSON: play_beep is the string 'true'; trim is
            // 'trim-silence' | 'do-not-trim'; timeout = seconds of silence.
            states.push({
                name: 'voicemail',
                type: 'record-voicemail',
                transitions: [
                    { next: 'voicemail_goodbye', event: 'recordingComplete' },
                    { next: 'voicemail_goodbye', event: 'noAudio' },
                    { event: 'hangup' }
                ],
                properties: {
                    offset: { x: 0, y: noAnswerY + ROW_HEIGHT },
                    timeout: VOICEMAIL_SILENCE_SECONDS,
                    max_length: voicemailMaxSeconds,
                    finish_on_key: '#',
                    play_beep: 'true',
                    trim: 'trim-silence',
                    transcribe: false
                }
            });
            states.push({
                name: 'voicemail_goodbye',
                type: 'say-play',
                transitions: [{ event: 'audioComplete' }],
                properties: {
                    offset: { x: 0, y: noAnswerY + ROW_HEIGHT * 2 },
                    loop: 1,
                    say: VOICEMAIL_GOODBYE
                }
            });
        }

        return {
            description: 'CTC inbound routing: generated by NetSuite Click-to-Call. ' +
                         'Edit routing in the NetSuite Setup Wizard, not here.',
            states: states,
            initial_state: 'Trigger',
            flags: { allow_concurrent_calls: true }
        };
    };

    const errMessage = (e) => (e && e.message ? e.message : String(e));

    /**
     * Publish the inbound routing flow and point the routed numbers at it.
     *
     * Order: upsert flow → save flow SID (if new) → point each number →
     * save routing_published_at. The publish time is written only when
     * every number was pointed, so a partial publish never looks complete.
     *
     *   ok:true                 every number points at the flow; publishedAt is new.
     *   ok:false, partial:true  the flow is live but some numbers were not
     *                           updated (errors[], failedNumbers[]); publishedAt
     *                           is the PREVIOUS publish time ('' if none).
     *   ok:false (no partial)   nothing changed in the numbers (or the time
     *                           could not be saved); message says why.
     * Inbound off: { ok:false, skipped:'inbound_off' } with no Twilio call
     * (the numbers keep pointing at the flow; SPEC Inbound).
     *
     * @returns {{ok: boolean, skipped?: string, partial?: boolean,
     *            message?: string, flowSid?: string, publishedAt?: string,
     *            numbersUpdated?: number,
     *            errors?: Array<{phoneNumber: string, message: string}>,
     *            failedNumbers?: string[]}}
     */
    const publishRouting = () => {
        let cfg;
        try { cfg = config.loadConfig(); }
        catch (e) {
            return { ok: false, message: 'Configuration not found', flowSid: '',
                     publishedAt: '', numbersUpdated: 0, errors: [] };
        }

        if (!cfg.inboundEnabled) return { ok: false, skipped: 'inbound_off' };

        const failed = (message) => ({
            ok: false,
            message: message,
            flowSid: cfg.studioFlowSid || '',
            publishedAt: cfg.routingPublishedAt || '',
            numbersUpdated: 0,
            errors: []
        });

        let routes;
        try { routes = loadRoutes(); }
        catch (e) {
            log.error({ title: 'CTC Inbound — load routes failed', details: errMessage(e) });
            return failed('Could not read the rep assignments');
        }
        if (routes.length > MAX_ROUTES) {
            return failed('Too many routed numbers (' + routes.length + '). The limit is ' +
                          MAX_ROUTES + '.');
        }

        const definition = buildFlowDefinition(routes, {
            ringSeconds: cfg.ringSeconds,
            noAnswerMessage: cfg.noAnswerMessage,
            recordInbound: cfg.recordInbound === true,
            recordingNoticeOn: cfg.recordingNoticeOn === true,
            recordingNotice: cfg.recordingNotice,
            voicemailOn: cfg.voicemailOn === true,
            voicemailMaxSeconds: cfg.voicemailMaxSeconds
        });

        const flow = twilio.upsertStudioFlow(cfg, cfg.studioFlowSid, definition, FLOW_FRIENDLY_NAME);
        if (!flow.ok) {
            log.error({
                title: 'CTC Inbound — publish flow failed',
                details: 'status=' + flow.status + ' ' + flow.errorMessage
            });
            return failed('Twilio did not publish the flow: ' + flow.errorMessage);
        }

        const flowSid = flow.flowSid;
        const errors = [];

        // 1. Keep the flow SID first, so a later publish updates this flow
        // (no duplicate flows) and the reconciler knows it. If NetSuite
        // cannot keep it, no number is moved to a flow NetSuite does not know.
        if (flowSid !== (cfg.studioFlowSid || '')) {
            try {
                record.submitFields({
                    type: 'customrecord_ctc_config',
                    id: cfg.id,
                    values: { custrecord_ctc_studio_flow_sid: flowSid }
                });
            } catch (e) {
                log.error({ title: 'CTC Inbound — save flow SID failed', details: errMessage(e) });
                return failed('The flow is in Twilio, but NetSuite could not save its SID, ' +
                              'so no number was changed: ' + errMessage(e) + '. Publish again.');
            }
        }

        // 2. Point every routed number at the flow.
        let numbersUpdated = 0;
        for (let i = 0; i < routes.length; i++) {
            const route = routes[i];
            if (runtime.getCurrentScript().getRemainingUsage() < MIN_USAGE_PER_NUMBER) {
                log.audit({
                    title: 'CTC Inbound — governance stop',
                    details: 'updated=' + numbersUpdated + ' of ' + routes.length
                });
                for (let j = i; j < routes.length; j++) {
                    errors.push({ phoneNumber: routes[j].phoneNumber,
                                  message: 'Not updated: script usage limit is low. Publish again.' });
                }
                break;
            }
            const res = twilio.setNumberVoiceUrl(cfg, route.phoneSid, flowSid);
            if (res && res.ok) {
                numbersUpdated++;
            } else {
                errors.push({ phoneNumber: route.phoneNumber,
                              message: (res && res.errorMessage) || 'Twilio did not update the number' });
            }
        }

        log.audit({
            title: 'CTC Inbound — routing published',
            details: 'flow=' + twilio.maskSid(flowSid) + ' created=' + !!flow.created +
                     ' routes=' + routes.length + ' numbersUpdated=' + numbersUpdated +
                     ' errors=' + errors.length
        });

        // 3a. Partial: the flow is live, some numbers are not on it. The
        // previous published time stays (a partial publish never looks complete).
        if (errors.length > 0) {
            const n = errors.length;
            return {
                ok: false,
                partial: true,
                message: 'Routing is only partly published: ' + n +
                         (n === 1 ? ' number was' : ' numbers were') +
                         ' not updated. Publish again.',
                flowSid: flowSid,
                publishedAt: cfg.routingPublishedAt || '',
                numbersUpdated: numbersUpdated,
                errors: errors,
                failedNumbers: errors.map((e) => e.phoneNumber)
            };
        }

        // 3b. Every number points at the flow: only now record the publish time.
        const publishedAt = new Date().toISOString();
        try {
            record.submitFields({
                type: 'customrecord_ctc_config',
                id: cfg.id,
                values: { custrecord_ctc_routing_published_at: publishedAt }
            });
        } catch (e) {
            log.error({ title: 'CTC Inbound — save publish time failed', details: errMessage(e) });
            return {
                ok: false,
                message: 'Every number points at the flow, but NetSuite could not save ' +
                         'the publish time: ' + errMessage(e) + '. Publish again.',
                flowSid: flowSid,
                publishedAt: cfg.routingPublishedAt || '',
                numbersUpdated: numbersUpdated,
                errors: []
            };
        }

        return {
            ok: true,
            flowSid: flowSid,
            publishedAt: publishedAt,
            numbersUpdated: numbersUpdated,
            errors: errors
        };
    };

    return {
        MAX_ROUTES,
        toE164,
        routesFromAssignments,
        loadRoutes,
        buildFlowDefinition,
        publishRouting
    };
});
