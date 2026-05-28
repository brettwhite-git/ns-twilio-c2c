// @ts-check
/**
 * Step 3 — Voice config.
 *
 * Three dropdown selectors populated from live Twilio API calls:
 *   - TwiML Application (required) — application that handles
 *     outbound call routing
 *   - Default outbound caller ID (required) — Twilio phone number
 *   - Conversational Intelligence Service (optional) — for AI call
 *     analysis
 *
 * The three lists are fetched in parallel by loadStep3Lists and
 * cached in STATE.step3.{twimlApps, phoneNumbers, intelServices}.
 * Each list resolves independently; the form re-renders once all
 * three settle. Continue button dispatch lives in SpaClient's
 * onContinueClick (wizardSaveVoice with the three selected values).
 *
 * Path B.4-3 (2026-05-27) — extracted from SpaClient.ts.
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import { safeNew } from '../render/primitives';
import { STATE } from '../state';
import { wizardCall } from '../wizard_api_client';
import { buildTextField } from '../render/shared';
import type { EnumsBag } from '../render/shell';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface Step3Deps {
    /** Force a top-level re-render after STATE.step3 mutation. */
    rerender: () => void;
}

interface TwilioItem {
    sid?: string;
    friendlyName?: string;
    phoneNumber?: string;
}

interface NormalizedOption {
    value: string;
    label: string;
}

interface DropdownFieldOpts {
    /** Items already arrive as { value, label } (phone number list). */
    valueIsString?: boolean;
    /** Permit empty selection — used for the optional Intel Service. */
    allowEmpty?: boolean;
}

/** Keys of STATE.step3 that hold list responses. */
type Step3ListKey = 'twimlApps' | 'phoneNumbers' | 'intelServices';

// ─────────────────────────────────────────────────────────────────────
// buildStep3Form — section root with loading/error/loaded states
// ─────────────────────────────────────────────────────────────────────

export const buildStep3Form = (d: EnumsBag): unknown => {
    const rows: unknown[] = [];

    rows.push(safeNew(d.H, {
        content: 'Voice configuration',
        type: d.H_Type.MEDIUM_HEADING
    }, 'Heading(step3)'));

    rows.push(safeNew(d.T, {
        text: 'Pick the TwiML application, default outbound caller ' +
              'ID, and Conversational Intelligence service from your ' +
              'Twilio account. These are fetched live from Twilio ' +
              'using the secure API Secret configured in Step 2 — ' +
              "the secret value never leaves NetSuite's vault. " +
              'Conversational Intelligence is required: it produces ' +
              'the call transcripts that drive AI summaries and ' +
              'tone/satisfaction scoring.'
    }, 'Text(step3-intro)'));

    // Loading state — lists not yet fetched.
    if (STATE.step3.twimlApps === null ||
        STATE.step3.phoneNumbers === null ||
        STATE.step3.intelServices === null) {
        const loader = safeNew(component.Loader, {
            label: 'Loading from Twilio…',
            indeterminate: true
        }, 'Loader(step3-lists)');
        if (loader) rows.push(loader);
        else rows.push(safeNew(d.T, {
            text: 'Loading from Twilio…'
        }, 'Text(loading-fallback)'));

        return safeNew(d.SP, {
            items: rows.filter((r) => r != null),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.M
        }, 'StackPanel(step3-loading)');
    }

    // Error state — at least one list failed.
    if (STATE.step3.listLoadError) {
        rows.push(safeNew(d.T, {
            text: '✕ Could not load Twilio lists: ' +
                STATE.step3.listLoadError + '. Verify the API ' +
                'Secret value is set at Setup > Company > API ' +
                'Secrets, then go back to Step 2 and Continue ' +
                'again to retry.',
            type: d.T_Type.STRONG
        }, 'Text(step3-error)'));

        return safeNew(d.SP, {
            items: rows.filter((r) => r != null),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.M
        }, 'StackPanel(step3-error)');
    }

    // Loaded — render dropdowns.
    rows.push(buildDropdownField(d, 'TwiML Application',
        (STATE.step3.twimlApps || []) as TwilioItem[],
        STATE.step3.twimlAppSid,
        (sid) => { STATE.step3.twimlAppSid = sid || ''; }));

    rows.push(buildDropdownField(d, 'Default outbound caller ID',
        ((STATE.step3.phoneNumbers || []) as TwilioItem[]).map((n) => {
            return {
                value: n.phoneNumber || '',
                label: (n.phoneNumber || '') +
                       (n.friendlyName ? ' — ' + n.friendlyName : '')
            };
        }),
        STATE.step3.phoneNumber,
        (val) => { STATE.step3.phoneNumber = val || ''; },
        { valueIsString: true }));

    rows.push(buildDropdownField(d,
        'Conversational Intelligence Service',
        (STATE.step3.intelServices || []) as TwilioItem[],
        STATE.step3.intelServiceSid,
        (sid) => { STATE.step3.intelServiceSid = sid || ''; }));

    return safeNew(d.SP, {
        items: rows.filter((r) => r != null),
        orientation: d.SP_Orient.VERTICAL,
        itemGap: d.SP_Gap.M
    }, 'StackPanel(step3)');
};

// ─────────────────────────────────────────────────────────────────────
// loadStep3Lists — fire the three list-fetch actions in parallel
// ─────────────────────────────────────────────────────────────────────

/**
 * Fire the three list-fetch actions in parallel. Populate STATE
 * and rerender when all three settle. Called from goToStep when
 * advancing INTO Step 3.
 */
