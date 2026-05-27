// @ts-check
/**
 * Health section — U6 (Phase 3a).
 *
 * Three sub-blocks stacked vertically:
 *   1. Preflight    — re-run button + check rows in a DataGrid
 *   2. Drift        — 3 client-computed detector rows (TwiML/phones/intel)
 *   3. Danger zone  — Deactivate flow with two-click confirm
 *
 * Path B.3g (2026-05-27) — second section extracted from SpaClient.ts.
 * Unlike Credentials (B.3f), this section couples to SpaClient
 * event-handlers (rerender + onDeactivateClick) via an explicit `deps`
 * parameter rather than closing over module scope. The pattern keeps
 * sections genuinely portable: their rendering logic only depends on
 * STATE + UIF + injected callbacks.
 */

import * as component from '@uif-js/component';
import { safeNew } from '../render/primitives';
import { STATE } from '../state';
import { wizardCall } from '../wizard_api_client';
import { badgeFor, buildCheckRow } from '../render/shared';
import type { EnumsBag } from '../render/shell';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

/** Event-handler deps that this section needs from SpaClient. */
export interface HealthSectionDeps {
    /** Force a top-level re-render of the SPA root tree. */
    rerender: () => void;
    /**
     * Confirm-deactivate action. Wires to SpaClient's onDeactivateClick,
     * which calls wizardDeactivate, flips snapshot.active=false, and
     * resets pendingDeactivateConfirm.
     */
    onDeactivateClick: () => void;
}

/** Shape of a preflight check row (matches wizardRunPreflight response). */
interface CheckItem {
    id?: string;
    label?: string;
    status?: string;
    detail?: string;
}

/** Drift-detector results from STATE.console.drift. */
interface DriftSnapshot {
    voiceUrl?: string;
    phoneNumbers?: string;
    intelService?: string;
}

// ─────────────────────────────────────────────────────────────────────
// buildHealthSection — section root
// ─────────────────────────────────────────────────────────────────────

export const buildHealthSection = (d: EnumsBag, deps: HealthSectionDeps): unknown => {
    const items: unknown[] = [];

    // Section-level Heading dropped — ApplicationHeader subtitle shows
    // "Health" at the page chrome.
    const preflightBlock = buildHealthPreflightBlock(d, deps);
    if (preflightBlock) items.push(preflightBlock);

    const driftBlock = buildHealthDriftBlock(d);
    if (driftBlock) items.push(driftBlock);

    const dangerBlock = buildHealthDangerZone(d, deps);
    if (dangerBlock) items.push(dangerBlock);

    if (STATE.console.actionError) {
        const err = safeNew(d.T, {
            text: '✕ ' + STATE.console.actionError,
            type: d.T_Type.STRONG
        }, 'Text(health-error)');
        if (err) items.push(err);
    }

    if (items.length === 0) return safeNew(d.T, { text: 'Health' }, 'Text(health-empty)');
    return safeNew(d.SP, {
        items: items,
        orientation: d.SP_Orient.VERTICAL,
        itemGap: d.SP_Gap.L
    }, 'StackPanel(health)');
};

// ─────────────────────────────────────────────────────────────────────
// Preflight block — Re-run button + check DataGrid
// ─────────────────────────────────────────────────────────────────────

