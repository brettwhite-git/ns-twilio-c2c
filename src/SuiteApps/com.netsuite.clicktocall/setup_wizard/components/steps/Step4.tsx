/**
 * Step 4 — Phone numbers + rep assignments (JSX).
 *
 * Phase 3 (2026-05-28) — JSX rewrite of components/steps/step4.ts. One
 * row per Twilio phone number with a MultiselectDropdown for employee
 * assignment.
 *
 * componentDidMount fires loadStep4Lists which dispatches into the
 * Store; render reacts to state.step4.{phoneNumbers,employees,assignments}.
 */

import {PureComponent} from '@uif-js/core';
import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {Action} from '../../app/Action';
import {loadStep4Lists} from '../../app/effects/steps';
import type {AppState} from '../../app/InitialState';

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

interface AssignmentRowProps {
    phoneNumber: PhoneNumber;
    employees: Employee[];
    assignment: AssignmentEntry;
}

class AssignmentRow extends PureComponent<AssignmentRowProps, unknown> {
    private handleSelectionChanged = (args: { values?: number[] }): void => {
        const {phoneNumber} = this.props;
        const values = (args && args.values) || [];
        const state = store.getState() as AppState;
        const assignments = {
            ...(state.step4.assignments as Record<string, AssignmentEntry>)
        };
        const prev = assignments[phoneNumber.sid] || {};
        const next: AssignmentEntry = {
            ...prev,
            employeeIds: values
        };
        // Default primary to first selected if missing or no longer in list
        if (!prev.primaryEmployeeId || values.indexOf(prev.primaryEmployeeId) === -1) {
            next.primaryEmployeeId = values.length > 0 ? values[0] : null;
        }
        assignments[phoneNumber.sid] = next;
        store.dispatch(Action.step4FieldChange('assignments', assignments));
    };

    render(): core.VDom.Node {
        const {phoneNumber, employees, assignment} = this.props;

        const dataItems = employees.map((e) => ({
            value: e.id,
            label: (e.name || '') + (e.email ? ' (' + e.email + ')' : '')
        }));
        const ds = new core.ArrayDataSource(dataItems);
        const lookupName = (id: number | string): string => {
            for (const emp of employees) {
                if (Number(emp.id) === Number(id)) return emp.name || '';
            }
            return '(id ' + id + ')';
        };
        const selectedItems = (assignment.employeeIds || []).map((id) => ({
            value: id,
            label: lookupName(id)
        }));

        const labelText =
            (phoneNumber.phoneNumber || '') +
            (phoneNumber.friendlyName ? '  —  ' + phoneNumber.friendlyName : '');

        return (
            <component.StackPanel
                orientation={component.StackPanel.Orientation.VERTICAL}
                itemGap={component.StackPanel.GapSize.XS}
            >
                <component.StackPanel.Item>
                    <component.Text type={component.Text.Type.STRONG}>
                        {labelText}
                    </component.Text>
                </component.StackPanel.Item>
                <component.StackPanel.Item>
                    <component.MultiselectDropdown
                        dataSource={ds as never}
                        valueMember="value"
                        displayMember="label"
                        selectedItems={selectedItems as never}
                        placeholder="Assign reps…"
                        onSelectionChanged={this.handleSelectionChanged}
                    />
                </component.StackPanel.Item>
            </component.StackPanel>
        );
    }
}

export default class Step4 extends PureComponent<unknown, unknown> {
    componentDidMount(): void {
        loadStep4Lists();
    }

    render(): core.VDom.Node {
        const state = store.getState() as AppState;
        const s = state.step4;

        const heading = (
            <component.StackPanel.Item>
                <component.Heading level={2}>
                    Phone numbers &amp; rep assignments
                </component.Heading>
            </component.StackPanel.Item>
        );
        const intro = (
            <component.StackPanel.Item>
                <component.Text>
                    Assign reps to your Twilio phone numbers. Each rep with
                    a number assigned will use it as their outbound caller
                    ID. Reps without an assignment fall back to the default
                    caller ID set in Step 3.
                </component.Text>
            </component.StackPanel.Item>
        );

        // Loading
        if (s.phoneNumbers === null || s.employees === null) {
            return (
                <component.StackPanel
                    orientation={component.StackPanel.Orientation.VERTICAL}
                    itemGap={component.StackPanel.GapSize.M}
                >
                    {heading}
                    {intro}
                    <component.StackPanel.Item>
                        <component.Loader
                            label="Loading phone numbers and employees…"
                            indeterminate={true}
                        />
                    </component.StackPanel.Item>
                </component.StackPanel>
            );
        }

        // Error
        if (s.listLoadError) {
            return (
                <component.StackPanel
                    orientation={component.StackPanel.Orientation.VERTICAL}
                    itemGap={component.StackPanel.GapSize.M}
                >
                    {heading}
                    {intro}
                    <component.StackPanel.Item>
                        <component.Text type={component.Text.Type.STRONG}>
                            ✕ {s.listLoadError}
                        </component.Text>
                    </component.StackPanel.Item>
                </component.StackPanel>
            );
        }

        const phoneNumbers = (s.phoneNumbers as PhoneNumber[]) || [];
        const employees = (s.employees as Employee[]) || [];
        const assignments = s.assignments as Record<string, AssignmentEntry>;

        // Empty
        if (phoneNumbers.length === 0) {
            return (
                <component.StackPanel
                    orientation={component.StackPanel.Orientation.VERTICAL}
                    itemGap={component.StackPanel.GapSize.M}
                >
                    {heading}
                    {intro}
                    <component.StackPanel.Item>
                        <component.Text type={component.Text.Type.WEAK}>
                            (no phone numbers owned by this Twilio account
                            — buy one in Twilio Console before continuing)
                        </component.Text>
                    </component.StackPanel.Item>
                </component.StackPanel>
            );
        }

        // Loaded — one row per phone number
        return (
            <component.StackPanel
                orientation={component.StackPanel.Orientation.VERTICAL}
                itemGap={component.StackPanel.GapSize.L}
            >
                {heading}
                {intro}
                {phoneNumbers.map((pn) => (
                    <component.StackPanel.Item key={pn.sid}>
                        <AssignmentRow
                            phoneNumber={pn}
                            employees={employees}
                            assignment={assignments[pn.sid] || {}}
                        />
                    </component.StackPanel.Item>
                ))}
            </component.StackPanel>
        );
    }
}
