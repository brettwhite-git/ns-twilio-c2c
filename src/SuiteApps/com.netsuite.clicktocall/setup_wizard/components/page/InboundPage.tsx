/**
 * Inbound calls page (#/inbound) — canvas Inbound.dc.html.
 *
 *   Status bar card   master switch "Ring reps in the browser"; status
 *                     (unsaved-change count vs the saved settings, the
 *                     routingChanged signal, the publish time); Discard;
 *                     Save & publish ("Publish again" with no changes).
 *                     Publish failures, partial publishes and per-number
 *                     errors show under it.
 *   "What a caller experiences"  steps 1-4 in call order: Recording
 *                     notice, Ring the rep, No answer (+ voicemail),
 *                     Logged to (fallback owner).
 *   Routing card      Number, Rings, Also assigned, Rep's phone; one line
 *                     with the routing state since the last publish
 *                     (the signal says changed or not, not which number).
 * Form controls are JSX so the VDom keeps their focus across the
 * per-keystroke re-render.
 */

import {PureComponent} from '@uif-js/core';
import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {Action} from '../../app/Action';
import {loadInbound, publishRouting, saveInbound} from '../../app/effects/inbound';
import {loadPresence} from '../../app/effects/presence';
import {loadHealth} from '../../app/effects/health';
import {goToSection} from '../../app/effects/navigation';
import type {AppState, InboundRoute, InboundState, PresenceRow} from '../../app/InitialState';
import type {PageTickProps} from '../../App';
import {friendlyError} from '../shared/friendlyError';
import {formatPhone} from '../shared/formatPhone';
import {relativeTime} from '../shared/phoneStatus';
import {countInboundChanges} from '../shared/consoleModel';
import type {Tone} from '../shared/consoleModel';
import {
    button, card, cardTitle, divider, dotText, errorLine, field, grid, help, hstack, pageHeader, problemCard,
    skeleton, stepBadge, table, text, vstack, Gap
} from '../shared/ui';
import type {Child, Column} from '../shared/ui';
import {presenceTone} from './PhonesPage';

export const DEFAULT_NO_ANSWER_MESSAGE =
    'Sorry, no one is available to take your call. Please try again later. Goodbye.';
export const DEFAULT_VOICEMAIL_GREETING =
    'Sorry, no one is available. Please leave a message after the tone.';
/** Voicemail length choices (seconds), inside the server's 30-300 range. */
export const VOICEMAIL_SECONDS = [30, 60, 120, 180, 300];
export const NO_ANSWER_MAX_LENGTH = 300;
export const DEFAULT_RECORDING_NOTICE = 'This call may be recorded for quality and training.';
export const RECORDING_NOTICE_MAX_LENGTH = 300;
const RING_SECONDS = [10, 15, 20, 25, 30, 45, 60];
export const OFF_STILL_ROUTED_WARNING =
    '⚠ Numbers still point at the flow; callers hear the no-answer message.';

/** '30 seconds', '1 minute', '2 minutes', '90 seconds'. */
export const voicemailLengthLabel = (seconds: number): string => {
    if (seconds % 60 !== 0) return seconds + ' seconds';
    const minutes = seconds / 60;
    return minutes + (minutes === 1 ? ' minute' : ' minutes');
};

/**
 * The failure line of the last publish this session, or '' when it
 * succeeded / was skipped. A partial publish says so; the per-number
 * errors follow it.
 */
export const publishFailureText = (inbound: InboundState): string => {
    const last = inbound.lastPublish;
    if (!last || last.ok || last.skipped) return '';
    return last.message || 'Routing was not published. Publish again.';
};

/** "Published <local date time> · N numbers" / "Not published yet" / inbound off. */
export const statusLine = (inbound: InboundState): string => {
    const last = inbound.lastPublish;
    if (last && last.skipped === 'inbound_off') {
        return 'Inbound is off — routing not published';
    }
    if (!inbound.publishedAt) return 'Not published yet';
    const when = new Date(inbound.publishedAt);
    const whenText = isNaN(when.getTime()) ? inbound.publishedAt : when.toLocaleString();
    const count = last && last.ok && typeof last.numbersUpdated === 'number'
        ? ' · ' + last.numbersUpdated + (last.numbersUpdated === 1 ? ' number' : ' numbers')
        : '';
    return 'Published ' + whenText + count;
};


