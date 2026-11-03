/**
 * Phones & reps page (#/phones) — canvas Phones.dc.html.
 *
 *   Header        "N numbers from Twilio · listed <time>" + Refresh from Twilio
 *   Two cards     "How caller ID works" and "Who calls out from what today"
 *                 (lib ctc_rl_token resolveCallerId: the number that rings
 *                 the rep, else the config default)
 *   Table card    read-only DataGrid: Number (+ friendly name), Rings,
 *                 Also assigned, Routing (signal numberRouting), Rep's
 *                 phone (presence), Calls out from, Edit; legend under it.
 *   Row editor    one row at a time, in its own card UNDER the grid (never
 *                 in the grid: an editable grid column dropped saved reps):
 *                 Rings (the one rep the number rings; also their caller
 *                 ID) and Also assigned (reference only). Edits live in
 *                 phonesDrafts; saves are serialised; one primary per
 *                 number (effects/phones effectivePrimary).
 */

import {PureComponent} from '@uif-js/core';
import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {
    cancelPhonesRow,
    editPhonesRow,
    loadPhonesData,
    openPhonesEditor,
    rowValues,
    savePhonesRow
} from '../../app/effects/phones';
import type {ByPhoneEntry} from '../../app/effects/phones';
import {loadPresence} from '../../app/effects/presence';
import {loadHealth} from '../../app/effects/health';
import {goToSection} from '../../app/effects/navigation';
import type {AppState, PresenceRow} from '../../app/InitialState';
import type {PageTickProps} from '../../App';
import {formatPhone} from '../shared/formatPhone';
import {friendlyError} from '../shared/friendlyError';
import {PHONE_STATUS_NOT_RECEIVING, PHONE_STATUS_OFFLINE, phoneStatus, relativeTime} from '../shared/phoneStatus';
import {callerIdPlan, firstName, routingStatus, timeOfDay} from '../shared/consoleModel';
import type {NumberRoutingValue, NumberRow, Tone} from '../shared/consoleModel';
import {
    button, card, cardTitle, dotText, emptyCard, errorLine, extLink, grid, help, hstack, pageHeader, problemCard,
    skeleton, text, vstack, Gap
} from '../shared/ui';
import type {Child} from '../shared/ui';

interface EmployeeOption {
    id: number;
    name: string;
}

interface TableRow extends ByPhoneEntry {
    ringId: number | null;
}

interface CellArgs {
    cell?: { row?: { dataItem?: TableRow } };
}

/** Employee id of a selection value (an item object or its id). */
const idOf = (v: unknown): number =>
    Number(v && typeof v === 'object' ? (v as { id?: unknown }).id : v);

const toIds = (values: unknown[] | undefined): number[] =>
    (values || []).map(idOf).filter((n) => !isNaN(n) && n > 0);

/** Rep's phone: presence status → dot tone. */
export function presenceTone(row: PresenceRow | undefined): { tone: Tone; label: string } {
    const s = phoneStatus(row);
    if (s === PHONE_STATUS_OFFLINE) return { tone: 'off', label: s.label };
    if (s === PHONE_STATUS_NOT_RECEIVING) return { tone: 'warn', label: s.label };
    return { tone: 'ok', label: s.label };
}

/** Names of the Phones & reps employees list (or "Employee <id>"). */
function employeeNames(state: AppState): { employees: EmployeeOption[]; nameOf: (id: number) => string } {
    const employees: EmployeeOption[] =
        ((state.console.phonesEmployees || []) as Array<{ id: unknown; name?: string }>)
            .map((e) => ({ id: Number(e.id), name: e.name || '' }));
    const names: Record<string, string> = {};
    // Assignment rows carry names too (before the employee list loads).
    ((state.console.assignments || []) as Array<{ employeeId?: unknown; employeeName?: string }>)
        .forEach((a) => { if (a.employeeName) names[String(a.employeeId)] = a.employeeName; });
    const nameOf = (id: number): string =>
        employees.find((e) => e.id === id)?.name || names[String(id)] || ('Employee ' + id);
    return { employees, nameOf };
}

