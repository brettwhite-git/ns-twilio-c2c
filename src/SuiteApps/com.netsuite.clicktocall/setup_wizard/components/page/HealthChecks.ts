/**
 * Health check rows — pure builders for the Health page's drift table
 * (HealthPage.tsx). Each row comes from real data or reads "Not checked";
 * none defaults to a pass.
 *   voiceUrlDriftRow      Twilio app → published dial function (wizardLoadOutbound)
 *   outboundVersionRow    published Function code = installed code
 *   phoneNumbersDriftRow  signal numberRouting, else the Phones & reps list
 *   intelDriftRow         signal intelligence, else the Twilio service list
 *   signalRow             any health signal as a row status
 */

import type {AppState, HealthSignal, HealthState, OutboundState} from '../../app/InitialState';
import {formatPhone} from '../shared/formatPhone';
import {friendlyError} from '../shared/friendlyError';
import type {Tone} from '../shared/consoleModel';

export interface CheckItem {
    id?: string;
    label?: string;
    status?: string;
    detail?: string;
}

interface DriftSnapshot {
    voiceUrl?: string;
}

interface ConfigSnapshot {
    phoneNumber?: string;
    intelServiceSid?: string;
}

interface TwilioNumber {
    sid?: string;
    phoneNumber?: string;
}

interface TwilioService {
    sid?: string;
}

interface AssignmentRef {
    phoneSid?: string;
    phoneNumber?: string;
}

/** Check status → chip text and canvas tone (consoleStyles chip classes). */
export const statusToBadge = (status: string): { text: string; tone: Tone | 'neutral' } => {
    switch (status) {
        case 'pass': return { text: 'Pass', tone: 'ok' };
        case 'fail': return { text: 'Fail', tone: 'problem' };
        case 'warn': return { text: 'Needs action', tone: 'warn' };
        case 'info_enabled': return { text: 'Enabled', tone: 'info' };
        case 'info_disabled': return { text: 'Disabled', tone: 'neutral' };
        case 'unknown': return { text: 'Not checked', tone: 'neutral' };
        case 'not_published': return { text: 'Not published', tone: 'neutral' };
        default: return { text: status || '—', tone: 'neutral' };
    }
};

/**
 * The 'TwiML VoiceUrl' drift row: does the TwiML App's Voice URL point at
 * the published outbound Function (drift.voiceUrl from wizardLoadOutbound)?
 * 'unknown' shows as a neutral "Not checked", never as a pass.
 */
export const voiceUrlDriftRow = (drift: DriftSnapshot, outbound: OutboundState): CheckItem => {
    const row = { label: 'Twilio app points at our dial function' };
    if (outbound.loaded && !outbound.published) {
        return { ...row, status: 'not_published', detail: '' };
    }
    // The app can still point at a Function that was deleted in Twilio:
    // then every outbound call fails, so this is not a pass.
    if (outbound.functionExists === false) {
        return { ...row, status: 'fail', detail: outbound.functionMessage ||
            'The outbound Function is missing in Twilio. Publish again.' };
    }
    if (drift.voiceUrl === 'pass') return { ...row, status: 'pass', detail: 'Voice URL matches' };
    if (drift.voiceUrl === 'fail') {
        return { ...row, status: 'fail', detail: 'Voice URL does not point at the published Function.' };
    }
    return { ...row, status: 'unknown', detail: '' };
};

/**
 * The 'Outbound notice version' row: is the published Function the
 * SuiteApp's current code version (needsRepublish from wizardLoadOutbound)?
 */
export const outboundVersionRow = (outbound: OutboundState): CheckItem => {
    const row = { label: 'Recording notice code is current' };
    if (!outbound.loaded) return { ...row, status: 'unknown', detail: '' };
    if (!outbound.published) return { ...row, status: 'not_published', detail: '' };
    if (outbound.needsRepublish) {
        return { ...row, status: 'warn', detail: 'A newer version is available. Republish on the Outbound calls page.' };
    }
    return {
        ...row,
        status: 'pass',
        detail: 'Published ' + (outbound.publishedCodeVersion || '—') + ' · installed ' + (outbound.codeVersion || '—')
    };
};

