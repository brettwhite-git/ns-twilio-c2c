// @ts-check
/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * LLM-driven sales call analysis.
 *
 * EXTRACTED from lib/ctc_transcript_utils.js (Sprint 2c, 2026-05-21) so the
 * prompt template, model parameters, and post-processing are first-class
 * tunable surfaces instead of being buried inside the transcript-enrichment
 * pipeline.
 *
 * Three concerns owned by this module:
 *
 *   1. PROMPT TEMPLATE — the natural-language instructions sent to the
 *      LLM. Exported as ANALYSIS_PROMPT_PREFIX. Defines the output JSON
 *      shape (title, brief, summary, satisfaction_score, tone_keywords,
 *      action_items), the 1-10 satisfaction scoring guide, and conventions
 *      for tone keywords + action items. buildAnalysisPrompt puts a date
 *      reference line in front of it ("Today is <Weekday, YYYY-MM-DD>
 *      (<time zone>). The call took place on <Weekday, YYYY-MM-DD>.") so
 *      the model can turn "next Tuesday" into a date. action_items are
 *      objects {"task": string, "due_date": "YYYY-MM-DD" | null}; plain
 *      strings are still accepted downstream (back-compat).
 *
 *   2. MODEL PARAMETERS — modelFamily + temperature + maxTokens.
 *      Exported as DEFAULT_MODEL_PARAMS so callers can override per-call
 *      (A/B testing or per-account customization) without forking the
 *      analysis function itself.
 *
 *   3. POST-PROCESSING — strips markdown code fences from the response,
 *      parses JSON, validates against the expected schema by merging into
 *      FALLBACK_ANALYSIS, and never throws — downstream consumers always
 *      receive a valid AnalysisResult shape.
 *
 * Sprint 2c (SAFE review HIGH-3) — wraps llm.generateText in try/catch.
 * Quota-exhausted, model-unavailable, or request-too-large all return the
 * fallback shape so the transcript text is still written to the Phone Call
 * record and the rep sees the raw conversation. Without this guard, an
 * uncaught LLM exception terminated the per-call processing path and the
 * transcript was permanently lost (FAILED is a terminal call_status).
 *
 * Tuning workflow:
 *   - Change prompt wording or scoring guide  → edit ANALYSIS_PROMPT_PREFIX
 *   - Swap LLM model family                   → edit DEFAULT_MODEL_PARAMS.modelFamily
 *   - Tighten / loosen creativity             → edit DEFAULT_MODEL_PARAMS.modelParameters.temperature
 *   - Add a new field to the analysis output  → update the prompt's JSON
 *     schema block AND extend FALLBACK_ANALYSIS AND update
 *     writePhoneCallEnrichmentFields in lib/ctc_transcript_utils.js
 *
 * Future considerations:
 *   - If we ever want admins to A/B prompts WITHOUT a redeploy, the prompt
 *     and model params could move into the customrecord_ctc_config singleton
 *     as CLOBTEXT fields with the in-source values acting as fallback.
 *   - Per-call logging of prompt + response would let us build an eval
 *     dataset for tuning. Currently we log only the fallbacks (log.error
 *     "CTC LLM quota below reserve" / "CTC LLM call failed" / "CTC LLM
 *     JSON Parse Failed", with the Phone Call id). Wider logging is
 *     deferred until we have production volume.
 *   - Per-account model selection (Cohere vs. Anthropic vs. OpenAI via
 *     N/llm 2026.1's expanded model catalog) could become a config knob
 *     after we benchmark output quality on the same eval set.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/llm', 'N/log'], (llm, log) => {

    /**
     * Prompt template prepended to the transcript text. The output JSON
     * shape declared here MUST match FALLBACK_ANALYSIS below and the field
     * writers in lib/ctc_transcript_utils.js#writePhoneCallEnrichmentFields.
     * buildAnalysisPrompt puts the date reference line (buildDateLine) in
     * front of it; "the CALL DATE given above" refers to that line.
     *
     * Embedded in source (not config record) so it ships with the SAFE-
     * reviewed bundle and cannot be misconfigured at runtime. See module
     * header "Future considerations" for the path to admin-editable prompts.
     */
    const ANALYSIS_PROMPT_PREFIX = `You are a sales call analyst. Analyze this call transcript and return ONLY valid JSON - no markdown, no explanation, no code fences.

{
  "title": "Brief headline (NOT a full sentence), max 60 chars (e.g. 'Product demo - strong buying signals', 'Pricing objection - needs manager approval')",
  "brief": "Action-oriented one-liner under 100 chars - what happened and what's next. Examples: 'Demo went well, sending pricing Tuesday', 'Quote rejected on price, no follow-up', 'Tech issue - escalated to support'. Avoid generic phrasing like 'Discussed product'.",
  "summary": "2-3 sentence summary of call purpose, key points, and outcome",
  "satisfaction_score": <integer 1-10>,
  "tone_keywords": ["keyword1", "keyword2", "keyword3"],
  "action_items": [{"task": "Short follow-up the rep must do", "due_date": "YYYY-MM-DD or null"}]
}

SCORING GUIDE:
- 1-3: Hostile, complaint, churn risk, unresolved issues
- 4-5: Neutral, informational, no clear engagement
- 6-7: Positive, engaged, follow-up likely
- 8-10: Highly positive, strong buying signals, deal progression

ACTION ITEMS:
- One object per follow-up: "task" is a short instruction, "due_date" is a date as YYYY-MM-DD or null.
- Resolve relative timing ("tomorrow", "next Tuesday", "end of week", "in two weeks") against the CALL DATE given above, not against today.
- Use null when the call gives no timing for that item. Do not guess a date.

TRANSCRIPT:
`;

    const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const ISO_DATE = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;

    /**
     * 'YYYY-MM-DD' that is a real calendar date → its weekday name, else ''.
     * @param {*} iso
     * @returns {string}
     */
    const weekdayOf = (iso) => {
        const m = ISO_DATE.exec(typeof iso === 'string' ? iso : '');
        if (!m) return '';
        const y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
        const dt = new Date(Date.UTC(y, mo - 1, d));
        if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return '';
        return WEEKDAYS[dt.getUTCDay()];
    };

    const serverToday = () => {
        const d = new Date();
        const p2 = (n) => (n < 10 ? '0' : '') + n;
        return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
    };

    /**
     * The date reference line that goes in front of the prompt:
     * "Today is Sunday, 2026-11-01 (America/Los_Angeles). The call took
     * place on Saturday, 2026-10-31." A missing or invalid `today` uses the
     * server clock; a missing or invalid `callDate` uses today; the time
     * zone part is left out when unknown.
     * @param {{today?: string, callDate?: string, timezone?: string}} [context]
     * @returns {string}
     */
    const buildDateLine = (context) => {
        const c = context || {};
        const today = weekdayOf(c.today) ? c.today : serverToday();
        const callDate = weekdayOf(c.callDate) ? c.callDate : today;
        const tz = typeof c.timezone === 'string' ? c.timezone.trim() : '';
        return 'Today is ' + weekdayOf(today) + ', ' + today + (tz ? ' (' + tz + ')' : '') + '. ' +
            'The call took place on ' + weekdayOf(callDate) + ', ' + callDate + '.';
    };

    // The stored transcript carries sentence times ("[REP 12.4-15.9] …"); the
    // model reads the plain "[REP] …" form, as before the times were kept.
    const withoutTimes = (text) => String(text || '').replace(/^\[(REP|CUSTOMER) [0-9.]+-[0-9.]+\]/gm, '[$1]');
    /**
     * Full prompt: date reference line, instructions, transcript.
     * @param {string} transcriptText
     * @param {{today?: string, callDate?: string, timezone?: string}} [context]
     * @returns {string}
     */
    const buildAnalysisPrompt = (transcriptText, context) =>
        buildDateLine(context) + '\n\n' + ANALYSIS_PROMPT_PREFIX + withoutTimes(transcriptText);

    /**
     * Default LLM parameters.
     *
     * Tuning notes:
     *   - temperature: 0.2 = conservative, repeatable. Raise to 0.4 for
     *     more varied phrasing. Avoid > 0.6 — satisfaction scores drift.
     *   - maxTokens: 800 covers ~6 paragraphs of summary + 5 action items.
     *     N/llm returns a hard error if the response exceeds; budget
     *     generously.
     *   - modelFamily: must be one of the account's llm.ModelFamily
     *     string values (for example 'cohere.command-a-03-2025').
     *     NetSuite now rejects the old enum names such as
     *     'COHERE_COMMAND' with INVALID_MODEL_FAMILY_VALUE (live RESTlet
     *     log, 2026-10-30). The error message lists the values the
     *     account accepts. We use Cohere Command A.
     *
     * NetSuite gotcha (2026-05-27 deploy failure): accessing
     * `llm.ModelFamily.*` at module top-level inside the define() body
     * throws SUITESCRIPT_API_UNAVAILABLE_IN_DEFINE during SDF deploy-time
     * validation. Fix: inline the string value (the enum is just a string
     * constant — same pattern we use for Twilio codec strings
     * 'opus'/'pcmu' per CLAUDE.md).
     */
    const DEFAULT_MODEL_PARAMS = {
        modelFamily: 'cohere.command-a-03-2025',  // Cohere Command A
        modelParameters: { temperature: 0.2, maxTokens: 800 }
    };

    /**
     * Fallback shape for the parsed LLM output. Returned whenever the LLM
     * call fails, quota is exhausted, or the response can't be parsed.
     * Downstream consumers see neutral satisfaction + empty fields and
     * degrade gracefully (no AI summary stored, no proposed tasks spawned).
     *
     * @typedef {Object} AnalysisResult
     * @property {string} title - max 60 chars
     * @property {string} brief - max 100 chars, action-oriented
     * @property {string} summary - 2-3 sentence summary
     * @property {number} satisfaction_score - 1-10
     * @property {Array<string>} tone_keywords
     * @property {Array<{task: string, due_date: (string|null)}|string>} action_items
     *   objects from the current prompt; plain strings from older output
     */
    const FALLBACK_ANALYSIS = Object.freeze({
        title: '',
        brief: '',
        summary: '',
        satisfaction_score: 5,
        tone_keywords: [],
        action_items: []
    });

    /**
     * Minimum remaining free-tier credit before we attempt the LLM call.
     * Cohere's free tier gives ~1000 requests/month; the reserve buffer
     * stops a single scheduled-poller cycle from exhausting quota when a
     * burst of calls land.
     */
    const QUOTA_RESERVE_THRESHOLD = 10;

    /** A finite number, else null. */
    const usageNumber = (v) => {
        if (v === null || v === undefined || v === '') return null;
        const n = Number(v);
        return isFinite(n) ? n : null;
    };

    /**
     * Remaining N/llm usage (requests left in the current period), or null
     * when the runtime cannot tell. NetSuite 2026.2 deprecates
     * llm.getRemainingFreeUsage() for llm.getRemainingUsage(): use the new
     * function when it exists and gives a number, else the old one. Oracle
     * publishes no pool size, so there is no "of N".
     * Throws only when the old function throws (callers catch).
     * @returns {number|null}
     */
    const remainingUsage = () => {
        if (typeof llm.getRemainingUsage === 'function') {
            try {
                const n = usageNumber(llm.getRemainingUsage());
                if (n !== null) return n;
            } catch (e) {
                log.error({ title: 'CTC LLM getRemainingUsage failed; trying getRemainingFreeUsage',
                            details: (e && e.message) || String(e) });
            }
        }
        if (typeof llm.getRemainingFreeUsage === 'function') {
            return usageNumber(llm.getRemainingFreeUsage());
        }
        return null;
    };

    /**
     * @returns {boolean} true if remaining quota is above the reserve
     */
    const hasQuota = () => {
        try {
            const n = remainingUsage();
            return n !== null && n >= QUOTA_RESERVE_THRESHOLD;
        } catch (e) {
            log.error({ title: 'CTC LLM quota check failed', details: (e && e.message) || String(e) });
            return false;
        }
    };

    /**
     * Send the transcript to the LLM and parse the JSON response into an
     * AnalysisResult. NEVER throws — downstream consumers always receive
     * a valid AnalysisResult shape (success or fallback).
     *
     * HIGH-3 guard: wraps llm.generateText in try/catch. Quota-exhausted,
     * model-unavailable, request-too-large, etc. all return the fallback
     * shape rather than letting the exception bubble up to the per-call
     * catch in the scheduled poller (which would mark the call FAILED and
     * permanently lose the transcript).
     *
     * Every fallback is logged with log.error: the reason (quota, the
     * error name and message, or the JSON parse failure) and the Phone
     * Call id from `context.phoneCallId`.
     *
     * @param {string} transcriptText - formatted "[REP] ...\n[CUSTOMER] ..." text
     * @param {{modelFamily?: any, modelParameters?: Object}|null} [opts] - override defaults
     * @param {{today?: string, callDate?: string, timezone?: string, phoneCallId?: (string|number)}} [context]
     *   dates for the reference line (lib/ctc_time.analysisDates) and the
     *   Phone Call id for the logs
     * @returns {AnalysisResult}
     */
    const analyzeTranscript = (transcriptText, opts, context) => {
        const callRef = 'phoneCall=' + ((context && context.phoneCallId) || 'unknown');
        if (!hasQuota()) {
            log.error({
                title: 'CTC LLM quota below reserve',
                details: callRef + ' reason=quota — returning fallback analysis; transcript text still saved'
            });
            return Object.assign({}, FALLBACK_ANALYSIS);
        }

        const params = Object.assign({}, DEFAULT_MODEL_PARAMS, opts || {});

        let response;
        try {
            response = llm.generateText({
                prompt: buildAnalysisPrompt(transcriptText, context),
                modelFamily: params.modelFamily,
                modelParameters: params.modelParameters
            });
        } catch (e) {
            log.error({
                title: 'CTC LLM call failed',
                details: callRef + ' reason=llm_error name=' + (e && e.name) +
                         ' message=' + ((e && e.message) || String(e))
            });
            return Object.assign({}, FALLBACK_ANALYSIS);
        }

        const rawText = (response && response.text) || '';
        const cleaned = rawText
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();

        let parsed;
        let parseError = '';
        try {
            parsed = JSON.parse(cleaned);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) parseError = 'not a JSON object';
        } catch (e) {
            parseError = (e && e.message) || String(e);
        }
        if (parseError) {
            log.error({
                title: 'CTC LLM JSON Parse Failed',
                details: callRef + ' reason=json_parse error=' + parseError + ' text=' + cleaned.substring(0, 500)
            });
            return Object.assign({}, FALLBACK_ANALYSIS, {
                summary: rawText.substring(0, 500)
            });
        }
        // Merge into fallback so missing keys default to neutral
        // rather than undefined. The N/record field writes downstream
        // call .substring() / .join() on these so undefined would crash.
        return Object.assign({}, FALLBACK_ANALYSIS, parsed);
    };

    return {
        ANALYSIS_PROMPT_PREFIX,
        DEFAULT_MODEL_PARAMS,
        FALLBACK_ANALYSIS,
        QUOTA_RESERVE_THRESHOLD,
        remainingUsage,
        hasQuota,
        buildDateLine,
        buildAnalysisPrompt,
        analyzeTranscript
    };
});
