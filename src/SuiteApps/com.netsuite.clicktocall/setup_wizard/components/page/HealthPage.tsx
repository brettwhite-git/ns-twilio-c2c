/**
 * Health page (#/health) — canvas Health.dc.html.
 *
 *   Header        "Last run <time>" + Run checks (preflight, health
 *                 signals, rep phones and the outbound status again)
 *   Setup checks  wizardRunPreflight rows (Check · Result · Status), "N of M pass"
 *   Drift checks  NetSuite vs. live Twilio (HealthChecks.ts row builders +
 *                 the routingChanged signal), "N needs action"
 *   Rep phones    wizardLoadPresence: Rep, Status, Last seen, Browser,
 *                 Incoming calls, Last error; Refresh
 *   Versions      the versions the console can read (dial function code,
 *                 live notice version)
 */

import {PureComponent} from '@uif-js/core';
import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {loadHealth} from '../../app/effects/health';
import {loadPresence} from '../../app/effects/presence';
import {loadOutbound} from '../../app/effects/outbound';
import {rerunPreflight} from '../../app/effects/console';
import {goToSection, parseHash} from '../../app/effects/navigation';
import type {AppState, HealthAction, PresenceRow} from '../../app/InitialState';
import type {PageTickProps} from '../../App';
import {
    intelDriftRow, outboundVersionRow, phoneNumbersDriftRow, signalRow, statusToBadge, voiceUrlDriftRow
} from './HealthChecks';
import type {CheckItem} from './HealthChecks';
import {friendlyError} from '../shared/friendlyError';
import {exactTime, relativeTime} from '../shared/phoneStatus';
import {timeOfDay} from '../shared/consoleModel';
import {
    button, card, cardTitle, chip, dotText, errorLine, grid, help, hstack, pageHeader, problemCard, skeleton,
    text, vstack, Gap
} from '../shared/ui';
import type {Child} from '../shared/ui';
import {presenceTone} from './PhonesPage';

/** Open the console page a health action names ('#/inbound', ...). */
export const openHealthAction = (action: HealthAction): void => {
    const r = parseHash(action.route);
    if (r && r.kind === 'section') goToSection(r.section);
};

/** "Checked 10:14 AM" + Check now (reload the health signals) — Transcripts & AI header. */
export function healthCheckAside(): unknown[] {
    const h = (store.getState() as AppState).health;
    const when = timeOfDay(h.checkedAt);
    return [
        when ? text('Checked ' + when, { weak: true, small: true }) : null,
        button(h.loading ? 'Checking…' : 'Check now', () => { loadHealth(); }, {
            enabled: !h.loading, icon: core.SystemIcon.REFRESH
        })
    ];
}

/** Run every Health check again. */
export function runAllChecks(): void {
    rerunPreflight();
    loadHealth();
    loadPresence();
    loadOutbound();
}

interface Row extends CheckItem {
    /** In-app page the row links to. */
    link?: HealthAction;
}

interface CellArgs<T> {
    cell?: { row?: { dataItem?: T } };
}

const CT = (): Record<string, unknown> =>
    (component.DataGrid as unknown as { ColumnType: Record<string, unknown> }).ColumnType;

function checkGrid(rows: Row[]): unknown {
    const row = (args: CellArgs<Row>): Row | undefined => args?.cell?.row?.dataItem;
    return new component.DataGrid({
        dataSource: new core.ArrayDataSource(rows),
        columns: [
            { type: CT().TEMPLATED, name: 'check', label: 'Check', stretchFactor: 4,
              content: (args: CellArgs<Row>): unknown => text(row(args)?.label || '(unlabeled check)') },
            { type: CT().TEMPLATED, name: 'result', label: 'Result', stretchFactor: 5,
              content: (args: CellArgs<Row>): unknown => {
                  const r = row(args);
                  const link = r && r.link;
                  return vstack([
                      text(r?.detail || '—', { weak: true, small: true }),
                      link ? button(link.label, () => { openHealthAction(link); }, { link: true, small: true }) : null
                  ], Gap.NONE);
              } },
            { type: CT().TEMPLATED, name: 'status', label: 'Status', stretchFactor: 2,
              content: (args: CellArgs<Row>): unknown => {
                  const b = statusToBadge(row(args)?.status || 'unknown');
                  return chip(b.text, b.tone);
              } }
        ],
        columnStretch: true,
        highlightRowsOnHover: true,
        dataRowHeight: 64,
        headerRowHeight: 40,
        rootStyle: { width: '100%' }
    } as never);
}

