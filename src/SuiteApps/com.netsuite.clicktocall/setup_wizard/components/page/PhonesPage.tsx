/**
 * Phones & reps page (U3) — JSX.
 *
 * Phase 4 (2026-05-28) — JSX rewrite of components/sections/phones.ts.
 * DataGrid with inline MultiselectDropdown editing per row. Columns:
 *   1. Status icon
 *   2. Phone number
 *   3. Phone SID (truncated)
 *   4. Assigned reps (inline edit — MULTI_SELECT_DROPDOWN)
 *   5. Status badge
 */

import {PureComponent} from '@uif-js/core';
import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {loadPhonesData, savePhonesAssignment} from '../../app/effects/phones';
import type {AppState} from '../../app/InitialState';
import type {PageTickProps} from '../../App';

interface EmployeeRow {
    id: number;
    name?: string;
    email?: string;
}

interface PhoneRow {
    phoneSid?: string;
    phoneNumber?: string;
    employeeIds?: number[];
    label?: string;
    primaryEmployeeId?: number | null;
}

interface CellArgs {
    cell?: { row?: { dataItem?: PhoneRow } };
}

const truncSid = (sid: string | undefined): string => {
    if (!sid) return '';
    if (sid.length <= 14) return sid;
    return sid.slice(0, 6) + '…' + sid.slice(-4);
};

export default class PhonesPage extends PureComponent<PageTickProps, unknown> {
    componentDidMount(): void {
        const state = store.getState() as AppState;
        if (state.console.phonesNumbers === null) {
            loadPhonesData();
        }
    }

    private buildColumns(employees: EmployeeRow[]): unknown[] {
        const CT = (component.DataGrid as unknown as { ColumnType: Record<string, unknown> }).ColumnType;
        const IM = (component.DataGrid as unknown as { InputMode: Record<string, unknown> }).InputMode;
        const BdgType = component.Badge.Type;
        const employeesDs = new core.ArrayDataSource(employees);

        const statusForRow = (row: PhoneRow): { icon: unknown; color: unknown; label: string } => {
            const state = store.getState() as AppState;
            const saving = state.console.phonesSaving[row.phoneSid || ''];
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
                        text: row?.phoneNumber || '(unknown)',
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
                type: CT.MULTI_SELECT_DROPDOWN,
                name: 'reps',
                label: 'Assigned reps',
                stretchFactor: 5,
                binding: 'employeeIds',
                inputMode: IM.EDIT_ONLY,
                dataSource: employeesDs,
                editable: true,
                displayMember: (value: unknown): string => {
                    if (value && typeof value === 'object') {
                        return (value as EmployeeRow).name || '';
                    }
                    const id = Number(value);
                    const emp = employees.find((e) => e.id === id);
                    return emp?.name || '';
                },
                // UIF DataGrid invokes widgetOptions with
                // `{cell, external, columnOptions}` — NOT `{dataItem}`
                // as I initially assumed. Per @oracle/netsuite-uif-types
                // (`GridColumn.WidgetOptionsCallback<T>` at
                // component.d.ts:8236): the per-row data lives at
                // `args.cell.row.dataItem`. Treating `args` as
                // `{dataItem}` left `phoneSid` undefined for every row,
                // which silently no-op'd the save call in
                // onSelectionChanged below — the inline-edit appeared
                // to do nothing despite the dropdown looking active.
                widgetOptions: (args: {
                    cell?: { row?: { dataItem?: PhoneRow } };
                }): object => {
                    const dataItem = (args?.cell?.row?.dataItem || {}) as PhoneRow;
                    const phoneSid = dataItem.phoneSid;
                    const phoneNumber = dataItem.phoneNumber || '';
                    const label = dataItem.label || '';
                    const primary = dataItem.primaryEmployeeId ?? null;
                    return {
                        dataSource: employeesDs,
                        valueMember: 'id',
                        displayMember: 'name',
                        placeholder: 'Pick reps',
                        onSelectionChanged: (sel: { values?: unknown[] }): void => {
                            const newIds = ((sel && sel.values) || []).map((v) => {
                                if (v && typeof v === 'object') {
                                    return Number((v as { id?: unknown }).id);
                                }
                                return Number(v);
                            });
                            if (phoneSid) {
                                savePhonesAssignment(phoneSid, phoneNumber, newIds, label, primary);
                            }
                        }
                    };
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
            }
        ];
    }

    render(): core.VDom.Node {
        const state = store.getState() as AppState;
        const c = state.console;
        const grouped = (c.phonesByPhone || []) as PhoneRow[];
        const employees = (c.phonesEmployees || []) as EmployeeRow[];

        if (c.phonesLoading) {
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

        const columns = this.buildColumns(employees);
        const rowsDs = grouped.length > 0 ? new core.ArrayDataSource(grouped) : null;

        const items = [
            (
                <component.StackPanel.Item>
                    <component.StackPanel
                        orientation={component.StackPanel.Orientation.HORIZONTAL}
                        itemGap={component.StackPanel.GapSize.S}
                    >
                        <component.StackPanel.Item>
                            <component.Button
                                label="Refresh from Twilio"
                                startIcon={core.SystemIcon.REFRESH as never}
                                action={(): void => { loadPhonesData(); }}
                            />
                        </component.StackPanel.Item>
                    </component.StackPanel>
                </component.StackPanel.Item>
            ),
            c.phonesError && (
                <component.StackPanel.Item>
                    <component.Text type={component.Text.Type.STRONG}>
                        ✕ {c.phonesError}
                    </component.Text>
                </component.StackPanel.Item>
            ),
            grouped.length === 0 ? (
                <component.StackPanel.Item>
                    <component.Text type={component.Text.Type.WEAK}>
                        No phone numbers found in your Twilio account.
                        Buy one in the Twilio Console (link above) then
                        click "Refresh from Twilio" to pick it up and
                        assign reps inline.
                    </component.Text>
                </component.StackPanel.Item>
            ) : (
                <component.StackPanel.Item>
                    {new component.DataGrid({
                        dataSource: rowsDs,
                        columns,
                        columnStretch: true,
                        highlightRowsOnHover: true,
                        stripedRows: true,
                        dataRowHeight: 72,
                        headerRowHeight: 44,
                        editable: true,
                        rootStyle: { width: '100%' }
                    } as never) as never}
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
