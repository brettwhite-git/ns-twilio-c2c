// @ts-check
/**
 * Voice config section — U4 (Phase 3b).
 *
 * Three per-field rows, each with a VIEW/EDIT toggle:
 *   - twimlAppSid     — TwiML application that handles outbound routing
 *   - phoneNumber     — default outbound caller-ID number
 *   - intelServiceSid — optional Conversational Intelligence service
 *
 * Per-field editing (not all-at-once) matches the "fix one thing"
 * pattern admins expect from a management surface — avoids the
 * stepper-style all-or-nothing form. Each field has its own lazy-loaded
 * dropdown source list cached in STATE.console.voiceLists.
 *
 * Path B.3i (2026-05-27) — extracted from SpaClient.ts. Self-contained
 * state machine: Change → Edit → Save/Cancel → View, all driven by
 * STATE.console.voiceEditing + voicePendingValue + voiceSaving. The
 * three click handlers + their helpers live in this module; only
 * rerender is injected via VoiceSectionDeps.
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import { safeNew } from '../render/primitives';
import { STATE } from '../state';
import { wizardCall } from '../wizard_api_client';
import type { EnumsBag } from '../render/shell';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface VoiceSectionDeps {
    /** Force-rebuild of the SPA root tree after state mutation. */
    rerender: () => void;
}

/** Snapshot fields the voice section reads. */
interface VoiceSnapshot {
    twimlAppSid?: string;
    phoneNumber?: string;
    intelServiceSid?: string;
    [key: string]: string | undefined;
}

/** Mutable voice-field state-machine key. */
type VoiceField = 'twimlAppSid' | 'phoneNumber' | 'intelServiceSid';

/** Dropdown list keys in STATE.console.voiceLists. */
type VoiceListKey = 'twimlApps' | 'phoneNumbers' | 'intelServices';

/** Spec for one voice field row. */
interface VoiceFieldSpec {
    field: VoiceField;
    label: string;
    value: string | undefined;
    helpText: string;
    /**
     * Path C-5: Twilio docs URL for the field. Opens in a new tab via
     * a "Twilio docs ↗" Button under the help text. Omit to hide the
     * link.
     */
    docUrl?: string;
    allowEmpty?: boolean;
}

/**
 * Path C-5: Twilio docs URLs for each voice config field. Public docs,
 * no auth required. All three verified via WebFetch (200 OK + content
 * relevance check) on 2026-05-27 — these point at the most specific
 * canonical doc for each wizard field rather than generic landings:
 *
 *   - twimlApp:     REST API: Applications — documents the TwiML
 *                   Application resource the wizard configures
 *                   (the dropdown lists Application SIDs from this API)
 *   - phoneNumber:  IncomingPhoneNumber resource — documents the exact
 *                   resource the wizard's caller-ID dropdown queries
 *                   (Twilio-owned numbers in the account, the set you
 *                   can use as outbound caller IDs)
 *   - intelService: Conversation Intelligence — the current canonical
 *                   Voice Intelligence landing (URL still says "voice/
 *                   intelligence" and page is labelled "classic" but
 *                   this is where the product docs live)
 */
const TWILIO_DOCS = {
    twimlApp: 'https://www.twilio.com/docs/usage/api/applications',
    phoneNumber: 'https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource',
    intelService: 'https://www.twilio.com/docs/voice/intelligence'
};

/** One item in a Twilio list response. */
interface TwilioListItem {
    sid?: string;
    phoneNumber?: string;
    friendlyName?: string;
}

// ─────────────────────────────────────────────────────────────────────
// buildVoiceSection — section root
// ─────────────────────────────────────────────────────────────────────