interface AssignmentRow {
    phoneSid?: string;
    employeeId?: number | string;
    employeeName?: string;
}

const lower = (s: string): string => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const noStop = (s: string): string => String(s || '').replace(/\.$/, '');

const switchControl = (label: string, value: boolean, onChange: (v: boolean) => void, enabled = true): core.VDom.Node => (
    <component.Switch
        label={label}
        value={value}
        enabled={enabled}
        action={(args: { value?: boolean }): void => { onChange(!!(args && args.value)); }}
    />
) as core.VDom.Node;

const setField = (changes: Partial<InboundState>): void => {
    store.dispatch(Action.inboundFieldChange(changes as never));
};

interface InboundPageState {
    /** "Ring reps in the browser" was switched off: ask once (canvas States). */
    confirmOff: boolean;
}

export default class InboundPage extends PureComponent<PageTickProps, InboundPageState> {
    constructor(props: PageTickProps, context: unknown) {
        super(props, context);
        this.state = { confirmOff: false };
    }

    /** Off asks first: every number hears the no-answer message after the publish. */
    private onMasterSwitch = (on: boolean): void => {
        const inbound = (store.getState() as AppState).inbound;
        if (!on && inbound.inboundEnabled && inbound.saved && inbound.saved.inboundEnabled) {
            this.setState({ confirmOff: true });
            return;
        }
        this.setState({ confirmOff: false });
        setField({ inboundEnabled: on });
    };

    componentDidMount(): void {
        const state = store.getState() as AppState;
        if (!state.inbound.loaded && !state.inbound.loading) loadInbound();
        // Phone status is live data: reload it every time the page opens.
        loadPresence();
        if (!state.health.loaded && !state.health.loading) loadHealth();
    }

    private renderStatusBar(state: AppState): core.VDom.Node {
        const inbound = state.inbound;
        const busy = inbound.saving || inbound.publishing;
        const changes = countInboundChanges(inbound, inbound.saved);
        const sig = state.health.signals.routingChanged;
        const parts: string[] = [];
        if (changes) parts.push(changes + (changes === 1 ? ' unsaved change' : ' unsaved changes'));
        if (sig && (sig.severity === 'warn' || sig.severity === 'problem') && sig.detail) {
            parts.push(parts.length ? lower(noStop(sig.detail)) : noStop(sig.detail));
        }
        if (!parts.length) parts.push(inbound.inboundEnabled ? 'No unsaved changes' : 'Inbound calls are off');
        const tone: Tone = sig && sig.severity === 'problem' ? 'problem'
            : changes || (sig && sig.severity === 'warn') ? 'warn'
            : inbound.inboundEnabled ? 'ok' : 'off';

        const primaryLabel = inbound.saving || inbound.publishing ? 'Publishing…'
            : changes ? 'Save & publish' : 'Publish again';
        const bar = grid('auto minmax(0, 1fr) auto auto', [
            switchControl('Ring reps in the browser', inbound.inboundEnabled && !this.state.confirmOff,
                this.onMasterSwitch, !busy && !this.state.confirmOff),
            dotText(tone, parts.join(' · '), '· ' + statusLine(inbound).replace(/^Published/, 'published')),
            button('Discard', () => { if (inbound.saved) setField(inbound.saved); }, { enabled: changes > 0 && !busy }),
            button(primaryLabel, () => { if (changes) saveInbound(); else publishRouting(); }, {
                primary: true, enabled: !busy
            })
        ], Gap.SPACING4X);

        const errors = (inbound.lastPublish && inbound.lastPublish.errors) || [];
        const failure = publishFailureText(inbound);
        return card([
            bar,
            this.state.confirmOff ? hstack([
                text('Every number will hear the no-answer message after you publish.', { small: true }),
                button('Turn off', () => {
                    this.setState({ confirmOff: false });
                    setField({ inboundEnabled: false });
                }, { small: true }),
                button('Keep on', () => { this.setState({ confirmOff: false }); }, { small: true })
            ], Gap.SPACING2X, { wrap: true }) : null,
            inbound.saveError ? problemCard('Save failed', friendlyError(inbound.saveError) + ' Nothing was published.') : null,
            failure ? errorLine(failure) : null,
            ...errors.map((e) => errorLine((e.phoneNumber ? formatPhone(e.phoneNumber) + ': ' : '') + e.message)),
            !inbound.inboundEnabled && inbound.flowSid ? text(OFF_STILL_ROUTED_WARNING, { strong: true, small: true }) : null,
            !inbound.inboundEnabled && !inbound.flowSid
                ? help('Off: phones do not ring; callers hear the no-answer message.') : null,
            help('Open phones pick up a change within an hour, or at once after a reload.')
        ], { label: 'Inbound status', gap: Gap.SPACING2X });
    }

