/**
 * Phones effects — async action thunks for the Admin Console's Phones
 * section (U3 / Phase 3b).
 *
 * Phase 7 fix (2026-05-28) — corrects two response-shape bugs from the
 * Phase 2 initial implementation:
 *   1. wizardListPhoneNumbers / wizardListEmployees return { items: [...] },
 *      NOT { phones: [...] } / { employees: [...] }.
 *   2. byPhone is a CLIENT-SIDE grouping (assignments rows joined to phone
 *      numbers by phoneSid), NOT a server-side field. The legacy
 *      AppController and step4.ts both compute this grouping locally.
 */

import {store} from '../Store';
import {Action} from '../Action';
import {wizardCall} from '../../services/wizardApi';

interface PhoneRow {
    sid: string;
    phoneNumber?: string;
    friendlyName?: string;
}

interface AssignmentRow {
    phoneSid: string;
    employeeId: number | string;
    isPrimary?: boolean;
    label?: string;
}

interface ByPhoneEntry {
    phoneSid: string;
    phoneNumber: string;
    friendlyName: string;
    employeeIds: number[];
    label: string;
    primaryEmployeeId: number | null;
}

/**
 * Group raw assignment rows by phoneSid and join to the matching phone-
 * number metadata. Mirrors the legacy AppController.loadPhonesData
 * grouping logic.
 */
function groupByPhone(
    phoneNumbers: PhoneRow[],
    assignments: AssignmentRow[]
): ByPhoneEntry[] {
    const map: Record<string, ByPhoneEntry> = {};

    // Seed the map with one entry per phone number so phones with zero
    // assigned reps still appear in the DataGrid.
    for (const pn of phoneNumbers) {
        if (!pn.sid) continue;
        map[pn.sid] = {
            phoneSid: pn.sid,
            phoneNumber: pn.phoneNumber || '',
            friendlyName: pn.friendlyName || '',
            employeeIds: [],
            label: '',
            primaryEmployeeId: null
        };
    }

    // Layer the assignment rows on top.
    for (const a of assignments) {
        if (!a.phoneSid) continue;
        if (!map[a.phoneSid]) {
            map[a.phoneSid] = {
                phoneSid: a.phoneSid,
                phoneNumber: '',
                friendlyName: '',
                employeeIds: [],
                label: a.label || '',
                primaryEmployeeId: null
            };
        }
        const empId = Number(a.employeeId);
        map[a.phoneSid].employeeIds.push(empId);
        if (a.label && !map[a.phoneSid].label) map[a.phoneSid].label = a.label;
        if (a.isPrimary) map[a.phoneSid].primaryEmployeeId = empId;
    }

    return Object.values(map);
}

/**
 * Load Twilio phone numbers + NetSuite employees + existing assignments
 * in parallel for the Phones DataGrid. Computes byPhone grouping
 * client-side.
 */
export async function loadPhonesData(): Promise<void> {
    store.dispatch(Action.phonesLoadStart());

    try {
        const [phonesPayload, employeesPayload, assignmentsPayload] = await Promise.all([
            wizardCall('wizardListPhoneNumbers', {}),
            wizardCall('wizardListEmployees', {}),
            wizardCall('wizardLoadAssignments', {})
        ]);

        const numbers = (phonesPayload && (phonesPayload as { items?: PhoneRow[] }).items) || [];
        const employees = (employeesPayload && (employeesPayload as { items?: unknown[] }).items) || [];
        const assignmentRows = (assignmentsPayload && (assignmentsPayload as { items?: AssignmentRow[] }).items) || [];
        const byPhone = groupByPhone(numbers, assignmentRows);

        store.dispatch(Action.phonesLoadSuccess({ numbers, employees, byPhone }));
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Phones load failed';
        store.dispatch(Action.phonesAssignmentSave({
            phoneSid: '__load__',
            error: msg
        }));
    }
}

/**
 * Save one row of the Phones DataGrid — assign employees to a phone
 * number + set primary + custom label. Refetches phone numbers +
 * assignments + recomputes byPhone after a successful save.
 *
 * Server contract: `wizardSaveAssignments` expects
 * `{assignments: [{phoneSid, phoneNumber, employeeIds, label, primaryEmployeeId}, ...]}`.
 * Earlier versions of this effect posted a single row directly — the
 * server returned `{ok: false, error: 'missing_assignments'}` and the
 * inline-edit silently never persisted. The fix wraps as a one-row
 * array; the server's delete-then-insert strategy scoped by phoneSid
 * means the single row only touches THAT phone's assignments.
 */
export async function savePhonesAssignment(
    phoneSid: string,
    phoneNumber: string,
    employeeIds: number[],
    label: string,
    primaryEmployeeId: number | null
): Promise<void> {
    store.dispatch(Action.phonesAssignmentSave({ phoneSid, saving: true, error: null }));

    try {
        const payload = {
            assignments: [{
                phoneSid,
                phoneNumber,
                employeeIds,
                label,
                primaryEmployeeId
            }]
        };
        const result = await wizardCall('wizardSaveAssignments', payload);
        const ok = result && ((result as { saved?: boolean }).saved === true);
        if (!ok) {
            const err = (result && (result as { error?: string }).error) || 'Save failed';
            store.dispatch(Action.phonesAssignmentSave({ phoneSid, saving: false, error: err }));
            return;
        }

        // Refetch numbers + assignments and recompute byPhone.
        const [phonesPayload, refreshedAssignments] = await Promise.all([
            wizardCall('wizardListPhoneNumbers', {}),
            wizardCall('wizardLoadAssignments', {})
        ]);
        const numbers = (phonesPayload && (phonesPayload as { items?: PhoneRow[] }).items) || [];
        const assignmentRows = (refreshedAssignments && (refreshedAssignments as { items?: AssignmentRow[] }).items) || [];
        const byPhone = groupByPhone(numbers, assignmentRows);

        store.dispatch(Action.phonesLoadSuccess({ byPhone }));
        store.dispatch(Action.phonesAssignmentSave({ phoneSid, saving: false, error: null }));
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Save failed';
        store.dispatch(Action.phonesAssignmentSave({ phoneSid, saving: false, error: msg }));
    }
}