export const buildVoiceSection = (d: EnumsBag, deps: VoiceSectionDeps): unknown => {
    const snap = (STATE.console.snapshot || {}) as VoiceSnapshot;
    const items: unknown[] = [];

    // Section-level Heading dropped — ApplicationHeader subtitle shows
    // "Voice config" at the page chrome.

    const intro = safeNew(d.T, {
        text: 'Manage TwiML application, default outbound caller-ID ' +
              'number, and optional Conversational Intelligence ' +
              'service. Changes save immediately and apply to the ' +
              'next call placed.',
        type: d.T_Type.WEAK
    }, 'Text(voice-intro)');
    if (intro) items.push(intro);

    if (STATE.console.voiceError) {
        const err = safeNew(d.T, {
            text: '✕ ' + STATE.console.voiceError,
            type: d.T_Type.STRONG
        }, 'Text(voice-error)');
        if (err) items.push(err);
    }

    items.push(buildVoiceFieldRow(d, deps, {
        field: 'twimlAppSid',
        label: 'TwiML Application',
        value: snap.twimlAppSid,
        helpText: 'The Twilio application that handles outbound call ' +
            'routing. The wizard registers this app\'s VoiceUrl with ' +
            'the CTC Suitelet, so every call a rep places hits ' +
            'NetSuite first for screening before connecting to Twilio.',
        docUrl: TWILIO_DOCS.twimlApp
    }));

    items.push(buildVoiceFieldRow(d, deps, {
        field: 'phoneNumber',
        label: 'Default outbound caller-ID',
        value: snap.phoneNumber,
        helpText: 'Number reps see as their outbound caller ID. ' +
            'Specific rep-to-number assignments override this default ' +
            '— see Phones & reps section to assign different numbers ' +
            'to individual reps.',
        docUrl: TWILIO_DOCS.phoneNumber
    }));

    items.push(buildVoiceFieldRow(d, deps, {
        field: 'intelServiceSid',
        label: 'Conversational Intelligence',
        value: snap.intelServiceSid,
        helpText: 'Twilio Conversational Intelligence service that ' +
            'transcribes call audio and powers the AI summary, tone ' +
            'keywords, and satisfaction scoring on Phone Call records. ' +
            'Required for the AI analysis pipeline.',
        docUrl: TWILIO_DOCS.intelService
    }));

    if (items.length === 0) return safeNew(d.T, { text: 'Voice config' }, 'Text(voice-empty)');
    return safeNew(d.SP, {
        items: items.filter((c) => c != null),
        orientation: d.SP_Orient.VERTICAL,
        itemGap: d.SP_Gap.L
    }, 'StackPanel(voice)');
};

// ─────────────────────────────────────────────────────────────────────
// Per-field row — VIEW or EDIT depending on voiceEditing
// ─────────────────────────────────────────────────────────────────────

/**
 * One field row — VIEW mode by default, swaps to EDIT when this
 * field is the active `voiceEditing` target.
 *
 * Path C-5: row uses a 3-column GridPanel: [label | help+doc-link |
 * value/edit-controls]. Previous version stacked label+help vertically
 * on the left with value/controls on the right (HORIZONTAL StackPanel
 * + SPACE_BETWEEN). The 3-column shape makes better use of admin-
 * console width and gives the per-field Twilio docs link a natural
 * home next to its description.
 */
