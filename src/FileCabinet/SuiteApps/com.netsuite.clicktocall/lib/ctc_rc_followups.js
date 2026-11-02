// @ts-check
/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Reporting Central Follow-ups tab (phase C): one list card with its own
 * toolbar (To review · My tasks · Done with counts, the Overdue / Due this
 * week quick filters, search, Export CSV), the follow-up table (checkboxes
 * and Dismiss / Approve on To review, a status chip elsewhere), the bulk
 * bar, the compact list and the follow-up detail panel opened without a
 * reload (the Calls tab's grid, sheet, motion and keys), and the undo
 * toast. Data: wq.loadFollowUpRows (the scope's open follow-ups whatever
 * their date; done ones only when done in the range). Actions: the ctc_rl_token RESTlet
 * (approveProposedTask, bulkApproveProposedTasks, rejectProposedTask,
 * completeFollowUpTask; getCallDetail for the source call's summary).
 * The page shell is lib/ctc_rc_shell.js; shared pieces (CSV cell, owner
 * cell, icons, short date) come from lib/ctc_rc_calls.js.
 */
define(['N/format', './ctc_html', './ctc_rc_shell', './ctc_rc_calls', './ctc_rc_scope'], (format, ctcHtml, rcShell, rcCalls, rcScope) => {

    const escapeHtml = ctcHtml.escapeHtml;
    const svgIcon = rcShell.svgIcon;
    const buildUrl = rcShell.buildUrl;

    const TASK_URL = '/app/crm/calendar/task.nl?id=';
    // Approve / dismiss wait this long (the toast's Undo) before they are sent.
    const HOLD_MS = 5000;

    const FTAB_LIST = [
        { key: 'review', label: 'To review' },
        { key: 'tasks', label: 'My tasks' },
        { key: 'done', label: 'Done' }
    ];
    const QUICK = [
        { key: 'overdue', label: 'Overdue' },
        { key: 'week', label: 'Due this week' }
    ];
    const EMPTY = {
        review: ['All caught up', 'New suggestions show up here after your calls are summarized.'],
        tasks: ['No open tasks', 'Approved follow-ups become NetSuite tasks and show up here.'],
        done: ['Nothing done yet', 'Completed and dismissed follow-ups show up here.']
    };
    // Stage (one per proposed task) → the list tab it lives in.
    const STAGE_TAB = { review: 'review', task: 'tasks', done: 'done', dismissed: 'done' };
    const CSV_HEADERS = ['Follow-up', 'Company', 'From call', 'Call date', 'Owner', 'Due', 'Status'];

    // ─── Rows → items (pure) ───────────────────────────────────────────────

    // nsToIso results per date string. The date format is a user
    // preference and module state outlives a request: ctc_sl_reporting
    // clears this per request (clearIsoMemo).
    let isoDates = {};
    const clearIsoMemo = () => { isoDates = {}; };

    /** A NetSuite date string (user format) → 'YYYY-MM-DD', '' when it cannot be read. Memoized. */
    const nsToIso = (nsDate) => {
        const v = String(nsDate || '').trim().split(' ')[0];
        if (!v) return '';
        if (Object.prototype.hasOwnProperty.call(isoDates, v)) return isoDates[v];
        let d = null;
        try {
            d = format.parse({ value: v, type: format.Type.DATE });
        } catch (e) {
            d = null;
        }
        const pad = (n) => (n < 10 ? '0' : '') + n;
        const iso = (!(d instanceof Date) || isNaN(d.getTime())) ? ''
            : d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
        isoDates[v] = iso;
        return iso;
    };

    // The date part of a NetSuite date or date-time string, short ("Nov 2").
    const shortOf = (nsValue, thisYear) => {
        const v = String(nsValue || '').trim().split(' ')[0];
        return v ? rcCalls.shortDate(v, thisYear) : '';
    };

    /**
     * Where a follow-up stands: 'review' (Pending), 'task' (Approved, the
     * Task not completed), 'done' (Approved, completed: the follow-up's
     * flag or the Task's own status), 'dismissed' (Rejected); null for
     * anything else.
     * @param {Object} r - loadFollowUpRows row
     * @returns {string|null}
     */
    const stageOf = (r) => {
        if (r.status === 'Pending') return 'review';
        if (r.status === 'Rejected') return 'dismissed';
        if (r.status !== 'Approved') return null;
        const complete = r.taskCompleted || r.taskStatus === 'COMPLETE' || /complete/i.test(String(r.taskStatusText || ''));
        return complete ? 'done' : 'task';
    };

    /**
     * The due chip. Open follow-ups (to review, tasks): before today
     * "Overdue", today "Due today", tomorrow "Due tomorrow", else
     * "Due Nov 4"; completed: "Done"; dismissed: the date only; no date: none.
     * @param {string} stage
     * @param {string} iso - due date
     * @param {{todayIso: string, thisYear: number}} ctx
     * @returns {{text: string, short: string, tone: string}} tone: overdue | soon | later | done | none
     */
    const dueChip = (stage, iso, ctx) => {
        if (stage === 'done') return { text: 'Done', short: 'Done', tone: 'done' };
        if (!iso) return { text: '—', short: '—', tone: 'none' };
        const day = rcScope.spanText(iso, iso, ctx.thisYear);
        if (stage === 'dismissed') return { text: 'Due ' + day, short: day, tone: 'later' };
        if (iso < ctx.todayIso) return { text: 'Overdue', short: 'Overdue', tone: 'overdue' };
        if (iso === ctx.todayIso) return { text: 'Due today', short: 'Due today', tone: 'soon' };
        if (iso === rcScope.addDays(ctx.todayIso, 1)) return { text: 'Due tomorrow', short: 'Due tomorrow', tone: 'soon' };
        return { text: 'Due ' + day, short: day, tone: 'later' };
    };

    const STATUS = {
        review: { text: 'To review', tone: 'review' },
        notstarted: { text: 'Not started', tone: 'task' },
        progress: { text: 'In progress', tone: 'task' },
        done: { text: 'Completed', tone: 'done' },
        dismissed: { text: 'Dismissed', tone: 'dismissed' }
    };
    const STAGE_CHIP = {
        review: { text: 'Suggested · not a task yet', tone: 'review' },
        notstarted: { text: 'Task · not started', tone: 'task' },
        progress: { text: 'Task · in progress', tone: 'task' },
        done: { text: 'Completed', tone: 'done' },
        dismissed: { text: 'Dismissed', tone: 'dismissed' }
    };

    /**
     * One follow-up as the page and its client script see it.
     * @param {Object} r - loadFollowUpRows row
     * @param {{todayIso: string, thisYear: number, userId: (string|number), base: string, state: Object}} ctx
     * @returns {Object|null}
     */
    const toItem = (r, ctx) => {
        const stage = stageOf(r);
        if (!stage) return null;
        const call = r.call || {};
        const progress = stage === 'task' && (r.taskStatus === 'PROGRESS' || /progress/i.test(String(r.taskStatusText || '')));
        const statusKey = stage === 'task' ? (progress ? 'progress' : 'notstarted') : stage;
        const dueNs = (stage === 'task' || stage === 'done') && r.taskDue ? r.taskDue : r.proposedDue;
        const dueIso = nsToIso(dueNs);
        const open = stage === 'review' || stage === 'task';
        const source = call.title || call.companyName || 'Call';
        const who = (id, name) => (id && String(id) === String(ctx.userId) ? 'you' : (name || ''));
        const history = [{ kind: 'ai', text: 'Suggested by AI from “' + source + '”', when: shortOf(r.created, ctx.thisYear) }];
        if (stage === 'task' || stage === 'done') {
            const by = who(r.reviewerId, r.reviewerName);
            history.push({ kind: 'approved', text: (by ? 'Approved by ' + by : 'Approved') + ' · Task created', when: shortOf(r.reviewedDate, ctx.thisYear) });
        }
        if (stage === 'done') history.push({ kind: 'done', text: 'Task completed', when: shortOf(r.completedDate, ctx.thisYear) });
        if (stage === 'dismissed') {
            const by = who(r.reviewerId, r.reviewerName);
            history.push({ kind: 'dismissed', text: by ? 'Dismissed by ' + by : 'Dismissed', when: shortOf(r.reviewedDate, ctx.thisYear) });
        }
        return {
            id: String(r.id),
            rank: r.rank || 0,
            text: r.text || 'Follow-up',
            company: call.companyName || '',
            companyId: call.companyId || '',
            callId: call.id || '',
            callTitle: source,
            callDate: call.date || '',
            callWhen: shortOf(call.date, ctx.thisYear),
            callLen: rcCalls.formatLength(call.duration),
            vm: !!call.voicemail,
            dir: call.voicemail ? 'missed' : (call.direction === 'inbound' ? 'in' : 'out'),
            ownerId: call.ownerId || '',
            ownerName: call.ownerName || '',
            stage: stage,
            tab: STAGE_TAB[stage],
            status: STATUS[statusKey],
            stageChip: STAGE_CHIP[statusKey],
            dueNs: dueNs || '',
            due: Object.assign({ iso: dueIso }, dueChip(stage, dueIso, ctx)),
            overdue: open && !!dueIso && dueIso < ctx.todayIso,
            week: open && !!dueIso && dueIso >= ctx.todayIso && dueIso <= rcScope.addDays(ctx.todayIso, 6),
            taskId: r.createdTaskId || '',
            taskAssigneeId: r.taskAssigneeId || '',
            taskAssigneeName: r.taskAssigneeName || '',
            taskPriority: r.taskPriority || '',
            history: history,
            callUrl: ''
        };
    };

    const matchesQuery = (it, q) => {
        if (!q) return true;
        const hay = (it.text + ' ' + it.company + ' ' + it.callTitle).toLowerCase();
        return hay.indexOf(q.toLowerCase()) !== -1;
    };

    // Due date ascending (oldest first), no due date last, then newest first.
    const byDue = (a, b) => {
        const x = a.due.iso, y = b.due.iso;
        if (x !== y) {
            if (!x) return 1;
            if (!y) return -1;
            return x < y ? -1 : 1;
        }
        return a.rank - b.rank;
    };

    /**
     * The tab's list and every count. A `fu` deep link to a follow-up that
     * is loaded but not in this list moves the page to its tab (and drops
     * the quick filter, and the search when it hides it). Mutates
     * `ctx.state` (ftab, due, q) in that case so links and forms agree.
     * @param {Array<Object>} rows - loadFollowUpRows rows
     * @param {{state: Object, todayIso: string, thisYear: number, userId: (string|number), base: string}} ctx
     * @returns {{items: Array<Object>, list: Array<Object>, tabCounts: Object<string, number>,
     *   quickCounts: Object<string, number>, selectedId: string}}
     */
    const buildModel = (rows, ctx) => {
        const s = ctx.state;
        const items = (rows || []).map((r) => toItem(r, ctx)).filter(Boolean);
        const inList = (it) => it.tab === s.ftab && (!s.due || it[s.due]) && matchesQuery(it, s.q);
        const linked = s.fu ? items.filter((it) => it.id === s.fu)[0] : null;
        if (linked && !inList(linked)) {
            s.ftab = linked.tab;
            s.due = '';
            if (!matchesQuery(linked, s.q)) s.q = '';
        }
        // "Open call": the source call in the Calls tab, drilled in; the
        // Calls list filters are reset so the call is in the list.
        items.forEach((it) => {
            if (it.callId) it.callUrl = buildUrl(ctx.base, s, { tab: 'calls', dir: 'all', q: '', ftab: 'review', due: '', call: it.callId });
        });
        const found = items.filter((it) => matchesQuery(it, s.q));
        /** @type {Object<string, number>} */
        const tabCounts = {};
        FTAB_LIST.forEach((t) => { tabCounts[t.key] = found.filter((it) => it.tab === t.key).length; });
        const inTab = found.filter((it) => it.tab === s.ftab);
        /** @type {Object<string, number>} */
        const quickCounts = {};
        QUICK.forEach((f) => { quickCounts[f.key] = inTab.filter((it) => it[f.key]).length; });
        const list = (s.due ? inTab.filter((it) => it[s.due]) : inTab).slice().sort(byDue);
        return {
            items: items,
            list: list,
            tabCounts: tabCounts,
            quickCounts: quickCounts,
            selectedId: s.fu && list.some((it) => it.id === s.fu) ? s.fu : ''
        };
    };

    // ─── CSV ───────────────────────────────────────────────────────────────

    /**
     * CSV for the current list (tab, quick filter, search, scope).
     * Formula-safe (rcCalls.csvCell).
     * @param {Array<Object>} list - buildModel().list
     * @returns {string}
     */
    const toCsv = (list) => {
        const lines = [CSV_HEADERS.map(rcCalls.csvCell).join(',')];
        (list || []).forEach((it) => {
            lines.push([it.text, it.company, it.callTitle, it.callDate, it.ownerName, it.dueNs, it.status.text].map(rcCalls.csvCell).join(','));
        });
        return lines.join('\r\n') + '\r\n';
    };

    // ─── HTML ──────────────────────────────────────────────────────────────

    const dueHtml = (due, short) => (due.tone === 'none'
        ? '<span class="rc-fu-due rc-fu-due-none">—</span>'
        : '<span class="rc-fu-due rc-fu-due-' + due.tone + '">' + escapeHtml(short ? due.short : due.text) + '</span>');

    const listBar = (m) => {
        const s = m.state;
        const fu = m.fu;
        const form = rcShell.formTarget(m.base);
        return '<div class="rc-list-bar" id="rc-fu-bar">' +
            '<nav class="rc-ftabs" aria-label="Show">' + FTAB_LIST.map((t) =>
                '<a data-nav href="' + escapeHtml(buildUrl(m.base, s, { ftab: t.key, due: '' })) + '"' + (s.ftab === t.key ? ' aria-current="true"' : '') + '>' +
                escapeHtml(t.label) + ' <span class="rc-count" data-fu-count="' + t.key + '">' + (m.tasksError ? '—' : String(fu.tabCounts[t.key] || 0)) + '</span></a>'
            ).join('') + '</nav>' +
            '<div class="rc-fu-quick" role="group" aria-label="Quick filters">' + QUICK.map((f) => {
                const on = s.due === f.key;
                return '<a data-nav class="rc-fu-pill rc-fu-pill-' + f.key + '" href="' + escapeHtml(buildUrl(m.base, s, { due: on ? '' : f.key })) + '"' +
                    (on ? ' aria-current="true"' : '') + '>' + escapeHtml(f.label) +
                    ' <span class="rc-fu-pill-n" data-fu-quick="' + f.key + '">' + (m.tasksError ? '—' : String(fu.quickCounts[f.key] || 0)) + '</span></a>';
            }).join('') + '</div>' +
            '<form class="rc-search" role="search" method="get" data-nav action="' + escapeHtml(form.action) + '">' + form.hidden +
                rcShell.stateInputs(s, ['q']) +
                '<label>' + rcCalls.SEARCH_ICON +
                '<input type="search" name="q" value="' + escapeHtml(s.q) + '" maxlength="' + rcShell.MAX_QUERY + '" placeholder="Follow-up, company or call" aria-label="Search follow-ups"></label></form>' +
            '<a class="rc-btn rc-btn-outline rc-csv" href="' + escapeHtml(buildUrl(m.base, s, { csv: true })) + '" title="Export the follow-ups in this list">' +
                svgIcon(rcCalls.ICON.download, { size: 14, width: 2 }) + 'Export CSV</a>' +
            '</div>';
    };

    const bulkBar = () =>
        '<div class="rc-fu-bulk" id="rc-fu-bulk" role="toolbar" aria-label="Selected follow-ups" hidden>' +
            '<span class="rc-fu-bulk-n" data-b="count">0 selected</span>' +
            '<button type="button" class="rc-btn rc-fu-bulk-approve" data-b="approve">Approve 0</button>' +
            '<button type="button" class="rc-btn rc-fu-bulk-dismiss" data-b="dismiss">Dismiss</button>' +
            '<button type="button" class="rc-fu-bulk-x" data-b="clear" aria-label="Clear selection" title="Clear selection">' +
                svgIcon(rcCalls.ICON.close, { size: 14 }) + '</button>' +
        '</div>';

    const headCells = (m, review) =>
        (review ? '<span role="columnheader" class="rc-fu-check"><input type="checkbox" id="rc-fu-all" aria-label="Select all"></span>' : '') +
        ['Follow-up', 'From call'].concat(m.teamView ? ['Owner'] : [], ['Due']).map((h) => '<span role="columnheader">' + h + '</span>').join('') +
        '<span role="columnheader" class="rc-right">' + (review ? 'Decide' : 'Status') + '</span>';

    const sourceCell = (it) =>
        '<span class="rc-fu-src"><i class="rc-fu-dot' + (it.vm ? ' rc-fu-dot-vm' : '') + '" aria-hidden="true"></i>' +
        '<span class="rc-fu-src-text">' + escapeHtml(it.callTitle) + '</span></span>';

    const tableRow = (it, m, review) => {
        const label = it.text;
        return '<div role="row" class="rc-row' + (m.fu.selectedId === it.id ? ' rc-cur' : '') + '" data-fu-id="' + escapeHtml(it.id) + '">' +
            (review ? '<span role="cell" class="rc-fu-check"><input type="checkbox" class="rc-fu-cb" aria-label="' + escapeHtml('Select: ' + label) + '"></span>' : '') +
            '<span role="cell" class="rc-fu-main"><a class="rc-row-link rc-fu-text" href="' + escapeHtml(buildUrl(m.base, m.state, { fu: it.id })) + '">' +
                escapeHtml(label) + '</a><span class="rc-fu-co">' + escapeHtml(it.company || 'Unknown customer') + '</span></span>' +
            '<span role="cell">' + sourceCell(it) + '</span>' +
            (m.teamView ? '<span role="cell">' + rcCalls.ownerCell(it.ownerName) + '</span>' : '') +
            '<span role="cell">' + dueHtml(it.due) + '</span>' +
            (review
                ? '<span role="cell" class="rc-right rc-fu-act">' +
                    '<button type="button" class="rc-btn rc-fu-ghost" data-act="dismiss" aria-label="' + escapeHtml('Dismiss: ' + label) + '">Dismiss</button>' +
                    '<button type="button" class="rc-btn rc-btn-navy" data-act="approve" aria-label="' + escapeHtml('Approve: ' + label) + '">Approve</button></span>'
                : '<span role="cell" class="rc-right"><span class="rc-fu-status rc-fu-status-' + it.status.tone + '">' + escapeHtml(it.status.text) + '</span></span>') +
            '</div>';
    };

    const compactRow = (it, m) => {
        const on = m.fu.selectedId === it.id;
        return '<button type="button" role="option" class="rc-crow" tabindex="-1" data-fu-id="' + escapeHtml(it.id) + '" aria-selected="' + on + '">' +
            '<span class="rc-crow-main"><span class="rc-crow-co">' + escapeHtml(it.text) + '</span>' +
            '<span class="rc-crow-sub">' + escapeHtml([it.company || 'Unknown customer', it.callTitle].join(' · ')) + '</span></span>' +
            dueHtml(it.due, true) + '</button>';
    };

    const shownText = (n) => n + (n === 1 ? ' follow-up' : ' follow-ups');

    /**
     * The detail panel shell: bar (close, ↑ / ↓, position, stage chip),
     * body and footer; the client fills them.
     * @param {Object} m
     * @returns {string}
     */
    const detailPanel = (m) => {
        const id = m.fu.selectedId;
        return '<div class="rc-scrim" id="rc-scrim"></div>' +
            '<aside class="rc-detail" id="rc-detail" aria-label="Follow-up detail" tabindex="-1"' + (id ? '' : ' hidden') + '>' +
            '<div class="rc-d-bar">' +
                rcCalls.iconBtn('close', 'Close (Esc)', 'Close (Esc)', rcCalls.ICON.close) +
                '<span class="rc-d-sep" aria-hidden="true"></span>' +
                rcCalls.iconBtn('prev', 'Previous follow-up (↑)', 'Previous (↑)', rcCalls.ICON.up) +
                rcCalls.iconBtn('next', 'Next follow-up (↓)', 'Next (↓)', rcCalls.ICON.down) +
                '<span class="rc-d-pos" data-d="pos"></span>' +
                '<span class="rc-spacer"></span>' +
                '<span class="rc-fu-stage" data-d="stage"></span>' +
            '</div>' +
            '<div class="rc-d-body" data-d="body">' + rcCalls.detailSkeleton() + '</div>' +
            '<div class="rc-d-foot rc-fu-foot" data-d="foot"></div>' +
            '</aside>';
    };

    const toast = () =>
        '<div class="rc-toast" id="rc-toast" role="status" aria-live="polite" hidden>' +
            '<span data-t="text"></span>' +
            '<button type="button" class="rc-toast-undo" data-t="undo">Undo</button>' +
            '<button type="button" class="rc-toast-x" data-t="close" aria-label="Close">✕</button>' +
        '</div>';

    /**
     * The Follow-ups tab: one card (toolbar or bulk bar, the table / compact
     * list or the empty state, footer), the detail panel and the toast.
     * Drilled in when `fu` names a follow-up in this list.
     * @param {Object} m - view model (state, base, fu (buildModel), teamView, tasksError)
     * @returns {string}
     */
    const buildFollowupsTab = (m) => {
        const s = m.state;
        if (m.tasksError) {
            return '<section class="rc-card rc-list">' + listBar(m) +
                rcShell.stateBox('Couldn’t load your follow-ups', 'Your follow-ups are safe. Reload to try again.',
                    '<a class="rc-btn rc-btn-outline" href="' + escapeHtml(buildUrl(m.base, s)) + '">Try again</a>') + '</section>';
        }
        const fu = m.fu;
        const list = fu.list;
        const review = s.ftab === 'review';
        const filtered = !!(s.q || s.due);
        const empty = filtered
            ? rcShell.stateBox('No follow-ups match', 'Try a different word, or show every follow-up.',
                '<a class="rc-btn rc-btn-quiet" data-nav href="' + escapeHtml(buildUrl(m.base, s, { q: '', due: '' })) + '">Clear filters</a>')
            : rcShell.stateBox(EMPTY[s.ftab][0], EMPTY[s.ftab][1]);
        const keys = '<kbd>↑</kbd><kbd>↓</kbd> move <kbd>Enter</kbd> open ' +
            (review ? '<kbd>A</kbd> approve <kbd>D</kbd> dismiss ' : '') + '<kbd>Esc</kbd> close';
        return '<div class="rc-split rc-fill rc-fu' + (fu.selectedId ? ' rc-drilled' : '') + '" id="rc-split" data-selected="' + escapeHtml(fu.selectedId) +
                '" data-ftab="' + escapeHtml(s.ftab) + '">' +
            '<section class="rc-card rc-list" id="rc-list" tabindex="0" aria-label="Follow-up list" aria-describedby="rc-keys">' +
                listBar(m) + (review ? bulkBar() : '') +
                '<div class="rc-table-scroll">' +
                    '<div role="table" aria-label="Follow-ups" class="rc-table rc-fu-table' + (review ? ' rc-fu-review' : '') + (m.teamView ? ' rc-fu-team' : '') + '"' +
                        (list.length ? '' : ' hidden') + '>' +
                        '<div role="row" class="rc-row rc-row-head">' + headCells(m, review) + '</div>' +
                        list.map((it) => tableRow(it, m, review)).join('') + '</div>' +
                    '<div class="rc-fu-empty" id="rc-fu-empty"' + (list.length ? ' hidden' : '') + '>' + empty + '</div>' +
                '</div>' +
                '<div class="rc-compact" role="listbox" aria-label="Follow-ups">' + list.map((it) => compactRow(it, m)).join('') + '</div>' +
                '<div class="rc-list-foot"><span class="rc-shown" data-fu-shown>' + shownText(list.length) + '</span>' +
                    '<span class="rc-keys" id="rc-keys">' + keys + '</span></div>' +
            '</section>' +
            detailPanel(m) +
            '</div>' + toast();
    };

    /**
     * The scope line under the title. Open work ignores the range:
     * To review / My tasks read "All open follow-ups · <owner>"; Done reads
     * "<range> · <span> · <owner>". Owner: "Your follow-ups", "My team ·
     * N reps" or the member's name.
     * @param {Object} m - view model (state, range, owner)
     * @returns {string}
     */
    const scopeLine = (m) => {
        const who = m.owner.mode === 'me' ? 'Your follow-ups' : rcScope.ownerLabel(m.owner);
        if (m.state.ftab !== 'done') return 'All open follow-ups · ' + who;
        return [m.range.label, m.range.pending ? 'pick dates' : m.range.span, who].join(' · ');
    };

    /**
     * window.CTC_RC.fu: what the client script needs (the list's items,
     * the people a manager may give a task to, the hold time).
     * @param {Object} m
     * @param {{id: string, name: string}} me
     * @returns {Object}
     */
    const clientConfig = (m, me) => ({
        tab: m.state.ftab,
        items: m.tasksError ? [] : m.fu.list,
        me: me,
        isManager: !!m.owner.isManager,
        team: m.owner.isManager ? m.owner.team : [],
        taskUrl: TASK_URL,
        holdMs: HOLD_MS
    });

    // ─── CSS ───────────────────────────────────────────────────────────────

    const FOLLOWUPS_CSS = `
  .rc-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .rc-fu-quick { display: inline-flex; gap: 6px; }
  .rc-fu-pill { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: 999px; box-shadow: inset 0 0 0 1px var(--input);
    background: #FFFFFF; color: var(--muted); font-size: 12px; font-weight: 600; text-decoration: none; white-space: nowrap; }
  .rc-fu-pill-overdue { color: var(--low-fg); }
  .rc-fu-pill[aria-current="true"] { background: var(--navy); box-shadow: inset 0 0 0 1px var(--navy); color: #FFFFFF; }
  .rc-fu-pill:hover { color: var(--ink); }
  .rc-fu-pill[aria-current="true"]:hover { color: #FFFFFF; }
  .rc-fu-pill-n { font-weight: 700; font-variant-numeric: tabular-nums; }
  .rc-fu-bulk { flex: none; display: flex; gap: 8px; align-items: center; padding: 10px 12px; min-height: 53px; background: var(--navy); color: #FFFFFF;
    animation: rc-bulk-in 160ms cubic-bezier(0.23, 1, 0.32, 1); }
  .rc-fu-bulk-n { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .rc-fu-bulk .rc-btn { height: 30px; font-weight: 600; }
  .rc-fu-bulk-approve { background: var(--amber); color: var(--amber-ink); }
  .rc-fu-bulk-approve:hover { color: var(--amber-ink); }
  .rc-fu-bulk-dismiss { box-shadow: inset 0 0 0 1px #5F7590; color: #FFFFFF; }
  .rc-fu-bulk-dismiss:hover { color: #FFFFFF; }
  .rc-fu-bulk-x { margin-left: auto; width: 30px; height: 30px; border: 0; border-radius: 8px; background: transparent; color: var(--band-muted); cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center; }
  @keyframes rc-bulk-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
  .rc-fu-table { min-width: 760px; }
  .rc-fu-table .rc-row { grid-template-columns: minmax(220px, 2fr) minmax(160px, 1.4fr) 130px 140px; }
  .rc-fu-table.rc-fu-team .rc-row { grid-template-columns: minmax(220px, 2fr) minmax(160px, 1.4fr) 160px 130px 140px; }
  .rc-fu-table.rc-fu-review .rc-row { grid-template-columns: 36px minmax(220px, 2fr) minmax(160px, 1.4fr) 130px 180px; }
  .rc-fu-table.rc-fu-review.rc-fu-team .rc-row { grid-template-columns: 36px minmax(220px, 2fr) minmax(160px, 1.4fr) 160px 130px 180px; }
  .rc-fu-check { position: relative; z-index: 1; display: flex; align-items: center; }
  .rc-fu-check input { width: 16px; height: 16px; margin: 0; accent-color: var(--navy); cursor: pointer; }
  .rc-fu-main { display: flex; flex-direction: column; min-width: 0; line-height: 1.3; }
  .rc-fu-text { font-weight: 600; overflow-wrap: anywhere; }
  .rc-fu-co { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rc-fu-src { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .rc-fu-dot { flex: none; width: 8px; height: 8px; border-radius: 999px; background: var(--cur-bar); }
  .rc-fu-dot-vm { background: #E7837A; }
  .rc-fu-src-text { color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rc-fu-due, .rc-fu-status, .rc-fu-stage { display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 999px; font-size: 12px; font-weight: 600;
    white-space: nowrap; font-variant-numeric: tabular-nums; }
  .rc-fu-due-overdue { background: var(--low-bg); color: var(--low-fg); }
  .rc-fu-due-soon, .rc-fu-status-review, .rc-fu-stage-review { background: var(--mid-bg); color: var(--mid-fg); }
  .rc-fu-due-later { background: var(--line-soft); color: var(--muted); }
  .rc-fu-due-none { padding: 0; color: var(--faint); font-weight: 500; }
  .rc-fu-due-done, .rc-fu-status-done, .rc-fu-stage-done { background: var(--good-bg); color: var(--good-fg); }
  .rc-fu-status-task, .rc-fu-stage-task { background: #E8F0F8; color: var(--navy); }
  .rc-fu-status-dismissed, .rc-fu-stage-dismissed { background: var(--line-soft); color: var(--faint); }
  .rc-fu-act { position: relative; z-index: 1; display: inline-flex; justify-content: flex-end; gap: 6px; }
  .rc-fu-act .rc-btn { height: 30px; font-weight: 600; }
  .rc-fu-ghost { color: var(--muted); }
  .rc-fu-empty { flex: 1 1 auto; }
  .rc-fu-empty .rc-state { min-height: 240px; }
  .rc-fu .rc-crow .rc-fu-due { flex: none; }
  /* Detail */
  .rc-fu-title { width: 100%; margin-left: -7px; padding: 4px 6px; border: 1px solid transparent; border-radius: 8px; background: transparent;
    font: 700 18px var(--font); letter-spacing: -0.01em; color: var(--ink); }
  .rc-fu-title[readonly] { cursor: default; }
  .rc-fu-sub { margin-top: 2px; font-size: 13px; color: var(--muted); }
  .rc-fu-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .rc-fu-fields label { display: block; margin-bottom: 4px; font-size: 12px; font-weight: 600; color: var(--muted); }
  .rc-fu-field { width: 100%; height: 34px; padding: 0 10px; border: 1px solid var(--input); border-radius: 8px; background: #FFFFFF; font: 13px var(--font); color: var(--ink); }
  .rc-fu-field:disabled { background: var(--panel); color: var(--muted); }
  .rc-fu-card { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  .rc-fu-card-head { display: flex; gap: 10px; align-items: center; padding: 10px 12px; background: var(--panel); border-bottom: 1px solid var(--line-soft); }
  .rc-fu-card-head .rc-dir { width: 26px; height: 26px; }
  .rc-fu-card-title { flex: 1; min-width: 0; }
  .rc-fu-card-name { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rc-fu-card-when { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .rc-fu-card-open { font-size: 12px; font-weight: 600; white-space: nowrap; text-decoration: none; }
  .rc-fu-card-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
  .rc-fu-card-sum { margin: 0; font-size: 13px; line-height: 1.55; }
  .rc-fu-quote { display: grid; grid-template-columns: 70px minmax(0, 1fr); gap: 8px; padding-top: 8px; border-top: 1px solid var(--line-soft); font-size: 13px; line-height: 1.5; }
  .rc-fu-quote b { color: var(--customer); font-weight: 600; }
  .rc-fu-history { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .rc-fu-history li { display: grid; grid-template-columns: 14px minmax(0, 1fr) auto; gap: 10px; align-items: start; font-size: 13px; }
  .rc-fu-history i { width: 10px; height: 10px; margin-top: 4px; border-radius: 999px; background: var(--cur-bar); }
  .rc-fu-history .rc-fu-h-approved { background: var(--navy); }
  .rc-fu-history .rc-fu-h-done { background: var(--good-fg); }
  .rc-fu-history .rc-fu-h-dismissed { background: #B9B5AE; }
  .rc-fu-history time { font-size: 12px; color: var(--faint); font-variant-numeric: tabular-nums; }
  .rc-fu-foot { flex-wrap: wrap; align-items: center; }
  .rc-fu-foot .rc-btn { height: 34px; }
  .rc-fu-wide { flex: 1 1 auto; justify-content: center; }
  .rc-fu-err { flex: 1 0 100%; font-size: 12px; color: var(--low-fg); }
  /* Undo toast: enters with opacity + 12 px rise, exits at once. */
  .rc-toast { position: fixed; left: 50%; bottom: 16px; z-index: 20; transform: translateX(-50%); display: flex; align-items: center; gap: 12px;
    padding: 10px 10px 10px 14px; border-radius: 10px; background: var(--ink); color: #FFFFFF; font-size: 13px; box-shadow: 0 8px 24px rgba(22,21,19,0.24);
    max-width: calc(100vw - 32px); }
  .rc-toast.rc-enter { animation: rc-toast-in 200ms ease-out; }
  @keyframes rc-toast-in { from { opacity: 0; transform: translate(-50%, 12px); } to { opacity: 1; transform: translate(-50%, 0); } }
  .rc-toast button { border: 0; background: transparent; font: inherit; cursor: pointer; border-radius: 6px; }
  .rc-toast-undo { padding: 2px 4px; color: var(--amber); font-weight: 700; }
  .rc-toast-x { padding: 2px 6px; color: #B9B5AE; }
  .rc-toast button:focus-visible { box-shadow: 0 0 0 2px var(--focus); }
  @media (hover: hover) and (pointer: fine) {
    .rc-fu-title:not([readonly]):hover { border-color: var(--line); }
    .rc-fu-ghost:hover { background: var(--line-soft); }
    .rc-fu-bulk-x:hover { background: rgba(255,255,255,0.10); color: #FFFFFF; }
    .rc-fu-bulk-approve:hover { background: var(--amber-hover); }
    .rc-fu-bulk-dismiss:hover { background: rgba(255,255,255,0.08); }
  }
  @media (max-width: 720px) {
    .rc-fu-fields { grid-template-columns: minmax(0, 1fr); }
  }
  @media (prefers-reduced-motion: reduce) {
    .rc-fu-bulk { animation: rc-fade-in 150ms ease; }
    .rc-toast.rc-enter { animation: rc-toast-fade 150ms ease; }
    @keyframes rc-toast-fade { from { opacity: 0; } to { opacity: 1; } }
  }
`;

    // Follow-ups client script: plain ES5 inside a template literal. No
    // backticks, no dollar-brace, no backslashes. Same drill-in model as
    // the Calls tab (lib/ctc_rc_calls.js CALLS_CLIENT_JS): wide = panel
    // beside the compact list; narrow (under 900 px) = a sheet over a scrim.
    // Approve / dismiss remove the rows at once and wait HOLD ms (the
    // toast's Undo) before the RESTlet call; a page change sends what is
    // waiting first (pagehide: sendBeacon, else a keepalive fetch).
    const FOLLOWUPS_CLIENT_JS = `
(function () {
  var CFG = window.CTC_RC || {};
  var FU = CFG.fu || {};
  var HOLD = FU.holdMs || 5000;
  var BATCH = 25;
  var FAILED = 'Couldn’t save that. Try again.';
  var ERRORS = {
    forbidden: 'Only the customer’s sales rep or their manager can review this.',
    invalid_due: 'Pick a real due date.',
    invalid_assignee: 'That owner can’t take this task.',
    invalid_text: 'The follow-up text is too long.'
  };
  var ARROW_IN = 'M17 7L7 17M15 17H7V9';
  var ARROW_OUT = 'M7 17L17 7M9 7h8v8';
  function byId(id) { return document.getElementById(id); }
  function closest(el, sel) { return el && el.closest ? el.closest(sel) : null; }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  var split = byId('rc-split');
  var listEl = byId('rc-list');
  var detail = byId('rc-detail');
  if (!split || !listEl || !detail) {
    if (/[?&]fu=/.test(window.location.search)) setParam('');
    return;
  }
  var scrim = byId('rc-scrim');
  var toastEl = byId('rc-toast');
  var bulkEl = byId('rc-fu-bulk');
  var barEl = byId('rc-fu-bar');
  var allBox = byId('rc-fu-all');
  var WIDE = 900;
  var reviewTab = FU.tab === 'review';
  var ITEMS = {};
  (FU.items || []).forEach(function (it) { ITEMS[it.id] = it; });
  var openId = '';
  var cursorId = split.getAttribute('data-selected') || '';
  var calls = {};
  var callLoading = {};
  var drafts = {};
  var pending = null;
  var toastTimer = null;

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
  function errorText(d) { return (d && ERRORS[d.error]) || FAILED; }

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
    for (var i = 0; i < els.length; i++) if (els[i].getAttribute('data-fu-id') === id) return els[i];
    return null;
  }
  function rowOf(id) { return find('.rc-row[data-fu-id]', id); }
  function crowOf(id) { return find('.rc-crow', id); }
  function ids() {
    var out = [];
    each(split.querySelectorAll('.rc-crow'), function (b) { out.push(b.getAttribute('data-fu-id')); });
    return out;
  }
  function isNarrow() { return split.classList.contains('rc-narrow'); }
  function compactShown() { return !!openId || isNarrow(); }
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
      var id = b.getAttribute('data-fu-id');
      b.setAttribute('aria-selected', id === openId ? 'true' : 'false');
      b.classList.toggle('rc-cur', id === cursorId && id !== openId);
    });
    each(split.querySelectorAll('.rc-row[data-fu-id]'), function (r) {
      r.classList.toggle('rc-cur', r.getAttribute('data-fu-id') === cursorId);
    });
  }

  function setParam(id) {
    if (!window.history || !window.history.replaceState || !window.URL) return;
    try {
      var u = new window.URL(window.location.href);
      if (id) u.searchParams.set('fu', id); else u.searchParams['delete']('fu');
      window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
    } catch (e) { /* keep the address as it is */ }
  }

  function replay(n) {
    if (!n) return;
    n.classList.remove('rc-enter');
    void n.offsetWidth;
    n.classList.add('rc-enter');
  }
  detail.addEventListener('animationend', function () { detail.classList.remove('rc-enter'); });

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
    if (!was && how !== 'init' && how !== 'swap') {
      replay(detail);
      replay(scrim);
      if (isNarrow()) { part('close').focus(); return; }
    }
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
    cursorId = rowOf(id) ? id : cursorId;
    split.classList.remove('rc-drilled');
    detail.hidden = true;
    detail.classList.remove('rc-enter');
    if (scrim) scrim.classList.remove('rc-enter');
    dialogAttrs();
    markRows();
    setParam('');
    var t = cursorId ? focusTarget(cursorId) : null;
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

  // ---- Panel ----
  // The Task goes to the call's owner unless the Owner select changes it.
  function defaultAssignee(it) { return it.ownerId || (FU.me && FU.me.id) || ''; }
  function initialDraft(it) {
    return { text: it.text, dueDate: it.due.iso || '', assigneeId: defaultAssignee(it), priority: 'MEDIUM' };
  }
  function draftOf(id) {
    if (!drafts[id]) drafts[id] = initialDraft(ITEMS[id]);
    return drafts[id];
  }
  // The approval always carries the Owner shown (assigneeId: the call's
  // owner unless changed); text, due date and priority only when changed.
  function editsFor(id) {
    var it = ITEMS[id];
    if (!it) return null;
    var init = initialDraft(it);
    var d = drafts[id] || init;
    var out = {};
    var any = false;
    if (d.assigneeId) { out.assigneeId = d.assigneeId; any = true; }
    ['text', 'dueDate', 'priority'].forEach(function (k) {
      if (d[k] !== init[k] && String(d[k]).trim() !== '') { out[k] = d[k]; any = true; }
    });
    return any ? out : null;
  }
  function ownerOptions(it) {
    var out = [];
    var seen = {};
    function add(id, name) {
      if (!id || seen[id]) return;
      seen[id] = true;
      out.push([id, (name || 'Employee ' + id) + (FU.me && FU.me.id === id ? ' (me)' : '')]);
    }
    if (it.stage !== 'review') { add(it.taskAssigneeId, it.taskAssigneeName); return out; }
    // The default first (the call's owner, else the viewer), so the value
    // shown is always the value sent.
    if (it.ownerId) add(it.ownerId, it.ownerName); else if (FU.me) add(FU.me.id, FU.me.name);
    if (FU.isManager) (FU.team || []).forEach(function (m) { add(m.id, m.name); });
    return out;
  }
  function field(label, id, input) {
    var box = el('div');
    var l = el('label', '', label);
    l.setAttribute('for', id);
    input.id = id;
    box.appendChild(l);
    box.appendChild(input);
    return box;
  }
  function select(name, options, value, editable) {
    var s = el('select', 'rc-fu-field');
    s.setAttribute('data-f', name);
    options.forEach(function (o) {
      var op = el('option', '', o[1]);
      op.value = o[0];
      if (o[0] === value) op.selected = true;
      s.appendChild(op);
    });
    s.disabled = !editable;
    return s;
  }
  function svgArrow(path) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '12');
    svg.setAttribute('height', '12');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.4');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(ns, 'path');
    p.setAttribute('d', path);
    svg.appendChild(p);
    return svg;
  }
  function section(label) {
    var s = el('section', 'rc-d-sect');
    s.setAttribute('aria-label', label);
    s.appendChild(el('h3', 'rc-d-label', label));
    return s;
  }
  function setBar(id) {
    var it = ITEMS[id];
    var list = ids();
    var at = list.indexOf(id);
    part('pos').textContent = (at + 1) + ' of ' + list.length;
    part('prev').disabled = at <= 0;
    part('next').disabled = at >= list.length - 1;
    var chip = part('stage');
    chip.className = 'rc-fu-stage rc-fu-stage-' + it.stageChip.tone;
    chip.textContent = it.stageChip.text;
  }
  function sourceBody(it) {
    var box = el('div', 'rc-fu-card-body');
    box.setAttribute('data-d', 'src-body');
    var c = it.callId ? calls[it.callId] : null;
    if (!it.callId) return box;
    if (c === false) {
      box.appendChild(el('p', 'rc-d-note', 'Couldn’t load the call summary.'));
      return box;
    }
    if (!c) {
      box.setAttribute('aria-busy', 'true');
      ['100%', '80%'].forEach(function (w) { var l = el('span', 'rc-skel-line'); l.style.width = w; l.setAttribute('aria-hidden', 'true'); box.appendChild(l); });
      return box;
    }
    box.appendChild(el('p', 'rc-fu-card-sum', c.summary || 'No summary available.'));
    var lines = c.transcriptLines || [];
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].speaker === 'customer' && lines[i].text) {
        var q = el('div', 'rc-fu-quote');
        q.appendChild(el('b', '', 'Customer'));
        q.appendChild(el('span', '', '“' + lines[i].text + '”'));
        box.appendChild(q);
        break;
      }
    }
    return box;
  }
  function sourceCard(it) {
    var card = el('section', 'rc-fu-card');
    card.setAttribute('aria-label', 'Source call');
    var head = el('div', 'rc-fu-card-head');
    var dir = el('span', 'rc-dir rc-dir-' + it.dir);
    dir.setAttribute('role', 'img');
    dir.setAttribute('aria-label', it.vm ? 'Voicemail' : (it.dir === 'in' ? 'Inbound call' : 'Outbound call'));
    dir.appendChild(svgArrow(it.dir === 'out' ? ARROW_OUT : ARROW_IN));
    head.appendChild(dir);
    var t = el('div', 'rc-fu-card-title');
    t.appendChild(el('div', 'rc-fu-card-name', it.callTitle));
    t.appendChild(el('div', 'rc-fu-card-when', [it.callWhen, it.callLen].filter(Boolean).join(' · ')));
    head.appendChild(t);
    if (it.callUrl) {
      var a = el('a', 'rc-fu-card-open', 'Open call');
      a.setAttribute('href', it.callUrl);
      head.appendChild(a);
    }
    card.appendChild(head);
    card.appendChild(sourceBody(it));
    return card;
  }
  function history(it) {
    var s = section('History');
    var ol = el('ol', 'rc-fu-history');
    it.history.forEach(function (h) {
      var li = el('li');
      var dot = el('i', 'rc-fu-h-' + h.kind);
      dot.setAttribute('aria-hidden', 'true');
      li.appendChild(dot);
      li.appendChild(el('span', '', h.text));
      li.appendChild(el('time', '', h.when || ''));
      ol.appendChild(li);
    });
    s.appendChild(ol);
    return s;
  }
  function render(id) {
    var it = ITEMS[id];
    var editable = it.stage === 'review';
    var d = draftOf(id);
    var b = part('body');
    clear(b);
    var head = el('div', 'rc-fu-head');
    var lab = el('label', 'rc-sr', 'Follow-up');
    lab.setAttribute('for', 'rc-fu-title');
    head.appendChild(lab);
    var title = el('input', 'rc-fu-title');
    title.id = 'rc-fu-title';
    title.type = 'text';
    title.maxLength = 4000;
    title.value = editable ? d.text : it.text;
    title.readOnly = !editable;
    title.setAttribute('data-f', 'text');
    head.appendChild(title);
    var sub = el('div', 'rc-fu-sub');
    if (it.companyId) {
      var co = el('a', '', it.company || 'Unknown customer');
      co.setAttribute('href', CFG.entityUrl + encodeURIComponent(it.companyId));
      sub.appendChild(co);
    } else {
      sub.appendChild(el('span', '', it.company || 'Unknown customer'));
    }
    sub.appendChild(document.createTextNode(' · suggested by AI from the call below'));
    head.appendChild(sub);
    b.appendChild(head);

    var grid = el('div', 'rc-fu-fields');
    var due = el('input', 'rc-fu-field');
    due.type = 'date';
    due.value = editable ? d.dueDate : (it.due.iso || '');
    due.disabled = !editable;
    due.setAttribute('data-f', 'dueDate');
    grid.appendChild(field('Due', 'rc-fu-due', due));
    var owners = ownerOptions(it);
    grid.appendChild(field('Owner', 'rc-fu-owner', select('assigneeId', owners.length ? owners : [['', '—']],
      editable ? d.assigneeId : it.taskAssigneeId, editable && owners.length > 1)));
    grid.appendChild(field('Priority', 'rc-fu-pri', select('priority', [['MEDIUM', 'Medium'], ['HIGH', 'High'], ['LOW', 'Low']],
      editable ? d.priority : (it.taskPriority || 'MEDIUM'), editable)));
    b.appendChild(grid);
    b.appendChild(sourceCard(it));
    b.appendChild(history(it));
  }
  function button(cls, text, act) {
    var x = el('button', cls, text);
    x.type = 'button';
    x.setAttribute('data-f-act', act);
    return x;
  }
  function setFoot(id) {
    var it = ITEMS[id];
    var f = part('foot');
    clear(f);
    if (it.stage === 'review') {
      f.appendChild(button('rc-btn rc-btn-navy rc-fu-wide', 'Approve and create task', 'approve'));
      f.appendChild(button('rc-btn rc-btn-outline', 'Dismiss', 'dismiss'));
    } else if (it.taskId) {
      var a = el('a', 'rc-btn ' + (it.stage === 'task' ? 'rc-btn-navy rc-fu-wide' : 'rc-btn-outline'), 'Open task ↗');
      a.setAttribute('href', FU.taskUrl + encodeURIComponent(it.taskId));
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
      f.appendChild(a);
      if (it.stage === 'task') f.appendChild(button('rc-btn rc-btn-outline', 'Mark complete', 'complete'));
    }
    var err = el('span', 'rc-fu-err');
    err.setAttribute('role', 'alert');
    err.hidden = true;
    f.appendChild(err);
    f.hidden = !f.querySelector('button, a');
  }
  function footError(msg) {
    var e = part('foot').querySelector('.rc-fu-err');
    if (!e) return;
    e.textContent = msg || '';
    e.hidden = !msg;
  }
  function loadCall(it) {
    var id = it.callId;
    if (!id || calls[id] || callLoading[id]) return;
    callLoading[id] = true;
    post({ action: 'getCallDetail', callId: id, owner: CFG.owner || '' }).then(function (d) {
      if (!d || !d.call) throw new Error((d && d.error) || 'no call');
      calls[id] = d.call;
    }).catch(function () {
      calls[id] = false;
    }).then(function () {
      callLoading[id] = false;
      var cur = ITEMS[openId];
      if (cur && cur.callId === id) {
        var old = part('body').querySelector('[data-d="src-body"]');
        if (old) old.parentNode.replaceChild(sourceBody(cur), old);
      }
    });
  }
  function fill(id) {
    setBar(id);
    render(id);
    setFoot(id);
    loadCall(ITEMS[id]);
  }
  detail.addEventListener('input', function (e) {
    var f = e.target && e.target.getAttribute && e.target.getAttribute('data-f');
    if (f && openId && ITEMS[openId].stage === 'review') draftOf(openId)[f] = e.target.value;
  });
  detail.addEventListener('change', function (e) {
    var f = e.target && e.target.getAttribute && e.target.getAttribute('data-f');
    if (f && openId && ITEMS[openId].stage === 'review') draftOf(openId)[f] = e.target.value;
  });

  // ---- Counts, empty state, selection ----
  function bump(sel, d) {
    each(document.querySelectorAll(sel), function (n) {
      var v = parseInt(n.textContent, 10);
      if (!isNaN(v)) n.textContent = String(Math.max(0, v + d));
    });
  }
  // A follow-up leaves this tab for another (or comes back: sign -1).
  function moveCounts(list, toTab, sign) {
    var n = list.length * sign;
    bump('[data-fu-count="' + FU.tab + '"]', -n);
    if (toTab) bump('[data-fu-count="' + toTab + '"]', n);
    bump('[data-fu-quick="overdue"]', -sign * list.filter(function (id) { return ITEMS[id].overdue; }).length);
    bump('[data-fu-quick="week"]', -sign * list.filter(function (id) { return ITEMS[id].week; }).length);
  }
  function refreshList() {
    var n = ids().length;
    var shown = split.querySelector('[data-fu-shown]');
    if (shown) shown.textContent = n + (n === 1 ? ' follow-up' : ' follow-ups');
    var table = split.querySelector('.rc-fu-table');
    if (table) table.hidden = n === 0;
    var empty = byId('rc-fu-empty');
    if (empty) empty.hidden = n > 0;
    refreshBulk();
  }
  function checkedIds() {
    var out = [];
    each(split.querySelectorAll('.rc-row[data-fu-id] .rc-fu-cb'), function (c) {
      if (c.checked) out.push(closest(c, '[data-fu-id]').getAttribute('data-fu-id'));
    });
    return out;
  }
  function refreshBulk() {
    if (!bulkEl) return;
    var sel = checkedIds();
    var total = split.querySelectorAll('.rc-row[data-fu-id] .rc-fu-cb').length;
    var on = sel.length > 0;
    if (on && bulkEl.hidden) replay(bulkEl);
    bulkEl.hidden = !on;
    if (barEl) barEl.hidden = on;
    bulkEl.querySelector('[data-b="count"]').textContent = sel.length + ' selected';
    bulkEl.querySelector('[data-b="approve"]').textContent = 'Approve ' + sel.length;
    if (allBox) {
      allBox.checked = total > 0 && sel.length === total;
      allBox.indeterminate = sel.length > 0 && sel.length < total;
    }
  }
  function setChecked(list, on) {
    list.forEach(function (id) {
      var r = rowOf(id);
      var c = r && r.querySelector('.rc-fu-cb');
      if (c) c.checked = on;
    });
    refreshBulk();
  }

  // ---- Toast ----
  function showToast(text, undo) {
    if (!toastEl) return;
    clearTimeout(toastTimer);
    toastEl.querySelector('[data-t="text"]').textContent = text;
    toastEl.querySelector('[data-t="undo"]').hidden = !undo;
    toastEl.hidden = false;
    replay(toastEl);
    if (!undo) toastTimer = setTimeout(hideToast, 6000);
  }
  function hideToast() {
    clearTimeout(toastTimer);
    if (!toastEl) return;
    toastEl.hidden = true;
    toastEl.classList.remove('rc-enter');
  }

  // ---- Approve / dismiss with undo ----
  function plural(n, one, many) { return n === 1 ? one : n + ' ' + many; }
  function detach(id) {
    var nodes = { row: rowOf(id), crow: crowOf(id) };
    if (nodes.row && nodes.row.parentNode) nodes.row.parentNode.removeChild(nodes.row);
    if (nodes.crow && nodes.crow.parentNode) nodes.crow.parentNode.removeChild(nodes.crow);
    return nodes;
  }
  // Rows come back in their first order.
  function reattach(p, list) {
    var table = split.querySelector('.rc-fu-table');
    var compact = split.querySelector('.rc-compact');
    p.order.forEach(function (id, i) {
      if (list.indexOf(id) === -1 || !p.nodes[id]) return;
      var nextRow = null, nextCrow = null;
      for (var j = i + 1; j < p.order.length && !nextRow; j++) {
        nextRow = rowOf(p.order[j]);
        nextCrow = crowOf(p.order[j]);
      }
      if (p.nodes[id].row) table.insertBefore(p.nodes[id].row, nextRow);
      if (p.nodes[id].crow) compact.insertBefore(p.nodes[id].crow, nextCrow);
      var cb = p.nodes[id].row && p.nodes[id].row.querySelector('.rc-fu-cb');
      if (cb) cb.checked = false;
    });
  }
  // The row after the given one in the list, else the one before.
  function neighbour(order, gone, id) {
    var at = order.indexOf(id);
    if (at < 0) return '';
    for (var i = at + 1; i < order.length; i++) if (gone.indexOf(order[i]) === -1) return order[i];
    for (var k = at - 1; k >= 0; k--) if (gone.indexOf(order[k]) === -1) return order[k];
    return '';
  }
  function takeOut(list, toTab) {
    var order = ids();
    var focusId = openId || cursorId;
    var next = list.indexOf(focusId) !== -1 ? neighbour(order, list, focusId) : focusId;
    var wasOpen = openId;
    var nodes = {};
    list.forEach(function (id) { nodes[id] = detach(id); });
    moveCounts(list, toTab, 1);
    if (wasOpen && list.indexOf(wasOpen) !== -1) {
      openId = '';
      if (next) open(next, 'swap'); else { cursorId = ''; close0(); }
    } else if (list.indexOf(cursorId) !== -1) {
      cursorId = next;
      markRows();
    }
    refreshList();
    return { order: order, nodes: nodes, wasOpen: wasOpen, wasCursor: focusId };
  }
  // Close without a row to return to.
  function close0() {
    split.classList.remove('rc-drilled');
    detail.hidden = true;
    dialogAttrs();
    markRows();
    setParam('');
    listEl.focus();
  }
  function putBack(p, list) {
    reattach(p, list);
    moveCounts(list, p.toTab, -1);
    refreshList();
  }

  function decide(list, kind) {
    list = list.filter(function (id) { return ITEMS[id] && ITEMS[id].stage === 'review' && rowOf(id); });
    if (!list.length) return;
    commit();
    var edits = {};
    list.forEach(function (id) { var e = editsFor(id); if (e) edits[id] = e; });
    var toTab = kind === 'approve' ? 'tasks' : 'done';
    var p = takeOut(list, toTab);
    p.kind = kind;
    p.ids = list;
    p.edits = edits;
    p.toTab = toTab;
    p.timer = setTimeout(commit, HOLD);
    pending = p;
    var n = list.length;
    showToast(kind === 'approve' ? plural(n, 'Task created', 'tasks created') : plural(n, 'Dismissed', 'dismissed'), true);
  }

  function undo() {
    if (!pending) return;
    var p = pending;
    pending = null;
    clearTimeout(p.timer);
    hideToast();
    putBack(p, p.ids);
    if (p.wasOpen && rowOf(p.wasOpen)) open(p.wasOpen, openId ? 'key' : 'swap');
    else { cursorId = p.wasCursor; markRows(); }
  }

  // The RESTlet bodies for a held action.
  function bodiesFor(p) {
    var out = [];
    if (p.kind === 'dismiss') {
      p.ids.forEach(function (id) { out.push({ action: 'rejectProposedTask', taskId: id }); });
      return out;
    }
    if (p.ids.length === 1) {
      out.push({ action: 'approveProposedTask', taskId: p.ids[0], edits: p.edits[p.ids[0]] || undefined });
      return out;
    }
    var items = p.ids.map(function (id) { return { taskId: id, edits: p.edits[id] || undefined }; });
    for (var i = 0; i < items.length; i += BATCH) {
      var chunk = items.slice(i, i + BATCH);
      out.push({ action: 'bulkApproveProposedTasks', items: chunk, taskIds: chunk.map(function (x) { return x.taskId; }) });
    }
    return out;
  }
  // Results per follow-up id: true, or the error answer.
  function sendAll(bodies) {
    var results = {};
    var chain = Promise.resolve();
    bodies.forEach(function (b) {
      chain = chain.then(function () {
        return post(b).then(function (d) {
          if (b.taskIds) {
            var rs = (d && d.results) || [];
            b.taskIds.forEach(function (id) {
              var r = null;
              for (var k = 0; k < rs.length; k++) if (String(rs[k].taskId) === String(id)) r = rs[k];
              results[id] = done(r) ? true : (r || d || {});
            });
          } else {
            results[b.taskId] = done(d) ? true : (d || {});
          }
        }).catch(function () {
          (b.taskIds || [b.taskId]).forEach(function (id) { results[id] = {}; });
        });
      });
    });
    return chain.then(function () { return results; });
  }
  // Send what is held now (toast timed out or closed, another action, a
  // page change). Failed follow-ups come back with the reason.
  function commit() {
    if (!pending) return Promise.resolve();
    var p = pending;
    pending = null;
    clearTimeout(p.timer);
    hideToast();
    return sendAll(bodiesFor(p)).then(function (results) {
      var failed = p.ids.filter(function (id) { return results[id] !== true; });
      if (!failed.length) return;
      putBack(p, failed);
      var why = results[failed[0]];
      showToast((failed.length === 1 ? '' : failed.length + ' not saved. ') + errorText(why), false);
    });
  }
  function beacon(body) {
    var data = JSON.stringify(body);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(CFG.restletUrl, new Blob([data], { type: 'application/json' }))) return;
    } catch (e) { /* try fetch */ }
    try {
      fetch(CFG.restletUrl, { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: data });
    } catch (e) { /* nothing more to try */ }
  }
  window.addEventListener('pagehide', function () {
    if (!pending) return;
    var p = pending;
    pending = null;
    clearTimeout(p.timer);
    bodiesFor(p).forEach(beacon);
  });
  // A link or search inside the page waits for the held action first, so
  // the next page shows it.
  document.addEventListener('click', function (e) {
    if (!pending || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = closest(e.target, 'a[href]');
    if (!a || a.target === '_blank' || a.classList.contains('rc-row-link')) return;
    e.preventDefault();
    var href = a.href;
    commit().then(function () { window.location.href = href; });
  }, true);
  document.addEventListener('submit', function (e) {
    if (!pending) return;
    var f = e.target;
    e.preventDefault();
    commit().then(function () { f.submit(); });
  }, true);

  // ---- Mark complete (My tasks) ----
  function complete(id) {
    var it = ITEMS[id];
    if (!it || it.stage !== 'task') return;
    var btn = part('foot').querySelector('[data-f-act="complete"]');
    if (btn) btn.disabled = true;
    footError('');
    post({ action: 'completeFollowUpTask', taskId: id }).then(function (d) {
      if (!done(d)) throw d || {};
      takeOut([id], 'done');
    }).catch(function (d) {
      if (btn) btn.disabled = false;
      if (openId === id) footError(errorText(d));
    });
  }

  // ---- Events ----
  split.addEventListener('click', function (e) {
    var act = closest(e.target, 'button[data-act]');
    if (act) {
      var row = closest(act, '[data-fu-id]');
      if (row) decide([row.getAttribute('data-fu-id')], act.getAttribute('data-act') === 'approve' ? 'approve' : 'dismiss');
      return;
    }
    var fact = closest(e.target, 'button[data-f-act]');
    if (fact) {
      var k = fact.getAttribute('data-f-act');
      if (k === 'complete') complete(openId); else decide([openId], k);
      return;
    }
    var b = closest(e.target, 'button[data-b]');
    if (b) {
      var w = b.getAttribute('data-b');
      if (w === 'clear') setChecked(checkedIds(), false);
      else if (w === 'approve' || w === 'dismiss') decide(checkedIds(), w);
      return;
    }
    var link = closest(e.target, 'a.rc-row-link');
    if (link) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      open(closest(link, '[data-fu-id]').getAttribute('data-fu-id'), 'click');
      return;
    }
    var crow = closest(e.target, '.rc-crow');
    if (crow) { open(crow.getAttribute('data-fu-id'), 'click'); return; }
    var d = closest(e.target, 'button[data-d]');
    if (d && detail.contains(d)) {
      var dk = d.getAttribute('data-d');
      if (dk === 'close') close();
      else if (dk === 'prev') step(-1);
      else if (dk === 'next') step(1);
      return;
    }
    if (scrim && e.target === scrim) close();
  });
  split.addEventListener('change', function (e) {
    var t = e.target;
    if (t === allBox) {
      var all = [];
      each(split.querySelectorAll('.rc-row[data-fu-id]'), function (r) { all.push(r.getAttribute('data-fu-id')); });
      setChecked(all, allBox.checked);
    } else if (t && t.classList && t.classList.contains('rc-fu-cb')) {
      refreshBulk();
    }
  });
  if (toastEl) toastEl.addEventListener('click', function (e) {
    var b = closest(e.target, 'button[data-t]');
    if (!b) return;
    if (b.getAttribute('data-t') === 'undo') undo();
    else if (pending) commit(); else hideToast();
  });
  listEl.addEventListener('focusin', function (e) {
    var row = closest(e.target, '[data-fu-id]');
    if (!row || openId) return;
    cursorId = row.getAttribute('data-fu-id');
    markRows();
  });

  function trap(e) {
    var all = Array.prototype.filter.call(detail.querySelectorAll('a[href], button, input, select'), function (n) {
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
    var cur = openId || cursorId;
    if (k === 'ArrowDown' || k === 'j') { e.preventDefault(); step(1); }
    else if (k === 'ArrowUp' || k === 'k') { e.preventDefault(); step(-1); }
    else if (k === 'Enter' && !openId && t === listEl && cursorId) { e.preventDefault(); open(cursorId, 'key'); }
    else if (k === 'Escape' && openId) { e.preventDefault(); close(); }
    else if ((k === 'a' || k === 'A' || k === 'd' || k === 'D') && reviewTab && cur && rowOf(cur)) {
      e.preventDefault();
      decide([cur], (k === 'a' || k === 'A') ? 'approve' : 'dismiss');
    }
    else if (k === 'Tab' && openId && isNarrow() && e.currentTarget === detail) trap(e);
  }
  listEl.addEventListener('keydown', onKey);
  detail.addEventListener('keydown', onKey);

  refreshList();
  var first = split.getAttribute('data-selected');
  if (first) open(first, 'init');
  else if (/[?&]fu=/.test(window.location.search)) setParam('');
})();
`;

    return {
        TASK_URL, HOLD_MS, FTAB_LIST, QUICK, EMPTY, CSV_HEADERS,
        nsToIso, clearIsoMemo, stageOf, dueChip, toItem, buildModel, toCsv,
        buildFollowupsTab, clientConfig, scopeLine,
        FOLLOWUPS_CSS, FOLLOWUPS_CLIENT_JS
    };
});
