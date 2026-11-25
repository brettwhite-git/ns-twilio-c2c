/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Sales Central Tasks (slice 2, 2026-11-25; ORCA Flow board): every open
 * NetSuite Task assigned to the session user, plus follow-ups suggested
 * from calls in the user's book, in bands (Overdue, Today, This week,
 * Later); and completing a Task in place with an outcome.
 *
 * Outcomes (custevent_ctc_task_outcome, list customlist_ctc_task_outcome):
 *   done  - Completed, outcome Done;
 *   no    - Completed, outcome Not needed;
 *   reach - stays open, due tomorrow, outcome Couldn't reach;
 *   next  - Completed (Done) and a new Task for the next step.
 * The rep's note is added to Message with the date and the outcome. A Task
 * made from a call also marks its proposed task completed.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/search', 'N/record', 'N/log', './ctc_workspace_queries', './ctc_rc_followups', './ctc_rc_scope'],
    (search, record, log, wq, rcFollowups, rcScope) => {

    const TASK_LIMIT = 200;
    const MAX_NOTE = 4000;
    const MAX_TITLE = 200;
    const OUTCOME_TEXT = { done: 'Done', no: 'Not needed', reach: 'Couldn\'t reach', next: 'Done' };
    const BAND_ORDER = { overdue: 0, today: 1, week: 2, later: 3 };

    /** Band of a due date (YYYY-MM-DD) against today; no date → later. */
    const bandOf = (dueIso, todayIso) => {
        if (!dueIso) return 'later';
        if (dueIso < todayIso) return 'overdue';
        if (dueIso === todayIso) return 'today';
        return dueIso <= rcScope.addDays(todayIso, 6) ? 'week' : 'later';
    };

    const selectOf = (r, col) => ({ id: String(r.getValue(col) || ''), text: String(r.getText(col) || '') });

    /**
     * Pure: rows from loaded data.
     * A suggestion's `assignTo` is who Approve gives the Task to: the rep
     * who took the call, else the user approving (#106).
     * @param {{todayIso: string, userId: (string|number), tasks: Array<Object>, followUps: Array<Object>, names: Object<string, string>}} p
     * @returns {Array<Object>} tasks and suggestions, by band then due date
     */
    const buildTasks = (p) => {
        /** @type {Object<string, Object>} Task id → its source call (via the proposed task) */
        const callByTask = {};
        const rows = [];
        (p.followUps || []).forEach((f) => {
            const call = f.call || {};
            if (f.createdTaskId) callByTask[String(f.createdTaskId)] = call;
            if (rcFollowups.stageOf(f) !== 'review') return;
            const due = rcFollowups.nsToIso(f.proposedDue);
            rows.push({
                kind: 'suggestion', id: String(f.id), title: f.text || 'Follow-up',
                companyId: String(call.companyId || ''), companyName: call.companyName || '',
                contactId: '', due: due, band: bandOf(due, p.todayIso), status: 'Suggested', priority: '', note: '',
                assignTo: String(call.ownerId || p.userId || ''),
                fromCall: call.id ? { id: String(call.id), title: call.title || '', date: rcFollowups.nsToIso(call.date) } : null
            });
        });
        (p.tasks || []).forEach((t) => {
            const call = callByTask[t.id];
            rows.push({
                kind: 'task', id: t.id, title: t.title || 'Task',
                companyId: t.companyId, companyName: t.companyName,
                contactId: t.contactId, due: t.due, band: bandOf(t.due, p.todayIso),
                status: t.status, priority: t.priority, note: t.message,
                assignTo: '',
                fromCall: call && call.id ? { id: String(call.id), title: call.title || '', date: rcFollowups.nsToIso(call.date) }
                    : t.sourceCallId ? { id: t.sourceCallId, title: t.sourceCallTitle, date: '' } : null
            });
        });
        rows.forEach((r) => { if (p.names && p.names[r.companyId]) r.companyName = p.names[r.companyId]; });
        return rows.sort((a, b) => BAND_ORDER[a.band] - BAND_ORDER[b.band]
            || (a.due || '9999').localeCompare(b.due || '9999') || a.title.localeCompare(b.title));
    };

    /**
     * Open Tasks assigned to the user (one search, up to 200, 10 units).
     * Throws on a search error.
     */
    const loadOpenTasks = (userId) => search.create({
        type: search.Type.TASK,
        filters: [['assigned', 'anyof', String(userId)], 'AND', ['status', 'noneof', 'COMPLETE']],
        columns: [
            { name: 'duedate', sort: search.Sort.ASC }, 'title', 'status', 'priority', 'company', 'contact', 'message',
            'custevent_ctc_source_call'
        ]
    }).run().getRange({ start: 0, end: TASK_LIMIT }).map((r) => {
        const co = selectOf(r, 'company');
        const ct = selectOf(r, 'contact');
        const sc = selectOf(r, 'custevent_ctc_source_call');
        return {
            id: String(r.id), title: String(r.getValue('title') || ''),
            due: rcFollowups.nsToIso(r.getValue('duedate')),
            status: String(r.getText('status') || r.getValue('status') || ''),
            priority: String(r.getText('priority') || ''),
            companyId: co.id, companyName: co.text, contactId: ct.id,
            message: String(r.getValue('message') || ''),
            sourceCallId: sc.id, sourceCallTitle: sc.text
        };
    });

    /**
     * The Tasks list for one user. A failed source is left out and named in
     * `partial`; nothing throws. About 60 units.
     * @param {{userId: (string|number)}} p
     * @returns {{rows: Array<Object>, partial: Array<string>}}
     */
    const loadTasks = (p) => {
        const userId = p && p.userId;
        const partial = [];
        let tasks = [];
        try {
            tasks = loadOpenTasks(userId);
        } catch (e) {
            log.error({ title: 'CTC SC tasks search failed', details: (e && e.message) || String(e) });
            partial.push('tasks');
        }
        const book = wq.getBookCustomerIds({ userId: userId });
        const followUps = book.length ? wq.loadFollowUpRows({ userId: userId, bookCustomerIds: book }) : { rows: [] };
        if (followUps.error) partial.push('suggestions');
        let names = {};
        try {
            names = wq.companyNames(tasks.map((t) => t.companyId).concat((followUps.rows || []).map((f) => (f.call || {}).companyId)));
        } catch (e) {
            log.error({ title: 'CTC SC tasks names failed', details: (e && e.message) || String(e) });
        }
        return {
            rows: buildTasks({ todayIso: rcScope.todayIso(), userId: userId, tasks: tasks, followUps: followUps.error ? [] : followUps.rows, names: names }),
            partial: partial
        };
    };

    /** A Date at local noon for YYYY-MM-DD (no time-zone roll to the day before). */
    const noonOf = (iso) => {
        const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(String(iso || ''));
        return m ? new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), 12) : null;
    };

    /**
     * Read and check the complete request (the boundary).
     * @returns {{ok: true, outcome: string, note: string, next: ({title: string, due: string}|null)}|{error: string}}
     */
    const readComplete = (body) => {
        const b = body || {};
        if (!/^[0-9]{1,12}$/.test(String(b.taskId || ''))) return { error: 'taskId required' };
        const outcome = String(b.outcome || '');
        if (!Object.prototype.hasOwnProperty.call(OUTCOME_TEXT, outcome)) return { error: 'invalid_outcome' };
        const note = String(b.note == null ? '' : b.note).trim();
        if (note.length > MAX_NOTE) return { error: 'invalid_note' };
        let next = null;
        if (outcome === 'next') {
            const n = b.next || {};
            const title = String(n.title || '').trim();
            const due = String(n.due || '').trim();
            if (!title || title.length > MAX_TITLE) return { error: 'invalid_next_title' };
            if (!noonOf(due)) return { error: 'invalid_next_due' };
            next = { title: title, due: due };
        }
        return { ok: true, outcome: outcome, note: note, next: next };
    };

    const valueOf = (v) => (Array.isArray(v) ? (v.length ? String(v[0].value || '') : '') : String(v || ''));

    /**
     * Complete (or retry) one Task with an outcome. Allowed when the Task is
     * assigned to the user, or for an Administrator.
     * @param {{userId: (string|number), isAdmin: boolean, body: Object}} p
     * @returns {{ok: true, outcome: string, due?: string, nextTaskId?: string}|{error: string}}
     */
    const completeTask = (p) => {
        const req = readComplete(p.body);
        if (!req.ok) return req;
        const task = record.load({ type: record.Type.TASK, id: p.body.taskId, isDynamic: false });
        if (!p.isAdmin && valueOf(task.getValue({ fieldId: 'assigned' })) !== String(p.userId)) return { error: 'forbidden' };
        if (String(task.getValue({ fieldId: 'status' })) === 'COMPLETE') return { error: 'already_actioned' };

        const todayIso = rcScope.todayIso();
        const label = OUTCOME_TEXT[req.outcome];
        const line = todayIso + ' · ' + label + (req.note ? ': ' + req.note : '');
        const before = String(task.getValue({ fieldId: 'message' }) || '');
        task.setValue({ fieldId: 'message', value: before ? before + '\n\n' + line : line });
        task.setText({ fieldId: 'custevent_ctc_task_outcome', text: label });
        const out = { ok: true, outcome: req.outcome };
        if (req.outcome === 'reach') {
            const tomorrow = rcScope.addDays(todayIso, 1);
            task.setValue({ fieldId: 'duedate', value: noonOf(tomorrow) });
            out.due = tomorrow;
        } else {
            task.setValue({ fieldId: 'status', value: 'COMPLETE' });
        }
        task.save({ ignoreMandatoryFields: true });

        if (req.outcome !== 'reach') markFollowUpDone(p.body.taskId);
        if (req.next) {
            const n = record.create({ type: record.Type.TASK, isDynamic: true });
            n.setValue({ fieldId: 'title', value: req.next.title });
            n.setValue({ fieldId: 'assigned', value: parseInt(String(p.userId), 10) });
            n.setValue({ fieldId: 'duedate', value: noonOf(req.next.due) });
            n.setValue({ fieldId: 'message', value: 'Next step after: ' + String(task.getValue({ fieldId: 'title' }) || '') });
            ['company', 'contact', 'custevent_ctc_source_call'].forEach((f) => {
                const v = valueOf(task.getValue({ fieldId: f }));
                if (v) n.setValue({ fieldId: f, value: parseInt(v, 10) });
            });
            out.nextTaskId = String(n.save({ ignoreMandatoryFields: true }));
        }
        return out;
    };

    /** The proposed task that made this Task, if any: completed too. Never throws. */
    const markFollowUpDone = (taskId) => {
        try {
            search.create({
                type: 'customrecord_ctc_proposed_task',
                filters: [['custrecord_ctc_pt_created_task', 'anyof', String(taskId)]],
                columns: ['internalid']
            }).run().getRange({ start: 0, end: 1 }).forEach((r) => {
                record.submitFields({
                    type: 'customrecord_ctc_proposed_task', id: r.id,
                    values: { custrecord_ctc_pt_task_completed: true, custrecord_ctc_pt_task_completed_date: new Date() },
                    options: { ignoreMandatoryFields: true }
                });
            });
        } catch (e) {
            log.error({ title: 'CTC SC follow-up mark failed', details: (e && e.message) || String(e) });
        }
    };

    return { bandOf, buildTasks, loadTasks, readComplete, completeTask };
});
