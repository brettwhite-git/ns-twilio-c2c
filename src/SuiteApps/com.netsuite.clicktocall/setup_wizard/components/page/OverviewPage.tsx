/**
 * Overview page (#/overview) — canvas Main.dc.html.
 *
 *   Header           "Overview" · "Click-to-Call · N numbers · N reps"
 *   Status card      Active / Paused, one line from the config and the
 *                    last preflight; Pause calling (confirm) / Resume.
 *   Four KPI cards   UIF Card.metric, each opens its page:
 *                    Numbers routed (numberRouting), Reps receiving now
 *                    (repPhones), Waiting for transcripts
 *                    (transcriptBacklog), Missed-call sync (pollerRuns).
 *   Call Central     link to the Reporting Central Suitelet.
 *   Needs attention  wizardLoadHealth `attention` (problem, then warn;
 *                    unknown never listed): title, detail, action button
 *                    (opens the page in the app). Empty: "Nothing needs
 *                    attention."
 * The health signals reload every time the page opens.
 */

import {PureComponent} from '@uif-js/core';
import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {loadHealth} from '../../app/effects/health';
import {goToSection} from '../../app/effects/navigation';
import type {AppState, CheckResult, HealthAttentionItem, SectionName} from '../../app/InitialState';
import type {PageTickProps} from '../../App';
import {friendlyError} from '../shared/friendlyError';
import {PauseControl} from '../shared/PauseControl';
import {relativeTime} from '../shared/phoneStatus';
import {
    CALL_CENTRAL_URL, backlogKpi, missedCallSyncKpi, numbersRoutedKpi, repsReceivingKpi, timeOfDay
} from '../shared/consoleModel';
import type {
    BacklogValue, KpiView, NumberRoutingValue, PollerRunsValue, RepPhonesValue, Tone
} from '../shared/consoleModel';
import {
    button, card, cardTitle, chip, divider, dot, dotText, errorLine, extLink, grid, help, hstack,
    pageHeader, skeleton, text, vstack, Gap
} from '../shared/ui';
import type {Child} from '../shared/ui';
import {openHealthAction} from './HealthPage';

interface AssignmentRow {
    phoneSid?: string;
    employeeId?: number | string;
}

const PENDING: KpiView = { metric: '…', metadata: '', tone: null, text: 'Checking…' };

/** Status card line: what reps can do, the Twilio check and its time. */
export function statusLine(active: boolean | undefined, inboundOn: boolean | null,
    checks: CheckResult[] | null, at: string, running: boolean, failed: boolean): string {
    if (active === false) return 'Reps cannot place or receive calls until you resume.';
    const can = inboundOn === false ? 'Reps can place calls; inbound calls are off.' : 'Reps can place and receive calls.';
    if (running) return can + ' Running checks…';
    if (failed || !checks) return can + (failed ? ' The checks did not run.' : '');
    const passed = checks.filter((c) => c.status === 'pass').length;
    const twilio = checks.find((c) => c.id === 'twilio_reachable');
    const parts: string[] = [];
    if (twilio) parts.push(twilio.status === 'pass' ? 'Twilio connected' : 'Twilio not reachable');
    const when = timeOfDay(at);
    parts.push((passed === checks.length ? 'checks passed' : passed + ' of ' + checks.length + ' checks passed') +
        (when ? ' at ' + when : ''));
    return can + ' ' + parts.join(' · ') + '.';
}

export default class OverviewPage extends PureComponent<PageTickProps, unknown> {
    componentDidMount(): void {
        loadHealth();
    }

    private kpiCard(title: string, kpi: KpiView, section: SectionName): unknown {
        const description = kpi.tone
            ? dotText(kpi.tone, kpi.text, undefined, { small: true })
            : text(kpi.text, { weak: true, small: true });
        try {
            return (component.Card as unknown as { metric: (o: object) => unknown }).metric({
                title,
                metric: kpi.metric,
                metadata: kpi.metadata,
                description,
                action: (): void => { goToSection(section); },
                cardOptions: { classList: ['ctc-card'] }
            });
        } catch (e) {
            // Card.metric missing in this UIF build: the same content in a plain card.
            return card([text(title, { weak: true, small: true }), text(kpi.metric + ' ' + kpi.metadata, { strong: true }),
                description, button('Open', () => { goToSection(section); }, { small: true, link: true })]);
        }
    }

    private renderStatus(state: AppState): core.VDom.Node {
        const c = state.console;
        const snap = (c.snapshot || {}) as { active?: boolean };
        const routing = state.health.signals.routingChanged;
        const inboundOn = routing && routing.value
            ? (routing.value as { inboundEnabled?: boolean }).inboundEnabled === true : null;
        const tone: Tone = snap.active === false ? 'warn' : snap.active === true ? 'ok' : 'off';
        const title = snap.active === false ? 'Paused' : snap.active === true ? 'Active' : 'Unknown';
        const running = !!c.preflightRefreshing || (c.loading && c.preflight === null);
        return card([
            grid('auto minmax(0, 1fr) auto', [
                dot(tone),
                vstack([
                    new component.Text({ text: title, size: component.Text.Size.L, weight: component.Text.Weight.BOLD } as never),
                    text(statusLine(snap.active, inboundOn, c.preflight as CheckResult[] | null, c.preflightAt,
                        running, !!c.preflightError), { weak: true, small: true })
                ], Gap.SPACING1X),
                <PauseControl tick={this.props.tick} />
            ], Gap.SPACING3X)
        ], { label: 'Status' });
    }