const buildVoiceFieldRow = (d: EnumsBag, deps: VoiceSectionDeps, spec: VoiceFieldSpec): unknown => {
    const isEditing = STATE.console.voiceEditing === spec.field;
    const ButtonType = component.Button.Type;

    const labelText = safeNew(d.T, {
        text: spec.label,
        type: d.T_Type.STRONG
    }, 'Text(voice-label-' + spec.field + ')');

    // Path C-5 v5: "Twilio docs ↗" moves from the 4th column back to
    // inline below the label, matching the Credentials section pattern.
    // Native component.Link with target=BLANK — NetSuite-blue link
    // color from the UIF theme.
    const docLink = spec.docUrl ? safeNew(component.Link, {
        content: 'Twilio docs ↗',
        url: spec.docUrl,
        target: component.Link.Target.BLANK
    }, 'Link(voice-doc-' + spec.field + ')') : null;

    // Label cell stacks [STRONG label, doc link] vertically so the link
    // sits with the field name at the row start instead of at the row's
    // far right end.
    const labelCell = docLink ? safeNew(d.SP, {
        items: [labelText, docLink].filter((c) => c != null),
        orientation: d.SP_Orient.VERTICAL,
        itemGap: d.SP_Gap.XXS,
        alignment: (d.SP.Alignment && d.SP.Alignment.START) || undefined
    }, 'StackPanel(voice-label-cell-' + spec.field + ')') : labelText;

    const help = safeNew(d.T, {
        text: spec.helpText,
        type: d.T_Type.WEAK,
        size: d.T.Size && d.T.Size.S
    }, 'Text(voice-help-' + spec.field + ')');

    const rightSideRaw = isEditing
        ? buildVoiceEditControls(d, deps, spec)
        : buildVoiceViewControls(d, deps, spec, ButtonType);

    // Path C-5 v3: wrap value+controls in a ContentPanel with
    // horizontalAlignment END so the content (value text + Change button,
    // or Dropdown+Save+Cancel in edit mode) sits flush against the right
    // edge of its grid cell.
    const rightSide = d.CP ? safeNew(d.CP, {
        content: rightSideRaw,
        horizontalAlignment: d.CP_HAlign.END
    }, 'ContentPanel(voice-right-align-' + spec.field + ')') || rightSideRaw
                            : rightSideRaw;

    // 3-column GridPanel: label+doc (narrow) | help (wide) | value+controls.
    // Falls back to a vertical stack if GridPanel construction fails.
    const cells = [labelCell, help, rightSide].filter((c) => c != null);
    const grid = safeNew(d.GP, {
        columns: '1fr 3fr 2fr',
        rows: 'auto',
        items: cells,
        columnGap: (d.GP_Gap && d.GP_Gap.L) || undefined
    }, 'GridPanel(voice-row-' + spec.field + ')') || safeNew(d.SP, {
        items: cells,
        orientation: d.SP_Orient.VERTICAL,
        itemGap: d.SP_Gap.S
    }, 'StackPanel(voice-row-fallback-' + spec.field + ')');

    if (d.CP) {
        return safeNew(d.CP, {
            content: grid,
            outerGap: (d.CP_Gap && d.CP_Gap.M) || undefined,
            horizontalAlignment: d.CP_HAlign.STRETCH
        }, 'ContentPanel(voice-row-pad-' + spec.field + ')') || grid;
    }
    return grid;
};

// ─────────────────────────────────────────────────────────────────────
// VIEW controls — value text + Change button
// ─────────────────────────────────────────────────────────────────────

const buildVoiceViewControls = (
    d: EnumsBag,
    deps: VoiceSectionDeps,
    spec: VoiceFieldSpec,
    ButtonType: Record<string, unknown>
): unknown => {
    const valueText = spec.value
        ? safeNew(d.T, {
            text: spec.value,
            type: d.T_Type.DEFAULT
        }, 'Text(voice-value-' + spec.field + ')')
        : safeNew(d.T, {
            text: '(not configured)',
            type: d.T_Type.WEAK
        }, 'Text(voice-empty-' + spec.field + ')');

    const changeBtn = safeNew(component.Button, {
        label: 'Change',
        type: ButtonType.DEFAULT,
        action: (): void => { onVoiceChangeClick(deps, spec.field, !!spec.allowEmpty); }
    }, 'Button(voice-change-' + spec.field + ')');

    return safeNew(d.SP, {
        items: [valueText, changeBtn].filter((c) => c != null),
        orientation: d.SP_Orient.HORIZONTAL,
        itemGap: d.SP_Gap.M
    }, 'StackPanel(voice-view-' + spec.field + ')');
};

// ─────────────────────────────────────────────────────────────────────
// EDIT controls — Dropdown + Save + Cancel
// ─────────────────────────────────────────────────────────────────────

