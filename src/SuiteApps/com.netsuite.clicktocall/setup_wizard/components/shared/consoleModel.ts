/**
 * Console view model — pure helpers that turn health signals, phone rows
 * and form state into the text the console pages show. No store, no UIF
 * (type imports only), so jest can test every rule here.
 *
 * Signal value shapes: lib/ctc_health.js build* functions.
 */

import type {InboundSettings, OutboundState} from '../../app/InitialState';

/** Status colour of a dot or chip (canvas palette in consoleStyles.ts). */
export type Tone = 'ok' | 'warn' | 'problem' | 'off' | 'info';

export interface KpiView {
    metric: string;
    /** Small text after the metric ("of 3", "calls", "min ago"). */
    metadata: string;
    tone: Tone | null;
    text: string;
}

const plural = (n: number, one: string, many: string): string => n + ' ' + (n === 1 ? one : many);

/** Minutes as the larger unit: [12, 'min ago'], [3, 'h ago'], [2, 'days ago']. */
export function agoParts(minutes: number): { value: string; unit: string } {
    const m = Math.max(0, Math.round(minutes));
    if (m < 60) return { value: String(m), unit: 'min ago' };
    const h = Math.floor(m / 60);
    if (h < 48) return { value: String(h), unit: 'h ago' };
    return { value: String(Math.floor(h / 24)), unit: 'days ago' };
}