const buildHealthPreflightBlock = (d: EnumsBag, deps: HealthSectionDeps): unknown => {
    const ButtonType = component.Button.Type;

    const sectionHeader = safeNew(d.H, {
        content: 'Preflight',
        type: d.H_Type.SMALL_HEADING
    }, 'Heading(health-preflight)');

    // Path C-7: re-run button now shows a visible loading state via
    // STATE.console.preflightRefreshing. Without the flag, the click
    // fired the wizardCall but admins saw no UI feedback during the
    // fetch — looked like the button did nothing. Label flips to
    // "Re-running…" and the button disables while the call is in
    // flight; settled (then OR catch) clears the flag and re-enables.
    const refreshing = !!STATE.console.preflightRefreshing;
    const rerunBtn = safeNew(component.Button, {
        label: refreshing ? 'Re-running…' : '↻ Re-run',
        type: ButtonType.DEFAULT,
        enabled: !refreshing,
        action: (): void => {
            STATE.console.preflightRefreshing = true;
            deps.rerender();
            wizardCall('wizardRunPreflight', {}).then((p) => {
                const checks = p && (p as { checks?: unknown[] }).checks;
                STATE.console.preflight = Array.isArray(checks) ? checks : [];
            }).catch((e: unknown) => {
                const err = e as { message?: string };
                STATE.console.actionError = 'Preflight failed: ' +
                    (err && err.message ? err.message : String(e));
            }).then(() => {
                STATE.console.preflightRefreshing = false;
                deps.rerender();
            });
        }
    }, 'Button(rerun-preflight)');

    const headerRow = safeNew(d.SP, {
        items: [sectionHeader, rerunBtn].filter((c) => c != null),
        orientation: d.SP_Orient.HORIZONTAL,
        itemGap: d.SP_Gap.S
    }, 'StackPanel(preflight-header-row)');

    const preflight = STATE.console.preflight as CheckItem[] | null | undefined;
    let bodyContent: unknown;
    if (preflight === null || preflight === undefined) {
        bodyContent = safeNew(d.T, {
            text: 'Preflight not yet run. Click Re-run to check.',
            type: d.T_Type.WEAK
        }, 'Text(preflight-loading)');
    } else if (preflight.length === 0) {
        bodyContent = safeNew(d.T, {
            text: 'No checks returned.',
            type: d.T_Type.WEAK
        }, 'Text(preflight-empty)');
    } else {
        bodyContent = buildHealthChecksDataGrid(d, preflight, 'preflight');
    }

    return safeNew(d.SP, {
        items: [headerRow, bodyContent].filter((c) => c != null),
        orientation: d.SP_Orient.VERTICAL,
        itemGap: d.SP_Gap.M
    }, 'StackPanel(preflight-block)');
};

// ─────────────────────────────────────────────────────────────────────
// Drift block — 3 client-computed detectors
// ─────────────────────────────────────────────────────────────────────

const buildHealthDriftBlock = (d: EnumsBag): unknown => {
    const sectionHeader = safeNew(d.H, {
        content: 'Drift detectors',
        type: d.H_Type.SMALL_HEADING
    }, 'Heading(health-drift)');

    const drift = (STATE.console.drift || {}) as DriftSnapshot;
    const detectors = [
        { id: 'voiceUrl',     label: 'TwiML VoiceUrl',    status: drift.voiceUrl || 'unknown' },
        { id: 'phoneNumbers', label: 'Phone number list', status: drift.phoneNumbers || 'unknown' },
        { id: 'intelService', label: 'Intel Service',     status: drift.intelService || 'unknown' }
    ];
    // Map drift status → check-row status so the grid renderer can
    // reuse the same Badge logic as preflight checks.
    const statusMap: Record<string, { status: string; detail: string }> = {
        'in-sync': { status: 'pass', detail: 'In sync with Twilio' },
        'drift':   { status: 'warn', detail: 'Drift detected — review section for details' },
        'not-configured': { status: 'info_disabled', detail: 'Not configured' },
        'unknown': { status: 'info_disabled', detail: 'Drift detection requires data load' }
    };

    const checks: CheckItem[] = detectors.map((det) => {
        const mapped = statusMap[det.status] || statusMap.unknown;
        return {
            id: det.id,
            label: det.label,
            status: mapped.status,
            detail: mapped.detail
        };
    });

    const grid = buildHealthChecksDataGrid(d, checks, 'drift');

    return safeNew(d.SP, {
        items: [sectionHeader, grid].filter((c) => c != null),
        orientation: d.SP_Orient.VERTICAL,
        itemGap: d.SP_Gap.M
    }, 'StackPanel(drift-block)');
};

// ─────────────────────────────────────────────────────────────────────
// Shared DataGrid for preflight + drift checks
// ─────────────────────────────────────────────────────────────────────

