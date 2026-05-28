/**
 * Phones effects — async action thunks for the Admin Console's Phones
 * section (U3 / Phase 3b).
 *
 * Phase 2 (2026-05-28) — wraps the legacy `loadPhonesData` + per-row
 * `savePhonesAssignment` callbacks in AppController.tsx as dispatch-based
 * effects.
 */

import {store} from '../Store';
import {Action} from '../Action';
import {wizardCall} from '../../services/wizardApi';

/**
 * Load Twilio phone numbers + NetSuite employees in parallel for the
 * Phones DataGrid. Mirrors AppController.loadPhonesData (paths 580-630).
 *
 * Employees are also pre-loaded in loadConsole to avoid the chip-display
 * timing race on first DataGrid render — this loader is for the
 * navigate-to-Phones-section path where the lists may already be cached.
 */
export async function loadPhonesData(): Promise<void> {
    store.dispatch(Action.phonesLoadStart());

    try {
        const [phonesPayload, employeesPayload] = await Promise.all([
            wizardCall('wizardListPhoneNumbers', {}),
            wizardCall('wizardListEmployees', {})
        ]);

        const numbers = (phonesPayload && (phonesPayload as { phones?: unknown[] }).phones) || [];
        const employees = (employeesPayload && (employeesPayload as { employees?: unknown[] }).employees) || [];

        store.dispatch(Action.phonesLoadSuccess({ numbers, employees }));
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
 * number + set primary + custom label. Mirrors AppController.handle
 * SaveRow (paths 630-660).
 *
 * On success, refetches wizardLoadAssignments and dispatches a
 * phonesLoadSuccess({byPhone}) so the DataGrid row reflects the
 * persisted state.
 */
export async function savePhonesAssignment(
    phoneSid: string,
    employeeIds: number[],
    label: string,
    primaryEmployeeId: number | null
): Promise<void> {
    store.dispatch(Action.phonesAssignmentSave({ phoneSid, saving: true, error: null }));

    try {
        const payload = {
            phoneSid,
            employeeIds,
            label,
            primaryEmployeeId
        };
        const result = await wizardCall('wizardSaveAssignments', payload);
        if (result && (result as { ok?: boolean }).ok === false) {
            const err = (result as { error?: string }).error || 'Save failed';
            store.dispatch(Action.phonesAssignmentSave({ phoneSid, saving: false, error: err }));
            return;
        }

        const refreshed = await wizardCall('wizardLoadAssignments', {});
        const byPhone = (refreshed && (refreshed as { byPhone?: unknown[] }).byPhone) || [];
        store.dispatch(Action.phonesLoadSuccess({ byPhone }));
        store.dispatch(Action.phonesAssignmentSave({ phoneSid, saving: false, error: null }));
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Save failed';
        store.dispatch(Action.phonesAssignmentSave({ phoneSid, saving: false, error: msg }));
    }
}
