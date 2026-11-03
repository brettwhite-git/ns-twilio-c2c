/**
 * Transcripts & AI page (#/transcripts). Canvas: Transcripts.dc.html.
 *
 *   Transcription · Twilio       Intelligence service (Change: the shared
 *                                voiceField editor, moved here from Voice),
 *                                auto-transcribe (signal intelligence),
 *                                recordings.
 *   AI analysis · NetSuite N/llm "<n> AI analyses left" (signal aiQuota;
 *                                no total and no reset date: NetSuite
 *                                reports only the requests left).
 *   Transcript backlog           signal transcriptBacklog (last 7 days).
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
import {CALL_CENTRAL_URL, agoParts, jobTone, runStatusText} from '../shared/consoleModel';
import type {BacklogValue, IntelligenceValue, JobRuns, PollerRunsValue, Tone} from '../shared/consoleModel';
import {
    button, card, cardTitle, chip, divider, dotText, errorLine, extLink, grid, help, metric, pageHeader,
    skeleton, text, vstack, Gap
} from '../shared/ui';
import type {Child} from '../shared/ui';
import {healthCheckAside} from './HealthPage';

interface BacklogRow {
    status: string;
    tone: 'neutral' | 'info' | 'problem';
    count: number;
    next: string;
    link?: boolean;
}

interface CellArgs {
    cell?: { row?: { dataItem?: BacklogRow } };
}

/** The backlog table rows (canvas copy), from the transcriptBacklog value. */
export function backlogRows(v: BacklogValue): BacklogRow[] {
    return [
        { status: 'Logged', tone: 'neutral', count: v.logged,
          next: 'Waiting for Twilio\'s transcript. Checked every 15 minutes; closed as "No transcript" after 24 hours.' },
        { status: 'Processing', tone: 'info', count: v.processing,
          next: 'Being summarised now. A summary that stalls for 30 minutes is retried, up to 3 times.' },
        { status: 'Failed', tone: 'problem', count: v.failed, link: true,
          next: 'Summary failed 3 times. The transcript is kept; the call is not retried again.' },
        { status: 'No transcript', tone: 'neutral', count: v.noTranscript,
          next: 'Closed: no recording, or Twilio produced no transcript within 24 hours. Logged as calls without a summary.' },
        { status: 'Recording cleanup due', tone: 'neutral', count: v.cleanupPending,
          next: 'Recordings Twilio did not delete on the first try. Retried on the next run.' }
    ];
}

/** A key/value row (canvas `.kv`): label | value + help | action. */
const kv = (label: string, value: Child, action: Child = null): core.VDom.Node =>
    grid('150px minmax(0, 1fr) auto', [text(label, { strong: true, small: true }), value, action || text('')],
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
        return card([
            cardTitle('AI analysis · NetSuite N/llm'),
            n !== null ? metric(n.toLocaleString(), n === 1 ? 'AI analysis left' : 'AI analyses left') : pending,
            n !== null && tone !== 'ok' ? dotText(tone, sig ? sig.detail : '') : null,
            help('Read live with llm.getRemainingUsage(): the N/llm requests the account has left (one per analysed call). This is not script governance units.'),
            help('Below 10, calls are still transcribed by Twilio but not analysed until more requests are available. Analysis runs in NetSuite with N/llm (Cohere Command A), not in Twilio; no extra licence.')
        ], { label: 'AI analysis', fill: true });
    }

    private backlogColumns(): unknown[] {
        const CT = (component.DataGrid as unknown as { ColumnType: Record<string, unknown> }).ColumnType;
        const row = (args: CellArgs): BacklogRow | undefined => args?.cell?.row?.dataItem;
        return [
            { type: CT.TEMPLATED, name: 'status', label: 'Status', stretchFactor: 3,
              content: (args: CellArgs): unknown => { const r = row(args); return r ? chip(r.status, r.tone) : text(''); } },
            { type: CT.TEMPLATED, name: 'calls', label: 'Calls', stretchFactor: 1,
              content: (args: CellArgs): unknown => text(String(row(args)?.count ?? '')) },
            { type: CT.TEMPLATED, name: 'next', label: 'What happens next', stretchFactor: 8,
              content: (args: CellArgs): unknown => text(row(args)?.next || '', { small: true }) },
            { type: CT.TEMPLATED, name: 'link', label: '', stretchFactor: 3,
              content: (args: CellArgs): unknown => {
                  const r = row(args);
                  return r && r.link && r.count > 0 ? extLink('Open in Call Central', CALL_CENTRAL_URL) : text('');
              } }
        ];
    }

    private renderBacklog(state: AppState): core.VDom.Node {
        const sig = signalOf(state, 'transcriptBacklog');
        const v = (sig && sig.value) as BacklogValue | null;
        const open = v ? v.logged + v.processing + v.failed : 0;
        const body: Child[] = [
            grid('minmax(0, 1fr) auto', [
                cardTitle('Transcript backlog'),
                v ? help(open + (open === 1 ? ' call' : ' calls') + ' in progress · last ' + (v.windowDays || 7) + ' days') : null
            ], Gap.SPACING3X)
        ];
        if (!v) {
            body.push(this.signalState(state, sig));
        } else {
            if (sig && sig.severity === 'problem') body.push(dotText('problem', sig.detail));
            body.push(new component.DataGrid({
                dataSource: new core.ArrayDataSource(backlogRows(v)),
                columns: this.backlogColumns(),
                columnStretch: true,
                highlightRowsOnHover: true,
                dataRowHeight: 56,
                headerRowHeight: 40,
                rootStyle: { width: '100%' }
            } as never));
        }
        return card(body, { label: 'Transcript backlog' });
    }

    private jobRow(label: string, j: JobRuns | undefined, helpText: string): core.VDom.Node {
        let status: Child;
        if (!j || !j.lastStatus || j.minutesSinceLastRun === null) {
            status = dotText('off', j && j.lastStatus ? runStatusText(j.lastStatus) : 'No run yet');
        } else {
            const ago = agoParts(j.minutesSinceLastRun);
            status = dotText(jobTone(j), runStatusText(j.lastStatus) + ' ' + ago.value + ' ' + ago.unit,
                j.failedRecent > 0 ? '· ' + j.failedRecent + ' recent ' + (j.failedRecent === 1 ? 'run' : 'runs') + ' failed' : '');
        }
        return grid('200px minmax(0, 1fr)', [text(label, { strong: true, small: true }),
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
