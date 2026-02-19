/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 *
 * Polls Twilio for completed call recordings, fetches transcripts
 * via Conversational Intelligence, runs AI analysis with N/llm,
 * creates Phone Call activity records, and deletes processed recordings.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/https', 'N/record', 'N/search', 'N/llm', 'N/encode', 'N/log'], (https, record, search, llm, encode, log) => {

    const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01/Accounts';
    const TWILIO_INTEL_BASE = 'https://intelligence.twilio.com/v2';
    const POLL_WINDOW_MINUTES = 30;

    const loadConfig = () => {
        const results = search.create({
            type: 'customrecord_ctc_config',
            filters: [['isinactive', 'is', 'F']],
            columns: [
                'custrecord_ctc_account_sid',
                'custrecord_ctc_auth_token',
                'custrecord_ctc_twiml_app_sid',
                'custrecord_ctc_phone_number',
                'custrecord_ctc_intel_service_sid'
            ]
        }).run().getRange({ start: 0, end: 1 });

        if (!results.length) {
            throw new Error('CTC config record not found or inactive');
        }

        const r = results[0];
        return {
            accountSid:      r.getValue('custrecord_ctc_account_sid'),
            authToken:       r.getValue('custrecord_ctc_auth_token'),
            twimlAppSid:     r.getValue('custrecord_ctc_twiml_app_sid'),
            phoneNumber:     r.getValue('custrecord_ctc_phone_number'),
            intelServiceSid: r.getValue('custrecord_ctc_intel_service_sid')
        };
    };

    const buildAuthHeader = (accountSid, authToken) => {
        const encoded = encode.convert({
            string: accountSid + ':' + authToken,
            inputEncoding: encode.Encoding.UTF_8,
            outputEncoding: encode.Encoding.BASE_64
        });
        return 'Basic ' + encoded;
    };

    const getDateFilter = () => {
        const now = new Date();
        now.setMinutes(now.getMinutes() - POLL_WINDOW_MINUTES);
        return now.toISOString().replace(/\.\d{3}Z$/, 'Z');
    };

    const fetchRecentRecordings = (config, authHeader) => {
        const dateFilter = getDateFilter();
        const url = `${TWILIO_API_BASE}/${config.accountSid}/Recordings.json?DateCreated%3E=${encodeURIComponent(dateFilter)}&PageSize=50`;

        const response = https.get({
            url: url,
            headers: { Authorization: authHeader }
        });

        if (response.code !== 200) {
            log.error({ title: 'CTC Fetch Recordings Failed', details: `HTTP ${response.code}: ${response.body}` });
            return [];
        }

        const body = JSON.parse(response.body);
        return body.recordings || [];
    };

    const isDuplicate = (recordingSid) => {
        const results = search.create({
            type: search.Type.PHONE_CALL,
            filters: [['custevent_ctc_recording_sid', 'is', recordingSid]],
            columns: ['internalid']
        }).run().getRange({ start: 0, end: 1 });

        return results.length > 0;
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

    const ANALYSIS_PROMPT_PREFIX = `You are a sales call analyst. Analyze this call transcript and return ONLY valid JSON — no markdown, no explanation, no code fences.

{
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

    const createPhoneCallRecord = (recording, config, transcriptText, analysis) => {
        const phoneCall = record.create({ type: record.Type.PHONE_CALL, isDynamic: true });

        const title = (analysis.summary || '').substring(0, 80) || `Call — ${recording.sid}`;
        phoneCall.setValue({ fieldId: 'title', value: title });
        phoneCall.setValue({ fieldId: 'status', value: 'COMPLETE' });
        phoneCall.setValue({ fieldId: 'message', value: transcriptText });
        phoneCall.setValue({ fieldId: 'custevent_ctc_recording_sid', value: recording.sid });
        phoneCall.setValue({ fieldId: 'custevent_ctc_recording_url',
            value: `${TWILIO_API_BASE}/${config.accountSid}/Recordings/${recording.sid}.mp3` });
        phoneCall.setValue({ fieldId: 'custevent_ctc_duration', value: parseInt(recording.duration, 10) });
        phoneCall.setValue({ fieldId: 'custevent_ctc_transcript', value: transcriptText });
        phoneCall.setValue({ fieldId: 'custevent_ctc_ai_summary', value: analysis.summary || '' });
        phoneCall.setValue({ fieldId: 'custevent_ctc_satisfaction', value: analysis.satisfaction_score || 5 });
        phoneCall.setValue({ fieldId: 'custevent_ctc_tone_keywords', value: (analysis.tone_keywords || []).join(', ') });
        phoneCall.setValue({ fieldId: 'custevent_ctc_action_items', value: (analysis.action_items || []).join('\n') });
        phoneCall.setValue({ fieldId: 'custevent_ctc_processed', value: true });

        return phoneCall.save();
    };

    const deleteRecording = (config, recordingSid, authHeader) => {
        const url = `${TWILIO_API_BASE}/${config.accountSid}/Recordings/${recordingSid}.json`;

        const response = https.delete({
            url: url,
            headers: { Authorization: authHeader }
        });

        if (response.code !== 204 && response.code !== 200) {
            log.error({ title: 'CTC Delete Recording Failed', details: `HTTP ${response.code}: ${response.body}` });
        }
    };

    const execute = () => {
        let processed = 0;
        let skipped = 0;
        let errors = 0;

        try {
            const config = loadConfig();
            const authHeader = buildAuthHeader(config.accountSid, config.authToken);
            const hasLlmQuota = llm.getRemainingFreeUsage() >= 10;

            if (!hasLlmQuota) {
                log.audit({ title: 'CTC LLM Quota Low', details: 'AI analysis will be skipped this cycle' });
            }

            const recordings = fetchRecentRecordings(config, authHeader);

            for (const recording of recordings) {
                try {
                    if (isDuplicate(recording.sid)) {
                        skipped++;
                        continue;
                    }

                    const transcript = fetchTranscript(recording.sid, authHeader);
                    if (!transcript) {
                        skipped++;
                        continue;
                    }

                    const sentences = fetchSentences(transcript.sid, authHeader);
                    const transcriptText = formatTranscript(sentences);

                    let analysis = {
                        summary: '',
                        satisfaction_score: 5,
                        tone_keywords: [],
                        action_items: []
                    };

                    if (hasLlmQuota && transcriptText) {
                        analysis = analyzeTranscript(transcriptText);
                    }

                    createPhoneCallRecord(recording, config, transcriptText, analysis);
                    deleteRecording(config, recording.sid, authHeader);
                    processed++;
                } catch (e) {
                    log.error({ title: 'CTC Recording Processing Error', details: `${recording.sid}: ${e.message || e}` });
                    errors++;
                }
            }
        } catch (e) {
            log.error({ title: 'CTC Poll Execute Error', details: e.message || e });
        }

        log.audit({ title: 'CTC Poll Complete', details: `Processed: ${processed}, Skipped: ${skipped}, Errors: ${errors}` });
    };

    return { execute };
});
