/**
 * Voice effects — async action thunks for the Admin Console's Voice
 * section (U4 / Phase 3b) and per-field VIEW/EDIT save flow.
 *
 * Phase 2 (2026-05-28) — wraps the legacy `loadVoiceLists` + per-field
 * `saveVoiceField` callbacks (in components/sections/voice.ts and
 * AppController.tsx) as dispatch-based effects.
 */

import {store} from '../Store';
import {Action} from '../Action';
import {wizardCall} from '../../services/wizardApi';
import type {AppState, ConsoleState} from '../InitialState';

interface VoiceSnapshot {
    twimlAppSid?: string;
    phoneNumber?: string;
    intelServiceSid?: string;
}

/**
 * Load the three Voice-section dropdown source lists in parallel:
 * TwiML Apps, Phone Numbers, and Conversational Intelligence Services.
 *
 * Mirrors AppController/voice.ts loadVoiceLists. Stores into
 * console.voiceLists so the section's EDIT mode renders the picker.
 */
export async function loadVoiceLists(): Promise<void> {
    store.dispatch(Action.consoleLoadSuccess({ voiceListsLoading: true } as Partial<ConsoleState>));

    const safe = <T>(promise: Promise<T>): Promise<T | null> =>
        promise.catch(() => null);

    try {
        const [twiml, phones, intel] = await Promise.all([
            safe(wizardCall('wizardListTwiMLApps', {})),
            safe(wizardCall('wizardListPhoneNumbers', {})),
            safe(wizardCall('wizardListIntelServices', {}))
        ]);

        // All three Twilio list endpoints wrap results as { items: [...] }
        // — matches the legacy step3.ts loadStep3Lists extraction. Default
        // to [] (not null) so the dropdown opens to an empty state
        // instead of staying in the "loading" branch.
        const voiceLists = {
            twimlApps: (twiml && (twiml as { items?: unknown[] }).items) || [],
            phoneNumbers: (phones && (phones as { items?: unknown[] }).items) || [],
            intelServices: (intel && (intel as { items?: unknown[] }).items) || []
        };

        store.dispatch(Action.consoleLoadSuccess({
            voiceLists,
            voiceListsLoading: false
        } as Partial<ConsoleState>));
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Voice lists load failed';
        store.dispatch(Action.consoleLoadSuccess({
            voiceListsLoading: false,
            voiceError: msg
        } as Partial<ConsoleState>));
    }
}

/**
 * Save one Voice field (TwiML App SID / Phone Number / Intel Service
 * SID). Mirrors AppController.handleSaveVoiceField (paths 1279-1320).
 *
 * The server action `wizardSaveVoice` requires BOTH `twimlAppSid` and
 * `phoneNumber` in every payload (it was originally designed for Step 3
 * which posts all three voice SIDs at once). When the user edits a
 * single field on the admin console, we still have to bundle the
 * current snapshot for the other fields — otherwise the server rejects
 * with `missing_twimlAppSid` (or `missing_phone_number`). The store's
 * console.snapshot holds the live config; merge the new value over it.
 */
export async function saveVoiceField(
    field: NonNullable<ConsoleState['voiceEditing']>,
    value: string
): Promise<void> {
    store.dispatch(Action.voiceFieldSave({ phase: 'start' }));

    const state = store.getState() as AppState;
    const snap = (state.console.snapshot as VoiceSnapshot | null) || {};

    const payload: Record<string, unknown> = {
        twimlAppSid: snap.twimlAppSid || '',
        phoneNumber: snap.phoneNumber || '',
        intelServiceSid: snap.intelServiceSid || ''
    };
    payload[field] = value;

    try {
        const result = await wizardCall('wizardSaveVoice', payload);
        const saved = result && ((result as { saved?: boolean }).saved === true);
        if (!saved) {
            const err = (result && (result as { error?: string }).error) || 'Voice save failed';
            store.dispatch(Action.voiceFieldSave({ phase: 'failure', error: err }));
            return;
        }
        store.dispatch(Action.voiceFieldSave({ phase: 'success', field, value }));
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Voice save failed';
        store.dispatch(Action.voiceFieldSave({ phase: 'failure', error: msg }));
    }
}
