/**
 * Outbound recording notice — the "Recording notice" card of Outbound
 * calls (canvas Outbound.dc.html) and the action row under it.
 *
 * Card: title + live status line; left, the switch, help and notice
 * TextArea (form controls are JSX so the VDom keeps their focus across
 * the per-keystroke re-render); right, "Last publish" — the step list of
 * the last publish / unpublish this session, "Check again" while the
 * Twilio build runs, and the Function URL.
 * Action row: "Save & publish" ("Save" while the notice is off and
 * nothing is published) and "Unpublish and remove…" (inline confirm),
 * with one help line. Spec: docs/specs/outbound-recording-notice.md §4, §9a.
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
import type {Tone} from '../shared/consoleModel';
import {
    button, card, cardTitle, dotText, errorLine, field, grid, help, hstack, problemCard, skeleton, text,
    vstack, Gap
} from '../shared/ui';
import type {Child} from '../shared/ui';

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

/** Header status of the notice: tone + headline (+ published time). */
export function noticeHeadline(o: OutboundState): { tone: Tone; label: string; extra: string } {
    const when = o.publishedAt && !isNaN(Date.parse(o.publishedAt)) ? '· ' + new Date(o.publishedAt).toLocaleString() : '';
    if (!o.published) return { tone: 'off', label: 'Not published', extra: '' };
    if (o.functionExists === false) return { tone: 'problem', label: o.functionMessage || 'The Function is missing in Twilio', extra: '' };
    if (o.voiceUrlMatches === false) return { tone: 'problem', label: 'The Twilio app does not point at it', extra: when };
    if (o.pending) return { tone: 'warn', label: 'Published · the Twilio build is still running', extra: when };
    if (o.needsRepublish) return { tone: 'warn', label: 'Republish needed', extra: when };
    if (o.changesPending) return { tone: 'warn', label: 'Saved changes are not live yet', extra: when };
    const live = o.publishedNoticeVersion ? 'version ' + o.publishedNoticeVersion + ' live' : 'no notice plays';
    return { tone: 'ok', label: 'Published · ' + live + (o.voiceUrlMatches ? ' · Twilio app points at it' : ''), extra: when };
}

const stepLine = (step: OutboundStep): core.VDom.Node => {
    const s = STEP_STATUS[step.status];
    return grid('18px minmax(0, 1fr) auto', [
        <StatusIcon status={s.check} size={component.Image.Size.S} />,
        text(step.label, { small: true }),
        help(step.status === 'failed' && step.detail ? 'Failed · ' + step.detail
            : step.detail ? s.text + ' · ' + step.detail : s.text)
    ], Gap.SPACING2X);
};

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
            ) : null,
            !outbound.published && outbound.noticeOn ? help(CONSENT_TEXT) : null,
            outbound.published && !outbound.noticeOn ? help(NOTICE_OFF_PUBLISHED_NOTE) : null
        ], Gap.SPACING3X);
    }

    private renderRight(outbound: OutboundState, busy: boolean): core.VDom.Node {
        const steps = outbound.steps || [];
        return vstack([
            text('Last publish', { strong: true, small: true }),
            steps.length
                ? vstack(steps.map(stepLine), Gap.SPACING1X)
                : help(outbound.published
                    ? outboundStatusLine(outbound) + '. The steps of a publish show here.'
                    : 'Nothing published yet. The steps show here after Save & publish.'),
            outbound.pending && !outbound.publishing ? hstack([
                help('The Twilio build is still running.'),
                button('Check again', () => { resumePublishOutbound(); }, {
                    small: true, enabled: !busy, icon: core.SystemIcon.REFRESH
                })
            ], Gap.SPACING2X, { wrap: true }) : null,
            outbound.published && outbound.functionUrl ? help('Function URL: ' + outbound.functionUrl) : null,
            outbound.published && outbound.voiceUrlMatches === false ? dotText('problem', VOICE_URL_WARNING, undefined, { small: true }) : null,
            outbound.published && outbound.needsRepublish ? dotText('warn', REPUBLISH_WARNING, undefined, { small: true }) : null,
            help('A SuiteApp update that changes the function code shows "Republish needed" here and on Overview.')
        ], Gap.SPACING2X);
    }

    private renderActions(outbound: OutboundState, busy: boolean): core.VDom.Node {
        // Notice off and nothing published: save only, nothing goes to Twilio.
        const saveOnly = !outbound.noticeOn && !outbound.published;
        const working = outbound.saving || outbound.publishing;
        const items: Child[] = [
            button(saveOnly ? (working ? 'Saving…' : 'Save') : (working ? 'Publishing…' : 'Save & publish'),
                () => { saveAndPublishOutbound(!saveOnly); }, { primary: true, enabled: !busy })
        ];
        if (outbound.published && outbound.confirmUnpublish) {
            items.push(text('This restores the previous Voice URL and deletes the Function.', { small: true }));
            items.push(button(outbound.unpublishing ? 'Unpublishing…' : 'Confirm unpublish', () => { unpublishOutbound(); }, {
                danger: true, small: true, enabled: !busy
            }));
            items.push(button('Cancel', () => { store.dispatch(Action.outboundConfirmUnpublish(false)); }, {
                small: true, enabled: !busy
            }));
        } else if (outbound.published) {
            items.push(button(outbound.unpublishing ? 'Unpublishing…' : 'Unpublish and remove…', () => {
                store.dispatch(Action.outboundConfirmUnpublish(true));
            }, { danger: true, enabled: !busy }));
        }
        items.push(help(saveOnly
            ? 'The notice is off and nothing is published: Save keeps the setting in NetSuite only.'
            : 'Save & publish updates the Twilio Function and points the Twilio app at it (15–30 s).'));
        return hstack(items, Gap.SPACING2X, { wrap: true, growLast: true });
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

        const busy = outbound.saving || outbound.publishing || outbound.unpublishing;
        const head = noticeHeadline(outbound);
        return vstack([
            card([
                hstack([cardTitle('Recording notice'), dotText(head.tone, head.label, head.extra)], Gap.SPACING3X, {
                    justification: component.StackPanel.Justification.SPACE_BETWEEN, wrap: true
                }),
                grid('minmax(0, 1fr) minmax(0, 1fr)', [this.renderLeft(outbound, busy), this.renderRight(outbound, busy)],
                    Gap.SPACING5X),
                outbound.error ? errorLine(friendlyError(outbound.error)) : null
            ], { label: 'Recording notice', gap: Gap.SPACING4X }),
            this.renderActions(outbound, busy)
        ], Gap.SPACING3X);
    }
}
