/**
 * Outbound recording notice effects — async action thunks for the
 * "Outbound recording notice" section of the Voice page.
 *
 * Server contract (ctc_sl_wizard_api.js):
 *   wizardLoadOutbound      {} → {ok, noticeOn, noticeText, noticeVersion,
 *                                 defaultText, maxLength, appSid, functionUrl,
 *                                 prevVoiceUrl, publishedAt, publishedCodeVersion,
 *                                 codeVersion, needsRepublish, published, pending,
 *                                 voiceUrlMatches, publishedNoticeVersion, changesPending,
 *                                 functionExists?, functionMessage?,
 *                                 drift:{voiceUrl, functionCode, functionService}}
 *   wizardSaveOutbound      {noticeOn, noticeText} → same as load | {ok:false, error}
 *   wizardPublishOutbound   {resume?} → {ok, pending?, steps:[{key, label, status, detail}], state}
 *   wizardUnpublishOutbound {} → {ok, steps, state}
 *
 * Notice off and not published: "Save" calls only wizardSaveOutbound.
 * Every snapshot also resets the saved baseline (savedNoticeOn / Text)
 * in the reducer; a publish run is wrapped in op 'run' (publishRunning).
 *
 * Every payload that carries the load shape also refreshes the Health
 * "TwiML VoiceUrl" drift row (console.drift.voiceUrl).
 */

import {store} from '../Store';
import {Action} from '../Action';
import {wizardCall} from '../../services/wizardApi';
import type {
    AppState,
    OutboundDrift,
    OutboundSnapshot,
    OutboundStep,
    OutboundStepStatus
} from '../InitialState';

interface Envelope {
    ok?: boolean;
    message?: string;
    error?: string;
}

type RawSnapshot = Record<string, unknown> & { drift?: { voiceUrl?: unknown } };

interface RawRun extends Envelope {
    pending?: boolean;
    steps?: unknown;
    state?: RawSnapshot;
}

const STEP_STATUSES: OutboundStepStatus[] = ['ok', 'skipped', 'failed', 'pending'];
const DRIFT_STATUSES: OutboundDrift[] = ['pass', 'fail', 'unknown'];

const str = (v: unknown): string => (v == null ? '' : String(v));

const errorText = (e: unknown, fallback: string): string =>
    e instanceof Error && e.message ? e.message : fallback;

const failureText = (result: Envelope | null, fallback: string): string =>
    (result && (result.error || result.message)) || fallback;

/** Normalise the load payload (also save's reply and publish's `state`). */
export const toSnapshot = (raw: RawSnapshot): OutboundSnapshot => {
    const drift = raw.drift && raw.drift.voiceUrl;
    return {
        noticeOn: raw.noticeOn === true,
        noticeText: str(raw.noticeText),
        noticeVersion: Number(raw.noticeVersion) || 0,
        defaultText: str(raw.defaultText),
        maxLength: Number(raw.maxLength) || 300,
        appSid: str(raw.appSid),
        functionUrl: str(raw.functionUrl),
        prevVoiceUrl: str(raw.prevVoiceUrl),
        publishedAt: str(raw.publishedAt),
        publishedCodeVersion: str(raw.publishedCodeVersion),
        codeVersion: str(raw.codeVersion),
        needsRepublish: raw.needsRepublish === true,
        published: raw.published === true,
        pending: raw.pending === true,
        voiceUrlMatches: typeof raw.voiceUrlMatches === 'boolean' ? raw.voiceUrlMatches : null,
        driftVoiceUrl: DRIFT_STATUSES.indexOf(drift as OutboundDrift) >= 0
            ? drift as OutboundDrift
            : 'unknown',
        publishedNoticeVersion: Number(raw.publishedNoticeVersion) || 0,
        changesPending: raw.changesPending === true,
        allowedPrefixes: str(raw.allowedPrefixes),
        allowedSource: str(raw.allowedSource),
        publishedAllowedPrefixes: str(raw.publishedAllowedPrefixes),
        allowListPending: raw.allowListPending === true,
        functionExists: typeof raw.functionExists === 'boolean' ? raw.functionExists : null,
        functionMessage: str(raw.functionMessage)
    };
};

/** Normalise a publish / unpublish step list. */
export const toSteps = (raw: unknown): OutboundStep[] => {
    if (!Array.isArray(raw)) return [];
    return raw.map((s: Record<string, unknown>) => {
        const raw = (s && s.status) as OutboundStepStatus;
        const status: OutboundStepStatus = STEP_STATUSES.indexOf(raw) >= 0 ? raw : 'pending';
        return {
            key: str(s && s.key),
            label: str(s && (s.label || s.key)),
            status,
            detail: str(s && s.detail)
        };
    });
};

/** Error text of a failed run: server error, else the first failed step. */
const runFailureText = (result: RawRun | null, steps: OutboundStep[], fallback: string): string => {
    if (result && (result.error || result.message)) return failureText(result, fallback);
    const failed = steps.filter((s) => s.status === 'failed')[0];
    if (failed) return failed.detail ? failed.label + ': ' + failed.detail : failed.label;
    return fallback;
};

/** Copy the live Voice URL check into the Health drift rows. */
const setDrift = (snapshot: OutboundSnapshot): void => {
    const current = ((store.getState() as AppState).console.drift || {}) as Record<string, unknown>;
    store.dispatch(Action.consoleDriftSet({ ...current, voiceUrl: snapshot.driftVoiceUrl }));
};

