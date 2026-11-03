/**
 * Outbound recording notice — JSX section on the Voice page, below the
 * TwiML App picker.
 *
 * Switch + notice TextArea (form controls are JSX so the VDom keeps
 * their focus across the per-keystroke re-render, as on InboundPage),
 * first-publish consent copy, "Save & publish" ("Save" while the notice
 * is off and nothing is published) / "Check again" /
 * "Unpublish and remove" (two-click confirm, as Deactivate on the
 * Overview), the step list of the last run, and the publish status.
 * Spec: docs/specs/outbound-recording-notice.md §4, §9a.
 */

import {PureComponent} from '@uif-js/core';
import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {Action} from '../../app/Action';
import {
    loadOutbound,
    resumePublishOutbound,
    saveAndPublishOutbound,
    unpublishOutbound
} from '../../app/effects/outbound';
import type {AppState, OutboundState, OutboundStep} from '../../app/InitialState';
import type {PageTickProps} from '../../App';
import {CheckRow} from '../shared/CheckRow';
import {ErrorText} from '../shared/ErrorText';

export const CONSENT_TEXT =
    'Publishing creates a Twilio Function named ctc-outbound in your Twilio ' +
    'account and points your TwiML App\'s Voice URL at it. Your current ' +
    'Voice URL is saved so you can restore it.';
export const REPUBLISH_WARNING = 'A newer version is available. Republish to update.';
export const NOTICE_OFF_PUBLISHED_NOTE =
    'The Function stays in place; calls connect without a notice. Use ' +
    'Unpublish and remove to restore your previous Voice URL.';
export const VOICE_URL_WARNING =
    'Your TwiML App\'s Voice URL no longer points at the published Function.';

const STEP_STATUS: Record<OutboundStep['status'], { check: string; text: string }> = {
    ok: { check: 'pass', text: 'Done' },
    skipped: { check: 'info_disabled', text: 'Skipped' },
    failed: { check: 'fail', text: 'Failed' },
    pending: { check: 'info_enabled', text: 'Pending' }
};

/**
 * "Published <local date time> · notice v3" / "Not published yet" /
 * "Live: notice v2 · Saved changes not published yet". The version shown
 * is the one Twilio plays (publishedNoticeVersion), never the saved one.
 */
export const outboundStatusLine = (outbound: OutboundState): string => {
    if (!outbound.published) return 'Not published yet';
    const live = outbound.publishedNoticeVersion
        ? 'notice v' + outbound.publishedNoticeVersion
        : 'no notice';
    if (outbound.changesPending) return 'Live: ' + live + ' · Saved changes not published yet';
    const when = new Date(outbound.publishedAt);
    const whenText = !outbound.publishedAt
        ? ''
        : isNaN(when.getTime()) ? outbound.publishedAt : when.toLocaleString();
    return 'Published' + (whenText ? ' ' + whenText : '') +
        (outbound.publishedNoticeVersion ? ' · notice v' + outbound.publishedNoticeVersion : '');
};

const item = (node: core.VDom.Node | false | null | undefined): core.VDom.Node | false =>
    node ? <component.StackPanel.Item>{node as never}</component.StackPanel.Item> : false;

const vstack = (
    gap: unknown,
    nodes: Array<core.VDom.Node | false | null | undefined>
): core.VDom.Node => (
    <component.StackPanel
        orientation={component.StackPanel.Orientation.VERTICAL}
        itemGap={gap as never}
    >
        {nodes.map(item).filter(Boolean) as never}
    </component.StackPanel>
);

const hstack = (nodes: Array<core.VDom.Node | false | null | undefined>): core.VDom.Node => (
    <component.StackPanel
        orientation={component.StackPanel.Orientation.HORIZONTAL}
        itemGap={component.StackPanel.GapSize.S}
    >
        {nodes.map(item).filter(Boolean) as never}
    </component.StackPanel>
);

const weak = (text: string): core.VDom.Node => (
    <component.Text type={component.Text.Type.WEAK} size={component.Text.Size.S}>
        {text}
    </component.Text>
);

const stepRow = (step: OutboundStep): core.VDom.Node => {
    const s = STEP_STATUS[step.status];
    return (
        <CheckRow check={{
            label: step.label + ' — ' + s.text,
            status: s.check,
            detail: step.status === 'failed' ? step.detail : undefined
        }} />
    );
};

export default class OutboundNotice extends PureComponent<PageTickProps, unknown> {
    componentDidMount(): void {
        const outbound = (store.getState() as AppState).outbound;
        if (!outbound.loaded && !outbound.loading) {
            loadOutbound();
        }
    }

