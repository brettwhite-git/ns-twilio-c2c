// @ts-check
/**
 * Phones & reps section — U3 (Phase 3b).
 *
 * DataGrid with inline MultiselectDropdown editing. Per row: phone
 * number + assigned reps (multi-select cell, save-on-change) + status
 * badge (Live / No reps / Saving…). Toolbar above the grid offers
 * Refresh + Add phone number (Add deep-links to Step 4 of the wizard
 * until a dedicated Add Modal lands).
 *
 * Path B.3j (2026-05-27) — fifth and final section extraction. The
 * DataGrid widgetOptions callback is the most intricate UIF wiring
 * in the whole SPA (per-row onSelectionChanged → handler → STATE
 * mutation → debounced save), and the chip-display lookup callback
 * has a documented history of bug fixes (#3, #5 from the U3 patch
 * sequence — both kept verbatim with their original commentary so
 * the workarounds aren't accidentally regressed).
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import { safeNew } from '../render/primitives';
import { STATE } from '../state';
import type { EnumsBag } from '../render/shell';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface PhonesSectionDeps {
    /** Reload phones + employees + assignments from the server. */
    loadPhonesData: () => void;
    /** Navigate to a wizard step (Add button deep-links to Step 4). */
    goToStep: (step: number) => void;
    /** Per-row save handler — called when MultiselectDropdown selection changes. */
    onPhonesRowSelectionChanged: (phoneSid: string, newEmployeeIds: number[]) => void;
}

interface EmployeeRow {
    id: number;
    name?: string;
    email?: string;
}

interface PhoneRow {
    phoneSid?: string;
    phoneNumber?: string;
    employeeIds?: number[];
}

interface CellArgs {
    cell?: { row?: { dataItem?: PhoneRow } };
}

// ─────────────────────────────────────────────────────────────────────
// buildPhonesSection — section root
// ─────────────────────────────────────────────────────────────────────

/**
 * U3: Phones & reps — DataGrid with inline MultiselectDropdown
 * editing. Per row: phone number + assigned reps (multi-select cell,
 * save-on-change) + status badge.
 *
 * Data sources:
 *   - rows: STATE.console.assignments (wizardLoadAssignments)
 *   - rep options: STATE.console.phonesEmployees (wizardListEmployees)
 */
export const buildPhonesSection = (d: EnumsBag, deps: PhonesSectionDeps): unknown => {
    const items: unknown[] = [];

    const heading = safeNew(d.H, {
        content: 'Phones & reps',
        type: d.H_Type.MEDIUM_HEADING
    }, 'Heading(phones)');
    if (heading) items.push(heading);

    if (STATE.console.phonesLoading) {
        const loader = safeNew(component.Loader, {
            label: 'Loading phones & reps…',
            indeterminate: true
        }, 'Loader(phones)');
        if (loader) items.push(loader);
        return safeNew(d.SP, {
            items: items,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.L
        }, 'StackPanel(phones-loading)') || heading;
    }

    const toolbar = buildPhonesToolbar(d, deps);
    if (toolbar) items.push(toolbar);

    if (STATE.console.phonesError) {
        const err = safeNew(d.T, {
            text: '✕ ' + STATE.console.phonesError,
            type: d.T_Type.STRONG
        }, 'Text(phones-error)');
        if (err) items.push(err);
    }

    const grid = buildPhonesDataGrid(d, deps);
    if (grid) items.push(grid);

    const grouped = (STATE.console.phonesByPhone || []) as PhoneRow[];
    if (grouped.length === 0) {
        const emptyText = safeNew(d.T, {
            text: 'No phone numbers configured yet. Click "Add phone ' +
                  'number" above to claim a Twilio number and assign reps.',
            type: d.T_Type.WEAK
        }, 'Text(phones-empty)');
        if (emptyText) items.push(emptyText);
    }

    if (items.length === 0) return safeNew(d.T, { text: 'Phones & reps' }, 'Text(phones-section-empty)');
    return safeNew(d.SP, {
        items: items,
        orientation: d.SP_Orient.VERTICAL,
        itemGap: d.SP_Gap.XL  // bumped from L for more vertical breathing room
    }, 'StackPanel(phones)');
};