/** Local "10:14 AM" for an ISO time; '' when unreadable. */
export function timeOfDay(iso: string): string {
    const t = Date.parse(iso || '');
    if (isNaN(t)) return '';
    return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Local date and time for an ISO value; '' when unreadable. */
export function dateTime(iso: string): string {
    const t = Date.parse(iso || '');
    return isNaN(t) ? '' : new Date(t).toLocaleString();
}

// ─────────────────────────────────────────────────────────────────────
// Signal values (lib/ctc_health.js)
// ─────────────────────────────────────────────────────────────────────

export interface BacklogValue {
    windowDays?: number;
    logged: number;
    processing: number;
    failed: number;
    noTranscript: number;
    transcribed?: number;
    cleanupPending: number;
    stuck?: number;
    /** Calls with an AI analysis since monthStart (UTC month start, ISO). */
    analysedThisMonth?: number;
    monthStart?: string;
}

/** AI quota meter (Transcripts & AI). */
export interface AiMeter {
    /** Requests left (the bar value). */
    value: number;
    /** Left + used by Click-to-Call this month (the bar scale). */
    max: number;
    tone: 'ok' | 'warn' | 'problem';
    /** "1 analysed by Click-to-Call since Nov 1". */
    usedText: string;
    /** "Enough for more than a year at this month's rate." */
    runwayText: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The AI quota meter. NetSuite reports only the requests LEFT (no pool
 * size, no reset date), so the bar is scaled to left + the calls
 * Click-to-Call analysed this month: honest, and labelled as such.
 * Below 50 warn, below 10 problem (the analysis reserve).
 */
export function aiMeter(remaining: number | null, backlog: BacklogValue | null, nowMs: number): AiMeter | null {
    if (remaining === null || !isFinite(remaining) || remaining < 0) return null;
    const used = Math.max(0, (backlog && backlog.analysedThisMonth) || 0);
    const startMs = backlog && backlog.monthStart ? Date.parse(backlog.monthStart) : NaN;
    const since = isNaN(startMs) ? '' : new Date(startMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const tone = remaining < 10 ? 'problem' : remaining < 50 ? 'warn' : 'ok';
    const usedText = used.toLocaleString() + (used === 1 ? ' call' : ' calls') +
        ' analysed by Click-to-Call' + (since ? ' since ' + since : ' this month');
    let runwayText: string;
    if (!used || isNaN(startMs)) {
        runwayText = 'No calls analysed this month yet.';
    } else {
        const days = Math.max(1, (nowMs - startMs) / DAY_MS);
        const runway = remaining / (used / days);
        runwayText = runway > 365 ? 'Enough for more than a year at this month\'s rate.'
            : 'Enough for about ' + Math.max(1, Math.floor(runway)).toLocaleString() + ' days at this month\'s rate.';
    }
    return { value: remaining, max: Math.max(remaining + used, 1), tone, usedText, runwayText };
}

// ─────────────────────────────────────────────────────────────────────
// Transcript backlog (Transcripts & AI)
// ─────────────────────────────────────────────────────────────────────

export type BacklogStatus = 'Logged' | 'Processing' | 'Failed' | 'No transcript' | 'Recording cleanup due';

/**
 * One colour per backlog status, by meaning, wherever the status shows:
 * waiting / in progress = info (blue), failed = problem (red), closed =
 * neutral (grey), cleanup due = warn (amber).
 */
export const BACKLOG_STATUS_TONE: Record<BacklogStatus, 'info' | 'problem' | 'neutral' | 'warn'> = {
    'Logged': 'info',
    'Processing': 'info',
    'Failed': 'problem',
    'No transcript': 'neutral',
    'Recording cleanup due': 'warn'
};

export interface BacklogRow {
    status: BacklogStatus;
    tone: 'info' | 'problem' | 'neutral' | 'warn';
    count: number;
    next: string;
    /** "Open in Call Central" when the count is not zero. */
    link?: boolean;
}

/** Primer under the backlog card title. */
export const BACKLOG_PRIMER =
    'Calls from the last 7 days that still have work to do. Each call waits for Twilio\'s transcript. ' +
    'Then NetSuite summarises it, and Click-to-Call deletes the recording in Twilio. ' +
    'Most calls go from Logged to Transcribed within an hour.';

/** The backlog table rows (canvas copy), from the transcriptBacklog value. */
export function backlogRows(v: BacklogValue): BacklogRow[] {
    const row = (status: BacklogStatus, count: number, next: string, link?: boolean): BacklogRow =>
        ({ status, tone: BACKLOG_STATUS_TONE[status], count: Math.max(0, Number(count) || 0), next, link });
    return [
        row('Logged', v.logged,
            'Waiting for Twilio\'s transcript. Checked every 15 minutes; closed as "No transcript" after 24 hours.'),
        row('Processing', v.processing,
            'Being summarised now. A summary that stalls for 30 minutes is retried, up to 3 times.'),
        row('Failed', v.failed,
            'Summary failed 3 times. The transcript is kept; the call is not retried again.', true),
        row('No transcript', v.noTranscript,
            'Closed: no recording, or Twilio produced no transcript within 24 hours. Logged as calls without a summary.'),
        row('Recording cleanup due', v.cleanupPending,
            'Recordings Twilio did not delete on the first try. Retried on the next run.')
    ];
}

export interface NumberRoutingValue {
    inboundEnabled: boolean;
    flowSid: string;
    defaultCallerId: { phoneNumber: string; inTwilio: boolean } | null;
    numbers: Array<{
        phoneSid: string;
        phoneNumber: string;
        employeeId: number | string;
        employeeName: string;
        inTwilio: boolean;
        onFlow: boolean | null;
    }>;
    hasMore: boolean;
}

export interface RepPhonesValue {
    inboundEnabled: boolean;
    reps: Array<{
        employeeId: string;
        employeeName: string;
        receiving: boolean;
        lastSeen: string;
    }>;
}

export interface JobRuns {
    runs: number;
    lastStatus: string;
    minutesSinceLastRun: number | null;
    failedRecent: number;
}

export interface PollerRunsValue {
    transcripts: JobRuns;
    reconcile: JobRuns;
    watermark: string;
    watermarkMinutes: number | null;
}

export interface IntelligenceValue {
    serviceSid: string;
    exists: boolean | null;
    autoTranscribe: boolean | null;
    friendlyName: string;
}

/** Calls still waiting for a transcript: logged + processing + failed. */
export function backlogKpi(v: BacklogValue | null): KpiView {
    if (!v) return { metric: '—', metadata: '', tone: null, text: 'Not checked' };
    const total = v.logged + v.processing + v.failed;
    const parts: string[] = [];
    if (v.processing) parts.push(v.processing + ' processing');
    if (v.logged) parts.push(v.logged + ' logged');
    if (v.failed) parts.push(v.failed + ' failed');
    return {
        metric: String(total),
        metadata: total === 1 ? 'call' : 'calls',
        tone: v.failed > 0 ? 'warn' : null,
        text: parts.length ? parts.join(' · ') : 'Nothing waiting'
    };
}

/** Numbers routed: routed numbers on the CTC flow, of the numbers with a rep. */
export function numbersRoutedKpi(v: NumberRoutingValue | null): KpiView {
    if (!v) return { metric: '—', metadata: '', tone: null, text: 'Not checked' };
    const total = v.numbers.length;
    if (total === 0) return { metric: '0', metadata: '', tone: 'off', text: 'No number has a rep yet' };
    const missing = v.numbers.filter((n) => !n.inTwilio).length;
    const onFlow = v.numbers.filter((n) => n.onFlow === true).length;
    const meta = 'of ' + total;
    if (missing) {
        return { metric: String(onFlow), metadata: meta, tone: 'problem',
                 text: plural(missing, 'number is', 'numbers are') + ' not in Twilio' };
    }
    if (!v.flowSid) return { metric: '0', metadata: meta, tone: 'warn', text: 'Routing is not published' };
    if (onFlow === total) {
        return { metric: String(onFlow), metadata: meta, tone: v.inboundEnabled ? 'ok' : 'off',
                 text: v.inboundEnabled ? 'All point at CTC routing' : 'All point at CTC routing · inbound off' };
    }
    return { metric: String(onFlow), metadata: meta, tone: v.inboundEnabled ? 'problem' : 'off',
             text: plural(total - onFlow, 'number does', 'numbers do') + ' not point at CTC routing' };
}

/** Reps receiving now: routed reps whose phone can take a call. */
export function repsReceivingKpi(v: RepPhonesValue | null, relative: (iso: string) => string): KpiView {
    if (!v) return { metric: '—', metadata: '', tone: null, text: 'Not checked' };
    const total = v.reps.length;
    if (total === 0) return { metric: '0', metadata: '', tone: 'off', text: 'No rep rings for a number' };
    const receiving = v.reps.filter((r) => r.receiving);
    const meta = 'of ' + total;
    if (!v.inboundEnabled) {
        return { metric: String(receiving.length), metadata: meta, tone: 'off', text: 'Inbound calls are off' };
    }
    const tone: Tone = receiving.length === total ? 'ok' : 'warn';
    if (receiving.length === 1) {
        const r = receiving[0];
        const seen = r.lastSeen ? relative(r.lastSeen) : '';
        return { metric: '1', metadata: meta, tone, text: r.employeeName + (seen ? ' · ' + seen.toLowerCase() : '') };
    }
    if (receiving.length === 0) return { metric: '0', metadata: meta, tone, text: 'No rep has a phone open' };
    return { metric: String(receiving.length), metadata: meta, tone,
             text: tone === 'ok' ? 'Every routed rep' : plural(total - receiving.length, 'rep is', 'reps are') + ' not receiving' };
}

/** Status word of a job run ('complete' / 'processing' / 'failed'). */
export function runStatusText(status: string): string {
    switch (status) {
        case 'complete': return 'Completed';
        case 'processing': return 'Running';
        case 'failed': return 'Failed';
        default: return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'No run yet';
    }
}

/** Tone of a job: failed or silent (> staleAfter minutes) = warn. */
export function jobTone(j: JobRuns | null | undefined, staleAfterMinutes = 45): Tone {
    if (!j || !j.lastStatus || j.minutesSinceLastRun === null) return 'off';
    if (j.lastStatus === 'failed') return 'problem';
    if (j.failedRecent > 0 || j.minutesSinceLastRun > staleAfterMinutes) return 'warn';
    return 'ok';
}

/** Missed-call sync: minutes since the reconcile job last ran. */
export function missedCallSyncKpi(v: PollerRunsValue | null): KpiView {
    const j = v && v.reconcile;
    if (!j) return { metric: '—', metadata: '', tone: null, text: 'Not checked' };
    if (!j.lastStatus || j.minutesSinceLastRun === null) {
        return { metric: '—', metadata: '', tone: 'off', text: runStatusText(j.lastStatus) };
    }
    const ago = agoParts(j.minutesSinceLastRun);
    return { metric: ago.value, metadata: ago.unit, tone: jobTone(j), text: runStatusText(j.lastStatus) };
}

// ─────────────────────────────────────────────────────────────────────
// Phones & reps
// ─────────────────────────────────────────────────────────────────────

/** One number row (effects/phones ByPhoneEntry, with the ringing rep resolved). */
export interface NumberRow {
    phoneSid: string;
    phoneNumber: string;
    employeeIds: number[];
    /** The rep the number rings (primary, else first); null = no rep. */
    ringId: number | null;
}

/** Routing column: CTC routing / Not routed / No rep (from numberRouting). */
export function routingStatus(row: NumberRow, v: NumberRoutingValue | null): { label: string; tone: Tone } {
    if (row.ringId === null) return { label: 'No rep', tone: 'off' };
    const n = v ? v.numbers.find((x) => x.phoneSid === row.phoneSid) : null;
    if (!n) return { label: 'Not checked', tone: 'off' };
    if (!n.inTwilio) return { label: 'Not in Twilio', tone: 'problem' };
    if (n.onFlow === true) return { label: 'CTC routing', tone: 'ok' };
    return { label: 'Not routed', tone: 'warn' };
}

export interface CallerIdPlan {
    /** Rep id → the number the rep calls out from, and whether it rings them. */
    byRep: Record<string, { phoneNumber: string; ringsThem: boolean }>;
    /** Reps in any assignment, in first-seen order. */
    repIds: number[];
}

/**
 * Who calls out from what (lib ctc_rl_token resolveCallerId): the number
 * whose inbound calls ring the rep (its primary rep, else its first
 * assigned rep), else the config default. "Also assigned" reps neither
 * ring nor change caller ID. A rep who rings for several numbers calls
 * out from the first one listed.
 */
export function callerIdPlan(rows: NumberRow[], defaultNumber: string): CallerIdPlan {
    const byRep: CallerIdPlan['byRep'] = {};
    const repIds: number[] = [];
    rows.forEach((r) => {
        r.employeeIds.forEach((id) => { if (repIds.indexOf(id) < 0) repIds.push(id); });
        if (r.ringId !== null && !byRep[String(r.ringId)]) {
            byRep[String(r.ringId)] = { phoneNumber: r.phoneNumber, ringsThem: true };
        }
    });
    repIds.forEach((id) => {
        if (!byRep[String(id)]) byRep[String(id)] = { phoneNumber: defaultNumber || '', ringsThem: false };
    });
    return { byRep, repIds };
}

/** First name for compact table text ("Burt, from this number"). */
export const firstName = (name: string): string => String(name || '').trim().split(/\s+/)[0] || name;

// ─────────────────────────────────────────────────────────────────────
// Inbound calls
// ─────────────────────────────────────────────────────────────────────

const INBOUND_FIELDS: Array<keyof InboundSettings> = [
    'inboundEnabled', 'ringSeconds', 'noAnswerMessage', 'recordInbound', 'recordingNoticeOn',
    'recordingNotice', 'voicemailOn', 'voicemailMaxSeconds', 'fallbackOwnerId'
];

/** Fields of the form that differ from the saved settings (0 when not loaded). */
export function countInboundChanges(form: InboundSettings, saved: InboundSettings | null): number {
    if (!saved) return 0;
    return INBOUND_FIELDS.filter((k) => form[k] !== saved[k]).length;
}

// ─────────────────────────────────────────────────────────────────────
// Links
// ─────────────────────────────────────────────────────────────────────

/** Call Central (Reporting Central Suitelet) by script and deployment id. */
export const CALL_CENTRAL_URL =
    '/app/site/hosting/scriptlet.nl?script=customscript_ctc_sl_reporting&deploy=customdeploy_ctc_sl_reporting';

/** NetSuite Setup › Company › API Secrets. */
export const API_SECRETS_URL = '/app/common/scripting/secrets/settings.nl';

// ─────────────────────────────────────────────────────────────────────
// Outbound recording notice (Outbound calls)
// ─────────────────────────────────────────────────────────────────────

export const PUBLISH_NOTICE_HELP =
    'Creates the ctc-outbound Function in your Twilio account and points your Twilio app at it. ' +
    'Takes 15–30 seconds.';
export const SAVE_OFF_HELP = 'Nothing is sent to Twilio while the notice is off.';
export const NO_CHANGES_HELP =
    'Callers hear the live version. Change the text or the switch to publish a new version.';
export const PUBLISH_CHANGES_HELP = 'Takes 15–30 seconds. Calls in progress keep the old notice.';
export const TURN_OFF_HELP = 'Calls connect without a notice. The Function stays in Twilio.';
export const REPUBLISH_HELP =
    'A newer version of the Function is available. Publish to update it. Takes 15–30 seconds.';
export const FUNCTION_MISSING_HELP =
    'The Function is missing in Twilio. Publish to create it again. Takes 15–30 seconds.';
export const VOICE_URL_HELP =
    'Your Twilio app no longer points at the Function. Publish to point it back. Takes 15–30 seconds.';
export const PUBLISHING_LABEL = 'Publishing… (15–30 s)';
export const REMOVE_CONFIRM_TEXT = 'Remove the Function now?';

/** Body of the "Remove from Twilio" section (the previous Voice URL when known). */
export function removeBody(prevVoiceUrl: string): string {
    return 'Deletes the ctc-outbound Function and points your Twilio app back at its previous Voice URL' +
        (prevVoiceUrl ? ': ' + prevVoiceUrl : '') + '. Outbound calls keep working, without a notice.';
}

/** The form differs from the notice as last saved. */
export function outboundUnsaved(o: OutboundState): boolean {
    return o.loaded && (o.noticeOn !== o.savedNoticeOn || o.noticeText !== o.savedNoticeText);
}

/** Header status of the recording notice: tone + headline (+ published time). */
export function noticeStatus(o: OutboundState): { tone: Tone; label: string; extra: string } {
    const when = o.publishedAt && !isNaN(Date.parse(o.publishedAt)) ? '· ' + new Date(o.publishedAt).toLocaleString() : '';
    const hears = (v: number): string => (v ? 'version ' + v : 'no notice');
    if (!o.published) return { tone: 'off', label: 'Not live · calls connect without a notice', extra: '' };
    if (o.functionExists === false) {
        return { tone: 'problem', label: o.functionMessage || 'The Function is missing in Twilio', extra: '' };
    }
    if (o.voiceUrlMatches === false) return { tone: 'problem', label: 'The Twilio app does not point at the Function', extra: when };
    if (o.pending) return { tone: 'warn', label: 'Published · the Twilio build is still running', extra: when };
    if (o.needsRepublish) return { tone: 'warn', label: 'Republish needed', extra: when };
    if (outboundUnsaved(o)) return { tone: 'warn', label: 'Unsaved changes', extra: '' };
    if (o.changesPending) {
        return { tone: 'warn', label: 'Saved, not live yet · callers still hear ' + hears(o.publishedNoticeVersion), extra: '' };
    }
    return { tone: 'ok', label: o.publishedNoticeVersion
        ? 'Live · callers hear version ' + o.publishedNoticeVersion
        : 'Live · calls connect without a notice', extra: when };
}

export interface NoticeActions {
    /** The one primary button. */
    primary: {
        label: string;
        enabled: boolean;
        /** save = save only; publish = save, then publish. */
        run: 'save' | 'publish';
    };
    /** "Discard changes": reset the form to the saved notice. */
    discard: boolean;
    help: string;
    /** The "Remove from Twilio" section (published only). */
    removal: boolean;
}

/**
 * The action row of the recording notice: exactly one primary button.
 * A publish run disables everything ("Publishing… (15–30 s)").
 */
export function noticeActions(o: OutboundState): NoticeActions {
    const unsaved = outboundUnsaved(o);
    const running = o.publishRunning || o.publishing;
    const busy = running || o.saving || o.unpublishing;
    const out = (label: string, run: 'save' | 'publish', enabled: boolean, help: string, discard = false): NoticeActions =>
        ({ primary: { label, run, enabled: enabled && !busy }, discard, help, removal: o.published });
    if (running) return out(PUBLISHING_LABEL, 'publish', false, PUBLISH_CHANGES_HELP);
    if (!o.published) {
        return o.noticeOn
            ? out('Publish notice', 'publish', true, PUBLISH_NOTICE_HELP)
            : out(o.saving ? 'Saving…' : 'Save', 'save', unsaved, SAVE_OFF_HELP);
    }
    // Published: a broken or outdated Function needs a publish even with no changes.
    const repair = o.functionExists === false ? FUNCTION_MISSING_HELP
        : o.voiceUrlMatches === false ? VOICE_URL_HELP
        : o.needsRepublish ? REPUBLISH_HELP : '';
    const toPublish = unsaved || o.changesPending;
    if (!o.noticeOn && (toPublish || o.publishedNoticeVersion > 0)) {
        return out('Turn off notice', 'publish', true, TURN_OFF_HELP);
    }
    if (toPublish) return out('Publish changes', 'publish', true, PUBLISH_CHANGES_HELP, unsaved && o.noticeOn);
    if (repair) return out('Publish changes', 'publish', true, repair);
    return out('Publish changes', 'publish', false, NO_CHANGES_HELP);
}

/** "Live in Twilio": what callers hear now. */
export function liveNotice(o: OutboundState): { quote: string; note: string } | null {
    if (!o.published) return null;
    if (!o.publishedNoticeVersion) return { quote: '', note: 'No notice plays. Calls connect at once.' };
    if (o.publishedNoticeVersion === o.noticeVersion) {
        return { quote: '\u201C' + (o.savedNoticeText || o.defaultText) + '\u201D', note: '' };
    }
    return { quote: '', note: 'Version ' + o.publishedNoticeVersion + '. The saved text is newer and is not live yet.' };
}