    private renderButtons(outbound: OutboundState, busy: boolean): core.VDom.Node {
        // Notice off and nothing published: save only, nothing goes to Twilio.
        const saveOnly = !outbound.noticeOn && !outbound.published;
        const working = outbound.saving || outbound.publishing;
        const saveButton = new component.Button({
            label: saveOnly
                ? (working ? 'Saving…' : 'Save')
                : (working ? 'Publishing…' : 'Save & publish'),
            type: component.Button.Type.PRIMARY,
            enabled: !busy,
            action: (): void => { saveAndPublishOutbound(!saveOnly); }
        } as never) as never;

        if (!outbound.published) return hstack([saveButton]);

        if (outbound.confirmUnpublish) {
            return vstack(component.StackPanel.GapSize.XXS, [
                weak('This restores the previous Voice URL and deletes the Function.'),
                hstack([
                    <component.Button
                        label="Cancel"
                        enabled={!busy}
                        action={(): void => { store.dispatch(Action.outboundConfirmUnpublish(false)); }}
                    />,
                    <component.Button
                        label="Confirm unpublish"
                        type={component.Button.Type.DANGER}
                        enabled={!busy}
                        action={(): void => { unpublishOutbound(); }}
                    />
                ])
            ]);
        }

        return hstack([
            saveButton,
            <component.Button
                label={outbound.unpublishing ? 'Unpublishing…' : 'Unpublish and remove'}
                type={component.Button.Type.DANGER}
                enabled={!busy}
                action={(): void => { store.dispatch(Action.outboundConfirmUnpublish(true)); }}
            />
        ]);
    }

    private renderSettings(outbound: OutboundState): core.VDom.Node {
        const busy = outbound.saving || outbound.publishing || outbound.unpublishing;
        const max = outbound.maxLength;
        const steps = outbound.steps || [];

        const noticeSwitch = vstack(component.StackPanel.GapSize.XXS, [
            <component.Switch
                label="Play a recording notice on outbound calls"
                value={outbound.noticeOn}
                enabled={!busy}
                action={(args: { value?: boolean }): void => {
                    store.dispatch(Action.outboundFieldChange({ noticeOn: !!(args && args.value) }));
                }}
            />,
            weak('The person you call hears this after they answer, before the call ' +
                'connects and before recording starts.')
        ]);

        const noticeText = outbound.noticeOn && vstack(component.StackPanel.GapSize.XXS, [
            <component.Text type={component.Text.Type.STRONG}>Notice</component.Text>,
            <component.TextArea
                text={outbound.noticeText}
                placeholder={outbound.defaultText}
                maxLength={max}
                rowCount={2}
                enabled={!busy}
                onTextChanged={(args: { text?: string } | undefined): void => {
                    store.dispatch(Action.outboundFieldChange({
                        noticeText: ((args && args.text) || '').slice(0, max)
                    }));
                }}
                rootStyle={{width: '100%'} as never}
            />,
            weak(outbound.noticeText.length + ' / ' + max + ' characters'),
            weak('Have your legal counsel approve the wording.')
        ]);

        const pending = outbound.pending && !outbound.publishing && vstack(component.StackPanel.GapSize.XXS, [
            <component.Text type={component.Text.Type.WEAK}>
                {'Publishing… the Twilio build is still running'}
            </component.Text>,
            new component.Button({
                label: 'Check again',
                startIcon: core.SystemIcon.REFRESH,
                enabled: !busy,
                action: (): void => { resumePublishOutbound(); }
            } as never) as never
        ]);

        const status = vstack(component.StackPanel.GapSize.XXS, [
            <component.Text type={component.Text.Type.WEAK}>
                {outboundStatusLine(outbound)}
            </component.Text>,
            outbound.published && !!outbound.functionUrl &&
                weak('Function URL: ' + outbound.functionUrl),
            outbound.published && outbound.needsRepublish &&
                <CheckRow check={{ label: REPUBLISH_WARNING, status: 'warn' }} />,
            outbound.published && outbound.voiceUrlMatches === false &&
                <CheckRow check={{ label: VOICE_URL_WARNING, status: 'warn' }} />
        ]);

        return (
            <component.StackPanel
                orientation={component.StackPanel.Orientation.VERTICAL}
                itemGap={component.StackPanel.GapSize.L}
                rootStyle={{maxWidth: '560px'} as never}
            >
                {[
                    item(noticeSwitch),
                    item(noticeText),
                    item(!outbound.published && outbound.noticeOn && weak(CONSENT_TEXT)),
                    item(outbound.published && !outbound.noticeOn && weak(NOTICE_OFF_PUBLISHED_NOTE)),
                    item(this.renderButtons(outbound, busy)),
                    item(outbound.error ? <ErrorText message={outbound.error} /> : false),
                    item(pending),
                    item(steps.length > 0 && vstack(component.StackPanel.GapSize.XS, steps.map(stepRow))),
                    item(status)
                ].filter(Boolean) as never}
            </component.StackPanel>
        );
    }

    render(): core.VDom.Node {
        const outbound = (store.getState() as AppState).outbound;
        const heading = <component.Heading level={3}>Outbound recording notice</component.Heading>;

        if (outbound.loading || (!outbound.loaded && !outbound.loadError)) {
            return vstack(component.StackPanel.GapSize.S, [
                heading,
                new component.Loader({
                    label: 'Loading recording notice…',
                    indeterminate: true
                } as never) as never
            ]);
        }

        if (!outbound.loaded) {
            return vstack(component.StackPanel.GapSize.S, [
                heading,
                <ErrorText message={outbound.loadError || 'Could not load the outbound recording notice'} />,
                new component.Button({
                    label: 'Retry',
                    startIcon: core.SystemIcon.REFRESH,
                    action: (): void => { loadOutbound(); }
                } as never) as never
            ]);
        }

        return vstack(component.StackPanel.GapSize.S, [
            heading,
            this.renderSettings(outbound)
        ]);
    }
}
