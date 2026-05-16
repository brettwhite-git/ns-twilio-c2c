/**
 * @NApiVersion 2.1
 * @NScriptType Portlet
 * @NModuleScope SameAccount
 *
 * CTC Sales Dashboard Portlet — home dashboard launcher with two tabs
 * (Today's Calls / Pending Tasks) + inline actions.
 *
 * IMPORTANT ARCHITECTURE NOTE
 * ---------------------------
 * NetSuite renders portlets (scriptType="html") inside a throwaway iframe,
 * parses the HTML there, then copies body.innerHTML into the visible portlet
 * container and strips every <script> node. Consequences:
 *
 *   - Inline <script>, external <script src>, addEventListener bindings,
 *     and any window.* globals set by the iframe-side script DO NOT SURVIVE.
 *   - Only static HTML, inline CSS, anchor hrefs, form submissions, and
 *     inline `onclick="..."` attribute STRINGS survive the iframe copy.
 *
 * Therefore this portlet renders the entire DOM server-side at request time,
 * fetches data via lib/ctc_workspace_queries (in-process, no HTTP roundtrip),
 * and wires every interactive element with inline `onclick="..."` strings
 * containing fully self-contained logic. No external client.js needed.
 *
 * Reference: /Users/brettwhite/Projects/opportunity-kanban (proven pattern).
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/url', 'N/log', 'N/runtime', './lib/ctc_html', './lib/ctc_workspace_queries'],
       (url, log, runtime, ctcHtml, workspaceQueries) => {

    const escapeHtml = ctcHtml.escapeHtml;
    const escapeJs   = ctcHtml.escapeJs;

    /**
     * Portlet entry point.
     */
    const render = (params) => {
        const portlet = params.portlet;
        portlet.title = 'Sales Rep Central';

        const userId = runtime.getCurrentUser().id;

        let softphoneUrl = '';
        let restletUrl = '';
        let workspaceUrl = '';

        try {
            softphoneUrl = url.resolveScript({
                scriptId: 'customscript_ctc_sl_softphone',
                deploymentId: 'customdeploy_ctc_sl_softphone'
            });
        } catch (e) {
            log.error({ title: 'CTC Portlet — softphone URL resolve failed', details: e.message || e });
        }

        try {
            restletUrl = url.resolveScript({
                scriptId: 'customscript_ctc_rl_token',
                deploymentId: 'customdeploy_ctc_rl_token',
                returnExternalUrl: false
            });
        } catch (e) {
            log.error({ title: 'CTC Portlet — RESTlet URL resolve failed', details: e.message || e });
        }

        try {
            workspaceUrl = url.resolveScript({
                scriptId: 'customscript_ctc_sl_workspace',
                deploymentId: 'customdeploy_ctc_sl_workspace'
            });
        } catch (e) {
            // workspace deferred — silently ignore
        }

        const historyResult = workspaceQueries.loadHistoryRows({ userId, todayOnly: true, limit: 5 });
        const tasksResult   = workspaceQueries.loadTaskGroups({ userId, tab: 'pending', limit: 5 });
        const stats         = workspaceQueries.computeStats(historyResult.rows || []);

        portlet.html = buildHtml({
            softphoneUrl,
            restletUrl,
            workspaceUrl,
            rows: historyResult.rows || [],
            groups: tasksResult.groups || [],
            totalTasks: tasksResult.totalTasks || 0,
            stats: stats,
            historyError: historyResult.error || '',
            tasksError: tasksResult.error || ''
        });
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Inline-onclick builders. Each returns a self-contained JS string that
    // executes in the parent page context (after iframe-copy + script strip).
    // Uses only built-in DOM APIs and `fetch`. Never references parent globals.
    // ─────────────────────────────────────────────────────────────────────────

    const buildPlaceCallOnclick = (softphoneUrl) => {
        if (!softphoneUrl) return '';
        return "window.open('" + escapeJs(softphoneUrl) + "','ctc_softphone','width=400,height=820')";
    };

    const buildRedialOnclick = (softphoneUrl, phone, entityId) => {
        if (!softphoneUrl) return '';
        // Lenient: open softphone with whatever context we have. Customer ID alone is
        // useful (loads related contacts), phone alone is useful (prefills dialer),
        // and neither is acceptable (softphone shows blank dialer for manual dialing).
        const parts = [];
        if (phone) parts.push('phone=' + encodeURIComponent(phone));
        if (entityId) {
            parts.push('entityId=' + encodeURIComponent(entityId));
            parts.push('entityType=customer');
        }
        const sep = softphoneUrl.indexOf('?') >= 0 ? '&' : '?';
        const u = parts.length ? softphoneUrl + sep + parts.join('&') : softphoneUrl;
        return "window.open('" + escapeJs(u) + "','ctc_softphone','width=400,height=820')";
    };

    const buildTabOnclick = (tabName) => {
        const tn = escapeJs(tabName);
        return "var tn='" + tn + "';" +
            "var ts=document.querySelectorAll('.ctc-pl-tab');" +
            "for(var i=0;i<ts.length;i++){" +
                "if(ts[i].getAttribute('data-tab')===tn){ts[i].classList.add('ctc-pl-tab-active')}" +
                "else{ts[i].classList.remove('ctc-pl-tab-active')}" +
            "}" +
            "var cs=document.querySelectorAll('.ctc-pl-tab-content');" +
            "for(var j=0;j<cs.length;j++){" +
                "cs[j].style.display=(cs[j].id==='ctc-pl-tab-'+tn)?'block':'none';" +
            "}";
    };

    const buildTaskActionOnclick = (action, taskId, restletUrl) => {
        if (!restletUrl) return '';
        const isApprove = action === 'approveProposedTask';
        const siblingSelector = isApprove ? '.ctc-pl-reject' : '.ctc-pl-approve';
        const errLabel = isApprove ? 'Approve' : 'Reject';
        return "var b=this;b.disabled=true;" +
            "var sib=b.parentNode.querySelector('" + siblingSelector + "');" +
            "if(sib){sib.disabled=true}" +
            "fetch('" + escapeJs(restletUrl) + "',{" +
                "method:'POST',credentials:'same-origin'," +
                "headers:{'Content-Type':'application/json'}," +
                "body:JSON.stringify({action:'" + action + "',taskId:'" + escapeJs(String(taskId)) + "'})" +
            "}).then(function(r){return r.json()})" +
            ".then(function(d){" +
                "if(d&&d.ok){" +
                    "var row=b.parentNode;" +
                    "while(row&&!row.classList.contains('ctc-pl-task-row')){row=row.parentNode}" +
                    "if(row){row.style.opacity='0.3';row.style.pointerEvents='none'}" +
                "}else{" +
                    "alert('" + errLabel + " failed: '+((d&&d.error)||'unknown'));" +
                    "b.disabled=false;if(sib){sib.disabled=false}" +
                "}" +
            "}).catch(function(e){" +
                "alert('" + errLabel + " error: '+e.message);" +
                "b.disabled=false;if(sib){sib.disabled=false}" +
            "});";
    };

    // ─────────────────────────────────────────────────────────────────────────
    // HTML builders
    // ─────────────────────────────────────────────────────────────────────────

    const fmtTime = (dateStr) => {
        if (!dateStr) return '';
        // Accept ISO or "M/D/YYYY h:mm AM/PM" formats from NetSuite search
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return String(dateStr).split(' ').slice(-2).join(' ');
        const h = d.getHours();
        const m = d.getMinutes();
        return (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m);
    };

    const fmtDuration = (secs) => {
        if (!secs || secs < 0) return '0s';
        if (secs < 60) return secs + 's';
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return m + 'm ' + (s < 10 ? '0' + s : s) + 's';
    };

    const satPillClass = (sat) => {
        if (!sat) return 'ctc-pl-pill ctc-pl-pill-none';
        if (sat >= 7) return 'ctc-pl-pill ctc-pl-pill-high';
        if (sat >= 4) return 'ctc-pl-pill ctc-pl-pill-mid';
        return 'ctc-pl-pill ctc-pl-pill-low';
    };

    const fmtDate = (dateStr) => {
        if (!dateStr) return '—';
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        // Parse YYYY-MM-DD safely (avoid timezone shift from Date('2026-05-16') being interpreted as UTC)
        const isoMatch = String(dateStr).match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})/);
        if (isoMatch) {
            return months[parseInt(isoMatch[2], 10) - 1] + ' ' + parseInt(isoMatch[3], 10);
        }
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return String(dateStr);
        return months[d.getMonth()] + ' ' + d.getDate();
    };

    const buildCallRowHtml = (r, softphoneUrl) => {
        const time = escapeHtml(fmtTime(r.date) || '—');
        const companyId = encodeURIComponent(r.companyId || '');
        const callId = encodeURIComponent(r.id || '');
        const companyName = escapeHtml(r.companyName || 'Unknown');
        const entityType = escapeHtml(r.entityType || '—');
        const brief = escapeHtml(r.brief || '—');
        const briefAttr = escapeHtml(r.brief || '');
        const sat = r.satisfaction ? String(r.satisfaction) : '—';
        const dur = escapeHtml(fmtDuration(r.duration));
        const redialOnclick = buildRedialOnclick(softphoneUrl, r.phone, r.companyId);
        // Standard NetSuite Phone Call record URL — the ctc_ue_transcript_viewer
        // UE script adds the Call Intelligence (transcript + AI summary) panel.
        const callRecordUrl = '/app/crm/calendar/call.nl?id=' + callId;

        return '<div class="ctc-pl-row">' +
            '<span class="ctc-pl-time">' + time + '</span>' +
            '<span class="ctc-pl-type">' + entityType + '</span>' +
            '<a class="ctc-pl-company" href="/app/common/entity/custjob.nl?id=' + companyId + '">' + companyName + '</a>' +
            '<span class="ctc-pl-brief" title="' + briefAttr + '">' + brief + '</span>' +
            '<span class="' + satPillClass(r.satisfaction) + '">' + escapeHtml(sat) + '</span>' +
            '<span class="ctc-pl-dur">' + dur + '</span>' +
            '<a class="ctc-pl-view-call" href="' + callRecordUrl + '" target="_blank" rel="noopener" title="Open Phone Call record (transcript + AI summary)">📋</a>' +
            (redialOnclick
                ? '<button class="ctc-pl-redial" type="button" title="Call this contact" onclick="' + escapeHtml(redialOnclick) + '">☎</button>'
                : '<span class="ctc-pl-redial-disabled" title="Softphone unavailable">☎</span>'
            ) +
        '</div>';
    };

    // Inline onclick for a date-filter chip on Today's Calls.
    // Fetches the calls for the chosen range, then re-renders the rows in-place.
    // Self-contained — uses only built-in DOM APIs + fetch.
    const buildChipOnclick = (range, restletUrl, softphoneUrl) => {
        if (!restletUrl) return '';
        return "var b=this;" +
            "var chips=document.querySelectorAll('.ctc-pl-chip');" +
            "for(var i=0;i<chips.length;i++){" +
                "if(chips[i]===b){chips[i].classList.add('ctc-pl-chip-active')}" +
                "else{chips[i].classList.remove('ctc-pl-chip-active')}" +
            "}" +
            "var container=document.getElementById('ctc-pl-tab-today');" +
            "if(!container)return;" +
            // Show loading state without obliterating the chip strip (we keep first child)
            "var chipStrip=container.firstElementChild;" +
            "container.textContent='';" +
            "if(chipStrip)container.appendChild(chipStrip);" +
            "var loading=document.createElement('div');" +
            "loading.className='ctc-pl-empty';" +
            "loading.textContent='Loading...';" +
            "container.appendChild(loading);" +
            "fetch('" + escapeJs(restletUrl) + "',{" +
                "method:'POST',credentials:'same-origin'," +
                "headers:{'Content-Type':'application/json'}," +
                "body:JSON.stringify({action:'getWorkspaceHistory',dateRange:'" + escapeJs(range) + "',limit:25})" +
            "}).then(function(r){return r.json()})" +
            ".then(function(d){" +
                "container.removeChild(loading);" +
                "if(d&&d.error){" +
                    "var err=document.createElement('div');err.className='ctc-pl-error';err.textContent='Failed: '+d.error;" +
                    "container.appendChild(err);return;" +
                "}" +
                "var rows=(d&&d.rows)||[];" +
                // Recompute KPIs from the new rows and update the DOM (parallels server-side computeStats)
                "var sats=rows.filter(function(r){return r.satisfaction});" +
                "var avgSat=sats.length?(sats.reduce(function(a,r){return a+r.satisfaction},0)/sats.length).toFixed(1):'—';" +
                "var totalSec=rows.reduce(function(a,r){return a+(r.duration||0)},0);" +
                "var minutes=Math.round(totalSec/60);" +
                "var kCalls=document.getElementById('ctc-pl-kpi-calls');if(kCalls)kCalls.textContent=String(rows.length);" +
                "var kSat=document.getElementById('ctc-pl-kpi-sat');if(kSat)kSat.textContent=String(avgSat);" +
                "var kTime=document.getElementById('ctc-pl-kpi-time');if(kTime)kTime.textContent=String(minutes);" +
                "if(!rows.length){" +
                    "var empty=document.createElement('div');empty.className='ctc-pl-empty';empty.textContent='No calls in this range.';" +
                    "container.appendChild(empty);return;" +
                "}" +
                // Re-render column header + rows. Keep header parallel to initial render.
                "var head=document.createElement('div');head.className='ctc-pl-colhead ctc-pl-colhead-calls';" +
                "head.innerHTML='<span>Time</span><span>Type</span><span>Company</span><span>AI Brief</span><span style=\\\"text-align:center\\\">Sat</span><span style=\\\"text-align:right\\\">Duration</span><span></span><span></span>';" +
                "container.appendChild(head);" +
                "rows.forEach(function(r){" +
                    "var row=document.createElement('div');row.className='ctc-pl-row';" +
                    "var t=document.createElement('span');t.className='ctc-pl-time';" +
                    "var d2=r.date?new Date(r.date):null;" +
                    "t.textContent=d2&&!isNaN(d2.getTime())?(d2.getHours()<10?'0':'')+d2.getHours()+':'+(d2.getMinutes()<10?'0':'')+d2.getMinutes():'';" +
                    "row.appendChild(t);" +
                    "var ty=document.createElement('span');ty.className='ctc-pl-type';ty.textContent=r.entityType||'—';row.appendChild(ty);" +
                    "var a=document.createElement('a');a.className='ctc-pl-company';a.href='/app/common/entity/custjob.nl?id='+encodeURIComponent(r.companyId||'');a.textContent=r.companyName||'Unknown';row.appendChild(a);" +
                    "var b2=document.createElement('span');b2.className='ctc-pl-brief';b2.title=r.brief||'';b2.textContent=r.brief||'—';row.appendChild(b2);" +
                    "var sat=r.satisfaction;var pillCls='ctc-pl-pill ctc-pl-pill-none';if(sat>=7)pillCls='ctc-pl-pill ctc-pl-pill-high';else if(sat>=4)pillCls='ctc-pl-pill ctc-pl-pill-mid';else if(sat)pillCls='ctc-pl-pill ctc-pl-pill-low';" +
                    "var p=document.createElement('span');p.className=pillCls;p.textContent=sat?String(sat):'—';row.appendChild(p);" +
                    "var du=document.createElement('span');du.className='ctc-pl-dur';" +
                    "var s=r.duration||0;du.textContent=s<60?(s+'s'):(Math.floor(s/60)+'m '+(s%60<10?'0':'')+(s%60)+'s');" +
                    "row.appendChild(du);" +
                    "var vw=document.createElement('a');vw.className='ctc-pl-view-call';vw.href='/app/crm/calendar/call.nl?id='+encodeURIComponent(r.id||'');vw.target='_blank';vw.rel='noopener';vw.title='Open Phone Call record (transcript + AI summary)';vw.textContent='📋';row.appendChild(vw);" +
                    "var rd=document.createElement('button');rd.className='ctc-pl-redial';rd.type='button';rd.title='Call this contact';rd.textContent='☎';" +
                    // Closure-based onclick (NOT setAttribute string) so `r.phone` / `r.companyId`
                    // are captured by the function's scope at row-build time. Mirrors the
                    // server-side `buildRedialOnclick` logic (lenient: phone / companyId / both / neither).
                    "if(" + (softphoneUrl ? 'true' : 'false') + "){" +
                        "var parts=[];" +
                        "if(r.phone)parts.push('phone='+encodeURIComponent(r.phone));" +
                        "if(r.companyId){parts.push('entityId='+encodeURIComponent(r.companyId));parts.push('entityType=customer')}" +
                        "var sfu='" + escapeJs(softphoneUrl || '') + "';" +
                        "var u=parts.length?(sfu+(sfu.indexOf('?')>=0?'&':'?')+parts.join('&')):sfu;" +
                        "rd.onclick=function(){window.open(u,'ctc_softphone','width=400,height=820')};" +
                    "}else{" +
                        "rd.disabled=true;rd.title='Softphone unavailable';" +
                    "}" +
                    "row.appendChild(rd);" +
                    "container.appendChild(row);" +
                "});" +
            "}).catch(function(e){" +
                "var err=document.createElement('div');err.className='ctc-pl-error';err.textContent='Failed: '+e.message;" +
                "container.appendChild(err);" +
            "});";
    };

    const buildChipsHtml = (restletUrl, softphoneUrl) => {
        const chips = [
            { range: 'today',     label: 'Today',     active: true },
            { range: 'yesterday', label: 'Yesterday', active: false },
            { range: 'thisweek',  label: 'This Week', active: false },
            { range: 'lastweek',  label: 'Last Week', active: false }
        ];
        return '<div class="ctc-pl-chips">' +
            chips.map((c) => {
                const onclick = buildChipOnclick(c.range, restletUrl, softphoneUrl);
                const cls = 'ctc-pl-chip' + (c.active ? ' ctc-pl-chip-active' : '');
                return onclick
                    ? '<button class="' + cls + '" type="button" data-range="' + c.range + '" onclick="' + escapeHtml(onclick) + '">' + c.label + '</button>'
                    : '<button class="' + cls + '" type="button" disabled>' + c.label + '</button>';
            }).join('') +
        '</div>';
    };

    const buildCallsColumnHeaderHtml = () => {
        return '<div class="ctc-pl-colhead ctc-pl-colhead-calls">' +
            '<span>Time</span>' +
            '<span>Type</span>' +
            '<span>Company</span>' +
            '<span>AI Brief</span>' +
            '<span style="text-align:center">Sat</span>' +
            '<span style="text-align:right">Duration</span>' +
            '<span></span>' +
            '<span></span>' +
        '</div>';
    };

    // Master select-all checkbox (lives in the tasks column header, right of "Company").
    // Clicking it toggles bulk-mode on the tasks container — per-row checkboxes only
    // become visible inside bulk-mode, so the table stays uncluttered the rest of the time.
    // Also tags each visible row with data-bulk-selected="1" so bulk-approve can find them.
    const buildSelectAllOnclick = () => {
        return "var master=this;" +
            "var container=document.getElementById('ctc-pl-tasks-container');" +
            "var rows=document.querySelectorAll('.ctc-pl-task-row');" +
            "var boxes=document.querySelectorAll('.ctc-pl-task-check');" +
            "if(master.checked){" +
                "if(container){container.classList.add('bulk-mode');container.classList.add('has-selection')}" +
                "for(var i=0;i<rows.length;i++){rows[i].setAttribute('data-bulk-selected','1')}" +
                "for(var j=0;j<boxes.length;j++){boxes[j].checked=true}" +
            "}else{" +
                "if(container){container.classList.remove('bulk-mode');container.classList.remove('has-selection')}" +
                "for(var i=0;i<rows.length;i++){rows[i].removeAttribute('data-bulk-selected')}" +
                "for(var j=0;j<boxes.length;j++){boxes[j].checked=false}" +
            "}" +
            "var cnt=document.getElementById('ctc-pl-selected-count');" +
            "if(cnt){cnt.textContent=master.checked?rows.length:0}";
    };

    // Per-row checkbox onclick — toggles that row's data-bulk-selected, recomputes
    // the count, hides the action bar when nothing remains selected, and syncs the
    // master checkbox's checked state.
    const buildRowCheckOnclick = () => {
        return "var cb=this;" +
            "var row=cb.parentNode;while(row&&!row.classList.contains('ctc-pl-task-row')){row=row.parentNode}" +
            "if(row){if(cb.checked)row.setAttribute('data-bulk-selected','1');else row.removeAttribute('data-bulk-selected')}" +
            "var selected=document.querySelectorAll('.ctc-pl-task-row[data-bulk-selected=\"1\"]');" +
            "var cnt=document.getElementById('ctc-pl-selected-count');" +
            "if(cnt){cnt.textContent=selected.length}" +
            "var container=document.getElementById('ctc-pl-tasks-container');" +
            "if(container){" +
                "if(selected.length>0){container.classList.add('has-selection')}" +
                "else{container.classList.remove('has-selection')}" +
            "}" +
            "var master=document.getElementById('ctc-pl-select-all');" +
            "var allRows=document.querySelectorAll('.ctc-pl-task-row');" +
            "if(master){master.checked=(allRows.length>0&&selected.length===allRows.length)}";
    };

    const buildTasksColumnHeaderHtml = (selectAllOnclick) => {
        const checkCell = selectAllOnclick
            ? '<span class="ctc-pl-colhead-check"><input type="checkbox" id="ctc-pl-select-all" class="ctc-pl-task-check-all" title="Select all visible tasks" onclick="' + escapeHtml(selectAllOnclick) + '"></span>'
            : '<span class="ctc-pl-colhead-check"></span>';
        return '<div class="ctc-pl-colhead ctc-pl-colhead-tasks">' +
            checkCell +
            '<span>Type</span>' +
            '<span>Company</span>' +
            '<span>AI Action Item</span>' +
            '<span>Due</span>' +
            '<span style="text-align:right">Approve / Reject</span>' +
        '</div>';
    };

    // Inline onclick fired by the Clear button — full reset: uncheck everything,
    // exit bulk-mode (per-row checkboxes hide), and hide the action bar.
    const buildClearOnclick = () => {
        return "var container=document.getElementById('ctc-pl-tasks-container');" +
            "var rows=document.querySelectorAll('.ctc-pl-task-row');" +
            "for(var i=0;i<rows.length;i++){rows[i].removeAttribute('data-bulk-selected')}" +
            "var boxes=document.querySelectorAll('.ctc-pl-task-check');" +
            "for(var j=0;j<boxes.length;j++){boxes[j].checked=false}" +
            "var master=document.getElementById('ctc-pl-select-all');" +
            "if(master){master.checked=false}" +
            "if(container){container.classList.remove('bulk-mode');container.classList.remove('has-selection')}" +
            "var cnt=document.getElementById('ctc-pl-selected-count');" +
            "if(cnt){cnt.textContent=0}";
    };

    // Inline onclick fired by the bulk Approve button. Gathers task IDs from rows
    // tagged with data-bulk-selected="1" (set by the master checkbox), posts to
    // bulkApproveProposedTasks, fades approved rows, reports failures.
    const buildBulkApproveOnclick = (restletUrl) => {
        if (!restletUrl) return '';
        return "var b=this;b.disabled=true;" +
            "var rows=document.querySelectorAll('.ctc-pl-task-row[data-bulk-selected=\"1\"]');" +
            "var ids=[];for(var i=0;i<rows.length;i++){ids.push(rows[i].getAttribute('data-row-id'))}" +
            "if(!ids.length){b.disabled=false;return}" +
            "fetch('" + escapeJs(restletUrl) + "',{" +
                "method:'POST',credentials:'same-origin'," +
                "headers:{'Content-Type':'application/json'}," +
                "body:JSON.stringify({action:'bulkApproveProposedTasks',taskIds:ids})" +
            "}).then(function(r){return r.json()})" +
            ".then(function(d){" +
                "if(d&&d.results){" +
                    "d.results.forEach(function(r){" +
                        "var row=document.querySelector('.ctc-pl-task-row[data-row-id=\"'+r.taskId+'\"]');" +
                        "if(!row)return;" +
                        "if(r.ok){row.style.opacity='0.3';row.style.pointerEvents='none';row.removeAttribute('data-bulk-selected')}" +
                    "});" +
                    "var master=document.getElementById('ctc-pl-select-all');" +
                    "if(master){master.checked=false}" +
                    "var boxes=document.querySelectorAll('.ctc-pl-task-check');" +
                    "for(var k=0;k<boxes.length;k++){boxes[k].checked=false}" +
                    "var container=document.getElementById('ctc-pl-tasks-container');" +
                    "if(container){container.classList.remove('bulk-mode');container.classList.remove('has-selection')}" +
                    "var cnt=document.getElementById('ctc-pl-selected-count');" +
                    "if(cnt){cnt.textContent=0}" +
                    "if(d.failed){alert('Bulk approve: '+d.approved+' succeeded, '+d.failed+' failed. Failed rows remain visible.')}" +
                "}else{" +
                    "alert('Bulk approve failed: '+((d&&d.error)||'unknown'));" +
                "}" +
                "b.disabled=false;" +
            "}).catch(function(e){alert('Bulk approve error: '+e.message);b.disabled=false});";
    };

    // Build a single flat task row. Each task = one row regardless of source call.
    // Parallel structure to buildCallRowHtml.
    const buildTaskRowHtml = (task, call, restletUrl) => {
        const companyName = escapeHtml(call.companyName || 'Unknown');
        const companyId = encodeURIComponent(call.companyId || '');
        const briefAttr = escapeHtml(call.brief || '');
        const taskText = escapeHtml(task.text || '');
        const taskTextAttr = escapeHtml(task.text || '');
        const dueDate = escapeHtml(fmtDate(task.proposedDue));
        const approveOnclick = buildTaskActionOnclick('approveProposedTask', task.id, restletUrl);
        const rejectOnclick  = buildTaskActionOnclick('rejectProposedTask',  task.id, restletUrl);
        const rowCheckOnclick = buildRowCheckOnclick();

        const entityType = escapeHtml(call.entityType || '—');

        return '<div class="ctc-pl-task-row" data-row-id="' + escapeHtml(String(task.id)) + '" title="' + briefAttr + '">' +
            '<input type="checkbox" class="ctc-pl-task-check" title="Select this task" onclick="' + escapeHtml(rowCheckOnclick) + '">' +
            '<span class="ctc-pl-task-type">' + entityType + '</span>' +
            '<a class="ctc-pl-task-company" href="/app/common/entity/custjob.nl?id=' + companyId + '">' + companyName + '</a>' +
            '<span class="ctc-pl-task-text" title="' + taskTextAttr + '">' + taskText + '</span>' +
            '<span class="ctc-pl-task-due">' + dueDate + '</span>' +
            '<span class="ctc-pl-task-actions">' +
                (approveOnclick
                    ? '<button class="ctc-pl-approve" type="button" title="Approve — creates a NetSuite Task" onclick="' + escapeHtml(approveOnclick) + '">✓</button>'
                    : '<button class="ctc-pl-approve" type="button" disabled title="RESTlet unavailable">✓</button>'
                ) +
                (rejectOnclick
                    ? '<button class="ctc-pl-reject" type="button" title="Reject — dismiss this AI suggestion" onclick="' + escapeHtml(rejectOnclick) + '">✗</button>'
                    : '<button class="ctc-pl-reject" type="button" disabled title="RESTlet unavailable">✗</button>'
                ) +
            '</span>' +
        '</div>';
    };

    // Action bar lives BELOW the task rows and ABOVE the AI nudge.
    // Hidden by default; revealed only when at least one row is selected
    // (driven by the `.has-selection` class on `#ctc-pl-tasks-container`).
    const buildTasksActionBarHtml = (restletUrl) => {
        const bulkOnclick = buildBulkApproveOnclick(restletUrl);
        const clearOnclick = buildClearOnclick();
        return '<div class="ctc-pl-tasks-actionbar">' +
            '<span><strong id="ctc-pl-selected-count">0</strong> selected</span>' +
            '<span class="ctc-pl-bulk-spacer"></span>' +
            (bulkOnclick
                ? '<button class="ctc-pl-bulk-approve" type="button" onclick="' + escapeHtml(bulkOnclick) + '">✓ Approve Selected</button>'
                : '<button class="ctc-pl-bulk-approve" type="button" disabled>✓ Approve Selected</button>'
            ) +
            '<button class="ctc-pl-bulk-clear" type="button" onclick="' + escapeHtml(clearOnclick) + '">Clear</button>' +
        '</div>';
    };

    const buildHtml = (opts) => {
        const rows = opts.rows || [];
        const groups = opts.groups || [];
        const totalTasks = opts.totalTasks || 0;
        const stats = opts.stats || {};
        const softphoneUrl = opts.softphoneUrl || '';
        const restletUrl = opts.restletUrl || '';
        const workspaceUrl = opts.workspaceUrl || '';

        const placeCallOnclick = buildPlaceCallOnclick(softphoneUrl);
        const todayTabOnclick = buildTabOnclick('today');
        const tasksTabOnclick = buildTabOnclick('tasks');

        // Today's-calls section — chip strip is always rendered first so users can
        // switch to Yesterday / This Week / Last Week even when today is empty.
        const chipsHtml = buildChipsHtml(restletUrl, softphoneUrl);
        let todayContentHtml;
        if (opts.historyError) {
            todayContentHtml = chipsHtml + '<div class="ctc-pl-error">Failed to load today\'s calls: ' + escapeHtml(opts.historyError) + '</div>';
        } else if (!rows.length) {
            todayContentHtml = chipsHtml + '<div class="ctc-pl-empty">No calls yet today — start with the button above.</div>';
        } else {
            todayContentHtml = chipsHtml + buildCallsColumnHeaderHtml() +
                               rows.map((r) => buildCallRowHtml(r, softphoneUrl)).join('');
        }

        // Pending-tasks section. Order inside the container:
        //   column header (with Select all checkbox right of "Company")
        //   → task rows
        //   → action bar (hidden until a row is selected)
        //   The container's class drives visibility: `.bulk-mode` reveals per-row
        //   checkboxes, `.has-selection` reveals the action bar.
        let tasksContentHtml;
        if (opts.tasksError) {
            tasksContentHtml = '<div class="ctc-pl-error">Failed to load tasks: ' + escapeHtml(opts.tasksError) + '</div>';
        } else if (!totalTasks) {
            tasksContentHtml = '<div class="ctc-pl-empty">✓ All caught up — no pending follow-ups.</div>';
        } else {
            const flatTaskRows = [];
            groups.forEach((g) => {
                (g.tasks || []).forEach((t) => {
                    flatTaskRows.push(buildTaskRowHtml(t, g.call, restletUrl));
                });
            });
            const selectAllOnclick = buildSelectAllOnclick();
            tasksContentHtml =
                '<div id="ctc-pl-tasks-container" class="ctc-pl-tasks-container">' +
                    buildTasksColumnHeaderHtml(selectAllOnclick) +
                    flatTaskRows.join('') +
                    buildTasksActionBarHtml(restletUrl) +
                '</div>';
        }

        // AI nudge strip
        const nudgeHtml = totalTasks ? (
            '<div class="ctc-pl-nudge">' +
                '<span class="ctc-pl-nudge-icon">✦</span>' +
                '<div class="ctc-pl-nudge-text">' +
                    '<strong>' + totalTasks + '</strong> pending follow-up' + (totalTasks === 1 ? '' : 's') +
                    ' across ' + groups.length + ' call' + (groups.length === 1 ? '' : 's') +
                '</div>' +
                (workspaceUrl
                    ? '<a class="ctc-pl-nudge-cta" href="' + escapeHtml(workspaceUrl) +
                      (workspaceUrl.indexOf('?') >= 0 ? '&' : '?') + 'view=tasks">Review →</a>'
                    : '<button class="ctc-pl-nudge-cta" type="button" onclick="' + escapeHtml(buildTabOnclick('tasks')) + '">Review →</button>'
                ) +
            '</div>'
        ) : '';

        // Place-a-Call button (icon-only; tooltip explains action; falls back to disabled state if URL missing)
        const callButtonHtml = placeCallOnclick
            ? '<button class="ctc-pl-call-btn" type="button" aria-label="Place a Call" title="Place a Call" onclick="' + escapeHtml(placeCallOnclick) + '">' +
                '<span class="ctc-pl-call-icon" aria-hidden="true">☎</span>' +
              '</button>'
            : '<button class="ctc-pl-call-btn ctc-pl-call-btn-disabled" type="button" disabled ' +
              'aria-label="Place a Call (unavailable)" title="Softphone Suitelet not deployed — check CTC Configuration">' +
                '<span class="ctc-pl-call-icon" aria-hidden="true">☎</span>' +
              '</button>';

        // Tab badge for pending tasks count
        const tasksBadge = totalTasks ? ' (' + totalTasks + ')' : '';

        return `<style>
.ctc-pl-root {
    font-family: "Oracle Sans", "Helvetica Neue", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #161513;
    font-size: 13px;
}

/* ── HEADER: button left, 4 KPI cards right, all aligned ─────────────── */
.ctc-pl-headline {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 20px;
    padding: 16px 16px 14px;
    border-bottom: 1px solid #E5E2DD;
}
.ctc-pl-call-btn {
    background: #345D7E; color: #FFFFFF;
    border: 1px solid #345D7E; border-radius: 6px;
    padding: 0;
    font-size: 14px; font-weight: 600;
    cursor: pointer;
    display: inline-flex; align-items: center;
    font-family: inherit;
    height: 84px; width: 84px;
    justify-content: center;
    box-sizing: border-box;
    line-height: 1;
    title: "Place a Call";
}
.ctc-pl-call-btn:hover { background: #2B4D69; border-color: #2B4D69; }
.ctc-pl-call-btn-disabled, .ctc-pl-call-btn:disabled {
    background: #8B8780; border-color: #8B8780; cursor: not-allowed; opacity: 0.65;
}
.ctc-pl-call-icon {
    font-size: 38px;
    line-height: 1;
    display: inline-block;
}

/* KPI cards — borrowed from opportunity-kanban (Oracle Sans, bordered card) */
.ctc-pl-kpis {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    align-items: stretch;
}
.ctc-pl-kpi {
    padding: 12px 14px;
    height: 84px;
    border: 1px solid rgba(22, 21, 19, 0.12);
    border-radius: 6px;
    background-color: transparent;
    box-sizing: border-box;
    display: flex; flex-direction: column; justify-content: center;
    gap: 6px;
}
.ctc-pl-kpi-label {
    font-size: 12.5px; font-weight: 400;
    color: rgb(0, 0, 0);
    margin: 0;
    line-height: 1.2;
}
.ctc-pl-kpi-value {
    font-size: 22px; font-weight: 700;
    color: rgb(0, 0, 0);
    margin: 0;
    line-height: 1.1;
    font-family: inherit;
}
.ctc-pl-kpi-value-sub {
    font-size: 12px; font-weight: 500; color: #5C5955; margin-left: 4px;
}

/* ── TABS ─────────────────────────────────────────────────────────────── */
.ctc-pl-tabs {
    display: flex; gap: 2px;
    padding: 10px 16px 0;
    background: #FAFAF8;
    border-bottom: 1px solid #E5E2DD;
}
.ctc-pl-tab {
    background: transparent; border: none;
    padding: 8px 14px;
    font-size: 13px; font-weight: 500;
    color: #5C5955;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    font-family: inherit;
}
.ctc-pl-tab:hover { color: #161513; }
.ctc-pl-tab-active { color: #345D7E; border-bottom-color: #345D7E; font-weight: 600; }
.ctc-pl-tab-badge { color: #B47200; font-size: 12px; margin-left: 5px; font-weight: 600; }

.ctc-pl-tab-content { padding: 0 16px 12px; min-height: 80px; }

/* ── Date filter chips (Today's Calls) ───────────────────────────────── */
.ctc-pl-chips {
    display: flex; gap: 6px;
    padding: 10px 0 8px;
}
.ctc-pl-chip {
    background: #FFFFFF;
    border: 1px solid #C9C5BE;
    border-radius: 999px;
    padding: 4px 12px;
    font-size: 12px; font-weight: 500;
    color: #5C5955;
    cursor: pointer;
    font-family: inherit;
}
.ctc-pl-chip:hover { border-color: #5C5955; color: #161513; }
.ctc-pl-chip-active {
    background: #345D7E; border-color: #345D7E; color: #FFFFFF;
}
.ctc-pl-chip-active:hover { color: #FFFFFF; border-color: #2B4D69; background: #2B4D69; }
.ctc-pl-empty { color: #5C5955; padding: 28px 12px; text-align: center; font-size: 13px; }
.ctc-pl-error { color: #B83A33; padding: 12px; font-size: 12px; }

/* ── COLUMN HEADER ROW (shared structure for both tabs) ───────────────── */
.ctc-pl-colhead {
    display: grid;
    gap: 10px;
    align-items: center;
    padding: 10px 6px 6px;
    border-bottom: 1.5px solid #C9C5BE;
    font-size: 10.5px;
    font-weight: 700;
    color: #5C5955;
    text-transform: uppercase;
    letter-spacing: 0.08em;
}
.ctc-pl-colhead-calls {
    grid-template-columns: 60px 70px 1.4fr 2.2fr 46px 70px 36px 36px;
}
.ctc-pl-colhead-tasks {
    grid-template-columns: 28px 70px 1.4fr 2.5fr 70px 64px;
}
.ctc-pl-colhead-tasks .ctc-pl-colhead-check {
    display: inline-flex; align-items: center; justify-content: center;
}

/* ── Bulk action bar (hidden by default; revealed when ≥1 row selected) ──
   Positioned BELOW the task rows and ABOVE the AI nudge strip. */
.ctc-pl-tasks-actionbar {
    display: none;
    align-items: center; gap: 12px;
    padding: 8px 10px;
    margin: 8px 0 6px;
    background: rgba(52, 93, 126, 0.06);
    border: 1px solid rgba(52, 93, 126, 0.18);
    border-radius: 6px;
    font-size: 12.5px;
    color: #161513;
}
.ctc-pl-tasks-container.has-selection .ctc-pl-tasks-actionbar {
    display: flex;
}
/* Per-row checkboxes are hidden until the user enters bulk-mode via Select all */
.ctc-pl-task-check {
    visibility: hidden;
}
.ctc-pl-tasks-container.bulk-mode .ctc-pl-task-check {
    visibility: visible;
}
.ctc-pl-tasks-actionbar strong { color: #345D7E; }
.ctc-pl-select-all-label {
    display: inline-flex; align-items: center; gap: 6px;
    cursor: pointer;
    user-select: none;
}
.ctc-pl-bulk-approve {
    background: #0E7A4F; color: #FFFFFF; border: none;
    border-radius: 5px; padding: 6px 14px;
    font-size: 12.5px; font-weight: 600; cursor: pointer;
    font-family: inherit;
}
.ctc-pl-bulk-approve:hover { background: #0A5C3B; }
.ctc-pl-bulk-clear {
    background: transparent; border: 1px solid #C9C5BE; color: #5C5955;
    border-radius: 5px; padding: 5px 10px;
    font-size: 12px; cursor: pointer; font-family: inherit;
}
.ctc-pl-bulk-clear:hover { color: #161513; border-color: #5C5955; }
.ctc-pl-bulk-spacer { margin-left: auto; }

.ctc-pl-task-check, .ctc-pl-task-check-all {
    width: 16px; height: 16px;
    accent-color: #345D7E;
    cursor: pointer;
    margin: 0;
    justify-self: center;
}

/* ── TODAY'S CALLS ROWS ───────────────────────────────────────────────── */
.ctc-pl-row {
    display: grid;
    grid-template-columns: 60px 70px 1.4fr 2.2fr 46px 70px 36px 36px;
    gap: 10px; align-items: center;
    padding: 8px 6px;
    border-bottom: 1px solid #F1EFEA;
    font-size: 13px;
}
.ctc-pl-row:last-child { border-bottom: none; }
.ctc-pl-row:hover { background: #FAFAF8; }
.ctc-pl-time { color: #5C5955; font-size: 12px; }
.ctc-pl-type, .ctc-pl-task-type { color: #5C5955; font-size: 12px; }
.ctc-pl-company { color: #345D7E; font-weight: 600; text-decoration: none; }
.ctc-pl-company:hover { text-decoration: underline; }
.ctc-pl-brief { color: #5C5955; font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ctc-pl-dur { color: #5C5955; font-size: 12px; text-align: right; }
.ctc-pl-redial, .ctc-pl-redial-disabled {
    background: transparent; border: 1px solid #C9C5BE; color: #345D7E;
    border-radius: 4px; width: 28px; height: 24px;
    font-size: 13px; cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
    font-family: inherit;
}
.ctc-pl-redial-disabled { opacity: 0.4; cursor: not-allowed; }
.ctc-pl-redial:hover { background: rgba(52, 93, 126, 0.08); border-color: #345D7E; }
.ctc-pl-view-call {
    background: transparent; border: 1px solid #C9C5BE; color: #345D7E;
    border-radius: 4px; width: 28px; height: 24px;
    font-size: 13px; line-height: 1; cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
    text-decoration: none;
}
.ctc-pl-view-call:hover { background: rgba(52, 93, 126, 0.08); border-color: #345D7E; text-decoration: none; }

.ctc-pl-pill {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 1px 8px; border-radius: 999px;
    font-size: 12px; font-weight: 600;
    justify-self: center;
}
.ctc-pl-pill::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.ctc-pl-pill-high { background: rgba(14, 122, 79, 0.1); color: #0E7A4F; }
.ctc-pl-pill-mid { background: rgba(180, 114, 0, 0.1); color: #B47200; }
.ctc-pl-pill-low { background: rgba(184, 58, 51, 0.1); color: #B83A33; }
.ctc-pl-pill-none { background: rgba(139, 135, 128, 0.14); color: #8B8780; }
.ctc-pl-pill-none::before { display: none; }

/* ── PENDING TASKS — flat table parallel to Today's Calls ────────────── */
.ctc-pl-task-row {
    display: grid;
    grid-template-columns: 28px 70px 1.4fr 2.5fr 70px 64px;
    gap: 10px; align-items: center;
    padding: 8px 6px;
    border-bottom: 1px solid #F1EFEA;
    transition: opacity 0.3s;
    font-size: 13px;
}
.ctc-pl-task-row[data-bulk-selected="1"] {
    background: rgba(52, 93, 126, 0.06);
}
.ctc-pl-task-row:last-child { border-bottom: none; }
.ctc-pl-task-row:hover { background: #FAFAF8; }
.ctc-pl-task-company { color: #345D7E; font-weight: 600; text-decoration: none; }
.ctc-pl-task-company:hover { text-decoration: underline; }
.ctc-pl-task-text { color: #161513; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ctc-pl-task-due {
    color: #5C5955; font-size: 12px; white-space: nowrap;
}
.ctc-pl-task-actions { display: flex; gap: 4px; justify-content: flex-end; }
.ctc-pl-approve, .ctc-pl-reject {
    width: 28px; height: 24px;
    border-radius: 4px;
    border: 1px solid;
    font-size: 13px; font-weight: 600; cursor: pointer;
    font-family: inherit;
    display: inline-flex; align-items: center; justify-content: center;
    line-height: 1;
    padding: 0;
}
.ctc-pl-approve {
    background: #0E7A4F; border-color: #0E7A4F; color: #FFFFFF;
}
.ctc-pl-approve:hover { background: #0A5C3B; border-color: #0A5C3B; }
.ctc-pl-reject {
    background: #FFFFFF; border-color: #C9C5BE; color: #B83A33;
}
.ctc-pl-reject:hover { background: rgba(184, 58, 51, 0.08); border-color: #B83A33; }
.ctc-pl-approve:disabled, .ctc-pl-reject:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── NUDGE STRIP (NetSuite blue, matches project palette) ─────────────── */
.ctc-pl-nudge {
    margin: 12px 16px 0;
    background: linear-gradient(135deg, rgba(52, 93, 126, 0.10) 0%, rgba(52, 93, 126, 0.04) 100%);
    border: 1px solid rgba(52, 93, 126, 0.22);
    border-radius: 8px;
    padding: 10px 14px;
    display: flex; gap: 12px; align-items: center;
    font-size: 13px;
}
.ctc-pl-nudge-icon {
    width: 24px; height: 24px;
    background: linear-gradient(135deg, #4A78A2 0%, #345D7E 100%);
    color: #FFFFFF;
    border-radius: 6px;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 13px;
    flex-shrink: 0;
}
.ctc-pl-nudge-text { flex: 1; color: #161513; }
.ctc-pl-nudge-text strong { color: #345D7E; font-weight: 700; }
.ctc-pl-nudge-cta {
    background: #345D7E; color: #FFFFFF !important;
    border: none; border-radius: 5px; padding: 6px 12px;
    font-size: 12px; font-weight: 600;
    text-decoration: none;
    cursor: pointer; font-family: inherit;
    display: inline-block;
}
.ctc-pl-nudge-cta:hover { background: #2B4D69; }

</style>

<div class="ctc-pl-root">
    <div class="ctc-pl-headline">
        ${callButtonHtml}
        <div class="ctc-pl-kpis">
            <div class="ctc-pl-kpi">
                <div class="ctc-pl-kpi-label">Calls</div>
                <div class="ctc-pl-kpi-value" id="ctc-pl-kpi-calls">${escapeHtml(String(stats.callsToday || 0))}</div>
            </div>
            <div class="ctc-pl-kpi">
                <div class="ctc-pl-kpi-label">Avg Satisfaction</div>
                <div class="ctc-pl-kpi-value"><span id="ctc-pl-kpi-sat">${escapeHtml(String(stats.avgSat || '—'))}</span><span class="ctc-pl-kpi-value-sub">/10</span></div>
            </div>
            <div class="ctc-pl-kpi">
                <div class="ctc-pl-kpi-label">Talk Time</div>
                <div class="ctc-pl-kpi-value"><span id="ctc-pl-kpi-time">${escapeHtml(String(stats.talkTimeMinutes || 0))}</span><span class="ctc-pl-kpi-value-sub">min</span></div>
            </div>
            <div class="ctc-pl-kpi">
                <div class="ctc-pl-kpi-label">Pending Tasks</div>
                <div class="ctc-pl-kpi-value">${escapeHtml(String(totalTasks))}</div>
            </div>
        </div>
    </div>

    <div class="ctc-pl-tabs">
        <button class="ctc-pl-tab ctc-pl-tab-active" type="button" data-tab="today" onclick="${escapeHtml(todayTabOnclick)}">Call History</button>
        <button class="ctc-pl-tab" type="button" data-tab="tasks" onclick="${escapeHtml(tasksTabOnclick)}">Pending Tasks${escapeHtml(tasksBadge)}</button>
    </div>

    <div id="ctc-pl-tab-today" class="ctc-pl-tab-content">${todayContentHtml}</div>
    <div id="ctc-pl-tab-tasks" class="ctc-pl-tab-content" style="display:none">${tasksContentHtml}</div>

    ${nudgeHtml}
</div>`;
    };

    return { render };
});
