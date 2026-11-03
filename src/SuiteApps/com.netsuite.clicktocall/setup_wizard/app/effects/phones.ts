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
import type {
    AppState,
    InboundPublishError,
    InboundPublishResult,
    InboundRoute,
    PhoneDraft
} from '../InitialState';

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

export interface ByPhoneEntry {
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

interface ListEnvelope<T> {
    items?: T[];
    hasMore?: boolean;
    error?: string;
    errorMessage?: string;
}

const listError = (p: ListEnvelope<unknown> | null): string | null =>
    p && (p.error || p.errorMessage) ? String(p.errorMessage || p.error) : null;

const thrownText = (e: unknown, fallback: string): string =>
    e instanceof Error && e.message ? 'Network: ' + e.message : fallback;

/**
 * Load Twilio phone numbers + NetSuite employees + existing assignments
 * in parallel for the Phones DataGrid. Computes byPhone grouping
 * client-side. A Twilio list failure is kept as phonesListError (the
 * page shows it with Retry, not "No phone numbers found"). The table
 * stays on screen during a refresh.
 */
export async function loadPhonesData(): Promise<void> {
    store.dispatch(Action.phonesLoadStart());

    try {
        const [phonesPayload, employeesPayload, assignmentsPayload] = await Promise.all([
            wizardCall('wizardListPhoneNumbers', {}),
            wizardCall('wizardListEmployees', {}),
            wizardCall('wizardLoadAssignments', {})
        ]);
        const phones = phonesPayload as ListEnvelope<PhoneRow> | null;
        const emps = employeesPayload as ListEnvelope<unknown> | null;
        const asg = assignmentsPayload as ListEnvelope<AssignmentRow> | null;

        const numbers = (phones && phones.items) || [];
        const employees = (emps && emps.items) || [];
        const assignmentRows = (asg && asg.items) || [];
        const byPhone = groupByPhone(numbers, assignmentRows);

        const otherErrors = [
            listError(emps) ? 'Employees: ' + listError(emps) : '',
            listError(asg) ? 'Assignments: ' + listError(asg) : ''
        ].filter(Boolean).join(' · ');

        store.dispatch(Action.phonesLoadSuccess({
            numbers,
            employees,
            byPhone,
            listError: listError(phones),
            hasMore: !!(phones && phones.hasMore),
            error: otherErrors || null
        }));
        // Fresh counts for the Overview cards and the rail badge.
        if (!listError(asg)) {
            store.dispatch(Action.consolePatch({ assignments: assignmentRows }));
        }
    } catch (e) {
        store.dispatch(Action.phonesLoadFailure(thrownText(e, 'Phones load failed')));
    }
}

/** The saved state of one row (from the last load / save). */
function savedRow(phoneSid: string): ByPhoneEntry | null {
    const rows = ((store.getState() as AppState).console.phonesByPhone || []) as ByPhoneEntry[];
    return rows.find((r) => r.phoneSid === phoneSid) || null;
}

/** The primary a row ends up with: the chosen rep when assigned, else the first. */
export function effectivePrimary(employeeIds: number[], primary: number | null): number | null {
    if (primary !== null && employeeIds.indexOf(primary) >= 0) return primary;
    return employeeIds.length > 0 ? employeeIds[0] : null;
}

/** The row as the admin sees it: the draft when there is one, else saved. */
export function rowValues(row: ByPhoneEntry, drafts: Record<string, PhoneDraft>): PhoneDraft {
    const draft = drafts[row.phoneSid];
    const employeeIds = draft ? draft.employeeIds : row.employeeIds;
    const primary = draft ? draft.primaryEmployeeId : row.primaryEmployeeId;
    return { employeeIds, primaryEmployeeId: effectivePrimary(employeeIds, primary) };
}

/** Same reps, in any order (a multiselect may report another order). */
const sameIds = (a: number[], b: number[]): boolean =>
    a.length === b.length && a.every((v) => b.indexOf(v) >= 0);

/**
 * Local edit of the open row (reps and/or primary). Nothing is saved and
 * the saved rows are never changed: the edit lives in phonesDrafts; Save
 * is enabled while it differs from the saved state; an edit back to the
 * saved state drops the draft.
 */
export function editPhonesRow(phoneSid: string, changes: Partial<PhoneDraft>): void {
    const state = store.getState() as AppState;
    if (state.console.phonesSavingSid === phoneSid) return;
    if (state.console.phonesEditingSid !== phoneSid) return;
    const saved = savedRow(phoneSid);
    if (!saved) return;
    const current = rowValues(saved, state.console.phonesDrafts);
    const picked = changes.employeeIds !== undefined ? changes.employeeIds : current.employeeIds;
    // Same set as now: keep the current order (the first rep is the default primary).
    const employeeIds = sameIds(picked, current.employeeIds) ? current.employeeIds : picked;
    const requested = changes.primaryEmployeeId !== undefined
        ? changes.primaryEmployeeId : current.primaryEmployeeId;
    const next: PhoneDraft = {
        employeeIds,
        primaryEmployeeId: effectivePrimary(employeeIds, requested)
    };
    // No-op edits (a widget re-reporting its own value) dispatch nothing.
    if (sameIds(next.employeeIds, current.employeeIds) &&
        next.primaryEmployeeId === current.primaryEmployeeId) return;
    const savedValues = rowValues(saved, {});
    const unchanged = sameIds(next.employeeIds, savedValues.employeeIds) &&
        next.primaryEmployeeId === savedValues.primaryEmployeeId;
    store.dispatch(Action.phonesDraftSet(phoneSid, unchanged ? null : next));
}

/** Open one row in the editor panel (drops another row's unsaved edits). */
export function openPhonesEditor(phoneSid: string): void {
    const c = (store.getState() as AppState).console;
    if (c.phonesSavingSid !== null || c.phonesEditingSid === phoneSid) return;
    store.dispatch(Action.phonesEditRow(phoneSid));
}

/** Cancel: close the editor and drop the row's edits. */
export function cancelPhonesRow(phoneSid: string): void {
    if ((store.getState() as AppState).console.phonesSavingSid === phoneSid) return;
    store.dispatch(Action.phonesEditRow(null));
}

/** True while one row save runs; a second Save waits for it (one in flight). */
let saveInFlight = false;

/**
 * Refresh the Inbound routing table after an assignment save (primary
 * reps, so routes, may have changed). Only the routes and publish state
 * are replaced: unsaved Inbound form edits are kept. Skipped when the
 * Inbound page has not loaded yet (it loads fresh on its first visit).
 */
async function refreshInboundRoutes(): Promise<void> {
    if (!(store.getState() as AppState).inbound.loaded) return;
    try {
        const r = (await wizardCall('wizardLoadInbound', {})) as {
            ok?: boolean; routes?: InboundRoute[]; flowSid?: string; publishedAt?: string;
        } | null;
        if (!r || r.ok !== true || !Array.isArray(r.routes)) return;
        store.dispatch(Action.inboundRoutesSet({
            routes: r.routes,
            flowSid: r.flowSid || '',
            publishedAt: r.publishedAt || ''
        }));
    } catch (e) {
        // The Inbound page keeps its last table; its Retry reloads it.
    }
}

/**
 * Save one row of the Phones DataGrid: the reps and the primary (the
 * rep the number rings; also the number's outbound caller ID). Saves are
 * serialised (one in flight; the row is disabled while it saves). After
 * the save: reload the assignments (rows, Overview counts, rail badge)
 * and the Inbound routes. The server republishes inbound routing once
 * per save when inbound is on.
 *
 * Server contract: `wizardSaveAssignments`
 * `{assignments: [{phoneSid, phoneNumber, employeeIds, label, primaryEmployeeId}]}`
 * → `{saved, routing}` (delete-then-insert for that phoneSid only;
 * exactly one primary when any rep is assigned, default the first).
 */
export async function savePhonesRow(phoneSid: string): Promise<void> {
    if (saveInFlight) return;
    const state = store.getState() as AppState;
    const saved = savedRow(phoneSid);
    const draft = state.console.phonesDrafts[phoneSid];
    if (!saved || !draft) return;

    saveInFlight = true;
    store.dispatch(Action.phonesRowSave({ phoneSid, phase: 'start' }));
    try {
        const values = rowValues(saved, state.console.phonesDrafts);
        const result = await wizardCall('wizardSaveAssignments', {
            assignments: [{
                phoneSid,
                phoneNumber: saved.phoneNumber,
                employeeIds: values.employeeIds,
                label: saved.label,
                primaryEmployeeId: values.primaryEmployeeId
            }]
        }) as { saved?: boolean; error?: string; errorMessage?: string; routing?: InboundPublishResult } | null;

        if (!result || result.saved !== true) {
            store.dispatch(Action.phonesRowSave({
                phoneSid,
                phase: 'failure',
                error: (result && (result.errorMessage || result.error)) || 'save_failed'
            }));
            return;
        }

        // Inbound routing republishes with every assignment save. The
        // inbound slice gets every real publish result (ok, partial or
        // failed: the Inbound page shows it). This page keeps the errors
        // for its one-line warning: per-number errors, plus the message of
        // a publish that failed before any number (phoneNumber '').
        const routing = result.routing;
        if (routing && !routing.skipped && typeof routing.ok === 'boolean') {
            store.dispatch(Action.inboundRoutingUpdate(routing));
        }
        const routingErrors: InboundPublishError[] =
            routing && Array.isArray(routing.errors) ? routing.errors.slice() : [];
        if (routing && routing.ok === false && !routing.skipped && !routing.partial &&
            routingErrors.length === 0) {
            routingErrors.push({
                phoneNumber: '',
                message: routing.message || 'Inbound routing was not published. Publish again.'
            });
        }

        // Reload the saved assignments (no Twilio re-list). If that read
        // fails, show the row as saved and say the list is not fresh.
        let reloadError: string | null = null;
        let rows: AssignmentRow[] | null = null;
        try {
            const asg = (await wizardCall('wizardLoadAssignments', {})) as ListEnvelope<AssignmentRow> | null;
            if (asg && Array.isArray(asg.items) && !listError(asg)) rows = asg.items;
        } catch (e) {
            rows = null;
        }
        if (rows) {
            const numbers = ((store.getState() as AppState).console.phonesNumbers || []) as PhoneRow[];
            store.dispatch(Action.phonesLoadSuccess({ byPhone: groupByPhone(numbers, rows) }));
            store.dispatch(Action.consolePatch({ assignments: rows }));
        } else {
            const current = ((store.getState() as AppState).console.phonesByPhone || []) as ByPhoneEntry[];
            store.dispatch(Action.phonesLoadSuccess({
                byPhone: current.map((r) => (r.phoneSid === phoneSid
                    ? { ...r, employeeIds: values.employeeIds, primaryEmployeeId: values.primaryEmployeeId }
                    : r))
            }));
            reloadError = 'Saved, but the list did not refresh. Click "Refresh from Twilio".';
        }

        store.dispatch(Action.phonesRowSave({
            phoneSid, phase: 'success', routingErrors, error: reloadError
        }));
        await refreshInboundRoutes();
    } catch (e) {
        store.dispatch(Action.phonesRowSave({
            phoneSid, phase: 'failure', error: thrownText(e, 'save_failed')
        }));
    } finally {
        saveInFlight = false;
    }
}