// ─────────────────────────────────────────────────────────────────────
// Toolbar — Refresh + Add buttons
// ─────────────────────────────────────────────────────────────────────

/**
 * U3: ToolBar above the DataGrid — Refresh from Twilio + Add phone
 * number. "Add phone number" deep-links to Step 4 of the wizard
 * for now (temporary fallback — a dedicated Add Modal is a Phase 3b
 * stretch goal, tracked separately).
 */
const buildPhonesToolbar = (d: EnumsBag, deps: PhonesSectionDeps): unknown => {
    const ButtonType = component.Button.Type as Record<string, unknown>;

    const refreshBtn = safeNew(component.Button, {
        label: 'Refresh from Twilio',
        type: ButtonType.DEFAULT,
        startIcon: d.SysIcon && d.SysIcon.REFRESH,
        action: (): void => { deps.loadPhonesData(); }
    }, 'Button(phones-refresh)');

    const addBtn = safeNew(component.Button, {
        label: 'Add phone number',
        type: ButtonType.PRIMARY,
        startIcon: d.SysIcon && d.SysIcon.ADD,
        action: (): void => {
            // Temporary: deep-link to Step 4 for the full add flow.
            // A dedicated Add Modal lives in a follow-up unit.
            deps.goToStep(4);
        }
    }, 'Button(phones-add)');

    const buttons = [refreshBtn, addBtn].filter((b) => b != null);
    if (buttons.length === 0) return null;

    return safeNew(d.SP, {
        items: buttons,
        orientation: d.SP_Orient.HORIZONTAL,
        itemGap: d.SP_Gap.S
    }, 'StackPanel(phones-toolbar)');
};

// ─────────────────────────────────────────────────────────────────────
// DataGrid — 3 columns: phone / assigned reps / status
// ─────────────────────────────────────────────────────────────────────

/**
 * U3: DataGrid with three columns:
 *   1. Phone number       (TEMPLATED — formatted number + PN-SID)
 *   2. Assigned reps      (MULTISELECT_DROPDOWN — inline edit)
 *   3. Status             (TEMPLATED — Badge: Live / No reps)
 *
 * Per UIF d.ts: MultiselectDropdownColumn accepts `dataSource`,
 * `displayMember`, `valueMember`, and `widgetOptions` (which can be
 * a callback returning per-row options). We use the callback to
 * wire the per-row `onSelectionChanged` to deps.onPhonesRowSelectionChanged.
 *
 * `args.values` shape per the U9b learning — NOT `args.items`.
 */
