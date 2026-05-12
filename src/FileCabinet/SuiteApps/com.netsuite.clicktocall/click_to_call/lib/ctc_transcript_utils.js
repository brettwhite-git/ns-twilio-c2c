/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Shared transcript enrichment utilities used by both the Scheduled Script
 * and the RESTlet checkTranscript action.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/https', 'N/llm', 'N/log'], (https, llm, log) => {

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
  "brief": "One-sentence summary, max 120 chars, suitable for a list view column",
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
        deleteRecording
    };
});
