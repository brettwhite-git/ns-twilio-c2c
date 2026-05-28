/**
 * Step-specific effects — loaders for steps 3, 4, 5 + Step 5 activate.
 *
 * Phase 3 (2026-05-28) — moves the loader bodies from
 * components/steps/{step3,step4,step5}.ts into dispatch-based effects.
 * The JSX step components (Step3.tsx / Step4.tsx / Step5.tsx) fire these
 * from componentDidMount.
 *
 * The legacy `loadStep3Lists` / `loadStep4Lists` / `loadStep5` exports
 * in the .ts files keep working until Phase 6 deletes them.
 */

import {store} from '../Store';
import {Action} from '../Action';
import {wizardCall} from '../../services/wizardApi';

interface ListResponse {
    items?: unknown[];
    errorMessage?: string;
}

interface TwilioItem {
    sid?: string;
    phoneNumber?: string;
    friendlyName?: string;
}

/**
 * Load Step 3 dropdown source lists (TwiML apps, phone numbers, intel
 * services) in parallel. Defaults the selected SIDs to the first item
 * of each list so Continue sees a valid selection even if the admin
 * never touches the dropdown.
 */
export async function loadStep3Lists(): Promise<void> {
    // Reset to loading state
    store.dispatch(Action.step3FieldChange('twimlApps', null));
    store.dispatch(Action.step3FieldChange('phoneNumbers', null));
    store.dispatch(Action.step3FieldChange('intelServices', null));
    store.dispatch(Action.step3FieldChange('listLoadError', null));

    const fetchList = async (
        action: string,
        field: 'twimlApps' | 'phoneNumbers' | 'intelServices',
        sidField: 'twimlAppSid' | 'phoneNumber' | 'intelServiceSid',
        sidValue: (item: TwilioItem) => string
    ): Promise<void> => {
        try {
            const resp = (await wizardCall(action, {})) as ListResponse | null;
            const items = (resp && resp.items) || [];
            store.dispatch(Action.step3FieldChange(field, items));
            if (resp && resp.errorMessage) {
                store.dispatch(Action.step3FieldChange('listLoadError', resp.errorMessage));
            }
            // Default the SID to the first item if not already set
            const existing = (store.getState() as { step3: Record<string, unknown> }).step3[sidField];
            if (items.length > 0 && !existing) {
                const v = sidValue(items[0] as TwilioItem);
                if (v) store.dispatch(Action.step3FieldChange(sidField, v));
            }
        } catch (e) {
            const err = e as { message?: string };
            store.dispatch(Action.step3FieldChange(field, []));
            store.dispatch(Action.step3FieldChange(
                'listLoadError',
                field + ': ' + (err.message || String(e))
            ));
        }
    };

    await Promise.all([
        fetchList('wizardListTwiMLApps', 'twimlApps', 'twimlAppSid',
            (i) => i.sid || ''),
        fetchList('wizardListPhoneNumbers', 'phoneNumbers', 'phoneNumber',
            (i) => i.phoneNumber || ''),
        fetchList('wizardListIntelServices', 'intelServices', 'intelServiceSid',
            (i) => i.sid || '')
    ]);
}

interface AssignmentRow {
    phoneSid: string;
    employeeId: number | string;
    label?: string;
    isPrimary?: boolean;
}

interface AssignmentEntry {
    employeeIds: number[];
    label: string;
    primaryEmployeeId: number | null;
}

/**
 * Load Step 4 source lists (Twilio phone numbers + NetSuite employees)
 * and the existing assignments. The assignments are grouped by phoneSid
 * so the form's per-row MultiselectDropdown gets the right initial state.
 */
export async function loadStep4Lists(): Promise<void> {
    store.dispatch(Action.step4FieldChange('phoneNumbers', null));
    store.dispatch(Action.step4FieldChange('employees', null));
    store.dispatch(Action.step4FieldChange('assignments', {}));
    store.dispatch(Action.step4FieldChange('listLoadError', null));

    const reportError = (prefix: string, e: unknown): void => {
        const err = e as { message?: string };
        store.dispatch(Action.step4FieldChange(
            'listLoadError',
            prefix + ': ' + (err.message || String(e))
        ));
    };

    const numbersTask = wizardCall('wizardListPhoneNumbers', {})
        .then((p) => {
            const resp = p as ListResponse | null;
            store.dispatch(Action.step4FieldChange('phoneNumbers', (resp && resp.items) || []));
        })
        .catch((e: unknown) => {
            store.dispatch(Action.step4FieldChange('phoneNumbers', []));
            reportError('Phone numbers', e);
        });

    const employeesTask = wizardCall('wizardListEmployees', {})
        .then((p) => {
            const resp = p as ListResponse | null;
            store.dispatch(Action.step4FieldChange('employees', (resp && resp.items) || []));
        })
        .catch((e: unknown) => {
            store.dispatch(Action.step4FieldChange('employees', []));
            reportError('Employees', e);
        });

    const assignmentsTask = wizardCall('wizardLoadAssignments', {})
        .then((p) => {
            const resp = p as { items?: AssignmentRow[] } | null;
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
                map[a.phoneSid].employeeIds.push(empId);
                if (a.isPrimary) map[a.phoneSid].primaryEmployeeId = empId;
            });
            store.dispatch(Action.step4FieldChange('assignments', map));
        })
        .catch(() => { /* non-fatal */ });

    await Promise.all([numbersTask, employeesTask, assignmentsTask]);
}

/**
 * Load Step 5's snapshot + assignments + preflight in parallel. Used by
 * the Test & Activate page to show the current config + preflight result
 * before the admin clicks Activate.
 */
export async function loadStep5(): Promise<void> {
    const safe = <T>(promise: Promise<T>): Promise<T | null> =>
        promise.catch(() => null);

    const [snapshot, assignments, preflight] = await Promise.all([
        safe(wizardCall('wizardSnapshot', {})),
        safe(wizardCall('wizardLoadAssignments', {})),
        safe(wizardCall('wizardRunPreflight', {}))
    ]);

    // Step 5 lives on the console slice for the preflight + assignments
    // reads (matches existing Step5State shape). Dispatch through
    // consoleLoadSuccess for the shared fields the wizard + console
    // share.
    store.dispatch(Action.consoleLoadSuccess({
        snapshot,
        assignments: (assignments && (assignments as { rows?: unknown[] }).rows) || null,
        preflight: (preflight && (preflight as { checks?: unknown[] }).checks) || null
    }));
}
