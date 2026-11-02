/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Reporting Central — calls and follow-ups for a period and an owner
 * scope. Server-rendered raw HTML (not N/ui/serverWidget): tabs and list
 * filters are links; Time range / Owner, search and custom dates are GET
 * forms; Export CSV is a link with csv=1 (calls, or follow-ups on the
 * Follow-ups tab). The Overview (KPI strip, "Needs you", the calls chart,
 * outcomes, recent calls) is links only, with no client script of its
 * own. Client scripts handle the busy state (no content swap), the selects, the Calls
 * tab's call detail (opened without a reload; data from the RESTlet action
 * getCallDetail; `call=<id>` deep-links a call) and the Follow-ups tab's
 * detail, bulk bar and undo (`fu=<id>` deep-links a follow-up;
 * ctc_rl_token RESTlet actions).
 *
 * Modules: lib/ctc_rc_scope.js (range + owner), lib/ctc_rc_shell.js (URL
 * state, app bar, page header, shared CSS / client script),
 * lib/ctc_rc_overview.js (Overview), lib/ctc_rc_calls.js (Calls tab, call
 * detail, CSV), lib/ctc_rc_followups.js.
 *
 * Scope: a rep sees their own book (lib/ctc_workspace_queries.js
 * getBookCustomerIds: customers where the rep is primary sales rep or on
 * the Sales Team). A manager (Administrator, or supervisor of an active
 * employee) also sees the team or one member: calls whose Phone Call
 * `assigned` employee is in the team. The range filters calls by their
 * date. On Follow-ups, open work (To review, My tasks) ignores the range;
 * Done is filtered by when each was done (wq.loadFollowUpRows). The
 * Overview reads the range's calls, the previous period's count and the
 * open follow-ups (any date).
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/runtime', 'N/url', 'N/log', './lib/ctc_html', './lib/ctc_config', './lib/ctc_workspace_queries', './lib/ctc_dock',
    './lib/ctc_rc_scope', './lib/ctc_rc_shell', './lib/ctc_rc_calls', './lib/ctc_rc_followups', './lib/ctc_rc_overview'],
    (runtime, url, log, ctcHtml, ctcConfig, wq, ctcDock, rcScope, rcShell, rcCalls, rcFollowups, rcOverview) => {

    const HISTORY_LIMIT = 1000;
    const TASK_LIMIT = 100;
    const ENTITY_URL = '/app/common/entity/custjob.nl?id=';

    const repPhone = (userId) => {
        const own = wq.getRepPhoneNumber({ userId: userId });
        if (own) return own;
        try {
            return ctcConfig.loadConfig().phoneNumber || '';
        } catch (e) {
            log.error({ title: 'CTC Reporting — config lookup failed', details: e.message || e });
            return '';
        }
    };

    const resolveScript = (scriptId, deploymentId) => {
        try {
            return url.resolveScript({ scriptId: scriptId, deploymentId: deploymentId, returnExternalUrl: false }) || '';
        } catch (e) {
            log.error({ title: 'CTC Reporting — Failed to resolve ' + scriptId, details: e.message || e });
            return '';
        }
    };

    /**
     * GET handler — renders Reporting Central, or the calls CSV with csv=1.
     * @param {Object} context
     */
    const onRequest = (context) => {
        // Module state can outlive a request on the same server: read the
        // team fresh every time (a stale empty team was seen live).
        rcScope.clearTeamCache();
        // Same for the date memos: the date format is a user preference.
        rcCalls.clearDateMemo();
        rcFollowups.clearIsoMemo();
        const state = rcShell.parseParams(context.request && context.request.parameters);
        const user = runtime.getCurrentUser();
        const userId = user.id;
        const base = resolveScript('customscript_ctc_sl_reporting', 'customdeploy_ctc_sl_reporting');

        // Owner first: it decides the query scope. A rep's `owner` param is
        // ignored; a manager's must be 'team', 'me' or a team member.
        const owner = rcScope.resolveOwnerScope({ userId: userId, role: user.role, owner: state.owner });
        state.owner = owner.owner;
        const todayIso = rcScope.todayIso();
        const range = rcScope.resolveRange(state, { todayIso: todayIso, weekStart: rcScope.weekStartDay() });

        const m = {
            state: state,
            base: base,
            userName: user.name || '',
            who: owner.isManager
                ? [user.name || '', 'Sales manager'].filter(Boolean).join(' · ')
                : [user.name || '', ctcHtml.formatPhone(repPhone(userId))].filter(Boolean).join(' · '),
            range: range,
            owner: owner,
            todayIso: todayIso
        };
        const cfg = { restletUrl: resolveScript('customscript_ctc_rl_token', 'customdeploy_ctc_rl_token') };

        // Own calls: the book (unchanged). Team / member: Phone Call
        // `assigned` in ownerIds (the book is not read).
        const scope = owner.ownerIds
            ? { ownerIds: owner.ownerIds }
            : { bookCustomerIds: wq.getBookCustomerIds({ userId: userId }) };
        const dateFilter = rcScope.searchDateFilter(range.filter, rcScope.toNsDate);
        m.teamView = owner.mode === 'team';
        m.thisYear = new Date().getFullYear();

        if (state.tab === 'overview' && !state.csv) {
            renderOverview(context, { m: m, cfg: cfg, scope: scope, dateFilter: dateFilter, user: user });
            return;
        }
        if (state.tab === 'followups') {
            renderFollowups(context, { m: m, cfg: cfg, scope: scope, dateFilter: dateFilter, user: user });
            return;
        }

        // Reporting Central never shows the stage (entityType): skip that
        // lookup; Calls reads only the task groups, not their count.
        const history = wq.loadHistoryRows(Object.assign({
            userId: userId, limit: HISTORY_LIMIT, dateFilter: dateFilter, skipEntityType: true
        }, scope));
        const rangeRows = history.rows || [];
        const listRows = wq.filterCallRows(rangeRows, { direction: state.dir, search: state.q });

        const tasks = wq.loadTaskGroups(Object.assign({
            userId: userId, tab: 'pending', limit: TASK_LIMIT, skipEntityType: true, skipCount: true
        }, scope));
        const pendingByCall = {};
        (tasks.groups || []).forEach((g) => { pendingByCall[g.call.id] = (g.tasks || []).length; });

        if (state.csv) {
            const name = 'ctc-calls-' + range.key + (range.key === 'custom' && state.from ? '-' + state.from + '-to-' + state.to : '') + '.csv';
            context.response.setHeader({ name: 'Content-Type', value: 'text/csv; charset=utf-8' });
            context.response.setHeader({ name: 'Content-Disposition', value: 'attachment; filename="' + name + '"' });
            context.response.write('﻿' + rcCalls.toCsv(listRows, pendingByCall, owner.mode !== 'me'));
            return;
        }

        Object.assign(m, {
            historyError: !!history.error,
            truncated: rangeRows.length >= HISTORY_LIMIT,
            rangeRows: rangeRows,
            listRows: listRows,
            tabCounts: rcCalls.tabCounts(rangeRows, state.q),
            pendingByCall: pendingByCall,
            // The deep-linked call opens only when it is in this list.
            selectedId: state.call && !history.error && listRows.some((r) => String(r.id) === state.call) ? state.call : ''
        });
        // The detail panel's Call button goes through the phone mode
        // shell, like the portlet's redial (no shell: no Call button).
        m.shellUrl = resolveScript('customscript_ctc_sl_shell', 'customdeploy_ctc_sl_shell');
        Object.assign(cfg, {
            shellUrl: m.shellUrl,
            exitKey: ctcDock.EXIT_KEY,
            entityUrl: ENTITY_URL,
            owner: state.owner,
            teamView: m.teamView,
            notes: ctcHtml.UNANSWERED_NOTE
        });
        context.response.write(buildHtml(m, cfg));
    };

    // The range hit the row limit: the newest HISTORY_LIMIT calls only, so
    // the numbers undercount (say so, never silently).
    const truncatedNotice = () => '<p class="rc-truncated" role="status">Showing your newest ' + HISTORY_LIMIT +
        ' calls in this range; the numbers count only those. Pick a shorter range to see everything.</p>';

    /**
     * The Overview: the range's calls (one loadHistoryRows), the previous
     * period's count (one countCalls; none for custom or after a history
     * error) and the open follow-ups (one loadFollowUpRows, no date filter:
     * open work ignores the range). Models and HTML: lib/ctc_rc_overview.js.
     * @param {Object} context
     * @param {{m: Object, cfg: Object, scope: Object, dateFilter: Array, user: Object}} p
     */
    const renderOverview = (context, p) => {
        const m = p.m;
        const userId = p.user.id;
        const history = wq.loadHistoryRows(Object.assign({
            userId: userId, limit: HISTORY_LIMIT, dateFilter: p.dateFilter, skipEntityType: true
        }, p.scope));
        const rows = history.rows || [];
        const previous = m.range.previous;
        const previousCount = previous && !history.error
            ? wq.countCalls(Object.assign({ userId: userId, dateFilter: rcScope.searchDateFilter(previous.filter, rcScope.toNsDate) }, p.scope))
            : null;
        const fu = wq.loadFollowUpRows(Object.assign({ userId: userId }, p.scope)) || {};
        Object.assign(m, {
            historyError: !!history.error,
            tasksError: !!fu.error,
            truncated: !history.error && rows.length >= HISTORY_LIMIT
        });
        m.ov = rcOverview.buildModel({
            rows: rows, previousCount: previousCount, fuRows: fu.rows || [], historyError: m.historyError, tasksError: m.tasksError,
            range: m.range, todayIso: m.todayIso, thisYear: m.thisYear
        });
        context.response.write(rcShell.buildPage({
            m: m,
            body: (m.truncated ? truncatedNotice() : '') + '<div id="rc-content" class="rc-content">' + rcOverview.buildOverviewTab(m) + '</div>',
            css: rcCalls.CALLS_CSS + rcOverview.OVERVIEW_CSS,
            cfg: p.cfg
        }));
    };

    /**
     * The Follow-ups tab (or its CSV with csv=1): the scope's open
     * follow-ups (any date) and those done in the range
     * (wq.loadFollowUpRows), then the tab, quick filter and search
     * (lib/ctc_rc_followups.js).
     * @param {Object} context
     * @param {{m: Object, cfg: Object, scope: Object, dateFilter: Array, user: Object}} p
     */
    const renderFollowups = (context, p) => {
        const m = p.m;
        const state = m.state;
        const loaded = wq.loadFollowUpRows(Object.assign({ userId: p.user.id, dateFilter: p.dateFilter }, p.scope)) || {};
        const fu = rcFollowups.buildModel(loaded.error ? [] : (loaded.rows || []), {
            state: state, todayIso: m.todayIso, thisYear: m.thisYear, userId: p.user.id, base: m.base
        });
        if (state.csv) {
            const name = 'ctc-follow-ups-' + state.ftab + '-' + m.range.key +
                (m.range.key === 'custom' && state.from ? '-' + state.from + '-to-' + state.to : '') + '.csv';
            context.response.setHeader({ name: 'Content-Type', value: 'text/csv; charset=utf-8' });
            context.response.setHeader({ name: 'Content-Disposition', value: 'attachment; filename="' + name + '"' });
            context.response.write('﻿' + rcFollowups.toCsv(fu.list));
            return;
        }
        Object.assign(m, { fu: fu, tasksError: !!loaded.error, scopeLine: rcFollowups.scopeLine(m) });
        Object.assign(p.cfg, {
            entityUrl: ENTITY_URL,
            owner: state.owner,
            teamView: m.teamView,
            fu: rcFollowups.clientConfig(m, { id: String(p.user.id), name: p.user.name || '' })
        });
        const cut = state.ftab === 'done' ? loaded.doneTruncated : loaded.openTruncated;
        const body = (cut ? '<p class="rc-truncated" role="status">' + (state.ftab === 'done'
                ? 'Showing the newest ' + wq.FOLLOW_UP_LIMIT + ' follow-ups done in this range. Pick a shorter range to see everything.'
                : 'Showing the newest ' + wq.FOLLOW_UP_LIMIT + ' open follow-ups.') + '</p>' : '') +
            '<div id="rc-content" class="rc-content">' + rcFollowups.buildFollowupsTab(m) + '</div>';
        context.response.write(rcShell.buildPage({
            m: m,
            body: body,
            css: rcCalls.CALLS_CSS + rcFollowups.FOLLOWUPS_CSS,
            cfg: p.cfg,
            // The list region fits the window and scrolls inside.
            fit: !m.tasksError,
            scripts: [rcFollowups.FOLLOWUPS_CLIENT_JS]
        }));
    };

    /**
     * The Calls page.
     * @param {Object} m - view model from onRequest
     * @param {Object} cfg - window.CTC_RC
     * @returns {string}
     */
    const buildHtml = (m, cfg) => {
        const body = (m.truncated ? truncatedNotice() : '') +
            '<div id="rc-content" class="rc-content">' + rcCalls.buildCallsTab(m) + '</div>';
        return rcShell.buildPage({
            m: m,
            body: body,
            css: rcCalls.CALLS_CSS,
            cfg: cfg,
            // The page fits the window; the list region scrolls inside.
            // An empty list keeps fit mode (its card fills the region).
            fit: !m.historyError,
            scripts: [rcCalls.CALLS_CLIENT_JS]
        });
    };

    return {
        onRequest,
        // exported for tests
        parseParams: rcShell.parseParams,
        buildUrl: rcShell.buildUrl,
        formTarget: rcShell.formTarget,
        formatLength: rcCalls.formatLength,
        formatPhone: rcCalls.formatPhone,
        afterCall: rcCalls.afterCall,
        shortDate: rcCalls.shortDate,
        csvCell: rcCalls.csvCell,
        CLIENT_JS: rcCalls.CALLS_CLIENT_JS,
        FOLLOWUPS_CLIENT_JS: rcFollowups.FOLLOWUPS_CLIENT_JS
    };
});