export const loadStep3Lists = (deps: Step3Deps): void => {
    // Reset to loading state
    STATE.step3.twimlApps = null;
    STATE.step3.phoneNumbers = null;
    STATE.step3.intelServices = null;
    STATE.step3.listLoadError = null;

    const handle = (field: Step3ListKey, payload: { items?: unknown[]; errorMessage?: string } | null): void => {
        if (payload && payload.items) {
            STATE.step3[field] = payload.items;

            // Sync the first item's value to STATE so Continue sees
            // a valid selection even if the admin never touched the
            // dropdown. UIF's onSelectionChanged only fires on USER
            // interaction — not on the constructor's selectedValue
            // default — so STATE would otherwise stay empty when
            // the admin accepts the default.
            const first = payload.items[0] as TwilioItem | undefined;
            if (first) {
                if (field === 'twimlApps' && !STATE.step3.twimlAppSid) {
                    STATE.step3.twimlAppSid = first.sid || '';
                }
                if (field === 'phoneNumbers' && !STATE.step3.phoneNumber) {
                    STATE.step3.phoneNumber = first.phoneNumber || '';
                }
                if (field === 'intelServices' && !STATE.step3.intelServiceSid) {
                    STATE.step3.intelServiceSid = first.sid || '';
                }
            }
        } else {
            STATE.step3[field] = [];
            if (payload && payload.errorMessage) {
                STATE.step3.listLoadError = payload.errorMessage;
            }
        }
        // Re-render once all three settle (or when the last one lands)
        if (STATE.step3.twimlApps !== null &&
            STATE.step3.phoneNumbers !== null &&
            STATE.step3.intelServices !== null) {
            deps.rerender();
        }
    };

    wizardCall('wizardListTwiMLApps', {})
        .then((p) => { handle('twimlApps', p as { items?: unknown[]; errorMessage?: string }); })
        .catch((e: unknown) => {
            const err = e as { message?: string };
            STATE.step3.listLoadError = 'TwiML apps: ' +
                (err && err.message ? err.message : String(e));
            handle('twimlApps', null);
        });

    wizardCall('wizardListPhoneNumbers', {})
        .then((p) => { handle('phoneNumbers', p as { items?: unknown[]; errorMessage?: string }); })
        .catch((e: unknown) => {
            const err = e as { message?: string };
            STATE.step3.listLoadError = 'Phone numbers: ' +
                (err && err.message ? err.message : String(e));
            handle('phoneNumbers', null);
        });

    wizardCall('wizardListIntelServices', {})
        .then((p) => { handle('intelServices', p as { items?: unknown[]; errorMessage?: string }); })
        .catch((e: unknown) => {
            const err = e as { message?: string };
            STATE.step3.listLoadError = 'Intel services: ' +
                (err && err.message ? err.message : String(e));
            handle('intelServices', null);
        });
};

// ─────────────────────────────────────────────────────────────────────
// buildDropdownField — local helper for the three Step 3 dropdowns
// ─────────────────────────────────────────────────────────────────────

/**
 * Build a Field-like Dropdown row. Items can be either:
 *   - List of { sid, friendlyName, ... } (Twilio resource shape) — uses
 *     `sid` as value, "<friendlyName> [sid]" as display
 *   - List of { value, label } (already-shaped) — uses as-is when
 *     opts.valueIsString = true
 */
const buildDropdownField = (
    d: EnumsBag,
    label: string,
    items: TwilioItem[] | NormalizedOption[],
    currentValue: string,
    onChange: (val: string | undefined) => void,
    opts?: DropdownFieldOpts
): unknown => {
    const o = opts || {};

    // Normalize items to { value, label }
    const normalized: NormalizedOption[] = (items || []).map((it: TwilioItem | NormalizedOption) => {
        if (o.valueIsString) return it as NormalizedOption;
        const ti = it as TwilioItem;
        return {
            value: ti.sid || '',
            label: (ti.friendlyName || '(unnamed)') +
                (ti.sid ? '  [' + ti.sid + ']' : '')
        };
    });

    if (normalized.length === 0) {
        return safeNew(component.StackPanel, {
            items: [
                safeNew(component.Text, {
                    text: label,
                    type: component.Text.Type.STRONG,
                    size: component.Text.Size.S
                }, 'Text(label-' + label + ')'),
                safeNew(component.Text, {
                    text: '(no items found in Twilio for this account)',
                    type: component.Text.Type.WEAK,
                    size: component.Text.Size.S
                }, 'Text(empty-' + label + ')')
            ].filter((c) => c != null),
            orientation: component.StackPanel.Orientation.VERTICAL,
            itemGap: component.StackPanel.GapSize.XXS
        }, 'StackPanel(empty-' + label + ')');
    }

    const ds = new core.ArrayDataSource(normalized);

    const dropdown = safeNew(component.Dropdown, {
        dataSource: ds,
        valueMember: 'value',
        displayMember: 'label',
        selectedValue: currentValue || (o.allowEmpty ? null : normalized[0].value),
        allowEmpty: !!o.allowEmpty,
        placeholder: o.allowEmpty ? '(none)' : 'Select…',
        onSelectionChanged: (args: { value?: string }): void => {
            onChange(args && args.value);
        }
    }, 'Dropdown(' + label + ')');

    if (!dropdown) {
        // Fallback to TextBox if Dropdown construction fails (shouldn't,
        // but gives a usable form so admin can complete the wizard)
        return buildTextField(label, '', currentValue || '', (v) => onChange(v));
    }

    const lblText = safeNew(component.Text, {
        text: label,
        type: component.Text.Type.STRONG,
        size: component.Text.Size.S
    }, 'Text(label-' + label + ')');

    return safeNew(component.StackPanel, {
        items: [lblText, dropdown].filter((c) => c != null),
        orientation: component.StackPanel.Orientation.VERTICAL,
        itemGap: component.StackPanel.GapSize.XXS
    }, 'StackPanel(field-' + label + ')') || dropdown;
};