    private renderKpis(state: AppState): core.VDom.Node {
        const h = state.health;
        const value = <T,>(key: string): T | null => {
            const s = h.signals[key];
            return s && s.value ? s.value as T : null;
        };
        const waiting = !h.loaded && (h.loading || !h.error);
        const nowMs = Date.now() + state.presence.clockSkewMs;
        const kpi = (v: KpiView): KpiView => (waiting ? PENDING : v);
        return grid('repeat(4, minmax(0, 1fr))', [
            this.kpiCard('Numbers routed', kpi(numbersRoutedKpi(value<NumberRoutingValue>('numberRouting'))), 'phones'),
            this.kpiCard('Reps receiving now',
                kpi(repsReceivingKpi(value<RepPhonesValue>('repPhones'), (iso) => relativeTime(iso, nowMs))), 'health'),
            this.kpiCard('Waiting for transcripts', kpi(backlogKpi(value<BacklogValue>('transcriptBacklog'))), 'transcripts'),
            this.kpiCard('Missed-call sync', kpi(missedCallSyncKpi(value<PollerRunsValue>('pollerRuns'))), 'transcripts')
        ], Gap.SPACING3X, { stretch: true });
    }

    private renderCallCentral(): core.VDom.Node {
        return card([
            grid('auto minmax(0, 1fr) auto', [
                new component.Image({
                    image: core.SystemIcon.CHART_BAR,
                    size: component.Image.Size.M,
                    color: core.ImageConstant.Color.INFO,
                    presentation: true
                } as never),
                vstack([
                    text('Call Central', { strong: true }),
                    text('Calls, follow-ups and missed calls for the whole team. Reps see their own view from the dashboard.',
                        { weak: true, small: true })
                ], Gap.SPACING1X),
                extLink('Open Call Central', CALL_CENTRAL_URL)
            ], Gap.SPACING3X)
        ], { label: 'Call Central' });
    }

    private attentionRow(item: HealthAttentionItem, first: boolean): core.VDom.Node {
        const action = item.action;
        return grid('20px minmax(0, 1fr) auto', [
            dot(item.severity === 'problem' ? 'problem' : 'warn'),
            vstack([text(item.title, { strong: true }), item.detail ? help(item.detail) : null], Gap.SPACING1X),
            action ? button(action.label, () => { openHealthAction(action); }, { small: true, primary: first }) : null
        ], Gap.SPACING3X);
    }

    private renderAttention(state: AppState): core.VDom.Node {
        const h = state.health;
        const items = h.attention.filter((i) => i.severity === 'problem' || i.severity === 'warn');
        const when = timeOfDay(h.checkedAt);
        const header = hstack([
            cardTitle('Needs attention'),
            h.loaded && items.length ? chip(String(items.length), 'warn') : null,
            when ? help((h.loading ? 'Checking… · updated ' : 'Updated ') + when) : (h.loading ? help('Checking…') : null)
        ], Gap.SPACING2X, { growLast: true });
        const body: Child[] = [header];
        if (!h.loaded) {
            if (h.error) {
                body.push(errorLine('The health checks did not load: ' + friendlyError(h.error)));
                body.push(hstack([
                    button('Retry', () => { loadHealth(); }, { primary: true, small: true }),
                    button('Check the connection', () => { goToSection('account'); }, { link: true, small: true })
                ], Gap.SPACING2X));
            } else {
                body.push(skeleton('lines', 3, 'Checking…'));
            }
        } else if (!items.length) {
            body.push(text('Nothing needs attention.', { weak: true }));
        } else {
            items.forEach((item, i) => {
                body.push(divider());
                body.push(this.attentionRow(item, i === 0));
            });
        }
        if (h.loaded && h.error) body.push(errorLine('The last check did not finish: ' + friendlyError(h.error)));
        return card(body, { label: 'Needs attention', gap: Gap.SPACING2X });
    }

    render(): core.VDom.Node {
        const state = store.getState() as AppState;
        const assignments = state.console.assignments as AssignmentRow[] | null;
        let subtitle = 'Click-to-Call';
        if (assignments) {
            const phones: Record<string, boolean> = {};
            const reps: Record<string, boolean> = {};
            assignments.forEach((a) => {
                if (a.phoneSid) phones[a.phoneSid] = true;
                if (a.employeeId != null) reps[String(a.employeeId)] = true;
            });
            const n = Object.keys(phones).length;
            const r = Object.keys(reps).length;
            subtitle += ' · ' + n + (n === 1 ? ' number' : ' numbers') + ' · ' + r + (r === 1 ? ' rep' : ' reps');
        }
        return vstack([
            pageHeader('Overview', subtitle),
            this.renderStatus(state),
            this.renderKpis(state),
            this.renderCallCentral(),
            this.renderAttention(state)
        ], Gap.SPACING4X);
    }
}
