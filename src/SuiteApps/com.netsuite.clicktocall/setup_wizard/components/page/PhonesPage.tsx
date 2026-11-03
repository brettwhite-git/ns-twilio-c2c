/**
 * Phones & reps page (U3) — JSX.
 *
 * Phase 4 (2026-05-28) — JSX rewrite of components/sections/phones.ts.
 *
 * 2026-11-03: the DataGrid is read-only. Editing inside the grid is gone:
 * a MULTI_SELECT_DROPDOWN column with `binding` + `editable` wrote its
 * own value into the row on cell commit (only the reps picked in that
 * session), which dropped the saved reps (seen live). Columns:
 *   1. Status icon
 *   2. Phone number
 *   3. Phone SID (truncated)
 *   4. Assigned reps (text)
 *   5. Rings — the primary rep (inbound rings them; the number is their
 *      outbound caller ID)
 *   6. Status badge
 *   7. Edit
 * Edit opens ONE row editor panel under the grid: a standalone
 * MultiselectDropdown (selected items = the real dataSource objects for
 * the saved ids), a Rings dropdown limited to the chosen reps, Save
 * (one save in flight) and Cancel. Edits live only in phonesDrafts; the
 * saved rows are never changed.
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
import type {AppState} from '../../app/InitialState';
import type {PageTickProps} from '../../App';
import {formatPhone} from '../shared/formatPhone';
import {friendlyError} from '../shared/friendlyError';

interface EmployeeOption {
    id: number;
    name: string;
}

interface CellArgs {
    cell?: { row?: { dataItem?: ByPhoneEntry } };
}

const truncSid = (sid: string | undefined): string => {
    if (!sid) return '';
    if (sid.length <= 14) return sid;
    return sid.slice(0, 6) + '…' + sid.slice(-4);
};

/** Employee id of a selection value (an item object or its id). */
const idOf = (v: unknown): number =>
    Number(v && typeof v === 'object' ? (v as { id?: unknown }).id : v);

const toIds = (values: unknown[] | undefined): number[] =>
    (values || []).map(idOf).filter((n) => !isNaN(n) && n > 0);

const CARD_STYLE = {
    border: '1px solid #E2E3E5',
    borderRadius: '8px',
    padding: '18px 22px',
    background: '#FAFAFB'
};

export default class PhonesPage extends PureComponent<PageTickProps, unknown> {
    componentDidMount(): void {
        const c = (store.getState() as AppState).console;
        if (c.phonesNumbers === null && !c.phonesLoading) {
            loadPhonesData();
        }
    }

