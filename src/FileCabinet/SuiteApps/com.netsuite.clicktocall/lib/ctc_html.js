// @ts-check
/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Shared HTML/JS escape helpers for Suitelet HTML rendering and
 * inline-script injection. Single source of truth for XSS sanitization.
 */
define([], () => {

    /**
     * Escape HTML special characters to prevent XSS when embedding untrusted
     * values inside HTML text content or attribute values.
     * @param {*} str
     * @returns {string}
     */
    const escapeHtml = (str) => {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    /**
     * Escape a value for safe embedding inside a JS single-quoted string literal
     * within a <script> block. Prevents string-break / script-tag-break XSS.
     * @param {*} str
     * @returns {string}
     */
    const escapeJs = (str) => {
        return String(str)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/</g, '\\x3c')
            .replace(/>/g, '\\x3e')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');
    };

    /**
     * JSON.stringify wrapped to be safe inside <script> blocks — escapes `<` to its
     * unicode escape so an entity-name string containing `</script>` cannot terminate
     * the inline script tag and inject executable code.
     * @param {*} val
     * @returns {string} JSON string safe to inline inside a <script> ... </script> block
     */
    const safeJsonEmbed = (val) => JSON.stringify(val).replace(/</g, '\\u003c');

    /**
     * Tell the browser never to cache a Suitelet page (Cache-Control
     * no-store, Pragma no-cache). The phone mode shell and the softphone
     * must always load fresh after a sign-in. A header the runtime refuses
     * never breaks the page.
     * @param {{setHeader: Function}} response - Suitelet context.response
     */
    const setNoStoreHeaders = (response) => {
        [['Cache-Control', 'no-store, max-age=0'], ['Pragma', 'no-cache']].forEach((h) => {
            try {
                response.setHeader({ name: h[0], value: h[1] });
            } catch (e) {
                // Header not allowed or no setHeader: serve the page anyway.
            }
        });
    };

    /**
     * Display form of a phone number. North American numbers (11 digits
     * starting with 1, or 10 digits without a leading +) read
     * "+1 (303) 555-0111" / "(303) 555-0111"; any other number comes back
     * as given. Used by Reporting Central and the portlet (server render).
     * @param {*} raw
     * @returns {string}
     */
    const formatPhone = (raw) => {
        const s = String(raw || '').trim();
        const d = s.replace(/[^0-9]/g, '');
        const nanp = (ten) => '(' + ten.slice(0, 3) + ') ' + ten.slice(3, 6) + '-' + ten.slice(6);
        if (d.length === 11 && d.charAt(0) === '1') return '+1 ' + nanp(d.slice(1));
        if (d.length === 10 && s.charAt(0) !== '+') return nanp(d);
        return s;
    };

    // The same rules as formatPhone, as ES5 source for inline client JS
    // (the portlet's period refresh). No backticks, no dollar-brace, no
    // backslash escapes. Tests keep the two in step.
    const FORMAT_PHONE_JS = "function(raw){var s=String(raw||'').trim();var d=s.replace(/[^0-9]/g,'');" +
        "function n(t){return '('+t.slice(0,3)+') '+t.slice(3,6)+'-'+t.slice(6)}" +
        "if(d.length===11&&d.charAt(0)==='1'){return '+1 '+n(d.slice(1))}" +
        "if(d.length===10&&s.charAt(0)!=='+'){return n(d)}return s}";

    // Call status (custevent_ctc_call_status) -> what a call row shows when
    // there is no AI brief. ONE rule set for the Sales Rep Central portlet
    // (briefOf / lenIsDash / dirKind on the server; shipped as JSON to its
    // client rebuilder) and Reporting Central (unansweredRule, outcomeOf).
    //   text  placeholder text (muted grey unless `chip`)
    //   chip  status chip modifier (portlet ctc-pl-status-<chip>; Reporting
    //         Central's outcome tone: 'missed' -> missed, else quiet)
    //   len   'dash' = Length is always "—"; 'dashZero' = "—" when 0 s
    //   dir   'missed' = a missed call (portlet isMissedCall)
    // A status not listed here shows "—".
    const CALL_STATUS_RULES = {
        'Logged':        { text: 'Summarizing' },
        'Processing':    { text: 'Summarizing' },
        'No transcript': { text: 'No transcript' },
        'Too short':     { text: 'Too short to summarize' },
        'Failed':        { text: 'Summary failed' },
        'Missed':        { text: 'Missed call', chip: 'missed', len: 'dash', dir: 'missed' },
        'No answer':     { text: 'No answer', chip: 'quiet', len: 'dashZero' }
    };

    /**
     * The rule for an unanswered call, else null: status 'Missed' or an
     * inbound call with no talk time -> "Missed call"; status 'No answer' or
     * an outbound call with no talk time -> "No answer". Voicemails are the
     * caller's job to handle first (they read "Voicemail").
     * @param {{callStatus?: string, direction?: string, duration?: number}} row
     * @returns {{text: string, chip?: string}|null}
     */
    const unansweredRule = (row) => {
        const r = row || {};
        if (r.callStatus === 'Missed') return CALL_STATUS_RULES['Missed'];
        if (r.callStatus === 'No answer') return CALL_STATUS_RULES['No answer'];
        if (!(Number(r.duration) > 0)) return CALL_STATUS_RULES[r.direction === 'inbound' ? 'Missed' : 'No answer'];
        return null;
    };

    // A call that ended with "No transcript" and lasted less than this was
    // too short for Twilio to transcribe.
    const SHORT_CALL_SECONDS = 30;

    // Outcome chip colours (Reporting Central Calls table, compact rows).
    const OUTCOME_TONES = {
        ready:     { bg: '#E8F0F8', fg: '#1F3550' },
        followup:  { bg: '#FFF3D6', fg: '#8A5A00' },
        voicemail: { bg: '#FCE9E7', fg: '#9A3A2C' },
        missed:    { bg: '#FCE9E7', fg: '#9A3A2C' },
        quiet:     { bg: '#F1EFEA', fg: '#5C5955' }
    };

    /**
     * What happened on a call, as one chip (Reporting Central). In order:
     * a voicemail reads "Voicemail"; an unanswered call reads the shared
     * unansweredRule words ("Missed call" coral / "No answer" quiet);
     * pending proposed tasks read "Follow-up suggested"; then the status:
     * Logged / Processing → "Summarizing", Too short (or No transcript
     * under SHORT_CALL_SECONDS) → "Too short", Transcribed or an AI brief →
     * "Summary ready", No transcript → "No transcript", Failed →
     * "Summary failed"; anything else "—".
     * `key` names the outcome for data (the dock's Recents and Voicemail
     * rows, RESTlet `outcome`): voicemail, missed, no_answer, follow_up,
     * summarizing, too_short, summary_ready, no_transcript, failed, or
     * null for "—".
     * @param {{voicemail?: boolean, callStatus?: string, direction?: string, duration?: number, brief?: string}} row
     * @param {number} [pending] - pending follow-ups from this call
     * @returns {{text: string, tone: string, key: (string|null)}} tone: a key of OUTCOME_TONES
     */
    const outcomeOf = (row, pending) => {
        const r = row || {};
        if (r.voicemail === true) return { text: 'Voicemail', tone: 'voicemail', key: 'voicemail' };
        const unanswered = unansweredRule(r);
        if (unanswered) {
            const missed = unanswered.chip === 'missed';
            return { text: unanswered.text, tone: missed ? 'missed' : 'quiet', key: missed ? 'missed' : 'no_answer' };
        }
        if (pending > 0) return { text: 'Follow-up suggested', tone: 'followup', key: 'follow_up' };
        const s = String(r.callStatus || '');
        if (s === 'Logged' || s === 'Processing') return { text: 'Summarizing', tone: 'quiet', key: 'summarizing' };
        if (s === 'Too short' || (s === 'No transcript' && Number(r.duration) < SHORT_CALL_SECONDS)) return { text: 'Too short', tone: 'quiet', key: 'too_short' };
        if (s === 'Transcribed' || r.brief) return { text: 'Summary ready', tone: 'ready', key: 'summary_ready' };
        if (s === 'No transcript') return { text: 'No transcript', tone: 'quiet', key: 'no_transcript' };
        if (s === 'Failed') return { text: 'Summary failed', tone: 'quiet', key: 'failed' };
        return { text: '—', tone: 'quiet', key: null };
    };

    // Satisfaction bands: 1-3 Low, 4-6 Moderate, 7-10 High; no score (or
    // a voicemail, which is never scored) reads "Not scored".
    const SAT_BANDS = {
        high: { label: 'High', fg: '#0E6B45', dot: '#5DBB8A' },
        mid:  { label: 'Moderate', fg: '#8A5A00', dot: '#E9A62A' },
        low:  { label: 'Low', fg: '#9A2A23', dot: '#E7837A' },
        none: { label: 'Not scored', fg: '#8B8780', dot: '#D9D5CF' }
    };

    /**
     * A satisfaction score as dot + text: "8 High", "4 Moderate", "2 Low",
     * "Not scored".
     * @param {*} n - 1-10, or null / 0 for no score
     * @returns {{band: string, text: string, fg: string, dot: string}} band: a key of SAT_BANDS
     */
    const satBand = (n) => {
        const v = typeof n === 'number' && n > 0 ? Math.round(n) : 0;
        const band = !v ? 'none' : (v <= 3 ? 'low' : (v <= 6 ? 'mid' : 'high'));
        const b = SAT_BANDS[band];
        return { band: band, text: v ? v + ' ' + b.label : b.label, fg: b.fg, dot: b.dot };
    };

    // One line instead of the summary and transcript for a call with no
    // conversation (status -> text). Shared by the Phone Call record panel
    // (ctc_ue_transcript_viewer.js) and Reporting Central's call detail.
    const UNANSWERED_NOTE = {
        'Missed':    'The caller did not reach anyone and left no voicemail.',
        'No answer': 'The person you called did not pick up.',
        'Too short': 'The call lasted under 3 seconds, so there is nothing to summarize.'
    };

    return {
        escapeHtml, escapeJs, safeJsonEmbed, setNoStoreHeaders, formatPhone, FORMAT_PHONE_JS, CALL_STATUS_RULES, unansweredRule,
        SHORT_CALL_SECONDS, OUTCOME_TONES, outcomeOf, SAT_BANDS, satBand, UNANSWERED_NOTE
    };
});
