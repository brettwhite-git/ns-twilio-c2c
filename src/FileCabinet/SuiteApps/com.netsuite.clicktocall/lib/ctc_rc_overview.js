// @ts-check
/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Reporting Central Overview tab (phase D): the KPI strip (Calls with the
 * "vs prior" delta, Connected, Talk time, Satisfaction), the "Needs you"
 * banner (calls to return, follow-ups to review, overdue tasks), the
 * Connected vs Not connected chart (by hour for a one-day range, by
 * day otherwise; a CSS hover / focus tooltip, bars link to the Calls tab),
 * the Outcomes breakdown (ctcHtml.outcomeOf) and the 8 newest calls.
 * Pure model builders first, then the HTML builders and OVERVIEW_CSS.
 * No client script: the tooltip is CSS only. Data: the range's call rows
 * (wq.loadHistoryRows), the previous period's count (wq.countCalls) and
 * the open follow-ups (wq.loadFollowUpRows, no date filter). The page
 * shell is lib/ctc_rc_shell.js; row pieces come from lib/ctc_rc_calls.js.
 */
define(['./ctc_html', './ctc_workspace_queries', './ctc_rc_shell', './ctc_rc_calls', './ctc_rc_followups', './ctc_rc_scope'],
    (ctcHtml, wq, rcShell, rcCalls, rcFollowups, rcScope) => {

    const escapeHtml = ctcHtml.escapeHtml;
    const buildUrl = rcShell.buildUrl;

    const RECENT_LIMIT = 8;
    // Hour mode always shows these hours (more when calls fall outside).
    const FIRST_HOUR = 8;
    const LAST_HOUR = 17;
    // Bar scale: the tallest bar's stack is PLOT_PX high (the plot is
    // 160 px in OVERVIEW_CSS: room for the total above the bar).
    const PLOT_PX = 130;
    // More bars than this: labels thin out to about LABELS_MAX.
    const ALL_LABELS_MAX = 14;
    const LABELS_MAX = 12;

    // Outcome rows in this order (ctcHtml.outcomeOf texts); bar colours.
    const OUTCOME_ORDER = ['Summary ready', 'Follow-up suggested', 'Voicemail', 'Missed call', 'No answer',
        'Summarizing', 'Too short', 'No transcript', 'Summary failed', '—'];
    const OUTCOME_LABEL = { '—': 'Other' };
    const OUTCOME_BAR = { 'Summary ready': '#1F3550', 'Follow-up suggested': '#E9A62A', 'Voicemail': '#E7837A', 'Missed call': '#F2A79B' };
    const OUTCOME_BAR_DEFAULT = '#B9B5AE';
    // Outcome rows open the Calls list with this filter.
    const OUTCOME_DIR = { 'Voicemail': 'missed', 'Missed call': 'missed' };

    // ─── Model (pure) ──────────────────────────────────────────────────────

    /**
     * A connected call: the Calls tab's Connected filter (not missed, talk
     * time, not a voicemail).
     * @param {Object} r - loadHistoryRows row
     * @returns {boolean}
     */
    const isConnected = (r) => !wq.isMissedCall(r) && !wq.isUnconnected(r);

    /**
     * Headline numbers for the range's calls. Missed = wq.isMissedCall
     * (missed or voicemail). Talk time counts connected calls only.
     * Satisfaction skips voicemails (never scored) and unscored calls.
     * @param {Array<Object>} rows
     * @returns {{calls: number, inbound: number, outbound: number, connected: number, missed: number,
     *   connectedPct: (number|null), talkSeconds: number, talkMinutes: number, avgTalkSeconds: (number|null),
     *   satAvg: (number|null), satCount: number, satBands: {low: number, mid: number, high: number}}}
     */
    const computeKpis = (rows) => {
        const list = rows || [];
        const connected = list.filter(isConnected);
        const talkSeconds = connected.reduce((a, r) => a + (Number(r.duration) || 0), 0);
        const scored = list.filter((r) => r.voicemail !== true && typeof r.satisfaction === 'number' && r.satisfaction > 0);
        const satBands = { low: 0, mid: 0, high: 0 };
        scored.forEach((r) => { satBands[ctcHtml.satBand(r.satisfaction).band] += 1; });
        const inbound = list.filter((r) => r.direction === 'inbound').length;
        return {
            calls: list.length,
            inbound: inbound,
            outbound: list.length - inbound,
            connected: connected.length,
            missed: list.filter((r) => wq.isMissedCall(r)).length,
            connectedPct: list.length ? Math.round((connected.length / list.length) * 100) : null,
            talkSeconds: talkSeconds,
            talkMinutes: Math.round(talkSeconds / 60),
            avgTalkSeconds: connected.length ? Math.round(talkSeconds / connected.length) : null,
            satAvg: scored.length ? scored.reduce((a, r) => a + r.satisfaction, 0) / scored.length : null,
            satCount: scored.length,
            satBands: satBands
        };
    };

    /**
     * The Calls KPI's "vs prior" words: "+12 vs the 7 days before" (good),
     * "−3 vs yesterday", "Same as last month"; null when there is no
     * previous period (custom) or its count failed.
     * @param {number} calls
     * @param {(number|null|undefined)} previousCount
     * @param {({label: string}|null)} previous - range.previous
     * @returns {({text: string, tone: string}|null)}
     */
    const callsDelta = (calls, previousCount, previous) => {
        if (typeof previousCount !== 'number' || !previous) return null;
        const diff = calls - previousCount;
        if (!diff) return { text: 'Same as ' + previous.label.replace(/^vs /, ''), tone: '' };
        return { text: (diff > 0 ? '+' : '−') + Math.abs(diff) + ' ' + previous.label, tone: diff > 0 ? 'good' : '' };
    };

    const phoneKey = (r) => String((r && r.phone) || '').replace(/[^0-9]/g, '').slice(-10);

    /** Two calls are with the same caller: the same company, or the same number (last 10 digits). */
    const sameCaller = (a, b) => (!!a.companyId && String(a.companyId) === String(b.companyId)) ||
        (!!phoneKey(a) && phoneKey(a) === phoneKey(b));

    /**
     * Calls to return: every missed call or voicemail in `rows`
     * (wq.isMissedCall) with no LATER connected call (isConnected, either
     * direction) to the same company or number in `rows`. Later = a later
     * date + time ('YYYY-MM-DD HH:MM'); at the same date + time, the row
     * nearer the top (rows come newest first). Each missed call counts
     * once (two voicemails from one caller are two calls to return). A
     * missed call with no company and no number cannot be matched and
     * always counts.
     * @param {Array<Object>} rows - loadHistoryRows rows (newest first)
     * @returns {Array<Object>} the missed rows still to return
     */
    const callsToReturn = (rows) => {
        const list = (rows || []).map((r, i) => ({ r: r, i: i, at: rcFollowups.nsToIso(r.date) + ' ' + (r.timeOfDay || '') }));
        const connected = list.filter((x) => isConnected(x.r));
        const later = (c, x) => c.at > x.at || (c.at === x.at && c.i < x.i);
        return list
            .filter((x) => wq.isMissedCall(x.r) && !connected.some((c) => later(c, x) && sameCaller(c.r, x.r)))
            .map((x) => x.r);
    };

    /**
     * Follow-up counts for the banner, the Follow-ups tab's own rules
     * (rcFollowups.toItem): to review = Pending; overdue = an approved
     * follow-up whose Task is open and due before today. Neither depends on
     * the time range.
     * @param {Array<Object>} fuRows - loadFollowUpRows rows (open ones)
     * @param {{todayIso: string, thisYear: number}} ctx
     * @returns {{review: number, overdue: number}}
     */
    const followUpCounts = (fuRows, ctx) => {
        const items = (fuRows || []).map((r) => rcFollowups.toItem(r, {
            todayIso: ctx.todayIso, thisYear: ctx.thisYear, userId: '', base: '', state: {}
        })).filter(Boolean);
        return {
            review: items.filter((it) => it.tab === 'review').length,
            overdue: items.filter((it) => it.tab === 'tasks' && it.overdue).length
        };
    };

    /**
     * Pending follow-ups per source call (for the "Follow-up suggested"
     * outcome).
     * @param {Array<Object>} fuRows
     * @returns {Object<string, number>}
     */
    const pendingByCall = (fuRows) => {
        /** @type {Object<string, number>} */
        const out = {};
        (fuRows || []).forEach((r) => {
            const id = r.call && r.call.id;
            if (id && rcFollowups.stageOf(r) === 'review') out[id] = (out[id] || 0) + 1;
        });
        return out;
    };

    /**
     * The banner's counts. A count whose data failed to load is null; the
     * banner leaves out null and zero counts. `show` is true when any count is above 0.
     * @param {{rows: Array<Object>, fuRows: Array<Object>, historyError?: boolean, tasksError?: boolean,
     *   todayIso: string, thisYear: number}} p
     * @returns {{callback: (number|null), review: (number|null), overdue: (number|null), show: boolean}}
     */
    const needsYou = (p) => {
        const callback = p.historyError ? null : callsToReturn(p.rows).length;
        const fu = p.tasksError ? null : followUpCounts(p.fuRows, p);
        const out = { callback: callback, review: fu ? fu.review : null, overdue: fu ? fu.overdue : null, show: false };
        out.show = [out.callback, out.review, out.overdue].some((n) => typeof n === 'number' && n > 0);
        return out;
    };

    const hourOf = (r) => {
        const h = parseInt(String((r && r.timeOfDay) || '').split(':')[0], 10);
        return h >= 0 && h < 24 ? h : -1;
    };
    const hourText = (h) => h + ':00';
    const dowOf = (iso) => rcScope.longDay(iso).slice(0, 3);

    /**
     * Chart buckets. A one-day range (today, yesterday, a one-day custom
     * range, custom without dates) is by hour: FIRST_HOUR … LAST_HOUR,
     * widened to any hour with calls; rows with no time are left out. Any
     * other range is by day: every day from range.from to range.to (empty
     * days included). Each bucket counts connected calls (isConnected) and
     * every other call in `missed` (missed, voicemail, unanswered outbound),
     * so a bar's total is its share of the Calls KPI. Scale: `top` is the largest total rounded up to a
     * multiple of 4 (at least 4); `ticks` top … 0 in quarters.
     * @param {Array<Object>} rows
     * @param {{from: string, to: string}} range
     * @param {number} thisYear
     * @returns {{mode: string, buckets: Array<{key: string, iso: string, hour: number, dow: string, label: string,
     *   title: string, connected: number, missed: number, total: number}>, top: number, ticks: Array<number>}}
     */
    const chartModel = (rows, range, thisYear) => {
        const list = rows || [];
        const hourly = range.from === range.to;
        const buckets = [];
        /** @type {Object<string, Object>} */
        const byKey = {};
        const add = (b) => { buckets.push(b); byKey[b.key] = b; };
        if (hourly) {
            const hours = list.map(hourOf).filter((h) => h >= 0);
            const lo = Math.min.apply(null, [FIRST_HOUR].concat(hours));
            const hi = Math.max.apply(null, [LAST_HOUR].concat(hours));
            const day = dowOf(range.from) + ', ' + rcScope.spanText(range.from, range.from, thisYear);
            for (let h = lo; h <= hi; h += 1) {
                add({ key: String(h), iso: range.from, hour: h, dow: hourText(h), label: '',
                    title: day + ' · ' + hourText(h) + '–' + hourText(h + 1), connected: 0, missed: 0, total: 0 });
            }
        } else {
            for (let iso = range.from; iso <= range.to; iso = rcScope.addDays(iso, 1)) {
                const short = rcScope.spanText(iso, iso, thisYear);
                add({ key: iso, iso: iso, hour: -1, dow: dowOf(iso), label: short,
                    title: dowOf(iso) + ', ' + short, connected: 0, missed: 0, total: 0 });
            }
        }
        list.forEach((r) => {
            const b = byKey[hourly ? String(hourOf(r)) : rcFollowups.nsToIso(r.date)];
            if (!b) return;
            if (isConnected(r)) b.connected += 1;
            else b.missed += 1;
            b.total += 1;
        });
        const max = Math.max.apply(null, [4].concat(buckets.map((b) => b.total)));
        const top = Math.ceil(max / 4) * 4;
        return { mode: hourly ? 'hour' : 'day', buckets: buckets, top: top, ticks: [top, top * 0.75, top * 0.5, top * 0.25, 0] };
    };

    /**
     * Calls per outcome (ctcHtml.outcomeOf with the call's pending
     * follow-ups), in OUTCOME_ORDER, outcomes with no calls left out.
     * @param {Array<Object>} rows
     * @param {Object<string, number>} pending - pendingByCall
     * @returns {Array<{text: string, label: string, n: number, color: string, dir: string}>}
     */
    const outcomeBreakdown = (rows, pending) => {
        /** @type {Object<string, number>} */
        const counts = {};
        (rows || []).forEach((r) => {
            const t = ctcHtml.outcomeOf(r, (pending || {})[r.id] || 0).text;
            counts[t] = (counts[t] || 0) + 1;
        });
        const known = OUTCOME_ORDER.concat(Object.keys(counts).filter((t) => OUTCOME_ORDER.indexOf(t) === -1));
        return known.filter((t) => counts[t] > 0).map((t) => ({
            text: t,
            label: OUTCOME_LABEL[t] || t,
            n: counts[t],
            color: OUTCOME_BAR[t] || OUTCOME_BAR_DEFAULT,
            dir: OUTCOME_DIR[t] || 'all'
        }));
    };

    /**
     * Everything the Overview shows.
     * @param {{rows: Array<Object>, previousCount?: (number|null), fuRows: Array<Object>, historyError?: boolean,
     *   tasksError?: boolean, range: Object, todayIso: string, thisYear: number}} p
     * @returns {Object}
     */
    const buildModel = (p) => {
        const rows = p.historyError ? [] : (p.rows || []);
        const fuRows = p.tasksError ? [] : (p.fuRows || []);
        const pending = pendingByCall(fuRows);
        const kpis = computeKpis(rows);
        return {
            kpis: kpis,
            delta: callsDelta(kpis.calls, p.previousCount, p.range.previous),
            needs: needsYou({ rows: rows, fuRows: fuRows, historyError: p.historyError, tasksError: p.tasksError,
                todayIso: p.todayIso, thisYear: p.thisYear }),
            chart: chartModel(rows, p.range, p.thisYear),
            outcomes: outcomeBreakdown(rows, pending),
            recent: rows.slice(0, RECENT_LIMIT),
            pendingByCall: pending
        };
    };

    // ─── HTML ──────────────────────────────────────────────────────────────

    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

    const kpiCell = (k) =>
        '<div class="rc-card rc-kpi"' + (k.title ? ' title="' + escapeHtml(k.title) + '"' : '') + '>' +
        '<span class="rc-kpi-label">' + escapeHtml(k.label) + '</span>' +
        '<span class="rc-kpi-main' + (k.tight ? ' rc-tight' : '') + '"><span class="rc-kpi-value">' + escapeHtml(k.value) + '</span>' + (k.after || '') + '</span>' +
        (k.bar || '') +
        '<span class="rc-kpi-sub">' + (k.sub ? escapeHtml(k.sub) : '&nbsp;') + '</span></div>';

    /**
     * The KPI strip: four result cards.
     * @param {Object} m - view model (ov)
     * @returns {string}
     */
    const buildKpis = (m) => {
        const k = m.ov.kpis;
        const d = m.ov.delta;
        const pct = k.connectedPct;
        const b = k.satBands;
        const band = k.satAvg === null ? null : ctcHtml.satBand(k.satAvg);
        const segs = [['low', b.low], ['mid', b.mid], ['high', b.high]].filter((s) => s[1] > 0);
        const cells = [
            { label: 'Calls', value: String(k.calls),
                after: d ? '<span class="rc-kpi-delta' + (d.tone ? ' rc-' + d.tone : '') + '">' + escapeHtml(d.text) + '</span>' : '',
                sub: k.inbound + ' inbound · ' + k.outbound + ' outbound' },
            { label: 'Connected', value: pct === null ? '—' : String(pct), tight: true,
                after: pct === null ? '' : '<span class="rc-kpi-unit">%</span>',
                bar: '<span class="rc-kpi-bar" role="img" aria-label="' + escapeHtml((pct || 0) + '% connected') + '">' +
                    '<span class="rc-kpi-fill" style="width:' + (pct || 0) + '%"></span></span>',
                sub: k.calls ? k.connected + ' of ' + k.calls + ' · ' + (k.calls - k.connected) + ' not connected' : '' },
            { label: 'Talk time', value: String(k.talkMinutes), tight: true, after: '<span class="rc-kpi-unit">min</span>',
                sub: k.avgTalkSeconds === null ? 'No connected calls' : 'Avg ' + rcCalls.formatLength(k.avgTalkSeconds) + ' per connected call' },
            { label: 'Satisfaction', value: band ? k.satAvg.toFixed(1) : '—', title: 'AI-rated from the transcript. Voicemails are not scored.',
                after: band ? '<span class="rc-satb rc-satb-' + band.band + '"><i aria-hidden="true"></i>' + escapeHtml(ctcHtml.SAT_BANDS[band.band].label) + '</span>' : '',
                bar: '<span class="rc-kpi-bar rc-kpi-bands" role="img" aria-label="' +
                    escapeHtml(k.satCount + ' scored: ' + b.low + ' low, ' + b.mid + ' moderate, ' + b.high + ' high') + '">' +
                    segs.map((s) => '<span class="rc-band-' + s[0] + '" style="flex:' + s[1] + '"></span>').join('') + '</span>',
                sub: k.satCount ? k.satCount + ' scored · Low ' + b.low + ' · Moderate ' + b.mid + ' · High ' + b.high : 'None scored' }
        ];
        return '<section class="rc-kpis" aria-label="Results">' + cells.map(kpiCell).join('') + '</section>';
    };

    /**
     * The "Needs you" banner, or '' when every count is 0. Each count links
     * to its list (owner and range kept); "Review now" opens To review.
     * @param {Object} m
     * @returns {string}
     */
    const buildNeedsYou = (m) => {
        const n = m.ov.needs;
        if (!n.show) return '';
        const s = m.state;
        const reset = { dir: 'all', q: '', ftab: 'review', due: '' };
        const link = (count, dot, one, many, over) => (typeof count !== 'number' || count < 1 ? '' :
            '<a data-nav href="' + escapeHtml(buildUrl(m.base, s, Object.assign({}, reset, over))) + '">' +
            '<span class="rc-needs-dot rc-dot-' + dot + '" aria-hidden="true"></span><strong>' + count + '</strong> ' + (count === 1 ? one : many) + '</a>');
        return '<div class="rc-needs" role="region" aria-label="Needs you"><span class="rc-needs-title">Needs you</span>' +
            link(n.callback, 'callback', 'call to return', 'calls to return', { tab: 'calls', dir: 'missed' }) +
            link(n.review, 'review', 'follow-up to review', 'follow-ups to review', { tab: 'followups' }) +
            link(n.overdue, 'overdue', 'overdue task', 'overdue tasks', { tab: 'followups', ftab: 'tasks', due: 'overdue' }) +
            '<a class="rc-needs-cta" data-nav href="' + escapeHtml(buildUrl(m.base, s, Object.assign({}, reset, { tab: 'followups' }))) + '">Review now</a>' +
            '</div>';
    };

    /**
     * The link behind a chart bar: a day bar opens the Calls tab for that
     * day (range=custom, from = to = the day); an hour bar opens the Calls
     * tab for the page's day (the range is one day already). Owner kept.
     * @param {Object} m
     * @param {Object} b - a chart bucket
     * @returns {string}
     */
    const barUrl = (m, b) => buildUrl(m.base, m.state, b.hour >= 0
        ? { tab: 'calls', dir: 'all', q: '' }
        : { tab: 'calls', dir: 'all', q: '', range: 'custom', from: b.iso, to: b.iso });

    const px = (n, top) => Math.round((n / top) * PLOT_PX);

    /**
     * The chart card: stacked bars (Connected navy below, Missed /
     * voicemail coral above), y ticks, labels, a CSS tooltip per bar.
     * @param {Object} m
     * @returns {string}
     */
    const buildChart = (m) => {
        const c = m.ov.chart;
        const n = c.buckets.length;
        const gap = n <= ALL_LABELS_MAX ? 10 : (n <= 31 ? 4 : 1);
        const cols = 'grid-template-columns:repeat(' + n + ',minmax(0,1fr));gap:' + gap + 'px';
        const every = n <= ALL_LABELS_MAX ? 1 : Math.ceil(n / LABELS_MAX);
        const totals = n <= 31;
        const bars = c.buckets.map((b, i) => {
            const aria = (b.hour >= 0 ? hourText(b.hour) + ' to ' + hourText(b.hour + 1) : b.dow + ' ' + b.label) + ': ' +
                b.connected + ' connected, ' + b.missed + ' not connected. Open ' + (b.hour >= 0 ? 'this day’s calls' : 'these calls');
            return '<a class="rc-ov-bar" data-nav href="' + escapeHtml(barUrl(m, b)) + '" aria-label="' + escapeHtml(aria) + '">' +
                (totals ? '<span class="rc-ov-total">' + b.total + '</span>' : '') +
                '<span class="rc-ov-stack">' +
                    (b.missed ? '<span class="rc-ov-missed" style="height:' + px(b.missed, c.top) + 'px"></span>' : '') +
                    (b.connected ? '<span class="rc-ov-conn" style="height:' + px(b.connected, c.top) + 'px"></span>' : '') +
                '</span>' +
                '<span class="rc-ov-tip' + (i >= n / 2 ? ' rc-ov-tip-end' : '') + '" aria-hidden="true">' +
                    '<b>' + escapeHtml(b.title) + '</b><span>' + b.connected + ' connected · ' + b.missed + ' not connected</span>' +
                    '<span class="rc-ov-tip-hint">Click to see these calls</span></span>' +
                '</a>';
        }).join('');
        const labels = c.buckets.map((b, i) => '<div>' + (i % every ? '' : (every === 1
            ? '<b>' + escapeHtml(b.dow) + '</b>' + escapeHtml(b.label)
            : escapeHtml(b.hour >= 0 ? b.dow : b.label))) + '</div>').join('');
        const ticks = c.ticks.map((t) => '<span style="bottom:' + px(t, c.top) + 'px">' + Math.round(t) + '</span>').join('');
        return '<section class="rc-card rc-ov-chart" aria-labelledby="rc-ov-chart-h">' +
            '<div class="rc-ov-head"><h2 id="rc-ov-chart-h">' + (c.mode === 'hour' ? 'Calls by hour' : 'Calls by day') + '</h2>' +
                '<div class="rc-ov-legend"><span><i class="rc-ov-key rc-ov-conn" aria-hidden="true"></i>Connected</span>' +
                '<span><i class="rc-ov-key rc-ov-missed" aria-hidden="true"></i>Not connected</span></div></div>' +
            '<div class="rc-ov-figure">' +
                '<div class="rc-ov-ticks" aria-hidden="true">' + ticks + '</div>' +
                '<div class="rc-ov-main">' +
                    '<div class="rc-ov-plot" style="' + cols + '"><span class="rc-ov-lines" aria-hidden="true"></span>' + bars + '</div>' +
                    '<div class="rc-ov-labels" aria-hidden="true" style="' + cols + '">' + labels + '</div>' +
                '</div>' +
            '</div></section>';
    };

    /**
     * The Outcomes card: one link row per outcome (count + bar relative to
     * the largest), opening the Calls list (Missed for voicemail / missed).
     * @param {Object} m
     * @returns {string}
     */
    const buildOutcomes = (m) => {
        const list = m.ov.outcomes;
        const max = Math.max.apply(null, [1].concat(list.map((o) => o.n)));
        return '<section class="rc-card rc-ov-oc" aria-labelledby="rc-ov-oc-h">' +
            '<div class="rc-ov-head"><h2 id="rc-ov-oc-h">Outcomes</h2><span class="rc-ov-meta">' + plural(m.ov.kpis.calls, 'call', 'calls') + '</span></div>' +
            '<div class="rc-ov-oc-list">' + list.map((o) =>
                '<a class="rc-ov-oc-row" data-nav href="' + escapeHtml(buildUrl(m.base, m.state, { tab: 'calls', dir: o.dir, q: '' })) + '" aria-label="' +
                    escapeHtml(o.label + ': ' + plural(o.n, 'call', 'calls') + '. Open them') + '">' +
                '<span class="rc-ov-oc-label">' + escapeHtml(o.label) + '</span><span class="rc-ov-oc-n">' + o.n + '</span>' +
                '<span class="rc-ov-oc-track"><span style="width:' + Math.round((o.n / max) * 100) + '%;background:' + o.color + '"></span></span></a>'
            ).join('') + '</div></section>';
    };

    const recentRow = (r, m) => {
        const out = ctcHtml.outcomeOf(r, m.ov.pendingByCall[r.id] || 0);
        const multiDay = m.range.from !== m.range.to;
        const company = r.companyName || 'Unknown caller';
        const contact = r.contactName || (r.companyId ? 'Main line' : '—');
        return '<div role="row" class="rc-row">' +
            '<span role="cell" class="rc-when">' + rcCalls.dirChip(r) +
                '<span class="rc-when-text"><a class="rc-row-link" data-nav href="' +
                escapeHtml(buildUrl(m.base, m.state, { tab: 'calls', dir: 'all', q: '', call: r.id })) + '" aria-label="' +
                escapeHtml('Open call with ' + company + ', ' + [r.date, r.timeOfDay].filter(Boolean).join(' ')) + '">' +
                escapeHtml(r.timeOfDay || r.date || '—') + '</a>' +
                (multiDay && r.timeOfDay && r.date ? '<span class="rc-date">' + escapeHtml(rcCalls.shortDate(r.date, m.thisYear)) + '</span>' : '') +
            '</span></span>' +
            '<span role="cell" class="rc-co">' + escapeHtml(company) + '</span>' +
            '<span role="cell" class="rc-contact">' + escapeHtml(contact) + '</span>' +
            (m.teamView ? '<span role="cell">' + rcCalls.ownerCell(r.ownerName) + '</span>' : '') +
            '<span role="cell">' + rcCalls.outcomeChip(out) + '</span>' +
            '<span role="cell">' + rcCalls.satCell(r.satisfaction) + '</span>' +
            '<span role="cell" class="rc-len">' + escapeHtml(rcCalls.formatLength(r.duration)) + '</span>' +
            '</div>';
    };

    /**
     * Recent calls: the newest RECENT_LIMIT calls; a row opens it in the
     * Calls tab (`call=`). Owner column in the team view only.
     * @param {Object} m
     * @returns {string}
     */
    const buildRecent = (m) => {
        const heads = ['When', 'Company', 'Contact'].concat(m.teamView ? ['Owner'] : [], ['Outcome', 'Satisfaction']);
        return '<section class="rc-card rc-ov-recent" aria-labelledby="rc-ov-recent-h">' +
            '<div class="rc-ov-head"><h2 id="rc-ov-recent-h">Recent calls</h2>' +
                '<a class="rc-ov-link" data-nav href="' + escapeHtml(buildUrl(m.base, m.state, { tab: 'calls', dir: 'all', q: '' })) + '">View all calls</a></div>' +
            '<div class="rc-ov-scroll"><div role="table" aria-label="Recent calls" class="rc-ov-table' + (m.teamView ? ' rc-ov-team' : '') + '">' +
                '<div role="row" class="rc-row rc-row-head">' + heads.map((h) => '<span role="columnheader">' + h + '</span>').join('') +
                    '<span role="columnheader" class="rc-right">Length</span></div>' +
                m.ov.recent.map((r) => recentRow(r, m)).join('') +
            '</div></div></section>';
    };

    /**
     * The Overview tab. A history error shows the error box (the banner
     * keeps the follow-up counts); no calls in the range: the strip, the
     * banner and the period's empty state.
     * @param {Object} m - view model (ov from buildModel, state, base, range, teamView, thisYear, historyError)
     * @returns {string}
     */
    const buildOverviewTab = (m) => {
        if (m.historyError) return '<div class="rc-ov">' + buildNeedsYou(m) + rcShell.errorBox('Couldn’t load your calls', m) + '</div>';
        const body = m.ov.kpis.calls
            ? '<div class="rc-ov-pair">' + buildChart(m) + buildOutcomes(m) + '</div>' + buildRecent(m)
            : '<div class="rc-card">' + rcShell.stateBox(rcCalls.EMPTY_CALLS[m.state.range] || rcCalls.EMPTY_CALLS.custom,
                'Calls you make from NetSuite show up here.') + '</div>';
        return '<div class="rc-ov">' + buildKpis(m) + buildNeedsYou(m) + body + '</div>';
    };

    // ─── CSS ───────────────────────────────────────────────────────────────

    // Plain CSS: no backticks, no dollar-brace.
    const OVERVIEW_CSS = `
  :root { --ov-missed: #F2A79B; --ov-hover: #F6F5F2; --needs-bg: #FFF8E8; --needs-line: #F3DFAE; --needs-ink: #6B4A00; }
  .rc-ov { display: flex; flex-direction: column; gap: 14px; }
  .rc-ov h2 { margin: 0; font-size: 15px; font-weight: 700; }
  .rc-ov a { text-decoration: none; }
  /* KPI strip: four result cards */
  .rc-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
  .rc-kpi { min-width: 0; padding: 14px 16px; display: flex; flex-direction: column; }
  .rc-kpi-label { font-size: 13px; color: var(--muted); }
  .rc-kpi-main { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; margin-top: 2px; }
  .rc-kpi-main.rc-tight { gap: 4px; }
  .rc-kpi-value { font-size: 30px; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; }
  .rc-kpi-unit { font-size: 15px; font-weight: 600; color: var(--muted); }
  .rc-kpi-delta { font-size: 12px; font-weight: 600; color: var(--muted); font-variant-numeric: tabular-nums; }
  .rc-kpi-delta.rc-good { color: var(--good-fg); }
  .rc-kpi-bar { display: flex; gap: 2px; height: 6px; margin-top: 8px; border-radius: 999px; overflow: hidden; background: var(--line-soft); }
  .rc-kpi-bands:not(:empty) { background: transparent; }
  .rc-kpi-fill { display: block; height: 100%; background: var(--navy); }
  .rc-band-low { background: #E7837A; }
  .rc-band-mid { background: #E9A62A; }
  .rc-band-high { background: #5DBB8A; }
  .rc-kpi-sub { margin-top: 4px; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .rc-kpi-bar + .rc-kpi-sub { margin-top: 6px; }
  /* Needs you */
  .rc-needs { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 18px; padding: 10px 14px; border: 1px solid var(--needs-line); border-radius: 10px;
    background: var(--needs-bg); font-size: 13px; }
  .rc-needs-title { font-weight: 700; color: var(--needs-ink); }
  .rc-ov .rc-needs a { display: inline-flex; align-items: center; gap: 6px; color: var(--ink); }
  .rc-ov .rc-needs a:hover { text-decoration: underline; }
  .rc-needs strong { font-variant-numeric: tabular-nums; }
  .rc-needs-dot { flex: none; width: 8px; height: 8px; border-radius: 999px; }
  .rc-dot-callback { background: #E7837A; }
  .rc-dot-review { background: #E9A62A; }
  .rc-dot-overdue { background: #9A2A23; }
  .rc-ov .rc-needs .rc-needs-cta { margin-left: auto; font-weight: 600; color: var(--link); }
  /* Chart + Outcomes */
  .rc-ov-pair { display: grid; grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr); gap: 12px; }
  .rc-ov-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
  .rc-ov-chart { min-width: 0; padding: 16px 18px 12px; }
  .rc-ov-legend { display: flex; gap: 14px; align-items: center; font-size: 12px; color: var(--muted); }
  .rc-ov-legend span { display: inline-flex; align-items: center; gap: 6px; }
  .rc-ov-key { display: inline-block; width: 10px; height: 10px; border-radius: 3px; }
  .rc-ov-conn { background: var(--navy); }
  .rc-ov-missed { background: var(--ov-missed); }
  .rc-ov-figure { margin-top: 12px; display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 8px; }
  .rc-ov-ticks { position: relative; height: 160px; font-size: 11px; color: var(--faint); font-variant-numeric: tabular-nums; }
  .rc-ov-ticks span { position: absolute; right: 0; line-height: 12px; transform: translateY(50%); }
  .rc-ov-main { min-width: 0; display: flex; flex-direction: column; }
  .rc-ov-plot { position: relative; height: 160px; display: grid; align-items: end; border-bottom: 1px solid var(--line); }
  .rc-ov-lines { position: absolute; left: 0; right: 0; bottom: 0; height: 130px; pointer-events: none;
    background-image: linear-gradient(var(--line-soft) 1px, transparent 1px); background-size: 100% 25%; }
  .rc-ov-bar { position: relative; z-index: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
    gap: 6px; border-radius: 8px; color: var(--ink); }
  .rc-ov-bar:hover, .rc-ov-bar:focus-visible { z-index: 2; color: var(--ink); }
  .rc-ov-total { font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .rc-ov-stack { width: 100%; max-width: 40px; display: flex; flex-direction: column; border-radius: 5px 5px 0 0; overflow: hidden; }
  .rc-ov-stack span { display: block; }
  .rc-ov-tip { position: absolute; top: -6px; left: 0; z-index: 3; width: max-content; max-width: 240px; display: flex; flex-direction: column; align-items: flex-start;
    padding: 8px 10px; border-radius: 8px; background: var(--ink); color: #FFFFFF; font-size: 12px; line-height: 1.45; text-align: left;
    font-variant-numeric: tabular-nums; box-shadow: 0 6px 16px rgba(22,21,19,0.2); pointer-events: none;
    opacity: 0; visibility: hidden; transition: opacity 120ms ease-out, visibility 0s linear 120ms; }
  .rc-ov-tip-end { left: auto; right: 0; }
  .rc-ov-tip b { font-weight: 700; }
  .rc-ov-tip-hint { color: var(--band-muted); }
  .rc-ov-bar:hover .rc-ov-tip, .rc-ov-bar:focus-visible .rc-ov-tip { opacity: 1; visibility: visible; transition: opacity 120ms ease-out; }
  .rc-ov-labels { display: grid; padding-top: 6px; font-size: 12px; line-height: 1.3; color: var(--muted); text-align: center; }
  .rc-ov-labels div { min-width: 0; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .rc-ov-labels b { display: block; font-weight: 600; color: var(--ink); }
  .rc-ov-oc { min-width: 0; padding: 16px 12px 10px; }
  .rc-ov-oc .rc-ov-head { padding: 0 6px; align-items: baseline; }
  .rc-ov-meta { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .rc-ov-oc-list { margin-top: 6px; display: flex; flex-direction: column; }
  .rc-ov-oc-row { display: grid; grid-template-columns: minmax(0, 1fr) 36px; gap: 4px 10px; align-items: center; padding: 8px 10px; border-radius: 8px;
    font-size: 13px; color: var(--ink); }
  .rc-ov-oc-row:hover { color: var(--ink); }
  .rc-ov-oc-n { font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; }
  .rc-ov-oc-track { grid-column: span 2; height: 6px; border-radius: 999px; background: var(--line-soft); overflow: hidden; }
  .rc-ov-oc-track span { display: block; height: 100%; border-radius: 999px; }
  /* Recent calls (rows: the Calls table's rc-row) */
  .rc-ov-recent { overflow: hidden; }
  .rc-ov-recent .rc-ov-head { padding: 14px 18px 10px; }
  .rc-ov-link { font-size: 13px; font-weight: 600; }
  .rc-ov .rc-ov-link:hover { text-decoration: underline; }
  .rc-ov-scroll { overflow-x: auto; }
  .rc-ov-table { min-width: 820px; }
  .rc-ov-table .rc-row { grid-template-columns: 128px minmax(150px, 1.3fr) minmax(130px, 1fr) minmax(150px, 1fr) 130px 70px; }
  .rc-ov-table.rc-ov-team .rc-row { grid-template-columns: 128px minmax(150px, 1.3fr) minmax(130px, 1fr) 150px minmax(150px, 1fr) 130px 70px; }
  .rc-ov-table .rc-row > :first-child { padding-left: 18px; }
  .rc-ov-table .rc-row > :last-child { padding-right: 18px; }
  .rc-ov-table .rc-row:last-child { border-bottom: 0; }
  @media (max-width: 900px) {
    .rc-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .rc-ov-pair { grid-template-columns: minmax(0, 1fr); }
  }
  @media (hover: hover) and (pointer: fine) {
    .rc-ov-bar:hover, .rc-ov-oc-row:hover { background: var(--ov-hover); }
  }
  @media (prefers-reduced-motion: reduce) {
    .rc-ov-tip, .rc-ov-bar:hover .rc-ov-tip, .rc-ov-bar:focus-visible .rc-ov-tip { transition: none; }
  }
`;

    return {
        RECENT_LIMIT, PLOT_PX,
        isConnected, computeKpis, callsDelta, sameCaller, callsToReturn, followUpCounts, pendingByCall, needsYou,
        chartModel, outcomeBreakdown, buildModel,
        buildKpis, buildNeedsYou, barUrl, buildChart, buildOutcomes, buildRecent, buildOverviewTab,
        OVERVIEW_CSS
    };
});
