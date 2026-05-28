// @ts-check
/**
 * Shared render helpers — cross-section widgets used by multiple wizard
 * steps and console sections. One layer up from primitives.ts (which
 * holds only safeNew); one layer below shell.ts (rerender / page-level
 * scaffolding).
 *
 * Path B.3e-2 (2026-05-27) — extracted from SpaClient.ts. Four helpers
 * land here:
 *   - buildTextField — labeled text input. Now uses the native
 *     `component.Field` (label + control shape) verified available in
 *     @oracle/netsuite-uif-types v9.0.0, replacing the hand-rolled
 *     StackPanel(VERTICAL)[Text(label), TextBox] composition.
 *   - buildCheckRow  — preflight check row (status badge + label + detail).
 *   - badgeFor       — status → Badge mapping (pass/fail/warn/info).
 *   - buildErrorBox  — single-line error Text used by Step 1 + Step 5.
 *
 * Why the Field swap?
 *   The original SpaClient.js was authored before the UIF type catalog
 *   was installed; component availability had to be discovered at
 *   runtime. The hand-rolled label-above-input StackPanel was a hedge
 *   against `Field` being absent. With v9.0.0 installed and the type
 *   verified (`grep -n "export class Field" component.d.ts` → line 5750),
 *   we can trust the native primitive. safeNew still wraps the call so
 *   any runtime construction failure (bad option, missing required prop)
 *   falls back gracefully to the bare TextBox.
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import { safeNew } from './primitives';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

/**
 * Status values emitted by the wizard's preflight check actions
 * (wizardSnapshot.preflight[].status, wizardRunPreflight[].status).
 * Anything outside this union renders as a "?" badge — defensive fallback
 * in badgeFor's switch default.
 */
export type CheckStatus =
    | 'pass'
    | 'fail'
    | 'warn'
    | 'info_enabled'
    | 'info_disabled';

/**
 * Shape of one preflight check row. Matches the server-side response
 * from ctc_sl_wizard_api's wizardRunPreflight handler.
 */
export interface CheckRow {
    id?: string;
    label: string;
    status: CheckStatus | string;
    detail?: string;
    repairHint?: string;
}

/**
 * Text-changed callback. Receives the current TextBox value (empty
 * string if cleared). Note: the original SpaClient.js extracted this
 * from `args.text` defensively because TextBox's `onTextChanged` event
 * shape varies — this module preserves the same defensive extraction
 * inside buildTextField.
 */
export type TextChangeHandler = (value: string) => void;

// ─────────────────────────────────────────────────────────────────────
// buildTextField — labeled text input. UIF Field-based.
// ─────────────────────────────────────────────────────────────────────

/**
 * Construct a labeled text input as a UIF Field with a TextBox control.
 *
 * The label sits above the input (orientation: VERTICAL) to match the
 * wizard's vertical-form layout. Falls back to a bare TextBox if Field
 * construction fails (safeNew returns null → || tb fallback).
 *
 * @param label        Field label text (e.g. "Account SID").
 * @param placeholder  Placeholder shown inside the TextBox when empty.
 * @param currentValue Initial text value. Empty string acceptable.
 * @param onChange     Called with the new value on every text change.
 */
export const buildTextField = (
    label: string,
    placeholder: string,
    currentValue: string,
    onChange: TextChangeHandler
): unknown => {
    const tb = safeNew(component.TextBox, {
        text: currentValue || '',
        placeholder: placeholder,
        onTextChanged: (args: { text?: string } | undefined): void => {
            onChange(args && args.text ? args.text : '');
        }
    }, 'TextBox(' + label + ')');
    if (!tb) return null;

    return safeNew(component.Field, {
        label: label,
        control: tb,
        orientation: component.Field.Orientation.VERTICAL
    }, 'Field(' + label + ')') || tb;
};

// ─────────────────────────────────────────────────────────────────────
// buildCheckRow — one preflight result row (icon + label + detail)
// ─────────────────────────────────────────────────────────────────────

/**
 * Render a single preflight check row as a horizontal StackPanel of
 * [status badge, vertical-stack(label, detail, repair hint)].
 *
 * `detail` and `repairHint` are both optional and omitted from the
 * right-stack when absent.
 *
 * Input shape matches `wizardRunPreflight[]` rows. See {@link CheckRow}.
 */
export const buildCheckRow = (check: CheckRow): unknown => {
    const icon = badgeFor(check.status);

    const labelText = safeNew(component.Text, {
        text: check.label,
        type: component.Text.Type.STRONG
    }, 'Text(row-label)');

    const detailText = check.detail ? safeNew(component.Text, {
        text: check.detail,
        type: component.Text.Type.WEAK,
        size: component.Text.Size.S
    }, 'Text(row-detail)') : null;

    const hintText = check.repairHint ? safeNew(component.Text, {
        text: '→ ' + check.repairHint,
        type: component.Text.Type.DEFAULT,
        size: component.Text.Size.S
    }, 'Text(row-hint)') : null;

    const rightStackItems = [labelText, detailText, hintText]
        .filter((c): c is unknown => c != null);

    const rightStack = safeNew(component.StackPanel, {
        items: rightStackItems,
        orientation: component.StackPanel.Orientation.VERTICAL,
        itemGap: component.StackPanel.GapSize.XXS
    }, 'StackPanel(row-right)');

    const rowItems = [icon, rightStack]
        .filter((c): c is unknown => c != null);

    return safeNew(component.StackPanel, {
        items: rowItems,
        orientation: component.StackPanel.Orientation.HORIZONTAL,
        alignment: component.StackPanel.Alignment.START,
        itemGap: component.StackPanel.GapSize.M
    }, 'StackPanel(row)');
};

