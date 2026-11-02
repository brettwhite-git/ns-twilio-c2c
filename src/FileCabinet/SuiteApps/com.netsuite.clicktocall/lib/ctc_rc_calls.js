// @ts-check
/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Reporting Central calls content: the Calls tab (one list card with its
 * own toolbar: All · Connected · Missed · Outbound with counts, search,
 * Export CSV; the call table; the compact list and the call detail panel
 * opened without a reload), the CSV export, and the KPI strip (used by the
 * Follow-ups tab until phase D moves it to Overview). The page shell is
 * lib/ctc_rc_shell.js. The detail data comes from the ctc_rl_token RESTlet
 * action getCallDetail (CALLS_CLIENT_JS).
 */
define(['N/format', './ctc_html', './ctc_workspace_queries', './ctc_rc_shell'], (format, ctcHtml, wq, rcShell) => {

    const escapeHtml = ctcHtml.escapeHtml;
    const buildUrl = rcShell.buildUrl;
    const svgIcon = rcShell.svgIcon;
    const stateBox = rcShell.stateBox;
    const DEFAULTS = rcShell.DEFAULTS;

    const CALL_URL = '/app/crm/calendar/call.nl?id=';
    const ENTITY_URL = '/app/common/entity/custjob.nl?id=';
    const SHORT_CALL_SECONDS = ctcHtml.SHORT_CALL_SECONDS;

    // The list filters (segmented tabs, URL `dir`). Counts use the same rule
    // as the list (wq.filterCallRows): Missed = wq.isMissedCall; Connected =
    // not missed, talk time, not a voicemail; Outbound = outbound, not missed.
    const CALL_TABS = [
        { dir: 'all', label: 'All' },
        { dir: 'connected', label: 'Connected' },
        { dir: 'missed', label: 'Missed' },
        { dir: 'outbound', label: 'Outbound' }
    ];
    const EMPTY_CALLS = {
        today: 'No calls yet today', yesterday: 'No calls yesterday', last7: 'No calls in the last 7 days',
        thisweek: 'No calls this week', lastweek: 'No calls last week', last30: 'No calls in the last 30 days',
        thismonth: 'No calls this month', custom: 'No calls in these dates'
    };

    const CSV_HEADERS = ['When', 'Direction', 'Customer', 'Contact', 'Phone', 'Length (s)', 'Satisfaction', 'After the call'];

    // Direction icon before the time (matches the portlet's
    // ctc-pl-status-dir): 20 px circle, 12 px arrow (down-left for in /
    // missed, up-right for out), aria-label (+ title in the table). Missed =
    // wq.isMissedCall; the Outcome chip carries words, so the meaning is
    // never colour alone.
    const DIR_CHIP = {
        in:     { aria: 'Inbound call' },
        out:    { aria: 'Outbound call' },
        missed: { aria: 'Missed call' }
    };
    const ARROW = { inbound: 'M17 7L7 17M15 17H7V9', outbound: 'M7 17L17 7M9 7h8v8' };

    // Direction labels for the CSV (directionKey: missed = wq.isMissedCall).
    const ICONS = {
        outbound: { label: 'Outbound' },
        inbound: { label: 'Inbound' },
        missed: { label: 'Missed' }
    };

    // Detail panel icons (16 px; the design reference's paths).
    const ICON = {
        close: 'M18 6L6 18M6 6l12 12',
        up: 'M18 15l-6-6-6 6',
        down: 'M6 9l6 6 6-6',
        link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
        external: 'M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5',
        phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z',
        download: 'M12 4v11M7 10l5 5 5-5M5 20h14'
    };

    const SEARCH_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5C5955" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
        '<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>';

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
     * "After the call" words for a call row: the CSV column of that name.
     * (The page shows the Outcome chip, ctcHtml.outcomeOf.)
     * @param {Object} row - loadHistoryRows row
     * @param {number} pending - pending follow-ups from this call
     * @returns {{text: string, tone: string, chip?: string}} tone: 'muted' | 'warn';
     *   chip ('missed' | 'quiet') for an unanswered call
     */
    const afterCall = (row, pending) => {
        // Unanswered calls read like the portlet (shared CALL_STATUS_RULES):
        // status Missed / inbound with no talk time -> "Missed call";
        // status No answer / outbound with no talk time -> "No answer".
        const unanswered = ctcHtml.unansweredRule(row);
        if (unanswered) return { text: unanswered.text, tone: 'muted', chip: unanswered.chip };
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

    // Missed = wq.isMissedCall: status 'Missed', a voicemail, or an inbound
    // call with no talk time. The icon, the CSV and the Missed filter use
    // this one rule.
    const directionKey = (row) => (wq.isMissedCall(row) ? 'missed' : (row.direction === 'inbound' ? 'inbound' : 'outbound'));

    // Direction chip kind for a call row: 'missed' | 'in' | 'out'.
    const DIR_KIND = { missed: 'missed', inbound: 'in', outbound: 'out' };
    const dirChipKind = (row) => DIR_KIND[directionKey(row)];

    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    /**
     * Short date for the line under the time: "Oct 30", with the year when
     * it is not `thisYear` ("Oct 30, 2025"). The row date is a NetSuite date
     * string in the user's format; one that cannot be parsed is shown as is.
     * @param {string} nsDate
     * @param {number} thisYear
     * @returns {string}
     */
    const shortDate = (nsDate, thisYear) => {
        let d = null;
        try {
            d = format.parse({ value: nsDate, type: format.Type.DATE });
        } catch (e) {
            d = null;
        }
        if (!(d instanceof Date) || isNaN(d.getTime())) return String(nsDate || '');
        const y = d.getFullYear();
        return MONTHS[d.getMonth()] + ' ' + d.getDate() + (y !== thisYear ? ', ' + y : '');
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
     * CSV for the current calls list. `withOwner` (a manager's team or
     * member view) adds an "Owner" column after "When".
     * @param {Array<Object>} rows
     * @param {Object<string, number>} pendingByCall
     * @param {boolean} [withOwner]
     * @returns {string}
     */
    const toCsv = (rows, pendingByCall, withOwner) => {
        const headers = withOwner ? [CSV_HEADERS[0], 'Owner'].concat(CSV_HEADERS.slice(1)) : CSV_HEADERS;
        const lines = [headers.map(csvCell).join(',')];
        (rows || []).forEach((r) => {
            const dir = directionKey(r);
            const cells = [
                [r.date, r.timeOfDay].filter(Boolean).join(' '),
                ICONS[dir].label,
                r.companyName || '',
                r.contactName || '',
                r.phone || '',
                Math.max(0, Number(r.duration) || 0),
                typeof r.satisfaction === 'number' && r.satisfaction ? r.satisfaction : '',
                afterCall(r, (pendingByCall || {})[r.id] || 0).text
            ];
            if (withOwner) cells.splice(1, 0, r.ownerName || '');
            lines.push(cells.map(csvCell).join(','));
        });
        return lines.join('\r\n') + '\r\n';
    };

    // ─── KPIs (Follow-ups tab; phase D moves the strip to Overview) ────────

    const kpiCell = (k) =>
        '<div class="rc-kpi"><span class="rc-kpi-label">' + escapeHtml(k.label) + '</span>' +
        '<span class="rc-kpi-main"><span class="rc-kpi-value"' + (k.attr || '') + '>' + escapeHtml(k.value) + '</span>' +
        '<span class="rc-kpi-unit">' + escapeHtml(k.unit || '') + '</span></span>' +
        '<span class="rc-kpi-delta' + (k.tone ? ' rc-' + k.tone : '') + '">' + (k.delta ? escapeHtml(k.delta) : '&nbsp;') + '</span></div>';

    /**
     * The KPI strip. The calls delta compares with `m.range.previous`
     * (lib/ctc_rc_scope.js) when the page counted it.
     * @param {Object} m - view model
     * @returns {string}
     */
    const buildKpis = (m) => {
        const k = m.kpis;
        const none = m.historyError;
        let callsDelta = '', callsTone = '';
        if (!none && typeof m.previousCount === 'number' && m.range && m.range.previous) {
            const diff = k.calls - m.previousCount;
            const label = m.range.previous.label;
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

    // ─── Calls tab: pieces ─────────────────────────────────────────────────

    /**
     * Count per list filter for the current search (the same rule as the
     * list: wq.filterCallRows).
     * @param {Array<Object>} rows - the range's rows
     * @param {string} q - search text
     * @returns {Object<string, number>} dir -> count
     */
    const tabCounts = (rows, q) => {
        /** @type {Object<string, number>} */
        const out = {};
        CALL_TABS.forEach((t) => { out[t.dir] = wq.filterCallRows(rows || [], { direction: t.dir, search: q }).length; });
        return out;
    };

    // Compact rows leave out the title: the row is a button that reads its
    // whole text.
    const dirChip = (r, compact) => {
        const kind = dirChipKind(r);
        return '<span class="rc-dir rc-dir-' + kind + '" role="img" aria-label="' + DIR_CHIP[kind].aria + '"' +
            (compact ? '' : ' title="' + DIR_CHIP[kind].aria + '"') + '>' +
            svgIcon(kind === 'out' ? ARROW.outbound : ARROW.inbound, { size: 12, width: 2.2 }) + '</span>';
    };

    const outcomeChip = (o) => '<span class="rc-out rc-out-' + o.tone + '">' + escapeHtml(o.text) + '</span>';

    const satCell = (n) => {
        const b = ctcHtml.satBand(n);
        return '<span class="rc-satb rc-satb-' + b.band + '"><i aria-hidden="true"></i>' + escapeHtml(b.text) + '</span>';
    };

    const ownerCell = (name) => {
        const ini = rcShell.initials(name);
        return '<span class="rc-owner">' + (ini ? '<span class="rc-ini" aria-hidden="true">' + escapeHtml(ini) + '</span>' : '') +
            '<span class="rc-owner-name">' + escapeHtml(name || '—') + '</span></span>';
    };

    // "Oct 30, 11:02" (either alone when the other is blank).
    const whenText = (r, thisYear) =>
        [r.date ? shortDate(r.date, thisYear) : '', r.timeOfDay || ''].filter(Boolean).join(', ');

    /**
     * What the detail panel needs before its data arrives, and what the
     * client keeps the row in step with after an approve / dismiss. Raw
     * values; the client shows the fallbacks.
     * @param {Object} r - loadHistoryRows row
     * @param {Object} m - view model
     * @returns {string} data-* attributes (leading space)
     */
    const rowData = (r, m) => {
        const pending = m.pendingByCall[r.id] || 0;
        const done = ctcHtml.outcomeOf(r, 0);
        const sat = ctcHtml.satBand(r.satisfaction);
        const attrs = {
            'data-call-id': r.id,
            'data-company': r.companyName || '',
            'data-company-id': r.companyId || '',
            'data-contact': r.contactName || '',
            'data-owner': r.ownerName || '',
            'data-phone': r.phone || '',
            'data-phone-text': formatPhone(r.phone),
            'data-when': whenText(r, m.thisYear),
            'data-dir': dirChipKind(r),
            'data-len': formatLength(r.duration),
            'data-sat': sat.text,
            'data-sat-band': sat.band,
            'data-pending': String(pending),
            // The outcome once its follow-ups are reviewed.
            'data-out-done': done.text,
            'data-out-done-tone': done.tone
        };
        return Object.keys(attrs).map((k) => ' ' + k + '="' + escapeHtml(attrs[k]) + '"').join('');
    };

    const callRow = (r, m) => {
        const out = ctcHtml.outcomeOf(r, m.pendingByCall[r.id] || 0);
        const multiDay = m.range ? m.range.from !== m.range.to : true;
        const when = r.timeOfDay || r.date || '—';
        const company = r.companyName || 'Unknown caller';
        const contact = r.contactName || (r.companyId ? 'Main line' : '—');
        return '<div role="row" class="rc-row' + (m.selectedId === String(r.id) ? ' rc-cur' : '') + '"' + rowData(r, m) + '>' +
            '<span role="cell" class="rc-when">' + dirChip(r) +
                '<span class="rc-when-text"><a class="rc-row-link" href="' + escapeHtml(buildUrl(m.base, m.state, { call: r.id })) + '" aria-label="' +
                escapeHtml('Open call with ' + company + ', ' + [r.date, r.timeOfDay].filter(Boolean).join(' ')) + '">' + escapeHtml(when) + '</a>' +
                (multiDay && r.timeOfDay && r.date ? '<span class="rc-date">' + escapeHtml(shortDate(r.date, m.thisYear)) + '</span>' : '') + '</span></span>' +
            '<span role="cell" class="rc-co">' + escapeHtml(company) + '</span>' +
            '<span role="cell" class="rc-contact">' + escapeHtml(contact) + '</span>' +
            (m.teamView ? '<span role="cell">' + ownerCell(r.ownerName) + '</span>' : '') +
            '<span role="cell" class="rc-phone">' + escapeHtml(formatPhone(r.phone) || '—') + '</span>' +
            '<span role="cell">' + outcomeChip(out) + '</span>' +
            '<span role="cell">' + satCell(r.satisfaction) + '</span>' +
            '<span role="cell" class="rc-len">' + escapeHtml(formatLength(r.duration)) + '</span>' +
            '</div>';
    };

    // Compact row (drilled in, or a narrow region): one button; company and
    // "date · time" on line 1, "[owner · ]outcome · length" on line 2.
    const compactRow = (r, m) => {
        const on = m.selectedId === String(r.id);
        const date = r.date ? shortDate(r.date, m.thisYear) : '';
        const out = ctcHtml.outcomeOf(r, m.pendingByCall[r.id] || 0);
        return '<button type="button" role="option" class="rc-crow" tabindex="-1" data-call-id="' + escapeHtml(r.id) + '" aria-selected="' + on + '">' +
            dirChip(r, true) +
            '<span class="rc-crow-main"><span class="rc-crow-line">' +
                '<span class="rc-crow-co">' + escapeHtml(r.companyName || 'Unknown caller') + '</span>' +
                '<span class="rc-crow-when">' + escapeHtml([date, r.timeOfDay].filter(Boolean).join(' · ')) + '</span></span>' +
            '<span class="rc-crow-sub">' + (m.teamView && r.ownerName ? escapeHtml(r.ownerName) + ' · ' : '') +
                '<span class="rc-crow-out">' + escapeHtml(out.text) + '</span> · ' + escapeHtml(formatLength(r.duration)) + '</span></span>' +
            '</button>';
    };

    const headCells = (m) => ['When', 'Company', 'Contact'].concat(m.teamView ? ['Owner'] : [], ['Phone', 'Outcome', 'Satisfaction'])
        .map((h) => '<span role="columnheader">' + h + '</span>').join('') +
        '<span role="columnheader" class="rc-right">Length</span>';

    const iconBtn = (act, label, title, path) =>
        '<button type="button" class="rc-d-btn" data-d="' + act + '" aria-label="' + escapeHtml(label) + '" title="' + escapeHtml(title) + '">' +
        svgIcon(path, { size: 16 }) + '</button>';

    // Placeholder bars while a call loads (the client draws its own after).
    const detailSkeleton = () =>
        '<div class="rc-skel-block" aria-busy="true" aria-label="Loading">' +
        ['40%', '75%', '55%', '100%', '90%', '65%'].map((w) => '<span class="rc-skel-line" style="width:' + w + '"></span>').join('') + '</div>';

    /**
     * The detail panel (wide: beside the compact list; narrow: a sheet over
     * a scrim). Hidden until a call opens; the client fills the body. No
     * Call button when the phone mode shell is not deployed.
     * @param {Object} m - view model
     * @returns {string}
     */
    const detailPanel = (m) => {
        const id = m.selectedId;
        return '<div class="rc-scrim" id="rc-scrim"></div>' +
            '<aside class="rc-detail" id="rc-detail" aria-label="Call detail" tabindex="-1"' + (id ? '' : ' hidden') + '>' +
            '<div class="rc-d-bar">' +
                iconBtn('close', 'Close (Esc)', 'Close (Esc)', ICON.close) +
                '<span class="rc-d-sep" aria-hidden="true"></span>' +
                iconBtn('prev', 'Previous call (↑)', 'Previous (↑)', ICON.up) +
                iconBtn('next', 'Next call (↓)', 'Next (↓)', ICON.down) +
                '<span class="rc-d-pos" data-d="pos"></span>' +
                '<span class="rc-spacer"></span>' +
                '<span class="rc-d-copied" data-d="copied" role="status"></span>' +
                iconBtn('copy', 'Copy link to this call', 'Copy link', ICON.link) +
                '<a class="rc-d-open" data-d="record" target="_blank" rel="noopener" href="' + (id ? escapeHtml(CALL_URL + encodeURIComponent(id)) : '#') + '">' +
                    'Open record' + svgIcon(ICON.external, { size: 12, width: 2.2 }) + '</a>' +
            '</div>' +
            '<input class="rc-d-linkbox" data-d="linkbox" type="text" readonly aria-label="Link to this call" hidden>' +
            '<div class="rc-d-body" data-d="body">' + detailSkeleton() + '</div>' +
            '<div class="rc-d-foot" data-d="foot">' +
                (m.shellUrl
                    ? '<button type="button" class="rc-btn rc-btn-call" data-d="call">' + svgIcon(ICON.phone, { size: 14, width: 2.2 }) +
                        '<span data-d="call-label">Call again</span></button>'
                    : '') +
                '<a class="rc-btn rc-btn-outline" data-d="rec" target="_blank" rel="noopener" hidden>Recording</a>' +
            '</div>' +
            '</aside>';
    };

    /**
     * The card's toolbar: list filters with counts, search, Export CSV
     * (hidden while a call is open).
     * @param {Object} m - view model
     * @returns {string}
     */
    const listBar = (m) => {
        const s = m.state;
        const form = rcShell.formTarget(m.base);
        const counts = m.tabCounts || {};
        return '<div class="rc-list-bar">' +
            '<nav class="rc-ftabs" aria-label="Show">' + CALL_TABS.map((t) =>
                '<a data-nav href="' + escapeHtml(buildUrl(m.base, s, { dir: t.dir })) + '"' + (s.dir === t.dir ? ' aria-current="true"' : '') + '>' +
                escapeHtml(t.label) + ' <span class="rc-count">' + (m.historyError ? '—' : String(counts[t.dir] || 0)) + '</span></a>'
            ).join('') + '</nav>' +
            '<form class="rc-search" role="search" method="get" data-nav action="' + escapeHtml(form.action) + '">' + form.hidden +
                rcShell.stateInputs(s, ['tab', 'q']) +
                '<label>' + SEARCH_ICON +
                '<input type="search" name="q" value="' + escapeHtml(s.q) + '" maxlength="' + rcShell.MAX_QUERY + '" placeholder="Company, contact or number" aria-label="Search calls"></label></form>' +
            '<a class="rc-btn rc-btn-outline rc-csv" href="' + escapeHtml(buildUrl(m.base, s, { csv: true })) + '" title="Export the calls in this list">' +
                svgIcon(ICON.download, { size: 14, width: 2 }) + 'Export CSV</a>' +
            '</div>';
    };

    // ─── Calls tab ─────────────────────────────────────────────────────────

    /**
     * The Calls tab: one card (toolbar, then the table / compact list or a
     * state) and the detail panel. Drilled in (m.selectedId, from `call=`)
     * when the call is in this list.
     * @param {Object} m - view model (listRows, rangeRows, tabCounts, pendingByCall,
     *   selectedId, teamView, thisYear, shellUrl, historyError)
     * @returns {string}
     */
    const buildCallsTab = (m) => {
        const s = m.state;
        if (m.historyError) {
            return '<section class="rc-card rc-list">' + listBar(m) +
                stateBox('Couldn’t load your calls', 'Your calls are safe. Reload to try again.',
                    '<a class="rc-btn rc-btn-outline" href="' + escapeHtml(buildUrl(m.base, s)) + '">Try again</a>') + '</section>';
        }
        const rows = m.listRows;
        if (!rows.length) {
            let box;
            if (s.dir === 'missed' && !s.q) box = stateBox('No missed calls', 'Missed calls and voicemails show up here.');
            else if (s.q || s.dir !== DEFAULTS.dir) {
                box = stateBox('No calls match', 'Try a different name or number, or show all calls.',
                    '<a class="rc-btn rc-btn-quiet" data-nav href="' + escapeHtml(buildUrl(m.base, s, { dir: 'all', q: '' })) + '">Clear filters</a>');
            } else box = stateBox(EMPTY_CALLS[s.range], 'Calls you make from NetSuite show up here.');
            return '<section class="rc-card rc-list">' + listBar(m) + box + '</section>';
        }
        const label = 'Calls';
        return '<div class="rc-split rc-fill' + (m.selectedId ? ' rc-drilled' : '') + '" id="rc-split" data-selected="' + escapeHtml(m.selectedId) + '">' +
            '<section class="rc-card rc-list" id="rc-list" tabindex="0" aria-label="Call list" aria-describedby="rc-keys">' +
                listBar(m) +
                '<div class="rc-table-scroll"><div role="table" aria-label="' + label + '" class="rc-table' + (m.teamView ? ' rc-table-team' : '') + '">' +
                    '<div role="row" class="rc-row rc-row-head">' + headCells(m) + '</div>' +
                    rows.map((r) => callRow(r, m)).join('') + '</div></div>' +
                '<div class="rc-compact" role="listbox" aria-label="' + label + '">' + rows.map((r) => compactRow(r, m)).join('') + '</div>' +
                '<div class="rc-list-foot"><span class="rc-shown">' + rows.length + ' of ' + (m.rangeRows || rows).length + ' calls</span>' +
                    '<span class="rc-keys" id="rc-keys"><kbd>↑</kbd><kbd>↓</kbd> move <kbd>Enter</kbd> open <kbd>Esc</kbd> close</span></div>' +
            '</section>' +
            detailPanel(m) +
            '</div>';
    };

    // ─── CSS ───────────────────────────────────────────────────────────────

    const OUTCOME_CSS = Object.keys(ctcHtml.OUTCOME_TONES).map((k) =>
        '  .rc-out-' + k + ' { background: ' + ctcHtml.OUTCOME_TONES[k].bg + '; color: ' + ctcHtml.OUTCOME_TONES[k].fg + '; }').join('\n');
    const SAT_CSS = Object.keys(ctcHtml.SAT_BANDS).map((k) =>
        '  .rc-satb-' + k + ' { color: ' + ctcHtml.SAT_BANDS[k].fg + '; } .rc-satb-' + k + ' i { background: ' + ctcHtml.SAT_BANDS[k].dot + '; }').join('\n');

    const CALLS_CSS = `
  :root { --sel-bg: #EEF3F9; --cur-bg: #F4F7FB; --cur-bar: #9DB4CF; --customer: #6B4C8A; --amber-hover: #E9A62A; --amber-ink: #2B1F00;
    --navy-hover: #2B4566; --ftabs: #EDEBE7; --count-bg: #E5E2DD; --head-bg: #FAFAF8; }
  .rc-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); border-radius: 12px; box-shadow: inset 0 0 0 1px var(--line-soft); background: var(--panel); overflow: hidden; }
  .rc-kpi { padding: 16px 20px; display: flex; flex-direction: column; gap: 4px; box-shadow: inset 1px 0 0 var(--line-soft); }
  .rc-kpi-label, .rc-kpi-unit, .rc-kpi-delta { font-size: 12px; color: var(--muted); }
  .rc-kpi-main { display: flex; align-items: baseline; gap: 6px; }
  .rc-kpi-value { font-size: 24px; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
  .rc-kpi-delta.rc-good { color: var(--good-fg); }
  .rc-spacer { flex: 1; }
  /* List card + its toolbar */
  .rc-list { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; }
  .rc-list:focus-visible { outline: none; box-shadow: 0 0 0 2px #FFFFFF, 0 0 0 4px var(--focus); }
  .rc-list-bar { flex: none; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--line); }
  .rc-ftabs { display: inline-flex; gap: 2px; max-width: 100%; overflow-x: auto; padding: 3px; border-radius: 10px; background: var(--ftabs); }
  .rc-ftabs a { flex: none; display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: 8px; font-size: 13px; font-weight: 500;
    color: var(--muted); text-decoration: none; white-space: nowrap; }
  .rc-ftabs a[aria-current="true"] { background: #FFFFFF; color: var(--ink); box-shadow: 0 1px 2px rgba(22,21,19,0.10); }
  .rc-count { padding: 1px 6px; border-radius: 999px; background: var(--count-bg); font-size: 11px; font-weight: 700; color: var(--muted); font-variant-numeric: tabular-nums; }
  .rc-search { flex: 1 1 180px; min-width: 140px; margin: 0; }
  .rc-search label { display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 10px; border-radius: 8px; box-shadow: inset 0 0 0 1px var(--input); background: #FFFFFF; }
  .rc-search label:focus-within { box-shadow: inset 0 0 0 1px var(--blue), 0 0 0 3px rgba(116,192,252,0.35); }
  .rc-search input { flex: 1; min-width: 0; border: 0; outline: none; font: 13px var(--font); color: var(--ink); background: transparent; }
  .rc-search input:focus-visible { box-shadow: none; }
  .rc-csv { height: 32px; font-weight: 600; }
  .rc-list .rc-state { flex: 1 1 auto; }
  /* List + detail region */
  .rc-split { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .rc-split.rc-drilled:not(.rc-narrow) { grid-template-columns: minmax(280px, 380px) minmax(0, 1fr); }
  .rc-split .rc-list { height: 100%; }
  .rc-split.rc-drilled .rc-csv { display: none; }
  .rc-table-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; overscroll-behavior: contain; }
  .rc-table { min-width: 900px; }
  .rc-row { position: relative; display: grid; grid-template-columns: 120px minmax(150px, 1.3fr) minmax(130px, 1fr) 140px minmax(150px, 1fr) 120px 64px;
    align-items: center; border-bottom: 1px solid var(--line-soft); font-size: 13px; }
  .rc-table-team .rc-row { grid-template-columns: 120px minmax(150px, 1.3fr) minmax(130px, 1fr) 160px 140px minmax(150px, 1fr) 120px 64px; }
  .rc-row > * { min-width: 0; padding: 10px 12px; }
  .rc-row > :first-child { padding-left: 16px; }
  .rc-row > :last-child { padding-right: 16px; }
  .rc-row-head { position: sticky; top: 0; z-index: 2; background: var(--head-bg); border-bottom: 1px solid var(--line); font-size: 12px; font-weight: 600; color: var(--muted); white-space: nowrap; }
  .rc-row-head > * { padding-top: 9px; padding-bottom: 9px; }
  .rc-row.rc-cur { background: var(--cur-bg); box-shadow: inset 3px 0 0 var(--cur-bar); }
  .rc-right { text-align: right; }
  .rc-when { display: flex; align-items: center; gap: 8px; font-variant-numeric: tabular-nums; }
  .rc-dir { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 20px; height: 20px; border-radius: 999px; }
  .rc-dir svg { display: block; }
  .rc-dir-in { background: var(--in-bg); color: var(--in-fg); }
  .rc-dir-out { background: var(--out-bg); color: var(--out-fg); }
  .rc-dir-missed { background: var(--missed-bg); color: var(--missed-fg); }
  .rc-when-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
  .rc-row-link { color: var(--ink); text-decoration: none; }
  .rc-row-link:hover { color: var(--ink); }
  .rc-row-link::after { content: ''; position: absolute; inset: 0; }
  .rc-row-link:focus-visible { box-shadow: none; }
  .rc-row-link:focus-visible::after { box-shadow: inset 0 0 0 2px var(--focus); }
  .rc-date { font-size: 12px; color: var(--muted); white-space: nowrap; }
  .rc-co { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rc-contact { color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rc-phone { color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .rc-owner { display: inline-flex; align-items: center; gap: 8px; max-width: 100%; }
  .rc-ini { flex: none; width: 22px; height: 22px; border-radius: 999px; background: #E8F0F8; color: var(--navy); font-size: 10px; font-weight: 700;
    display: inline-flex; align-items: center; justify-content: center; }
  .rc-owner-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rc-out { display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
${OUTCOME_CSS}
  .rc-satb { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .rc-satb i { flex: none; width: 8px; height: 8px; border-radius: 999px; }
${SAT_CSS}
  .rc-len { font-family: var(--mono); font-size: 12px; text-align: right; font-variant-numeric: tabular-nums; }
  /* Compact list (drilled in, or a narrow region) */
  .rc-compact { display: none; flex: 1 1 auto; min-height: 0; overflow: auto; overscroll-behavior: contain; }
  .rc-split.rc-drilled .rc-table-scroll, .rc-split.rc-narrow .rc-table-scroll { display: none; }
  .rc-split.rc-drilled .rc-compact, .rc-split.rc-narrow .rc-compact { display: block; }
  .rc-crow { display: flex; gap: 10px; align-items: center; width: 100%; padding: 10px 14px; border: 0; border-bottom: 1px solid var(--line-soft); background: transparent;
    font: inherit; color: var(--ink); text-align: left; cursor: pointer; }
  .rc-crow:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--focus); }
  .rc-crow.rc-cur { background: var(--cur-bg); }
  .rc-crow[aria-selected="true"] { background: var(--sel-bg); box-shadow: inset 3px 0 0 var(--navy); }
  .rc-crow[aria-selected="true"]:focus-visible { box-shadow: inset 3px 0 0 var(--navy), inset 0 0 0 2px var(--focus); }
  .rc-crow-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .rc-crow-line { display: flex; justify-content: space-between; gap: 8px; }
  .rc-crow-co { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rc-crow-when { flex: none; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .rc-crow-sub { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rc-list-foot { flex: none; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 14px;
    border-top: 1px solid var(--line-soft); font-size: 12px; color: var(--muted); }
  .rc-shown { font-variant-numeric: tabular-nums; }
  .rc-keys { display: inline-flex; align-items: center; gap: 6px; }
  kbd { font: 600 11px var(--font); color: var(--muted); background: #FFFFFF; border: 1px solid var(--input); border-bottom-width: 2px; border-radius: 5px; padding: 0 5px; }
  /* Detail panel / sheet */
  .rc-scrim { display: none; position: absolute; inset: 0; z-index: 5; border-radius: 12px; background: rgba(22,21,19,0.32); }
  .rc-split.rc-narrow.rc-drilled .rc-scrim { display: block; }
  .rc-detail { display: flex; flex-direction: column; min-width: 0; min-height: 0; height: 100%; overflow: hidden; border-radius: 12px; background: #FFFFFF;
    box-shadow: 0 0 0 1px rgba(22,21,19,0.08), 0 1px 2px rgba(22,21,19,0.04); }
  .rc-detail:focus { outline: none; }
  .rc-split.rc-narrow .rc-detail { position: absolute; top: 0; right: 0; bottom: 0; z-index: 6; width: min(100%, 440px); border-radius: 12px 0 0 12px;
    box-shadow: -12px 0 32px rgba(22,21,19,0.18); }
  .rc-d-bar { flex: none; display: flex; align-items: center; gap: 4px; padding: 8px 10px; border-bottom: 1px solid var(--line-soft); }
  .rc-d-btn { flex: none; width: 32px; height: 32px; border: 0; border-radius: 8px; background: transparent; color: var(--muted); cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center; transition: background-color 140ms ease, transform 140ms cubic-bezier(0.23, 1, 0.32, 1); }
  .rc-d-btn:active { transform: scale(0.97); }
  .rc-d-btn:disabled { opacity: 0.35; cursor: default; transform: none; }
  .rc-d-sep { width: 1px; height: 20px; margin: 0 4px; background: var(--line); }
  .rc-d-pos { margin-left: 4px; font-size: 12px; color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .rc-d-copied { padding: 0 6px; font-size: 12px; font-weight: 600; color: var(--good-fg); white-space: nowrap; }
  .rc-d-copied:empty { display: none; }
  .rc-d-open { display: inline-flex; align-items: center; gap: 4px; padding: 6px 8px; border-radius: 6px; font-size: 13px; font-weight: 600; text-decoration: none; white-space: nowrap; }
  .rc-d-linkbox { flex: none; margin: 8px 10px 0; height: 32px; padding: 0 8px; border: 0; border-radius: 8px; box-shadow: inset 0 0 0 1px var(--input); font: 12px var(--font); color: var(--ink); }
  .rc-d-body { flex: 1 1 auto; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 16px 20px; display: flex; flex-direction: column; gap: 16px; }
  .rc-d-pills { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
  .rc-pill { display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
  .rc-pill-vm { background: var(--in-bg); color: var(--in-fg); }
  .rc-pill-good { background: var(--good-bg); color: var(--good-fg); }
  .rc-pill-missed { background: var(--missed-bg); color: var(--missed-fg); }
  .rc-pill-quiet { background: var(--line-soft); color: var(--muted); }
  .rc-d-title { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -0.01em; line-height: 1.3; overflow-wrap: anywhere; }
  .rc-d-who { margin-top: 2px; font-size: 13px; color: var(--muted); }
  .rc-d-facts { margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px 14px; padding: 12px 14px; border-radius: 10px; background: var(--panel); }
  .rc-d-facts dt { font-size: 12px; color: var(--muted); }
  .rc-d-facts dd { margin: 1px 0 0; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .rc-d-sect-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .rc-d-label { margin: 0; font-size: 11px; font-weight: 700; color: var(--muted); letter-spacing: 0.05em; text-transform: uppercase; }
  .rc-d-more { font-size: 12px; font-weight: 600; text-decoration: none; }
  .rc-d-summary { margin: 6px 0 0; padding: 10px 12px; border-radius: 10px; background: var(--sel-bg); font-size: 14px; line-height: 1.55; }
  .rc-d-note { margin: 0; font-size: 13px; line-height: 1.5; color: var(--muted); }
  .rc-d-lines { margin-top: 6px; display: flex; flex-direction: column; gap: 4px; font-size: 13px; line-height: 1.5; }
  .rc-d-line { display: grid; grid-template-columns: 70px minmax(0, 1fr); gap: 8px; }
  .rc-d-rep { color: var(--link); font-weight: 600; }
  .rc-d-customer { color: var(--customer); font-weight: 600; }
  .rc-d-task { margin-top: 6px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; }
  .rc-d-task .rc-task-text { flex: 1 1 160px; min-width: 0; display: flex; flex-direction: column; }
  .rc-d-task .rc-task-title { font-size: 13px; font-weight: 600; }
  .rc-d-task .rc-task-meta { font-size: 12px; color: var(--muted); }
  .rc-d-task .rc-task-err { font-size: 12px; color: var(--low-fg); }
  .rc-d-task .rc-btn { height: 30px; font-weight: 600; }
  .rc-btn-navy { background: var(--navy); color: #FFFFFF; }
  .rc-btn-navy:hover { color: #FFFFFF; }
  .rc-d-none { margin: 6px 0 0; font-size: 13px; color: var(--muted); }
  .rc-d-err { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; font-size: 13.5px; font-weight: 500; }
  .rc-d-foot { flex: none; display: flex; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--line-soft); background: #FFFFFF; }
  .rc-d-foot .rc-btn { font-weight: 600; }
  .rc-btn-call { flex: 1 1 auto; justify-content: center; background: var(--amber); color: var(--amber-ink); }
  .rc-btn-call:hover { color: var(--amber-ink); }
  .rc-skel-block { display: flex; flex-direction: column; gap: 12px; }
  .rc-skel-line { display: block; height: 10px; border-radius: 4px; background: var(--line-soft); }
  .rc-skel-inline { display: inline-block; width: 48px; height: 10px; border-radius: 4px; background: var(--line-soft); vertical-align: middle; }
  /* Motion: drill-in only (never on keyboard moves or call switches); exits are instant. */
  .rc-detail.rc-enter { animation: rc-panel-in 180ms cubic-bezier(0.23, 1, 0.32, 1); }
  .rc-split.rc-narrow .rc-detail.rc-enter { animation: rc-sheet-in 260ms cubic-bezier(0.32, 0.72, 0, 1); }
  .rc-scrim.rc-enter { animation: rc-fade-in 200ms ease; }
  @keyframes rc-panel-in { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: none; } }
  @keyframes rc-sheet-in { from { transform: translateX(100%); } to { transform: none; } }
  @keyframes rc-fade-in { from { opacity: 0; } to { opacity: 1; } }
  @media (hover: hover) and (pointer: fine) {
    .rc-ftabs a:hover { color: var(--ink); }
    .rc-row:not(.rc-row-head):hover { background: var(--panel); }
    .rc-row.rc-cur:hover { background: var(--cur-bg); }
    .rc-crow:hover { background: var(--panel); }
    .rc-crow[aria-selected="true"]:hover { background: var(--sel-bg); }
    .rc-d-btn:hover { background: var(--line-soft); color: var(--ink); }
    .rc-btn-call:hover { background: var(--amber-hover); }
    .rc-btn-navy:hover { background: var(--navy-hover); }
  }
  @media (prefers-reduced-motion: reduce) {
    .rc-d-btn:active { transform: none; }
    .rc-detail.rc-enter, .rc-split.rc-narrow .rc-detail.rc-enter { animation: rc-fade-in 150ms ease; }
  }
`;

    // Calls tab client script: plain ES5 inside a template literal. No
    // backticks, no dollar-brace, no backslashes.
    // Wide region (900 px and up): the panel sits beside a compact list.
    // Narrow: the compact list is full width and the panel is a sheet over
    // a scrim (a modal dialog). Keys live on the list and the panel only.
    const CALLS_CLIENT_JS = `
(function () {
  var CFG = window.CTC_RC || {};
  var FAILED = 'Couldn’t save that. Try again.';
  function byId(id) { return document.getElementById(id); }
  function closest(el, sel) { return el && el.closest ? el.closest(sel) : null; }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  var split = byId('rc-split');
  var listEl = byId('rc-list');
  var detail = byId('rc-detail');
  // No list (empty, error): a call= in the address is dropped.
  if (!split || !listEl || !detail) {
    if (/[?&]call=/.test(window.location.search)) setParam('');
    return;
  }
  var scrim = byId('rc-scrim');
  var WIDE = 900;
  var STATUS = {
    'Transcribed': ['Transcribed', 'good'],
    'Missed': ['Missed call', 'missed'],
    'No answer': ['No answer', 'quiet'],
    'Too short': ['Too short', 'quiet'],
    'No transcript': ['No transcript', 'quiet'],
    'Processing': ['Processing', 'quiet'],
    'Logged': ['Processing', 'quiet'],
    'Failed': ['Summary failed', 'quiet']
  };
  var openId = '';
  var cursorId = split.getAttribute('data-selected') || '';
  var cache = {};
  var loading = {};
  var copiedTimer = null;

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
  function done(d) { return !!d && (d.ok === true || d.error === 'already_actioned'); }
  function errorText(d) {
    return d && d.error === 'forbidden' ? 'Only the customer’s sales rep or their manager can review this.' : FAILED;
  }
  function setBusy(box, busy) { each(box.querySelectorAll('button'), function (b) { b.disabled = busy; }); }
  function showError(box, msg) {
    var e = box.querySelector('.rc-task-err');
    if (!e) return;
    e.textContent = msg || '';
    e.hidden = !msg;
  }

  function part(name) { return detail.querySelector('[data-d="' + name + '"]'); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function find(sel, id) {
    var els = split.querySelectorAll(sel);
    for (var i = 0; i < els.length; i++) if (els[i].getAttribute('data-call-id') === id) return els[i];
    return null;
  }
  function rowOf(id) { return find('.rc-row[data-call-id]', id); }
  function crowOf(id) { return find('.rc-crow', id); }
  function ids() {
    var out = [];
    each(split.querySelectorAll('.rc-crow'), function (b) { out.push(b.getAttribute('data-call-id')); });
    return out;
  }
  // What the row knows (server-rendered data-* attributes).
  function info(id) {
    var r = rowOf(id);
    var a = function (k) { return r ? (r.getAttribute('data-' + k) || '') : ''; };
    return {
      id: id, company: a('company'), companyId: a('company-id'), contact: a('contact'), owner: a('owner'),
      phone: a('phone'), phoneText: a('phone-text'), when: a('when'), dir: a('dir'), len: a('len'),
      sat: a('sat'), satBand: a('sat-band')
    };
  }
  function isNarrow() { return split.classList.contains('rc-narrow'); }
  function compactShown() { return !!openId || isNarrow(); }
  // The element that stands for a row: the table link (full table) or the
  // compact button.
  function focusTarget(id) {
    if (compactShown()) return crowOf(id);
    var r = rowOf(id);
    return r ? r.querySelector('.rc-row-link') : null;
  }
  function reveal(node) { if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest' }); }

  function dialogAttrs() {
    if (openId && isNarrow()) {
      detail.setAttribute('role', 'dialog');
      detail.setAttribute('aria-modal', 'true');
    } else {
      detail.removeAttribute('role');
      detail.removeAttribute('aria-modal');
    }
  }
  function measure() {
    var w = split.clientWidth;
    split.classList.toggle('rc-narrow', w > 0 && w < WIDE);
    dialogAttrs();
  }
  measure();
  if (window.ResizeObserver) new window.ResizeObserver(measure).observe(split);

  function markRows() {
    each(split.querySelectorAll('.rc-crow'), function (b) {
      var id = b.getAttribute('data-call-id');
      b.setAttribute('aria-selected', id === openId ? 'true' : 'false');
      b.classList.toggle('rc-cur', id === cursorId && id !== openId);
    });
    each(split.querySelectorAll('.rc-row[data-call-id]'), function (r) {
      r.classList.toggle('rc-cur', r.getAttribute('data-call-id') === cursorId);
    });
  }

  // Keep call= in the address (other params stay) so the page can be
  // reloaded or shared on this call.
  function setParam(id) {
    if (!window.history || !window.history.replaceState || !window.URL) return;
    try {
      var u = new window.URL(window.location.href);
      if (id) u.searchParams.set('call', id); else u.searchParams['delete']('call');
      window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
    } catch (e) { /* keep the address as it is */ }
  }

  function enter() {
    [detail, scrim].forEach(function (n) {
      if (!n) return;
      n.classList.remove('rc-enter');
      void n.offsetWidth;
      n.classList.add('rc-enter');
    });
  }
  detail.addEventListener('animationend', function () { detail.classList.remove('rc-enter'); });

  // how: 'click' | 'key' | 'init'. Motion only on drill-in (never on init,
  // or when the panel is already open).
  function open(id, how) {
    if (!id || !rowOf(id)) return;
    var was = openId;
    var fromList = listEl.contains(document.activeElement);
    openId = id;
    cursorId = id;
    split.classList.add('rc-drilled');
    detail.hidden = false;
    dialogAttrs();
    markRows();
    fill(id);
    if (how !== 'init') setParam(id);
    reveal(crowOf(id));
    if (!was && how !== 'init') {
      enter();
      if (isNarrow()) { part('close').focus(); return; }
    }
    // The table hides when drilled in: keep focus on the list.
    if (fromList && document.activeElement !== listEl) {
      var t = crowOf(id);
      if (t) t.focus();
    }
    if (document.activeElement && document.activeElement.disabled) detail.focus();
  }

  function close() {
    if (!openId) return;
    var id = openId;
    openId = '';
    cursorId = id;
    split.classList.remove('rc-drilled');
    detail.hidden = true;
    detail.classList.remove('rc-enter');
    if (scrim) scrim.classList.remove('rc-enter');
    dialogAttrs();
    markRows();
    setParam('');
    var t = focusTarget(id);
    if (t) t.focus(); else listEl.focus();
    reveal(t);
  }

  function step(d) {
    var list = ids();
    if (!list.length) return;
    var at = list.indexOf(openId || cursorId);
    var next = list[Math.max(0, Math.min(list.length - 1, at < 0 ? (d > 0 ? 0 : list.length - 1) : at + d))];
    if (openId) {
      if (next !== openId) open(next, 'key');
      return;
    }
    var inRow = listEl.contains(document.activeElement) && document.activeElement !== listEl;
    cursorId = next;
    markRows();
    var t = focusTarget(next);
    if (inRow && t) t.focus();
    reveal(t);
  }

  // ---- Panel content ----
  function setBar(id) {
    var list = ids();
    var at = list.indexOf(id);
    part('pos').textContent = (at + 1) + ' of ' + list.length;
    part('prev').disabled = at <= 0;
    part('next').disabled = at >= list.length - 1;
    part('record').setAttribute('href', '/app/crm/calendar/call.nl?id=' + encodeURIComponent(id));
    part('copied').textContent = '';
    part('linkbox').hidden = true;
  }
  function setFoot(row, d) {
    var call = part('call');
    if (call) part('call-label').textContent = row.dir === 'missed' ? 'Call back' : 'Call again';
    var rec = part('rec');
    var url = d && d.call && d.call.recordingUrl;
    rec.hidden = !url;
    if (url) rec.setAttribute('href', url); else rec.removeAttribute('href');
    part('foot').hidden = !call && !url;
  }
  function section(label, extra) {
    var s = el('section', 'rc-d-sect');
    s.setAttribute('aria-label', label);
    var head = el('div', 'rc-d-sect-head');
    head.appendChild(el('h3', 'rc-d-label', label));
    if (extra) head.appendChild(extra);
    s.appendChild(head);
    return s;
  }
  function skel(cls) { var s = el('span', cls || 'rc-skel-inline'); s.setAttribute('aria-hidden', 'true'); return s; }
  function head(row, c) {
    var box = el('div', 'rc-d-head');
    var pills = el('div', 'rc-d-pills');
    if (c) {
      if (c.voicemail) pills.appendChild(el('span', 'rc-pill rc-pill-vm', 'Voicemail'));
      var st = STATUS[c.status];
      if (st) pills.appendChild(el('span', 'rc-pill rc-pill-' + st[1], st[0]));
    }
    if (pills.firstChild) box.appendChild(pills);
    if (c) box.appendChild(el('h2', 'rc-d-title', c.title || row.company || 'Call'));
    else { var t = el('h2', 'rc-d-title'); t.appendChild(skel('rc-skel-line')); box.appendChild(t); }
    var who = el('div', 'rc-d-who');
    var companyId = (c && c.companyId) || row.companyId;
    var company = (c && c.companyName) || row.company || 'Unknown caller';
    if (companyId) {
      var a = el('a', '', company);
      a.setAttribute('href', CFG.entityUrl + encodeURIComponent(companyId));
      who.appendChild(a);
    } else {
      who.appendChild(el('span', '', company));
    }
    var rest = [(c && c.contactName) || row.contact || (companyId ? 'Main line' : row.phoneText || '—')];
    var owner = (c && c.ownerName) || row.owner;
    if (CFG.teamView && owner) rest.push(owner);
    who.appendChild(document.createTextNode(' · ' + rest.join(' · ')));
    box.appendChild(who);
    return box;
  }
  function facts(row, c) {
    var dl = el('dl', 'rc-d-facts');
    function add(label, value) {
      var d = el('div');
      d.appendChild(el('dt', '', label));
      var dd = el('dd');
      if (value === null) dd.appendChild(skel());
      else if (typeof value === 'string') dd.textContent = value;
      else dd.appendChild(value);
      d.appendChild(dd);
      dl.appendChild(d);
    }
    var sat = el('span', 'rc-satb rc-satb-' + (row.satBand || 'none'));
    var dot = el('i');
    dot.setAttribute('aria-hidden', 'true');
    sat.appendChild(dot);
    sat.appendChild(document.createTextNode(row.sat || 'Not scored'));
    add('When', row.when || (c && c.date) || '—');
    add('Direction', c ? (c.direction === 'inbound' ? 'Inbound' : 'Outbound') : (row.dir === 'out' ? 'Outbound' : 'Inbound'));
    add('Length', row.len || '—');
    add('Phone', row.phoneText || (c && c.phone) || '—');
    add('Satisfaction', sat);
    add('Tone', !c ? null : (c.toneKeywords || '—'));
    return dl;
  }
  function taskCard(t) {
    var card = el('div', 'rc-d-task');
    card.setAttribute('role', 'listitem');
    card.setAttribute('data-task-id', t.id);
    var text = el('div', 'rc-task-text');
    text.appendChild(el('span', 'rc-task-title', t.text || 'Follow-up'));
    text.appendChild(el('span', 'rc-task-meta', t.proposedDue ? 'Due ' + t.proposedDue + ' · not a task yet' : 'Not a task yet'));
    var err = el('span', 'rc-task-err');
    err.setAttribute('role', 'alert');
    err.hidden = true;
    text.appendChild(err);
    card.appendChild(text);
    var no = el('button', 'rc-btn rc-btn-outline', 'Dismiss');
    no.type = 'button';
    no.setAttribute('data-act', 'dismiss');
    no.setAttribute('aria-label', 'Dismiss: ' + (t.text || 'follow-up'));
    var yes = el('button', 'rc-btn rc-btn-navy', 'Approve');
    yes.type = 'button';
    yes.setAttribute('data-act', 'approve');
    yes.setAttribute('aria-label', 'Approve: ' + (t.text || 'follow-up'));
    card.appendChild(no);
    card.appendChild(yes);
    return card;
  }
  function tasks(d) {
    var s = section('Suggested follow-ups');
    var list = el('div', 'rc-d-tasks');
    list.setAttribute('role', 'list');
    (d.tasks || []).forEach(function (t) { list.appendChild(taskCard(t)); });
    s.appendChild(list);
    var none = el('p', 'rc-d-none', d.tasksError ? 'Couldn’t load follow-ups.' : 'None from this call.');
    none.hidden = !!(d.tasks && d.tasks.length);
    s.appendChild(none);
    return s;
  }
  function renderLoading(row) {
    var b = part('body');
    clear(b);
    b.setAttribute('aria-busy', 'true');
    b.appendChild(head(row, null));
    b.appendChild(facts(row, null));
    var s = section('AI summary');
    var blk = el('div', 'rc-skel-block');
    ['100%', '90%', '65%'].forEach(function (w) { var l = skel('rc-skel-line'); l.style.width = w; blk.appendChild(l); });
    s.appendChild(blk);
    b.appendChild(s);
  }
  function renderError(id) {
    var b = part('body');
    clear(b);
    b.removeAttribute('aria-busy');
    var box = el('div', 'rc-d-err');
    box.setAttribute('role', 'alert');
    box.appendChild(el('span', '', 'Couldn’t load this call.'));
    var retry = el('button', 'rc-btn rc-btn-outline', 'Retry');
    retry.type = 'button';
    retry.setAttribute('data-d', 'retry');
    box.appendChild(retry);
    b.appendChild(head(info(id), null));
    b.appendChild(box);
  }
  // Rep lines carry the owner's first name; customer lines "Customer".
  function repName(row, c) {
    var name = String((c && c.ownerName) || row.owner || '').trim();
    return name ? name.split(' ')[0] : 'Rep';
  }
  function render(row, d) {
    var c = d.call || {};
    var b = part('body');
    clear(b);
    b.removeAttribute('aria-busy');
    b.appendChild(head(row, c));
    b.appendChild(facts(row, c));
    var note = !c.voicemail && !c.summary && !c.transcriptLineCount && (CFG.notes || {})[c.status];
    if (note) {
      b.appendChild(el('p', 'rc-d-note', note));
    } else {
      var sum = section('AI summary');
      sum.appendChild(el('p', 'rc-d-summary', c.summary || 'No summary available.'));
      b.appendChild(sum);
      var lines = c.transcriptLines || [];
      if (lines.length) {
        var more = el('a', 'rc-d-more', 'Full transcript');
        more.setAttribute('href', c.recordUrl || '/app/crm/calendar/call.nl?id=' + encodeURIComponent(c.id));
        more.setAttribute('target', '_blank');
        more.setAttribute('rel', 'noopener');
        var tr = section('Transcript', more);
        var box = el('div', 'rc-d-lines');
        var rep = repName(row, c);
        lines.forEach(function (l) {
          var line = el('div', 'rc-d-line');
          line.appendChild(el('span', l.speaker ? 'rc-d-' + l.speaker : '', l.speaker === 'rep' ? rep : (l.speaker === 'customer' ? 'Customer' : '')));
          line.appendChild(el('span', '', l.text));
          box.appendChild(line);
        });
        tr.appendChild(box);
        b.appendChild(tr);
      }
    }
    b.appendChild(tasks(d));
  }

  function load(id) {
    if (loading[id]) return;
    loading[id] = true;
    post({ action: 'getCallDetail', callId: id, owner: CFG.owner || '' }).then(function (d) {
      loading[id] = false;
      if (!d || !d.call) throw new Error((d && d.error) || 'no call');
      cache[id] = d;
      if (openId === id) {
        render(info(id), d);
        setFoot(info(id), d);
      }
    }).catch(function () {
      loading[id] = false;
      if (openId === id) renderError(id);
    });
  }
  function fill(id) {
    var row = info(id);
    setBar(id);
    setFoot(row, cache[id]);
    if (cache[id]) { render(row, cache[id]); return; }
    renderLoading(row);
    load(id);
  }

  // ---- Actions ----
  // Call back / Call again: the same path as the portlet's redial. In
  // phone mode the shell's dialer opens on Dial with the customer loaded
  // (it never dials by itself); outside, the tab moves into the shell on
  // this page.
  function placeCall() {
    var row = info(openId);
    var ctx = { entityId: row.companyId, entityName: row.company, entityType: row.companyId ? 'customer' : '', phone: row.phone };
    var s = null;
    try { s = window.top.__ctcShell; } catch (e) { s = null; }
    if (s && s.call) { s.call(ctx); return; }
    if (!CFG.shellUrl) return;
    try { window.sessionStorage.removeItem(CFG.exitKey); } catch (e) { /* storage blocked */ }
    window.top.location.href = CFG.shellUrl + (CFG.shellUrl.indexOf('?') >= 0 ? '&' : '?') + 'u=' +
      encodeURIComponent(window.location.pathname + window.location.search);
  }
  function flash(text) {
    var s = part('copied');
    s.textContent = text;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(function () { s.textContent = ''; }, 2000);
  }
  function copyLink() {
    var link = window.location.href;
    var box = part('linkbox');
    function ok() { box.hidden = true; flash('Link copied'); }
    function fallback() {
      box.value = link;
      box.hidden = false;
      box.focus();
      box.select();
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(ok, fallback);
      else fallback();
    } catch (e) { fallback(); }
  }
  // KPI / tab follow-up counts, where the page has them.
  function bumpFollowupCount() {
    each(document.querySelectorAll('[data-followup-count]'), function (n) {
      var v = Math.max(0, (parseInt(n.textContent, 10) || 0) - 1);
      n.textContent = (v === 0 && n.getAttribute('data-followup-count') === 'tab') ? '' : String(v);
    });
  }
  // After an approve / dismiss: the row's outcome follows.
  function bumpRow(id) {
    var r = rowOf(id);
    if (!r) return;
    var n = Math.max(0, (parseInt(r.getAttribute('data-pending'), 10) || 0) - 1);
    r.setAttribute('data-pending', String(n));
    if (n > 0) return;
    var text = r.getAttribute('data-out-done') || '';
    var chip = r.querySelector('.rc-out');
    if (chip && chip.className.indexOf('rc-out-followup') >= 0) {
      chip.className = 'rc-out rc-out-' + (r.getAttribute('data-out-done-tone') || 'quiet');
      chip.textContent = text;
      var c = crowOf(id);
      var sub = c && c.querySelector('.rc-crow-out');
      if (sub) sub.textContent = text;
    }
  }
  function taskAction(btn) {
    var card = closest(btn, '.rc-d-task');
    if (!card) return;
    var callId = openId;
    var taskId = card.getAttribute('data-task-id');
    var action = btn.getAttribute('data-act') === 'approve' ? 'approveProposedTask' : 'rejectProposedTask';
    setBusy(card, true);
    showError(card, '');
    post({ action: action, taskId: taskId }).then(function (d) {
      if (!done(d)) {
        setBusy(card, false);
        showError(card, errorText(d));
        return;
      }
      var cached = cache[callId];
      if (cached) cached.tasks = (cached.tasks || []).filter(function (t) { return String(t.id) !== String(taskId); });
      var list = card.parentNode;
      if (list) {
        list.removeChild(card);
        var none = list.parentNode && list.parentNode.querySelector('.rc-d-none');
        if (none && !list.querySelector('.rc-d-task')) none.hidden = false;
      }
      bumpFollowupCount();
      bumpRow(callId);
    }).catch(function () {
      setBusy(card, false);
      showError(card, FAILED);
    });
  }

  // ---- Events (on the list, the panel and the scrim only) ----
  split.addEventListener('click', function (e) {
    var link = closest(e.target, 'a.rc-row-link');
    if (link) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      open(closest(link, '[data-call-id]').getAttribute('data-call-id'), 'click');
      return;
    }
    var crow = closest(e.target, '.rc-crow');
    if (crow) { open(crow.getAttribute('data-call-id'), 'click'); return; }
    if (scrim && e.target === scrim) close();
  });
  detail.addEventListener('click', function (e) {
    var act = closest(e.target, 'button[data-act]');
    if (act) { taskAction(act); return; }
    var b = closest(e.target, 'button[data-d]');
    if (!b) return;
    var k = b.getAttribute('data-d');
    if (k === 'close') close();
    else if (k === 'prev') step(-1);
    else if (k === 'next') step(1);
    else if (k === 'copy') copyLink();
    else if (k === 'call') placeCall();
    else if (k === 'retry') { renderLoading(info(openId)); load(openId); }
  });
  listEl.addEventListener('focusin', function (e) {
    var row = closest(e.target, '[data-call-id]');
    if (!row || openId) return;
    cursorId = row.getAttribute('data-call-id');
    markRows();
  });

  function trap(e) {
    var all = Array.prototype.filter.call(detail.querySelectorAll('a[href], button, input'), function (n) {
      return !n.disabled && !closest(n, '[hidden]');
    });
    if (!all.length) return;
    var first = all[0], last = all[all.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === detail)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  function onKey(e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    var tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    var k = e.key;
    if (k === 'ArrowDown' || k === 'j') { e.preventDefault(); step(1); }
    else if (k === 'ArrowUp' || k === 'k') { e.preventDefault(); step(-1); }
    else if (k === 'Enter' && !openId && t === listEl && cursorId) { e.preventDefault(); open(cursorId, 'key'); }
    else if (k === 'Escape' && openId) { e.preventDefault(); close(); }
    else if (k === 'Tab' && openId && isNarrow() && e.currentTarget === detail) trap(e);
  }
  listEl.addEventListener('keydown', onKey);
  detail.addEventListener('keydown', onKey);

  // Deep link: the server rendered this call open; fetch its data. A call=
  // that is not in this list is dropped from the address.
  var first = split.getAttribute('data-selected');
  if (first) open(first, 'init');
  else if (/[?&]call=/.test(window.location.search)) setParam('');
})();
`;

    return {
        CALL_TABS, EMPTY_CALLS, ICON, ARROW, SEARCH_ICON,
        formatLength, formatPhone, afterCall, shortDate, directionKey,
        csvCell, toCsv, tabCounts,
        iconBtn, ownerCell, detailSkeleton,
        buildKpis, buildCallsTab,
        CALLS_CSS, CALLS_CLIENT_JS
    };
});