/** Load the notice settings and publish state. */
export async function loadOutbound(): Promise<void> {
    store.dispatch(Action.outboundLoadStart());
    try {
        const result = (await wizardCall('wizardLoadOutbound', {})) as (Envelope & RawSnapshot) | null;
        if (!result || result.ok !== true) {
            store.dispatch(Action.outboundLoadFailure(
                failureText(result, 'Could not load the outbound recording notice')
            ));
            return;
        }
        const snapshot = toSnapshot(result);
        store.dispatch(Action.outboundLoadSuccess(snapshot));
        setDrift(snapshot);
    } catch (e) {
        store.dispatch(Action.outboundLoadFailure(
            errorText(e, 'Could not load the outbound recording notice')
        ));
    }
}

/** Auto "Check again": the Twilio build takes about 15-20 s, longer than one request can wait. */
const AUTO_RESUME_TRIES = 6;
const AUTO_RESUME_DELAY_MS = 5000;
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run wizardPublishOutbound (resume = "Check again" on a running build).
 * Resolves true when the build is still pending (and nothing failed).
 */
async function runPublish(resume: boolean): Promise<boolean> {
    store.dispatch(Action.outboundRequest({ op: 'publish', phase: 'start' }));
    try {
        const result = (await wizardCall(
            'wizardPublishOutbound',
            resume ? { resume: true } : {}
        )) as RawRun | null;
        const steps = toSteps(result && result.steps);
        const snapshot = result && result.state ? toSnapshot(result.state) : undefined;
        const pending = !!result && (result.pending === true || (!!snapshot && snapshot.pending));
        // A pending build comes back ok:false; it is not a failure.
        const failed = (!result || result.ok !== true) && !pending;
        store.dispatch(Action.outboundRequest({
            op: 'publish',
            phase: 'done',
            snapshot,
            pending,
            steps,
            error: failed ? runFailureText(result, steps, 'Publish failed') : null
        }));
        if (snapshot) setDrift(snapshot);
        return pending && !steps.some((st) => st.status === 'failed');
    } catch (e) {
        store.dispatch(Action.outboundRequest({
            op: 'publish',
            phase: 'done',
            error: errorText(e, 'Publish failed')
        }));
        return false;
    }
}

/** Keep checking a pending build a few times before leaving it to "Check again". */
async function publishUntilSettled(resume: boolean): Promise<void> {
    let pending = await runPublish(resume);
    for (let i = 0; pending && i < AUTO_RESUME_TRIES; i++) {
        await delay(AUTO_RESUME_DELAY_MS);
        pending = await runPublish(true);
    }
}

/**
 * Mark a whole publish run (save, publish, the automatic "Check again"
 * tries and the waits between them) so the page stays in "Publishing…"
 * and every control stays disabled until it ends.
 */
async function asPublishRun(work: () => Promise<void>): Promise<void> {
    store.dispatch(Action.outboundRequest({ op: 'run', phase: 'start' }));
    try {
        await work();
    } finally {
        store.dispatch(Action.outboundRequest({ op: 'run', phase: 'done' }));
    }
}

/**
 * Save the form values, then (publish = true) publish the Function.
 * The page passes publish = false when the notice is off and nothing is
 * published yet: there is nothing to put in Twilio.
 */
export function saveAndPublishOutbound(publish = true): Promise<void> {
    return publish ? asPublishRun(() => saveThenPublish(true)) : saveThenPublish(false);
}

async function saveThenPublish(publish: boolean): Promise<void> {
    const outbound = (store.getState() as AppState).outbound;
    store.dispatch(Action.outboundRequest({ op: 'save', phase: 'start' }));
    try {
        const result = (await wizardCall('wizardSaveOutbound', {
            noticeOn: outbound.noticeOn,
            noticeText: outbound.noticeText
        })) as (Envelope & RawSnapshot) | null;
        if (!result || result.ok !== true) {
            store.dispatch(Action.outboundRequest({
                op: 'save',
                phase: 'done',
                error: failureText(result, 'Save failed')
            }));
            return;
        }
        const snapshot = toSnapshot(result);
        store.dispatch(Action.outboundRequest({ op: 'save', phase: 'done', snapshot }));
        setDrift(snapshot);
    } catch (e) {
        store.dispatch(Action.outboundRequest({
            op: 'save',
            phase: 'done',
            error: errorText(e, 'Save failed')
        }));
        return;
    }
    if (publish) await publishUntilSettled(false);
}

/** "Check again" while the Twilio build is still running. */
export function resumePublishOutbound(): Promise<void> {
    return asPublishRun(() => publishUntilSettled(true));
}

/** Remove from Twilio: restore the previous Voice URL, delete the Function. */
export async function unpublishOutbound(): Promise<void> {
    store.dispatch(Action.outboundRequest({ op: 'unpublish', phase: 'start' }));
    try {
        const result = (await wizardCall('wizardUnpublishOutbound', {})) as RawRun | null;
        const steps = toSteps(result && result.steps);
        const snapshot = result && result.state ? toSnapshot(result.state) : undefined;
        const failed = !result || result.ok !== true;
        store.dispatch(Action.outboundRequest({
            op: 'unpublish',
            phase: 'done',
            snapshot,
            steps,
            error: failed ? runFailureText(result, steps, 'Unpublish failed') : null
        }));
        if (snapshot) setDrift(snapshot);
    } catch (e) {
        store.dispatch(Action.outboundRequest({
            op: 'unpublish',
            phase: 'done',
            error: errorText(e, 'Unpublish failed')
        }));
    }
}
