// @ts-check
/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Shared transcript enrichment utilities used by both the Scheduled Script
 * and the RESTlet checkTranscript action.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/https', 'N/llm', 'N/log', 'N/record', './ctc_llm_analysis'],
       (https, llm, log, record, llmAnalysis) => {

    const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01/Accounts';
    const TWILIO_INTEL_BASE = 'https://intelligence.twilio.com/v2';

    // Status values written to custevent_ctc_call_status
    const CALL_STATUS = {
        LOGGED:        'Logged',
        PROCESSING:    'Processing',
        TRANSCRIBED:   'Transcribed',
        NO_TRANSCRIPT: 'No transcript',
        FAILED:        'Failed'
    };

    // Twilio Recording.status values that mean "no transcript will ever exist"
    const RECORDING_TERMINAL_STATUSES = ['absent'];

    // Twilio Transcript.status values that mean "no transcript will ever be ready"
    const TRANSCRIPT_TERMINAL_STATUSES = ['failed', 'canceled', 'error'];

    // Sprint 2b (SAFE review HIGH-1) — sentinel returned by the four Twilio
    // fetchers on TRANSIENT failure (network error, timeout, 5xx, malformed
    // JSON body). Distinct from `null` (= "not yet ready, retry on next
    // cycle without status flip is OK") so callers can leave call_status
    // untouched during sustained Twilio outages rather than churning every
    // call to PROCESSING repeatedly. Frozen so tests can use === identity.
    const TRANSIENT_ERROR = Object.freeze({ __ctc_transient: true });

    const isTransientError = (result) => result === TRANSIENT_ERROR;

    // HIGH-2: 30s timeout on every Twilio HTTPS call. NetSuite https module
    // takes timeout in milliseconds. Without this a slow Twilio edge stalls
    // the whole batch until NetSuite's 1-hour scheduled-script ceiling kicks
    // in. One slow call can starve the other 49 in the batch.
    const HTTPS_TIMEOUT_MS = 30000;

    const isRecordingTerminal = (recording) => {
        return !!(recording && RECORDING_TERMINAL_STATUSES.indexOf(recording.status) !== -1);
    };

    const isTranscriptTerminal = (transcript) => {
        return !!(transcript && TRANSCRIPT_TERMINAL_STATUSES.indexOf(transcript.status) !== -1);
    };

    const isTranscriptComplete = (transcript) => {
        return !!(transcript && transcript.status === 'completed');
    };

    // Sprint 2c — LLM concerns extracted to lib/ctc_llm_analysis.js
    // (prompt template, model params, schema, fallback shape, quota guard,
    // try/catch around llm.generateText). This module re-exports
    // ANALYSIS_PROMPT_PREFIX + analyzeTranscript for backward compatibility
    // with existing callers (ctc_rl_token.js, ctc_ss_poll_transcripts.js).
    // New callers should import from ctc_llm_analysis.js directly.
    const ANALYSIS_PROMPT_PREFIX = llmAnalysis.ANALYSIS_PROMPT_PREFIX;

    /**
     * Sprint 2b — return contract:
     *   - {sid, ...}      → recording resource found
     *   - null            → call exists but has no recording yet (TERMINAL
     *                       "not yet ready", caller marks PROCESSING)
     *   - TRANSIENT_ERROR → network error / timeout / 5xx / malformed JSON;
     *                       caller should NOT flip call_status (retry next cycle)
     */
    const fetchRecordingForCall = (accountSid, callSid, authHeader) => {
        const url = `${TWILIO_API_BASE}/${accountSid}/Calls/${callSid}/Recordings.json`;

        let response;
        try {
            response = https.get({ url, headers: { Authorization: authHeader }, timeout: HTTPS_TIMEOUT_MS });
        } catch (e) {
            log.error({ title: 'CTC Fetch Call Recordings — network error', details: (e && e.message) || String(e) });
            return TRANSIENT_ERROR;
        }

        if (response.code >= 500 && response.code < 600) {
            log.error({ title: 'CTC Fetch Call Recordings — Twilio 5xx', details: `HTTP ${response.code}` });
            return TRANSIENT_ERROR;
        }
        if (response.code !== 200) {
            log.error({ title: 'CTC Fetch Call Recordings Failed', details: `HTTP ${response.code}: ${response.body}` });
            return null;
        }

        let body;
        try {
            body = JSON.parse(response.body);
        } catch (e) {
            log.error({ title: 'CTC Fetch Call Recordings — JSON parse', details: (e && e.message) || String(e) });
            return TRANSIENT_ERROR;
        }
        const recordings = body.recordings || [];
        return recordings.length > 0 ? recordings[0] : null;
    };

    /**
     * Fetch the first Transcript resource for a given Recording SID.
     * Returns the transcript object (including .status) so callers can distinguish:
     *   - completed       → ready, enrich the Phone Call
     *   - queued/new/in-progress → still working, poll again later
     *   - failed/canceled/error  → terminal, no transcript will ever be ready
     *   - null            → no transcript exists yet OR transient HTTP error (retry)
     */
    const fetchTranscript = (recordingSid, authHeader) => {
        const url = `${TWILIO_INTEL_BASE}/Transcripts?SourceSid=${recordingSid}`;

        let response;
        try {
            response = https.get({ url, headers: { Authorization: authHeader }, timeout: HTTPS_TIMEOUT_MS });
        } catch (e) {
            log.error({ title: 'CTC Fetch Transcript — network error', details: (e && e.message) || String(e) });
            return TRANSIENT_ERROR;
        }

        if (response.code >= 500 && response.code < 600) {
            log.error({ title: 'CTC Fetch Transcript — Twilio 5xx', details: `HTTP ${response.code}` });
            return TRANSIENT_ERROR;
        }
        if (response.code !== 200) {
            log.error({ title: 'CTC Fetch Transcript Failed', details: `HTTP ${response.code}: ${response.body}` });
            return null;
        }

        let body;
        try {
            body = JSON.parse(response.body);
        } catch (e) {
            log.error({ title: 'CTC Fetch Transcript — JSON parse', details: (e && e.message) || String(e) });
            return TRANSIENT_ERROR;
        }
        const transcripts = body.transcripts || [];
        return transcripts.length ? transcripts[0] : null;
    };

    const fetchSentences = (transcriptSid, authHeader) => {
        const url = `${TWILIO_INTEL_BASE}/Transcripts/${transcriptSid}/Sentences`;

        let response;
        try {
            response = https.get({ url, headers: { Authorization: authHeader }, timeout: HTTPS_TIMEOUT_MS });
        } catch (e) {
            log.error({ title: 'CTC Fetch Sentences — network error', details: (e && e.message) || String(e) });
            return [];
        }

        if (response.code !== 200) {
            log.error({ title: 'CTC Fetch Sentences Failed', details: `HTTP ${response.code}: ${response.body}` });
            return [];
        }

        let body;
        try {
            body = JSON.parse(response.body);
        } catch (e) {
            log.error({ title: 'CTC Fetch Sentences — JSON parse', details: (e && e.message) || String(e) });
            return [];
        }
        return body.sentences || [];
    };

    const formatTranscript = (sentences) => {
        return sentences.map((s) => {
            const speaker = s.media_channel === 1 ? '[REP]' : '[CUSTOMER]';
            return `${speaker} ${s.transcript}`;
        }).join('\n');
    };

    // Sprint 2c — analyzeTranscript now delegates to lib/ctc_llm_analysis.
    // The new module owns the HIGH-3 try/catch + quota guard, plus the
    // fallback-shape merge so downstream field writes never see undefined.
    const analyzeTranscript = llmAnalysis.analyzeTranscript;

    /**
     * Spawn one customrecord_ctc_proposed_task per non-empty action item.
     * Called from inside writePhoneCallEnrichmentFields so both LLM-callers
     * (RESTlet checkTranscript + Scheduled Script poll) get this for free.
     * Failures here never block enrichment — wrapped in try/catch at the call site.
     *
     * @param {string|number} phoneCallId - the source Phone Call internal ID
     * @param {Object} analysis - LLM output (expects analysis.action_items[] array)
     * @returns {Array<number>} IDs of created proposed_task records
     */
    const createProposedTasksFromAnalysis = (phoneCallId, analysis) => {
        const items = (analysis && analysis.action_items) || [];
        if (!Array.isArray(items) || !items.length) return [];
        const due = new Date();
        due.setDate(due.getDate() + 3);
        // Filter for non-empty STRING entries — guards against LLM returning
        // object-shaped items like {task:'x', due:'y'} which String()'d become '[object Object]'.
        return items.filter((t) => typeof t === 'string' && t.trim()).map((text) => {
            const rec = record.create({ type: 'customrecord_ctc_proposed_task' });
            rec.setValue({ fieldId: 'custrecord_ctc_pt_phone_call', value: phoneCallId });
            rec.setValue({ fieldId: 'custrecord_ctc_pt_text', value: String(text).trim() });
            rec.setText({ fieldId: 'custrecord_ctc_pt_status', text: 'Pending' });
            rec.setValue({ fieldId: 'custrecord_ctc_pt_proposed_due', value: due });
            return rec.save({ ignoreMandatoryFields: true });
        });
    };

    /**
     * Write enrichment fields onto a Phone Call record. Single source of truth so
     * the RESTlet checkTranscript action and the Scheduled Script retry both end
     * up with identical field sets. Caller is responsible for record.load() and .save().
     *
     * Also spawns customrecord_ctc_proposed_task rows from analysis.action_items
     * (unless opts.createProposedTasks === false). Failures in task creation never
     * block the core enrichment write.
     *
     * @param {Object} phoneCallRec - record object already loaded via record.load()
     * @param {Object} opts
     * @param {Object} opts.recording - Twilio Recording resource ({ sid, duration })
     * @param {string} opts.accountSid - Twilio Account SID (used to build recording URL)
     * @param {string} opts.transcriptText - formatted "[REP] ..." conversation text
     * @param {Object} opts.analysis - LLM output ({ title, brief, summary,
     *                                  satisfaction_score, tone_keywords, action_items })
     * @param {boolean} [opts.includeBrief=false] - whether to set custevent_ctc_ai_brief
     *                                              (Scheduled Script path does, RESTlet path historically didn't)
     * @param {boolean} [opts.includeDuration=false] - whether to set custevent_ctc_duration
     *                                                 from recording.duration (Scheduled Script path does)
     * @param {boolean} [opts.createProposedTasks=true] - whether to spawn proposed_task rows
     *                                                   from analysis.action_items
     * @param {string|number} [opts.phoneCallId] - fallback if phoneCallRec.id is not available
     */
    const writePhoneCallEnrichmentFields = (phoneCallRec, opts) => {
        const recording = opts.recording || {};
        const analysis = opts.analysis || {};

        let title = (analysis.title || '').substring(0, 80);
        if (!title) {
            const firstClause = (analysis.summary || '').split(/[.!?]/)[0] || '';
            title = firstClause.substring(0, 60) || `Call — ${recording.sid}`;
        }

        phoneCallRec.setValue({ fieldId: 'title', value: title });
        phoneCallRec.setValue({ fieldId: 'custevent_ctc_recording_sid', value: recording.sid });
        phoneCallRec.setValue({ fieldId: 'custevent_ctc_recording_url',
            value: `${TWILIO_API_BASE}/${opts.accountSid}/Recordings/${recording.sid}.mp3` });
        if (opts.includeDuration && recording.duration != null) {
            phoneCallRec.setValue({ fieldId: 'custevent_ctc_duration', value: parseInt(recording.duration, 10) });
        }
        phoneCallRec.setValue({ fieldId: 'custevent_ctc_transcript', value: opts.transcriptText || '' });
        phoneCallRec.setValue({ fieldId: 'custevent_ctc_ai_summary', value: analysis.summary || '' });
        phoneCallRec.setValue({ fieldId: 'custevent_ctc_satisfaction', value: analysis.satisfaction_score || 5 });
        phoneCallRec.setValue({ fieldId: 'custevent_ctc_tone_keywords', value: (analysis.tone_keywords || []).join(', ') });
        phoneCallRec.setValue({ fieldId: 'custevent_ctc_action_items', value: (analysis.action_items || []).join('\n') });
        if (opts.includeBrief) {
            phoneCallRec.setValue({ fieldId: 'custevent_ctc_ai_brief', value: (analysis.brief || analysis.summary || '').substring(0, 120) });
        }
        phoneCallRec.setValue({ fieldId: 'custevent_ctc_processed', value: true });
        phoneCallRec.setValue({ fieldId: 'custevent_ctc_call_status', value: CALL_STATUS.TRANSCRIBED });

        if (opts.createProposedTasks !== false) {
            try {
                const callId = phoneCallRec.id || opts.phoneCallId;
                if (callId) {
                    createProposedTasksFromAnalysis(callId, analysis);
                }
            } catch (e) {
                log.error({ title: 'CTC Proposed Task Creation Failed', details: e.toString() });
            }
        }
    };

    const deleteRecording = (accountSid, recordingSid, authHeader) => {
        const url = `${TWILIO_API_BASE}/${accountSid}/Recordings/${recordingSid}.json`;

        let response;
        try {
            response = https.delete({ url, headers: { Authorization: authHeader }, timeout: HTTPS_TIMEOUT_MS });
        } catch (e) {
            log.error({ title: 'CTC Delete Recording — network error', details: (e && e.message) || String(e) });
            return;
        }

        if (response.code !== 204 && response.code !== 200) {
            log.error({ title: 'CTC Delete Recording Failed', details: `HTTP ${response.code}: ${response.body}` });
        }
    };

    return {
        TWILIO_API_BASE,
        TWILIO_INTEL_BASE,
        ANALYSIS_PROMPT_PREFIX,
        CALL_STATUS,
        RECORDING_TERMINAL_STATUSES,
        TRANSCRIPT_TERMINAL_STATUSES,
        TRANSIENT_ERROR,
        isTransientError,
        isRecordingTerminal,
        isTranscriptTerminal,
        isTranscriptComplete,
        fetchRecordingForCall,
        fetchTranscript,
        fetchSentences,
        formatTranscript,
        analyzeTranscript,
        createProposedTasksFromAnalysis,
        writePhoneCallEnrichmentFields,
        deleteRecording
    };
});
