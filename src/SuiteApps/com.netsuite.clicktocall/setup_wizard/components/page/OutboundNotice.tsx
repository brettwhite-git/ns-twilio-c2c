/**
 * Outbound recording notice — the "Recording notice" card of Outbound
 * calls (canvas Outbound.dc.html). Spec: SPEC.md §10, §4a.
 *
 *   Header   "Recording notice" + one status (consoleModel noticeStatus):
 *            Not live / Unsaved changes / Saved, not live yet / Live ·
 *            callers hear version N, and the problem states (Function
 *            missing, Twilio app not pointing at it, build running,
 *            republish needed).
 *   Left     the switch and, while it is on, the notice TextArea (also
 *            after a publish). Form controls are JSX so the VDom keeps
 *            their focus across the per-keystroke re-render.
 *   Right    "Live in Twilio": what callers hear now, the published time
 *            and the Function URL; "Last publish" steps of this session;
 *            "Check again" while the Twilio build runs.
 *   Actions  (under the card) exactly one primary button (consoleModel noticeActions):
 *            Publish notice / Save / Publish changes / Turn off notice /
 *            "Publishing… (15–30 s)"; "Discard changes" resets the form
 *            to the saved notice.
 *   Removal  only when published, after a Divider: "Remove from Twilio…"
 *            (quiet danger) → inline "Remove the Function now?" Remove /
 *            Cancel (wizardUnpublishOutbound).
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
import {StatusIcon} from '../shared/StatusIcon';
import {friendlyError} from '../shared/friendlyError';
import {
    REMOVE_CONFIRM_TEXT, dateTime, liveNotice, noticeActions, noticeStatus, removeBody
} from '../shared/consoleModel';
import {
    button, card, cardTitle, divider, dotText, errorLine, field, grid, help, hstack, label, problemCard, skeleton,
    text, vstack, Gap
} from '../shared/ui';
import type {Child} from '../shared/ui';

export const REPUBLISH_WARNING = 'A newer version is available. Republish to update.';
export const VOICE_URL_WARNING =
    'Your TwiML App\'s Voice URL no longer points at the published Function.';

const STEP_STATUS: Record<OutboundStep['status'], { check: string; text: string }> = {
    ok: { check: 'pass', text: 'Done' },
    skipped: { check: 'info_disabled', text: 'Skipped' },
    failed: { check: 'fail', text: 'Failed' },
    pending: { check: 'info_enabled', text: 'Pending' }
};

const stepLine = (step: OutboundStep): core.VDom.Node => {
    const s = STEP_STATUS[step.status];
    return grid('18px minmax(0, 1fr) auto', [
        <StatusIcon status={s.check} size={component.Image.Size.S} />,
        text(step.label, { small: true }),
        help(step.status === 'failed' && step.detail ? 'Failed · ' + step.detail
            : step.detail ? s.text + ' · ' + step.detail : s.text)
    ], Gap.SPACING2X);
};

/** Busy: a save, a publish run or a removal is in progress. */
const isBusy = (o: OutboundState): boolean => o.saving || o.publishing || o.publishRunning || o.unpublishing;

export default class OutboundNotice extends PureComponent<PageTickProps, unknown> {
    componentDidMount(): void {
        const outbound = (store.getState() as AppState).outbound;
        if (!outbound.loaded && !outbound.loading) {
            loadOutbound();
        }
    }

    private renderLeft(outbound: OutboundState, busy: boolean): core.VDom.Node {
        const max = outbound.maxLength;
        return vstack([
            <component.Switch
                label="Play a notice before the call connects"
                value={outbound.noticeOn}
                enabled={!busy}
                action={(args: { value?: boolean }): void => {
                    store.dispatch(Action.outboundFieldChange({ noticeOn: !!(args && args.value) }));
                }}
            />,
            help('The person called hears it after they answer; the rep hears ringing. Recording starts after ' +
                'the notice, so the notice is not in the transcript. Every outbound call is recorded.'),
            // Shown while the switch is on, before and after a publish.
            outbound.noticeOn ? field('Notice',
                <component.TextArea
                    text={outbound.noticeText}
                    placeholder={outbound.defaultText}
                    maxLength={max}
                    rowCount={3}
                    enabled={!busy}
                    onTextChanged={(args: { text?: string } | undefined): void => {
                        store.dispatch(Action.outboundFieldChange({
                            noticeText: ((args && args.text) || '').slice(0, max)
                        }));
                    }}
                    rootStyle={{width: '100%'} as never}
                />,
                // The TextArea draws its own n/max counter (maxLength).
                help('Have your legal counsel approve the wording.')
            ) : null
        ], Gap.SPACING3X);
    }