/** The saved number rows with the rep each one rings. */
function tableRows(state: AppState): TableRow[] {
    return ((state.console.phonesByPhone || []) as ByPhoneEntry[]).map((r) => ({
        ...r,
        employeeIds: r.employeeIds.slice(),
        ringId: rowValues(r, {}).primaryEmployeeId
    }));
}

/**
 * "Who calls out from what": rep | number · rings this rep / default.
 * Phones & reps and Outbound calls both show it.
 */
export function callerIdList(state: AppState): Child {
    const c = state.console;
    if (c.phonesByPhone === null) {
        return c.phonesLoading ? skeleton('lines', 3) : text('Not loaded yet.', { weak: true });
    }
    const rows = tableRows(state);
    const defaultNumber = ((c.snapshot || {}) as { phoneNumber?: string }).phoneNumber || '';
    const plan = callerIdPlan(rows, defaultNumber);
    const {nameOf} = employeeNames(state);
    const lines: Child[] = [];
    plan.repIds.forEach((id) => {
        const out = plan.byRep[String(id)];
        lines.push(text(nameOf(id), { strong: true, small: true }));
        lines.push(text(out && out.phoneNumber
            ? formatPhone(out.phoneNumber) + (out.ringsThem ? ' · rings this rep' : ' · default (rings for no number)')
            : 'No default caller ID set', { small: true }));
    });
    return lines.length ? grid('auto minmax(0, 1fr)', lines, Gap.SPACING4X, { rowGap: Gap.SPACING2X })
        : text(rows.length ? 'No rep is assigned to a number yet.' : 'No numbers yet.', { weak: true });
}

const ALSO_ASSIGNED_HELP = 'Only the rep under Rings receives this number\'s calls and calls out from it. ' +
    'Also assigned reps are for reference only: they do not ring and do not change caller ID. ' +
    'Saving republishes inbound routing when inbound calls are on (a few seconds).';

export default class PhonesPage extends PureComponent<PageTickProps, unknown> {
    componentDidMount(): void {
        const state = store.getState() as AppState;
        const c = state.console;
        if (c.phonesNumbers === null && !c.phonesLoading) loadPhonesData();
        // Live data: the rep phones each time the page opens.
        loadPresence();
        if (!state.health.loaded && !state.health.loading) loadHealth();
    }