const buildVoiceEditControls = (
    d: EnumsBag,
    deps: VoiceSectionDeps,
    spec: VoiceFieldSpec
): unknown => {
    const ButtonType = component.Button.Type as Record<string, unknown>;

    // Lists still loading? Show a placeholder.
    const listKey = voiceListKeyFor(spec.field);
    const list = listKey ? STATE.console.voiceLists[listKey] as TwilioListItem[] | null : null;
    if (list === null || STATE.console.voiceListsLoading) {
        const loader = safeNew(component.Loader, {
            label: 'Loading from Twilio…',
            indeterminate: true
        }, 'Loader(voice-list-' + spec.field + ')');
        return loader || safeNew(d.T, { text: 'Loading from Twilio…' }, 'Text(voice-loading)');
    }

    if (list.length === 0) {
        const emptyText = safeNew(d.T, {
            text: '(no items found in Twilio for this account)',
            type: d.T_Type.WEAK
        }, 'Text(voice-empty-list-' + spec.field + ')');
        const cancelBtnE = safeNew(component.Button, {
            label: 'Cancel',
            type: ButtonType.DEFAULT,
            action: (): void => { onVoiceCancelClick(deps); }
        }, 'Button(voice-cancel-empty-' + spec.field + ')');
        return safeNew(d.SP, {
            items: [emptyText, cancelBtnE].filter((c) => c != null),
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.M
        }, 'StackPanel(voice-empty-edit-' + spec.field + ')');
    }

    // Normalize list items to { value, label } shape Dropdown expects.
    const normalized = list.map((it) => {
        if (spec.field === 'phoneNumber') {
            return {
                value: it.phoneNumber || '',
                label: (it.phoneNumber || '') +
                    (it.friendlyName ? '  —  ' + it.friendlyName : '')
            };
        }
        // twimlApp / intelService — value=sid
        return {
            value: it.sid || '',
            label: (it.friendlyName || '(unnamed)') +
                (it.sid ? '  [' + it.sid + ']' : '')
        };
    });

    const ds = new core.ArrayDataSource(normalized);
    const pending = STATE.console.voicePendingValue;

    const dropdown = safeNew(component.Dropdown, {
        dataSource: ds,
        valueMember: 'value',
        displayMember: 'label',
        selectedValue: pending || (spec.allowEmpty ? null : normalized[0].value),
        allowEmpty: !!spec.allowEmpty,
        placeholder: spec.allowEmpty ? '(none)' : 'Select…',
        onSelectionChanged: (args: { value?: string }): void => {
            STATE.console.voicePendingValue = (args && args.value) || null;
        }
    }, 'Dropdown(voice-edit-' + spec.field + ')');

    const saving = !!STATE.console.voiceSaving;
    const saveBtn = safeNew(component.Button, {
        label: saving ? 'Saving…' : 'Save',
        type: ButtonType.PRIMARY,
        enabled: !saving,
        action: (): void => { onVoiceSaveClick(deps, spec.field); }
    }, 'Button(voice-save-' + spec.field + ')');

    const cancelBtn = safeNew(component.Button, {
        label: 'Cancel',
        type: ButtonType.DEFAULT,
        enabled: !saving,
        action: (): void => { onVoiceCancelClick(deps); }
    }, 'Button(voice-cancel-' + spec.field + ')');

    return safeNew(d.SP, {
        items: [dropdown, saveBtn, cancelBtn].filter((c) => c != null),
        orientation: d.SP_Orient.HORIZONTAL,
        itemGap: d.SP_Gap.S
    }, 'StackPanel(voice-edit-' + spec.field + ')');
};

// ─────────────────────────────────────────────────────────────────────
// Helpers — field → list key + server action name
// ─────────────────────────────────────────────────────────────────────

const voiceListKeyFor = (field: VoiceField): VoiceListKey | null => {
    if (field === 'twimlAppSid')     return 'twimlApps';
    if (field === 'phoneNumber')     return 'phoneNumbers';
    if (field === 'intelServiceSid') return 'intelServices';
    return null;
};

