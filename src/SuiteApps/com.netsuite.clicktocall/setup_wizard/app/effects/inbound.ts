/**
 * Inbound effects — async action thunks for the Admin Console's
 * Inbound calls section.
 *
 * Server contract (ctc_sl_wizard_api.js):
 *   wizardLoadInbound    {} → {ok, inboundEnabled, ringSeconds, noAnswerMessage,
 *                              recordInbound, recordingNoticeOn, recordingNotice,
 *                              flowSid, publishedAt, routes:[...]}
 *   wizardSaveInbound    {inboundEnabled, ringSeconds, noAnswerMessage,
 *                         recordInbound, recordingNoticeOn, recordingNotice}
 *                          → {ok:true, settings, publish} | {ok:false, message}
 *   wizardPublishRouting {} → {ok:true, publish}
 */

import {store} from '../Store';
import {Action} from '../Action';
import {wizardCall} from '../../services/wizardApi';
import type {
    AppState,
    InboundPublishResult,
    InboundRoute,
    InboundSettings
} from '../InitialState';

interface Envelope {
    ok?: boolean;
    message?: string;
    error?: string;
}

const errorText = (e: unknown, fallback: string): string =>
    e instanceof Error && e.message ? e.message : fallback;

const failureText = (result: Envelope | null, fallback: string): string =>
    (result && (result.message || result.error)) || fallback;

/** Load the inbound settings, publish state and routing table. */
export async function loadInbound(): Promise<void> {
    store.dispatch(Action.inboundLoadStart());
    try {
        const result = (await wizardCall('wizardLoadInbound', {})) as
            (Envelope & Partial<InboundSettings> & {
                flowSid?: string;
                publishedAt?: string;
                routes?: InboundRoute[];
            }) | null;
        if (!result || result.ok !== true) {
            store.dispatch(Action.inboundLoadFailure(
                failureText(result, 'Could not load inbound settings')
            ));
            return;
        }
        store.dispatch(Action.inboundLoadSuccess({
            inboundEnabled: result.inboundEnabled === true,
            ringSeconds: Number(result.ringSeconds) || 20,
            noAnswerMessage: result.noAnswerMessage || '',
            recordInbound: result.recordInbound !== false,
            recordingNoticeOn: result.recordingNoticeOn === true,
            recordingNotice: result.recordingNotice || '',
            flowSid: result.flowSid || '',
            publishedAt: result.publishedAt || '',
            routes: Array.isArray(result.routes) ? result.routes : []
        }));
    } catch (e) {
        store.dispatch(Action.inboundLoadFailure(
            errorText(e, 'Could not load inbound settings')
        ));
    }
}

/** Save the form values; the server publishes routing in the same call. */
export async function saveInbound(): Promise<void> {
    const inbound = (store.getState() as AppState).inbound;
    const settings: InboundSettings = {
        inboundEnabled: inbound.inboundEnabled,
        ringSeconds: inbound.ringSeconds,
        noAnswerMessage: inbound.noAnswerMessage,
        recordInbound: inbound.recordInbound,
        recordingNoticeOn: inbound.recordingNoticeOn,
        recordingNotice: inbound.recordingNotice
    };
    store.dispatch(Action.inboundSave({ phase: 'start' }));
    try {
        const result = (await wizardCall('wizardSaveInbound', { ...settings })) as
            (Envelope & { settings?: InboundSettings; publish?: InboundPublishResult }) | null;
        if (!result || result.ok !== true) {
            store.dispatch(Action.inboundSave({
                phase: 'failure',
                error: failureText(result, 'Save failed')
            }));
            return;
        }
        store.dispatch(Action.inboundSave({
            phase: 'success',
            settings: result.settings || settings,
            publish: result.publish
        }));
    } catch (e) {
        store.dispatch(Action.inboundSave({ phase: 'failure', error: errorText(e, 'Save failed') }));
    }
}

/** Publish the routing flow again with the current settings. */
export async function publishRouting(): Promise<void> {
    store.dispatch(Action.inboundPublish({ phase: 'start' }));
    try {
        const result = (await wizardCall('wizardPublishRouting', {})) as
            (Envelope & { publish?: InboundPublishResult }) | null;
        if (!result || result.ok !== true) {
            store.dispatch(Action.inboundPublish({
                phase: 'failure',
                error: failureText(result, 'Publish failed')
            }));
            return;
        }
        store.dispatch(Action.inboundPublish({ phase: 'success', publish: result.publish }));
    } catch (e) {
        store.dispatch(Action.inboundPublish({ phase: 'failure', error: errorText(e, 'Publish failed') }));
    }
}