const buildPhonesDataGrid = (d: EnumsBag, deps: PhonesSectionDeps): unknown => {
    if (!d.DG) {
        console.warn('[CTC] DataGrid component unavailable; falling back to text');
        return buildPhonesFallback(d);
    }

    const grouped = (STATE.console.phonesByPhone || []) as PhoneRow[];
    const employees = (STATE.console.phonesEmployees || []) as EmployeeRow[];

    if (grouped.length === 0) return null;

    // ArrayDataSource constructors. Per core.d.ts: new ArrayDataSource(array).
    let rowsDs: unknown;
    let employeesDs: unknown;
    try {
        rowsDs = new d.Ads(grouped);
        employeesDs = new d.Ads(employees);
    } catch (e) {
        console.error('[CTC] ArrayDataSource construction failed:', e);
        return buildPhonesFallback(d);
    }

    // Per d.ts (component.d.ts:4571): DataGrid.columns expects an
    // ARRAY OF OPTIONS OBJECTS (ColumnDefinition = TemplatedColumn.Options
    // | MultiselectDropdownColumn.Options | ...), NOT an array of
    // constructed column instances. My U3-first-attempt wrapped each
    // column in safeNew() which built instances — DataGrid construction
    // silently failed because those aren't valid ColumnDefinitions.
    // Plain plain options objects work.
    //
    // GridColumn.Options required fields: `type` (ColumnType enum) +
    // `name` (string identifier). `valueMember` is NOT on the column
    // Options; it lives in widgetOptions (MultiselectDropdown.Options).
    // UIF v9.0.0 guarantees DataGrid.ColumnType + Badge.Type.
    const CT = d.DG.ColumnType;
    const BdgType = d.Bdg.Type;

    // Truncate the PN-SID so it fits the cell without wrapping over
    // the phone number text above it. Twilio SIDs are 34 chars; show
    // first 6 + last 4 with ellipsis (e.g., "PN4650…3988e").
    const truncSid = (sid: string | undefined): string => {
        if (!sid) return '';
        if (sid.length <= 14) return sid;
        return sid.slice(0, 6) + '…' + sid.slice(-4);
    };

    // Path C-6: status icon resolver — maps row state to native UIF
    // SystemIcon + Image.Color. Shared between the leading icon column
    // and any future inline-status uses.
    const ImageCtor = component.Image as unknown as new (options?: object) => unknown;
    const statusForRow = (row: PhoneRow): { icon: unknown; color: unknown; label: string } => {
        const saving = STATE.console.phonesSaving[row.phoneSid || ''];
        const hasReps = (row.employeeIds || []).length > 0;
        if (saving) {
            return {
                icon: core.SystemIcon.STATUS_INFO_FILLED,
                color: core.ImageConstant.Color.INFO,
                label: 'Saving…'
            };
        }
        if (hasReps) {
            return {
                icon: core.SystemIcon.STATUS_SUCCESS_FILLED,
                color: core.ImageConstant.Color.SUCCESS,
                label: 'Live'
            };
        }
        return {
            icon: core.SystemIcon.STATUS_WARNING_FILLED,
            color: core.ImageConstant.Color.WARNING,
            label: 'No reps'
        };
    };

    // Per MEMORY.md DataGrid learning: with columnStretch: true,
    // `stretchFactor` acts as a PROPORTIONAL WEIGHT for the column.
    // Must be a positive INTEGER — fractional values (0.5, 1.5) cause
    // DataGrid construction to throw silently and fall through to the
    // text fallback.
    // 5-column layout (Path C-6): icon | phone | SID | reps | badge
    // Stretch factors: 1 | 2 | 2 | 5 | 2

    // ── Column 1: status icon ────────────────────────────────────
    const statusIconColDef = {
        type: CT.TEMPLATED,
        name: 'statusIcon',
        label: '',
        stretchFactor: 1,
        content: (args: CellArgs): unknown => {
            try {
                const row = args && args.cell && args.cell.row &&
                          args.cell.row.dataItem;
                if (!row) return safeNew(d.T, { text: '' }, 'Text(icon-empty)');
                const s = statusForRow(row);
                return safeNew(ImageCtor, {
                    image: s.icon,
                    size: component.Image.Size.S,
                    color: s.color,
                    presentation: true
                }, 'Image(phone-status-icon)') ||
                       safeNew(d.T, { text: '•' }, 'Text(icon-fallback)');
            } catch (e) {
                console.error('[CTC] phone status icon column threw:', e);
                return safeNew(d.T, { text: '?' }, 'Text(icon-error)');
            }
        }
    };

    // ── Column 2: phone number ───────────────────────────────────
    const phoneColDef = {
        type: CT.TEMPLATED,
        name: 'phone',
        label: 'Phone number',
        stretchFactor: 2,
        content: (args: CellArgs): unknown => {
            try {
                const row = args && args.cell && args.cell.row &&
                          args.cell.row.dataItem;
                if (!row) return safeNew(d.T, { text: '—' }, 'Text(phone-empty)');
                return safeNew(d.T, {
                    text: row.phoneNumber || '(unknown)',
                    type: d.T_Type.STRONG
                }, 'Text(phone-number)');
            } catch (e) {
                console.error('[CTC] phone column template threw:', e);
                return safeNew(d.T, { text: '(error)' }, 'Text(phone-error)');
            }
        }
    };

    // ── Column 3: phone SID (new dedicated column, Path C-6) ─────
    // Previously the truncated SID rode as a WEAK subtitle under the
    // phone number; admin had to read two text levels in one cell.
    // Promoted to its own column for scannability.
    const phoneSidColDef = {
        type: CT.TEMPLATED,
        name: 'phoneSid',
        label: 'Phone SID',
        stretchFactor: 2,
        content: (args: CellArgs): unknown => {
            try {
                const row = args && args.cell && args.cell.row &&
                          args.cell.row.dataItem;
                if (!row) return safeNew(d.T, { text: '—' }, 'Text(sid-empty)');
                return safeNew(d.T, {
                    text: truncSid(row.phoneSid),
                    type: d.T_Type.WEAK,
                    size: d.T.Size && d.T.Size.S
                }, 'Text(phone-sid)');
            } catch (e) {
                console.error('[CTC] phone SID column template threw:', e);
                return safeNew(d.T, { text: '(error)' }, 'Text(sid-error)');
            }
        }
    };

    // U3 fix #3: chips displayed "undefined" because bindToValue
    // didn't resolve displayMember from raw ID values — the cell
    // had selected IDs but couldn't look up the corresponding
    // employee names. Drop bindToValue + binding entirely; instead
    // resolve selectedItems to full employee OBJECTS per-row in
    // widgetOptions. The widget then has full objects to read
    // .name from for chip labels.
    // UIF v9.0.0 guarantees DataGrid.InputMode.
    const IM = d.DG.InputMode;

    // U3 fix #5: chips display "undefined" because column-level
    // `displayMember: 'name'` (string) only works when bound values
    // are full objects (it does `value['name']`). With binding:
    // 'employeeIds', the cell receives Numbers like [120, 124, 131]
    // and tries `(120)['name']` → undefined. Per d.ts (DisplayMember
    // = string | DisplayMemberCallback), use a CALLBACK that does
    // the lookup explicitly: takes an ID, finds the matching
    // employee, returns the name.
    const repsDisplayMember = (value: unknown): string => {
        // value is whatever the cell extracted from row.employeeIds —
        // could be Number, String, or full employee object depending
        // on how the widget passes it.
        if (value && typeof value === 'object') {
            return (value as EmployeeRow).name || '';
        }
        const id = Number(value);
        const emp = ((STATE.console.phonesEmployees || []) as EmployeeRow[])
            .find((e) => e.id === id);
        return emp ? (emp.name || '') : '';
    };

    const repsColDef = {
        type: CT.MULTI_SELECT_DROPDOWN,
        name: 'reps',
        label: 'Assigned reps',
        // Largest fraction — reps chips need the most horizontal room.
        stretchFactor: 5,
        // binding: 'employeeIds' tells the column to read that row
        // property (without it, the column defaults to row[name] =
        // row.reps which doesn't exist).
        binding: 'employeeIds',
        inputMode: IM.EDIT_ONLY,
        dataSource: employeesDs,
        displayMember: repsDisplayMember,
        editable: true,
        widgetOptions: (row: { dataItem?: PhoneRow }): object => {
            const dataItem = (row && row.dataItem) || {};
            const phoneSid = dataItem.phoneSid;
            return {
                dataSource: employeesDs,
                valueMember: 'id',
                displayMember: 'name',
                placeholder: 'Pick reps',
                onSelectionChanged: (args: { values?: unknown[] }): void => {
                    // args.values may be IDs (with valueMember) OR full
                    // objects depending on UIF version — handle both.
                    const newIds = ((args && args.values) || []).map((v) => {
                        if (v && typeof v === 'object') return Number((v as { id?: unknown }).id);
                        return Number(v);
                    });
                    if (phoneSid) {
                        deps.onPhonesRowSelectionChanged(phoneSid, newIds);
                    }
                }
            };
        }
    };

    // ── Column 5: status badge (semantic palette) ────────────────
    // Drops the embedded ✓ glyph from the previous Badge content —
    // the icon column at the row start now carries the visual cue,
    // so the badge text is plain ("Live" / "No reps" / "Saving…"
    // without prefix glyph). Color palette matches the icon's
    // semantic tone via rootStyle (same pattern Recent calls' AI
    // Status column uses on Overview).
    const statusColDef = {
        type: CT.TEMPLATED,
        name: 'status',
        label: 'Status',
        stretchFactor: 2,
        content: (args: CellArgs): unknown => {
            try {
                const row = args && args.cell && args.cell.row &&
                          args.cell.row.dataItem;
                if (!row) return safeNew(d.T, { text: '—' }, 'Text(status-empty)');
                const s = statusForRow(row);
                const palette = s.label === 'Live'   ? { bg: '#D4EDDA', fg: '#155724', border: '#A3D9AE' } :
                                s.label === 'Saving…' ? { bg: '#CCE5FF', fg: '#004085', border: '#9FCDFF' } :
                                                        { bg: '#FFF3CD', fg: '#856404', border: '#FFE69C' };
                return safeNew(d.Bdg, {
                    content: s.label,
                    type: BdgType.SUBTLE,
                    rootStyle: {
                        backgroundColor: palette.bg,
                        color: palette.fg,
                        border: '1px solid ' + palette.border
                    }
                }, 'Badge(phone-status)') ||
                       safeNew(d.T, { text: s.label }, 'Text(status-fallback)');
            } catch (e) {
                console.error('[CTC] status column template threw:', e);
                return safeNew(d.T, { text: '(error)' }, 'Text(status-error)');
            }
        }
    };

    const columns = [statusIconColDef, phoneColDef, phoneSidColDef, repsColDef, statusColDef];

    const grid = safeNew(d.DG, {
        dataSource: rowsDs,
        columns: columns,
        columnStretch: true,
        highlightRowsOnHover: true,
        stripedRows: true,
        dataRowHeight: 72,        // bumped from 64 for breathing room
        headerRowHeight: 44,      // taller header for readability
        editable: true,
        rootStyle: { width: '100%' }
    }, 'DataGrid(phones)');
    if (!grid) {
        console.warn('[CTC] DataGrid construction returned null; using text fallback');
        return buildPhonesFallback(d);
    }
    // Horizontal margins are handled by section-level wrapContent
    // (single source of truth — see comments there). The section's
    // own StackPanel itemGap provides vertical breathing room
    // between toolbar / grid / empty-state hint.
    return grid;
};

// ─────────────────────────────────────────────────────────────────────
// Text-only fallback when DataGrid is unavailable
// ─────────────────────────────────────────────────────────────────────

/**
 * U3: text-only fallback when DataGrid or its column types aren't
 * available at runtime. Renders rows as a vertical stack of Text
 * lines so admin still sees the data.
 */
const buildPhonesFallback = (d: EnumsBag): unknown => {
    const grouped = (STATE.console.phonesByPhone || []) as PhoneRow[];
    const rows = grouped.map((g) => {
        const label = (g.phoneNumber || '(unknown)') + ' — ' +
                    (g.employeeIds || []).length + ' rep(s)';
        return safeNew(d.T, { text: label }, 'Text(phone-row)');
    }).filter((r) => r != null);
    if (rows.length === 0) return null;
    return safeNew(d.SP, {
        items: rows,
        orientation: d.SP_Orient.VERTICAL,
        itemGap: d.SP_Gap.XS
    }, 'StackPanel(phones-fallback)');
};