const voiceActionFor = (field: VoiceField): string | null => {
    if (field === 'twimlAppSid')     return 'wizardListTwiMLApps';
    if (field === 'phoneNumber')     return 'wizardListPhoneNumbers';
    if (field === 'intelServiceSid') return 'wizardListIntelServices';
    return null;
};

// ─────────────────────────────────────────────────────────────────────
// Click handlers — state-machine transitions for the row
// ─────────────────────────────────────────────────────────────────────

const onVoiceChangeClick = (deps: VoiceSectionDeps, field: VoiceField, _allowEmpty: boolean): void => {
    STATE.console.voiceEditing = field;
    STATE.console.voiceError = null;
    const snap = (STATE.console.snapshot || {}) as VoiceSnapshot;
    STATE.console.voicePendingValue = snap[field] || null;

    const listKey = voiceListKeyFor(field);
    if (!listKey) {
        deps.rerender();
        return;
    }
    // Already cached? Just rerender — Dropdown picks it up immediately.
    if (STATE.console.voiceLists[listKey] !== null) {
        deps.rerender();
        return;
    }

    STATE.console.voiceListsLoading = true;
    deps.rerender();

    const action = voiceActionFor(field);
    if (!action) {
        STATE.console.voiceListsLoading = false;
        STATE.console.voiceEditing = null;
        deps.rerender();
        return;
    }

    wizardCall(action, {})
        .then((p) => {
            const items = (p && (p as { items?: unknown[] }).items) || [];
            STATE.console.voiceLists[listKey] = items;
            STATE.console.voiceListsLoading = false;
            deps.rerender();
        })
        .catch((e: unknown) => {
            const err = e as { message?: string };
            STATE.console.voiceListsLoading = false;
            STATE.console.voiceError = 'Could not load list: ' +
                (err && err.message ? err.message : String(e));
            STATE.console.voiceEditing = null;
            deps.rerender();
        });
};

const onVoiceCancelClick = (deps: VoiceSectionDeps): void => {
    STATE.console.voiceEditing = null;
    STATE.console.voicePendingValue = null;
    STATE.console.voiceError = null;
    deps.rerender();
};

const onVoiceSaveClick = (deps: VoiceSectionDeps, field: VoiceField): void => {
    const snap = (STATE.console.snapshot || {}) as VoiceSnapshot;
    const newValue = STATE.console.voicePendingValue;

    // No-op if value didn't change — just exit EDIT mode.
    if (newValue === snap[field]) {
        STATE.console.voiceEditing = null;
        STATE.console.voicePendingValue = null;
        deps.rerender();
        return;
    }

    // wizardSaveVoice takes all three; pass the new value for the
    // active field and pass-through the snapshot's current values
    // for the other two so we don't accidentally clear them.
    const payload: Record<string, string> = {
        twimlAppSid:     snap.twimlAppSid     || '',
        phoneNumber:     snap.phoneNumber     || '',
        intelServiceSid: snap.intelServiceSid || ''
    };
    payload[field] = newValue || '';

    STATE.console.voiceSaving = true;
    STATE.console.voiceError = null;
    deps.rerender();

    wizardCall('wizardSaveVoice', payload)
        .then((p) => {
            STATE.console.voiceSaving = false;
            const resp = p as { saved?: boolean; error?: string } | null;
            if (resp && resp.saved) {
                // Refresh snapshot so the new value is reflected on the row.
                snap[field] = newValue || undefined;
                STATE.console.snapshot = snap;
                STATE.console.voiceEditing = null;
                STATE.console.voicePendingValue = null;
                deps.rerender();
            } else {
                STATE.console.voiceError = 'Save failed: ' +
                    ((resp && resp.error) || 'unknown');
                deps.rerender();
            }
        })
        .catch((e: unknown) => {
            const err = e as { message?: string };
            STATE.console.voiceSaving = false;
            STATE.console.voiceError = 'Network error saving: ' +
                (err && err.message ? err.message : String(e));
            deps.rerender();
        });
};
