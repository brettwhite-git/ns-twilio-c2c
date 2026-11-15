// @ts-check
/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Reporting Central page shell: URL state (params, links, GET forms), the
 * app bar (back, title, Overview · Calls · Follow-ups, the user), the page
 * header (title, scope line, Time range / Owner selects, date chip, custom
 * dates), CSS tokens and shared styles, and the shared client script
 * (busy state, select navigation, custom range). Tab content lives in
 * lib/ctc_rc_calls.js, lib/ctc_rc_overview.js and lib/ctc_rc_followups.js.
 *
 * Busy state: a click on a data-nav link or form, or a select change, never
 * swaps the content. The old page stays as it is until the next one paints
 * (the browser's paint holding); body.rc-busy dims #rc-content only after
 * 200 ms, and an app-bar tab turns current at once.
 */
define(['./ctc_html', './ctc_fonts', './ctc_rc_scope'], (ctcHtml, ctcFonts, rcScope) => {

    const escapeHtml = ctcHtml.escapeHtml;
    const safeJsonEmbed = ctcHtml.safeJsonEmbed;

    const DASHBOARD_URL = '/app/center/card.nl?sc=-29';
    const MAX_QUERY = 80;

    // Old `tab=missed` links open Calls with the Missed filter (parseParams).
    const TABS = ['overview', 'calls', 'followups'];
    const NAV = [
        { tab: 'overview', label: 'Overview' },
        { tab: 'calls', label: 'Calls' },
        { tab: 'followups', label: 'Follow-ups' }
    ];
    const TITLES = { overview: 'Overview', calls: 'Calls', followups: 'Follow-ups' };
    // The Calls list filters (segmented tabs). Old `dir=inbound` falls back to all.
    const DIRS = ['all', 'connected', 'missed', 'outbound'];
    // The Follow-ups list (segmented tabs, URL `ftab`) and its quick filters (`due`).
    const FTABS = ['review', 'tasks', 'done'];
    const DUES = ['overdue', 'week'];
    // owner 'team' is the managers' default; reps never carry owner.
    const DEFAULTS = { range: rcScope.DEFAULT_RANGE, tab: 'overview', dir: 'all', owner: 'team', ftab: 'review', due: '' };
    const RANGE_OPTIONS = {
        today: 'Today', yesterday: 'Yesterday', last7: 'Last 7 days', thisweek: 'This week', lastweek: 'Last week',
        last30: 'Last 30 days', thismonth: 'This month', custom: 'Custom range…'
    };

    // ─── Parameters ────────────────────────────────────────────────────────

    const pick = (value, allowed, fallback) => (allowed.indexOf(value) !== -1 ? value : fallback);

    /**
     * Validate every query parameter against a whitelist. Unknown or bad
     * values fall back to the defaults (range last7, tab overview, dir all).
     * `owner` keeps only 'team', 'me' or digits; lib/ctc_rc_scope.js decides
     * whether the user may use it. `tab=missed` (older links) becomes the
     * Calls tab with dir=missed. `call` (a Phone Call id to open) and `fu`
     * (a proposed task id to open) must be digits only, else ''. `ftab`
     * (review | tasks | done) and `due` (overdue | week | '') are the
     * Follow-ups list's tab and quick filter.
     * @param {Object} params - request.parameters
     * @returns {{range: string, from: string, to: string, tab: string, dir: string, q: string,
     *   owner: string, csv: boolean, call: string, ftab: string, due: string, fu: string}}
     */
    const parseParams = (params) => {
        const p = params || {};
        const range = rcScope.normalizeRange(p.range);
        let from = range === 'custom' ? rcScope.isoDate(p.from) : '';
        let to = range === 'custom' ? rcScope.isoDate(p.to) : '';
        if (from && to && from > to) { const t = from; from = to; to = t; }
        // eslint-disable-next-line no-control-regex
        const q = (typeof p.q === 'string' ? p.q : '').replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, MAX_QUERY);
        const owner = typeof p.owner === 'string' && /^(team|me|[0-9]{1,12})$/.test(p.owner) ? p.owner : '';
        const oldMissed = p.tab === 'missed';
        return {
            range: range,
            from: from,
            to: to,
            tab: oldMissed ? 'calls' : pick(p.tab, TABS, DEFAULTS.tab),
            dir: oldMissed ? 'missed' : pick(p.dir, DIRS, DEFAULTS.dir),
            q: q,
            owner: owner,
            csv: p.csv === '1',
            call: typeof p.call === 'string' && /^[0-9]{1,12}$/.test(p.call) ? p.call : '',
            ftab: pick(p.ftab, FTABS, DEFAULTS.ftab),
            due: pick(p.due, DUES, DEFAULTS.due),
            fu: typeof p.fu === 'string' && /^[0-9]{1,12}$/.test(p.fu) ? p.fu : ''
        };
    };

    /**
     * Build a link to this Suitelet that keeps the current params, with
     * overrides. Default values are left out to keep URLs short. `call` and
     * `fu` are kept only when the overrides name them: tab, range, filter
     * and CSV links close the detail.
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
        if (s.owner && s.owner !== DEFAULTS.owner) add('owner', s.owner);
        if (s.tab && s.tab !== DEFAULTS.tab) add('tab', s.tab);
        if (s.dir && s.dir !== DEFAULTS.dir) add('dir', s.dir);
        if (s.ftab && s.ftab !== DEFAULTS.ftab) add('ftab', s.ftab);
        if (s.due) add('due', s.due);
        if (s.q) add('q', s.q);
        if (s.csv) add('csv', '1');
        if (overrides && overrides.call) add('call', overrides.call);
        if (overrides && overrides.fu) add('fu', overrides.fu);
        if (!pairs.length) return base;
        return base + (base.indexOf('?') === -1 ? '?' : '&') + pairs.join('&');
    };

    const hiddenInput = (name, value) =>
        '<input type="hidden" name="' + escapeHtml(name) + '" value="' + escapeHtml(value) + '">';

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

    /**
     * Hidden inputs that carry the current state through a GET form,
     * except the named keys (the form's own fields). Defaults are left out.
     * @param {Object} state
     * @param {Array<string>} except
     * @returns {string}
     */
    const stateInputs = (state, except) => {
        const s = state;
        const skip = (k) => except.indexOf(k) !== -1;
        return [
            !skip('range') && s.range !== DEFAULTS.range ? hiddenInput('range', s.range) : '',
            !skip('from') && s.range === 'custom' && s.from ? hiddenInput('from', s.from) : '',
            !skip('to') && s.range === 'custom' && s.to ? hiddenInput('to', s.to) : '',
            !skip('owner') && s.owner && s.owner !== DEFAULTS.owner ? hiddenInput('owner', s.owner) : '',
            !skip('tab') && s.tab !== DEFAULTS.tab ? hiddenInput('tab', s.tab) : '',
            !skip('dir') && s.dir !== DEFAULTS.dir ? hiddenInput('dir', s.dir) : '',
            !skip('ftab') && s.ftab && s.ftab !== DEFAULTS.ftab ? hiddenInput('ftab', s.ftab) : '',
            !skip('due') && s.due ? hiddenInput('due', s.due) : '',
            !skip('q') && s.q ? hiddenInput('q', s.q) : ''
        ].join('');
    };

    // ─── Shared UI helpers ─────────────────────────────────────────────────

    const svgIcon = (path, opts) => {
        const o = opts || {};
        return '<svg width="' + (o.size || 13) + '" height="' + (o.size || 13) + '" viewBox="0 0 24 24" fill="none" stroke="' +
            (o.stroke || 'currentColor') + '" stroke-width="' + (o.width || 2) + '" stroke-linecap="round" stroke-linejoin="round"' +
            (o.label ? ' role="img" aria-label="' + escapeHtml(o.label) + '"' : ' aria-hidden="true"') + '><path d="' + path + '"></path></svg>';
    };

    const stateBox = (title, sub, action) =>
        '<div class="rc-state"><span class="rc-state-title">' + escapeHtml(title) + '</span>' +
        (sub ? '<span class="rc-state-sub">' + escapeHtml(sub) + '</span>' : '') + (action || '') + '</div>';

    const errorBox = (title, m) =>
        '<div class="rc-card">' + stateBox(title, 'Your calls are safe. Reload to try again.',
            '<a class="rc-btn rc-btn-outline" href="' + escapeHtml(buildUrl(m.base, m.state)) + '">Try again</a>') + '</div>';

    /**
     * Two initials from a name ("Burt Brocus" → "BB"); '' for no name.
     * @param {string} name
     * @returns {string}
     */
    const initials = (name) => {
        const words = String(name || '').trim().split(/ +/).filter(Boolean);
        if (!words.length) return '';
        const first = words[0].charAt(0);
        const last = words.length > 1 ? words[words.length - 1].charAt(0) : '';
        return (first + last).toUpperCase();
    };

    // ─── App bar & page header ─────────────────────────────────────────────

    const HOME = 'M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z';
    const CALENDAR = 'M8 3v3M16 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z';

    /**
     * The navy app bar.
     * @param {Object} m - view model (state, base, who, userName)
     * @returns {string}
     */
    const buildAppBar = (m) => {
        const active = m.state.tab;
        const ini = initials(m.userName);
        return '<header class="rc-bar"><div class="rc-bar-in">' +
            '<span class="rc-brand">Call Central</span>' +
            '<a class="rc-home" href="' + DASHBOARD_URL + '" aria-label="NetSuite home" title="NetSuite home">' +
                svgIcon(HOME, { size: 17, width: 1.8 }) + '</a>' +
            '<nav class="rc-nav" aria-label="Call Central">' + NAV.map((n) =>
                '<a data-nav href="' + escapeHtml(buildUrl(m.base, m.state, { tab: n.tab })) + '"' +
                (active === n.tab ? ' aria-current="page"' : '') + '>' + escapeHtml(n.label) + '</a>'
            ).join('') + '</nav>' +
            '<span class="rc-me">' +
                (m.who ? '<span class="rc-who">' + escapeHtml(m.who) + '</span>' : '') +
                (ini ? '<span class="rc-avatar" aria-hidden="true">' + escapeHtml(ini) + '</span>' : '') +
            '</span>' +
            '</div></header>';
    };

    const option = (value, label, selected) =>
        '<option value="' + escapeHtml(value) + '"' + (selected ? ' selected' : '') + '>' + escapeHtml(label) + '</option>';

    /**
     * Header row: title + scope line, then (right beside it) Time range,
     * Owner (managers only), the date chip and the custom dates form. The selects sit in one GET form that carries the other
     * params; the client submits it on change ("Custom range…" opens the
     * custom dates form instead).
     * @param {Object} m - view model (state, base, range, owner, todayIso; scopeLine overrides the line)
     * @returns {string}
     */
    const buildPageHeader = (m) => {
        const s = m.state;
        const form = formTarget(m.base);
        // A tab may set its own scope line (Follow-ups: open work ignores the range).
        const scopeLine = m.scopeLine || [m.range.label, m.range.pending ? 'pick dates' : m.range.span, rcScope.ownerLabel(m.owner)].join(' · ');
        const today = rcScope.longDay(m.todayIso);
        const rangeSelect = '<div class="rc-ctl"><label class="rc-ctl-label" for="rc-range">Time range</label>' +
            '<select id="rc-range" name="range" class="rc-select">' +
            rcScope.RANGES.map((r) => option(r, RANGE_OPTIONS[r], s.range === r)).join('') + '</select></div>';
        const owner = m.owner;
        const ownerSelect = !owner.isManager ? '' :
            '<div class="rc-ctl"><label class="rc-ctl-label" for="rc-owner">Owner</label>' +
            '<select id="rc-owner" name="owner" class="rc-select">' +
            option('team', 'My team (' + owner.team.length + ')', owner.mode === 'team') +
            option('me', 'Me', owner.mode === 'me') +
            owner.team.map((t) => option(t.id, t.name, owner.mode === 'member' && owner.owner === t.id)).join('') +
            '</select></div>';
        return '<div class="rc-pagehead">' +
            '<div class="rc-titles"><h1>' + escapeHtml(TITLES[s.tab]) + '</h1>' +
                '<p class="rc-scope">' + escapeHtml(scopeLine) + '</p></div>' +
            '<form class="rc-controls" id="rc-controls" method="get" action="' + escapeHtml(form.action) + '">' + form.hidden +
                stateInputs(s, ['range', 'owner']) +
                rangeSelect + ownerSelect +
                '<button type="button" class="rc-date-chip" id="rc-date-chip" aria-controls="rc-custom" aria-expanded="' +
                    (s.range === 'custom' ? 'true' : 'false') + '" aria-label="' + escapeHtml('Today is ' + today + '. Pick a custom range') +
                    '" title="Pick a custom range"><span>' + escapeHtml(today) + '</span>' + svgIcon(CALENDAR, { size: 18, width: 1.8 }) + '</button>' +
            '</form>' +
            // The custom dates open beside the date chip, on the same row.
            buildCustomForm(m) +
            '</div>';
    };

    /**
     * The custom from / to form: shown when range=custom or when the date
     * chip (or "Custom range…") opens it.
     * @param {Object} m
     * @returns {string}
     */
    const buildCustomForm = (m) => {
        const s = m.state;
        const form = formTarget(m.base);
        const custom = s.range === 'custom';
        return '<form class="rc-custom" id="rc-custom" method="get" data-nav action="' + escapeHtml(form.action) + '"' + (custom ? '' : ' hidden') + '>' +
            form.hidden + hiddenInput('range', 'custom') + stateInputs(s, ['range', 'from', 'to']) +
            '<label>From <input type="date" name="from" value="' + escapeHtml(custom ? s.from : '') + '" required></label>' +
            '<label>To <input type="date" name="to" value="' + escapeHtml(custom ? s.to : '') + '" required></label>' +
            '<button type="submit" class="rc-btn rc-btn-outline">Show</button>' +
            (custom && m.range.pending ? '<span class="rc-hint">Showing today until you pick dates.</span>' : '') +
            '</form>';
    };

    /**
     * The whole page.
     * @param {{m: Object, body: string, css: string, cfg: Object, scripts: Array<string>, fit?: boolean}} p
     *   m: view model (state, base, who, userName, range, owner, todayIso);
     *   body: the tab's HTML under the header; css: the tab modules' CSS;
     *   cfg: window.CTC_RC; scripts: client scripts after the shell's;
     *   fit: the page is the window's height and the tab's region
     *   (.rc-fill) takes what is left and scrolls inside (Calls list).
     * @returns {string}
     */
    const buildPage = (p) => {
        const m = p.m;
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Call Central</title>
${ctcFonts.buildFigtreeStyle({ preload: true })}
<style>${shellCss()}${p.css || ''}</style>
</head>
<body${p.fit ? ' class="rc-fit"' : ''}>
${buildAppBar(m)}
<main class="rc-page">
${buildPageHeader(m)}
${p.body}
</main>
<script>window.CTC_RC = ${safeJsonEmbed(p.cfg || {})};</script>
<script>${SHELL_CLIENT_JS}</script>
${(p.scripts || []).map((js) => '<script>' + js + '</script>').join('\n')}
</body>
</html>`;
    };

    const SELECT_CHEVRON = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235C5955' stroke-width='2.4' stroke-linecap='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")";

    const shellCss = () => `
  :root {
    --ink: #161513; --muted: #5C5955; --faint: #8B8780; --line: #E5E2DD; --line-soft: #F1EFEA;
    --panel: #FAFAF8; --input: #D9D5CF; --link: #1B6097; --link-hover: #345D7E;
    --blue: #345D7E; --focus: #74C0FC;
    --navy: #1F3550; --band-muted: #C9D6E6; --amber: #F2B33D; --avatar: #38507A;
    --good-fg: #0E6B45; --good-bg: #E3F5EC; --mid-fg: #8A5A00; --mid-bg: #FFF3D6; --low-fg: #9A2A23; --low-bg: #FCE9E7;
    --in-fg: var(--link); --in-bg: #E8F3FC; --out-fg: var(--muted); --out-bg: var(--line-soft); --missed-fg: #9A3A2C; --missed-bg: #FCE9E7;
    --font: ${ctcFonts.FONT_STACK};
    --mono: ${ctcFonts.MONO_STACK};
  }
  * { box-sizing: border-box; }
  /* The scrollbar's room is kept when a page does not scroll (Overview vs
     the fit tabs), so the centred layout never moves sideways. */
  html { scrollbar-gutter: stable; }
  [hidden] { display: none !important; }
  body { margin: 0; background: #FFFFFF; color: var(--ink); font-family: var(--font); -webkit-font-smoothing: antialiased; }
  a { color: var(--link); }
  a:hover { color: var(--link-hover); }
  a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible { outline: none; box-shadow: 0 0 0 2px #FFFFFF, 0 0 0 4px var(--focus); }
  .rc-bar { background: var(--navy); color: #FFFFFF; }
  .rc-bar-in { max-width: 1600px; margin: 0 auto; padding: 0 24px; height: 52px; display: flex; align-items: center; gap: 20px; }
  .rc-home { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; margin: 0 -8px 0 -6px; border-radius: 8px;
    color: var(--band-muted); transition: background-color 120ms ease, color 120ms ease; }
  .rc-home:hover { color: #FFFFFF; background: rgba(255,255,255,0.08); }
  .rc-brand { flex: none; font-size: 15px; font-weight: 700; white-space: nowrap; }
  .rc-nav { display: flex; gap: 2px; height: 52px; min-width: 0; overflow-x: auto; }
  .rc-nav a { display: flex; align-items: center; padding: 0 10px; font-size: 14px; font-weight: 500; color: var(--band-muted); text-decoration: none; white-space: nowrap; }
  .rc-nav a:hover { color: #FFFFFF; }
  .rc-nav a[aria-current="page"] { color: #FFFFFF; font-weight: 600; box-shadow: inset 0 -3px 0 var(--amber); }
  .rc-me { margin-left: auto; display: flex; align-items: center; gap: 10px; min-width: 0; }
  .rc-who { font-size: 12px; color: var(--band-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rc-avatar { flex: none; width: 30px; height: 30px; border-radius: 999px; background: var(--avatar); display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; color: #FFFFFF; }
  .rc-page { max-width: 1600px; margin: 0 auto; padding: 18px 24px 32px; display: flex; flex-direction: column; gap: 14px; }
  /* Fit: the page is the window's height (100vh = the band + the rest);
     the tab's .rc-fill region takes what is left, at least 560 px, and
     scrolls inside. */
  body.rc-fit { height: 100vh; display: flex; flex-direction: column; }
  body.rc-fit .rc-bar { flex: none; }
  body.rc-fit .rc-page { flex: 1 1 auto; min-height: 0; width: 100%; padding-bottom: 24px; }
  body.rc-fit .rc-page > * { flex: none; }
  body.rc-fit .rc-content { flex: 1 1 auto; min-height: 560px; }
  body.rc-fit .rc-fill { flex: 1 1 0; min-height: 0; }
  .rc-pagehead { display: flex; align-items: flex-end; justify-content: flex-start; gap: 16px 32px; flex-wrap: wrap; }
  .rc-titles h1 { margin: 0; font-size: 26px; font-weight: 700; letter-spacing: -0.02em; }
  .rc-scope { margin: 2px 0 0; font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .rc-controls { margin: 0; display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
  .rc-ctl-label { display: block; margin-bottom: 4px; font-size: 12px; font-weight: 600; color: var(--muted); }
  .rc-select { height: 36px; min-width: 150px; padding: 0 32px 0 12px; border: 1px solid var(--input); border-radius: 8px; background: #FFFFFF ${SELECT_CHEVRON} no-repeat right 11px center;
    font: 500 13px var(--font); color: var(--ink); cursor: pointer; appearance: none; -webkit-appearance: none; }
  .rc-date-chip { height: 36px; display: inline-flex; align-items: center; gap: 8px; padding: 0 4px 0 6px; border: 0; border-radius: 8px; background: transparent;
    font: 13px var(--font); color: var(--muted); cursor: pointer; font-variant-numeric: tabular-nums; }
  .rc-date-chip:hover { color: var(--ink); }
  .rc-custom { min-height: 36px; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-left: -20px; font-size: 13px; color: var(--muted); }
  .rc-custom label { display: inline-flex; align-items: center; gap: 6px; }
  .rc-custom input { height: 32px; padding: 0 8px; border: 0; border-radius: 8px; box-shadow: inset 0 0 0 1px var(--input); font: 13px var(--font); color: var(--ink); background: #FFFFFF; }
  .rc-hint { font-size: 12px; }
  .rc-truncated { margin: 0; padding: 10px 14px; border-radius: 10px; background: var(--mid-bg); color: var(--mid-fg); font-size: 13px; }
  .rc-content { display: flex; flex-direction: column; gap: 24px; }
  .rc-btn { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px; border: 0; border-radius: 8px; font: 500 13px var(--font);
    color: var(--ink); background: transparent; text-decoration: none; cursor: pointer; white-space: nowrap;
    transition: background-color 120ms ease, transform 140ms ease-out, opacity 120ms ease; }
  .rc-btn:hover { color: var(--ink); }
  .rc-btn:active { transform: scale(0.97); }
  .rc-btn:disabled { opacity: 0.4; cursor: default; transform: none; }
  .rc-btn-outline { box-shadow: inset 0 0 0 1px var(--input); background: #FFFFFF; }
  .rc-btn-outline:hover { background: var(--panel); }
  .rc-btn-quiet { height: 30px; color: var(--link); }
  .rc-btn-quiet:hover { color: var(--link-hover); }
  .rc-card { border-radius: 12px; background: #FFFFFF; box-shadow: 0 0 0 1px rgba(22,21,19,0.08), 0 1px 2px rgba(22,21,19,0.04); }
  .rc-state { min-height: 200px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 24px 16px; text-align: center; }
  .rc-state-title { font-size: 13.5px; font-weight: 500; }
  .rc-state-sub { font-size: 12px; color: var(--muted); }
  .rc-state .rc-btn { height: 30px; font-size: 12px; }
  /* Busy (the next page is loading): no layout change; the content dims
     only when the load takes longer than 200 ms. */
  body.rc-busy #rc-content { opacity: 0.55; transition: opacity 150ms ease-out 200ms; }
  @media (max-width: 720px) {
    .rc-bar-in, .rc-page { padding-left: 16px; padding-right: 16px; }
    .rc-who { display: none; }
    .rc-custom { margin-left: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .rc-btn:active { transform: none; }
    body.rc-busy #rc-content { transition: opacity 0s linear 200ms; }
  }
`;

    // Shared client script: plain ES5 inside a template literal. No
    // backticks, no dollar-brace, no backslashes.
    const SHELL_CLIENT_JS = `
(function () {
  function byId(id) { return document.getElementById(id); }
  function closest(el, sel) { return el && el.closest ? el.closest(sel) : null; }

  // Busy: the content stays; CSS dims it after a delay (body.rc-busy).
  function setLoading(on) {
    if (on) document.body.classList.add('rc-busy');
    else document.body.classList.remove('rc-busy');
  }
  // The app-bar tab the server marked current (put back on pageshow).
  var homeTab = document.querySelector('.rc-nav a[aria-current]');
  function markTab(a) {
    Array.prototype.forEach.call(document.querySelectorAll('.rc-nav a[aria-current]'), function (x) {
      if (x !== a) x.removeAttribute('aria-current');
    });
    if (a) a.setAttribute('aria-current', 'page');
  }
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = closest(e.target, 'a[data-nav]');
    if (!a) return;
    if (closest(a, '.rc-nav')) markTab(a);
    setLoading(true);
  });
  Array.prototype.forEach.call(document.querySelectorAll('form[data-nav]'), function (f) {
    f.addEventListener('submit', function () { setLoading(true); });
  });
  // Back / forward cache: the page comes back as it was left.
  window.addEventListener('pageshow', function () { setLoading(false); markTab(homeTab); });

  var controls = byId('rc-controls'), custom = byId('rc-custom'), chip = byId('rc-date-chip');
  function showCustom(on) {
    if (!custom) return;
    custom.hidden = !on;
    if (chip) chip.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) {
      var from = custom.querySelector('input[name=from]');
      if (from) from.focus();
    }
  }
  if (controls) controls.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || t.tagName !== 'SELECT') return;
    if (t.name === 'range' && t.value === 'custom') { showCustom(true); return; }
    setLoading(true);
    // requestSubmit fires the submit event (Follow-ups sends a held
    // approve / dismiss first); submit() does not.
    if (controls.requestSubmit) controls.requestSubmit();
    else controls.submit();
  });
  if (chip) chip.addEventListener('click', function () { showCustom(!!(custom && custom.hidden)); });
})();
`;

    return {
        DASHBOARD_URL, TABS, FTABS, DUES, DEFAULTS, MAX_QUERY,
        parseParams, buildUrl, formTarget, hiddenInput, stateInputs,
        svgIcon, stateBox, errorBox, initials,
        buildAppBar, buildPageHeader, buildCustomForm, buildPage, shellCss,
        SHELL_CLIENT_JS
    };
});