export default class HealthPage extends PureComponent<PageTickProps, unknown> {
    componentDidMount(): void {
        loadPresence();
        loadHealth();
        const outbound = (store.getState() as AppState).outbound;
        if (!outbound.loaded && !outbound.loading) loadOutbound();
    }

    private renderSetup(state: AppState): core.VDom.Node {
        const c = state.console;
        const checks = c.preflight as CheckItem[] | null;
        const running = !!c.preflightRefreshing || (c.loading && checks === null);
        const passed = (checks || []).filter((ch) => ch.status === 'pass').length;
        const total = (checks || []).length;
        const body: Child[] = [
            hstack([
                cardTitle('Setup checks'),
                total ? chip(passed + ' of ' + total + ' pass', passed === total ? 'ok'
                    : (checks || []).some((ch) => ch.status === 'fail') ? 'problem' : 'warn') : null
            ], Gap.SPACING2X)
        ];
        if (c.preflightError) body.push(errorLine('The checks did not run: ' + friendlyError(c.preflightError)));
        if (checks === null) body.push(running ? skeleton('table', 5, 'Running checks…') : help('Click Run checks.'));
        else if (!checks.length) body.push(text('No checks returned.', { weak: true }));
        else body.push(checkGrid(checks));
        return card(body, { label: 'Setup checks' });
    }

    private renderDrift(state: AppState): core.VDom.Node {
        const c = state.console;
        const routing = signalRow('Inbound routing matches Phones & reps', state.health.signals.routingChanged);
        const rows: Row[] = [
            voiceUrlDriftRow((c.drift || {}) as { voiceUrl?: string }, state.outbound),
            outboundVersionRow(state.outbound),
            phoneNumbersDriftRow(c, state.health),
            intelDriftRow(c, state.health),
            routing
                ? { ...routing, link: { label: 'Inbound calls', route: '#/inbound' } }
                : { label: 'Inbound routing matches Phones & reps', status: 'unknown', detail: '' }
        ];
        const needs = rows.filter((r) => r.status === 'fail' || r.status === 'warn').length;
        return card([
            hstack([
                cardTitle('Drift checks'),
                chip(needs ? needs + ' needs action' : 'All match', needs ? 'warn' : 'ok'),
                help('NetSuite vs. live Twilio')
            ], Gap.SPACING2X, { wrap: true }),
            state.health.error ? errorLine('Some checks did not load: ' + friendlyError(state.health.error)) : null,
            checkGrid(rows)
        ], { label: 'Drift checks' });
    }

