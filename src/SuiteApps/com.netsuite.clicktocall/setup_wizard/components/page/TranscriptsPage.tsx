/**
 * Transcripts & AI page (#/transcripts). Canvas: Transcripts.dc.html.
 *
 *   Transcription · Twilio       Intelligence service (Change: the shared
 *                                voiceField editor, moved here from Voice),
 *                                auto-transcribe (signal intelligence),
 *                                recordings.
 *   AI analysis · NetSuite N/llm "<n> AI analyses left" + UIF MeterBar
 *                                (aiMeter: scaled to left + this month's
 *                                Click-to-Call analyses; NetSuite reports
 *                                no total and no reset date).
 *   Transcript backlog           signal transcriptBacklog (last 7 days): a
 *                                primer, then one row per status; chip
 *                                colour by meaning (consoleModel
 *                                BACKLOG_STATUS_TONE); a zero count is muted.
 *   Background jobs              signal pollerRuns (last run, status).
 * "Check now" reloads the health signals.
 */

import {PureComponent} from '@uif-js/core';
import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {loadHealth} from '../../app/effects/health';
import type {AppState, HealthSignal} from '../../app/InitialState';
import type {PageTickProps} from '../../App';
import {friendlyError} from '../shared/friendlyError';
import {VOICE_FIELD_SPECS, voiceActionControl, voiceValueControl} from '../shared/voiceField';
import {BACKLOG_PRIMER, CALL_CENTRAL_URL, agoParts, aiMeter, backlogRows, jobTone, runStatusText} from '../shared/consoleModel';
import type {BacklogRow, BacklogValue, IntelligenceValue, JobRuns, PollerRunsValue, Tone} from '../shared/consoleModel';
import {
    button, card, cardTitle, chip, divider, dotText, errorLine, extLink, grid, help, label, metric, num, pageHeader,
    skeleton, table, text, vstack, Gap, ROW_TWO_LINES
} from '../shared/ui';
import type {Child} from '../shared/ui';
import {healthCheckAside} from './HealthPage';

const METER_COLOR = {
    ok: component.MeterBar.Color.SUCCESS,
    warn: component.MeterBar.Color.WARNING,
    problem: component.MeterBar.Color.ERROR
};

/** A key/value row (canvas `.kv`): label | value + help | action. */
const kv = (name: string, value: Child, action: Child = null): core.VDom.Node =>
    grid('150px minmax(0, 1fr) auto', [label(name), value, action || text('')],
        Gap.SPACING4X);

const signalOf = (state: AppState, key: string): HealthSignal | undefined => state.health.signals[key];

export default class TranscriptsPage extends PureComponent<PageTickProps, unknown> {
    componentDidMount(): void {
        const h = (store.getState() as AppState).health;
        if (!h.loaded && !h.loading) loadHealth();
    }

    /** Loading / error / unknown line for a signal-backed section; null when the value is there. */
    private signalState(state: AppState, sig: HealthSignal | undefined): Child | null {
        const h = state.health;
        if (sig && sig.value) return null;
        if (h.loading && !h.loaded) return skeleton('lines', 3, 'Checking…');
        if (h.error && !sig) {
            return vstack([
                errorLine('Not checked: ' + friendlyError(h.error)),
                button('Retry', () => { loadHealth(); }, { primary: true, small: true })
            ], Gap.SPACING2X);
        }
        return text(sig ? sig.detail : 'Not checked yet.', { weak: true });
    }

    private renderTranscription(state: AppState): core.VDom.Node {
        const c = state.console;
        const sig = signalOf(state, 'intelligence');
        const v = (sig && sig.value) as IntelligenceValue | null;
        const spec = VOICE_FIELD_SPECS.intelServiceSid;
        const auto: { tone: Tone; label: string } = !v || !v.serviceSid ? { tone: 'off', label: 'No service' }
            : v.autoTranscribe === true ? { tone: 'ok', label: 'On' }
            : v.autoTranscribe === false ? { tone: 'problem', label: 'Off' }
            : { tone: 'off', label: 'Not checked' };
        const rows: Child[] = [
            cardTitle('Transcription · Twilio'),
            kv('Service', vstack([
                voiceValueControl(spec, v && v.friendlyName ? v.friendlyName : undefined),
                help('Twilio Conversational Intelligence, in your Twilio account.')
            ], Gap.SPACING1X), voiceActionControl(spec)),
            divider(),
            kv('Auto-transcribe', vstack([
                dotText(auto.tone, auto.label),
                help('Twilio transcribes every recording in the account, voicemails included. Off would stop all transcripts.'),
                sig && sig.severity !== 'ok' && sig.detail ? text(sig.detail, { small: true }) : null
            ], Gap.SPACING1X)),
            divider(),
            kv('Recordings', vstack([
                text('Deleted from Twilio after the transcript is saved in NetSuite.'),
                help('Outbound calls are always recorded. Inbound recording is set under Inbound calls.')
            ], Gap.SPACING1X))
        ];
        if (c.voiceError) rows.push(errorLine(friendlyError(c.voiceError)));
        return card(rows, { label: 'Transcription', fill: true, gap: Gap.SPACING2X });
    }