/**
 * A health signal (wizardLoadHealth) as a drift row status, or null when
 * the signal is missing or 'unknown' (the caller then falls back to the
 * data the console already has).
 */
export const signalRow = (label: string, sig: HealthSignal | undefined): CheckItem | null => {
    if (!sig || sig.severity === 'unknown') return null;
    const status = sig.severity === 'ok' ? 'pass' : sig.severity === 'problem' ? 'fail' : 'warn';
    return { label, status, detail: sig.detail };
};

/**
 * The 'Phone numbers' drift row: are the default caller ID and every
 * routed number still in the Twilio account, and (inbound on) on the
 * routing flow? Uses the health signal numberRouting (one Twilio list
 * read by wizardLoadHealth). Without it, computed from data the console
 * already has (the Phones & reps Twilio list); without that list the
 * row is a neutral "Not checked", never a pass.
 */
export const phoneNumbersDriftRow = (c: AppState['console'], health?: HealthState): CheckItem => {
    const fromSignal = signalRow('Phone numbers still in Twilio', health && health.signals.numberRouting);
    if (fromSignal) return fromSignal;
    const row = { label: 'Phone numbers still in Twilio' };
    const numbers = c.phonesNumbers as TwilioNumber[] | null;
    if (c.phonesListError) {
        return { ...row, status: 'unknown', detail: 'The Twilio number list did not load: ' + friendlyError(c.phonesListError) };
    }
    if (numbers === null || c.assignments === null) {
        return { ...row, status: 'unknown', detail: 'Open Phones & reps to check the numbers against Twilio.' };
    }
    const sids: Record<string, boolean> = {};
    const e164s: Record<string, boolean> = {};
    numbers.forEach((n) => {
        if (n.sid) sids[n.sid] = true;
        if (n.phoneNumber) e164s[n.phoneNumber] = true;
    });
    const missing: string[] = [];
    const snap = (c.snapshot || {}) as ConfigSnapshot;
    if (snap.phoneNumber && !e164s[snap.phoneNumber]) missing.push(formatPhone(snap.phoneNumber));
    const seen: Record<string, boolean> = {};
    (c.assignments as AssignmentRef[]).forEach((a) => {
        if (!a.phoneSid || seen[a.phoneSid]) return;
        seen[a.phoneSid] = true;
        if (!sids[a.phoneSid]) missing.push(formatPhone(a.phoneNumber) || a.phoneSid);
    });
    if (missing.length === 0) {
        return { ...row, status: 'pass', detail: 'The default caller ID and every assigned number are in Twilio.' };
    }
    if (c.phonesHasMore) {
        return { ...row, status: 'unknown', detail: 'Twilio lists more numbers than were loaded; not checked.' };
    }
    return { ...row, status: 'fail', detail: 'Not in the Twilio account: ' + missing.join(', ') };
};

/**
 * The 'Intelligence service' drift row: is the saved service in the
 * Twilio account with auto-transcribe on? Uses the health signal
 * intelligence (wizardLoadHealth). Without it, only with real data (the
 * Voice page's Twilio list); else a neutral "Not checked".
 */
export const intelDriftRow = (c: AppState['console'], health?: HealthState): CheckItem => {
    const fromSignal = signalRow('Transcription service auto-transcribes', health && health.signals.intelligence);
    if (fromSignal) return fromSignal;
    const row = { label: 'Transcription service auto-transcribes' };
    const snap = (c.snapshot || {}) as ConfigSnapshot;
    if (c.snapshot && !snap.intelServiceSid) {
        return { ...row, status: 'info_disabled', detail: 'No Intelligence service is set (no transcripts).' };
    }
    const services = c.voiceLists.intelServices as TwilioService[] | null;
    if (c.voiceListErrors.intelServices || services === null || !snap.intelServiceSid) {
        return { ...row, status: 'unknown', detail: '' };
    }
    return services.some((sv) => sv.sid === snap.intelServiceSid)
        ? { ...row, status: 'pass', detail: '' }
        : { ...row, status: 'fail', detail: 'The saved service is not in the Twilio account.' };
};