/**
 * U6.5 (Phase 3b): shared DataGrid for both Preflight + Drift blocks
 * in the Health section. Same UIF DataGrid pattern as Phones — gives
 * consistent layout, column alignment, and visual treatment.
 *
 * Input `checks` shape per buildCheckRow: { id, label, status, detail }
 * where status is 'pass' | 'fail' | 'warn' | 'info_enabled' | 'info_disabled'
 *
 * Two columns:
 *   1. Status (TEMPLATED, 80px) — Badge with check/cross/warn glyph
 *   2. Check  (TEMPLATED, flex) — bold label + detail line below
 */
const buildHealthChecksDataGrid = (
    d: EnumsBag,
    checks: CheckItem[],
    gridName: string
): unknown => {
    // Match Phones DataGrid guard: only check DataGrid itself. TC is a
    // namespace member, not a top-level class — we don't use it for
    // construction (columns are plain options objects per UIF recipe
    // §13-14). Earlier guard `!d.TC` forced every render into the
    // StackPanel fallback because component.TemplatedColumn resolves
    // to undefined at the top-level grab.
    if (!d.DG) {
        console.warn('[CTC] DataGrid component unavailable; health falling back to StackPanel');
        const fallbackRows = (checks || []).map((c) => buildCheckRow(c as Parameters<typeof buildCheckRow>[0]))
            .filter((r) => r != null);
        if (fallbackRows.length === 0) return null;
        return safeNew(d.SP, {
            items: fallbackRows,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.M
        }, 'StackPanel(health-checks-fallback-' + gridName + ')');
    }

    if (!checks || checks.length === 0) return null;

    let rowsDs: unknown;
    try {
        rowsDs = new d.Ads(checks);
    } catch (e) {
        console.error('[CTC] Health checks ArrayDataSource failed:', e);
        return null;
    }

    // UIF v9.0.0 guarantees DataGrid.ColumnType.
    const CT = d.DG.ColumnType;

    // Path C-7: status text-label palette mapping. Same Bootstrap-style
    // alert colors used by Phones (Path C-6) + Recent calls (Path C-3)
    // — keeps semantic color cohesion across all three DataGrids that
    // show check/status state.
    const statusLabelFor = (status: string): { text: string; palette: { bg: string; fg: string; border: string } } => {
        switch (status) {
            case 'pass':
                return { text: 'Pass', palette: { bg: '#D4EDDA', fg: '#155724', border: '#A3D9AE' } };
            case 'fail':
                return { text: 'Fail', palette: { bg: '#F8D7DA', fg: '#721C24', border: '#F1B5BB' } };
            case 'warn':
                return { text: 'Warn', palette: { bg: '#FFF3CD', fg: '#856404', border: '#FFE69C' } };
            case 'info_enabled':
                return { text: 'Info', palette: { bg: '#CCE5FF', fg: '#004085', border: '#9FCDFF' } };
            case 'info_disabled':
                return { text: 'Off',  palette: { bg: '#E2E3E5', fg: '#383D41', border: '#C7CACE' } };
            default:
                return { text: status || '—', palette: { bg: '#E2E3E5', fg: '#383D41', border: '#C7CACE' } };
        }
    };

    // Defensive read for column-level horizontalAlignment (same trap
    // as Phones C-6: TS namespace re-export doesn't always survive into
    // runtime). Falls back to wrapping the icon in a centering
    // ContentPanel in the content callback.
    const DGHAlign = (d.DG && d.DG.HorizontalAlignment) ||
                     (component.DataGrid && (component.DataGrid as unknown as { HorizontalAlignment?: { CENTER?: unknown } }).HorizontalAlignment);
    const colAlignCenter = DGHAlign ? DGHAlign.CENTER : undefined;

    // ── Column 1: status icon (first, Path C-7) ──────────────────
    const statusIconColDef = {
        type: CT.TEMPLATED,
        name: 'statusIcon',
        label: '',
        stretchFactor: 1,
        horizontalAlignment: colAlignCenter,
        headerHorizontalAlignment: colAlignCenter,
        content: (args: { cell?: { row?: { dataItem?: CheckItem } } }): unknown => {
            try {
                const row = args && args.cell && args.cell.row &&
                          args.cell.row.dataItem;
                if (!row) return safeNew(d.T, { text: '' }, 'Text(icon-empty)');
                const icon = badgeFor(row.status || '') ||
                             safeNew(d.T, { text: '•' }, 'Text(icon-fallback)');
                // Center via ContentPanel wrapper (cell-content path) so
                // the icon centers regardless of whether the column-level
                // horizontalAlignment prop was honored.
                if (!d.CP) return icon;
                return safeNew(d.CP, {
                    content: icon,
                    horizontalAlignment: d.CP_HAlign.CENTER
                }, 'ContentPanel(health-icon-center)') || icon;
            } catch (e) {
                console.error('[CTC] Health status icon column threw:', e);
                return safeNew(d.T, { text: '?' }, 'Text(icon-error)');
            }
        }
    };

    const checkColDef = {
        type: CT.TEMPLATED,
        name: 'check',
        label: 'Check',
        stretchFactor: 3,
        content: (args: { cell?: { row?: { dataItem?: CheckItem } } }): unknown => {
            try {
                const row = args && args.cell && args.cell.row &&
                          args.cell.row.dataItem;
                if (!row) return safeNew(d.T, { text: '—' }, 'Text(check-empty)');
                return safeNew(d.T, {
                    text: row.label || '',
                    type: d.T_Type.STRONG
                }, 'Text(check-label)');
            } catch (e) {
                console.error('[CTC] Health check column threw:', e);
                return safeNew(d.T, { text: '(error)' }, 'Text(check-error)');
            }
        }
    };

    const detailColDef = {
        type: CT.TEMPLATED,
        name: 'detail',
        label: 'Detail',
        stretchFactor: 6,
        content: (args: { cell?: { row?: { dataItem?: CheckItem } } }): unknown => {
            try {
                const row = args && args.cell && args.cell.row &&
                          args.cell.row.dataItem;
                if (!row || !row.detail) return safeNew(d.T, {
                    text: '—',
                    type: d.T_Type.WEAK
                }, 'Text(detail-empty)');
                return safeNew(d.T, {
                    text: row.detail,
                    type: d.T_Type.WEAK
                }, 'Text(check-detail)');
            } catch (e) {
                console.error('[CTC] Health detail column threw:', e);
                return safeNew(d.T, { text: '(error)' }, 'Text(detail-error)');
            }
        }
    };

    // ── Column 4: status text badge (last, Path C-7) ─────────────
    // Same colored-pill pattern as Phones (Path C-6) — semantic color
    // via rootStyle override on a SUBTLE Badge.
    const statusBadgeColDef = {
        type: CT.TEMPLATED,
        name: 'statusBadge',
        label: 'Status',
        stretchFactor: 2,
        content: (args: { cell?: { row?: { dataItem?: CheckItem } } }): unknown => {
            try {
                const row = args && args.cell && args.cell.row &&
                          args.cell.row.dataItem;
                if (!row) return safeNew(d.T, { text: '—' }, 'Text(statusbadge-empty)');
                const sb = statusLabelFor(row.status || '');
                return safeNew(d.Bdg, {
                    content: sb.text,
                    type: d.Bdg.Type.SUBTLE,
                    rootStyle: {
                        backgroundColor: sb.palette.bg,
                        color: sb.palette.fg,
                        border: '1px solid ' + sb.palette.border
                    }
                }, 'Badge(health-status)') || safeNew(d.T, { text: sb.text }, 'Text(statusbadge-fallback)');
            } catch (e) {
                console.error('[CTC] Health status-badge column threw:', e);
                return safeNew(d.T, { text: '(error)' }, 'Text(statusbadge-error)');
            }
        }
    };

    return safeNew(d.DG, {
        dataSource: rowsDs,
        columns: [statusIconColDef, checkColDef, detailColDef, statusBadgeColDef],
        columnStretch: true,
        highlightRowsOnHover: true,
        stripedRows: true,
        dataRowHeight: 48,
        headerRowHeight: 40,
        rootStyle: { width: '100%' }
    }, 'DataGrid(health-' + gridName + ')');
};

