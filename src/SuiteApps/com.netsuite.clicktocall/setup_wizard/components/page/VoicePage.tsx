/**
 * Voice config page (U4) — JSX.
 *
 * Phase 4 (2026-05-28) — JSX rewrite of components/sections/voice.ts.
 * Three per-field rows, each with a VIEW/EDIT toggle:
 *   - twimlAppSid
 *   - phoneNumber
 *   - intelServiceSid
 *
 * Spike (2026-05-28) — DataGrid layout. The three voice fields now render in
 * a single DataGrid. The Value + Action cells switch into edit mode for the
 * row whose field matches state.console.voiceEditing.
 */

import {PureComponent} from '@uif-js/core';
import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {Action} from '../../app/Action';
import {loadVoiceLists, saveVoiceField} from '../../app/effects/voice';
import type {AppState, ConsoleState} from '../../app/InitialState';
import type {PageTickProps} from '../../App';

type VoiceField = NonNullable<ConsoleState['voiceEditing']>;
type VoiceListKey = 'twimlApps' | 'phoneNumbers' | 'intelServices';

interface TwilioListItem {
    sid?: string;
    phoneNumber?: string;
    friendlyName?: string;
}

interface VoiceSnapshot {
    twimlAppSid?: string;
    phoneNumber?: string;
    intelServiceSid?: string;
}

interface VoiceFieldSpec {
    field: VoiceField;
    label: string;
    helpText: string;
    docUrl?: string;
    allowEmpty?: boolean;
}

interface CellArgs {
    cell?: { row?: { dataItem?: VoiceFieldSpec } };
}

const TWILIO_DOCS = {
    twimlApp: 'https://www.twilio.com/docs/usage/api/applications',
    phoneNumber: 'https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource',
    intelService: 'https://www.twilio.com/docs/voice/intelligence'
};

const FIELD_SPECS: VoiceFieldSpec[] = [
    {
        field: 'twimlAppSid',
        label: 'TwiML Application',
        helpText: 'The Twilio application that handles outbound call routing. ' +
            'The wizard registers this app\'s VoiceUrl with the CTC Suitelet.',
        docUrl: TWILIO_DOCS.twimlApp
    },
    {
        field: 'phoneNumber',
        label: 'Default outbound caller-ID',
        helpText: 'Number reps see as their outbound caller ID. Specific ' +
            'rep-to-number assignments override this default.',
        docUrl: TWILIO_DOCS.phoneNumber
    },
    {
        field: 'intelServiceSid',
        label: 'Conversational Intelligence',
        helpText: 'Optional. The Voice Intelligence service ID that ' +
            'produces transcripts and AI summaries.',
        docUrl: TWILIO_DOCS.intelService,
        allowEmpty: true
    }
];

const listKeyFor = (field: VoiceField): VoiceListKey => {
    switch (field) {
        case 'twimlAppSid': return 'twimlApps';
        case 'phoneNumber': return 'phoneNumbers';
        case 'intelServiceSid': return 'intelServices';
    }
};

const handleEdit = (spec: VoiceFieldSpec): void => {
    const state = store.getState() as AppState;
    const snap = (state.console.snapshot || {}) as VoiceSnapshot;
    const current = snap[spec.field] || '';
    store.dispatch(Action.voiceFieldEdit(spec.field, current));
    loadVoiceLists();
};

const handleCancel = (): void => {
    store.dispatch(Action.voiceFieldEdit(null, null));
};

const handlePendingChange = (args: { value?: string }): void => {
    const value = (args && args.value) || null;
    const state = store.getState() as AppState;
    store.dispatch(Action.voiceFieldEdit(
        state.console.voiceEditing,
        value
    ));
};

const handleSave = (spec: VoiceFieldSpec): void => {
    const state = store.getState() as AppState;
    const pending = state.console.voicePendingValue;
    if (pending !== null && pending !== undefined) {
        saveVoiceField(spec.field, pending);
    }
};