    private buildColumns(nameOf: (id: number) => string, plan: ReturnType<typeof callerIdPlan>): unknown[] {
        const CT = (component.DataGrid as unknown as { ColumnType: Record<string, unknown> }).ColumnType;
        const state = store.getState() as AppState;
        const routingSig = state.health.signals.numberRouting;
        const routingValue = (routingSig && routingSig.value) as NumberRoutingValue | null;
        const presence = state.presence;
        const byEmployee: Record<string, PresenceRow> = {};
        presence.items.forEach((p) => { byEmployee[p.employeeId] = p; });
        const nowMs = Date.now() + presence.clockSkewMs;
        const row = (args: CellArgs): TableRow | undefined => args?.cell?.row?.dataItem;
        const c = state.console;

        return [
            {
                type: CT.TEMPLATED, name: 'number', label: 'Number', stretchFactor: 3,
                content: (args: CellArgs): unknown => {
                    const r = row(args);
                    return vstack([
                        text(formatPhone(r?.phoneNumber) || '(unknown)', { strong: true }),
                        r && r.friendlyName ? help(r.friendlyName) : null
                    ], Gap.NONE);
                }
            },
            {
                type: CT.TEMPLATED, name: 'rings', label: 'Rings', stretchFactor: 3,
                content: (args: CellArgs): unknown => {
                    const r = row(args);
                    return r && r.ringId !== null ? text(nameOf(r.ringId)) : text('—', { weak: true });
                }
            },
            {
                type: CT.TEMPLATED, name: 'also', label: 'Also assigned', stretchFactor: 3,
                content: (args: CellArgs): unknown => {
                    const r = row(args);
                    const others = r ? r.employeeIds.filter((id) => id !== r.ringId) : [];
                    return others.length ? text(others.map(nameOf).join(', ')) : text('—', { weak: true });
                }
            },
            {
                type: CT.TEMPLATED, name: 'routing', label: 'Routing', stretchFactor: 3,
                content: (args: CellArgs): unknown => {
                    const r = row(args);
                    if (!r) return text('');
                    if (!routingValue && r.ringId !== null) {
                        return text(state.health.loading ? 'Checking…' : 'Not checked', { weak: true });
                    }
                    const s = routingStatus(r as NumberRow, routingValue);
                    return dotText(s.tone, s.label);
                }
            },
            {
                type: CT.TEMPLATED, name: 'phone', label: 'Rep\'s phone', stretchFactor: 4,
                content: (args: CellArgs): unknown => {
                    const r = row(args);
                    if (!r || r.ringId === null) return text('—', { weak: true });
                    if (!presence.loaded) return text(presence.error ? '—' : 'Loading…', { weak: true });
                    const p = byEmployee[String(r.ringId)];
                    const s = presenceTone(p);
                    return dotText(s.tone, s.label, '· ' + relativeTime(p ? p.lastSeen : '', nowMs).toLowerCase());
                }
            },
            {
                type: CT.TEMPLATED, name: 'callsOut', label: 'Calls out from', stretchFactor: 4,
                content: (args: CellArgs): unknown => {
                    const r = row(args);
                    if (!r || r.ringId === null) return text('—', { weak: true });
                    const out = plan.byRep[String(r.ringId)];
                    const who = firstName(nameOf(r.ringId));
                    if (out && out.phoneNumber === r.phoneNumber) return text(who + ', from this number');
                    return text(who + ', from ' + (out && out.phoneNumber ? formatPhone(out.phoneNumber) : 'the default'));
                }
            },
            {
                type: CT.TEMPLATED, name: 'action', label: 'Actions', stretchFactor: 2,
                content: (args: CellArgs): unknown => {
                    const r = row(args);
                    if (!r) return text('');
                    return button('Edit', () => { openPhonesEditor(r.phoneSid); }, {
                        small: true,
                        enabled: c.phonesSavingSid === null && c.phonesEditingSid !== r.phoneSid
                    });
                }
            }
        ];
    }