    private renderAi(state: AppState): core.VDom.Node {
        const sig = signalOf(state, 'aiQuota');
        const n = sig && typeof sig.value === 'number' ? sig.value as number : null;
        const tone: Tone = !sig ? 'off' : sig.severity === 'problem' ? 'problem' : sig.severity === 'warn' ? 'warn' : 'ok';
        const pending = this.signalState(state, sig);
        const backlog = state.health.signals.transcriptBacklog;
        const meter = aiMeter(n, backlog ? (backlog.value as BacklogValue | null) : null, Date.now());
        return card([
            cardTitle('AI analysis · NetSuite N/llm'),
            n !== null ? metric(n.toLocaleString(), n === 1 ? 'AI analysis left' : 'AI analyses left') : pending,
            meter ? new component.MeterBar({
                value: meter.value,
                min: 0,
                max: meter.max,
                readOnly: true,
                plotAreaSize: component.MeterBar.Size.MEDIUM,
                indicatorBarSize: component.MeterBar.Size.MEDIUM,
                indicatorBarColor: METER_COLOR[meter.tone],
                rootStyle: { width: '100%' }
            } as never) : null,
            meter ? grid('minmax(0, 1fr) auto', [help(meter.usedText), help(meter.runwayText)], Gap.SPACING3X) : null,
            n !== null && tone !== 'ok' ? dotText(tone, sig ? sig.detail : '') : null,
            help('NetSuite reports only the requests left, not a total, so the bar is scaled to what is left plus ' +
                'what Click-to-Call used this month. Other scripts that use N/llm draw from the same requests. ' +
                'One request per analysed call; this is not script governance units.'),
            help('Below 10 left, calls are still transcribed but not analysed until more requests are available. ' +
                'Analysis runs in NetSuite with N/llm (Cohere Command A), not in Twilio.')
        ], { label: 'AI analysis', fill: true });
    }

    private renderBacklog(state: AppState): core.VDom.Node {
        const sig = signalOf(state, 'transcriptBacklog');
        const v = (sig && sig.value) as BacklogValue | null;
        const open = v ? v.logged + v.processing + v.failed : 0;
        const body: Child[] = [
            grid('minmax(0, 1fr) auto', [
                cardTitle('Transcript backlog'),
                v ? help(open + (open === 1 ? ' call' : ' calls') + ' in progress · last ' + (v.windowDays || 7) + ' days') : null
            ], Gap.SPACING3X),
            help(BACKLOG_PRIMER)
        ];
        if (!v) {
            body.push(this.signalState(state, sig));
        } else {
            if (sig && sig.severity === 'problem') body.push(dotText('problem', sig.detail));
            body.push(table<BacklogRow>(backlogRows(v), [
                { name: 'status', label: 'Status', stretch: 3, cell: (r) => chip(r.status, r.tone) },
                { name: 'calls', label: 'Calls', stretch: 1, numeric: true, cell: (r) => num(r.count, { muteZero: true }) },
                { name: 'next', label: 'What happens next', stretch: 8, cell: (r) => help(r.next) },
                { name: 'link', label: '', stretch: 3,
                  cell: (r) => (r.link && r.count > 0 ? extLink('Open in Call Central', CALL_CENTRAL_URL) : text('')) }
            ], { rowHeight: ROW_TWO_LINES }));
        }
        return card(body, { label: 'Transcript backlog' });
    }

    private jobRow(name: string, j: JobRuns | undefined, helpText: string): core.VDom.Node {
        let status: Child;
        if (!j || !j.lastStatus || j.minutesSinceLastRun === null) {
            status = dotText('off', j && j.lastStatus ? runStatusText(j.lastStatus) : 'No run yet');
        } else {
            const ago = agoParts(j.minutesSinceLastRun);
            status = dotText(jobTone(j), runStatusText(j.lastStatus) + ' ' + ago.value + ' ' + ago.unit,
                j.failedRecent > 0 ? '· ' + j.failedRecent + ' recent ' + (j.failedRecent === 1 ? 'run' : 'runs') + ' failed' : '');
        }
        return grid('200px minmax(0, 1fr)', [label(name),
            vstack([status, help(helpText)], Gap.SPACING1X)], Gap.SPACING4X);
    }

    private renderJobs(state: AppState): core.VDom.Node {
        const sig = signalOf(state, 'pollerRuns');
        const v = (sig && sig.value) as PollerRunsValue | null;
        const body: Child[] = [cardTitle('Background jobs')];
        if (!v) {
            body.push(this.signalState(state, sig));
        } else {
            body.push(this.jobRow('Transcript check', v.transcripts,
                'Every 15 minutes. Also retries failed saves and deletes finished recordings.'));
            body.push(divider());
            body.push(this.jobRow('Missed-call sync', v.reconcile,
                'Every 15 minutes. Logs calls that rang no rep (missed, too short, no answer, voicemail) so Call Central is complete.'));
            if (sig && sig.severity !== 'ok' && sig.detail) body.push(dotText(sig.severity === 'problem' ? 'problem' : 'warn', sig.detail));
        }
        return card(body, { label: 'Background jobs', gap: Gap.SPACING2X });
    }

    render(): core.VDom.Node {
        const state = store.getState() as AppState;
        return vstack([
            pageHeader('Transcripts & AI',
                'Twilio transcribes the calls. NetSuite (N/llm) does the AI analysis: summary, satisfaction, tone and follow-ups. Below: both, and the background jobs that connect them.',
                healthCheckAside()),
            grid('minmax(0, 3fr) minmax(0, 2fr)', [this.renderTranscription(state), this.renderAi(state)],
                Gap.SPACING3X, { stretch: true }),
            this.renderBacklog(state),
            this.renderJobs(state)
        ], Gap.SPACING4X);
    }
}
