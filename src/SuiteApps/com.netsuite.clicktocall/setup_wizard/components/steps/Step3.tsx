/**
 * Step 3 — Voice configuration (JSX).
 *
 * Phase 3 (2026-05-28) — JSX rewrite of components/steps/step3.ts. Three
 * dropdowns populated from live Twilio API calls (TwiML Apps, Phone
 * Numbers, Conversational Intelligence Services).
 *
 * componentDidMount fires loadStep3Lists which dispatches into the
 * Store; render reacts to state.step3.{twimlApps,phoneNumbers,intelServices}
 * settling.
 */

import {PureComponent} from '@uif-js/core';
import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {Action} from '../../app/Action';
import {loadStep3Lists} from '../../app/effects/steps';
import type {AppState, Step3State} from '../../app/InitialState';

interface TwilioItem {
    sid?: string;
    friendlyName?: string;
    phoneNumber?: string;
}

interface NormalizedOption {
    value: string;
    label: string;
}

interface DropdownFieldProps {
    label: string;
    options: NormalizedOption[];
    selectedValue: string;
    allowEmpty?: boolean;
    onChange: (val: string) => void;
}

class DropdownField extends PureComponent<DropdownFieldProps, unknown> {
    render(): core.VDom.Node {
        const {label, options, selectedValue, allowEmpty} = this.props;

        if (options.length === 0) {
            return (
                <component.StackPanel
                    orientation={component.StackPanel.Orientation.VERTICAL}
                    itemGap={component.StackPanel.GapSize.XXS}
                >
                    <component.StackPanel.Item>
                        <component.Text type={component.Text.Type.STRONG}>
                            {label}
                        </component.Text>
                    </component.StackPanel.Item>
                    <component.StackPanel.Item>
                        <component.Text type={component.Text.Type.WEAK}>
                            (no items found in Twilio for this account)
                        </component.Text>
                    </component.StackPanel.Item>
                </component.StackPanel>
            );
        }

        const ds = new core.ArrayDataSource(options);
        return (
            <component.StackPanel
                orientation={component.StackPanel.Orientation.VERTICAL}
                itemGap={component.StackPanel.GapSize.XXS}
            >
                <component.StackPanel.Item>
                    <component.Text type={component.Text.Type.STRONG}>
                        {label}
                    </component.Text>
                </component.StackPanel.Item>
                <component.StackPanel.Item>
                    <component.Dropdown
                        dataSource={ds as never}
                        valueMember="value"
                        displayMember="label"
                        selectedValue={selectedValue || (allowEmpty ? null : options[0].value)}
                        allowEmpty={!!allowEmpty}
                        placeholder={allowEmpty ? '(none)' : 'Select…'}
                        onSelectionChanged={(args: { value?: string }): void => {
                            this.props.onChange((args && args.value) || '');
                        }}
                    />
                </component.StackPanel.Item>
            </component.StackPanel>
        );
    }
}

export default class Step3 extends PureComponent<unknown, unknown> {
    componentDidMount(): void {
        loadStep3Lists();
    }

    private dispatchField = (field: keyof Step3State, value: unknown): void => {
        store.dispatch(Action.step3FieldChange(field, value));
    };

    render(): core.VDom.Node {
        const state = store.getState() as AppState;
        const s = state.step3;

        const heading = (
            <component.StackPanel.Item>
                <component.Heading level={2}>Voice configuration</component.Heading>
            </component.StackPanel.Item>
        );
        const intro = (
            <component.StackPanel.Item>
                <component.Text>
                    Pick the TwiML application, default outbound caller ID,
                    and Conversational Intelligence service from your Twilio
                    account. These are fetched live using the secure API
                    Secret configured in Step 2 — the secret value never
                    leaves NetSuite's vault.
                </component.Text>
            </component.StackPanel.Item>
        );

        // Loading state
        if (s.twimlApps === null || s.phoneNumbers === null || s.intelServices === null) {
            return (
                <component.StackPanel
                    orientation={component.StackPanel.Orientation.VERTICAL}
                    itemGap={component.StackPanel.GapSize.M}
                >
                    {heading}
                    {intro}
                    <component.StackPanel.Item>
                        {new component.Loader({
                            label: 'Loading from Twilio…',
                            indeterminate: true
                        } as never) as never}
                    </component.StackPanel.Item>
                </component.StackPanel>
            );
        }

        // Error state
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
                            ✕ Could not load Twilio lists: {s.listLoadError}.
                            Verify the API Secret value is set at Setup &gt;
                            Company &gt; API Secrets, then go back to Step 2
                            and Continue again to retry.
                        </component.Text>
                    </component.StackPanel.Item>
                </component.StackPanel>
            );
        }

        // Loaded — three dropdowns
        const twimlOptions: NormalizedOption[] = (s.twimlApps as TwilioItem[]).map((ti) => ({
            value: ti.sid || '',
            label: (ti.friendlyName || '(unnamed)') + (ti.sid ? '  [' + ti.sid + ']' : '')
        }));
        const phoneOptions: NormalizedOption[] = (s.phoneNumbers as TwilioItem[]).map((n) => ({
            value: n.phoneNumber || '',
            label: (n.phoneNumber || '') + (n.friendlyName ? ' — ' + n.friendlyName : '')
        }));
        const intelOptions: NormalizedOption[] = (s.intelServices as TwilioItem[]).map((ti) => ({
            value: ti.sid || '',
            label: (ti.friendlyName || '(unnamed)') + (ti.sid ? '  [' + ti.sid + ']' : '')
        }));

        return (
            <component.StackPanel
                orientation={component.StackPanel.Orientation.VERTICAL}
                itemGap={component.StackPanel.GapSize.M}
            >
                {heading}
                {intro}
                <component.StackPanel.Item>
                    <DropdownField
                        label="TwiML Application"
                        options={twimlOptions}
                        selectedValue={s.twimlAppSid}
                        onChange={(v): void => this.dispatchField('twimlAppSid', v)}
                    />
                </component.StackPanel.Item>
                <component.StackPanel.Item>
                    <DropdownField
                        label="Default outbound caller ID"
                        options={phoneOptions}
                        selectedValue={s.phoneNumber}
                        onChange={(v): void => this.dispatchField('phoneNumber', v)}
                    />
                </component.StackPanel.Item>
                <component.StackPanel.Item>
                    <DropdownField
                        label="Conversational Intelligence Service"
                        options={intelOptions}
                        selectedValue={s.intelServiceSid}
                        onChange={(v): void => this.dispatchField('intelServiceSid', v)}
                    />
                </component.StackPanel.Item>
            </component.StackPanel>
        );
    }
}