    /** The one row editor, in its own card under the table. */
    private renderEditor(row: ByPhoneEntry, employees: EmployeeOption[], nameOf: (id: number) => string): core.VDom.Node {
        const c = (store.getState() as AppState).console;
        const values = rowValues(row, c.phonesDrafts);
        const savingThis = c.phonesSavingSid === row.phoneSid;
        const anySaving = c.phonesSavingSid !== null;
        const dirty = !!c.phonesDrafts[row.phoneSid];
        const rowError = c.phonesRowErrors[row.phoneSid];
        const ringId = values.primaryEmployeeId;
        const others = values.employeeIds.filter((id) => id !== ringId);

        const ringsPicker = (
            <component.Dropdown
                dataSource={new core.ArrayDataSource(employees) as never}
                valueMember="id"
                displayMember="name"
                selectedValue={ringId as never}
                allowEmpty={true}
                placeholder="No rep (callers hear the no-answer message)"
                enabled={!savingThis}
                onSelectionChanged={(sel: { value?: unknown }): void => {
                    const id = idOf(sel && sel.value);
                    if (!id || isNaN(id)) {
                        editPhonesRow(row.phoneSid, { employeeIds: [], primaryEmployeeId: null });
                        return;
                    }
                    if (id === ringId) return;
                    editPhonesRow(row.phoneSid, {
                        employeeIds: [id].concat(values.employeeIds.filter((x) => x !== id)),
                        primaryEmployeeId: id
                    });
                }}
                rootStyle={{width: '100%'} as never}
            />
        );

        // Selected items are the dataSource's own objects for the ids.
        const alsoChoices = employees.filter((e) => e.id !== ringId);
        const selectedItems = others.map((id) =>
            alsoChoices.find((e) => e.id === id) || ({ id, name: nameOf(id) } as EmployeeOption));
        const alsoPicker = (
            <component.MultiselectDropdown
                dataSource={new core.ArrayDataSource(alsoChoices) as never}
                valueMember="id"
                displayMember="name"
                selectedItems={selectedItems as never}
                comparator={(l: unknown, r: unknown): boolean => idOf(l) === idOf(r)}
                placeholder={ringId === null ? 'Pick who rings first' : 'Add reps'}
                enabled={!savingThis && ringId !== null}
                onSelectionChanged={(args: { values?: unknown[] }): void => {
                    if (ringId === null) return;
                    const picked = toIds(args && args.values).filter((id) => id !== ringId);
                    editPhonesRow(row.phoneSid, { employeeIds: [ringId].concat(picked), primaryEmployeeId: ringId });
                }}
                rootStyle={{width: '100%'} as never}
            />
        );

        const body: Child[] = [
            cardTitle('Editing ' + formatPhone(row.phoneNumber) + (row.friendlyName ? ' · ' + row.friendlyName : '')),
            grid('minmax(0, 1fr) minmax(0, 1fr)', [
                vstack([text('Rings', { strong: true, small: true }), ringsPicker], Gap.SPACING1X),
                vstack([text('Also assigned', { strong: true, small: true }), alsoPicker], Gap.SPACING1X)
            ], Gap.SPACING4X),
            help(ALSO_ASSIGNED_HELP),
            hstack([
                button(savingThis ? 'Saving…' : 'Save', () => { savePhonesRow(row.phoneSid); }, {
                    primary: true, small: true, enabled: dirty && !anySaving
                }),
                button('Cancel', () => { cancelPhonesRow(row.phoneSid); }, { small: true, enabled: !savingThis })
            ])
        ];
        if (rowError) body.push(errorLine(friendlyError(rowError)));
        return card(body, { label: 'Edit number' });
    }

    private renderCallerId(state: AppState, defaultNumber: string): core.VDom.Node {
        const how = card([
            cardTitle('How caller ID works'),
            text('Each rep calls out from the number that rings them, so a callback reaches the same rep. ' +
                'A rep who rings for no number calls out from the default, ' +
                (defaultNumber ? formatPhone(defaultNumber) : '(not set)') + '. Also assigned reps do not ring and ' +
                'do not change caller ID.', { weak: true }),
            button('Change the default under Outbound calls', () => { goToSection('outbound'); }, { link: true, small: true })
        ], { label: 'How caller ID works', fill: true });
        const who = card([cardTitle('Who calls out from what today'), callerIdList(state)],
            { label: 'Who calls out from what today', fill: true });
        return grid('minmax(0, 1fr) minmax(0, 1fr)', [how, who], Gap.SPACING3X, { stretch: true });
    }