    private buildColumns(nameOf: (id: number) => string): unknown[] {
        const CT = (component.DataGrid as unknown as { ColumnType: Record<string, unknown> }).ColumnType;
        const BdgType = component.Badge.Type;

        const statusForRow = (row: ByPhoneEntry): { icon: unknown; color: unknown; label: string } => {
            const state = store.getState() as AppState;
            if (state.console.phonesSavingSid === row.phoneSid) {
                return {
                    icon: core.SystemIcon.STATUS_INFO_FILLED,
                    color: core.ImageConstant.Color.INFO,
                    label: 'Saving…'
                };
            }
            if (row.employeeIds.length > 0) {
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

        return [
            {
                type: CT.TEMPLATED,
                name: 'statusIcon',
                label: '',
                stretchFactor: 1,
                content: (args: CellArgs): unknown => {
                    const row = args?.cell?.row?.dataItem;
                    if (!row) return new component.Text({ text: '' });
                    const s = statusForRow(row);
                    return new component.Image({
                        image: s.icon,
                        size: component.Image.Size.M,
                        color: s.color,
                        presentation: true
                    } as never);
                }
            },
            {
                type: CT.TEMPLATED,
                name: 'phone',
                label: 'Phone number',
                stretchFactor: 2,
                content: (args: CellArgs): unknown => {
                    const row = args?.cell?.row?.dataItem;
                    return new component.Text({
                        text: formatPhone(row?.phoneNumber) || '(unknown)',
                        type: component.Text.Type.STRONG
                    });
                }
            },
            {
                type: CT.TEMPLATED,
                name: 'phoneSid',
                label: 'Phone SID',
                stretchFactor: 2,
                content: (args: CellArgs): unknown => {
                    const row = args?.cell?.row?.dataItem;
                    return new component.Text({
                        text: truncSid(row?.phoneSid),
                        type: component.Text.Type.WEAK,
                        size: component.Text.Size.S
                    });
                }
            },
            {
                type: CT.TEMPLATED,
                name: 'reps',
                label: 'Assigned reps',
                stretchFactor: 4,
                content: (args: CellArgs): unknown => {
                    const row = args?.cell?.row?.dataItem;
                    const ids = row ? row.employeeIds : [];
                    if (ids.length === 0) {
                        return new component.Text({ text: '—', type: component.Text.Type.WEAK });
                    }
                    return new component.Text({ text: ids.map(nameOf).join(', ') });
                }
            },
            {
                type: CT.TEMPLATED,
                name: 'rings',
                label: 'Rings',
                stretchFactor: 3,
                content: (args: CellArgs): unknown => {
                    const row = args?.cell?.row?.dataItem;
                    const primary = row ? rowValues(row, {}).primaryEmployeeId : null;
                    if (primary === null) {
                        return new component.Text({ text: '—', type: component.Text.Type.WEAK });
                    }
                    return new component.Text({ text: nameOf(primary) });
                }
            },
            {
                type: CT.TEMPLATED,
                name: 'status',
                label: 'Status',
                stretchFactor: 2,
                content: (args: CellArgs): unknown => {
                    const row = args?.cell?.row?.dataItem;
                    if (!row) return new component.Text({ text: '—' });
                    const s = statusForRow(row);
                    const palette =
                        s.label === 'Live'    ? { bg: '#D4EDDA', fg: '#155724', border: '#A3D9AE' } :
                        s.label === 'Saving…' ? { bg: '#CCE5FF', fg: '#004085', border: '#9FCDFF' } :
                                                 { bg: '#FFF3CD', fg: '#856404', border: '#FFE69C' };
                    return new component.Badge({
                        content: s.label,
                        type: BdgType.SUBTLE,
                        rootStyle: {
                            backgroundColor: palette.bg,
                            color: palette.fg,
                            border: '1px solid ' + palette.border
                        }
                    });
                }
            },
            {
                type: CT.TEMPLATED,
                name: 'action',
                label: '',
                stretchFactor: 2,
                content: (args: CellArgs): unknown => {
                    const row = args?.cell?.row?.dataItem;
                    if (!row) return new component.Text({ text: '' });
                    const c = (store.getState() as AppState).console;
                    return new component.Button({
                        label: 'Edit',
                        startIcon: core.SystemIcon.EDIT,
                        enabled: c.phonesSavingSid === null && c.phonesEditingSid !== row.phoneSid,
                        action: (): void => { openPhonesEditor(row.phoneSid); }
                    } as never);
                }
            }
        ];
    }

    /** The one row editor, under the grid. */
    private renderEditor(
        row: ByPhoneEntry,
        employees: EmployeeOption[],
        nameOf: (id: number) => string
    ): core.VDom.Node {
        const c = (store.getState() as AppState).console;
        const values = rowValues(row, c.phonesDrafts);
        const savingThis = c.phonesSavingSid === row.phoneSid;
        const anySaving = c.phonesSavingSid !== null;
        const dirty = !!c.phonesDrafts[row.phoneSid];
        const rowError = c.phonesRowErrors[row.phoneSid];

        // Selected items are the dataSource's own objects for the ids, so
        // the picker starts with every saved rep.
        const selectedItems = values.employeeIds
            .map((id) => employees.find((e) => e.id === id) ||
                ({ id, name: nameOf(id) } as EmployeeOption));
        const repsPicker = (
            <component.MultiselectDropdown
                dataSource={new core.ArrayDataSource(employees) as never}
                valueMember="id"
                displayMember="name"
                selectedItems={selectedItems as never}
                comparator={(l: unknown, r: unknown): boolean => idOf(l) === idOf(r)}
                placeholder="Pick reps"
                enabled={!savingThis}
                onSelectionChanged={(args: { values?: unknown[] }): void => {
                    editPhonesRow(row.phoneSid, { employeeIds: toIds(args && args.values) });
                }}
                rootStyle={{width: '100%'} as never}
            />
        );

        const ringOptions = values.employeeIds.map((id) => ({ id, name: nameOf(id) }));
        const ringsPicker = ringOptions.length === 0
            ? new component.Text({ text: 'Assign a rep first.', type: component.Text.Type.WEAK })
            : new component.Dropdown({
                dataSource: new core.ArrayDataSource(ringOptions),
                valueMember: 'id',
                displayMember: 'name',
                selectedValue: values.primaryEmployeeId,
                enabled: !savingThis && ringOptions.length > 1,
                onSelectionChanged: (sel: { value?: unknown }): void => {
                    const id = idOf(sel && sel.value);
                    if (!id || id === values.primaryEmployeeId) return;
                    editPhonesRow(row.phoneSid, { primaryEmployeeId: id });
                }
            } as never);

        const buttons = new component.StackPanel({
            orientation: component.StackPanel.Orientation.HORIZONTAL,
            itemGap: component.StackPanel.GapSize.S,
            items: [
                new component.Button({
                    label: savingThis ? 'Saving…' : 'Save',
                    type: component.Button.Type.PRIMARY,
                    enabled: dirty && !anySaving,
                    action: (): void => { savePhonesRow(row.phoneSid); }
                } as never),
                new component.Button({
                    label: 'Cancel',
                    enabled: !savingThis,
                    action: (): void => { cancelPhonesRow(row.phoneSid); }
                } as never)
            ]
        } as never);

        const item = (node: unknown): core.VDom.Node =>
            (<component.StackPanel.Item>{node as never}</component.StackPanel.Item>) as core.VDom.Node;
        const label = (text: string): core.VDom.Node =>
            item(<component.Text type={component.Text.Type.STRONG}>{text}</component.Text>);

        const items: core.VDom.Node[] = [
            item(
                <component.Heading level={3}>
                    {formatPhone(row.phoneNumber) + (row.friendlyName ? '  —  ' + row.friendlyName : '')}
                </component.Heading>
            ),
            label('Assigned reps'),
            item(repsPicker),
            label('Rings'),
            item(ringsPicker),
            item(
                <component.Text type={component.Text.Type.WEAK} size={component.Text.Size.S}>
                    Inbound calls to this number ring this rep, and this rep
                    calls out from this number.
                </component.Text>
            ),
            item(buttons)
        ];
        if (rowError) {
            items.push(item(
                <component.Text type={component.Text.Type.STRONG}>
                    {'✕ ' + friendlyError(rowError)}
                </component.Text>
            ));
        }

        return (
            <component.StackPanel
                orientation={component.StackPanel.Orientation.VERTICAL}
                itemGap={component.StackPanel.GapSize.S}
                rootStyle={{...CARD_STYLE, maxWidth: '640px'} as never}
            >
                {items as never}
            </component.StackPanel>
        );
    }

    render(): core.VDom.Node {
        const state = store.getState() as AppState;
        const c = state.console;
        const employees: EmployeeOption[] =
            ((c.phonesEmployees || []) as Array<{ id: unknown; name?: string }>)
                .map((e) => ({ id: Number(e.id), name: e.name || '' }));
        const nameOf = (id: number): string =>
            employees.find((e) => e.id === id)?.name || ('Employee ' + id);
        // Routing result of the last row save: numbers that did not update,
        // and publish failures before any number (phoneNumber '').
        const routingNumberErrors = c.phonesRoutingErrors.filter((e) => !!e.phoneNumber);
        const routingPublishErrors = c.phonesRoutingErrors.filter((e) => !e.phoneNumber);

        // First load (nothing to show yet): full loader.
        if (c.phonesByPhone === null && c.phonesLoading) {
            return (
                <component.StackPanel
                    orientation={component.StackPanel.Orientation.VERTICAL}
                    itemGap={component.StackPanel.GapSize.L}
                >
                    <component.StackPanel.Item>
                        {new component.Loader({
                            label: 'Loading phones & reps…',
                            indeterminate: true
                        } as never) as never}
                    </component.StackPanel.Item>
                </component.StackPanel>
            );
        }

        // Copies: the grid never holds the saved row objects.
        const rows = ((c.phonesByPhone || []) as ByPhoneEntry[])
            .map((r) => ({ ...r, employeeIds: r.employeeIds.slice() }));
        const editingRow = c.phonesEditingSid
            ? rows.find((r) => r.phoneSid === c.phonesEditingSid) || null
            : null;
        const refreshing = c.phonesLoading;

        const items = [
            (
                <component.StackPanel.Item>
                    <component.StackPanel
                        orientation={component.StackPanel.Orientation.HORIZONTAL}
                        itemGap={component.StackPanel.GapSize.S}
                    >
                        <component.StackPanel.Item>
                            <component.Button
                                label={refreshing ? 'Refreshing…' : 'Refresh from Twilio'}
                                startIcon={core.SystemIcon.REFRESH as never}
                                enabled={!refreshing}
                                action={(): void => { loadPhonesData(); }}
                            />
                        </component.StackPanel.Item>
                    </component.StackPanel>
                </component.StackPanel.Item>
            ),
            c.phonesListError && (
                <component.StackPanel.Item>
                    <component.Text type={component.Text.Type.STRONG}>
                        {'✕ The Twilio phone numbers did not load: ' + friendlyError(c.phonesListError) +
                            ' Click "Refresh from Twilio" to try again.'}
                    </component.Text>
                </component.StackPanel.Item>
            ),
            c.phonesError && (
                <component.StackPanel.Item>
                    <component.Text type={component.Text.Type.STRONG}>
                        {'✕ ' + friendlyError(c.phonesError)}
                    </component.Text>
                </component.StackPanel.Item>
            ),
            c.phonesHasMore && (
                <component.StackPanel.Item>
                    <component.Text type={component.Text.Type.WEAK} size={component.Text.Size.S}>
                        Only the first 100 Twilio numbers are shown.
                    </component.Text>
                </component.StackPanel.Item>
            ),
            routingNumberErrors.length > 0 && (
                <component.StackPanel.Item>
                    <component.Text
                        type={component.Text.Type.STRONG}
                        size={component.Text.Size.S}
                    >
                        {'⚠ Inbound routing did not update for: ' +
                            routingNumberErrors.map((e) => formatPhone(e.phoneNumber)).join(', ')}
                    </component.Text>
                </component.StackPanel.Item>
            ),
            routingPublishErrors.length > 0 && (
                <component.StackPanel.Item>
                    <component.Text
                        type={component.Text.Type.STRONG}
                        size={component.Text.Size.S}
                    >
                        {'⚠ Inbound routing did not publish: ' +
                            routingPublishErrors.map((e) => e.message).join(' ')}
                    </component.Text>
                </component.StackPanel.Item>
            ),
            rows.length === 0 ? (
                // With a list error the message above says why; no
                // "no numbers" claim then.
                !c.phonesListError && (
                    <component.StackPanel.Item>
                        <component.Text type={component.Text.Type.WEAK}>
                            No phone numbers found in your Twilio account.
                            Buy one in the Twilio Console, then click
                            "Refresh from Twilio" to pick it up and assign
                            reps.
                        </component.Text>
                    </component.StackPanel.Item>
                )
            ) : (
                <component.StackPanel.Item>
                    {new component.DataGrid({
                        dataSource: new core.ArrayDataSource(rows),
                        columns: this.buildColumns(nameOf),
                        columnStretch: true,
                        highlightRowsOnHover: true,
                        stripedRows: true,
                        dataRowHeight: 72,
                        headerRowHeight: 44,
                        rootStyle: { width: '100%' }
                    } as never) as never}
                </component.StackPanel.Item>
            ),
            editingRow && (
                <component.StackPanel.Item>
                    {this.renderEditor(editingRow, employees, nameOf)}
                </component.StackPanel.Item>
            )
        ].filter(Boolean);

        return (
            <component.StackPanel
                orientation={component.StackPanel.Orientation.VERTICAL}
                itemGap={component.StackPanel.GapSize.XL}
            >
                {items as never}
            </component.StackPanel>
        );
    }
}
