// @ts-check
/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Shared transcript enrichment utilities used by both the Scheduled Script
 * and the RESTlet checkTranscript action.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/https', 'N/llm', 'N/log', 'N/record'], (https, llm, log, record) => {

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

    const isRecordingTerminal = (recording) => {
        return !!(recording && RECORDING_TERMINAL_STATUSES.indexOf(recording.status) !== -1);
    };

    const isTranscriptTerminal = (transcript) => {
        return !!(transcript && TRANSCRIPT_TERMINAL_STATUSES.indexOf(transcript.status) !== -1);
    };

    const isTranscriptComplete = (transcript) => {
        return !!(transcript && transcript.status === 'completed');
    };

    const ANALYSIS_PROMPT_PREFIX = `You are a sales call analyst. Analyze this call transcript and return ONLY valid JSON — no markdown, no explanation, no code fences.

{
  "title": "Brief headline (NOT a full sentence), max 60 chars (e.g. 'Product demo — strong buying signals', 'Pricing objection — needs manager approval')",
  "brief": "Action-oriented one-liner under 100 chars — what happened and what's next. Examples: 'Demo went well, sending pricing Tuesday', 'Quote rejected on price, no follow-up', 'Tech issue — escalated to support'. Avoid generic phrasing like 'Discussed product'.",
  "summary": "2-3 sentence summary of call purpose, key points, and outcome",
  "satisfaction_score": <integer 1-10>,
  "tone_keywords": ["keyword1", "keyword2", "keyword3"],
  "action_items": ["item1", "item2"]
}

SCORING GUIDE:
- 1-3: Hostile, complaint, churn risk, unresolved issues
- 4-5: Neutral, informational, no clear engagement
- 6-7: Positive, engaged, follow-up likely
- 8-10: Highly positive, strong buying signals, deal progression

TRANSCRIPT:
`;

    const fetchRecordingForCall = (accountSid, callSid, authHeader) => {
        const url = `${TWILIO_API_BASE}/${accountSid}/Calls/${callSid}/Recordings.json`;

        const response = https.get({
            url: url,
            headers: { Authorization: authHeader }
        });

        if (response.code !== 200) {
            log.error({ title: 'CTC Fetch Call Recordings Failed', details: `HTTP ${response.code}: ${response.body}` });
            return null;
        }

        const body = JSON.parse(response.body);
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

        const response = https.get({
            url: url,
            headers: { Authorization: authHeader }
        });

        if (response.code !== 200) {
            log.error({ title: 'CTC Fetch Transcript Failed', details: `HTTP ${response.code}: ${response.body}` });
            return null;
        }

        const body = JSON.parse(response.body);
        const transcripts = body.transcripts || [];
        return transcripts.length ? transcripts[0] : null;
    };

    const fetchSentences = (transcriptSid, authHeader) => {
        const url = `${TWILIO_INTEL_BASE}/Transcripts/${transcriptSid}/Sentences`;

        const response = https.get({
            url: url,
            headers: { Authorization: authHeader }
        });

        if (response.code !== 200) {
            log.error({ title: 'CTC Fetch Sentences Failed', details: `HTTP ${response.code}: ${response.body}` });
            return [];
        }

        const body = JSON.parse(response.body);
        return body.sentences || [];
    };

    const formatTranscript = (sentences) => {
        return sentences.map((s) => {
            const speaker = s.media_channel === 1 ? '[REP]' : '[CUSTOMER]';
            return `${speaker} ${s.transcript}`;
        }).join('\n');
    };

    const analyzeTranscript = (transcriptText) => {
        const response = llm.generateText({
            prompt: ANALYSIS_PROMPT_PREFIX + transcriptText,
            modelFamily: llm.ModelFamily.COHERE_COMMAND,
            modelParameters: {
                temperature: 0.2,
                maxTokens: 800
            }
        });

        let text = response.text
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();

        try {
            return JSON.parse(text);
        } catch (e) {
            log.audit({ title: 'CTC LLM JSON Parse Failed', details: text });
            return {
                summary: response.text.substring(0, 500),
                satisfaction_score: 5,
                tone_keywords: [],
                action_items: []
            };
        }
    };

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

        const response = https.delete({
            url: url,
            headers: { Authorization: authHeader }
        });

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