    private renderRight(outbound: OutboundState, busy: boolean): core.VDom.Node {
        const steps = outbound.steps || [];
        const live = liveNotice(outbound);
        const when = dateTime(outbound.publishedAt);
        const liveBody: Child[] = live ? [
            live.quote ? text(live.quote, { classList: ['ctc-quote'] }) : null,
            live.note ? text(live.note, { weak: true }) : null,
            when ? help('Published ' + when) : null,
            outbound.functionUrl ? help('Function URL: ' + outbound.functionUrl) : null
        ] : [text('Nothing is live yet.', { weak: true })];
        return vstack([
            vstack([label('Live in Twilio'), ...liveBody], Gap.SPACING1X),
            outbound.published && outbound.voiceUrlMatches === false ? dotText('problem', VOICE_URL_WARNING, undefined, { small: true }) : null,
            outbound.published && outbound.needsRepublish ? dotText('warn', REPUBLISH_WARNING, undefined, { small: true }) : null,
            steps.length ? vstack([label('Last publish'), vstack(steps.map(stepLine), Gap.SPACING1X)], Gap.SPACING1X) : null,
            outbound.pending && !outbound.publishing && !outbound.publishRunning ? hstack([
                help('The Twilio build is still running.'),
                button('Check again', () => { resumePublishOutbound(); }, {
                    small: true, enabled: !busy, icon: core.SystemIcon.REFRESH
                })
            ], Gap.SPACING2X, { wrap: true }) : null
        ], Gap.SPACING3X);
    }

    private renderActions(outbound: OutboundState, busy: boolean): core.VDom.Node {
        const a = noticeActions(outbound);
        return hstack([
            button(a.primary.label, () => { saveAndPublishOutbound(a.primary.run === 'publish'); }, {
                primary: true, enabled: a.primary.enabled
            }),
            a.discard ? button('Discard changes', () => {
                store.dispatch(Action.outboundFieldChange({
                    noticeOn: outbound.savedNoticeOn,
                    noticeText: outbound.savedNoticeText
                }));
            }, { enabled: !busy }) : null,
            help(a.help)
        ], Gap.SPACING2X, { wrap: true, growLast: true });
    }

    /** "Remove from Twilio" (published only): quiet-danger button → inline confirm. */
    private renderRemoval(outbound: OutboundState, busy: boolean): Child[] {
        const action: Child = outbound.confirmUnpublish || outbound.unpublishing
            ? hstack([
                text(REMOVE_CONFIRM_TEXT, { strong: true }),
                button(outbound.unpublishing ? 'Removing…' : 'Remove', () => { unpublishOutbound(); }, {
                    danger: true, small: true, enabled: !busy
                }),
                button('Cancel', () => { store.dispatch(Action.outboundConfirmUnpublish(false)); }, {
                    small: true, enabled: !busy
                })
            ], Gap.SPACING2X, { wrap: true })
            : button('Remove from Twilio…', () => { store.dispatch(Action.outboundConfirmUnpublish(true)); }, {
                quietDanger: true, enabled: !busy
            });
        return [
            divider(),
            grid('minmax(0, 1fr) auto', [
                vstack([label('Remove from Twilio'), text(removeBody(outbound.prevVoiceUrl))], Gap.SPACING1X),
                action
            ], Gap.SPACING4X)
        ];
    }

    render(): core.VDom.Node {
        const outbound = (store.getState() as AppState).outbound;

        if (outbound.loading || (!outbound.loaded && !outbound.loadError)) {
            return card([cardTitle('Recording notice'), skeleton('lines', 4, 'Loading recording notice…')],
                { label: 'Recording notice' });
        }
        if (!outbound.loaded) {
            return problemCard('Couldn\'t load the recording notice',
                friendlyError(outbound.loadError || 'Could not load the outbound recording notice') +
                ' Nothing was changed.',
                [button('Retry', () => { loadOutbound(); }, { primary: true, small: true })]);
        }

        const busy = isBusy(outbound);
        const head = noticeStatus(outbound);
        // Canvas: the action row sits under the card; the removal section
        // is the bottom of the card.
        return vstack([
            card([
                hstack([cardTitle('Recording notice'), dotText(head.tone, head.label, head.extra)], Gap.SPACING3X, {
                    justification: component.StackPanel.Justification.SPACE_BETWEEN, wrap: true
                }),
                grid('minmax(0, 1fr) minmax(0, 1fr)', [this.renderLeft(outbound, busy), this.renderRight(outbound, busy)],
                    Gap.SPACING5X),
                outbound.error ? errorLine(friendlyError(outbound.error)) : null,
                ...(outbound.published ? this.renderRemoval(outbound, busy) : [])
            ], { label: 'Recording notice', gap: Gap.SPACING4X }),
            this.renderActions(outbound, busy)
        ], Gap.SPACING3X);
    }
}
