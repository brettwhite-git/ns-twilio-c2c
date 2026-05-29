/**
 * Step 2 — Connect Twilio (JSX).
 *
 * Phase 3 (2026-05-28) — JSX rewrite of components/steps/step2.ts. Three
 * text-field rows in a 3-column GridPanel: Account SID, API Key SID,
 * API Key Secret script ID.
 *
 * The legacy `buildStep2Form(d)` export in step2.ts stays alive until
 * Phase 6 deletes it and rewires App.tsx to use this PureComponent.
 *
 * Pattern reference:
 *   - oracle-samples/.../airport360/src/components/...
 *   - docs/solutions/architecture-patterns/uif-spa-canonical-patterns-2026-05-28.md
 *   - docs/references/2026-05-28-jsx-spike-findings.md
 */

import {PureComponent} from '@uif-js/core';
import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {Action} from '../../app/Action';
import {WizardNavFooter} from '../shared/WizardNavFooter';
import type {AppState, Step2State} from '../../app/InitialState';
import type {PageTickProps} from '../../App';

interface Step2FieldProps {
    label: string;
    placeholder: string;
    field: keyof Step2State;
}

class Step2Field extends PureComponent<Step2FieldProps, unknown> {
    private handleChange = (args: { text?: string } | undefined): void => {
        const v = (args && args.text) || '';
        store.dispatch(Action.step2FieldChange(this.props.field, v));
    };

    render(): core.VDom.Node {
        const state = store.getState() as AppState;
        const value = state.step2[this.props.field] || '';
        return (
            <component.Field
                label={this.props.label}
                orientation={component.Field.Orientation.VERTICAL}
            >
                <component.TextBox
                    text={value}
                    placeholder={this.props.placeholder}
                    onTextChanged={this.handleChange}
                />
            </component.Field>
        );
    }
}

export default class Step2 extends PureComponent<PageTickProps, unknown> {
    render(): core.VDom.Node {
        return (
            <component.StackPanel
                orientation={component.StackPanel.Orientation.VERTICAL}
                itemGap={component.StackPanel.GapSize.M}
            >
                <component.StackPanel.Item>
                    <component.Heading level={2}>
                        Connect to your Twilio account
                    </component.Heading>
                </component.StackPanel.Item>
                <component.StackPanel.Item>
                    <component.Text>
                        Enter your Twilio Account SID and API Key SID. The
                        API Key Secret must already exist in NetSuite API
                        Secrets (Setup &gt; Company &gt; API Secrets) —
                        paste its script ID below. Live validation against
                        Twilio runs at Step 5 (Test &amp; activate) using
                        the configured secret pointer — no need to paste
                        the secret value here.
                    </component.Text>
                </component.StackPanel.Item>
                <component.StackPanel.Item>
                    <component.GridPanel
                        columns="1fr 1fr 1fr"
                        rows="auto"
                        columnGap={component.GridPanel.GapSize.M}
                    >
                        <component.GridPanel.Item>
                            <Step2Field
                                label="Account SID"
                                placeholder="AC..."
                                field="accountSid"
                            />
                        </component.GridPanel.Item>
                        <component.GridPanel.Item>
                            <Step2Field
                                label="API Key SID"
                                placeholder="SK..."
                                field="apiKeySid"
                            />
                        </component.GridPanel.Item>
                        <component.GridPanel.Item>
                            <Step2Field
                                label="API Key Secret script ID"
                                placeholder="custsecret_..."
                                field="apiSecretId"
                            />
                        </component.GridPanel.Item>
                    </component.GridPanel>
                </component.StackPanel.Item>
                <component.StackPanel.Item>
                    <WizardNavFooter />
                </component.StackPanel.Item>
            </component.StackPanel>
        );
    }
}