// ─────────────────────────────────────────────────────────────────────
// badgeFor — status string → native UIF SystemIcon Image
// ─────────────────────────────────────────────────────────────────────

/**
 * Status icon for a preflight/drift check row. Returns a native UIF
 * `component.Image` constructed from `core.SystemIcon.STATUS_*_FILLED`
 * with semantic `Image.Color` tinting.
 *
 * Path C-7 (2026-05-27) — swapped from hand-rolled `component.Badge`
 * with a text glyph (✓ ✕ ! ⓘ ○) to the canonical native icons. Badge
 * only exposes SOLID + SUBTLE types — color differentiation rides on
 * the glyph, which is rough. Image.Color enum (SUCCESS / WARNING /
 * ERROR / INFO / NEUTRAL) maps directly to the check semantics and
 * matches the visual treatment used by Phones (Path C-6) and the
 * Status stat card (Path C-2).
 *
 * Mapping:
 *   pass          → STATUS_SUCCESS_FILLED + Color.SUCCESS
 *   fail          → STATUS_ERROR_FILLED   + Color.ERROR
 *   warn          → STATUS_WARNING_FILLED + Color.WARNING
 *   info_enabled  → STATUS_INFO_FILLED    + Color.INFO
 *   info_disabled → STATUS_INFO           + Color.NEUTRAL  (outlined,
 *                                                            muted —
 *                                                            "disabled"
 *                                                            visual)
 *   default       → STATUS_INFO           + Color.NEUTRAL  (unknown
 *                                                            status —
 *                                                            stays
 *                                                            parseable)
 */
export const badgeFor = (status: string): unknown => {
    let icon: unknown;
    let color: unknown;
    switch (status) {
        case 'pass':
            icon = core.SystemIcon.STATUS_SUCCESS_FILLED;
            color = core.ImageConstant.Color.SUCCESS;
            break;
        case 'fail':
            icon = core.SystemIcon.STATUS_ERROR_FILLED;
            color = core.ImageConstant.Color.DANGER;
            break;
        case 'warn':
            icon = core.SystemIcon.STATUS_WARNING_FILLED;
            color = core.ImageConstant.Color.WARNING;
            break;
        case 'info_enabled':
            icon = core.SystemIcon.STATUS_INFO_FILLED;
            color = core.ImageConstant.Color.INFO;
            break;
        case 'info_disabled':
            icon = core.SystemIcon.STATUS_INFO;
            color = core.ImageConstant.Color.NEUTRAL;
            break;
        default:
            icon = core.SystemIcon.STATUS_INFO;
            color = core.ImageConstant.Color.NEUTRAL;
    }
    // component.Image's constructor accepts `Options | string |
    // ImageMetadata`, which is broader than safeNew's AnyCtor — narrow
    // it via cast so safeNew accepts the call.
    const ImageCtor = component.Image as unknown as new (options?: object) => unknown;
    return safeNew(ImageCtor, {
        image: icon,
        size: component.Image.Size.M,
        color: color,
        presentation: true
    }, 'Image(status-' + status + ')');
};

// ─────────────────────────────────────────────────────────────────────
// buildErrorBox — single-line error Text body
// ─────────────────────────────────────────────────────────────────────

/**
 * Error-state body content when an Ajax call fails or the server
 * returns ok=false. Renders as STRONG Text so it stands out against
 * the surrounding form. Callers typically swap this in for the
 * normal body when wizardSnapshot / wizardRunPreflight rejects.
 */
export const buildErrorBox = (errorMessage: string): unknown => {
    return safeNew(component.Text, {
        text: 'Could not load prerequisite checks: ' + errorMessage,
        type: component.Text.Type.STRONG
    }, 'Text(error)');
};

// ─────────────────────────────────────────────────────────────────────
// buildPrereqsList — vertical list of preflight check rows
// ─────────────────────────────────────────────────────────────────────

/**
 * Render a vertical list of prerequisite check rows.
 * Each row: pass/fail icon + label + detail (+ repair hint if any).
 *
 * Used by Step 1's loadPrereqs callback and (potentially) Step 5's
 * preflight section — both consume the same { id, label, status,
 * detail, repairHint } shape.
 *
 * Path B.4-1 (2026-05-27) — moved from SpaClient.ts into shared.ts
 * since it composes buildCheckRow (already here) and is conceptually
 * a peer of the other shared check-row renderers.
 */
export const buildPrereqsList = (checks: CheckRow[]): unknown => {
    const rows = (checks || []).map((c) => buildCheckRow(c))
                                .filter((r) => r != null);

    if (rows.length === 0) {
        return safeNew(component.Text, {
            text: 'No checks returned.'
        }, 'Text(empty-checks)');
    }

    return safeNew(component.StackPanel, {
        items: rows,
        orientation: component.StackPanel.Orientation.VERTICAL,
        itemGap: component.StackPanel.GapSize.M
    }, 'StackPanel(prereqs)');
};
