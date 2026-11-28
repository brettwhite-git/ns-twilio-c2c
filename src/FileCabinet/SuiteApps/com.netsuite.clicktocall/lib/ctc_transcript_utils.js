// @ts-check
/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Shared transcript enrichment utilities used by both the Scheduled Script
 * and the RESTlet checkTranscript action.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/https', 'N/log', 'N/record', 'N/search', './ctc_llm_analysis'],
       (https, log, record, search, llmAnalysis) => {

    const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01/Accounts';
    const TWILIO_INTEL_BASE = 'https://intelligence.twilio.com/v2';

    // Status values written to custevent_ctc_call_status.
    // MISSED / TOO_SHORT / NO_ANSWER are written only by call
    // reconciliation (lib/ctc_call_reconcile) for calls the browser did
    // not log. They are terminal: the call is never polled for a transcript.
    //
    // Voicemail has no status of its own. Reconciliation logs a voicemail
    // as LOGGED with custevent_ctc_voicemail = T (the lasting marker), so
    // the one transcript path (poller Phase C) transcribes it and ends it
    // at TRANSCRIBED / NO_TRANSCRIPT like any call. The recording sits on
    // the caller's (parent) call; Phase C finds it directly (Phone Call
    // stores the parent SID) or through fetchParentCallRecording (Phone
    // Call stores the client child SID). The recording is deleted only
    // after the transcript is extracted, as for calls.
    const CALL_STATUS = {
        LOGGED:        'Logged',
        PROCESSING:    'Processing',
        TRANSCRIBED:   'Transcribed',
        NO_TRANSCRIPT: 'No transcript',
        FAILED:        'Failed',
        MISSED:        'Missed',
        TOO_SHORT:     'Too short',
        NO_ANSWER:     'No answer'
    };

    // Twilio Recording.status values that mean "no transcript will ever exist"
    // ('deleted': the media is gone, so nothing can transcribe it).
    const RECORDING_TERMINAL_STATUSES = ['absent', 'deleted'];

    // Twilio Transcript.status values that mean "no transcript will ever be ready"
    const TRANSCRIPT_TERMINAL_STATUSES = ['failed', 'canceled', 'error'];

    // Twilio Call.status values for a call that has ended.
    const CALL_ENDED_STATUSES = ['completed', 'busy', 'no-answer', 'failed', 'canceled'];

    // Bounded waits (2026-10-31). Before these, a call that Twilio never
    // recorded (unanswered outbound, inbound with recording off) or never
    // transcribed got no terminal status from Twilio, so the poller marked
    // it Processing and polled it again every cycle, forever.
    //   - RECORDING_WAIT_MS: Twilio creates the Recording resource when
    //     recording starts (during the call). No recording 1 hour after the
    //     call ended means there will never be one.
    //   - TRANSCRIPT_WAIT_MS: Twilio publishes no transcription SLA. Normal
    //     latency is minutes; 24 hours after the recording last changed is
    //     far past it.
    const RECORDING_WAIT_MS = 60 * 60 * 1000;
    const TRANSCRIPT_WAIT_MS = 24 * 60 * 60 * 1000;

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

    const VOICEMAIL_TITLE_PREFIX = 'Voicemail: ';

    const isChecked = (v) => v === true || v === 'T';

    const isRecordingTerminal = (recording) => {
        return !!(recording && RECORDING_TERMINAL_STATUSES.indexOf(recording.status) !== -1);
    };

    const isTranscriptTerminal = (transcript) => {
        return !!(transcript && TRANSCRIPT_TERMINAL_STATUSES.indexOf(transcript.status) !== -1);
    };

    const isTranscriptComplete = (transcript) => {
        return !!(transcript && transcript.status === 'completed');
    };

    const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
                     jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

    /**
     * Twilio timestamp → epoch ms, or null when it can't be read. The
     * 2010-04-01 API uses RFC 2822 ("Fri, 30 Oct 2026 18:59:07 +0000");
     * Intelligence v2 uses ISO 8601 ("2026-10-30T18:59:07Z"). RFC 2822 is
     * parsed by hand so the result never depends on the engine's Date.parse
     * or on the NetSuite user time zone.
     */
    const parseTwilioDate = (value) => {
        const s = String(value || '').trim();
        if (!s) return null;
        const m = s.match(/^(?:[A-Za-z]{3},\s*)?([0-9]{1,2})\s+([A-Za-z]{3})\s+([0-9]{4})\s+([0-9]{2}):([0-9]{2}):([0-9]{2})\s*(?:([+-])([0-9]{2})([0-9]{2}))?/);
        if (m) {
            const month = MONTHS[m[2].toLowerCase()];
            if (month === undefined) return null;
            const offsetMin = m[7]
                ? (m[7] === '-' ? -1 : 1) * (parseInt(m[8], 10) * 60 + parseInt(m[9], 10))
                : 0;
            return Date.UTC(parseInt(m[3], 10), month, parseInt(m[1], 10),
                parseInt(m[4], 10), parseInt(m[5], 10), parseInt(m[6], 10)) - offsetMin * 60000;
        }
        const iso = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T/.test(s) ? Date.parse(s) : NaN;
        return isNaN(iso) ? null : iso;
    };

    // First readable timestamp among `fields` of a Twilio resource, or null.
    const firstTimestamp = (resource, fields) => {
        for (const field of fields) {
            const ms = parseTwilioDate(resource[field]);
            if (ms !== null) return ms;
        }
        return null;
    };

    /**
     * True when the poller has waited long enough for a recording on a call
     * that has none. `twilioCall` is the fetchCall() result:
     *   - null        → Twilio has no such call: no recording can ever appear
     *   - live call   → (queued / ringing / in-progress) keep waiting
     *   - ended call  → wait RECORDING_WAIT_MS after it ended
     * An ended call with no readable timestamp keeps waiting (and logs), so a
     * Twilio date-format change can never close calls early.
     *
     * @param {Object|null} twilioCall - Twilio Call resource, or null
     * @param {number} [nowMs=Date.now()]
     * @returns {boolean}
     */
    const recordingWaitExpired = (twilioCall, nowMs) => {
        if (!twilioCall) return true;
        if (CALL_ENDED_STATUSES.indexOf(twilioCall.status) === -1) return false;
        const endedAt = firstTimestamp(twilioCall, ['end_time', 'date_updated', 'date_created']);
        if (endedAt === null) {
            log.error({ title: 'CTC Call end time unreadable', details: `${twilioCall.sid}: ${twilioCall.end_time}` });
            return false;
        }
        return (nowMs === undefined ? Date.now() : nowMs) - endedAt >= RECORDING_WAIT_MS;
    };

    /**
     * True when the poller has waited long enough for a finished transcript
     * of this recording (none exists, or it is still queued / in progress).
     * The clock starts when the recording last changed (it completes after
     * the call ends). An unreadable timestamp keeps waiting (and logs).
     *
     * @param {Object} recording - Twilio Recording resource
     * @param {number} [nowMs=Date.now()]
     * @returns {boolean}
     */
    const transcriptWaitExpired = (recording, nowMs) => {
        if (!recording) return false;
        const changedAt = firstTimestamp(recording, ['date_updated', 'date_created', 'start_time']);
        if (changedAt === null) {
            log.error({ title: 'CTC Recording date unreadable', details: `${recording.sid}: ${recording.date_updated}` });
            return false;
        }
        return (nowMs === undefined ? Date.now() : nowMs) - changedAt >= TRANSCRIPT_WAIT_MS;
    };

    /**
     * Bounded wait for a call whose Twilio reads keep failing transiently
     * (401 / 403 / 429 / 5xx / network). Without it such a call stayed
     * open forever and held a slot in the poller's 50-row window.
     *   - recording known (the transcript or sentences read failed): the
     *     same 24 h as transcriptWaitExpired.
     *   - no recording known (the recording / call read failed): we cannot
     *     tell "no recording" from "Twilio down", so the longer of the two
     *     waits applies: RECORDING_WAIT_MS + TRANSCRIPT_WAIT_MS (25 h)
     *     after the call started (custevent_ctc_call_started, ISO UTC).
     *     An admin has a day to fix rotated credentials before calls close.
     * An unreadable or empty start time keeps waiting.
     *
     * @param {string} callStartedIso - custevent_ctc_call_started
     * @param {Object|null} recording - Twilio Recording, when known
     * @param {number} [nowMs=Date.now()]
     * @returns {boolean}
     */
    const transientWaitExpired = (callStartedIso, recording, nowMs) => {
        const now = nowMs === undefined ? Date.now() : nowMs;
        if (recording && typeof recording === 'object' && !isTransientError(recording)) {
            return transcriptWaitExpired(recording, now);
        }
        const startedMs = parseTwilioDate(callStartedIso);
        if (startedMs === null) return false;
        return now - startedMs >= RECORDING_WAIT_MS + TRANSCRIPT_WAIT_MS;
    };

    // Sprint 2c — LLM concerns extracted to lib/ctc_llm_analysis.js
    // (prompt template, model params, schema, fallback shape, quota guard,
    // try/catch around llm.generateText). This module re-exports
    // ANALYSIS_PROMPT_PREFIX + analyzeTranscript for backward compatibility
    // with existing callers (ctc_rl_token.js, ctc_ss_poll_transcripts.js).
    // New callers should import from ctc_llm_analysis.js directly.
    const ANALYSIS_PROMPT_PREFIX = llmAnalysis.ANALYSIS_PROMPT_PREFIX;

    // 4xx codes that mean "try again later", not "Twilio has nothing":
    // 401/403 are admin-fixable credential problems, 429 is rate limiting.
    // These used to return null, which only meant "mark Processing". Now
    // null can end a call as No transcript after a bounded wait, so a
    // credential outage must never look like "no recording".
    const RETRYABLE_4XX = [401, 403, 429];

    /**
     * GET a Twilio JSON resource. Shared by the fetchers below so they
     * classify failures the same way:
     *   - parsed body     → HTTP 200
     *   - null            → Twilio answered "nothing here" (404 / other 4xx)
     *   - TRANSIENT_ERROR → network error / timeout / 5xx / 401 / 403 / 429 /
     *                       malformed JSON; caller retries next cycle
     */
    const getTwilioJson = (url, authHeader, label) => {
        let response;
        try {
            response = https.get({ url, headers: { Authorization: authHeader }, timeout: HTTPS_TIMEOUT_MS });
        } catch (e) {
            log.error({ title: `${label} — network error`, details: (e && e.message) || String(e) });
            return TRANSIENT_ERROR;
        }

        if (response.code >= 500 && response.code < 600) {
            log.error({ title: `${label} — Twilio 5xx`, details: `HTTP ${response.code}` });
            return TRANSIENT_ERROR;
        }
        if (RETRYABLE_4XX.indexOf(response.code) !== -1) {
            log.error({ title: `${label} — HTTP ${response.code} (retry next cycle)`, details: `${response.body}` });
            return TRANSIENT_ERROR;
        }
        if (response.code !== 200) {
            log.error({ title: `${label} Failed`, details: `HTTP ${response.code}: ${response.body}` });
            return null;
        }

        try {
            return JSON.parse(response.body);
        } catch (e) {
            log.error({ title: `${label} — JSON parse`, details: (e && e.message) || String(e) });
            return TRANSIENT_ERROR;
        }
    };

    /**
     * Sprint 2b — return contract:
     *   - {sid, ...}      → recording resource found
     *   - null            → Twilio lists no recording for this call (yet, or
     *                       ever — the poller tells them apart with
     *                       fetchCall + recordingWaitExpired)
     *   - TRANSIENT_ERROR → see getTwilioJson; caller should NOT flip
     *                       call_status (retry next cycle)
     */
    const fetchRecordingForCall = (accountSid, callSid, authHeader) => {
        const recordings = fetchRecordingsForCall(accountSid, callSid, authHeader);
        if (isTransientError(recordings)) return recordings;
        return recordings.length > 0 ? recordings[0] : null;
    };

    /**
     * All Recording resources Twilio lists under one call. Returns an
     * array ([] when there are none or Twilio has no such call), or
     * TRANSIENT_ERROR (see getTwilioJson).
     */
    const fetchRecordingsForCall = (accountSid, callSid, authHeader) => {
        const body = getTwilioJson(`${TWILIO_API_BASE}/${accountSid}/Calls/${callSid}/Recordings.json`,
            authHeader, 'CTC Fetch Call Recordings');
        if (isTransientError(body)) return body;
        const recordings = (body && body.recordings) || [];
        return Array.isArray(recordings) ? recordings : [];
    };

    const CALL_SID_PATTERN = /^CA[A-Za-z0-9]{32}$/;

    /**
     * Recording of an inbound call, found through its parent call.
     *
     * An inbound Phone Call stores the CallSid of the CHILD leg (the call
     * Twilio dialed to `client:<id>`). The Studio flow records with
     * Connect Call To (`record: true`), and Twilio attaches that recording
     * to the PARENT call (the caller's leg), so the child's own Recordings
     * list is empty. `childCall` is the fetchCall() result for the child
     * leg; its `parent_call_sid` names the parent.
     *
     * Only a recording whose `call_sid` equals that parent SID is
     * returned, so a recording of another call is never used.
     *
     * Return contract (same as fetchRecordingForCall):
     *   - {sid, ...}      → the parent call's recording
     *   - null            → no parent, or the parent has no recording (yet)
     *   - TRANSIENT_ERROR → retry next cycle
     */
    const fetchParentCallRecording = (accountSid, childCall, authHeader) => {
        const childSid = String((childCall && childCall.sid) || '');
        const parentSid = String((childCall && childCall.parent_call_sid) || '');
        if (!CALL_SID_PATTERN.test(parentSid) || parentSid === childSid) return null;

        const recordings = fetchRecordingsForCall(accountSid, parentSid, authHeader);
        if (isTransientError(recordings)) return recordings;
        const own = recordings.filter((r) => r && r.sid && r.call_sid === parentSid);
        if (own.length < recordings.length) {
            log.audit({
                title: 'CTC Parent recording — ignored foreign rows',
                details: `parent=${parentSid} listed=${recordings.length} matched=${own.length}`
            });
        }
        return own.length ? own[0] : null;
    };

    /**
     * Fetch the Twilio Call resource ({ sid, status, end_time, ... }).
     * Same contract as fetchRecordingForCall: null means Twilio has no such
     * call (404), TRANSIENT_ERROR means retry next cycle.
     */
    const fetchCall = (accountSid, callSid, authHeader) => {
        const body = getTwilioJson(`${TWILIO_API_BASE}/${accountSid}/Calls/${callSid}.json`,
            authHeader, 'CTC Fetch Call');
        if (isTransientError(body)) return body;
        return body || null;
    };

    /**
     * Fetch the first Transcript resource for a given Recording SID.
     * Returns the transcript object (including .status) so callers can distinguish:
     *   - completed       → ready, enrich the Phone Call
     *   - queued/new/in-progress → still working, poll again later
     *   - failed/canceled/error  → terminal, no transcript will ever be ready
     *   - null            → no transcript exists yet
     *   - TRANSIENT_ERROR → see getTwilioJson (retry next cycle)
     */
    const fetchTranscript = (recordingSid, authHeader) => {
        const body = getTwilioJson(`${TWILIO_INTEL_BASE}/Transcripts?SourceSid=${recordingSid}`,
            authHeader, 'CTC Fetch Transcript');
        if (isTransientError(body)) return body;
        const transcripts = (body && body.transcripts) || [];
        return transcripts.length ? transcripts[0] : null;
    };

    /**
     * Sentences of a COMPLETED transcript.
     *
     * Return contract (2026-11-03):
     *   - Array (maybe empty) → Twilio answered 200 with a `sentences`
     *                           array. [] is a real empty transcript.
     *   - TRANSIENT_ERROR     → ANY failure: network, timeout, 5xx,
     *                           401/403/429, 404 / other 4xx, bad JSON, or
     *                           a body without a `sentences` array.
     * Before this, every failure returned [], so a failed fetch was saved
     * as Transcribed with an empty transcript and the recording was
     * deleted (data loss). Callers must not save or delete the recording
     * on TRANSIENT_ERROR; the bounded waits close the call later.
     */
    /** Sentences per page (Twilio v2 lists allow up to 1000). */
    const SENTENCE_PAGE_SIZE = 1000;
    /** Page cap: 20 × 1000 sentences, far beyond any call; bounds governance (10 units a page). */
    const MAX_SENTENCE_PAGES = 20;

    /**
     * All sentences of a transcript, every page (meta.next_page_url).
     * Any page that fails transiently → TRANSIENT_ERROR, so the whole
     * transcript is fetched again on the next run (never saved in part).
     * A next_page_url off the Intelligence host is never followed (the
     * request carries the auth header).
     */
    const fetchSentences = (transcriptSid, authHeader) => {
        const all = [];
        let url = `${TWILIO_INTEL_BASE}/Transcripts/${transcriptSid}/Sentences?PageSize=${SENTENCE_PAGE_SIZE}`;
        for (let page = 0; url; page++) {
            if (page >= MAX_SENTENCE_PAGES) {
                log.error({ title: 'CTC Fetch Sentences — page cap reached',
                    details: `transcript=${transcriptSid} pages=${page} sentences=${all.length}` });
                return TRANSIENT_ERROR;
            }
            const body = getTwilioJson(url, authHeader, 'CTC Fetch Sentences');
            if (isTransientError(body)) return body;
            if (!body || !Array.isArray(body.sentences)) {
                log.error({ title: 'CTC Fetch Sentences — no sentences list', details: `transcript=${transcriptSid} page=${page}` });
                return TRANSIENT_ERROR;
            }
            Array.prototype.push.apply(all, body.sentences);
            const next = body.meta && body.meta.next_page_url;
            url = typeof next === 'string' && next.indexOf(TWILIO_INTEL_BASE + '/') === 0 ? next : '';
            if (next && !url) {
                log.error({ title: 'CTC Fetch Sentences — next page off host', details: `transcript=${transcriptSid}` });
                return TRANSIENT_ERROR;
            }
        }
        return all;
    };

    /** One decimal of seconds, or null when Twilio gave no time. */
    const secondsOf = (v) => {
        const n = parseFloat(String(v == null ? '' : v));
        return isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : null;
    };

    /**
     * Sentences → "[REP 12.4-15.9] ..." / "[CUSTOMER 16.0-18.2] ..." lines
     * (2026-11-28: each sentence keeps Twilio's start / end seconds, so the
     * call drawer can link a turn to the recording and measure talk time).
     * A sentence without both times stays "[REP] ..." as before.
     *
     * In a two-channel <Dial> recording, channel 1 is the parent call leg
     * and channel 2 is the child leg. Outbound, the parent leg is the rep's
     * browser phone (channel 1 = rep). Inbound, the parent leg is the
     * caller and the rep is the dialed child (channel 2 = rep), so
     * `opts.inbound` swaps the labels.
     *
     * @param {Array<{media_channel: number, transcript: string, start_time?: (number|string|null), end_time?: (number|string|null)}>} sentences
     * @param {{inbound?: boolean}} [opts]
     */
    const formatTranscript = (sentences, opts) => {
        const repChannel = opts && opts.inbound === true ? 2 : 1;
        return sentences.map((s) => {
            const who = s.media_channel === repChannel ? 'REP' : 'CUSTOMER';
            const start = secondsOf(s.start_time);
            const end = secondsOf(s.end_time);
            const tag = start !== null && end !== null ? `[${who} ${start}-${end}]` : `[${who}]`;
            return `${tag} ${s.transcript}`;
        }).join('\n');
    };

    const LINE_RE = /^\[(REP|CUSTOMER)(?: ([0-9]+(?:\.[0-9]+)?)-([0-9]+(?:\.[0-9]+)?))?\]\s*/;

    /**
     * One stored transcript line → { speaker: 'rep' | 'customer' | '', text,
     * start, end } (seconds or null). Reads both "[REP] …" and "[REP 1.2-3.4] …".
     * @param {string} line
     */
    const parseTranscriptLine = (line) => {
        const s = String(line);
        const m = LINE_RE.exec(s);
        if (!m) return { speaker: '', text: s, start: null, end: null };
        return { speaker: m[1] === 'REP' ? 'rep' : 'customer', text: s.slice(m[0].length),
            start: m[2] != null ? parseFloat(m[2]) : null, end: m[3] != null ? parseFloat(m[3]) : null };
    };

    /**
     * Stored transcript text → turns (same speaker in a row joins one turn)
     * and talk time per side. Talk time is measured from sentence times when
     * every spoken line has them, else from word counts ('words').
     * @param {string} text
     * @param {number} [maxTurns]
     * @returns {{turns: Array<{speaker: string, start: (number|null), end: (number|null), lines: Array<string>}>,
     *            talk: {rep: number, customer: number, basis: string}}}
     */
    const transcriptTurns = (text, maxTurns) => {
        const lines = String(text || '').split(/\n|<br\s*\/?>/).filter((l) => l.trim()).map(parseTranscriptLine);
        const turns = [];
        lines.forEach((l) => {
            const last = turns[turns.length - 1];
            if (last && last.speaker === l.speaker && l.speaker) {
                last.lines.push(l.text);
                if (l.end !== null) last.end = l.end;
            } else turns.push({ speaker: l.speaker, start: l.start, end: l.end, lines: [l.text] });
        });
        const spoken = lines.filter((l) => l.speaker);
        const timed = spoken.length > 0 && spoken.every((l) => l.start !== null && l.end !== null);
        const talk = { rep: 0, customer: 0, basis: timed ? 'seconds' : 'words' };
        spoken.forEach((l) => {
            const amount = timed ? Math.max(0, l.end - l.start) : l.text.split(/\s+/).filter(Boolean).length;
            talk[l.speaker] += amount;
        });
        talk.rep = Math.round(talk.rep * 10) / 10;
        talk.customer = Math.round(talk.customer * 10) / 10;
        return { turns: maxTurns ? turns.slice(0, maxTurns) : turns, talk: talk };
    };

    // Sprint 2c — analyzeTranscript now delegates to lib/ctc_llm_analysis.
    // The new module owns the HIGH-3 try/catch + quota guard, plus the
    // fallback-shape merge so downstream field writes never see undefined.
    const analyzeTranscript = llmAnalysis.analyzeTranscript;

    /**
     * LLM action_items → [{ task, due_date }]. Accepts the current object
     * shape {"task": string, "due_date": "YYYY-MM-DD" | null} and plain
     * strings (older prompt; due_date null). Anything else, and items with
     * an empty task, are dropped. due_date is passed on only when it is a
     * string; it is NOT validated here (see resolveDueDate).
     * @param {*} items
     * @returns {Array<{task: string, due_date: (string|null)}>}
     */
    const normalizeActionItems = (items) => {
        if (!Array.isArray(items)) return [];
        /** @type {Array<{task: string, due_date: (string|null)}>} */
        const out = [];
        items.forEach((it) => {
            if (typeof it === 'string') {
                if (it.trim()) out.push({ task: it.trim(), due_date: null });
                return;
            }
            if (it && typeof it === 'object' && typeof it.task === 'string' && it.task.trim()) {
                out.push({ task: it.task.trim(), due_date: typeof it.due_date === 'string' ? it.due_date.trim() : null });
            }
        });
        return out;
    };

    const DUE_MAX_DAYS = 90;
    const DUE_FALLBACK_BUSINESS_DAYS = 3;
    const DAY_MS = 24 * 60 * 60 * 1000;

    /**
     * 'YYYY-MM-DD' that is a real calendar date → local-midnight Date, else null.
     * @param {*} value
     * @returns {Date|null}
     */
    const parseIsoDay = (value) => {
        const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(typeof value === 'string' ? value.trim() : '');
        if (!m) return null;
        const y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
        const dt = new Date(y, mo - 1, d);
        if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
        return dt;
    };

    /**
     * `days` business days after `from` (Saturday and Sunday skipped).
     * @param {Date} from
     * @param {number} days
     * @returns {Date}
     */
    const addBusinessDays = (from, days) => {
        const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
        let left = days;
        while (left > 0) {
            d.setDate(d.getDate() + 1);
            const wd = d.getDay();
            if (wd !== 0 && wd !== 6) left--;
        }
        return d;
    };

    /**
     * Proposed due date for one action item. The AI's due_date wins when it
     * is a real 'YYYY-MM-DD' date from the call date through call date + 90
     * days; anything else (null, malformed, impossible, in the past, too
     * far out) gives call date + 3 business days.
     * @param {*} dueDate - the item's due_date
     * @param {Date} callDay - local midnight of the call date
     * @returns {Date}
     */
    const resolveDueDate = (dueDate, callDay) => {
        const due = parseIsoDay(dueDate);
        if (due) {
            const diffDays = Math.round((due.getTime() - callDay.getTime()) / DAY_MS);
            if (diffDays >= 0 && diffDays <= DUE_MAX_DAYS) return due;
        }
        return addBusinessDays(callDay, DUE_FALLBACK_BUSINESS_DAYS);
    };

    /**
     * Spawn one customrecord_ctc_proposed_task per non-empty action item.
     * Called by createProposedTasksOnce after the Phone Call save.
     *
     * Due date per item: resolveDueDate (the AI date when valid, else call
     * date + 3 business days).
     *
     * @param {string|number} phoneCallId - the source Phone Call internal ID
     * @param {Object} analysis - LLM output (expects analysis.action_items[] array)
     * @param {string} [callDate] - 'YYYY-MM-DD' local call date; today when missing or invalid
     * @returns {Array<number>} IDs of created proposed_task records
     */
    const createProposedTasksFromAnalysis = (phoneCallId, analysis, callDate) => {
        const items = normalizeActionItems(analysis && analysis.action_items);
        if (!items.length) return [];
        const now = new Date();
        const callDay = parseIsoDay(callDate) || new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return items.map((item) => {
            const rec = record.create({ type: 'customrecord_ctc_proposed_task' });
            rec.setValue({ fieldId: 'custrecord_ctc_pt_phone_call', value: phoneCallId });
            rec.setValue({ fieldId: 'custrecord_ctc_pt_text', value: item.task });
            rec.setText({ fieldId: 'custrecord_ctc_pt_status', text: 'Pending' });
            rec.setValue({ fieldId: 'custrecord_ctc_pt_proposed_due', value: resolveDueDate(item.due_date, callDay) });
            return rec.save({ ignoreMandatoryFields: true });
        });
    };

    /**
     * Proposed tasks for a Phone Call, created at most once. Call it only
     * AFTER the enrichment save succeeded (2026-11-03): before, the tasks
     * were created inside writePhoneCallEnrichmentFields, before save(), so
     * a failed save or a killed script repeated them on every retry.
     * Skips when any proposed task already points at this Phone Call
     * (one search, 10 units; none when there are no action items).
     * Never throws.
     *
     * @param {string|number} phoneCallId - saved Phone Call internal ID
     * @param {Object} analysis - LLM output (analysis.action_items)
     * @param {string} [callDate] - 'YYYY-MM-DD' local call date
     * @returns {Array<number>} IDs created ([] when skipped or none)
     */
    const createProposedTasksOnce = (phoneCallId, analysis, callDate) => {
        try {
            if (!phoneCallId || !normalizeActionItems(analysis && analysis.action_items).length) return [];
            const existing = search.create({
                type: 'customrecord_ctc_proposed_task',
                filters: [['custrecord_ctc_pt_phone_call', 'anyof', String(phoneCallId)]],
                columns: ['internalid']
            }).run().getRange({ start: 0, end: 1 }) || [];
            if (existing.length) {
                log.audit({ title: 'CTC Proposed Tasks — already exist, skipped', details: `phoneCall=${phoneCallId}` });
                return [];
            }
            return createProposedTasksFromAnalysis(phoneCallId, analysis, callDate);
        } catch (e) {
            log.error({ title: 'CTC Proposed Task Creation Failed', details: `phoneCall=${phoneCallId}: ${(e && e.message) || e}` });
            return [];
        }
    };

    /**
     * Title when the AI gave no title and no summary: "Voicemail from
     * <who>", "Inbound call from <who>" or "Call to <who>". <who> is the
     * company, else the contact, else the phone number, else "unknown".
     * Never the recording SID.
     * @param {Object} phoneCallRec
     * @returns {string}
     */
    const fallbackCallTitle = (phoneCallRec) => {
        const read = (fn, fieldId) => {
            try {
                return String(phoneCallRec[fn]({ fieldId: fieldId }) || '').trim();
            } catch (e) {
                return '';
            }
        };
        const who = read('getText', 'company') || read('getText', 'contact') || read('getValue', 'phone') || 'unknown';
        if (isChecked(phoneCallRec.getValue({ fieldId: 'custevent_ctc_voicemail' }))) return 'Voicemail from ' + who;
        if (isChecked(phoneCallRec.getValue({ fieldId: 'custevent_ctc_inbound' }))) return 'Inbound call from ' + who;
        return 'Call to ' + who;
    };

    /**
     * Write enrichment fields onto a Phone Call record. Single source of truth so
     * the RESTlet checkTranscript action and the Scheduled Script retry both end
     * up with identical field sets. Caller is responsible for record.load() and .save().
     *
     * Writes fields only. Proposed tasks: createProposedTasksOnce, after save().
     *
     * @param {Object} phoneCallRec - record object already loaded via record.load()
     * @param {Object} opts
     * @param {Object} opts.recording - Twilio Recording resource ({ sid, duration })
     * @param {string} opts.accountSid - Twilio Account SID (used to build recording URL)
     * @param {string} opts.transcriptText - formatted "[REP] ..." conversation text
     * @param {Object} opts.analysis - LLM output ({ title, brief, summary,
     *                                  satisfaction_score, tone_keywords, action_items })
     * @param {boolean} [opts.includeDuration=false] - whether to set custevent_ctc_duration
     *                                                 from recording.duration (Scheduled Script path does)
     * @param {string} [opts.callDate] - 'YYYY-MM-DD' local call date, for proposed task due dates
     */
    const writePhoneCallEnrichmentFields = (phoneCallRec, opts) => {
        const recording = opts.recording || {};
        const analysis = opts.analysis || {};

        let title = (analysis.title || '').substring(0, 80);
        if (!title) {
            const firstClause = (analysis.summary || '').split(/[.!?]/)[0] || '';
            title = firstClause.trim().substring(0, 60);
        }
        if (!title) {
            // No AI title or summary: a plain-words title, never the SID.
            title = fallbackCallTitle(phoneCallRec).substring(0, 80);
        } else if (isChecked(phoneCallRec.getValue({ fieldId: 'custevent_ctc_voicemail' })) &&
            title.indexOf(VOICEMAIL_TITLE_PREFIX) !== 0) {
            // A voicemail keeps its marker in the title: 'Voicemail: <AI title>'.
            title = (VOICEMAIL_TITLE_PREFIX + title).substring(0, 80);
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
        // A voicemail is not a conversation: no satisfaction score.
        phoneCallRec.setValue({ fieldId: 'custevent_ctc_satisfaction',
            value: isChecked(phoneCallRec.getValue({ fieldId: 'custevent_ctc_voicemail' })) ? '' : (analysis.satisfaction_score || 5) });
        phoneCallRec.setValue({ fieldId: 'custevent_ctc_tone_keywords', value: (analysis.tone_keywords || []).join(', ') });
        phoneCallRec.setValue({ fieldId: 'custevent_ctc_action_items',
            value: normalizeActionItems(analysis.action_items).map((i) => i.task).join('\n') });
        phoneCallRec.setValue({ fieldId: 'custevent_ctc_ai_brief', value: (analysis.brief || analysis.summary || '').substring(0, 120) });
        phoneCallRec.setValue({ fieldId: 'custevent_ctc_processed', value: true });
        phoneCallRec.setValue({ fieldId: 'custevent_ctc_call_status', value: CALL_STATUS.TRANSCRIBED });
        // Proposed tasks are NOT created here: the caller runs
        // createProposedTasksOnce after save() succeeds.
    };

    /**
     * Update only the status fields on a Phone Call record. Used to mark Processing
     * mid-flight or terminal states without overwriting the rest of the record.
     * Never throws.
     */
    const markCallStatus = (recordId, status, processed) => {
        try {
            const updates = { custevent_ctc_call_status: status };
            if (typeof processed === 'boolean') {
                updates.custevent_ctc_processed = processed;
            }
            record.submitFields({
                type: record.Type.PHONE_CALL,
                id: recordId,
                values: updates,
                options: { enableSourcing: false, ignoreMandatoryFields: true }
            });
        } catch (e) {
            log.error({ title: 'CTC Mark Status Failed', details: `${recordId}: ${e.message || e}` });
        }
    };

    /**
     * Parent company internal ID of a Contact, or '' when it has none or the
     * lookup fails. Phone Calls for a contact also link the parent company so
     * sales rollups attribute to the customer. Never throws.
     */
    const lookupContactCompany = (contactId) => {
        try {
            const result = search.lookupFields({
                type: search.Type.CONTACT,
                id: contactId,
                columns: ['company']
            });
            const company = result && result.company;
            if (Array.isArray(company) && company.length && company[0].value) {
                return company[0].value;
            }
            return '';
        } catch (e) {
            log.error({ title: 'CTC Contact Parent Lookup Failed', details: e.message || e });
            return '';
        }
    };

    /**
     * Sprint 2 U4 (HIGH-4) — return shape upgraded so callers can
     * distinguish "deleted" from "already gone" from "transient
     * failure, retry next cycle." Pre-fix this was fire-and-forget:
     * 5xx on DELETE meant the recording lived in Twilio storage
     * forever (cost + privacy concern) and nothing scanned for stale
     * recording SIDs. Post-fix: callers set
     * custevent_ctc_recording_cleanup_pending=T on TRANSIENT_ERROR
     * and the scheduled poll re-attempts on the next cycle.
     *
     * Return contract:
     *   - true             → DELETE succeeded (204/200)
     *   - null             → Twilio confirms the recording is gone
     *                        (404). Treat as deleted out of band —
     *                        clear the cleanup-pending flag.
     *   - TRANSIENT_ERROR  → network / timeout / 5xx / 401 / 403 —
     *                        caller should set cleanup_pending flag
     *                        so the next cycle retries.
     *   - false            → 4xx other than 401/403/404 (malformed
     *                        request, unknown account, etc.) — log
     *                        and move on; retrying won't fix it.
     *
     * Sprint 2 review #6: 401/403 are TREATED AS TRANSIENT (not
     * false) because they are admin-fixable (rotated API key,
     * revoked Twilio creds). Without this distinction, a persistent
     * auth misconfig would silently clear cleanup_pending flags and
     * the recording would stay in Twilio storage forever. Once admin
     * restores credentials, the next cycle's retry succeeds.
     *
     * @returns {true|null|false|object} status sentinel — see contract
     */
    const deleteRecording = (accountSid, recordingSid, authHeader) => {
        const url = `${TWILIO_API_BASE}/${accountSid}/Recordings/${recordingSid}.json`;

        let response;
        try {
            response = https.delete({ url, headers: { Authorization: authHeader }, timeout: HTTPS_TIMEOUT_MS });
        } catch (e) {
            log.error({ title: 'CTC Delete Recording — network error', details: (e && e.message) || String(e) });
            return TRANSIENT_ERROR;
        }

        if (response.code === 204 || response.code === 200) {
            return true;
        }
        if (response.code === 404) {
            // Recording already gone — treat as success path so the
            // cleanup_pending flag clears.
            return null;
        }
        if (response.code === 401 || response.code === 403) {
            // Sprint 2 review #6 — auth failures are admin-fixable
            // and therefore transient from the script's perspective.
            // Keep the flag set so retry resumes once admin rotates
            // the credential.
            log.error({ title: 'CTC Delete Recording — auth failure (admin-fixable, transient)', details: `HTTP ${response.code}: ${response.body}` });
            return TRANSIENT_ERROR;
        }
        if (response.code >= 500 && response.code < 600) {
            log.error({ title: 'CTC Delete Recording — 5xx (transient)', details: `HTTP ${response.code}: ${response.body}` });
            return TRANSIENT_ERROR;
        }
        log.error({ title: 'CTC Delete Recording Failed', details: `HTTP ${response.code}: ${response.body}` });
        return false;
    };

    return {
        TWILIO_API_BASE,
        TWILIO_INTEL_BASE,
        ANALYSIS_PROMPT_PREFIX,
        CALL_STATUS,
        TRANSIENT_ERROR,
        RECORDING_WAIT_MS,
        TRANSCRIPT_WAIT_MS,
        isTransientError,
        getTwilioJson,
        isRecordingTerminal,
        isTranscriptTerminal,
        isTranscriptComplete,
        parseTwilioDate,
        recordingWaitExpired,
        transcriptWaitExpired,
        transientWaitExpired,
        fetchRecordingForCall,
        fetchRecordingsForCall,
        fetchParentCallRecording,
        fetchCall,
        fetchTranscript,
        fetchSentences,
        formatTranscript,
        parseTranscriptLine,
        transcriptTurns,
        analyzeTranscript,
        normalizeActionItems,
        resolveDueDate,
        createProposedTasksFromAnalysis,
        createProposedTasksOnce,
        fallbackCallTitle,
        writePhoneCallEnrichmentFields,
        markCallStatus,
        lookupContactCompany,
        deleteRecording
    };
});
