/**
 * Voice config page (U4) — JSX.
 *
 * Phase 4 (2026-05-28) — JSX rewrite of components/sections/voice.ts.
 * Three per-field rows, each with a VIEW/EDIT toggle:
 *   - twimlAppSid
 *   - phoneNumber
 *   - intelServiceSid
 */

import {PureComponent} from '@uif-js/core';
import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {Action} from '../../app/Action';
import {loadVoiceLists, saveVoiceField} from '../../app/effects/voice';
import type {AppState, ConsoleState} from '../../app/InitialState';

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

class VoiceFieldRow extends PureComponent<{ spec: VoiceFieldSpec }, unknown> {
    private handleEdit = (): void => {
        const {spec} = this.props;
        const state = store.getState() as AppState;
        const snap = (state.console.snapshot || {}) as VoiceSnapshot;
        const current = snap[spec.field] || '';
        store.dispatch(Action.voiceFieldEdit(spec.field, current));
        loadVoiceLists();
    };

    private handleCancel = (): void => {
        store.dispatch(Action.voiceFieldEdit(null, null));
    };

    private handlePendingChange = (args: { value?: string }): void => {
        const value = (args && args.value) || null;
        const state = store.getState() as AppState;
        store.dispatch(Action.voiceFieldEdit(
            state.console.voiceEditing,
            value
        ));
    };

    private handleSave = (): void => {
        const {spec} = this.props;
        const state = store.getState() as AppState;
        const pending = state.console.voicePendingValue;
        if (pending !== null && pending !== undefined) {
            saveVoiceField(spec.field, pending);
        }
    };

    render(): core.VDom.Node {
        const {spec} = this.props;
        const state = store.getState() as AppState;
        const snap = (state.console.snapshot || {}) as VoiceSnapshot;
        const isEditing = state.console.voiceEditing === spec.field;
        const value = snap[spec.field];

        const labelCell = (
            <component.StackPanel
                orientation={component.StackPanel.Orientation.VERTICAL}
                itemGap={component.StackPanel.GapSize.XXS}
            >
                <component.StackPanel.Item>
                    <component.Text type={component.Text.Type.STRONG}>
                        {spec.label}
                    </component.Text>
                </component.StackPanel.Item>
                {spec.docUrl ? (
                    <component.StackPanel.Item>
                        <component.Link
                            content="Twilio docs ↗"
                            url={spec.docUrl}
                            target={component.Link.Target.BLANK}
                        />
                    </component.StackPanel.Item>
                ) : null}
            </component.StackPanel>
        );

        const helpCell = (
            <component.Text
                type={component.Text.Type.WEAK}
                size={component.Text.Size.S}
            >
                {spec.helpText}
            </component.Text>
        );

        const rightCell = isEditing
            ? this.renderEditControls(spec)
            : this.renderViewControls(spec, value);

        return (
            <component.GridPanel
                columns="1fr 3fr 2fr"
                rows="auto"
                columnGap={component.GridPanel.GapSize.L}
            >
                <component.GridPanel.Item>{labelCell}</component.GridPanel.Item>
                <component.GridPanel.Item>{helpCell}</component.GridPanel.Item>
                <component.GridPanel.Item>{rightCell}</component.GridPanel.Item>
            </component.GridPanel>
        );
    }

    private renderViewControls(spec: VoiceFieldSpec, value: string | undefined): core.VDom.Node {
        return (
            <component.StackPanel
                orientation={component.StackPanel.Orientation.HORIZONTAL}
                itemGap={component.StackPanel.GapSize.M}
            >
                <component.StackPanel.Item>
                    {value ? (
                        <component.Text>{value}</component.Text>
                    ) : (
                        <component.Text type={component.Text.Type.WEAK}>
                            (not configured)
                        </component.Text>
                    )}
                </component.StackPanel.Item>
                <component.StackPanel.Item>
                    <component.Button
                        label="Change"
                        action={this.handleEdit}
                    />
                </component.StackPanel.Item>
            </component.StackPanel>
        );
    }

    private renderEditControls(spec: VoiceFieldSpec): core.VDom.Node {
        const state = store.getState() as AppState;
        const c = state.console;
        const listKey = listKeyFor(spec.field);
        const list = c.voiceLists[listKey] as TwilioListItem[] | null;
        const saving = c.voiceSaving;
        const pending = c.voicePendingValue;

        if (list === null || c.voiceListsLoading) {
            return (
                <component.StackPanel.Item>
                    {new component.Loader({
                        label: 'Loading from Twilio…',
                        indeterminate: true
                    } as never) as never}
                </component.StackPanel.Item>
            );
        }

        if (list.length === 0) {
            return (
                <component.StackPanel
                    orientation={component.StackPanel.Orientation.HORIZONTAL}
                    itemGap={component.StackPanel.GapSize.M}
                >
                    <component.StackPanel.Item>
                        <component.Text type={component.Text.Type.WEAK}>
                            (no items found in Twilio for this account)
                        </component.Text>
                    </component.StackPanel.Item>
                    <component.StackPanel.Item>
                        <component.Button label="Cancel" action={this.handleCancel} />
                    </component.StackPanel.Item>
                </component.StackPanel>
            );
        }

        const normalized = list.map((it) => {
            if (spec.field === 'phoneNumber') {
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

        return (
            <component.StackPanel
                orientation={component.StackPanel.Orientation.HORIZONTAL}
                itemGap={component.StackPanel.GapSize.S}
            >
                <component.StackPanel.Item>
                    <component.Dropdown
                        dataSource={ds as never}
                        valueMember="value"
                        displayMember="label"
                        selectedValue={pending || (spec.allowEmpty ? null : normalized[0].value)}
                        allowEmpty={!!spec.allowEmpty}
                        placeholder={spec.allowEmpty ? '(none)' : 'Select…'}
                        onSelectionChanged={this.handlePendingChange}
                    />
                </component.StackPanel.Item>
                <component.StackPanel.Item>
                    <component.Button
                        label={saving ? 'Saving…' : 'Save'}
                        type={component.Button.Type.PRIMARY}
                        enabled={!saving}
                        action={this.handleSave}
                    />
                </component.StackPanel.Item>
                <component.StackPanel.Item>
                    <component.Button
                        label="Cancel"
                        enabled={!saving}
                        action={this.handleCancel}
                    />
                </component.StackPanel.Item>
            </component.StackPanel>
        );
    }
}

export default class VoicePage extends PureComponent<unknown, unknown> {
    render(): core.VDom.Node {
        const state = store.getState() as AppState;
        const c = state.console;

        return (
            <component.StackPanel
                orientation={component.StackPanel.Orientation.VERTICAL}
                itemGap={component.StackPanel.GapSize.L}
            >
                <component.StackPanel.Item>
                    <component.Text type={component.Text.Type.WEAK}>
                        Manage TwiML application, default outbound
                        caller-ID number, and optional Conversational
                        Intelligence service. Changes save immediately and
                        apply to the next call placed.
                    </component.Text>
                </component.StackPanel.Item>
                {c.voiceError ? (
                    <component.StackPanel.Item>
                        <component.Text type={component.Text.Type.STRONG}>
                            ✕ {c.voiceError}
                        </component.Text>
                    </component.StackPanel.Item>
                ) : null}
                {FIELD_SPECS.map((spec) => (
                    <component.StackPanel.Item key={spec.field}>
                        <VoiceFieldRow spec={spec} />
                    </component.StackPanel.Item>
                ))}
            </component.StackPanel>
        );
    }
}
