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
import type {ConsoleState, VoiceListKey} from '../InitialState';

/**
 * Load the three Voice-section dropdown source lists in parallel:
 * TwiML Apps, Phone Numbers, and Conversational Intelligence Services.
 *
 * Mirrors AppController/voice.ts loadVoiceLists. Stores into
 * console.voiceLists so the section's EDIT mode renders the picker.
 */
export async function loadVoiceLists(): Promise<void> {
    store.dispatch(Action.consolePatch({ voiceListsLoading: true, voiceListErrors: {} }));

    // Each list keeps its own error: a Twilio failure must not read as
    // "(no items found)".
    const fetchList = async (action: string): Promise<{ items: unknown[]; error?: string }> => {
        try {
            const r = (await wizardCall(action, {})) as
                { items?: unknown[]; error?: string; errorMessage?: string } | null;
            const items = (r && Array.isArray(r.items)) ? r.items : [];
            const error = r && (r.errorMessage || r.error);
            return error ? { items, error: String(error) } : { items };
        } catch (e) {
            return { items: [], error: e instanceof Error && e.message ? 'Network: ' + e.message : 'load_failed' };
        }
    };

    const [twiml, phones, intel] = await Promise.all([
        fetchList('wizardListTwiMLApps'),
        fetchList('wizardListPhoneNumbers'),
        fetchList('wizardListIntelServices')
    ]);

    const voiceListErrors: Partial<Record<VoiceListKey, string>> = {};
    if (twiml.error) voiceListErrors.twimlApps = twiml.error;
    if (phones.error) voiceListErrors.phoneNumbers = phones.error;
    if (intel.error) voiceListErrors.intelServices = intel.error;

    store.dispatch(Action.consolePatch({
        voiceLists: {
            twimlApps: twiml.items,
            phoneNumbers: phones.items,
            intelServices: intel.items
        },
        voiceListErrors,
        voiceListsLoading: false
    }));
}

/**
 * Save one Voice field (TwiML App SID / Phone Number / Intel Service
 * SID). Mirrors AppController.handleSaveVoiceField (paths 1279-1320).
 *
 * Sends ONLY the edited field with `partial: true` (2026-11-03): the
 * server writes just that field, so a stale snapshot of the other two
 * can no longer overwrite another admin's change. The server refuses a
 * TwiML App change while the outbound recording notice is published
 * (`error: 'outbound_published'`, `errorMessage` says what to do).
 */
export async function saveVoiceField(
    field: NonNullable<ConsoleState['voiceEditing']>,
    value: string
): Promise<void> {
    store.dispatch(Action.voiceFieldSave({ phase: 'start' }));

    const payload: Record<string, unknown> = { partial: true };
    payload[field] = value;
    // "(none)" for the optional Intelligence service clears it (an empty
    // value alone means "keep" to the server).
    if (field === 'intelServiceSid' && !value) payload.clearIntelService = true;

    try {
        const result = await wizardCall('wizardSaveVoice', payload);
        const saved = result && ((result as { saved?: boolean }).saved === true);
        if (!saved) {
            const r = (result || {}) as { error?: string; errorMessage?: string };
            const err = r.errorMessage || r.error || 'Voice save failed';
            store.dispatch(Action.voiceFieldSave({ phase: 'failure', error: err }));
            return;
        }
        store.dispatch(Action.voiceFieldSave({ phase: 'success', field, value }));
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Voice save failed';
        store.dispatch(Action.voiceFieldSave({ phase: 'failure', error: msg }));
    }
}
