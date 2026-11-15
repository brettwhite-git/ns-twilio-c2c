// @ts-check
/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Reporting Central scope: which dates and whose calls a page shows.
 *
 * Range: a key (today, yesterday, last7, thisweek, lastweek, last30,
 * thismonth, custom) becomes the `startdate` filter for the Phone Call
 * search (a NetSuite date keyword where one exists, else explicit dates
 * computed in the user's time zone via lib/ctc_time.js), the label and
 * date span for the scope line, and the period before it for the
 * "vs prior" delta. Unknown keys fall back to last7.
 *
 * Owner: a manager (Administrator role, or the supervisor of at least one
 * active employee) sees the team (default), themselves, or one team
 * member. Everyone else sees only their own calls. The team is read with
 * one SuiteQL query per request and cached for the execution.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/query', 'N/format', 'N/runtime', 'N/log', './ctc_time'], (query, format, runtime, log, ctcTime) => {

    const RANGES = ['today', 'yesterday', 'last7', 'thisweek', 'lastweek', 'last30', 'thismonth', 'custom'];
    const DEFAULT_RANGE = 'thisweek';
    const RANGE_LABELS = {
        today: 'Today', yesterday: 'Yesterday', last7: 'Last 7 days', thisweek: 'This week', lastweek: 'Last week',
        last30: 'Last 30 days', thismonth: 'This month', custom: 'Custom range'
    };
    // Older links (the portlet's Reporting Central link, earlier Recents
    // keys) keep working.
    const RANGE_ALIASES = { last7days: 'last7', last30days: 'last30' };

    // NetSuite search date keywords: the range itself, and the period
    // before it.
    const KEYWORD = { today: 'today', yesterday: 'yesterday', thisweek: 'thisweek', lastweek: 'lastweek', thismonth: 'thismonth' };
    const PREVIOUS_KEYWORD = { today: 'yesterday', thisweek: 'lastweektodate', lastweek: 'weekbeforelast', thismonth: 'lastmonthtodate' };
    const PREVIOUS_LABEL = {
        today: 'vs yesterday', yesterday: 'vs the day before', last7: 'vs the 7 days before', thisweek: 'vs last week',
        lastweek: 'vs the week before', last30: 'vs the 30 days before', thismonth: 'vs last month'
    };

    const ADMINISTRATOR_ROLE_ID = '3';
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // ─── Dates (pure) ──────────────────────────────────────────────────────

    const pad2 = (n) => (n < 10 ? '0' : '') + n;

    /** 'YYYY-MM-DD' → Date (local midnight). */
    const isoToDate = (iso) => {
        const m = String(iso).split('-');
        return new Date(parseInt(m[0], 10), parseInt(m[1], 10) - 1, parseInt(m[2], 10));
    };

    /** Date → 'YYYY-MM-DD'. */
    const dateToIso = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());

    /**
     * The ISO date `n` days after `iso` (negative = before).
     * @param {string} iso
     * @param {number} n
     * @returns {string}
     */
    const addDays = (iso, n) => {
        const d = isoToDate(iso);
        d.setDate(d.getDate() + n);
        return dateToIso(d);
    };

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
     * A range key from a URL value; unknown or missing → last7.
     * @param {*} value
     * @returns {string}
     */
    const normalizeRange = (value) => {
        const v = typeof value === 'string' ? (RANGE_ALIASES[value] || value) : '';
        return RANGES.indexOf(v) !== -1 ? v : DEFAULT_RANGE;
    };

    /** "Oct 27", with the year when it is not `thisYear`. */
    const shortDay = (iso, thisYear) => {
        const d = isoToDate(iso);
        return MONTHS[d.getMonth()] + ' ' + d.getDate() + (d.getFullYear() !== thisYear ? ', ' + d.getFullYear() : '');
    };

    /**
     * "Oct 27 – Nov 2" ("Nov 2" for one day); years appear only when a date
     * is not in the current year.
     * @param {string} from - ISO
     * @param {string} to - ISO
     * @param {number} thisYear
     * @returns {string}
     */
    const spanText = (from, to, thisYear) =>
        (from === to ? shortDay(from, thisYear) : shortDay(from, thisYear) + ' – ' + shortDay(to, thisYear));

    /** "Mon, Nov 2, 2026" (the date chip). */
    const longDay = (iso) => {
        const d = isoToDate(iso);
        return DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    };

    /**
     * Resolve a range. Pure: today's date and the first day of the week
     * come in `ctx`.
     * - `filter`: { keyword } (a NetSuite date keyword) or { from, to } (ISO).
     * - `from` / `to`: the span shown in the scope line (ISO). For keyword
     *   ranges it is the whole week / month, as NetSuite reads the keyword.
     * - `previous`: { filter, label } for the "vs prior" delta, or null.
     * - `pending`: custom without both dates (the page shows today until
     *   dates are picked).
     * @param {{range: string, from?: string, to?: string}} state
     * @param {{todayIso: string, weekStart?: number}} ctx - weekStart 0 = Sunday
     * @returns {{key: string, label: string, from: string, to: string, span: string,
     *   filter: {keyword?: string, from?: string, to?: string},
     *   previous: ({filter: {keyword?: string, from?: string, to?: string}, label: string}|null),
     *   pending: boolean}}
     */
    const resolveRange = (state, ctx) => {
        const s = state || { range: DEFAULT_RANGE };
        const key = normalizeRange(s.range);
        const today = ctx.todayIso;
        const thisYear = isoToDate(today).getFullYear();
        const weekStart = typeof ctx.weekStart === 'number' ? ctx.weekStart : 0;
        const prior = (f) => ({ filter: f, label: PREVIOUS_LABEL[key] });
        /** @type {{filter: {keyword?: string, from?: string, to?: string}, label: string}|null} */
        let previous = null;
        let from = today, to = today, filter = null, pending = false;

        if (key === 'today') {
            filter = { keyword: 'today' };
        } else if (key === 'yesterday') {
            from = to = addDays(today, -1);
            filter = { keyword: 'yesterday' };
            const before = addDays(today, -2);
            previous = prior({ from: before, to: before });
        } else if (key === 'last7' || key === 'last30') {
            const n = key === 'last7' ? 7 : 30;
            from = addDays(today, -(n - 1));
            filter = { from: from, to: to };
            previous = prior({ from: addDays(today, -(2 * n - 1)), to: addDays(today, -n) });
        } else if (key === 'thisweek' || key === 'lastweek') {
            const back = (isoToDate(today).getDay() - weekStart + 7) % 7;
            from = addDays(today, -back - (key === 'lastweek' ? 7 : 0));
            to = addDays(from, 6);
            filter = { keyword: KEYWORD[key] };
        } else if (key === 'thismonth') {
            const d = isoToDate(today);
            from = dateToIso(new Date(d.getFullYear(), d.getMonth(), 1));
            to = dateToIso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
            filter = { keyword: 'thismonth' };
        } else {
            let cf = isoDate(s.from), ct = isoDate(s.to);
            if (cf && ct && cf > ct) { const t = cf; cf = ct; ct = t; }
            if (cf && ct) {
                from = cf; to = ct;
                filter = { from: cf, to: ct };
            } else {
                // Custom without both dates: today until dates are picked.
                pending = true;
                filter = { keyword: 'today' };
            }
        }
        if (!previous && PREVIOUS_KEYWORD[key]) previous = prior({ keyword: PREVIOUS_KEYWORD[key] });

        return {
            key: key,
            label: pending ? 'Today' : RANGE_LABELS[key],
            from: from,
            to: to,
            span: spanText(from, to, thisYear),
            filter: filter,
            previous: previous,
            pending: pending
        };
    };

    /**
     * An N/search filter expression on `startdate` for a resolved filter.
     * Explicit dates go through `toNsDate` (the user's date format).
     * @param {{keyword?: string, from?: string, to?: string}} filter
     * @param {function(string): string} toNsDate - ISO → NetSuite date text
     * @returns {Array}
     */
    const searchDateFilter = (filter, toNsDate) => {
        if (filter.keyword) {
            const op = (filter.keyword === 'today' || filter.keyword === 'yesterday') ? 'on' : 'within';
            return ['startdate', op, filter.keyword];
        }
        if (filter.from === filter.to) return ['startdate', 'on', toNsDate(filter.from)];
        return ['startdate', 'within', toNsDate(filter.from), toNsDate(filter.to)];
    };

    /** ISO → the user's NetSuite date text (N/format). */
    const toNsDate = (iso) => format.format({ value: isoToDate(iso), type: format.Type.DATE });

    /**
     * Today in the user's time zone ('YYYY-MM-DD'); the server clock when
     * N/format cannot say.
     * @param {number} [nowMs]
     * @returns {string}
     */
    const todayIso = (nowMs) => {
        const now = typeof nowMs === 'number' ? nowMs : Date.now();
        let iso = '';
        try {
            iso = ctcTime.localIsoDate(now, ctcTime.userTimezone());
        } catch (e) {
            iso = '';
        }
        return iso || dateToIso(new Date(now));
    };

    /**
     * First day of the week from the user's preference FIRSTDAYOFWEEK
     * (0 = Sunday … 6 = Saturday); Sunday when it cannot be read. Only the
     * scope line uses it: the data filter is the NetSuite keyword.
     * @returns {number}
     */
    const weekStartDay = () => {
        try {
            const v = String(runtime.getCurrentUser().getPreference({ name: 'FIRSTDAYOFWEEK' }) || '').trim().toLowerCase();
            if (/^[1-7]$/.test(v)) return parseInt(v, 10) - 1;
            const i = DAYS.map((d) => d.toLowerCase()).indexOf(v.slice(0, 3));
            return i === -1 ? 0 : i;
        } catch (e) {
            return 0;
        }
    };

    // ─── Owner scope ───────────────────────────────────────────────────────

    // One read per execution (a Suitelet request runs as one user).
    let teamCache = null;

    /** Forget the cached team (tests). */
    const clearTeamCache = () => { teamCache = null; };

    const personName = (r) => {
        const full = (String(r.firstname || '') + ' ' + String(r.lastname || '')).trim();
        return full || String(r.entityid || '') || 'Employee ' + r.id;
    };

    /**
     * The user's team: active employees whose supervisor is the user, or,
     * for an Administrator, every active employee with an active rep
     * assignment (a phone user). The user is never in their own team.
     * One SuiteQL query. A query error gives an empty team (the user then
     * sees only their own calls; logged).
     * @param {{userId: number, isAdmin: boolean}} p
     * @returns {Array<{id: string, name: string}>}
     */
    const loadTeam = (p) => {
        const key = p.userId + ':' + (p.isAdmin ? 'a' : 's');
        if (teamCache && teamCache.key === key) return teamCache.team;
        let team = [];
        try {
            const sql = p.isAdmin
                ? 'SELECT DISTINCT e.id, e.firstname, e.lastname, e.entityid ' +
                  'FROM customrecord_ctc_rep_assignment ra ' +
                  'INNER JOIN employee e ON e.id = ra.custrecord_ctc_ra_employee ' +
                  'WHERE ra.isinactive = \'F\' AND e.isinactive = \'F\' AND e.id <> ?'
                : 'SELECT e.id, e.firstname, e.lastname, e.entityid FROM employee e ' +
                  'WHERE e.supervisor = ? AND e.isinactive = \'F\'';
            team = query.runSuiteQL({ query: sql, params: [p.userId] }).asMappedResults()
                .map((r) => ({ id: String(r.id), name: personName(r) }))
                .filter((m) => m.id && m.id !== String(p.userId));
            team.sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : (a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0)));
        } catch (e) {
            // A role without Employee access (e.g. a sales rep: "Record
            // 'employee' was not found") cannot be a manager here: expected,
            // so an audit note, not an error. A manager's role needs
            // Lists > Employees (View) for the team view.
            log.audit({ title: 'CTC Reporting — no team (lookup failed)', details: (e && e.message) || String(e) });
            team = [];
        }
        teamCache = { key: key, team: team };
        return team;
    };

    /**
     * Whose calls the page shows.
     * - Not a manager: always the user (`owner` is ignored).
     * - Manager: owner 'team' (default) = the whole team; 'me' = the user;
     *   an employee id in the team = that person. Anything else = default.
     * `ownerIds` is null for the user's own calls (the queries then use the
     * user's book, exactly as before), else the employee ids to scope by.
     * `owner` is the canonical URL value ('' for non-managers).
     * @param {{userId: (number|string), role: (number|string), owner?: string}} p
     * @returns {{isManager: boolean, isAdmin: boolean, team: Array<{id: string, name: string}>,
     *   mode: string, owner: string, ownerIds: (Array<string>|null), memberName: string}} mode: 'me' | 'team' | 'member'
     */
    const resolveOwnerScope = (p) => {
        const userId = parseInt(String(p.userId), 10);
        const isAdmin = String(p.role) === ADMINISTRATOR_ROLE_ID;
        // Any non-zero id: the account owner's employee id is -5.
        const team = userId && !isNaN(userId) ? loadTeam({ userId: userId, isAdmin: isAdmin }) : [];
        const isManager = isAdmin || team.length > 0;
        const base = { isManager: isManager, isAdmin: isAdmin, team: team, memberName: '' };
        if (!isManager) return Object.assign(base, { mode: 'me', owner: '', ownerIds: null });
        const want = typeof p.owner === 'string' ? p.owner : '';
        if (want === 'me' || want === String(userId)) return Object.assign(base, { mode: 'me', owner: 'me', ownerIds: null });
        const member = /^[0-9]{1,12}$/.test(want) ? team.filter((m) => m.id === want)[0] : null;
        if (member) return Object.assign(base, { mode: 'member', owner: member.id, ownerIds: [member.id], memberName: member.name });
        return Object.assign(base, { mode: 'team', owner: 'team', ownerIds: team.map((m) => m.id) });
    };

    /**
     * The owner half of the scope line: "Your calls", "My team · 3 reps"
     * or the member's name.
     * @param {{mode: string, team: Array, memberName: string}} owner
     * @returns {string}
     */
    const ownerLabel = (owner) => {
        if (owner.mode === 'team') return 'My team · ' + owner.team.length + ' rep' + (owner.team.length === 1 ? '' : 's');
        if (owner.mode === 'member') return owner.memberName;
        return 'Your calls';
    };

    return {
        RANGES, DEFAULT_RANGE, RANGE_LABELS,
        isoDate, addDays, normalizeRange, spanText, longDay,
        resolveRange, searchDateFilter, toNsDate, todayIso, weekStartDay,
        loadTeam, clearTeamCache, resolveOwnerScope, ownerLabel
    };
});
