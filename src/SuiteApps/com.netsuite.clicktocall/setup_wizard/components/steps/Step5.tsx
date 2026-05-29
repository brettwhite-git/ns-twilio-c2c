/**
 * Step 5 — Test & activate (JSX).
 *
 * Phase 3 (2026-05-28) — JSX rewrite of components/steps/step5.ts. The
 * wizard's final step with three branching states:
 *   1. activated:        success message + "Go to Admin Console" button
 *   2. loading:           loader while preflight is running
 *   3. default (review):  configuration review + preflight rows +
 *                          Activate button (gated by allPassed)
 *
 * componentDidMount fires loadStep5 which dispatches snapshot +
 * assignments + preflight in parallel.
 */

import {PureComponent} from '@uif-js/core';
import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {Action} from '../../app/Action';
import {loadStep5} from '../../app/effects/steps';
import {goToConsole} from '../../app/effects/navigation';
import {wizardCall} from '../../services/wizardApi';
import type {AppState} from '../../app/InitialState';
import type {PageTickProps} from '../../App';

interface ConfigSnapshot {
    accountSid?: string;
    apiKeySid?: string;
    apiSecretId?: string;
    twimlAppSid?: string;
    phoneNumber?: string;
    intelServiceSid?: string;
}

interface PreflightCheck {
    id?: string;
    label?: string;
    status?: string;
    detail?: string;
    repairHint?: string;
}

interface AssignmentRow {
    phoneSid?: string;
}

/**
 * Minimal inline check row — Phase 5 introduces the shared `<StatusIcon/>`
 * JSX primitive. Until then this avoids the imperative/JSX boundary
 * issue by inlining the badge logic directly.
 */
const CheckRowItem = (props: { check: PreflightCheck }): core.VDom.Node => {
    const {check} = props;
    const status = check.status || 'info_enabled';
    let icon: unknown;
    let color: unknown;
    switch (status) {
        case 'pass':
            icon = core.SystemIcon.STATUS_SUCCESS_FILLED;
            color = core.ImageConstant.Color.SUCCESS;
            break;
        case 'fail':
            icon = core.SystemIcon.STATUS_ERROR_FILLED;
            color = core.ImageConstant.Color.DANGER;
            break;
        case 'warn':
            icon = core.SystemIcon.STATUS_WARNING_FILLED;
            color = core.ImageConstant.Color.WARNING;
            break;
        case 'info_enabled':
            icon = core.SystemIcon.STATUS_INFO_FILLED;
            color = core.ImageConstant.Color.INFO;
            break;
        default:
            icon = core.SystemIcon.STATUS_INFO;
            color = core.ImageConstant.Color.NEUTRAL;
    }

    const textColumnItems = [
        (
            <component.StackPanel.Item>
                <component.Text type={component.Text.Type.STRONG}>
                    {check.label || ''}
                </component.Text>
            </component.StackPanel.Item>
        ),
        check.detail && (
            <component.StackPanel.Item>
                <component.Text
                    type={component.Text.Type.WEAK}
                    size={component.Text.Size.S}
                >
                    {check.detail}
                </component.Text>
            </component.StackPanel.Item>
        ),
        check.repairHint && (
            <component.StackPanel.Item>
                <component.Text size={component.Text.Size.S}>
                    {'→ ' + check.repairHint}
                </component.Text>
            </component.StackPanel.Item>
        )
    ].filter(Boolean);

    return (
        <component.StackPanel
            orientation={component.StackPanel.Orientation.HORIZONTAL}
            alignment={component.StackPanel.Alignment.START}
            itemGap={component.StackPanel.GapSize.M}
        >
            <component.StackPanel.Item>
                <component.Image
                    image={icon as never}
                    size={component.Image.Size.M}
                    color={color as never}
                    presentation={true}
                />
            </component.StackPanel.Item>
            <component.StackPanel.Item>
                <component.StackPanel
                    orientation={component.StackPanel.Orientation.VERTICAL}
                    itemGap={component.StackPanel.GapSize.XXS}
                >
                    {textColumnItems as never}
                </component.StackPanel>
            </component.StackPanel.Item>
        </component.StackPanel>
    );
};

export default class Step5 extends PureComponent<PageTickProps, unknown> {
    componentDidMount(): void {
        store.dispatch(Action.step5FieldChange('loading', true));
        store.dispatch(Action.step5FieldChange('activateError', null));
        loadStep5().finally(() => {
            store.dispatch(Action.step5FieldChange('loading', false));
        });
    }

    private rerunPreflight = (): void => {
        store.dispatch(Action.step5FieldChange('loading', true));
        store.dispatch(Action.step5FieldChange('activateError', null));
        loadStep5().finally(() => {
            store.dispatch(Action.step5FieldChange('loading', false));
        });
    };

