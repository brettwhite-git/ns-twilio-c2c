// @ts-check
/**
 * Step 4 — Phone numbers + rep assignments.
 *
 * One row per Twilio phone number with a MultiselectDropdown picker
 * for employee assignment. STATE.step4.assignments is a map keyed by
 * phoneSid; each entry has { employeeIds, label, primaryEmployeeId }.
 *
 * loadStep4Lists fires three parallel server calls:
 *   - wizardListPhoneNumbers  → STATE.step4.phoneNumbers
 *   - wizardListEmployees     → STATE.step4.employees
 *   - wizardLoadAssignments   → STATE.step4.assignments (existing state)
 *
 * Continue dispatch (wizardSaveAssignments) lives in SpaClient's
 * onContinueClick — it translates the assignments map to the
 * `[{ phoneSid, employeeIds, primaryEmployeeId, ... }]` array shape
 * the server expects.
 *
 * Path B.4-4 (2026-05-27) — extracted from SpaClient.ts. Two
 * documented bug-fix workarounds from prior commits are preserved
 * with original commentary:
 *   - MultiselectDropdown's SelectionChangedArgs uses `values`, not
 *     `items` (U5 fix)
 *   - Field IDs in the save payload must align with the server schema
 *     (U9b diagnostic logging)
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import { safeNew } from '../shared/primitives';
import { STATE } from '../../state';
import { wizardCall } from '../../services/wizardApi';
import type { EnumsBag } from '../shared/shell';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface Step4Deps {
    /** Force a top-level re-render after STATE.step4 mutation. */
    rerender: () => void;
}

interface PhoneNumber {
    sid: string;
    phoneNumber?: string;
    friendlyName?: string;
}

interface Employee {
    id: number | string;
    name?: string;
    email?: string;
}

interface AssignmentEntry {
    employeeIds?: number[];
    label?: string;
    primaryEmployeeId?: number | null;
}

interface ServerAssignmentRow {
    phoneSid: string;
    employeeId: number | string;
    isPrimary?: boolean;
    label?: string;
}

// ─────────────────────────────────────────────────────────────────────
// buildStep4Form — root with loading/error/empty/loaded branches
// ─────────────────────────────────────────────────────────────────────

export const buildStep4Form = (d: EnumsBag): unknown => {
    const rows: unknown[] = [];

    rows.push(safeNew(d.H, {
        content: 'Phone numbers & rep assignments',
        type: d.H_Type.MEDIUM_HEADING
    }, 'Heading(step4)'));

    rows.push(safeNew(d.T, {
        text: 'Assign reps to your Twilio phone numbers. Each rep ' +
              'with a number assigned will use it as their outbound ' +
              'caller ID. Reps without an assignment fall back to ' +
              'the default caller ID set in Step 3.'
    }, 'Text(step4-intro)'));

    // Loading state
    if (STATE.step4.phoneNumbers === null ||
        STATE.step4.employees === null) {
        const loader = safeNew(component.Loader, {
            label: 'Loading phone numbers and employees…',
            indeterminate: true
        }, 'Loader(step4)');
        if (loader) rows.push(loader);
        return safeNew(d.SP, {
            items: rows.filter((r) => r != null),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.M
        }, 'StackPanel(step4-loading)');
    }

    // Error state
    if (STATE.step4.listLoadError) {
        rows.push(safeNew(d.T, {
            text: '✕ ' + STATE.step4.listLoadError,
            type: d.T_Type.STRONG
        }, 'Text(step4-error)'));
        return safeNew(d.SP, {
            items: rows.filter((r) => r != null),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.M
        }, 'StackPanel(step4-error)');
    }

    const phoneNumbers = (STATE.step4.phoneNumbers || []) as PhoneNumber[];
    if (phoneNumbers.length === 0) {
        rows.push(safeNew(d.T, {
            text: '(no phone numbers owned by this Twilio account — ' +
                  'buy one in Twilio Console before continuing)',
            type: d.T_Type.WEAK
        }, 'Text(step4-empty)'));
        return safeNew(d.SP, {
            items: rows.filter((r) => r != null),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.M
        }, 'StackPanel(step4-empty)');
    }

    // One row per phone number
    for (const pn of phoneNumbers) {
        rows.push(buildStep4AssignmentRow(d, pn));
    }

    return safeNew(d.SP, {
        items: rows.filter((r) => r != null),
        orientation: d.SP_Orient.VERTICAL,
        itemGap: d.SP_Gap.L
    }, 'StackPanel(step4)');
};

// ─────────────────────────────────────────────────────────────────────
// buildStep4AssignmentRow — phone-label + MultiselectDropdown picker
// ─────────────────────────────────────────────────────────────────────

