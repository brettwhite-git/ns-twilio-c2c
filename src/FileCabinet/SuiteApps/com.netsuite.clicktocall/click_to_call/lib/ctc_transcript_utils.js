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

    const ANALYSIS_PROMPT_PREFIX = `You are a sales call analyst. Analyze this call transcript and return ONLY valid JSON — no markdown, no explanation, no code fences.

{
  "title": "Short headline for this call, max 60 chars (e.g. 'Product demo — strong buying signals')",
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

        if (!transcripts.length || transcripts[0].status !== 'completed') {
            return null;
        }

        return transcripts[0];
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
        fetchRecordingForCall,
        fetchTranscript,
        fetchSentences,
        formatTranscript,
        analyzeTranscript,
        deleteRecording
    };
});
