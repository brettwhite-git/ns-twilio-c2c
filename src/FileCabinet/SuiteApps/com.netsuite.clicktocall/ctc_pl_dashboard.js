/**
 * @NApiVersion 2.1
 * @NScriptType Portlet
 * @NModuleScope SameAccount
 *
 * CTC Sales Dashboard Portlet ("Sales Rep Central") — period switch, KPI
 * strip, Calls / Missed / Follow-ups tabs, inline actions, Reporting
 * Central links.
 *
 * IMPORTANT ARCHITECTURE NOTE
 * ---------------------------
 * NetSuite renders portlets (scriptType="html") inside a throwaway iframe,
 * parses the HTML there, then copies body.innerHTML into the visible portlet
 * container and strips every <script> node. Consequences:
 *
 *   - Inline <script>, external <script src>, addEventListener bindings,
 *     and any window.* globals set by the iframe-side script DO NOT SURVIVE.
 *   - Only static HTML, <style> blocks, anchor hrefs, form submissions, and
 *     inline `onclick="..."` attribute STRINGS survive the iframe copy.
 *
 * Therefore this portlet renders the entire DOM server-side at request time,
 * fetches data via lib/ctc_workspace_queries (in-process, no HTTP roundtrip),
 * and wires every interactive element with inline `onclick="..."` strings
 * containing fully self-contained logic. No external client.js needed.
 *
 * UI state lives in classes on #ctc-pl-root (`ctc-pl-show-tasks`,
 * `ctc-pl-show-missed`, `ctc-pl-no-fu`, `ctc-pl-fu-all`,
 * `ctc-pl-no-missed`); CSS responds. The period refresh logic lives once, in the
 * onclick of the hidden #ctc-pl-refresh button; the period chips and the
 * Try again buttons set its data-range and call .click() on it.
 *
 * Narrow portlet columns (<= 560 px) switch layout through a container query
 * on #ctc-pl-root (container-type: inline-size), not a media query.
 *
 * Reference: /Users/brettwhite/Projects/opportunity-kanban (proven pattern).
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/url', 'N/log', 'N/runtime', 'N/file', './lib/ctc_html', './lib/ctc_workspace_queries', './lib/ctc_dock', './lib/ctc_fonts'],
       (url, log, runtime, file, ctcHtml, workspaceQueries, ctcDock, ctcFonts) => {

    const escapeHtml = ctcHtml.escapeHtml;
    const escapeJs   = ctcHtml.escapeJs;
    const formatPhone = ctcHtml.formatPhone;
    // Calls live only in the phone mode shell (ctc_sl_shell.js). Launchers
    // here ask the shell's dialer when the dashboard runs inside it, and move
    // the tab into the shell otherwise. No popup window.

    // ── Icons (24 grid). Colour comes from CSS via currentColor. ────────────
    // The phone glyph is the only filled icon. The paths are shared with the
    // inline client-side row rebuilder (period switch) so server-rendered and
    // rebuilt rows stay identical.
    const PATH = {
        call: 'M2 5.5C2 3.6 3.6 2 5.5 2h1.3c.9 0 1.7.6 1.9 1.5l1 4c.2.8-.1 1.6-.8 2.1l-1.5 1.1a12 12 0 0 0 5.9 5.9l1.1-1.5c.5-.7 1.3-1 2.1-.8l4 1c.9.2 1.5 1 1.5 1.9v1.3c0 1.9-1.6 3.5-3.5 3.5A16.5 16.5 0 0 1 2 5.5z',
        outbound: 'M7 17L17 7M9 7h8v8',
        inbound: 'M17 7L7 17M15 17H7V9',
        open: 'M14 3h7v7M21 3l-9 9M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5',
        approve: 'M5 12l5 5L20 7',
        dismiss: 'M6 6l12 12M18 6L6 18',
        followUp: 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9'
    };

    const strokeSvg = (d, size, width, cls, aria) => '<svg' + (cls ? ' class="' + cls + '"' : '') +
        ' width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + width + '"' +
        ' stroke-linecap="round" stroke-linejoin="round"' +
        (aria ? ' role="img" aria-label="' + escapeHtml(aria) + '"' : ' aria-hidden="true"') +
        '><path d="' + d + '"></path></svg>';
    const callSvg = (size) => '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="' + PATH.call + '"></path></svg>';

    // Call status (custevent_ctc_call_status) -> what a row shows when there
    // is no AI brief. ONE rule set, shared with Reporting Central
    // (lib/ctc_html CALL_STATUS_RULES): briefOf / lenIsDash / dirKind use it
    // on the server, and buildRefreshOnclick ships it as JSON to the client
    // rebuilder. Chips: ctc-pl-status ctc-pl-status-<chip>.
    const STATUS_RULES = ctcHtml.CALL_STATUS_RULES;

    // Direction icon before the time: a 20 px circle with a 12 px arrow
    // (down-left for in / missed, up-right for out), classes
    // ctc-pl-status-dir ctc-pl-status-dir-<kind>. Missed = status rule dir
    // 'missed', or an inbound call with no talk time. Shipped to the client
    // rebuilder as JSON (labels only).
    const DIR_CHIP = {
        in:     { aria: 'Inbound call' },
        out:    { aria: 'Outbound call' },
        missed: { aria: 'Missed call' }
    };
    const statusRule = (r) => {
        const st = r.callStatus || '';
        return Object.prototype.hasOwnProperty.call(STATUS_RULES, st) ? STATUS_RULES[st] : null;
    };

    // A missed call: status rule dir 'missed' (status Missed) OR a voicemail
    // (custevent_ctc_voicemail T). ONE rule for the direction chip, the Calls
    // KPI "<n> missed" and the Missed tab badge; the Missed tab's search
    // (loadHistoryRows missedOnly) applies the same rule. The client
    // rebuilder mirrors it (MISSED_CALL_JS).
    const isMissedCall = (r) => {
        const rule = statusRule(r);
        return !!(rule && rule.dir === 'missed') || r.voicemail === true;
    };
    const MISSED_CALL_JS = "function(r){var st=r.callStatus||'';var ru=Object.prototype.hasOwnProperty.call(SR,st)?SR[st]:null;" +
        "return !!(ru&&ru.dir==='missed')||r.voicemail===true}";

    // The missed count shown by the KPI sub-line and the tab badge: the
    // missedOnly search's full count, or (when that search failed) the
    // missed calls among the loaded rows.
    const missedCountOf = (opts, rows) => (opts.missedError
        ? rows.filter(isMissedCall).length
        : Math.max(opts.missedTotal || 0, (opts.missedRows || []).length));

    // Period segmented control. `calls` names the data in the error state;
    // `empty` is the empty-state title.
    const RANGES = [
        { range: 'today',     label: 'Today',     calls: 'today’s calls',     empty: 'No calls yet today' },
        { range: 'yesterday', label: 'Yesterday', calls: 'yesterday’s calls', empty: 'No calls yesterday' },
        { range: 'thisweek',  label: 'This week', calls: 'this week’s calls', empty: 'No calls this week' },
        { range: 'lastweek',  label: 'Last week', calls: 'last week’s calls', empty: 'No calls last week' }
    ];
    const EMPTY_SUB = 'Calls you make from NetSuite show up here.';
    const ERROR_SUB = 'The rest of your dashboard is fine.';

    // Missed tab: the period's missed calls and voicemails, newest first.
    const MISSED_LIMIT = 5;
    const MISSED_EMPTY = 'No missed calls in this period.';
    const MISSED_ERROR = 'Couldn’t load missed calls';

    // Follow-ups shown in the portlet (the newest pending ones).
    const TASK_LIMIT = 5;

    /**
     * Portlet entry point.
     */
    const render = (params) => {
        const portlet = params.portlet;
        portlet.title = 'Sales Rep Central';

        const userId = runtime.getCurrentUser().id;

        let shellUrl = '';
        let restletUrl = '';
        let reportingUrl = '';

        try {
            shellUrl = url.resolveScript({
                scriptId: 'customscript_ctc_sl_shell',
                deploymentId: 'customdeploy_ctc_sl_shell',
                returnExternalUrl: false
            });
        } catch (e) {
            log.error({ title: 'CTC Portlet — shell URL resolve failed', details: e.message || e });
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

        // Reporting Central may not be deployed yet. No link when it is missing.
        try {
            reportingUrl = url.resolveScript({
                scriptId: 'customscript_ctc_sl_reporting',
                deploymentId: 'customdeploy_ctc_sl_reporting',
                returnExternalUrl: false
            }) || '';
        } catch (e) {
            reportingUrl = '';
        }

        const historyResult = workspaceQueries.loadHistoryRows({ userId, todayOnly: true, limit: 5 });
        // Missed calls + voicemails today (status 'Missed' OR voicemail T).
        // `total` is the full count for the tab badge.
        const missedResult  = workspaceQueries.loadHistoryRows({
            userId, todayOnly: true, limit: MISSED_LIMIT, missedOnly: true, countTotal: true
        }) || {};
        const tasksResult   = workspaceQueries.loadTaskGroups({ userId, tab: 'pending', limit: TASK_LIMIT });
        const stats         = workspaceQueries.computeStats(historyResult.rows || []);

        portlet.html = ctcFonts.buildFigtreeStyle() + buildHtml({
            shellUrl,
            restletUrl,
            reportingUrl,
            rows: historyResult.rows || [],
            missedRows: missedResult.rows || [],
            missedTotal: missedResult.total || 0,
            missedError: missedResult.error || '',
            groups: tasksResult.groups || [],
            totalTasks: tasksResult.totalTasks || 0,
            stats: stats,
            historyError: historyResult.error || '',
            tasksError: tasksResult.error || ''
        }) + buildDockLoader(shellUrl, restletUrl);
    };

    /**
     * Telephony Dock loader (see buildDockLoaderHtml in lib/ctc_dock.js for
     * why an <img onerror> and not a <script>). Inside the shell the dock
     * stays silent (frame mode). Outside it, the dock moves the tab into the
     * shell by itself (autoEnter) unless the rep left phone mode in this tab
     * or another tab holds the phone. A missing dock file never breaks the
     * portlet.
     * @param {string} shellUrl
     * @param {string} restletUrl
     * @returns {string}
     */
    const buildDockLoader = (shellUrl, restletUrl) => {
        if (!shellUrl) return '';
        try {
            return ctcDock.buildDockLoaderHtml({
                assetUrl: file.load({ id: ctcDock.DOCK_ASSET_PATH }).url,
                dialerUrl: file.load({ id: ctcDock.DIALER_ASSET_PATH }).url,
                shellUrl: shellUrl,
                autoEnter: true,
                restletUrl: restletUrl
            });
        } catch (e) {
            log.error({ title: 'CTC Portlet — dock script file load failed', details: e.message || e });
            return '';
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Inline-onclick builders. Each returns a self-contained JS string that
    // executes in the parent page context (after iframe-copy + script strip).
    // Uses only built-in DOM APIs and `fetch`. Never references parent globals
    // other than window.top.__ctcShell (the phone mode shell's API).
    // ─────────────────────────────────────────────────────────────────────────

    // JS that starts a call. Inside phone mode (the dashboard runs in the
    // shell's frame): the shell's dialer opens on Dial with ctxJs loaded; it
    // never dials by itself. Outside: the tab moves into the shell on this
    // page (the rep presses Call there). ctxJs is a JS expression.
    const buildShellCallJs = (shellUrl, ctxJs) => {
        const prefix = shellUrl + (shellUrl.indexOf('?') >= 0 ? '&' : '?') + 'u=';
        return "var c=" + ctxJs + ";var s=null;try{s=window.top.__ctcShell}catch(e){}" +
            "if(s&&s.call){s.call(c)}else{" +
                "try{window.sessionStorage.removeItem('" + escapeJs(ctcDock.EXIT_KEY) + "')}catch(e){}" +
                "window.top.location.href='" + escapeJs(prefix) + "'+encodeURIComponent(location.pathname+location.search)" +
            "}";
    };

    const buildPlaceCallOnclick = (shellUrl) => {
        if (!shellUrl) return '';
        return buildShellCallJs(shellUrl, 'null');
    };

    const buildRedialOnclick = (shellUrl, phone, entityId, entityName) => {
        if (!shellUrl) return '';
        // Lenient: whatever context we have. Customer ID alone is useful
        // (loads related contacts), phone alone is useful (prefills the
        // number), neither leaves a blank dialer for manual dialing.
        const ctxJs = "{entityId:'" + escapeJs(String(entityId || '')) + "'," +
            "entityName:'" + escapeJs(String(entityName || '')) + "'," +
            "entityType:'" + (entityId ? 'customer' : '') + "'," +
            "phone:'" + escapeJs(String(phone || '')) + "'}";
        return buildShellCallJs(shellUrl, ctxJs);
    };

    // Tabs: a class on the root shows one panel (CSS), the tab buttons get
    // the active class + aria-selected.
    const buildTabOnclick = (tabName) => {
        const tn = escapeJs(tabName);
        return "var tn='" + tn + "';var R=document.getElementById('ctc-pl-root');" +
            "if(R){R.classList.remove('ctc-pl-show-tasks');R.classList.remove('ctc-pl-show-missed');" +
                "if(tn==='tasks'){R.classList.add('ctc-pl-show-tasks')}else if(tn==='missed'){R.classList.add('ctc-pl-show-missed')}}" +
            "var ts=document.querySelectorAll('.ctc-pl-tab');" +
            "for(var i=0;i<ts.length;i++){" +
                "var on=ts[i].getAttribute('data-tab')===tn;" +
                "if(on){ts[i].classList.add('ctc-pl-tab-active')}else{ts[i].classList.remove('ctc-pl-tab-active')}" +
                "ts[i].setAttribute('aria-selected',on?'true':'false')" +
            "}";
    };

    // Write the follow-up count to the tab badge, the KPI and the bar, and the
    // rows still on screen to "Approve all N" (it approves only those). The
    // total lives in the root's data-fu-total, because the portlet shows only
    // the newest few; taskExitJs lowers it by one per row. At 0 the root gets
    // `ctc-pl-no-fu` (CSS hides the badge/bar/button, shows "All caught up").
    // When every pending follow-up is on screen the root gets `ctc-pl-fu-all`
    // (CSS hides "Showing x of N" in the footer).
    // The count changes at once, without animation.
    const FU_SYNC_JS = "var R=document.getElementById('ctc-pl-root');" +
        "var n=R?(parseInt(R.getAttribute('data-fu-total'),10)||0):0;" +
        "var sh=document.querySelectorAll('.ctc-pl-task-row:not(.ctc-pl-task-gone)').length;" +
        "var ns=document.querySelectorAll('.ctc-pl-fu-n');for(var q=0;q<ns.length;q++){ns[q].textContent=String(n)}" +
        "var nh=document.querySelectorAll('.ctc-pl-fu-shown');for(var h=0;h<nh.length;h++){nh[h].textContent=String(sh)}" +
        "var nw=document.querySelectorAll('.ctc-pl-fu-noun');for(var w=0;w<nw.length;w++){nw[w].textContent=n===1?'follow-up':'follow-ups'}" +
        "if(R){if(n){R.classList.remove('ctc-pl-no-fu')}else{R.classList.add('ctc-pl-no-fu')}" +
            "if(n<=sh){R.classList.add('ctc-pl-fu-all')}else{R.classList.remove('ctc-pl-fu-all')}}";

    // Row exit: opacity, then height (CSS transitions on .ctc-pl-task-leaving),
    // then the node is removed. `v` is the JS variable that holds the row.
    const taskExitJs = (v) => "if(!" + v + ".classList.contains('ctc-pl-task-gone')){" +
        "var Rt=document.getElementById('ctc-pl-root');" +
        "if(Rt){Rt.setAttribute('data-fu-total',String(Math.max(0,(parseInt(Rt.getAttribute('data-fu-total'),10)||0)-1)))}}" +
        v + ".classList.add('ctc-pl-task-gone');" +
        v + ".style.height=" + v + ".offsetHeight+'px';void " + v + ".offsetHeight;" +
        v + ".classList.add('ctc-pl-task-leaving');" +
        "(function(x){setTimeout(function(){if(x.parentNode){x.parentNode.removeChild(x)}},360)})(" + v + ");";

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
                    "while(row&&!(row.classList&&row.classList.contains('ctc-pl-task-row'))){row=row.parentNode}" +
                    "if(row){" + taskExitJs('row') + "}" +
                    FU_SYNC_JS +
                "}else{" +
                    "alert('" + errLabel + " failed: '+((d&&d.error)||'unknown'));" +
                    "b.disabled=false;if(sib){sib.disabled=false}" +
                "}" +
            "}).catch(function(e){" +
                "alert('" + errLabel + " error: '+e.message);" +
                "b.disabled=false;if(sib){sib.disabled=false}" +
            "});";
    };

    // "Approve all N": posts every follow-up still on screen to
    // bulkApproveProposedTasks; approved rows leave, failed rows stay.
    const buildBulkApproveOnclick = (restletUrl) => {
        if (!restletUrl) return '';
        return "var b=this;b.disabled=true;" +
            "var rows=document.querySelectorAll('.ctc-pl-task-row:not(.ctc-pl-task-gone)');" +
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
                        "if(!r.ok)return;" +
                        "var row=document.querySelector('.ctc-pl-task-row[data-row-id=\"'+r.taskId+'\"]');" +
                        "if(row){" + taskExitJs('row') + "}" +
                    "});" +
                    FU_SYNC_JS +
                    "if(d.failed){alert('Approve all: '+d.approved+' succeeded, '+d.failed+' failed. Failed rows remain visible.')}" +
                "}else{" +
                    "alert('Bulk approve failed: '+((d&&d.error)||'unknown'));" +
                "}" +
                "b.disabled=false;" +
            "}).catch(function(e){alert('Bulk approve error: '+e.message);b.disabled=false});";
    };

    // Period chip: mark it active, carry the range to the Reporting Central
    // link, then run the shared refresh (hidden #ctc-pl-refresh).
    const buildChipOnclick = (range) => {
        return "var b=this,rg='" + escapeJs(range) + "';" +
            "var cs=document.querySelectorAll('.ctc-pl-chip');" +
            "for(var i=0;i<cs.length;i++){" +
                "var on=cs[i]===b;" +
                "if(on){cs[i].classList.add('ctc-pl-chip-active')}else{cs[i].classList.remove('ctc-pl-chip-active')}" +
                "cs[i].setAttribute('aria-pressed',on?'true':'false')" +
            "}" +
            "var R=document.getElementById('ctc-pl-root');if(R){R.setAttribute('data-range',rg)}" +
            "var a=document.getElementById('ctc-pl-report');if(a){a.href=a.getAttribute('data-base')+encodeURIComponent(rg)}" +
            "var a2=document.getElementById('ctc-pl-fu-report');if(a2){a2.href=a2.getAttribute('data-base')+encodeURIComponent(rg)}" +
            "var f=document.getElementById('ctc-pl-refresh');if(f){f.setAttribute('data-range',rg);f.click()}";
    };

    const RETRY_JS = "var f=document.getElementById('ctc-pl-refresh');if(f){f.click()}";

    // The period refresh. Runs from the hidden #ctc-pl-refresh button: shows
    // the static skeleton, fetches getWorkspaceHistory for data-range (with
    // includeMissed, so the Missed tab gets the same period's missed calls
    // and voicemails in the same response), then recomputes the KPIs and
    // rebuilds the Calls rows and the Missed list with createElement (never
    // innerHTML with data). Error and empty states match the server render.
    // A sequence number drops responses from an older click.
    const buildRefreshOnclick = (restletUrl, shellUrl) => {
        if (!restletUrl) return '';
        const lbl = {};
        const emp = {};
        RANGES.forEach((r) => { lbl[r.range] = r.calls; emp[r.range] = r.empty; });
        const placeJs = buildPlaceCallOnclick(shellUrl);
        const redialJs = shellUrl
            ? buildShellCallJs(shellUrl,
                "{entityId:String(r.companyId||''),entityName:String(r.companyName||'')," +
                "entityType:r.companyId?'customer':'',phone:String(r.phone||'')}")
            : '';
        // Closure-based onclick (NOT a setAttribute string) so `r` is
        // captured at row-build time.
        const bindCallJs = (v) => (redialJs
            ? v + ".onclick=function(){" + redialJs + "};"
            : v + ".disabled=true;" + v + ".title='Phone unavailable';");
        return "var rg=this.getAttribute('data-range')||'today';" +
            "var box=document.getElementById('ctc-pl-calls');if(!box)return;" +
            "var mb=document.getElementById('ctc-pl-missed');" +
            "var seq=String((parseInt(box.getAttribute('data-seq'),10)||0)+1);box.setAttribute('data-seq',seq);" +
            "var LBL=" + JSON.stringify(lbl) + ",EMP=" + JSON.stringify(emp) + ",SR=" + JSON.stringify(STATUS_RULES) +
                ",DC=" + JSON.stringify(DIR_CHIP) + ",PIN='" + PATH.inbound + "',POUT='" + PATH.outbound + "';" +
            "var ismc=" + MISSED_CALL_JS + ",fph=" + ctcHtml.FORMAT_PHONE_JS + ";" +
            "var NS='http://www.w3.org/2000/svg';" +
            "function el(t,c,x){var e=document.createElement(t);if(c){e.className=c}if(x!=null){e.textContent=x}return e}" +
            "function cell(e){e.setAttribute('role','cell');return e}" +
            "function sv(p,z,sw,cl){var s=document.createElementNS(NS,'svg');s.setAttribute('width',z);s.setAttribute('height',z);s.setAttribute('viewBox','0 0 24 24');" +
                "if(sw){s.setAttribute('fill','none');s.setAttribute('stroke','currentColor');s.setAttribute('stroke-width',sw);s.setAttribute('stroke-linecap','round');s.setAttribute('stroke-linejoin','round')}" +
                "else{s.setAttribute('fill','currentColor')}" +
                "if(cl){s.setAttribute('class',cl)}s.setAttribute('aria-hidden','true');" +
                "var q=document.createElementNS(NS,'path');q.setAttribute('d',p);s.appendChild(q);return s}" +
            "function pad(n){return(n<10?'0':'')+n}" +
            "function setT(id,v){var e=document.getElementById(id);if(e){e.textContent=v}}" +
            "function dsec(r){return Math.max(0,parseInt(r.duration,10)||0)}" +
            "function rule(r){var st=r.callStatus||'';return Object.prototype.hasOwnProperty.call(SR,st)?SR[st]:null}" +
            // Direction icon — mirrors server dirKind + buildDirChipHtml.
            "function dchip(r){var inb=r.direction==='inbound';" +
                "var k=ismc(r)||(inb&&dsec(r)===0)?'missed':(inb?'in':'out');" +
                "var c=el('span','ctc-pl-status-dir ctc-pl-status-dir-'+k);c.setAttribute('role','img');c.setAttribute('aria-label',DC[k].aria);c.title=DC[k].aria;" +
                "c.appendChild(sv(k==='out'?POUT:PIN,12,'2.2',''));return c}" +
            "function tod(r){var dt=r.date?new Date(r.date):null;return r.timeOfDay||(dt&&!isNaN(dt.getTime())?pad(dt.getHours())+':'+pad(dt.getMinutes()):'—')}" +
            "function state(t,s,bc,bt,fn,tg){var g=el('div','ctc-pl-state');g.appendChild(el('span','ctc-pl-state-title',t));g.appendChild(el('span','ctc-pl-state-sub',s));" +
                "if(fn){var k=el('button',bc,bt);k.type='button';k.onclick=fn;g.appendChild(k)}(tg||box).appendChild(g);return g}" +
            "function retry(){" + RETRY_JS + "}" +
            "function setMissed(n){setT('ctc-pl-missed-n',String(n));var R=document.getElementById('ctc-pl-root');" +
                "if(R){if(n){R.classList.remove('ctc-pl-no-missed')}else{R.classList.add('ctc-pl-no-missed')}}}" +
            "function mfail(m){if(!mb)return;mb.textContent='';mb.removeAttribute('aria-busy');" +
                "var g=state(" + JSON.stringify(MISSED_ERROR) + "," + JSON.stringify(ERROR_SUB) + ",'ctc-pl-btn ctc-pl-btn-secondary','Try again',retry,mb);g.title=String(m||'')}" +
            "function fail(m){box.textContent='';box.removeAttribute('aria-busy');" +
                "var g=state('Couldn’t load '+(LBL[rg]||'calls')," + JSON.stringify(ERROR_SUB) + ",'ctc-pl-btn ctc-pl-btn-secondary','Try again',retry);" +
                "g.title=String(m||'');mfail(m)}" +
            // Loading: static skeleton bars, no shimmer.
            "function skel(tg,lb){tg.textContent='';tg.setAttribute('aria-busy','true');" +
                "var sk=el('div','ctc-pl-skel');sk.setAttribute('aria-label',lb);" +
                "['70%','55%','80%','45%'].forEach(function(wd){var l=el('div','ctc-pl-skel-line');l.appendChild(el('span','ctc-pl-skel-bar ctc-pl-skel-short'));var br=el('span','ctc-pl-skel-bar');br.style.width=wd;l.appendChild(br);sk.appendChild(l)});" +
                "tg.appendChild(sk)}" +
            "skel(box,'Loading calls');if(mb){skel(mb,'Loading missed calls')}" +
            "fetch('" + escapeJs(restletUrl) + "',{" +
                "method:'POST',credentials:'same-origin'," +
                "headers:{'Content-Type':'application/json'}," +
                "body:JSON.stringify({action:'getWorkspaceHistory',dateRange:rg,limit:25,includeMissed:true,missedLimit:" + MISSED_LIMIT + "})" +
            "}).then(function(x){return x.json()})" +
            ".then(function(d){" +
                "if(box.getAttribute('data-seq')!==seq)return;" +
                "if(!d||d.error){fail(d&&d.error);return}" +
                "box.textContent='';box.removeAttribute('aria-busy');" +
                "var rows=d.rows||[];" +
                // KPIs — parallels server-side computeStats + buildKpiSubs.
                "var sc=rows.filter(function(r){return r.satisfaction});" +
                "var avg=sc.length?(sc.reduce(function(a,r){return a+r.satisfaction},0)/sc.length).toFixed(1):'—';" +
                "var ts=rows.reduce(function(a,r){return a+dsec(r)},0);" +
                "var tk=rows.filter(function(r){return dsec(r)>0});" +
                "var av=tk.length?Math.round(ts/tk.length):0;" +
                // One missed count for the KPI sub-line and the badge — mirrors
                // server missedCountOf.
                "var md=d.missed;var mok=!!md&&!md.error;var mr=mok?(md.rows||[]):[];" +
                "var ms=mok?Math.max(parseInt(md.total,10)||0,mr.length):rows.filter(ismc).length;" +
                "setT('ctc-pl-kpi-calls',String(rows.length));" +
                "setT('ctc-pl-kpi-calls-sub',ms?ms+' missed':'');" +
                "setT('ctc-pl-kpi-sat',String(avg));" +
                "setT('ctc-pl-kpi-time',String(Math.round(ts/60)));" +
                "setT('ctc-pl-kpi-sat-sub',rows.length?sc.length+' of '+rows.length+' scored':'');" +
                "setT('ctc-pl-kpi-time-sub',tk.length?'Avg '+(av<60?av+' s':Math.floor(av/60)+' min '+(av%60)+' s')+' per call':'');" +
                // Missed tab — mirrors server buildMissedHtml.
                "setMissed(ms);" +
                "if(mb){mb.textContent='';mb.removeAttribute('aria-busy');" +
                    "if(md&&md.error){mfail(md.error)}else{" +
                        "if(!mr.length){state(" + JSON.stringify(MISSED_EMPTY) + ",'','',''," + "null,mb)}" +
                        "mr.forEach(function(r){" +
                            "var row=el('div','ctc-pl-mrow');row.setAttribute('role','listitem');" +
                            "var w=el('span','ctc-pl-mwhen');w.appendChild(dchip(r));w.appendChild(el('span','ctc-pl-mtime',tod(r)));row.appendChild(w);" +
                            "var nm=r.companyName||'';var who=el('span','ctc-pl-mwho');" +
                            "var ph=fph(r.phone);" +
                            "if(nm&&r.companyId){var co=el('a','ctc-pl-mco',nm);co.href='/app/common/entity/custjob.nl?id='+encodeURIComponent(r.companyId);co.title=nm;who.appendChild(co)}" +
                            "else{who.appendChild(el('span','ctc-pl-mco',nm||ph||'Unknown caller'))}" +
                            "who.appendChild(el('span','ctc-pl-msub',nm?(r.contactName||ph||''):(r.contactName||'')));row.appendChild(who);" +
                            "var tx=el('span','ctc-pl-mtext');tx.appendChild(el('span','ctc-pl-mkind',r.voicemail?'Voicemail':'Missed call'));" +
                            "if(r.voicemail&&r.brief){var bb=el('span','ctc-pl-mbrief',r.brief);bb.title=r.brief;tx.appendChild(bb)}row.appendChild(tx);" +
                            "var cb=el('button','ctc-pl-callback');cb.type='button';cb.setAttribute('aria-label','Call back '+(nm||ph||'caller'));" +
                            "cb.appendChild(sv('" + PATH.call + "',13,'',''));cb.appendChild(el('span','','Call back'));" +
                            bindCallJs('cb') +
                            "row.appendChild(cb);mb.appendChild(row)" +
                        "})" +
                    "}" +
                "}" +
                "if(!rows.length){" +
                    "state(EMP[rg]||'No calls in this period'," + JSON.stringify(EMPTY_SUB) + ",'ctc-pl-btn ctc-pl-btn-call','Make a call'," +
                        (placeJs ? "function(){" + placeJs + "}" : "null") + ");return" +
                "}" +
                "var h=el('div','ctc-pl-colhead');h.setAttribute('role','row');" +
                "['Time','Customer','AI brief','Sat','Length'].forEach(function(t,i){var c=el('span',i===4?'ctc-pl-r':'',t);c.setAttribute('role','columnheader');h.appendChild(c)});" +
                "var hc=el('span');hc.setAttribute('role','columnheader');hc.appendChild(el('span','ctc-pl-sr','Actions'));h.appendChild(hc);" +
                "box.appendChild(h);" +
                "rows.forEach(function(r){" +
                    "var row=el('div','ctc-pl-row');row.setAttribute('role','row');" +
                    "var ru=rule(r);" +
                    "var wh=cell(el('span','ctc-pl-when'));wh.appendChild(dchip(r));" +
                    "wh.appendChild(el('span','ctc-pl-time',tod(r)));" +
                    "row.appendChild(wh);" +
                    "var nm=r.companyName||'Unknown';" +
                    "var wo=cell(el('span','ctc-pl-who'));" +
                    "var co=el('a','ctc-pl-company',nm);co.href='/app/common/entity/custjob.nl?id='+encodeURIComponent(r.companyId||'');co.title=nm;wo.appendChild(co);" +
                    "wo.appendChild(el('span','ctc-pl-contact',r.contactName||''));row.appendChild(wo);" +
                    // Brief or status placeholder — mirrors server briefOf.
                    "var bf;if(r.voicemail===true){bf=cell(el('span','ctc-pl-brief ctc-pl-brief-vm'));bf.title=r.brief||'';" +
                        "bf.appendChild(el('span','ctc-pl-mkind','Voicemail'));if(r.brief){bf.appendChild(el('span','ctc-pl-mbrief',r.brief))}}else{" +
                    "var bc=!r.brief&&ru&&ru.chip?ru.chip:'';" +
                    "var bt=r.brief||(ru?ru.text:'—');" +
                    "bf=cell(el('span','ctc-pl-brief'+(r.brief||bc?'':' ctc-pl-brief-muted'),bc?null:bt));bf.title=r.brief||'';" +
                    "if(bc){bf.appendChild(el('span','ctc-pl-status ctc-pl-status-'+bc,bt))}}row.appendChild(bf);" +
                    "var sa=r.satisfaction;var sp=cell(el('span','ctc-pl-sat'));" +
                    "sp.appendChild(el('span','ctc-pl-pill '+(!sa?'ctc-pl-sat-none':sa>=7?'ctc-pl-sat-hi':sa>=5?'ctc-pl-sat-mid':'ctc-pl-sat-low'),sa?String(sa):'—'));row.appendChild(sp);" +
                    // Length dash — mirrors server lenIsDash.
                    "var du=dsec(r);var ld=!!ru&&(ru.len==='dash'||(ru.len==='dashZero'&&du===0));" +
                    "row.appendChild(cell(el('span','ctc-pl-dur',ld?'—':Math.floor(du/60)+':'+pad(du%60))));" +
                    "var ac=cell(el('span','ctc-pl-acts'));" +
                    "var op=el('a','ctc-pl-icon-btn ctc-pl-view-call ctc-pl-press');op.href='/app/crm/calendar/call.nl?id='+encodeURIComponent(r.id||'');" +
                    "op.target='_blank';op.rel='noopener';op.title='Open the Phone Call record';op.setAttribute('aria-label','Open '+nm+' call');" +
                    "op.appendChild(sv('" + PATH.open + "',15,'1.8',''));ac.appendChild(op);" +
                    "var rd=el('button','ctc-pl-icon-btn ctc-pl-redial');rd.type='button';rd.title='Call again';rd.setAttribute('aria-label','Call '+nm+' again');" +
                    "rd.appendChild(sv('" + PATH.call + "',14,'',''));" +
                    bindCallJs('rd') +
                    "ac.appendChild(rd);row.appendChild(ac);" +
                    "box.appendChild(row);" +
                "});" +
            "}).catch(function(e){if(box.getAttribute('data-seq')!==seq)return;fail(e&&e.message)});";
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Formatting helpers (the client rebuilder above mirrors these)
    // ─────────────────────────────────────────────────────────────────────────

    const pad2 = (n) => (n < 10 ? '0' : '') + n;

    const fmtTime = (dateStr) => {
        if (!dateStr) return '';
        // Accept ISO or "M/D/YYYY h:mm AM/PM" formats from NetSuite search
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return String(dateStr).split(' ').slice(-2).join(' ');
        return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    };

    // Call length as m:ss (mono column).
    const fmtLen = (secs) => {
        const s = Math.max(0, parseInt(secs, 10) || 0);
        return Math.floor(s / 60) + ':' + pad2(s % 60);
    };

    const fmtAvg = (secs) => (secs < 60 ? secs + ' s' : Math.floor(secs / 60) + ' min ' + (secs % 60) + ' s');

    const fmtDate = (dateStr) => {
        if (!dateStr) return '';
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

    // AI brief text, or a grey placeholder by call status.
    // `chip` set = render the text as a status chip instead of grey text.
    // A voicemail reads "Voicemail" (+ the brief below): see buildBriefCellHtml.
    const briefOf = (r) => {
        if (r.brief) return { text: r.brief, muted: false, chip: '' };
        const rule = statusRule(r);
        if (!rule) return { text: '—', muted: true, chip: '' };
        return { text: rule.text, muted: !rule.chip, chip: rule.chip || '' };
    };

    const durSecs = (r) => Math.max(0, parseInt(r.duration, 10) || 0);

    // Length shows "—" for Missed, and for No answer when 0 s.
    const lenIsDash = (r) => {
        const rule = statusRule(r);
        return !!rule && (rule.len === 'dash' || (rule.len === 'dashZero' && durSecs(r) === 0));
    };

    // Direction chip kind: 'missed' for a status rule with dir 'missed' (or
    // an inbound call with no talk time), else 'in' / 'out'.
    const dirKind = (r) => {
        const inbound = r.direction === 'inbound';
        if (isMissedCall(r) || (inbound && durSecs(r) === 0)) return 'missed';
        return inbound ? 'in' : 'out';
    };

    // Icon before the time: 20 px circle, 12 px arrow (down-left for in /
    // missed, up-right for out). aria-label + title name the kind.
    const buildDirChipHtml = (r) => {
        const kind = dirKind(r);
        const chip = DIR_CHIP[kind];
        return '<span class="ctc-pl-status-dir ctc-pl-status-dir-' + kind + '" role="img" aria-label="' + chip.aria + '" title="' + chip.aria + '">' +
            strokeSvg(kind === 'out' ? PATH.outbound : PATH.inbound, 12, '2.2') + '</span>';
    };

    const SAT_CLASS = { high: 'ctc-pl-sat-hi', mid: 'ctc-pl-sat-mid', low: 'ctc-pl-sat-low', none: 'ctc-pl-sat-none' };
    const satClass = (sat) => SAT_CLASS[workspaceQueries.satClass(sat)];

    // Avg talk time counts only calls with talk time (duration > 0).
    const buildKpiSubs = (rows, missed) => {
        const scored = rows.filter((r) => r.satisfaction).length;
        const talked = rows.filter((r) => durSecs(r) > 0);
        const totalSec = talked.reduce((a, r) => a + durSecs(r), 0);
        const avg = talked.length ? Math.round(totalSec / talked.length) : 0;
        return {
            calls: missed ? missed + ' missed' : '',
            sat: rows.length ? scored + ' of ' + rows.length + ' scored' : '',
            time: talked.length ? 'Avg ' + fmtAvg(avg) + ' per call' : ''
        };
    };

    // ─────────────────────────────────────────────────────────────────────────
    // HTML builders
    // ─────────────────────────────────────────────────────────────────────────

    const buildCallsColumnHeaderHtml = () => {
        return '<div class="ctc-pl-colhead" role="row">' +
            '<span role="columnheader">Time</span>' +
            '<span role="columnheader">Customer</span>' +
            '<span role="columnheader">AI brief</span>' +
            '<span role="columnheader">Sat</span>' +
            '<span role="columnheader" class="ctc-pl-r">Length</span>' +
            '<span role="columnheader"><span class="ctc-pl-sr">Actions</span></span>' +
        '</div>';
    };

    const buildCallRowHtml = (r, shellUrl) => {
        const time = escapeHtml(r.timeOfDay || fmtTime(r.date) || '—');
        const companyId = encodeURIComponent(r.companyId || '');
        // Standard NetSuite Phone Call record URL — the ctc_ue_transcript_viewer
        // UE script adds the Call Intelligence (transcript + AI summary) panel.
        const callId = encodeURIComponent(r.id || '');
        const companyName = escapeHtml(r.companyName || 'Unknown');
        const contact = escapeHtml(r.contactName || '');
        const brief = briefOf(r);
        const redialOnclick = buildRedialOnclick(shellUrl, r.phone, r.companyId, r.companyName);

        return '<div class="ctc-pl-row" role="row">' +
            '<span class="ctc-pl-when" role="cell">' + buildDirChipHtml(r) +
                '<span class="ctc-pl-time">' + time + '</span></span>' +
            '<span class="ctc-pl-who" role="cell">' +
                '<a class="ctc-pl-company" href="/app/common/entity/custjob.nl?id=' + companyId + '" title="' + companyName + '">' + companyName + '</a>' +
                '<span class="ctc-pl-contact">' + contact + '</span>' +
            '</span>' +
            (r.voicemail === true
                // A voicemail reads "Voicemail", with the AI brief below when present.
                ? '<span class="ctc-pl-brief ctc-pl-brief-vm" role="cell" title="' + escapeHtml(r.brief || '') + '">' +
                    '<span class="ctc-pl-mkind">Voicemail</span>' +
                    (r.brief ? '<span class="ctc-pl-mbrief">' + escapeHtml(r.brief) + '</span>' : '') + '</span>'
                : '<span class="ctc-pl-brief' + (brief.muted ? ' ctc-pl-brief-muted' : '') + '" role="cell" title="' + escapeHtml(r.brief || '') + '">' +
                    (brief.chip
                        ? '<span class="ctc-pl-status ctc-pl-status-' + brief.chip + '">' + escapeHtml(brief.text) + '</span>'
                        : escapeHtml(brief.text)) + '</span>') +
            '<span class="ctc-pl-sat" role="cell"><span class="ctc-pl-pill ' + satClass(r.satisfaction) + '">' +
                escapeHtml(r.satisfaction ? String(r.satisfaction) : '—') + '</span></span>' +
            '<span class="ctc-pl-dur" role="cell">' + escapeHtml(lenIsDash(r) ? '—' : fmtLen(r.duration)) + '</span>' +
            '<span class="ctc-pl-acts" role="cell">' +
                '<a class="ctc-pl-icon-btn ctc-pl-view-call ctc-pl-press" href="/app/crm/calendar/call.nl?id=' + callId + '" target="_blank" rel="noopener"' +
                    ' title="Open the Phone Call record" aria-label="Open ' + companyName + ' call">' + strokeSvg(PATH.open, 15, '1.8') + '</a>' +
                (redialOnclick
                    ? '<button class="ctc-pl-icon-btn ctc-pl-redial" type="button" title="Call again" aria-label="Call ' + companyName + ' again" onclick="' + escapeHtml(redialOnclick) + '">' + callSvg(14) + '</button>'
                    : '<button class="ctc-pl-icon-btn ctc-pl-redial" type="button" disabled title="Phone unavailable" aria-label="Phone unavailable">' + callSvg(14) + '</button>'
                ) +
            '</span>' +
        '</div>';
    };

    // One Missed-tab row: chip + time, customer (or the number), "Voicemail"
    // (with the AI brief when present) or "Missed call", and Call back.
    // The client rebuilder in buildRefreshOnclick mirrors this.
    const buildMissedRowHtml = (r, shellUrl) => {
        const name = r.companyName || '';
        const phone = formatPhone(r.phone);
        const time = escapeHtml(r.timeOfDay || fmtTime(r.date) || '—');
        const whoMain = name && r.companyId
            ? '<a class="ctc-pl-mco" href="/app/common/entity/custjob.nl?id=' + encodeURIComponent(r.companyId) + '" title="' + escapeHtml(name) + '">' + escapeHtml(name) + '</a>'
            : '<span class="ctc-pl-mco">' + escapeHtml(name || phone || 'Unknown caller') + '</span>';
        const whoSub = name ? (r.contactName || phone || '') : (r.contactName || '');
        const callback = buildRedialOnclick(shellUrl, r.phone, r.companyId, r.companyName);
        const label = 'Call back ' + (name || phone || 'caller');
        return '<div class="ctc-pl-mrow" role="listitem">' +
            '<span class="ctc-pl-mwhen">' + buildDirChipHtml(r) + '<span class="ctc-pl-mtime">' + time + '</span></span>' +
            '<span class="ctc-pl-mwho">' + whoMain + '<span class="ctc-pl-msub">' + escapeHtml(whoSub) + '</span></span>' +
            '<span class="ctc-pl-mtext"><span class="ctc-pl-mkind">' + (r.voicemail ? 'Voicemail' : 'Missed call') + '</span>' +
                (r.voicemail && r.brief ? '<span class="ctc-pl-mbrief" title="' + escapeHtml(r.brief) + '">' + escapeHtml(r.brief) + '</span>' : '') +
            '</span>' +
            (callback
                ? '<button class="ctc-pl-callback" type="button" aria-label="' + escapeHtml(label) + '" onclick="' + escapeHtml(callback) + '">' + callSvg(13) + '<span>Call back</span></button>'
                : '<button class="ctc-pl-callback" type="button" disabled title="Phone unavailable" aria-label="Phone unavailable">' + callSvg(13) + '<span>Call back</span></button>') +
        '</div>';
    };

    const buildMissedHtml = (opts, refreshOnclick) => {
        if (opts.missedError) {
            return buildStateHtml(MISSED_ERROR, ERROR_SUB,
                refreshOnclick ? '<button class="ctc-pl-btn ctc-pl-btn-secondary" type="button" onclick="' + escapeHtml(RETRY_JS) + '">Try again</button>' : '',
                ' title="' + escapeHtml(opts.missedError) + '"');
        }
        const rows = opts.missedRows || [];
        if (!rows.length) return buildStateHtml(MISSED_EMPTY, '', '');
        return rows.map((r) => buildMissedRowHtml(r, opts.shellUrl || '')).join('');
    };

    const buildStateHtml = (title, sub, buttonHtml, extraAttrs) => {
        return '<div class="ctc-pl-state"' + (extraAttrs || '') + '>' +
            '<span class="ctc-pl-state-title">' + escapeHtml(title) + '</span>' +
            '<span class="ctc-pl-state-sub">' + escapeHtml(sub) + '</span>' +
            (buttonHtml || '') +
        '</div>';
    };

    const buildChipsHtml = (restletUrl) => {
        return '<div class="ctc-pl-seg" role="group" aria-label="Period">' +
            RANGES.map((c, i) => {
                const active = i === 0;
                const cls = 'ctc-pl-chip' + (active ? ' ctc-pl-chip-active' : '');
                // Without the RESTlet a period switch cannot load data.
                return restletUrl
                    ? '<button class="' + cls + '" type="button" data-range="' + c.range + '" aria-pressed="' + active + '" onclick="' + escapeHtml(buildChipOnclick(c.range)) + '">' + c.label + '</button>'
                    : '<button class="' + cls + '" type="button" data-range="' + c.range + '" aria-pressed="' + active + '" disabled>' + c.label + '</button>';
            }).join('') +
        '</div>';
    };

    // Build a single follow-up row (S2): text, meta line, Dismiss ×, Approve.
    const buildTaskRowHtml = (task, call, restletUrl, callLengths) => {
        const companyName = escapeHtml(call.companyName || 'Unknown');
        const companyId = encodeURIComponent(call.companyId || '');
        const taskText = escapeHtml(task.text || '');
        const due = fmtDate(task.proposedDue);
        const len = callLengths[String(call.id)];
        const approveOnclick = buildTaskActionOnclick('approveProposedTask', task.id, restletUrl);
        const rejectOnclick  = buildTaskActionOnclick('rejectProposedTask',  task.id, restletUrl);
        const meta = [
            '<a class="ctc-pl-task-company" href="/app/common/entity/custjob.nl?id=' + companyId + '">' + companyName + '</a>'
        ];
        if (due) meta.push('due <span class="ctc-pl-task-due">' + escapeHtml(due) + '</span>');
        if (len) meta.push('from a ' + escapeHtml(len) + ' call');

        return '<div class="ctc-pl-task-row" data-row-id="' + escapeHtml(String(task.id)) + '" title="' + escapeHtml(call.brief || '') + '">' +
            '<div class="ctc-pl-task-main">' +
                '<span class="ctc-pl-task-text">' + taskText + '</span>' +
                '<span class="ctc-pl-task-meta">' + meta.join(' · ') + '</span>' +
            '</div>' +
            '<span class="ctc-pl-task-actions">' +
                (rejectOnclick
                    ? '<button class="ctc-pl-reject" type="button" title="Dismiss this suggestion" aria-label="Dismiss: ' + taskText + '" onclick="' + escapeHtml(rejectOnclick) + '">' + strokeSvg(PATH.dismiss, 14, '2') + '</button>'
                    : '<button class="ctc-pl-reject" type="button" disabled title="RESTlet unavailable" aria-label="Dismiss: ' + taskText + '">' + strokeSvg(PATH.dismiss, 14, '2') + '</button>'
                ) +
                (approveOnclick
                    ? '<button class="ctc-pl-approve" type="button" title="Approve — creates a NetSuite Task" onclick="' + escapeHtml(approveOnclick) + '">' + strokeSvg(PATH.approve, 13, '2.2') + 'Approve</button>'
                    : '<button class="ctc-pl-approve" type="button" disabled title="RESTlet unavailable">' + strokeSvg(PATH.approve, 13, '2.2') + 'Approve</button>'
                ) +
            '</span>' +
        '</div>';
    };

    const buildHtml = (opts) => {
        const rows = opts.rows || [];
        const groups = opts.groups || [];
        const totalTasks = opts.totalTasks || 0;
        const stats = opts.stats || {};
        const shellUrl = opts.shellUrl || '';
        const restletUrl = opts.restletUrl || '';
        const reportingUrl = opts.reportingUrl || '';
        const noFollowUps = !!opts.tasksError || !totalTasks;
        const fuNoun = totalTasks === 1 ? 'follow-up' : 'follow-ups';
        const fuCount = escapeHtml(String(totalTasks));
        // Every task with its call, newest first (loadTaskGroups `rank` is
        // the place in its created-DESC search), capped at TASK_LIMIT.
        const flatTasks = [];
        groups.forEach((g) => (g.tasks || []).forEach((t) => flatTasks.push({ task: t, call: g.call || {} })));
        flatTasks.sort((a, b) => (typeof a.task.rank === 'number' && typeof b.task.rank === 'number') ? a.task.rank - b.task.rank : 0);
        flatTasks.splice(TASK_LIMIT);
        const shownTasks = flatTasks.length;
        const allTasksShown = totalTasks <= shownTasks;
        const missedTotal = missedCountOf(opts, rows);

        const placeCallOnclick = buildPlaceCallOnclick(shellUrl);
        const refreshOnclick = buildRefreshOnclick(restletUrl, shellUrl);
        const subs = buildKpiSubs(rows, missedTotal);

        // ── Header: title, period, Reporting Central, Call ──────────────────
        const reportBase = reportingUrl
            ? reportingUrl + (reportingUrl.indexOf('?') >= 0 ? '&' : '?') + 'range='
            : '';
        const fuReportBase = reportingUrl
            ? reportingUrl + (reportingUrl.indexOf('?') >= 0 ? '&' : '?') + 'tab=followups&range='
            : '';
        const reportHtml = reportBase
            ? '<a class="ctc-pl-report" id="ctc-pl-report" href="' + escapeHtml(reportBase + 'today') + '" data-base="' + escapeHtml(reportBase) + '">' +
                '<span class="ctc-pl-report-long">Reporting Central</span><span class="ctc-pl-report-short">Reporting</span>' +
                strokeSvg(PATH.outbound, 13, '2') +
              '</a>'
            : '';
        const callButtonHtml = placeCallOnclick
            ? '<button class="ctc-pl-call-btn" type="button" title="Open the phone" onclick="' + escapeHtml(placeCallOnclick) + '">' + callSvg(13) + 'Call</button>'
            : '<button class="ctc-pl-call-btn ctc-pl-call-btn-disabled" type="button" disabled ' +
              'aria-label="Call (unavailable)" title="Phone mode Suitelet not deployed — check CTC Configuration">' + callSvg(13) + 'Call</button>';

        // ── Calls panel ─────────────────────────────────────────────────────
        let callsHtml;
        if (opts.historyError) {
            callsHtml = buildStateHtml('Couldn’t load today’s calls', ERROR_SUB,
                refreshOnclick ? '<button class="ctc-pl-btn ctc-pl-btn-secondary" type="button" onclick="' + escapeHtml(RETRY_JS) + '">Try again</button>' : '',
                ' title="' + escapeHtml(opts.historyError) + '"');
        } else if (!rows.length) {
            callsHtml = buildStateHtml('No calls yet today', EMPTY_SUB,
                placeCallOnclick ? '<button class="ctc-pl-btn ctc-pl-btn-call" type="button" onclick="' + escapeHtml(placeCallOnclick) + '">Make a call</button>' : '');
        } else {
            callsHtml = buildCallsColumnHeaderHtml() + rows.map((r) => buildCallRowHtml(r, shellUrl)).join('');
        }

        // ── Missed panel ────────────────────────────────────────────────────
        const missedHtml = buildMissedHtml(opts, refreshOnclick);

        // ── Follow-ups panel ────────────────────────────────────────────────
        let tasksHtml;
        if (opts.tasksError) {
            tasksHtml = buildStateHtml('Couldn’t load follow-ups', ERROR_SUB, '', ' title="' + escapeHtml(opts.tasksError) + '"');
        } else {
            const callLengths = {};
            rows.forEach((r) => { if (r.id && r.duration) callLengths[String(r.id)] = fmtLen(r.duration); });
            const taskRows = flatTasks.map((x) => buildTaskRowHtml(x.task, x.call, restletUrl, callLengths));
            const fuReportHtml = fuReportBase
                ? '<a class="ctc-pl-fu-link" id="ctc-pl-fu-report" href="' + escapeHtml(fuReportBase + 'today') + '" data-base="' + escapeHtml(fuReportBase) + '">See all in Reporting Central ↗</a>'
                : '';
            tasksHtml = '<div id="ctc-pl-tasks-container" class="ctc-pl-tasks">' + taskRows.join('') + '</div>' +
                buildStateHtml('All caught up', 'No follow-ups are waiting for you.', '', ' id="ctc-pl-tasks-empty"') +
                '<div class="ctc-pl-fu-foot">' +
                    '<span class="ctc-pl-fu-count">Showing <span class="ctc-pl-fu-shown">' + escapeHtml(String(shownTasks)) + '</span> of ' +
                        '<span class="ctc-pl-fu-n">' + fuCount + '</span> · newest first</span>' +
                    fuReportHtml +
                '</div>';
        }

        const bulkOnclick = buildBulkApproveOnclick(restletUrl);
        const approveAllHtml = '<button class="ctc-pl-approve-all" type="button"' +
            (bulkOnclick ? ' onclick="' + escapeHtml(bulkOnclick) + '"' : ' disabled') +
            '>Approve all <span class="ctc-pl-fu-shown">' + escapeHtml(String(shownTasks)) + '</span></button>';

        // ── Follow-up bar (hidden at 0 by the root class) ───────────────────
        const fuBarHtml = opts.tasksError ? '' :
            '<div class="ctc-pl-fubar">' +
                strokeSvg(PATH.followUp, 16, '1.8', 'ctc-pl-fubar-icon') +
                '<span class="ctc-pl-fubar-text"><strong><span class="ctc-pl-fu-n">' + fuCount + '</span> <span class="ctc-pl-fu-noun">' + fuNoun + '</span></strong> ' +
                    '<span class="ctc-pl-fubar-long">are waiting for you</span>' +
                    '<span class="ctc-pl-fubar-short">to review</span>' +
                '</span>' +
                '<button class="ctc-pl-review" type="button" onclick="' + escapeHtml(buildTabOnclick('tasks')) + '">Review</button>' +
            '</div>';

        const refreshHtml = refreshOnclick
            ? '<button id="ctc-pl-refresh" type="button" hidden aria-hidden="true" tabindex="-1" data-range="today" onclick="' + escapeHtml(refreshOnclick) + '">Refresh</button>'
            : '';

        const FONT = ctcFonts.FONT_STACK;
        const MONO = ctcFonts.MONO_STACK;

        return `<style>
.ctc-pl-root { container-type: inline-size; container-name: ctcpl; font-family: ${FONT}; color: #161513; font-size: 13px; line-height: 1.4; background: #FFFFFF; padding-bottom: 14px; -webkit-font-smoothing: antialiased; }
.ctc-pl-root *, .ctc-pl-root *::before, .ctc-pl-root *::after { box-sizing: border-box; }
.ctc-pl-root a { color: #1B6097; text-decoration: none; }
.ctc-pl-root a:hover { color: #345D7E; }
.ctc-pl-root button { font-family: inherit; margin: 0; cursor: pointer; transition: transform 140ms ease-out, background-color 120ms ease, box-shadow 120ms ease, opacity 120ms ease; }
.ctc-pl-root button:active:not(:disabled), .ctc-pl-root .ctc-pl-press:active { transform: scale(0.97); }
.ctc-pl-root button:disabled { opacity: 0.4; cursor: not-allowed; }
.ctc-pl-root button:focus-visible, .ctc-pl-root a:focus-visible { outline: none; box-shadow: 0 0 0 2px #FFFFFF, 0 0 0 4px #74C0FC; }
.ctc-pl-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
#ctc-pl-refresh { display: none !important; }

/* Header */
.ctc-pl-head { display: flex; align-items: center; flex-wrap: wrap; gap: 12px 16px; padding: 18px 22px 14px; }
.ctc-pl-title { margin: 0; font-size: 15px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.2; color: #161513; }
.ctc-pl-seg { display: inline-flex; padding: 2px; border-radius: 8px; background: #F4F2EE; }
.ctc-pl-chip { height: 28px; padding: 0 11px; border: 0; border-radius: 6px; background: transparent; font-size: 12.5px; font-weight: 500; color: #5C5955; }
.ctc-pl-chip:hover:not(:disabled) { color: #161513; }
.ctc-pl-chip.ctc-pl-chip-active { background: #FFFFFF; box-shadow: 0 1px 2px rgba(22,21,19,0.10); color: #161513; }
.ctc-pl-spacer { flex: 1; }
.ctc-pl-report { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 500; white-space: nowrap; }
.ctc-pl-report-short { display: none; }
.ctc-pl-call-btn { height: 32px; padding: 0 12px 0 10px; border: 0; border-radius: 8px; background: #0F1B30; color: #FFFFFF; display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 600; }
.ctc-pl-call-btn:hover:not(:disabled) { background: #1B2A44; }
.ctc-pl-call-btn svg { color: #14B981; display: block; }

/* KPI strip: flat, hairline dividers */
.ctc-pl-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 0 22px; border-radius: 10px; background: #FAFAF8; box-shadow: inset 0 0 0 1px #F1EFEA; }
.ctc-pl-kpi { padding: 14px 18px; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.ctc-pl-kpi + .ctc-pl-kpi { box-shadow: inset 1px 0 0 #F1EFEA; }
.ctc-pl-kpi-label { font-size: 12px; color: #5C5955; }
.ctc-pl-kpi-val { display: flex; align-items: baseline; gap: 6px; }
.ctc-pl-kpi-num { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.15; font-variant-numeric: tabular-nums; color: #161513; }
.ctc-pl-kpi-unit { font-size: 12px; color: #5C5955; }
.ctc-pl-kpi-sub { font-size: 11.5px; color: #5C5955; min-height: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ctc-pl-kpi-sub.ctc-pl-kpi-sub-missed { color: #D9553F; }

/* Tabs */
.ctc-pl-tabs { display: flex; align-items: flex-end; gap: 24px; padding: 16px 22px 0; box-shadow: inset 0 -1px 0 #F1EFEA; }
.ctc-pl-tab { padding: 0 0 10px; border: 0; border-radius: 0; background: transparent; font-size: 13.5px; font-weight: 400; line-height: 1.3; color: #5C5955; display: inline-flex; align-items: center; gap: 6px; }
.ctc-pl-root .ctc-pl-tab:active { transform: none; }
.ctc-pl-tab:hover { color: #161513; }
.ctc-pl-tab.ctc-pl-tab-active { font-weight: 600; color: #161513; box-shadow: inset 0 -2px 0 #161513; }
.ctc-pl-badge { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: #FFF3D6; color: #8A5A00; font-size: 11px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; }
.ctc-pl-badge.ctc-pl-badge-missed { background: #FCE9E7; color: #9A3A2C; }
.ctc-pl-no-missed .ctc-pl-badge-missed { display: none; }
.ctc-pl-root .ctc-pl-approve-all { display: none; margin: 0 0 8px auto; height: 28px; padding: 0 10px; border: 0; border-radius: 7px; background: #FFFFFF; box-shadow: inset 0 0 0 1px #D9D5CF; font-size: 12.5px; font-weight: 500; color: #161513; align-items: center; gap: 4px; }
.ctc-pl-approve-all:hover:not(:disabled) { background: #F7F6F3; }
.ctc-pl-root.ctc-pl-show-tasks .ctc-pl-approve-all { display: inline-flex; }

/* Panels (class on the root picks one) */
.ctc-pl-panel { padding: 4px 10px 0; }
#ctc-pl-tab-tasks, #ctc-pl-tab-missed { display: none; }
.ctc-pl-show-tasks #ctc-pl-tab-today, .ctc-pl-show-missed #ctc-pl-tab-today { display: none; }
.ctc-pl-show-tasks #ctc-pl-tab-tasks { display: block; }
.ctc-pl-show-missed #ctc-pl-tab-missed { display: block; }
.ctc-pl-show-tasks .ctc-pl-fubar { display: none; }

/* Calls table */
.ctc-pl-colhead, .ctc-pl-row { display: grid; grid-template-columns: 80px minmax(0, 1.3fr) minmax(0, 1.7fr) 56px 64px 80px; gap: 14px; align-items: center; }
.ctc-pl-colhead { padding: 10px 12px; font-size: 11.5px; color: #5C5955; }
.ctc-pl-r { text-align: right; }
.ctc-pl-row { min-height: 56px; padding: 6px 12px; border-radius: 8px; transition: background-color 120ms ease; }
.ctc-pl-row:hover { background: #F7F6F3; }
.ctc-pl-when { display: flex; align-items: center; gap: 8px; }
/* Direction icon before the time (In / Out / Missed): 20 px circle, 12 px arrow */
.ctc-pl-status-dir { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 20px; height: 20px; border-radius: 999px; }
.ctc-pl-status-dir svg { display: block; flex: none; }
.ctc-pl-status-dir-in { background: #E8F3FC; color: #1B6097; }
.ctc-pl-status-dir-out { background: #F1EFEA; color: #5C5955; }
.ctc-pl-status-dir-missed { background: #FCE9E7; color: #9A3A2C; }
.ctc-pl-time { font-size: 13px; color: #5C5955; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ctc-pl-who { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.ctc-pl-company { font-size: 13.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ctc-pl-contact { font-size: 12px; color: #5C5955; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ctc-pl-contact:empty { display: none; }
.ctc-pl-brief { font-size: 13px; line-height: 1.45; color: #2E2C29; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.ctc-pl-brief-muted { color: #8B8780; }
.ctc-pl-brief.ctc-pl-brief-vm { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.ctc-pl-status { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11.5px; font-weight: 600; line-height: 1.4; }
.ctc-pl-status-missed { background: #FCE9E7; color: #9A3A2C; }
.ctc-pl-status-quiet { background: #F1EFEA; color: #5C5955; }
.ctc-pl-pill { display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 999px; font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
.ctc-pl-sat-hi { background: #E3F5EC; color: #0E6B45; }
.ctc-pl-sat-mid { background: #FFF3D6; color: #8A5A00; }
.ctc-pl-sat-low { background: #FCE9E7; color: #9A2A23; }
.ctc-pl-sat-none { background: #F4F2EE; color: #8B8780; }
.ctc-pl-dur { font-family: ${MONO}; font-size: 12px; text-align: right; font-variant-numeric: tabular-nums; color: #161513; }
.ctc-pl-acts { display: flex; justify-content: flex-end; gap: 2px; opacity: 0.35; transition: opacity 120ms ease; }
.ctc-pl-row:hover .ctc-pl-acts, .ctc-pl-row:focus-within .ctc-pl-acts { opacity: 1; }
.ctc-pl-icon-btn { position: relative; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 8px; background: transparent; display: inline-flex; align-items: center; justify-content: center; }
.ctc-pl-icon-btn::after { content: ""; position: absolute; inset: -4px; }
.ctc-pl-icon-btn svg { display: block; }
.ctc-pl-root a.ctc-pl-view-call { color: #5C5955; transition: transform 140ms ease-out, background-color 120ms ease; }
.ctc-pl-root a.ctc-pl-view-call:hover { background: #EFEDE8; color: #161513; }
.ctc-pl-redial { background: rgba(20,185,129,0.10); color: #0E7A4F; }
.ctc-pl-redial:hover:not(:disabled) { background: rgba(20,185,129,0.18); }

/* States: empty, loading (static skeleton), error */
.ctc-pl-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; min-height: 168px; padding: 16px; text-align: center; }
.ctc-pl-state-title { font-size: 13.5px; font-weight: 500; }
.ctc-pl-state-sub { font-size: 12px; color: #5C5955; }
.ctc-pl-state-sub:empty { display: none; }
.ctc-pl-btn { height: 30px; padding: 0 12px; border: 0; border-radius: 8px; font-size: 12px; font-weight: 600; }
.ctc-pl-btn-call { background: #0F1B30; color: #FFFFFF; }
.ctc-pl-btn-call:hover:not(:disabled) { background: #1B2A44; }
.ctc-pl-btn-secondary { background: transparent; box-shadow: inset 0 0 0 1px #C9C5BE; color: #161513; font-weight: 500; }
.ctc-pl-btn-secondary:hover:not(:disabled) { background: #F7F6F3; }
.ctc-pl-skel { display: flex; flex-direction: column; gap: 12px; min-height: 168px; padding: 18px 12px; }
.ctc-pl-skel-line { display: flex; align-items: center; gap: 10px; }
.ctc-pl-skel-bar { display: block; height: 10px; border-radius: 4px; background: #F1EFEA; }
.ctc-pl-skel-short { width: 40px; flex: none; }

/* Follow-ups */
.ctc-pl-task-row { display: flex; align-items: center; gap: 14px; padding: 12px; border-bottom: 1px solid #F7F6F3; overflow: hidden; transition: opacity 200ms ease-out, height 200ms ease-out 120ms, padding 200ms ease-out 120ms; }
.ctc-pl-task-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.ctc-pl-task-text { font-size: 13.5px; font-weight: 500; }
.ctc-pl-task-meta { font-size: 12px; color: #5C5955; }
.ctc-pl-root a.ctc-pl-task-company { color: #5C5955; }
.ctc-pl-root a.ctc-pl-task-company:hover { color: #345D7E; text-decoration: underline; }
.ctc-pl-task-actions { display: flex; align-items: center; gap: 6px; flex: none; }
.ctc-pl-reject { width: 32px; height: 32px; padding: 0; border: 0; border-radius: 8px; background: transparent; color: #8B8780; display: inline-flex; align-items: center; justify-content: center; }
.ctc-pl-reject:hover:not(:disabled) { background: #F4F2EE; color: #5C5955; }
.ctc-pl-approve { height: 32px; padding: 0 12px; border: 0; border-radius: 8px; background: #345D7E; color: #FFFFFF; font-size: 12.5px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }
.ctc-pl-approve:hover:not(:disabled) { background: #2B4D69; }
.ctc-pl-reject svg, .ctc-pl-approve svg { display: block; }
.ctc-pl-task-row.ctc-pl-task-leaving { opacity: 0; height: 0 !important; padding-top: 0; padding-bottom: 0; border-bottom-color: transparent; pointer-events: none; }
#ctc-pl-tasks-empty { display: none; }
.ctc-pl-fu-foot { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; padding: 10px 12px 0; font-size: 12px; color: #5C5955; }
.ctc-pl-fu-all .ctc-pl-fu-count { display: none; }
.ctc-pl-root a.ctc-pl-fu-link { font-weight: 500; }

/* Missed tab */
.ctc-pl-mrow { display: grid; grid-template-columns: 80px minmax(0, 1.2fr) minmax(0, 1.6fr) auto; gap: 14px; align-items: center; min-height: 56px; padding: 6px 12px; border-radius: 8px; transition: background-color 120ms ease; }
.ctc-pl-mrow:hover { background: #F7F6F3; }
.ctc-pl-mwhen { display: flex; align-items: center; gap: 8px; }
.ctc-pl-mtime { font-size: 13px; color: #5C5955; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ctc-pl-mwho, .ctc-pl-mtext { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.ctc-pl-mco { font-size: 13.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ctc-pl-msub, .ctc-pl-mbrief { font-size: 12px; color: #5C5955; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ctc-pl-msub:empty { display: none; }
.ctc-pl-mkind { font-size: 13px; color: #2E2C29; }
.ctc-pl-callback { height: 30px; padding: 0 10px; border: 0; border-radius: 8px; background: rgba(20,185,129,0.10); color: #0E7A4F; font-size: 12.5px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.ctc-pl-callback:hover:not(:disabled) { background: rgba(20,185,129,0.18); }
.ctc-pl-callback svg { display: block; }

/* Follow-up bar */
.ctc-pl-fubar { display: flex; align-items: center; gap: 12px; margin: 10px 22px 4px; padding: 12px 14px; border-radius: 10px; background: #FFFBF0; box-shadow: inset 0 0 0 1px #F4E3B5; }
.ctc-pl-fubar-icon { color: #8A5A00; flex: none; display: block; }
.ctc-pl-fubar-text { flex: 1; font-size: 13px; }
.ctc-pl-fubar-text strong { font-weight: 600; }
.ctc-pl-fubar-long { color: #5C5955; }
.ctc-pl-fubar-short { display: none; }
.ctc-pl-review { height: 30px; padding: 0 12px; border: 0; border-radius: 7px; background: #FFFFFF; box-shadow: inset 0 0 0 1px #E5D3A3; font-size: 12.5px; font-weight: 600; color: #6B4700; }
.ctc-pl-review:hover { background: #FFF6E0; }

/* No follow-ups left: hide count UI, show "All caught up" */
.ctc-pl-root.ctc-pl-no-fu .ctc-pl-approve-all, .ctc-pl-no-fu .ctc-pl-badge.ctc-pl-fu-n, .ctc-pl-no-fu .ctc-pl-fubar { display: none; }
.ctc-pl-no-fu #ctc-pl-tasks-empty { display: flex; }

/* Narrow portlet column */
@container ctcpl (max-width: 560px) {
    .ctc-pl-head { padding: 16px 16px 12px; gap: 10px; }
    .ctc-pl-seg { order: 10; }
    .ctc-pl-report { font-size: 12.5px; gap: 4px; }
    .ctc-pl-report-long { display: none; }
    .ctc-pl-report-short { display: inline; }
    .ctc-pl-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0 16px; }
    .ctc-pl-kpi { padding: 12px 14px; gap: 2px; }
    .ctc-pl-kpi + .ctc-pl-kpi { box-shadow: none; }
    .ctc-pl-kpi:nth-child(2) { box-shadow: inset 1px 0 0 #F1EFEA; }
    .ctc-pl-kpi:nth-child(3) { box-shadow: inset 0 1px 0 #F1EFEA; }
    .ctc-pl-kpi:nth-child(4) { box-shadow: inset 1px 1px 0 #F1EFEA; }
    .ctc-pl-kpi-label { font-size: 11.5px; }
    .ctc-pl-kpi-val { gap: 4px; }
    .ctc-pl-kpi-num { font-size: 19px; letter-spacing: 0; }
    .ctc-pl-kpi-unit, .ctc-pl-kpi-sub { display: none; }
    .ctc-pl-kpi-unit.ctc-pl-kpi-unit-keep { display: inline; font-size: 19px; font-weight: 600; color: #161513; }
    .ctc-pl-tabs { padding: 12px 16px 0; }
    .ctc-pl-panel { padding: 8px 6px 0; }
    .ctc-pl-colhead { display: none; }
    .ctc-pl-row { grid-template-columns: auto auto minmax(0, 1fr) auto auto; grid-template-areas: "dir co co len act" "dir time brief len act"; column-gap: 10px; row-gap: 0; min-height: 48px; padding: 5px 10px; }
    .ctc-pl-when, .ctc-pl-who { display: contents; }
    .ctc-pl-row .ctc-pl-status-dir { grid-area: dir; }
    .ctc-pl-mrow { grid-template-columns: minmax(0, 1fr) auto; column-gap: 10px; row-gap: 2px; min-height: 48px; padding: 6px 10px; }
    .ctc-pl-mwhen, .ctc-pl-mwho, .ctc-pl-mtext { grid-column: 1; }
    .ctc-pl-callback { grid-column: 2; grid-row: 1 / span 3; }
    .ctc-pl-mwho { flex-direction: row; gap: 6px; align-items: baseline; }
    .ctc-pl-fu-foot { padding: 8px 10px 0; }
    .ctc-pl-company { grid-area: co; font-size: 13px; }
    .ctc-pl-time { grid-area: time; font-size: 11.5px; margin-right: -6px; }
    .ctc-pl-time::after { content: "·"; margin-left: 4px; }
    .ctc-pl-brief { grid-area: brief; font-size: 11.5px; line-height: 1.4; color: #5C5955; -webkit-line-clamp: 1; }
    .ctc-pl-contact, .ctc-pl-sat, .ctc-pl-root a.ctc-pl-view-call { display: none; }
    .ctc-pl-dur { grid-area: len; font-size: 11.5px; }
    .ctc-pl-acts { grid-area: act; opacity: 1; }
    .ctc-pl-fubar { margin: 8px 16px 0; padding: 10px 12px; border-radius: 9px; gap: 8px; }
    .ctc-pl-fubar-icon, .ctc-pl-fubar-long { display: none; }
    .ctc-pl-fubar-short { display: inline; }
    .ctc-pl-fubar-text { font-size: 12.5px; color: #6B4700; }
    .ctc-pl-review { height: auto; padding: 0; background: transparent; box-shadow: none; font-weight: 500; }
    .ctc-pl-review:hover { background: transparent; text-decoration: underline; }
}

/* Reduced motion: keep colour and opacity, drop scale and height */
@media (prefers-reduced-motion: reduce) {
    .ctc-pl-root button:active:not(:disabled), .ctc-pl-root .ctc-pl-press:active { transform: none; }
    .ctc-pl-root button, .ctc-pl-root a.ctc-pl-view-call { transition: background-color 120ms ease, opacity 120ms ease; }
    .ctc-pl-task-row { transition: opacity 200ms ease-out; }
    .ctc-pl-task-row.ctc-pl-task-leaving { height: auto !important; padding-top: 12px; padding-bottom: 12px; }
}
</style>

<div class="ctc-pl-root${noFollowUps ? ' ctc-pl-no-fu' : ''}${allTasksShown ? ' ctc-pl-fu-all' : ''}${missedTotal ? '' : ' ctc-pl-no-missed'}" id="ctc-pl-root" data-range="today" data-fu-total="${fuCount}">
    <div class="ctc-pl-head">
        <h2 class="ctc-pl-title">Sales Rep Central</h2>
        ${buildChipsHtml(restletUrl)}
        <span class="ctc-pl-spacer"></span>
        ${reportHtml}
        ${callButtonHtml}
    </div>

    <div class="ctc-pl-kpis">
        <div class="ctc-pl-kpi">
            <span class="ctc-pl-kpi-label">Calls</span>
            <span class="ctc-pl-kpi-val"><span class="ctc-pl-kpi-num" id="ctc-pl-kpi-calls">${escapeHtml(String(stats.callsToday || 0))}</span></span>
            <span class="ctc-pl-kpi-sub ctc-pl-kpi-sub-missed" id="ctc-pl-kpi-calls-sub">${escapeHtml(subs.calls)}</span>
        </div>
        <div class="ctc-pl-kpi">
            <span class="ctc-pl-kpi-label">Satisfaction</span>
            <span class="ctc-pl-kpi-val"><span class="ctc-pl-kpi-num" id="ctc-pl-kpi-sat">${escapeHtml(String(stats.avgSat || '—'))}</span><span class="ctc-pl-kpi-unit">/10</span></span>
            <span class="ctc-pl-kpi-sub" id="ctc-pl-kpi-sat-sub">${escapeHtml(subs.sat)}</span>
        </div>
        <div class="ctc-pl-kpi">
            <span class="ctc-pl-kpi-label">Talk time</span>
            <span class="ctc-pl-kpi-val"><span class="ctc-pl-kpi-num" id="ctc-pl-kpi-time">${escapeHtml(String(stats.talkTimeMinutes || 0))}</span><span class="ctc-pl-kpi-unit ctc-pl-kpi-unit-keep">min</span></span>
            <span class="ctc-pl-kpi-sub" id="ctc-pl-kpi-time-sub">${escapeHtml(subs.time)}</span>
        </div>
        <div class="ctc-pl-kpi">
            <span class="ctc-pl-kpi-label">Follow-ups</span>
            <span class="ctc-pl-kpi-val"><span class="ctc-pl-kpi-num ctc-pl-fu-n" id="ctc-pl-kpi-fu">${fuCount}</span><span class="ctc-pl-kpi-unit">to review</span></span>
            <span class="ctc-pl-kpi-sub"></span>
        </div>
    </div>

    <div class="ctc-pl-tabs" role="tablist" aria-label="Sections">
        <button class="ctc-pl-tab ctc-pl-tab-active" type="button" role="tab" aria-selected="true" data-tab="today" onclick="${escapeHtml(buildTabOnclick('today'))}">Calls</button>
        <button class="ctc-pl-tab" type="button" role="tab" aria-selected="false" data-tab="missed" onclick="${escapeHtml(buildTabOnclick('missed'))}">Missed <span class="ctc-pl-badge ctc-pl-badge-missed" id="ctc-pl-missed-n">${escapeHtml(String(missedTotal))}</span></button>
        <button class="ctc-pl-tab" type="button" role="tab" aria-selected="false" data-tab="tasks" onclick="${escapeHtml(buildTabOnclick('tasks'))}">Follow-ups <span class="ctc-pl-badge ctc-pl-fu-n">${fuCount}</span></button>
        ${approveAllHtml}
    </div>

    <div id="ctc-pl-tab-today" class="ctc-pl-panel" role="tabpanel">
        <div id="ctc-pl-calls" role="table" aria-label="Calls">${callsHtml}</div>
    </div>
    <div id="ctc-pl-tab-missed" class="ctc-pl-panel" role="tabpanel">
        <div id="ctc-pl-missed" role="list" aria-label="Missed calls">${missedHtml}</div>
    </div>
    <div id="ctc-pl-tab-tasks" class="ctc-pl-panel" role="tabpanel">${tasksHtml}</div>

    ${fuBarHtml}
    ${refreshHtml}
</div>`;
    };

    return { render };
});