    private renderPhones(state: AppState): core.VDom.Node {
        const presence = state.presence;
        const nowMs = Date.now() + presence.clockSkewMs;
        const row = (args: CellArgs<PresenceRow>): PresenceRow | undefined => args?.cell?.row?.dataItem;
        const body: Child[] = [
            grid('auto minmax(0, 1fr) auto', [
                cardTitle('Rep phones'),
                help('A rep receives calls only while a phone is open in the browser.'),
                button(presence.loading ? 'Refreshing…' : 'Refresh', () => { loadPresence(); }, {
                    small: true, enabled: !presence.loading, icon: core.SystemIcon.REFRESH
                })
            ], Gap.SPACING3X)
        ];
        if (presence.error) {
            body.push(errorLine('Phone status did not load: ' + friendlyError(presence.error)));
        }
        if (!presence.loaded) {
            if (!presence.error) body.push(skeleton('table', 3, 'Loading phones…'));
        } else if (presence.items.length === 0) {
            body.push(text('No rep has opened a phone yet.', { weak: true }));
        } else {
            body.push(new component.DataGrid({
                dataSource: new core.ArrayDataSource(presence.items),
                columns: [
                    { type: CT().TEMPLATED, name: 'rep', label: 'Rep', stretchFactor: 3,
                      content: (a: CellArgs<PresenceRow>): unknown => text(row(a)?.employeeName || '(unnamed rep)') },
                    { type: CT().TEMPLATED, name: 'status', label: 'Status', stretchFactor: 3,
                      content: (a: CellArgs<PresenceRow>): unknown => {
                          const s = presenceTone(row(a));
                          return dotText(s.tone, s.label);
                      } },
                    { type: CT().TEMPLATED, name: 'seen', label: 'Last seen', stretchFactor: 2,
                      content: (a: CellArgs<PresenceRow>): unknown => {
                          const iso = row(a)?.lastSeen || '';
                          const title = exactTime(iso);
                          return new component.Text({
                              text: relativeTime(iso, nowMs),
                              rootAttributes: title ? { title } : {}
                          } as never);
                      } },
                    { type: CT().TEMPLATED, name: 'client', label: 'Browser', stretchFactor: 3,
                      content: (a: CellArgs<PresenceRow>): unknown => text(row(a)?.client || '—', { weak: !row(a)?.client }) },
                    { type: CT().TEMPLATED, name: 'incoming', label: 'Incoming calls', stretchFactor: 2,
                      content: (a: CellArgs<PresenceRow>): unknown => {
                          const r = row(a);
                          return !r || !r.state ? text('—', { weak: true }) : text(r.incomingGranted ? 'Allowed' : 'Off');
                      } },
                    { type: CT().TEMPLATED, name: 'error', label: 'Last error', stretchFactor: 4,
                      content: (a: CellArgs<PresenceRow>): unknown => text(row(a)?.lastError || '—', { weak: true, small: true }) }
                ],
                columnStretch: true,
                highlightRowsOnHover: true,
                dataRowHeight: 48,
                headerRowHeight: 40,
                rootStyle: { width: '100%' }
            } as never));
        }
        return card(body, { label: 'Rep phones' });
    }

    private renderVersions(state: AppState): core.VDom.Node {
        const o = state.outbound;
        const item = (label: string, value: string): core.VDom.Node =>
            vstack([help(label), text(value)], Gap.SPACING1X);
        return card([
            cardTitle('Versions'),
            grid('repeat(5, minmax(0, 1fr))', [
                item('Dial function code', o.loaded
                    ? (o.codeVersion || '—') + (o.published ? ' · published ' + (o.publishedCodeVersion || '—') : ' · not published')
                    : '—'),
                item('Recording notice live', o.loaded && o.published
                    ? (o.publishedNoticeVersion ? 'version ' + o.publishedNoticeVersion : 'no notice') : '—')
            ], Gap.SPACING3X)
        ], { label: 'Versions' });
    }

    render(): core.VDom.Node {
        const state = store.getState() as AppState;
        const c = state.console;
        const running = !!c.preflightRefreshing || state.health.loading;
        const last = [c.preflightAt, state.health.checkedAt].filter(Boolean).sort().pop() || '';
        const when = timeOfDay(last);
        const header = pageHeader('Health', 'Setup checks, drift between NetSuite and Twilio, rep phones and versions.', [
            when ? text('Last run ' + when, { weak: true, small: true }) : null,
            button(running ? 'Running…' : 'Run checks', () => { runAllChecks(); }, { primary: true, enabled: !running })
        ]);
        if (!state.health.loaded && state.health.error && c.preflight === null && c.preflightError) {
            return vstack([header, problemCard('Couldn\'t run the checks', friendlyError(state.health.error) +
                ' Nothing was changed.', [button('Retry', () => { runAllChecks(); }, { primary: true, small: true })])],
            Gap.SPACING4X);
        }
        return vstack([
            header,
            grid('minmax(0, 1fr) minmax(0, 1fr)', [this.renderSetup(state), this.renderDrift(state)], Gap.SPACING3X),
            this.renderPhones(state),
            this.renderVersions(state)
        ], Gap.SPACING4X);
    }
}