    private stepRow(n: number, title: string, helpText: string | Child, controls: Child[]): core.VDom.Node {
        return grid('28px 240px minmax(0, 1fr)', [
            stepBadge(n),
            vstack([text(title, { strong: true }), typeof helpText === 'string' ? help(helpText) : helpText], Gap.SPACING1X),
            vstack(controls, Gap.SPACING3X)
        ], Gap.SPACING4X);
    }

    private renderSteps(state: AppState): core.VDom.Node {
        const inbound = state.inbound;
        const ringOptions = RING_SECONDS.indexOf(inbound.ringSeconds) >= 0
            ? RING_SECONDS
            : RING_SECONDS.concat([inbound.ringSeconds]).sort((x, y) => x - y);
        const vmOptions = VOICEMAIL_SECONDS.indexOf(inbound.voicemailMaxSeconds) >= 0
            ? VOICEMAIL_SECONDS
            : VOICEMAIL_SECONDS.concat([inbound.voicemailMaxSeconds]).sort((x, y) => x - y);
        const showNotice = inbound.recordInbound && inbound.recordingNoticeOn;

        // 1. Recording notice
        const recording: Child[] = [
            switchControl('Record inbound calls', inbound.recordInbound, (v) => setField({ recordInbound: v })),
            switchControl('Play a recording notice first', inbound.recordingNoticeOn,
                (v) => setField({ recordingNoticeOn: v }), inbound.recordInbound),
            showNotice ? field('Notice text',
                <component.TextArea
                    text={inbound.recordingNotice}
                    placeholder={DEFAULT_RECORDING_NOTICE}
                    maxLength={RECORDING_NOTICE_MAX_LENGTH}
                    rowCount={2}
                    onTextChanged={(args: { text?: string } | undefined): void => {
                        setField({ recordingNotice: ((args && args.text) || '').slice(0, RECORDING_NOTICE_MAX_LENGTH) });
                    }}
                    rootStyle={{width: '100%'} as never}
                />,
                // The TextArea draws its own n/max counter (maxLength).
                help('Have your legal counsel approve the wording.')) : null
        ];

        // 2. Ring the rep
        const ring: Child[] = [
            field('Ring for',
                <component.Dropdown
                    dataSource={new core.ArrayDataSource(ringOptions.map((n) => ({ value: n, label: n + ' seconds' }))) as never}
                    valueMember="value"
                    displayMember="label"
                    selectedValue={inbound.ringSeconds}
                    onSelectionChanged={(args: { value?: unknown }): void => {
                        const n = Number(args && args.value);
                        if (n > 0) setField({ ringSeconds: n });
                    }}
                    rootStyle={{width: '200px'} as never}
                />)
        ];

        // 3. No answer (+ voicemail)
        const noAnswer: Child[] = [
            field('Message',
                <component.TextArea
                    text={inbound.noAnswerMessage}
                    placeholder={inbound.voicemailOn ? DEFAULT_VOICEMAIL_GREETING : DEFAULT_NO_ANSWER_MESSAGE}
                    maxLength={NO_ANSWER_MAX_LENGTH}
                    rowCount={2}
                    onTextChanged={(args: { text?: string } | undefined): void => {
                        setField({ noAnswerMessage: ((args && args.text) || '').slice(0, NO_ANSWER_MAX_LENGTH) });
                    }}
                    rootStyle={{width: '100%'} as never}
                />),
            hstack([
                switchControl('Take a voicemail', inbound.voicemailOn, (v) => setField({ voicemailOn: v })),
                text('up to', { weak: true, small: true }),
                <component.Dropdown
                    dataSource={new core.ArrayDataSource(vmOptions.map((n) => ({ value: n, label: voicemailLengthLabel(n) }))) as never}
                    valueMember="value"
                    displayMember="label"
                    selectedValue={inbound.voicemailMaxSeconds}
                    enabled={inbound.voicemailOn}
                    ariaLabel="Longest voicemail"
                    onSelectionChanged={(args: { value?: unknown }): void => {
                        const n = Number(args && args.value);
                        if (n > 0) setField({ voicemailMaxSeconds: n });
                    }}
                    rootStyle={{width: '160px'} as never}
                />
            ], Gap.SPACING3X, { wrap: true }),
            help(inbound.voicemailOn
                ? 'After the message, callers can leave a voicemail. It is transcribed and logged as a Phone Call.'
                : 'Off: callers hear the message and the call ends.')
        ];

        // 4. Logged to (fallback owner)
        const ownerChoices = [{ value: '', label: 'Not set' }].concat(
            inbound.employees.map((e) => ({ value: e.id, label: e.name })));
        const nameOfOwner = (id: string): string => (ownerChoices.find((o) => o.value === id) || { label: id }).label;
        const savedOwner = inbound.saved ? inbound.saved.fallbackOwnerId : inbound.fallbackOwnerId;
        const owner: Child[] = [
            field('Owner',
                <component.Dropdown
                    dataSource={new core.ArrayDataSource(ownerChoices) as never}
                    valueMember="value"
                    displayMember="label"
                    selectedValue={inbound.fallbackOwnerId}
                    onSelectionChanged={(args: { value?: unknown }): void => {
                        setField({ fallbackOwnerId: args && args.value != null ? String(args.value) : '' });
                    }}
                    rootStyle={{width: '320px'} as never}
                />),
            !inbound.fallbackOwnerId
                ? dotText('warn', 'Not set: calls and voicemails that reach no rep are not logged.', undefined, { small: true })
                : savedOwner !== inbound.fallbackOwnerId
                    ? dotText('warn', 'Was "' + nameOfOwner(savedOwner) + '"' +
                        (savedOwner ? '' : ': those calls were not logged') + '. Save to apply.', undefined, { small: true })
                    : null,
            help('Also used when a number has no rep, or its rep is inactive.')
        ];

        return card([
            cardTitle('What a caller experiences'),
            help('In call order. Off at the top: every number hears the no-answer message instead.'),
            divider(),
            this.stepRow(1, 'Recording notice', 'Plays before the phone rings.', recording),
            divider(),
            this.stepRow(2, 'Ring the rep', hstack([
                help('The rep under Rings in'),
                button('Phones & reps', () => { goToSection('phones'); }, { link: true, small: true })
            ], Gap.SPACING1X, { wrap: true }), ring),
            divider(),
            this.stepRow(3, 'No answer', 'When the rep does not pick up in time.', noAnswer),
            divider(),
            this.stepRow(4, 'Logged to', 'Owner of calls and voicemails that reach no rep.', owner)
        ], { label: 'What a caller experiences', gap: Gap.SPACING3X });
    }

