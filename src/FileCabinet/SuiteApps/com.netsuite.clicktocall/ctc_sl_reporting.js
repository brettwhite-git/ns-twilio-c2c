/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Reporting Central — the rep's own calls, follow-ups and missed calls for a
 * period. Server-rendered raw HTML (not N/ui/serverWidget): periods, tabs and
 * direction filters are links, search and custom dates are GET forms, and
 * Export CSV is a link with csv=1. The only client script handles the loading
 * state on navigation and the follow-up Approve / Dismiss buttons, which call
 * the existing ctc_rl_token RESTlet actions.
 *
 * Scope: the current employee's book (lib/ctc_workspace_queries.js
 * loadHistoryRows: customers where the rep is primary sales rep or on the
 * Sales Team). Managers' team view is out of scope.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/runtime', 'N/url', 'N/format', 'N/log', './lib/ctc_html', './lib/ctc_fonts', './lib/ctc_config', './lib/ctc_workspace_queries'],
    (runtime, url, format, log, ctcHtml, ctcFonts, ctcConfig, wq) => {

    const escapeHtml = ctcHtml.escapeHtml;
    const safeJsonEmbed = ctcHtml.safeJsonEmbed;

    const DASHBOARD_URL = '/app/center/card.nl?sc=-29';
    const CALL_URL = '/app/crm/calendar/call.nl?id=';
    const ENTITY_URL = '/app/common/entity/custjob.nl?id=';
    const HISTORY_LIMIT = 1000;
    const TASK_LIMIT = 100;
    const MAX_QUERY = 80;
    // A call that ended with "No transcript" and lasted less than this was
    // too short for Twilio to transcribe.
    const SHORT_CALL_SECONDS = 30;

    const RANGES = ['today', 'yesterday', 'thisweek', 'lastweek', 'custom'];
    const TABS = ['calls', 'followups', 'missed'];
    const DIRS = ['all', 'outbound', 'inbound', 'missed'];
    const DEFAULTS = { range: 'today', tab: 'calls', dir: 'all' };

    const RANGE_LABELS = { today: 'Today', yesterday: 'Yesterday', thisweek: 'This week', lastweek: 'Last week', custom: 'Custom' };
    const TAB_LABELS = { calls: 'Calls', followups: 'Follow-ups', missed: 'Missed' };
    const DIR_LABELS = { all: 'All', outbound: 'Outbound', inbound: 'Inbound', missed: 'Missed' };
    const EMPTY_CALLS = {
        today: 'No calls yet today', yesterday: 'No calls yesterday', thisweek: 'No calls this week',
        lastweek: 'No calls last week', custom: 'No calls in these dates'
    };
    const PREVIOUS_LABEL = { today: 'vs yesterday', thisweek: 'vs last week' };

    const CSV_HEADERS = ['When', 'Direction', 'Customer', 'Contact', 'Phone', 'Length (s)', 'Satisfaction', 'After the call'];

    // Direction chip before the time in call rows (matches the portlet's
    // ctc-pl-status-dir): word + arrow + aria-label, never colour alone.
    // Missed = status 'Missed', a voicemail, or an inbound call with no
    // talk time; the arrow is the call's own direction. Fixed min-width so
    // the times line up.
    const DIR_CHIP = {
        in:     { word: 'In',     aria: 'Inbound call' },
        out:    { word: 'Out',    aria: 'Outbound call' },
        missed: { word: 'Missed', aria: 'Missed call' }
    };
    const ARROW = { inbound: 'M17 7L7 17M15 17H7V9', outbound: 'M7 17L17 7M9 7h8v8' };

    // Direction labels for the CSV (directionKey: missed = not connected).
    const ICONS = {
        outbound: { label: 'Outbound' },
        inbound: { label: 'Inbound' },
        missed: { label: 'Missed' }
    };

    const SEARCH_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5C5955" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
        '<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path></svg>';

    // ─── Parameters ────────────────────────────────────────────────────────

    const pick = (value, allowed, fallback) => (allowed.indexOf(value) !== -1 ? value : fallback);

    /**
     * A YYYY-MM-DD string that is a real calendar date, else ''.
     * @param {*} value
     * @returns {string}
     */
    const isoDate = (value) => {
        const s = typeof value === 'string' ? value : '';
        const m = s.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/);
        if (!m) return '';
        const y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
        const dt = new Date(y, mo - 1, d);
        if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return '';
        return s;
    };

    /**
     * Validate every query parameter against a whitelist. Unknown or bad
     * values fall back to the defaults (range today, tab calls, dir all).
     * @param {Object} params - request.parameters
     * @returns {{range: string, from: string, to: string, tab: string, dir: string, q: string, csv: boolean}}
     */
    const parseParams = (params) => {
        const p = params || {};
        const range = pick(p.range, RANGES, DEFAULTS.range);
        let from = range === 'custom' ? isoDate(p.from) : '';
        let to = range === 'custom' ? isoDate(p.to) : '';
        if (from && to && from > to) { const t = from; from = to; to = t; }
        // eslint-disable-next-line no-control-regex
        const q = (typeof p.q === 'string' ? p.q : '').replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, MAX_QUERY);
        return {
            range: range,
            from: from,
            to: to,
            tab: pick(p.tab, TABS, DEFAULTS.tab),
            dir: pick(p.dir, DIRS, DEFAULTS.dir),
            q: q,
            csv: p.csv === '1'
        };
    };

    /**
     * Build a link to this Suitelet that keeps the current params, with
     * overrides. Default values are left out to keep URLs short.
     * @param {string} base - this Suitelet's URL (with script and deploy)
     * @param {Object} state - parseParams result
     * @param {Object} [overrides]
     * @returns {string}
     */
    const buildUrl = (base, state, overrides) => {
        const s = Object.assign({}, state, overrides || {});
        const pairs = [];
        const add = (k, v) => pairs.push(k + '=' + encodeURIComponent(v));
        if (s.range && s.range !== DEFAULTS.range) add('range', s.range);
        if (s.range === 'custom' && s.from) add('from', s.from);
        if (s.range === 'custom' && s.to) add('to', s.to);
        if (s.tab && s.tab !== DEFAULTS.tab) add('tab', s.tab);
        if (s.dir && s.dir !== DEFAULTS.dir) add('dir', s.dir);
        if (s.q) add('q', s.q);
        if (s.csv) add('csv', '1');
        if (!pairs.length) return base;
        return base + (base.indexOf('?') === -1 ? '?' : '&') + pairs.join('&');
    };

    /**
     * A GET form replaces the action's query string, so the form needs the
     * Suitelet's own params (script, deploy) as hidden inputs.
     * @param {string} base
     * @returns {{action: string, hidden: string}}
     */
    const formTarget = (base) => {
        const qi = base.indexOf('?');
        const action = qi === -1 ? base : base.slice(0, qi);
        const hidden = (qi === -1 ? [] : base.slice(qi + 1).split('&'))
            .filter(Boolean)
            .map((pair) => {
                const eq = pair.indexOf('=');
                const dec = (v) => { try { return decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) { return v; } };
                const k = dec(eq === -1 ? pair : pair.slice(0, eq));
                const v = eq === -1 ? '' : dec(pair.slice(eq + 1));
                return hiddenInput(k, v);
            }).join('');
        return { action: action, hidden: hidden };
    };

    const hiddenInput = (name, value) =>
        '<input type="hidden" name="' + escapeHtml(name) + '" value="' + escapeHtml(value) + '">';

    // ─── Formatting ────────────────────────────────────────────────────────

    /**
     * Seconds as m:ss; '—' for no talk time.
     * @param {number} seconds
     * @returns {string}
     */
    const formatLength = (seconds) => {
        const s = Math.max(0, Math.round(Number(seconds) || 0));
        if (!s) return '—';
        const sec = s % 60;
        return Math.floor(s / 60) + ':' + (sec < 10 ? '0' : '') + sec;
    };

    // E.164 or loose digits to a readable North American number; other
    // numbers come back as given (shared with the portlet: lib/ctc_html).
    const formatPhone = ctcHtml.formatPhone;

    /**
     * "After the call" text and its tone for a call row.
     * @param {Object} row - loadHistoryRows row
     * @param {number} pending - pending follow-ups from this call
     * @returns {{text: string, tone: string}} tone: 'muted' | 'warn' | 'bad'
     */
    const afterCall = (row, pending) => {
        if (wq.isUnconnected(row)) return { text: 'Not connected', tone: 'bad' };
        if (pending > 0) return { text: pending + ' follow-up' + (pending === 1 ? '' : 's') + ' to approve', tone: 'warn' };
        const status = String(row.callStatus || '');
        if (status === 'Logged' || status === 'Processing') return { text: 'Processing…', tone: 'muted' };
        if (status === 'Transcribed') return { text: 'Summary ready', tone: 'muted' };
        if (status === 'No transcript') {
            return { text: row.duration < SHORT_CALL_SECONDS ? 'Too short to summarize' : 'No transcript', tone: 'muted' };
        }
        if (status === 'Failed') return { text: 'Couldn’t summarize', tone: 'muted' };
        return { text: row.brief ? 'Summary ready' : '—', tone: 'muted' };
    };

    const SAT_CLASS = { high: 'good', mid: 'mid', low: 'low', none: 'none' };
    const satClass = (n) => SAT_CLASS[wq.satClass(n)];

    const directionKey = (row) => (wq.isUnconnected(row) ? 'missed' : (row.direction === 'inbound' ? 'inbound' : 'outbound'));

    // Direction chip kind for a call row: 'missed' | 'in' | 'out'.
    // Missed = status 'Missed', a voicemail, or an inbound call with no talk time.
    const dirChipKind = (row) => {
        const inbound = row.direction === 'inbound';
        if (row.callStatus === 'Missed' || row.voicemail === true || (inbound && wq.isUnconnected(row))) return 'missed';
        return inbound ? 'in' : 'out';
    };

    // ─── CSV ───────────────────────────────────────────────────────────────

    /**
     * One CSV cell: quotes when needed, doubles inner quotes, and defuses
     * spreadsheet formulas (a leading = @ tab or CR, or + / - that is not a
     * phone number or a plain number).
     * @param {*} value
     * @returns {string}
     */
    const csvCell = (value) => {
        let s = value == null ? '' : String(value);
        if (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !/^[+-]?[0-9 ().-]+$/.test(s))) s = "'" + s;
        if (/[",\r\n]/.test(s) || /^\s|\s$/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
        return s;
    };

    /**
     * CSV for the current calls list.
     * @param {Array<Object>} rows
     * @param {Object<string, number>} pendingByCall
     * @returns {string}
     */
    const toCsv = (rows, pendingByCall) => {
        const lines = [CSV_HEADERS.map(csvCell).join(',')];
        (rows || []).forEach((r) => {
            const dir = directionKey(r);
            lines.push([
                [r.date, r.timeOfDay].filter(Boolean).join(' '),
                ICONS[dir].label,
                r.companyName || '',
                r.contactName || '',
                r.phone || '',
                Math.max(0, Number(r.duration) || 0),
                typeof r.satisfaction === 'number' && r.satisfaction ? r.satisfaction : '',
                afterCall(r, (pendingByCall || {})[r.id] || 0).text
            ].map(csvCell).join(','));
        });
        return lines.join('\r\n') + '\r\n';
    };

    // ─── Data ──────────────────────────────────────────────────────────────

    const toNsDate = (iso) => {
        const m = iso.split('-');
        return format.format({ value: new Date(parseInt(m[0], 10), parseInt(m[1], 10) - 1, parseInt(m[2], 10)), type: format.Type.DATE });
    };

    /**
     * loadHistoryRows params for the chosen range. "Custom" without both
     * dates falls back to today.
     */
    const historyParams = (state, userId, book) => {
        const p = { userId: userId, bookCustomerIds: book, limit: HISTORY_LIMIT };
        if (state.range !== 'custom') return Object.assign(p, { dateRange: state.range });
        if (!state.from || !state.to) return Object.assign(p, { dateRange: 'today' });
        return Object.assign(p, { dateRange: 'custom', filters: { dateFrom: toNsDate(state.from), dateTo: toNsDate(state.to) } });
    };

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
        const state = parseParams(context.request && context.request.parameters);
        const user = runtime.getCurrentUser();
        const userId = user.id;
        const base = resolveScript('customscript_ctc_sl_reporting', 'customdeploy_ctc_sl_reporting');

        const book = wq.getBookCustomerIds({ userId: userId });
        const history = wq.loadHistoryRows(historyParams(state, userId, book));
        const rangeRows = history.rows || [];
        const listRows = wq.filterCallRows(rangeRows, { direction: state.dir, search: state.q });

        const tasks = wq.loadTaskGroups({ userId: userId, tab: 'pending', limit: TASK_LIMIT });
        const pendingByCall = {};
        (tasks.groups || []).forEach((g) => { pendingByCall[g.call.id] = (g.tasks || []).length; });

        if (state.csv) {
            const name = 'ctc-calls-' + state.range + (state.range === 'custom' && state.from ? '-' + state.from + '-to-' + state.to : '') + '.csv';
            context.response.setHeader({ name: 'Content-Type', value: 'text/csv; charset=utf-8' });
            context.response.setHeader({ name: 'Content-Disposition', value: 'attachment; filename="' + name + '"' });
            context.response.write('﻿' + toCsv(listRows, pendingByCall));
            return;
        }

        const prevKeyword = wq.REPORT_PREVIOUS_RANGE[state.range];
        const previousCount = (prevKeyword && !history.error)
            ? wq.countCalls({ bookCustomerIds: book, dateKeyword: prevKeyword })
            : null;

        context.response.write(buildHtml({
            state: state,
            base: base,
            restletUrl: resolveScript('customscript_ctc_rl_token', 'customdeploy_ctc_rl_token'),
            userName: user.name || '',
            repPhone: formatPhone(repPhone(userId)),
            historyError: !!history.error,
            rangeRows: rangeRows,
            listRows: listRows,
            missedRows: wq.filterCallRows(rangeRows, { direction: 'missed' }),
            kpis: wq.computeReportKpis(rangeRows),
            previousCount: previousCount,
            taskGroups: tasks.groups || [],
            tasksError: !!tasks.error,
            pendingByCall: pendingByCall
        }));
    };

    // ─── HTML ──────────────────────────────────────────────────────────────

    const svgIcon = (path, opts) => {
        const o = opts || {};
        return '<svg width="' + (o.size || 13) + '" height="' + (o.size || 13) + '" viewBox="0 0 24 24" fill="none" stroke="' +
            (o.stroke || 'currentColor') + '" stroke-width="' + (o.width || 2) + '" stroke-linecap="round" stroke-linejoin="round"' +
            (o.label ? ' role="img" aria-label="' + escapeHtml(o.label) + '"' : ' aria-hidden="true"') + '><path d="' + path + '"></path></svg>';
    };

    const segLinks = (label, items) =>
        '<nav class="rc-seg" aria-label="' + label + '">' + items.map((it) =>
            '<a data-nav href="' + escapeHtml(it.href) + '"' + (it.on ? ' aria-current="true"' : '') + '>' + escapeHtml(it.label) + '</a>'
        ).join('') + '</nav>';

    const stateBox = (title, sub, action) =>
        '<div class="rc-state"><span class="rc-state-title">' + escapeHtml(title) + '</span>' +
        (sub ? '<span class="rc-state-sub">' + escapeHtml(sub) + '</span>' : '') + (action || '') + '</div>';

    const kpiCell = (k) =>
        '<div class="rc-kpi"><span class="rc-kpi-label">' + escapeHtml(k.label) + '</span>' +
        '<span class="rc-kpi-main"><span class="rc-kpi-value"' + (k.attr || '') + '>' + escapeHtml(k.value) + '</span>' +
        '<span class="rc-kpi-unit">' + escapeHtml(k.unit || '') + '</span></span>' +
        '<span class="rc-kpi-delta' + (k.tone ? ' rc-' + k.tone : '') + '">' + (k.delta ? escapeHtml(k.delta) : '&nbsp;') + '</span></div>';

    const buildKpis = (m) => {
        const k = m.kpis;
        const none = m.historyError;
        let callsDelta = '', callsTone = '';
        if (!none && typeof m.previousCount === 'number') {
            const diff = k.calls - m.previousCount;
            const label = PREVIOUS_LABEL[m.state.range];
            callsDelta = diff === 0 ? 'Same as ' + label.replace(/^vs /, '') : (diff > 0 ? '+' : '−') + Math.abs(diff) + ' ' + label;
            callsTone = diff > 0 ? 'good' : '';
        }
        const avg = k.avgTalkSeconds;
        const cells = [
            { label: 'Calls', value: none ? '—' : String(k.calls), delta: callsDelta, tone: callsTone },
            { label: 'Connected', value: none || k.connectedPct === null ? '—' : String(k.connectedPct), unit: none || k.connectedPct === null ? '' : '%',
                delta: none || !k.calls ? '' : k.connected + ' of ' + k.calls },
            { label: 'Talk time', value: none ? '—' : String(k.talkMinutes), unit: none ? '' : 'min',
                delta: none || avg === null ? '' : 'Avg ' + (avg < 60 ? avg + ' s' : formatLength(avg)) },
            { label: 'Satisfaction', value: none || k.satAvg === null ? '—' : k.satAvg.toFixed(1), unit: none || k.satAvg === null ? '' : '/10',
                delta: none ? '' : (k.satCount ? k.satCount + ' scored' : 'None scored') },
            { label: 'Follow-ups', value: m.tasksError ? '—' : String(m.followupCount), unit: m.tasksError ? '' : 'open',
                attr: m.tasksError ? '' : ' data-followup-count="kpi"' }
        ];
        return '<section class="rc-kpis" aria-label="Summary">' + cells.map(kpiCell).join('') + '</section>';
    };

    const dirChip = (r) => {
        const kind = dirChipKind(r);
        return '<span class="rc-dir rc-dir-' + kind + '" role="img" aria-label="' + DIR_CHIP[kind].aria + '">' +
            svgIcon(r.direction === 'inbound' ? ARROW.inbound : ARROW.outbound, { size: 12, width: 2.2 }) +
            '<span>' + DIR_CHIP[kind].word + '</span></span>';
    };

    const callRow = (r, m) => {
        const after = afterCall(r, m.pendingByCall[r.id] || 0);
        const sat = satClass(r.satisfaction);
        const multiDay = m.state.range !== 'today' && m.state.range !== 'yesterday';
        const when = r.timeOfDay || r.date || '—';
        const company = r.companyName || 'Unknown caller';
        const contact = r.contactName || (r.companyId ? 'Main line' : formatPhone(r.phone));
        return '<div role="row" class="rc-row">' +
            '<span role="cell" class="rc-when">' + dirChip(r) +
                '<span class="rc-when-text"><a class="rc-row-link" href="' + escapeHtml(CALL_URL + encodeURIComponent(r.id)) + '" aria-label="' +
                escapeHtml('Open call with ' + company + ', ' + [r.date, r.timeOfDay].filter(Boolean).join(' ')) + '">' + escapeHtml(when) + '</a>' +
                (multiDay && r.timeOfDay && r.date ? '<span class="rc-date">' + escapeHtml(r.date) + '</span>' : '') + '</span></span>' +
            '<span role="cell" class="rc-who-cell">' +
                (r.companyId
                    ? '<a class="rc-co" href="' + escapeHtml(ENTITY_URL + encodeURIComponent(r.companyId)) + '">' + escapeHtml(company) + '</a>'
                    : '<span class="rc-co">' + escapeHtml(company) + '</span>') +
                '<span class="rc-contact">' + escapeHtml(contact) + '</span></span>' +
            (r.voicemail === true
                // A voicemail reads "Voicemail", with the AI brief below when present.
                ? '<span role="cell" class="rc-after rc-vm"><span class="rc-vm-kind">Voicemail</span>' +
                    (r.brief ? '<span class="rc-vm-brief" title="' + escapeHtml(r.brief) + '">' + escapeHtml(r.brief) + '</span>' : '') + '</span>'
                : '<span role="cell" class="rc-after rc-' + after.tone + '">' + escapeHtml(after.text) + '</span>') +
            '<span role="cell"><span class="rc-sat rc-sat-' + sat + '">' + (sat === 'none' ? '—' : escapeHtml(String(r.satisfaction))) + '</span></span>' +
            '<span role="cell" class="rc-len">' + escapeHtml(formatLength(r.duration)) + '</span>' +
            '</div>';
    };

    const callTable = (rows, m, label) =>
        '<div class="rc-card rc-scroll"><div role="table" aria-label="' + label + '" class="rc-table">' +
        '<div role="row" class="rc-row rc-row-head"><span role="columnheader">When</span><span role="columnheader">Customer</span>' +
        '<span role="columnheader">After the call</span><span role="columnheader">Sat</span><span role="columnheader" class="rc-right">Length</span></div>' +
        rows.map((r) => callRow(r, m)).join('') + '</div></div>';

    const errorBox = (title, m) =>
        '<div class="rc-card">' + stateBox(title, 'Your calls are safe. Reload to try again.',
            '<a class="rc-btn rc-btn-outline" href="' + escapeHtml(buildUrl(m.base, m.state)) + '">Try again</a>') + '</div>';

    const buildCallsTab = (m) => {
        const s = m.state;
        const form = formTarget(m.base);
        const toolbar = '<div class="rc-toolbar">' +
            segLinks('Direction', DIRS.map((d) => ({ label: DIR_LABELS[d], on: s.dir === d, href: buildUrl(m.base, s, { dir: d }) }))) +
            '<form class="rc-search" role="search" method="get" data-nav action="' + escapeHtml(form.action) + '">' + form.hidden +
                (s.range !== DEFAULTS.range ? hiddenInput('range', s.range) : '') +
                (s.range === 'custom' && s.from ? hiddenInput('from', s.from) : '') +
                (s.range === 'custom' && s.to ? hiddenInput('to', s.to) : '') +
                (s.dir !== DEFAULTS.dir ? hiddenInput('dir', s.dir) : '') +
                '<label>' + SEARCH_ICON +
                '<input type="search" name="q" value="' + escapeHtml(s.q) + '" maxlength="' + MAX_QUERY + '" placeholder="Customer, contact or number" aria-label="Search calls"></label></form>' +
            '<a class="rc-btn rc-btn-outline" href="' + escapeHtml(buildUrl(m.base, s, { csv: true })) + '">' +
                svgIcon('M12 3v12M7 10l5 5 5-5M5 21h14', { size: 14, width: 1.8 }) + 'Export CSV</a>' +
            '</div>';
        let body;
        if (m.historyError) {
            body = errorBox('Couldn’t load your calls', m);
        } else if (!m.listRows.length) {
            const filtered = s.q || s.dir !== DEFAULTS.dir;
            body = '<div class="rc-card">' + (filtered
                ? stateBox('No calls match', 'Try a different name or number, or show all calls.',
                    '<a class="rc-btn rc-btn-quiet" data-nav href="' + escapeHtml(buildUrl(m.base, s, { dir: 'all', q: '' })) + '">Clear filters</a>')
                : stateBox(EMPTY_CALLS[s.range], 'Calls you make from NetSuite show up here.')) + '</div>';
        } else {
            body = callTable(m.listRows, m, 'Calls');
        }
        return toolbar + body;
    };

    const buildMissedTab = (m) => {
        if (m.historyError) return errorBox('Couldn’t load your calls', m);
        if (!m.missedRows.length) {
            return '<div class="rc-card">' + stateBox('No missed calls', 'Calls that did not connect show up here.') + '</div>';
        }
        return callTable(m.missedRows, m, 'Missed calls');
    };

    const taskRow = (t, call, m) => {
        const callRowData = m.rangeRows.filter((r) => String(r.id) === String(call.id))[0];
        const meta = [call.companyName || 'Unknown customer']
            .concat(t.proposedDue ? ['due ' + t.proposedDue] : [])
            .concat(callRowData && callRowData.duration ? ['from a ' + formatLength(callRowData.duration) + ' call'] : (call.date ? ['call on ' + call.date] : []));
        return '<div class="rc-task" data-task-id="' + escapeHtml(t.id) + '">' +
            '<div class="rc-task-text"><span class="rc-task-title">' + escapeHtml(t.text || 'Follow-up') + '</span>' +
            '<span class="rc-task-meta">' + escapeHtml(meta.join(' · ')) + '</span>' +
            '<span class="rc-task-err" role="alert" hidden></span></div>' +
            '<button type="button" class="rc-icon-btn" data-act="dismiss" aria-label="' + escapeHtml('Dismiss: ' + (t.text || 'follow-up')) + '">' +
                svgIcon('M6 6l12 12M18 6L6 18', { size: 14, stroke: '#8B8780' }) + '</button>' +
            '<button type="button" class="rc-btn rc-btn-primary" data-act="approve" aria-label="' + escapeHtml('Approve: ' + (t.text || 'follow-up')) + '">' +
                svgIcon('M5 12l5 5L20 7', { stroke: '#FFFFFF', width: 2.2 }) + 'Approve</button>' +
            '</div>';
    };

    const buildFollowupsTab = (m) => {
        if (m.tasksError) return errorBox('Couldn’t load your follow-ups', m);
        const n = m.followupCount;
        const empty = stateBox('No follow-ups to review', 'Follow-ups the AI proposes from your calls show up here.');
        const rows = [];
        m.taskGroups.forEach((g) => (g.tasks || []).forEach((t) => rows.push(taskRow(t, g.call || {}, m))));
        return '<div class="rc-toolbar rc-toolbar-end"' + (n < 2 ? ' hidden' : '') + ' id="rc-approve-all-bar">' +
                '<button type="button" class="rc-btn rc-btn-outline" id="rc-approve-all">Approve all ' + n + '</button></div>' +
            '<div class="rc-card" id="rc-tasks-card"' + (n ? '' : ' hidden') + '><div id="rc-tasks" aria-label="Follow-ups to review" role="list">' +
                rows.join('') + '</div></div>' +
            '<div class="rc-card" id="rc-tasks-empty"' + (n ? ' hidden' : '') + '>' + empty + '</div>';
    };

    const skeleton = () => {
        const widths = ['70%', '55%', '80%', '45%', '65%', '50%'];
        return '<div class="rc-card rc-skel" id="rc-loading" hidden aria-busy="true" aria-label="Loading">' +
            widths.map((w) => '<div class="rc-skel-row"><span style="width:40px"></span><span style="width:' + w + '"></span></div>').join('') + '</div>';
    };

    /**
     * Build the page.
     * @param {Object} m - view model from onRequest
     * @returns {string}
     */
    const buildHtml = (m) => {
        const s = m.state;
        const followupCount = (m.taskGroups || []).reduce((a, g) => a + (g.tasks || []).length, 0);
        m = Object.assign({}, m, { followupCount: followupCount, pendingByCall: m.pendingByCall || {} });
        const form = formTarget(m.base);
        const who = [m.userName, m.repPhone].filter(Boolean).join(' · ');

        const periods = segLinks('Period', RANGES.map((r) => ({
            label: RANGE_LABELS[r], on: s.range === r,
            href: buildUrl(m.base, s, r === 'custom' ? { range: r } : { range: r, from: '', to: '' })
        })));

        const customForm = s.range !== 'custom' ? '' :
            '<form class="rc-custom" method="get" data-nav action="' + escapeHtml(form.action) + '">' + form.hidden +
            hiddenInput('range', 'custom') +
            (s.tab !== DEFAULTS.tab ? hiddenInput('tab', s.tab) : '') +
            (s.dir !== DEFAULTS.dir ? hiddenInput('dir', s.dir) : '') +
            (s.q ? hiddenInput('q', s.q) : '') +
            '<label>From <input type="date" name="from" value="' + escapeHtml(s.from) + '" required></label>' +
            '<label>To <input type="date" name="to" value="' + escapeHtml(s.to) + '" required></label>' +
            '<button type="submit" class="rc-btn rc-btn-outline">Show</button>' +
            (!s.from || !s.to ? '<span class="rc-hint">Showing today until you pick dates.</span>' : '') +
            '</form>';

        const tabCount = {
            calls: '',
            followups: m.tasksError ? '' : String(followupCount),
            missed: m.historyError ? '' : String(m.missedRows.length)
        };
        const tabs = '<nav class="rc-tabs" aria-label="Reporting sections">' + TABS.map((t) =>
            '<a data-nav href="' + escapeHtml(buildUrl(m.base, s, { tab: t })) + '"' + (s.tab === t ? ' aria-current="page"' : '') + '>' +
            escapeHtml(TAB_LABELS[t]) + '<span class="rc-tab-count"' + (t === 'followups' && !m.tasksError ? ' data-followup-count="tab"' : '') + '>' +
            escapeHtml(tabCount[t] === '0' ? '' : tabCount[t]) + '</span></a>'
        ).join('') + '</nav>';

        let content;
        if (s.tab === 'followups') content = buildFollowupsTab(m);
        else if (s.tab === 'missed') content = buildMissedTab(m);
        else content = buildCallsTab(m);

        const cfg = { restletUrl: m.restletUrl || '' };

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reporting Central</title>
${ctcFonts.buildFigtreeStyle()}
<style>${pageCss()}</style>
</head>
<body>
<main class="rc-page">
<header class="rc-head">
<a class="rc-back" href="${DASHBOARD_URL}">${svgIcon('M15 6l-6 6 6 6')}Dashboard</a>
<div class="rc-titlebar">
<h1>Reporting Central</h1>
${who ? '<span class="rc-who">' + escapeHtml(who) + '</span>' : ''}
<span class="rc-spacer"></span>
${periods}
</div>
${customForm}
${tabs}
</header>
${buildKpis(m)}
<div id="rc-content" class="rc-content">${content}</div>
${skeleton()}
</main>
<script>window.CTC_RC = ${safeJsonEmbed(cfg)};</script>
<script>${CLIENT_JS}</script>
</body>
</html>`;
    };

    const pageCss = () => `
  :root {
    --ink: #161513; --muted: #5C5955; --faint: #8B8780; --line: #E5E2DD; --line-soft: #F1EFEA;
    --seg: #F4F2EE; --panel: #FAFAF8; --input: #D9D5CF; --link: #1B6097; --link-hover: #345D7E;
    --blue: #345D7E; --blue-hover: #2B4D69; --focus: #74C0FC;
    --good-fg: #0E6B45; --good-bg: #E3F5EC; --mid-fg: #8A5A00; --mid-bg: #FFF3D6; --low-fg: #9A2A23; --low-bg: #FCE9E7;
    --in-fg: var(--link); --in-bg: #E8F3FC; --out-fg: var(--muted); --out-bg: var(--line-soft); --missed-fg: #9A3A2C; --missed-bg: #FCE9E7;
    --font: ${ctcFonts.FONT_STACK};
    --mono: ${ctcFonts.MONO_STACK};
  }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  body { margin: 0; background: #FFFFFF; color: var(--ink); font-family: var(--font); -webkit-font-smoothing: antialiased; }
  a { color: var(--link); }
  a:hover { color: var(--link-hover); }
  a:focus-visible, button:focus-visible, input:focus-visible { outline: none; box-shadow: 0 0 0 2px #FFFFFF, 0 0 0 4px var(--focus); }
  .rc-page { max-width: 1280px; margin: 0 auto; padding: 28px 40px 64px; display: flex; flex-direction: column; gap: 24px; }
  .rc-head { display: flex; flex-direction: column; gap: 14px; }
  .rc-back { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; font-size: 13px; text-decoration: none; border-radius: 4px; }
  .rc-titlebar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; }
  .rc-titlebar h1 { margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.025em; }
  .rc-who { font-size: 13px; color: var(--muted); }
  .rc-spacer { flex: 1; }
  .rc-seg { display: inline-flex; max-width: 100%; overflow-x: auto; padding: 2px; border-radius: 8px; background: var(--seg); }
  .rc-seg a { flex: none; display: inline-flex; align-items: center; height: 30px; padding: 0 12px; border-radius: 6px; font-size: 13px; font-weight: 500;
    color: var(--muted); text-decoration: none; white-space: nowrap; transition: background-color 120ms ease, color 120ms ease; }
  .rc-seg a:hover { color: var(--ink); }
  .rc-seg a[aria-current="true"] { background: #FFFFFF; color: var(--ink); box-shadow: 0 1px 2px rgba(22,21,19,0.10); }
  .rc-custom { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 10px; font-size: 13px; color: var(--muted); }
  .rc-custom label { display: inline-flex; align-items: center; gap: 6px; }
  .rc-custom input { height: 32px; padding: 0 8px; border: 0; border-radius: 8px; box-shadow: inset 0 0 0 1px var(--input); font: 13px var(--font); color: var(--ink); background: #FFFFFF; }
  .rc-hint { font-size: 12px; }
  .rc-tabs { display: flex; gap: 28px; box-shadow: inset 0 -1px 0 var(--line); overflow-x: auto; }
  .rc-tabs a { display: inline-flex; align-items: center; gap: 6px; padding-bottom: 12px; font-size: 14px; color: var(--muted); text-decoration: none; white-space: nowrap; }
  .rc-tabs a:hover { color: var(--ink); }
  .rc-tabs a[aria-current="page"] { color: var(--ink); font-weight: 600; box-shadow: inset 0 -2px 0 var(--ink); }
  .rc-tab-count { font-size: 12px; font-weight: 400; color: var(--muted); font-variant-numeric: tabular-nums; }
  .rc-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); border-radius: 12px; box-shadow: inset 0 0 0 1px var(--line-soft); background: var(--panel); overflow: hidden; }
  .rc-kpi { padding: 16px 20px; display: flex; flex-direction: column; gap: 4px; box-shadow: inset 1px 0 0 var(--line-soft); }
  .rc-kpi-label, .rc-kpi-unit, .rc-kpi-delta { font-size: 12px; color: var(--muted); }
  .rc-kpi-main { display: flex; align-items: baseline; gap: 6px; }
  .rc-kpi-value { font-size: 24px; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
  .rc-kpi-delta.rc-good { color: var(--good-fg); }
  .rc-content { display: flex; flex-direction: column; gap: 24px; }
  .rc-toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .rc-toolbar-end { justify-content: flex-end; }
  .rc-search { flex: 1 1 260px; margin: 0; }
  .rc-search label { display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px; border-radius: 8px; box-shadow: inset 0 0 0 1px var(--input); }
  .rc-search label:focus-within { box-shadow: inset 0 0 0 1px var(--blue), 0 0 0 3px rgba(116,192,252,0.35); }
  .rc-search input { flex: 1; min-width: 0; border: 0; outline: none; font: 14px var(--font); color: var(--ink); background: transparent; }
  .rc-search input:focus-visible { box-shadow: none; }
  .rc-btn { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px; border: 0; border-radius: 8px; font: 500 13px var(--font);
    color: var(--ink); background: transparent; text-decoration: none; cursor: pointer; white-space: nowrap;
    transition: background-color 120ms ease, transform 140ms ease-out, opacity 120ms ease; }
  .rc-btn:hover { color: var(--ink); }
  .rc-btn:active { transform: scale(0.97); }
  .rc-btn:disabled { opacity: 0.4; cursor: default; transform: none; }
  .rc-btn-outline { box-shadow: inset 0 0 0 1px var(--input); background: #FFFFFF; }
  .rc-btn-outline:hover { background: var(--panel); }
  .rc-btn-primary { height: 32px; background: var(--blue); color: #FFFFFF; font-weight: 600; font-size: 12.5px; }
  .rc-btn-primary:hover { background: var(--blue-hover); color: #FFFFFF; }
  .rc-btn-quiet { height: 30px; color: var(--link); }
  .rc-btn-quiet:hover { color: var(--link-hover); }
  .rc-card { border-radius: 12px; background: #FFFFFF; box-shadow: 0 0 0 1px rgba(22,21,19,0.08), 0 1px 2px rgba(22,21,19,0.04); }
  .rc-scroll { overflow-x: auto; }
  .rc-table { min-width: 680px; }
  .rc-row { position: relative; display: grid; grid-template-columns: 150px minmax(180px, 1.4fr) minmax(160px, 1.6fr) 56px 64px; gap: 14px;
    align-items: center; min-height: 58px; padding: 0 18px; border-bottom: 1px solid var(--line-soft); transition: background-color 120ms ease; }
  .rc-row:last-child { border-bottom: 0; }
  .rc-row:not(.rc-row-head):hover { background: var(--panel); }
  .rc-row-head { min-height: 0; padding: 12px 18px; font-size: 12px; color: var(--muted); border-bottom: 1px solid var(--line); }
  .rc-right { text-align: right; }
  .rc-when { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .rc-when svg { flex: none; }
  .rc-dir { display: inline-flex; align-items: center; justify-content: flex-start; gap: 3px; flex: none; min-width: 70px; padding: 1px 7px; border-radius: 999px; font-size: 11px; font-weight: 600; line-height: 1.4; white-space: nowrap; }
  .rc-dir svg { display: block; }
  .rc-dir-in { background: var(--in-bg); color: var(--in-fg); }
  .rc-dir-out { background: var(--out-bg); color: var(--out-fg); }
  .rc-dir-missed { background: var(--missed-bg); color: var(--missed-fg); }
  .rc-when-text { display: flex; flex-direction: column; min-width: 0; }
  .rc-row-link { color: var(--muted); text-decoration: none; }
  .rc-row-link:hover { color: var(--muted); }
  .rc-row-link::after { content: ''; position: absolute; inset: 0; border-radius: inherit; }
  .rc-row-link:focus-visible { box-shadow: none; }
  .rc-row-link:focus-visible::after { box-shadow: inset 0 0 0 2px var(--focus); }
  .rc-date { font-size: 11.5px; color: var(--faint); }
  .rc-who-cell { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .rc-co { position: relative; z-index: 1; align-self: flex-start; max-width: 100%; font-size: 14px; font-weight: 500; color: var(--ink); text-decoration: none;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  a.rc-co:hover { color: var(--link); text-decoration: underline; }
  .rc-contact { font-size: 12.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rc-after { font-size: 13px; }
  .rc-vm { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .rc-vm-brief { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rc-muted { color: var(--muted); }
  .rc-warn { color: var(--mid-fg); }
  .rc-bad { color: var(--low-fg); }
  .rc-sat { display: inline-flex; height: 22px; padding: 0 8px; align-items: center; border-radius: 999px; font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .rc-sat-good { background: var(--good-bg); color: var(--good-fg); }
  .rc-sat-mid { background: var(--mid-bg); color: var(--mid-fg); }
  .rc-sat-low { background: var(--low-bg); color: var(--low-fg); }
  .rc-sat-none { background: var(--seg); color: var(--faint); }
  .rc-len { font-family: var(--mono); font-size: 12px; text-align: right; font-variant-numeric: tabular-nums; }
  .rc-state { min-height: 200px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 24px 16px; text-align: center; }
  .rc-state-title { font-size: 13.5px; font-weight: 500; }
  .rc-state-sub { font-size: 12px; color: var(--muted); }
  .rc-state .rc-btn { height: 30px; font-size: 12px; }
  #rc-tasks { padding: 4px 8px; }
  .rc-task { display: flex; align-items: center; gap: 14px; padding: 12px 10px; border-bottom: 1px solid var(--line-soft); overflow: hidden;
    transition: opacity 200ms ease-out, height 200ms ease-out, padding 200ms ease-out; }
  .rc-task:last-child { border-bottom: 0; }
  .rc-task-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .rc-task-title { font-size: 13.5px; font-weight: 500; }
  .rc-task-meta { font-size: 12px; color: var(--muted); }
  .rc-task-err { font-size: 12px; color: var(--low-fg); }
  .rc-icon-btn { flex: none; width: 32px; height: 32px; border: 0; border-radius: 8px; background: transparent; display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: background-color 120ms ease, transform 140ms ease-out; }
  .rc-icon-btn:hover { background: var(--seg); }
  .rc-icon-btn:active { transform: scale(0.97); }
  .rc-icon-btn:disabled { opacity: 0.4; cursor: default; }
  .rc-skel { padding: 18px; display: flex; flex-direction: column; gap: 14px; }
  .rc-skel-row { display: flex; gap: 10px; align-items: center; }
  .rc-skel-row span { height: 10px; border-radius: 4px; background: var(--line-soft); }
  @media (max-width: 720px) {
    .rc-page { padding: 20px 16px 48px; }
    .rc-custom { justify-content: flex-start; }
  }
  @media (prefers-reduced-motion: reduce) {
    .rc-btn:active, .rc-icon-btn:active { transform: none; }
    .rc-task { transition: opacity 200ms ease-out; }
  }
`;

    // Client script: plain ES5 inside a template literal. No backticks, no
    // dollar-brace, no backslashes.
    const CLIENT_JS = `
(function () {
  var CFG = window.CTC_RC || {};
  var BATCH = 25;
  function byId(id) { return document.getElementById(id); }
  function closest(el, sel) { return el && el.closest ? el.closest(sel) : null; }

  function setLoading(on) {
    var content = byId('rc-content'), skel = byId('rc-loading');
    if (!content || !skel) return;
    content.hidden = on;
    skel.hidden = !on;
  }
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (closest(e.target, 'a[data-nav]')) setLoading(true);
  });
  Array.prototype.forEach.call(document.querySelectorAll('form[data-nav]'), function (f) {
    f.addEventListener('submit', function () { setLoading(true); });
  });
  window.addEventListener('pageshow', function () { setLoading(false); });

  var list = byId('rc-tasks');
  if (!list) return;
  var approveAll = byId('rc-approve-all');
  var FAILED = 'Couldn’t save that. Try again.';

  function post(body) {
    return fetch(CFG.restletUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function liveRows() { return list.querySelectorAll('.rc-task:not(.rc-leaving)'); }
  function refreshCounts() {
    var n = liveRows().length;
    Array.prototype.forEach.call(document.querySelectorAll('[data-followup-count]'), function (el) {
      el.textContent = (n === 0 && el.getAttribute('data-followup-count') === 'tab') ? '' : String(n);
    });
    if (approveAll) approveAll.textContent = 'Approve all ' + n;
    var bar = byId('rc-approve-all-bar');
    if (bar) bar.hidden = n < 2;
    if (n === 0) {
      byId('rc-tasks-card').hidden = true;
      byId('rc-tasks-empty').hidden = false;
    }
  }
  function removeRow(row) {
    if (!row || row.classList.contains('rc-leaving')) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    row.classList.add('rc-leaving');
    row.style.height = row.offsetHeight + 'px';
    void row.offsetHeight;
    row.style.opacity = '0';
    if (!reduce) {
      row.style.height = '0px';
      row.style.paddingTop = '0px';
      row.style.paddingBottom = '0px';
    }
    setTimeout(function () {
      if (row.parentNode) row.parentNode.removeChild(row);
      refreshCounts();
    }, 220);
    refreshCounts();
  }
  function setBusy(row, busy) {
    Array.prototype.forEach.call(row.querySelectorAll('button'), function (b) { b.disabled = busy; });
  }
  function showError(row, msg) {
    var el = row.querySelector('.rc-task-err');
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
  }
  function done(d) { return !!d && (d.ok === true || d.error === 'already_actioned'); }
  function errorText(d) {
    return d && d.error === 'forbidden' ? 'Only the customer’s sales rep can review this.' : FAILED;
  }
  function rowFor(id) {
    var rows = list.querySelectorAll('.rc-task');
    for (var i = 0; i < rows.length; i++) if (rows[i].getAttribute('data-task-id') === String(id)) return rows[i];
    return null;
  }

  list.addEventListener('click', function (e) {
    var btn = closest(e.target, 'button[data-act]');
    if (!btn) return;
    var row = closest(btn, '.rc-task');
    if (!row) return;
    var action = btn.getAttribute('data-act') === 'approve' ? 'approveProposedTask' : 'rejectProposedTask';
    setBusy(row, true);
    showError(row, '');
    post({ action: action, taskId: row.getAttribute('data-task-id') }).then(function (d) {
      if (done(d)) { removeRow(row); return; }
      setBusy(row, false);
      showError(row, errorText(d));
    }).catch(function () {
      setBusy(row, false);
      showError(row, FAILED);
    });
  });

  if (approveAll) approveAll.addEventListener('click', function () {
    var rows = liveRows();
    var ids = [];
    for (var i = 0; i < rows.length; i++) {
      ids.push(rows[i].getAttribute('data-task-id'));
      setBusy(rows[i], true);
      showError(rows[i], '');
    }
    if (!ids.length) return;
    approveAll.disabled = true;
    var batches = [];
    for (var j = 0; j < ids.length; j += BATCH) batches.push(ids.slice(j, j + BATCH));
    var chain = Promise.resolve();
    batches.forEach(function (batch) {
      chain = chain.then(function () {
        return post({ action: 'bulkApproveProposedTasks', taskIds: batch }).then(function (d) {
          var results = (d && d.results) || [];
          batch.forEach(function (id) {
            var row = rowFor(id);
            if (!row) return;
            var r = null;
            for (var k = 0; k < results.length; k++) if (String(results[k].taskId) === String(id)) r = results[k];
            if (done(r)) { removeRow(row); return; }
            setBusy(row, false);
            showError(row, errorText(r || d));
          });
        }).catch(function () {
          batch.forEach(function (id) {
            var row = rowFor(id);
            if (!row) return;
            setBusy(row, false);
            showError(row, FAILED);
          });
        });
      });
    });
    chain.then(function () { approveAll.disabled = false; });
  });
})();
`;

    return {
        onRequest,
        // exported for tests
        parseParams,
        buildUrl,
        formTarget,
        formatLength,
        formatPhone,
        afterCall,
        csvCell,
        buildHtml
    };
});
