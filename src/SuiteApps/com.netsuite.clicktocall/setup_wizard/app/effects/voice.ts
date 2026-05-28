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
import type {ConsoleState} from '../InitialState';

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

        const voiceLists = {
            twimlApps: (twiml && (twiml as { apps?: unknown[] }).apps) || null,
            phoneNumbers: (phones && (phones as { phones?: unknown[] }).phones) || null,
            intelServices: (intel && (intel as { services?: unknown[] }).services) || null
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
 * The server action `wizardSaveVoice` accepts a single field update
 * and persists it to the config record.
 */
export async function saveVoiceField(
    field: NonNullable<ConsoleState['voiceEditing']>,
    value: string
): Promise<void> {
    store.dispatch(Action.voiceFieldSave({ phase: 'start' }));

    try {
        const payload: Record<string, unknown> = { [field]: value };
        const result = await wizardCall('wizardSaveVoice', payload);
        if (result && (result as { ok?: boolean }).ok === false) {
            const err = (result as { error?: string }).error || 'Voice save failed';
            store.dispatch(Action.voiceFieldSave({ phase: 'failure', error: err }));
            return;
        }
        store.dispatch(Action.voiceFieldSave({ phase: 'success', field, value }));
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Voice save failed';
        store.dispatch(Action.voiceFieldSave({ phase: 'failure', error: msg }));
    }
}