    private routingColumns(state: AppState): Array<Column<InboundRoute>> {
        const presence = state.presence;
        const byEmployee: Record<string, PresenceRow> = {};
        presence.items.forEach((p) => { byEmployee[p.employeeId] = p; });
        const nowMs = Date.now() + presence.clockSkewMs;
        const also: Record<string, string[]> = {};
        ((state.console.assignments || []) as AssignmentRow[]).forEach((a) => {
            if (!a.phoneSid) return;
            (also[a.phoneSid] = also[a.phoneSid] || []).push(String(a.employeeId) + '|' + (a.employeeName || ''));
        });
        return [
            { name: 'number', label: 'Number', stretch: 3, cell: (r) => text(formatPhone(r.phoneNumber), { strong: true }) },
            { name: 'rings', label: 'Rings', stretch: 3, cell: (r) => text(r.employeeName || '') },
            { name: 'also', label: 'Also assigned', stretch: 3, cell: (r) => {
                if (state.console.assignments === null) return text('—', { weak: true });
                const names = (also[r.phoneSid] || [])
                    .filter((v) => v.split('|')[0] !== String(r.employeeId))
                    .map((v) => v.split('|').slice(1).join('|'))
                    .filter(Boolean);
                return names.length ? text(names.join(', ')) : text('—', { weak: true });
            } },
            { name: 'phone', label: 'Rep\'s phone', stretch: 4, cell: (r) => {
                if (!presence.loaded) return text(presence.error ? '—' : 'Loading…', { weak: true });
                const id = r.employeeId;
                const p = id == null ? undefined : byEmployee[String(id)];
                const st = presenceTone(p);
                return dotText(st.tone, st.label, '· ' + relativeTime(p ? p.lastSeen : '', nowMs).toLowerCase());
            } }
        ];
    }