// ─────────────────────────────────────────────────────────────────────
// Danger zone — Deactivate with two-click confirm
// ─────────────────────────────────────────────────────────────────────

const buildHealthDangerZone = (d: EnumsBag, deps: HealthSectionDeps): unknown => {
    const snap = (STATE.console.snapshot || {}) as { active?: boolean };
    const isPaused = snap.active === false;

    // Hide entire Danger zone when CTC is already paused — the top
    // banner already provides a Reactivate path, so duplicating it
    // here just adds noise. Render only when there's something to
    // do (deactivate a live install).
    if (isPaused) return null;

    const ButtonType = component.Button.Type as Record<string, unknown>;

    const sectionHeader = safeNew(d.H, {
        content: 'Danger zone',
        type: d.H_Type.SMALL_HEADING
    }, 'Heading(danger-zone)');

    const description = safeNew(d.T, {
        text: 'Deactivate Click-to-Call: reps lose phone-icon access ' +
              'across all roles. In-progress calls finish normally; new ' +
              'calls cannot be placed. Reactivate any time.',
        type: d.T_Type.WEAK,
        size: d.T && d.T.Size ? d.T.Size.S : undefined
    }, 'Text(danger-desc)');

    const buttons: unknown[] = [];
    if (STATE.console.pendingDeactivateConfirm) {
        // Two-click confirm — show Cancel + Confirm
        const cancelBtn = safeNew(component.Button, {
            label: 'Cancel',
            type: ButtonType.DEFAULT,
            action: (): void => {
                STATE.console.pendingDeactivateConfirm = false;
                deps.rerender();
            }
        }, 'Button(cancel-deactivate)');
        if (cancelBtn) buttons.push(cancelBtn);

        const confirmBtn = safeNew(component.Button, {
            label: 'Confirm deactivate',
            type: ButtonType.DANGER || ButtonType.DEFAULT,
            action: deps.onDeactivateClick
        }, 'Button(confirm-deactivate)');
        if (confirmBtn) buttons.push(confirmBtn);
    } else {
        // Default state — just the Deactivate button
        const deactivateBtn = safeNew(component.Button, {
            label: 'Deactivate',
            type: ButtonType.DANGER || ButtonType.DEFAULT,
            action: deps.onDeactivateClick
        }, 'Button(deactivate)');
        if (deactivateBtn) buttons.push(deactivateBtn);
    }

    const deactivateErrorText = STATE.console.deactivateError ? safeNew(d.T, {
        text: '✕ Deactivate failed: ' + STATE.console.deactivateError,
        type: d.T_Type.STRONG
    }, 'Text(deactivate-error)') : null;

    const buttonRow = buttons.length > 0 ? safeNew(d.SP, {
        items: buttons,
        orientation: d.SP_Orient.HORIZONTAL,
        itemGap: d.SP_Gap.S
    }, 'StackPanel(danger-buttons)') : null;

    const inner = safeNew(d.SP, {
        items: [sectionHeader, description, buttonRow, deactivateErrorText]
            .filter((c) => c != null),
        orientation: d.SP_Orient.VERTICAL,
        itemGap: d.SP_Gap.S
    }, 'StackPanel(danger-zone)');

    // Callout-style border (UIF has no dedicated "danger box" — wrap
    // in ContentPanel with rootStyle border + inset padding to match
    // the wireframe). Subtle red border + light tinted background
    // signals destructiveness without shouting.
    if (!d.CP) return inner;
    return safeNew(d.CP, {
        content: inner,
        outerGap: (d.CP_Gap && d.CP_Gap.M) || undefined,
        horizontalAlignment: d.CP_HAlign.STRETCH,
        rootStyle: {
            border: '1px solid #D33A2C',
            borderRadius: '8px',
            backgroundColor: '#FDF4F3',
            padding: '16px 20px'
        }
    }, 'ContentPanel(danger-zone-callout)') || inner;
};