export default class VoicePage extends PureComponent<PageTickProps, unknown> {
    private buildColumns(): unknown[] {
        const CT = (component.DataGrid as unknown as { ColumnType: Record<string, unknown> }).ColumnType;

        return [
            {
                type: CT.TEMPLATED,
                name: 'field',
                label: 'Field',
                stretchFactor: 2,
                content: (args: CellArgs): unknown => {
                    const row = args?.cell?.row?.dataItem;
                    return new component.Text({
                        text: row?.label || '',
                        type: component.Text.Type.STRONG
                    });
                }
            },
            {
                type: CT.TEMPLATED,
                name: 'docs',
                label: 'Docs',
                stretchFactor: 1,
                content: (args: CellArgs): unknown => {
                    const row = args?.cell?.row?.dataItem;
                    if (!row?.docUrl) return new component.Text({ text: '' });
                    return new component.Link({
                        content: 'Twilio docs ↗',
                        url: row.docUrl,
                        target: component.Link.Target.BLANK
                    } as never);
                }
            },
            {
                type: CT.TEMPLATED,
                name: 'description',
                label: 'Description',
                stretchFactor: 3,
                content: (args: CellArgs): unknown => {
                    const row = args?.cell?.row?.dataItem;
                    return new component.Text({
                        text: row?.helpText || '',
                        type: component.Text.Type.WEAK,
                        size: component.Text.Size.S
                    });
                }
            },
            {
                type: CT.TEMPLATED,
                name: 'value',
                label: 'Current value',
                stretchFactor: 3,
                content: (args: CellArgs): unknown => {
                    const row = args?.cell?.row?.dataItem;
                    if (!row) return new component.Text({ text: '' });
                    const state = store.getState() as AppState;
                    const c = state.console;
                    const snap = (c.snapshot || {}) as VoiceSnapshot;
                    const isEditing = c.voiceEditing === row.field;

                    if (!isEditing) {
                        const value = snap[row.field];
                        if (value) return new component.Text({ text: value });
                        return new component.Text({
                            text: '(not configured)',
                            type: component.Text.Type.WEAK
                        });
                    }

                    // Edit mode — dropdown
                    const listKey = listKeyFor(row.field);
                    const list = c.voiceLists[listKey] as TwilioListItem[] | null;

                    if (list === null || c.voiceListsLoading) {
                        return new component.Loader({
                            label: 'Loading from Twilio…',
                            indeterminate: true
                        } as never);
                    }

                    if (list.length === 0) {
                        return new component.Text({
                            text: '(no items found in Twilio for this account)',
                            type: component.Text.Type.WEAK
                        });
                    }

                    const normalized = list.map((it) => {
                        if (row.field === 'phoneNumber') {
                            return {
                                value: it.phoneNumber || '',
                                label: (it.phoneNumber || '') +
                                    (it.friendlyName ? '  —  ' + it.friendlyName : '')
                            };
                        }
                        return {
                            value: it.sid || '',
                            label: (it.friendlyName || '(unnamed)') +
                                (it.sid ? '  [' + it.sid + ']' : '')
                        };
                    });
                    const ds = new core.ArrayDataSource(normalized);
                    const pending = c.voicePendingValue;

                    return new component.Dropdown({
                        dataSource: ds,
                        valueMember: 'value',
                        displayMember: 'label',
                        selectedValue: pending || (row.allowEmpty ? null : normalized[0].value),
                        allowEmpty: !!row.allowEmpty,
                        placeholder: row.allowEmpty ? '(none)' : 'Select…',
                        onSelectionChanged: handlePendingChange
                    } as never);
                }
            },
            {
                type: CT.TEMPLATED,
                name: 'action',
                label: 'Action',
                stretchFactor: 2,
                content: (args: CellArgs): unknown => {
                    const row = args?.cell?.row?.dataItem;
                    if (!row) return new component.Text({ text: '' });
                    const state = store.getState() as AppState;
                    const c = state.console;
                    const isEditing = c.voiceEditing === row.field;

                    if (!isEditing) {
                        return new component.Button({
                            label: 'Change',
                            action: (): void => { handleEdit(row); }
                        } as never);
                    }

                    const listKey = listKeyFor(row.field);
                    const list = c.voiceLists[listKey] as TwilioListItem[] | null;
                    const saving = c.voiceSaving;

                    // While loading lists, just show cancel
                    if (list === null || c.voiceListsLoading) {
                        return new component.Button({
                            label: 'Cancel',
                            action: handleCancel
                        } as never);
                    }

                    // Empty list — only cancel makes sense
                    if (list.length === 0) {
                        return new component.Button({
                            label: 'Cancel',
                            action: handleCancel
                        } as never);
                    }

                    const saveBtn = new component.Button({
                        label: saving ? 'Saving…' : 'Save',
                        type: component.Button.Type.PRIMARY,
                        enabled: !saving,
                        action: (): void => { handleSave(row); }
                    } as never);
                    const cancelBtn = new component.Button({
                        label: 'Cancel',
                        enabled: !saving,
                        action: handleCancel
                    } as never);

                    return new component.StackPanel({
                        orientation: component.StackPanel.Orientation.HORIZONTAL,
                        itemGap: component.StackPanel.GapSize.S,
                        items: [saveBtn, cancelBtn]
                    } as never);
                }
            }
        ];
    }

    render(): core.VDom.Node {
        const state = store.getState() as AppState;
        const c = state.console;

        const columns = this.buildColumns();
        const rowsDs = new core.ArrayDataSource(FIELD_SPECS);

        const items = [
            (
                <component.StackPanel.Item>
                    <component.Text type={component.Text.Type.WEAK}>
                        Manage TwiML application, default outbound
                        caller-ID number, and optional Conversational
                        Intelligence service. Changes save immediately and
                        apply to the next call placed.
                    </component.Text>
                </component.StackPanel.Item>
            ),
            c.voiceError && (
                <component.StackPanel.Item>
                    <component.Text type={component.Text.Type.STRONG}>
                        ✕ {c.voiceError}
                    </component.Text>
                </component.StackPanel.Item>
            ),
            (
                <component.StackPanel.Item>
                    {new component.DataGrid({
                        dataSource: rowsDs,
                        columns,
                        columnStretch: true,
                        highlightRowsOnHover: true,
                        stripedRows: true,
                        dataRowHeight: 80,
                        headerRowHeight: 40,
                        rootStyle: { width: '100%' }
                    } as never) as never}
                </component.StackPanel.Item>
            )
        ].filter(Boolean);

        return (
            <component.StackPanel
                orientation={component.StackPanel.Orientation.VERTICAL}
                itemGap={component.StackPanel.GapSize.L}
            >
                {items as never}
            </component.StackPanel>
        );
    }
}