    private activate = async (): Promise<void> => {
        try {
            const payload = await wizardCall('wizardActivate', {});
            const resp = payload as {
                activated?: boolean;
                error?: string;
                failedChecks?: PreflightCheck[];
            } | null;
            if (resp && resp.activated) {
                store.dispatch(Action.step5FieldChange('activated', true));
                store.dispatch(Action.step5FieldChange('activateError', null));
            } else {
                store.dispatch(Action.step5FieldChange(
                    'activateError',
                    (resp && resp.error) || 'unknown'
                ));
                if (resp && resp.failedChecks) {
                    store.dispatch(Action.consoleLoadSuccess({
                        preflight: resp.failedChecks as unknown[]
                    }));
                }
            }
        } catch (e) {
            const err = e as { message?: string };
            store.dispatch(Action.step5FieldChange(
                'activateError',
                'Network: ' + (err.message || String(e))
            ));
        }
    };

    render(): core.VDom.Node {
        const state = store.getState() as AppState;
        const s = state.step5;
        const heading = (
            <component.StackPanel.Item>
                <component.Heading level={2}>Test &amp; activate</component.Heading>
            </component.StackPanel.Item>
        );

        // Activated state
        if (s.activated) {
            return (
                <component.StackPanel
                    orientation={component.StackPanel.Orientation.VERTICAL}
                    itemGap={component.StackPanel.GapSize.M}
                >
                    {heading}
                    <component.StackPanel.Item>
                        <component.Text type={component.Text.Type.STRONG}>
                            ✓ Click-to-Call is active. Sales reps can now
                            use the phone icon on Customer, Lead, and
                            Contact records.
                        </component.Text>
                    </component.StackPanel.Item>
                    <component.StackPanel.Item>
                        <component.Button
                            label="Go to Admin Console"
                            type={component.Button.Type.PRIMARY}
                            action={(): void => { goToConsole(); }}
                        />
                    </component.StackPanel.Item>
                </component.StackPanel>
            );
        }

        // Loading state
        if (s.loading) {
            return (
                <component.StackPanel
                    orientation={component.StackPanel.Orientation.VERTICAL}
                    itemGap={component.StackPanel.GapSize.M}
                >
                    {heading}
                    <component.StackPanel.Item>
                        {new component.Loader({
                            label: 'Running preflight checks…',
                            indeterminate: true
                        } as never) as never}
                    </component.StackPanel.Item>
                </component.StackPanel>
            );
        }

        // Review state
        const consoleState = state.console;
        const snap = (consoleState.snapshot as ConfigSnapshot | null) || null;
        const assignments = (consoleState.assignments as AssignmentRow[] | null) || [];
        const preflight = (consoleState.preflight as PreflightCheck[] | null) || null;
        const phoneNumbersWithReps: Record<string, boolean> = {};
        assignments.forEach((a) => {
            if (a.phoneSid) phoneNumbersWithReps[a.phoneSid] = true;
        });

        const reviewLines = snap ? [
            'Account SID:        ' + (snap.accountSid || '(not set)'),
            'API Key SID:        ' + (snap.apiKeySid || '(not set)'),
            'API Key Secret:     ' + (snap.apiSecretId || '(not set)'),
            'TwiML Application:  ' + (snap.twimlAppSid || '(not set)'),
            'Default caller ID:  ' + (snap.phoneNumber || '(not set)'),
            'Intel Service:      ' + (snap.intelServiceSid || '(none)'),
            'Phone assignments:  ' + assignments.length + ' rep(s) across ' +
                Object.keys(phoneNumbersWithReps).length + ' number(s)'
        ] : [];

        const allPassed = preflight !== null &&
            preflight.every((c) => c.status === 'pass');

        const items = [
            heading,
            snap && (
                <component.StackPanel.Item>
                    <component.Heading level={3}>
                        Configuration review
                    </component.Heading>
                </component.StackPanel.Item>
            ),
            ...reviewLines.map((line, idx) => (
                <component.StackPanel.Item key={'review-' + idx}>
                    <component.Text size={component.Text.Size.S}>
                        {line}
                    </component.Text>
                </component.StackPanel.Item>
            )),
            preflight && (
                <component.StackPanel.Item>
                    <component.Heading level={3}>
                        Preflight checks
                    </component.Heading>
                </component.StackPanel.Item>
            ),
            ...(preflight || []).map((check, idx) => (
                <component.StackPanel.Item key={'pf-' + (check.id || idx)}>
                    <CheckRowItem check={check} />
                </component.StackPanel.Item>
            )),
            (
                <component.StackPanel.Item>
                    <component.Button
                        label={allPassed
                            ? 'Activate Click-to-Call'
                            : 'Activate Click-to-Call (fix preflight first)'}
                        type={component.Button.Type.PRIMARY}
                        enabled={allPassed}
                        action={(): void => { this.activate(); }}
                    />
                </component.StackPanel.Item>
            ),
            s.activateError && (
                <component.StackPanel.Item>
                    <component.Text type={component.Text.Type.STRONG}>
                        ✕ Activation failed: {s.activateError}
                    </component.Text>
                </component.StackPanel.Item>
            ),
            (
                <component.StackPanel.Item>
                    <component.Button
                        label="Re-run preflight"
                        type={component.Button.Type.DEFAULT}
                        action={this.rerunPreflight}
                    />
                </component.StackPanel.Item>
            )
        ].filter(Boolean);

        return (
            <component.StackPanel
                orientation={component.StackPanel.Orientation.VERTICAL}
                itemGap={component.StackPanel.GapSize.M}
            >
                {items as never}
            </component.StackPanel>
        );
    }
}
