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
 *      for tone keywords + action items.
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
 *     dataset for tuning. Currently we log only on parse failure
 *     (log.audit "CTC LLM JSON Parse Failed"). Wider logging is deferred
 *     until we have production volume.
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
  "action_items": ["item1", "item2"]
}

SCORING GUIDE:
- 1-3: Hostile, complaint, churn risk, unresolved issues
- 4-5: Neutral, informational, no clear engagement
- 6-7: Positive, engaged, follow-up likely
- 8-10: Highly positive, strong buying signals, deal progression

TRANSCRIPT:
`;

    /**
     * Default LLM parameters.
     *
     * Tuning notes:
     *   - temperature: 0.2 = conservative, repeatable. Raise to 0.4 for
     *     more varied phrasing. Avoid > 0.6 — satisfaction scores drift.
     *   - maxTokens: 800 covers ~6 paragraphs of summary + 5 action items.
     *     N/llm returns a hard error if the response exceeds; budget
     *     generously.
     *   - modelFamily: COHERE_COMMAND is NetSuite's default free-tier
     *     choice (verified 2026 release notes). COHERE_COMMAND_LIGHT is
     *     faster + cheaper but produces shorter, less nuanced summaries.
     *
     * NetSuite gotcha (2026-05-27 deploy failure): accessing
     * `llm.ModelFamily.COHERE_COMMAND` at module top-level inside the
     * define() body throws SUITESCRIPT_API_UNAVAILABLE_IN_DEFINE during
     * SDF deploy-time validation. Same parser-quirk family as accessing
     * any N/* module member at module-load time. Fix: inline the string
     * literal value (the enum is just a string constant — same pattern
     * we use for Twilio codec strings 'opus'/'pcmu' per CLAUDE.md).
     */
    const DEFAULT_MODEL_PARAMS = {
        modelFamily: 'COHERE_COMMAND',  // === llm.ModelFamily.COHERE_COMMAND
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
     * @property {Array<string>} action_items
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

    /**
     * @returns {boolean} true if remaining quota is above the reserve
     */
    const hasQuota = () => {
        try {
            return llm.getRemainingFreeUsage() >= QUOTA_RESERVE_THRESHOLD;
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
     * @param {string} transcriptText - formatted "[REP] ...\n[CUSTOMER] ..." text
     * @param {{modelFamily?: any, modelParameters?: Object}} [opts] - override defaults
     * @returns {AnalysisResult}
     */
    const analyzeTranscript = (transcriptText, opts) => {
        if (!hasQuota()) {
            log.audit({
                title: 'CTC LLM quota below reserve',
                details: 'Returning fallback analysis; transcript text still saved'
            });
            return Object.assign({}, FALLBACK_ANALYSIS);
        }

        const params = Object.assign({}, DEFAULT_MODEL_PARAMS, opts || {});

        let response;
        try {
            response = llm.generateText({
                prompt: ANALYSIS_PROMPT_PREFIX + transcriptText,
                modelFamily: params.modelFamily,
                modelParameters: params.modelParameters
            });
        } catch (e) {
            log.error({
                title: 'CTC LLM call failed',
                details: 'name=' + (e && e.name) +
                         ' message=' + ((e && e.message) || String(e))
            });
            return Object.assign({}, FALLBACK_ANALYSIS);
        }

        const rawText = (response && response.text) || '';
        const cleaned = rawText
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();

        try {
            const parsed = JSON.parse(cleaned);
            // Merge into fallback so missing keys default to neutral
            // rather than undefined. The N/record field writes downstream
            // call .substring() / .join() on these so undefined would crash.
            return Object.assign({}, FALLBACK_ANALYSIS, parsed);
        } catch (e) {
            log.audit({ title: 'CTC LLM JSON Parse Failed', details: cleaned.substring(0, 500) });
            return Object.assign({}, FALLBACK_ANALYSIS, {
                summary: rawText.substring(0, 500)
            });
        }
    };

    return {
        ANALYSIS_PROMPT_PREFIX,
        DEFAULT_MODEL_PARAMS,
        FALLBACK_ANALYSIS,
        QUOTA_RESERVE_THRESHOLD,
        hasQuota,
        analyzeTranscript
    };
});