    private renderRouting(state: AppState): core.VDom.Node {
        const inbound = state.inbound;
        const sig = state.health.signals.routingChanged;
        const since = !sig ? (state.health.loading ? 'Checking…' : 'Not checked')
            : sig.severity === 'ok' ? 'No change: ' + lower(sig.detail)
            : sig.detail;
        const sinceTone: Tone = !sig || sig.severity === 'unknown' ? 'off'
            : sig.severity === 'ok' ? 'ok' : sig.severity === 'problem' ? 'problem' : 'warn';
        return card([
            grid('minmax(0, 1fr) auto', [
                cardTitle('Routing'),
                button('Change in Phones & reps', () => { goToSection('phones'); }, { link: true, small: true })
            ], Gap.SPACING3X),
            hstack([text('Since last publish:', { weak: true, small: true }), dotText(sinceTone, since, undefined, { small: true })],
                Gap.SPACING2X, { wrap: true }),
            inbound.routes.length === 0
                ? text('No numbers have reps yet. Assign reps on Phones & reps.', { weak: true })
                : table<InboundRoute>(inbound.routes, this.routingColumns(state))
        ], { label: 'Routing' });
    }

    render(): core.VDom.Node {
        const state = store.getState() as AppState;
        const inbound = state.inbound;
        const header = pageHeader('Inbound calls', 'How calls to your Twilio numbers reach reps.');

        if (inbound.loading || (!inbound.loaded && !inbound.loadError)) {
            return vstack([
                header,
                card([skeleton('lines', 2, 'Loading inbound settings…')]),
                card([skeleton('lines', 6)]),
                card([skeleton('table', 3)])
            ], Gap.SPACING4X);
        }
        if (!inbound.loaded) {
            return vstack([header, problemCard('Couldn\'t load inbound settings',
                friendlyError(inbound.loadError || 'Could not load inbound settings') + ' Nothing was changed.', [
                    button('Retry', () => { loadInbound(); }, { primary: true, small: true }),
                    button('Check the connection', () => { goToSection('account'); }, { link: true, small: true })
                ])], Gap.SPACING4X);
        }
        return vstack([
            header,
            this.renderStatusBar(state),
            this.renderSteps(state),
            this.renderRouting(state)
        ], Gap.SPACING4X);
    }
}
