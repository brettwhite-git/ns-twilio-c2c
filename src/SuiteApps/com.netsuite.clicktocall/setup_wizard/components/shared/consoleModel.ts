/**
 * Console view model — pure helpers that turn health signals, phone rows
 * and form state into the text the console pages show. No store, no UIF
 * (type imports only), so jest can test every rule here.
 *
 * Signal value shapes: lib/ctc_health.js build* functions.
 */

import type {InboundSettings} from '../../app/InitialState';

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