    render(): core.VDom.Node {
        const state = store.getState() as AppState;
        const c = state.console;
        const {employees, nameOf} = employeeNames(state);
        const defaultNumber = ((c.snapshot || {}) as { phoneNumber?: string }).phoneNumber || '';
        const refreshing = c.phonesLoading;
        const numbers = (c.phonesNumbers || []) as unknown[];
        const listed = timeOfDay(c.phonesLoadedAt);

        const header = pageHeader('Phones & reps',
            'Which rep each Twilio number rings, and the number each rep calls out from.', [
                c.phonesNumbers !== null && !c.phonesListError
                    ? help(numbers.length + (numbers.length === 1 ? ' number' : ' numbers') + ' from Twilio' +
                        (listed ? ' · listed ' + listed : ''))
                    : null,
                button(refreshing ? 'Refreshing…' : 'Refresh from Twilio', () => { loadPhonesData(); }, {
                    enabled: !refreshing, icon: core.SystemIcon.REFRESH
                })
            ]);

        // First load (nothing to show yet): skeletons in the final layout.
        if (c.phonesByPhone === null && c.phonesLoading) {
            return vstack([
                header,
                grid('minmax(0, 1fr) minmax(0, 1fr)', [card([skeleton('lines', 3)]), card([skeleton('lines', 3)])],
                    Gap.SPACING3X, { stretch: true }),
                card([skeleton('table', 3, 'Loading phones & reps…')])
            ], Gap.SPACING4X);
        }

        // Copies: the grid never holds the saved row objects.
        const rows = tableRows(state);
        const plan = callerIdPlan(rows, defaultNumber);
        const editingRow = c.phonesEditingSid ? rows.find((r) => r.phoneSid === c.phonesEditingSid) || null : null;
        const routingNumberErrors = c.phonesRoutingErrors.filter((e) => !!e.phoneNumber);
        const routingPublishErrors = c.phonesRoutingErrors.filter((e) => !e.phoneNumber);

        const messages: Child[] = [
            c.phonesListError ? problemCard('Couldn\'t load phone numbers',
                friendlyError(c.phonesListError) + ' Your saved assignments are unchanged.', [
                    button(refreshing ? 'Refreshing…' : 'Retry', () => { loadPhonesData(); }, {
                        primary: true, small: true, enabled: !refreshing
                    }),
                    button('Check the connection', () => { goToSection('account'); }, { link: true, small: true })
                ]) : null,
            c.phonesError ? errorLine(friendlyError(c.phonesError)) : null,
            c.phonesHasMore ? help('Only the first 100 Twilio numbers are shown.') : null,
            routingNumberErrors.length ? text('⚠ Inbound routing did not update for: ' +
                routingNumberErrors.map((e) => formatPhone(e.phoneNumber)).join(', '), { strong: true, small: true }) : null,
            routingPublishErrors.length ? text('⚠ Inbound routing did not publish: ' +
                routingPublishErrors.map((e) => e.message).join(' '), { strong: true, small: true }) : null
        ];

        let table: Child;
        if (rows.length === 0) {
            // With a list error the message above says why; no "no numbers" claim then.
            table = c.phonesListError ? null : emptyCard('No phone numbers yet',
                'Buy or port a number in the Twilio Console, then refresh here. Reps can call out before a number rings anyone.', [
                    button(refreshing ? 'Refreshing…' : 'Refresh from Twilio', () => { loadPhonesData(); }, {
                        small: true, enabled: !refreshing
                    }),
                    extLink('Twilio Console', 'https://console.twilio.com/')
                ]);
        } else {
            table = card([
                new component.DataGrid({
                    dataSource: new core.ArrayDataSource(rows),
                    columns: this.buildColumns(nameOf, plan),
                    columnStretch: true,
                    highlightRowsOnHover: true,
                    dataRowHeight: 64,
                    headerRowHeight: 40,
                    rootStyle: { width: '100%' }
                } as never),
                hstack([
                    dotText('ok', 'CTC routing: calls to the number reach the rep under Rings', undefined, { small: true }),
                    dotText('warn', 'Not routed: the number points somewhere else in Twilio', undefined, { small: true }),
                    dotText('off', 'No rep: calls hear the no-answer message', undefined, { small: true })
                ], Gap.SPACING4X, { wrap: true })
            ], { label: 'Numbers' });
        }

        return vstack([
            header,
            this.renderCallerId(state, defaultNumber),
            ...messages,
            table,
            editingRow ? this.renderEditor(editingRow, employees, nameOf) : null
        ], Gap.SPACING4X);
    }
}