const buildStep4AssignmentRow = (d: EnumsBag, phoneNumber: PhoneNumber): unknown => {
    const assignments = STATE.step4.assignments as Record<string, AssignmentEntry>;
    const current = assignments[phoneNumber.sid] || {};
    const employees = (STATE.step4.employees || []) as Employee[];

    const pnLabel = safeNew(d.T, {
        text: (phoneNumber.phoneNumber || '') +
            (phoneNumber.friendlyName ? '  —  ' + phoneNumber.friendlyName : ''),
        type: d.T_Type.STRONG
    }, 'Text(step4-pn-' + phoneNumber.sid + ')');

    // Multi-select employee picker via MultiselectDropdown
    const dataItems = employees.map((e) => {
        return {
            value: e.id,
            label: (e.name || '') + (e.email ? ' (' + e.email + ')' : '')
        };
    });

    const ds = new core.ArrayDataSource(dataItems);
    const selectedItems = (current.employeeIds || []).map((id) => {
        return { value: id, label: lookupEmployeeName(id) };
    });

    const picker = safeNew(component.MultiselectDropdown, {
        dataSource: ds,
        valueMember: 'value',
        displayMember: 'label',
        selectedItems: selectedItems,
        placeholder: 'Assign reps…',
        // Per @uif-js/component d.ts, MultiselectDropdown's
        // SelectionChangedArgs is { values, previousValues, reason }
        // — NOT { items }. Earlier U5 commit read args.items (which
        // was undefined), causing the saved payload to always be
        // empty. `values` is already an array of the value-member
        // (the employee id) since valueMember is set above.
        onSelectionChanged: (args: { values?: number[] }): void => {
            const values = (args && args.values) || [];
            console.log('[CTC Setup Wizard] Step 4 picker — ' +
                'phoneSid=' + phoneNumber.sid +
                ' selected values:', values);

            if (!assignments[phoneNumber.sid]) {
                assignments[phoneNumber.sid] = {};
            }
            assignments[phoneNumber.sid].employeeIds = values;
            // Default primary to first selected if not already set
            const a = assignments[phoneNumber.sid];
            if (!a.primaryEmployeeId || values.indexOf(a.primaryEmployeeId) === -1) {
                a.primaryEmployeeId = values.length > 0 ? values[0] : null;
            }
        }
    }, 'MultiselectDropdown(emp-' + phoneNumber.sid + ')');

    const children = [pnLabel, picker].filter((c) => c != null);
    return safeNew(d.SP, {
        items: children,
        orientation: d.SP_Orient.VERTICAL,
        itemGap: d.SP_Gap.XS
    }, 'StackPanel(step4-row-' + phoneNumber.sid + ')');
};

// ─────────────────────────────────────────────────────────────────────
// lookupEmployeeName — id → name from STATE.step4.employees
// ─────────────────────────────────────────────────────────────────────

const lookupEmployeeName = (id: number | string): string => {
    const employees = (STATE.step4.employees || []) as Employee[];
    for (const emp of employees) {
        if (Number(emp.id) === Number(id)) return emp.name || '';
    }
    return '(id ' + id + ')';
};

// ─────────────────────────────────────────────────────────────────────
// loadStep4Lists — three parallel server calls
// ─────────────────────────────────────────────────────────────────────

/**
 * Three parallel server calls:
 *   1. wizardListPhoneNumbers — owned Twilio numbers
 *   2. wizardListEmployees    — NetSuite employees
 *   3. wizardLoadAssignments  — existing rep assignments (so revisits
 *                                show prior state)
 *
 * Called from goToStep when advancing INTO Step 4. Re-render fires
 * once #1 and #2 settle — #3 doesn't trigger a render because it
 * populates STATE.step4.assignments synchronously and the next
 * render from #1/#2 picks it up.
 */
export const loadStep4Lists = (deps: Step4Deps): void => {
    // Reset
    STATE.step4.phoneNumbers = null;
    STATE.step4.employees = null;
    STATE.step4.assignments = {};
    STATE.step4.listLoadError = null;

    const rerenderIfReady = (): void => {
        if (STATE.step4.phoneNumbers !== null &&
            STATE.step4.employees !== null) {
            deps.rerender();
        }
    };

    wizardCall('wizardListPhoneNumbers', {})
        .then((p) => {
            const resp = p as { items?: unknown[]; errorMessage?: string } | null;
            STATE.step4.phoneNumbers = (resp && resp.items) || [];
            if (resp && resp.errorMessage) STATE.step4.listLoadError = resp.errorMessage;
            rerenderIfReady();
        }).catch((e: unknown) => {
            const err = e as { message?: string };
            STATE.step4.phoneNumbers = [];
            STATE.step4.listLoadError = 'Phone numbers: ' +
                (err && err.message ? err.message : String(e));
            rerenderIfReady();
        });

    wizardCall('wizardListEmployees', {})
        .then((p) => {
            const resp = p as { items?: unknown[]; errorMessage?: string } | null;
            STATE.step4.employees = (resp && resp.items) || [];
            if (resp && resp.errorMessage) STATE.step4.listLoadError = resp.errorMessage;
            rerenderIfReady();
        }).catch((e: unknown) => {
            const err = e as { message?: string };
            STATE.step4.employees = [];
            STATE.step4.listLoadError = 'Employees: ' +
                (err && err.message ? err.message : String(e));
            rerenderIfReady();
        });

    // Load existing assignments so revisits show prior state
    wizardCall('wizardLoadAssignments', {})
        .then((p) => {
            const resp = p as { items?: ServerAssignmentRow[] } | null;
            const items = (resp && resp.items) || [];
            const map: Record<string, AssignmentEntry> = {};
            items.forEach((a) => {
                if (!map[a.phoneSid]) {
                    map[a.phoneSid] = {
                        employeeIds: [],
                        label: a.label || '',
                        primaryEmployeeId: null
                    };
                }
                const empId = Number(a.employeeId);
                map[a.phoneSid].employeeIds!.push(empId);
                if (a.isPrimary) map[a.phoneSid].primaryEmployeeId = empId;
            });
            STATE.step4.assignments = map;
            // Don't rerender on this one — phoneNumbers/employees
            // arrival triggers the render and picks up assignments
            // synchronously since they're already in STATE.
        }).catch(() => { /* ignore — non-fatal */ });
};
