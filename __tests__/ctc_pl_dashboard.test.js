import portlet from 'SuiteScripts/ctc_pl_dashboard';
import url from 'N/url';
import log from 'N/log';
import runtime from 'N/runtime';

jest.mock('N/url');
jest.mock('N/log');
jest.mock('N/runtime');
jest.mock('SuiteScripts/lib/ctc_workspace_queries');

const workspaceQueries = require('SuiteScripts/lib/ctc_workspace_queries');

describe('ctc_pl_dashboard', () => {
    let mockPortlet;
    let params;

    beforeEach(() => {
        jest.clearAllMocks();

        url.resolveScript = jest.fn((opts) => {
            if (opts.scriptId === 'customscript_ctc_sl_workspace') {
                throw new Error('Script not found');
            }
            return '/app/site/hosting/scriptlet.nl?script=99&deploy=1&id=' + opts.scriptId;
        });

        runtime.getCurrentUser = jest.fn().mockReturnValue({ id: 42 });

        workspaceQueries.loadHistoryRows = jest.fn().mockReturnValue({ rows: [], total: 0 });
        workspaceQueries.loadTaskGroups = jest.fn().mockReturnValue({ groups: [], totalTasks: 0 });
        workspaceQueries.computeStats = jest.fn().mockReturnValue({ callsToday: 0, avgSat: '—', talkTimeMinutes: 0 });

        mockPortlet = { title: '', html: '' };
        params = { portlet: mockPortlet };
    });

    describe('render — server-side data load', () => {
        it('sets portlet title to "Sales Rep Central"', () => {
            portlet.render(params);
            expect(mockPortlet.title).toBe('Sales Rep Central');
        });

        it('calls loadHistoryRows with userId and todayOnly=true', () => {
            portlet.render(params);
            expect(workspaceQueries.loadHistoryRows).toHaveBeenCalledWith(expect.objectContaining({
                userId: 42, todayOnly: true, limit: 5
            }));
        });

        it('calls loadTaskGroups with userId and tab=pending', () => {
            portlet.render(params);
            expect(workspaceQueries.loadTaskGroups).toHaveBeenCalledWith(expect.objectContaining({
                userId: 42, tab: 'pending', limit: 5
            }));
        });

        it('renders 4 KPI cards (Calls, Avg Sat, Talk Time, Pending Tasks) with bordered card styling', () => {
            workspaceQueries.computeStats.mockReturnValue({ callsToday: 7, avgSat: '6.4', talkTimeMinutes: 42 });
            workspaceQueries.loadHistoryRows.mockReturnValue({ rows: [{}, {}, {}, {}, {}, {}, {}], total: 7 });
            workspaceQueries.loadTaskGroups.mockReturnValue({ groups: [], totalTasks: 3 });

            portlet.render(params);

            // KPI labels (renamed Calls Today → Calls so it works with chip filters)
            expect(mockPortlet.html).toContain('>Calls<');
            expect(mockPortlet.html).toContain('Avg Satisfaction');
            expect(mockPortlet.html).toContain('Talk Time');
            expect(mockPortlet.html).toContain('Pending Tasks');

            // KPI values rendered, now with stable IDs so chip onclick can update them
            expect(mockPortlet.html).toMatch(/id="ctc-pl-kpi-calls">7</);
            expect(mockPortlet.html).toMatch(/id="ctc-pl-kpi-sat">6\.4</);
            expect(mockPortlet.html).toMatch(/id="ctc-pl-kpi-time">42</);
            // Pending Tasks count uses totalTasks
            expect(mockPortlet.html).toMatch(/ctc-pl-kpi-value">3</);

            // 4-column grid layout
            expect(mockPortlet.html).toContain('grid-template-columns: repeat(4, 1fr)');
        });

        it('uses Oracle Sans font family (matches opportunity-kanban)', () => {
            portlet.render(params);
            expect(mockPortlet.html).toContain('"Oracle Sans"');
        });

        it('shows empty state when no calls today (no emoji icon)', () => {
            portlet.render(params);
            expect(mockPortlet.html).toContain('No calls yet today');
            // Sun emoji was rendering as a corrupted glyph in NetSuite's portlet font — keep text only
            expect(mockPortlet.html).not.toContain('🌅');
        });

        it('shows "caught up" empty state when no pending tasks', () => {
            portlet.render(params);
            expect(mockPortlet.html).toContain('All caught up');
        });
    });

    describe('iframe-discard survival — interactivity via inline onclick attributes only', () => {
        beforeEach(() => portlet.render(params));

        it('Place a Call button has inline onclick that opens softphoneUrl', () => {
            expect(mockPortlet.html).toMatch(/<button class="ctc-pl-call-btn"[^>]*onclick="window\.open\(/);
            expect(mockPortlet.html).toContain('customscript_ctc_sl_softphone');
            expect(mockPortlet.html).toContain('ctc_softphone');
        });

        it('Place a Call button is icon-only (no visible "Place a Call" text label)', () => {
            // Icon-only: button contains a phone SVG inside ctc-pl-call-icon span,
            // and provides accessible name via aria-label / title attributes
            expect(mockPortlet.html).toMatch(/<button class="ctc-pl-call-btn"[^>]*aria-label="Place a Call"/);
            expect(mockPortlet.html).toMatch(/<button class="ctc-pl-call-btn"[^>]*title="Place a Call"/);
            expect(mockPortlet.html).toMatch(/<span class="ctc-pl-call-icon"[^>]*><svg [^>]*><path d='[^']+'\/><\/svg><\/span>\s*<\/button>/);
        });

        it('both tab buttons have inline onclick that toggles display via classList + querySelectorAll', () => {
            expect(mockPortlet.html).toMatch(/data-tab="today"[^>]*onclick="[^"]*classList\.add\(&#39;ctc-pl-tab-active&#39;\)/);
            expect(mockPortlet.html).toMatch(/data-tab="tasks"[^>]*onclick="[^"]*classList\.add\(&#39;ctc-pl-tab-active&#39;\)/);
            expect(mockPortlet.html).toContain('querySelectorAll(&#39;.ctc-pl-tab&#39;)');
        });

        it('NEVER uses addEventListener anywhere in the rendered HTML', () => {
            expect(mockPortlet.html).not.toContain('addEventListener');
        });

        it('NEVER includes a large inline <script> block (only HTML + style + onclick attrs)', () => {
            const scripts = mockPortlet.html.match(/<script[\s>][\s\S]*?<\/script>/g) || [];
            expect(scripts).toEqual([]);
        });

        it('NEVER references an external <script src>', () => {
            expect(mockPortlet.html).not.toContain('<script src');
        });
    });

    describe('per-row inline onclick handlers', () => {
        beforeEach(() => {
            workspaceQueries.loadHistoryRows.mockReturnValue({
                rows: [
                    { id: '500', date: '5/13/2026 10:42', companyId: '224', companyName: 'Abbott Inc.',
                      phone: '(281) 797-0761', brief: 'Quote requested', satisfaction: 7, duration: 106,
                      callStatus: 'Transcribed' }
                ],
                total: 1
            });
            workspaceQueries.loadTaskGroups.mockReturnValue({
                groups: [
                    {
                        call: { id: '500', companyName: 'Abbott Inc.', brief: 'Quote requested', satisfaction: 7 },
                        tasks: [
                            { id: '1001', text: 'Send brochure', status: 'Pending' },
                            { id: '1002', text: 'Schedule demo', status: 'Pending' }
                        ]
                    }
                ],
                totalTasks: 2
            });
            workspaceQueries.computeStats.mockReturnValue({ callsToday: 1, avgSat: '7.0', talkTimeMinutes: 2 });
            portlet.render(params);
        });

        it('View-Call icon links to the Phone Call record (opens transcript + AI summary panel via ctc_ue_transcript_viewer)', () => {
            // Each row has a 📋 icon linking to /app/crm/calendar/call.nl?id=<callId>
            expect(mockPortlet.html).toMatch(/<a class="ctc-pl-view-call" href="\/app\/crm\/calendar\/call\.nl\?id=/);
            expect(mockPortlet.html).toContain('target="_blank"');
            expect(mockPortlet.html).toContain('📋');
        });

        it('Redial button has inline onclick with phone + entityId baked into softphone URL', () => {
            expect(mockPortlet.html).toMatch(/<button class="ctc-pl-redial"[^>]*onclick="window\.open\(/);
            // encodeURIComponent leaves ( and ) unencoded but encodes spaces as %20
            expect(mockPortlet.html).toContain('phone=(281)%20797-0761');
            expect(mockPortlet.html).toContain('entityId=224');
            expect(mockPortlet.html).toContain('entityType=customer');
        });

        it('Approve button has inline onclick that fetches approveProposedTask with task ID', () => {
            expect(mockPortlet.html).toMatch(/<button class="ctc-pl-approve"[^>]*onclick="[^"]*fetch\(/);
            expect(mockPortlet.html).toContain('approveProposedTask');
            expect(mockPortlet.html).toContain('customscript_ctc_rl_token');
            expect(mockPortlet.html).toContain('taskId:&#39;1001&#39;');
        });

        it('Reject button has inline onclick that fetches rejectProposedTask', () => {
            expect(mockPortlet.html).toMatch(/<button class="ctc-pl-reject"[^>]*onclick="[^"]*fetch\(/);
            expect(mockPortlet.html).toContain('rejectProposedTask');
        });

        it('inline approve onclick disables both approve and reject siblings while fetch is in-flight', () => {
            expect(mockPortlet.html).toContain('b.disabled=true');
            expect(mockPortlet.html).toContain('sib.disabled=true');
        });

        it('inline approve onclick has .catch handler so failures surface visibly (not silent)', () => {
            expect(mockPortlet.html).toMatch(/\.catch\(function\(e\)\{alert\(&#39;Approve error/);
        });

        it('renders all 2 task rows in the group with separate onclick handlers per task ID', () => {
            expect(mockPortlet.html).toContain('taskId:&#39;1001&#39;');
            expect(mockPortlet.html).toContain('taskId:&#39;1002&#39;');
        });

        it('renders the AI nudge strip with task count when totalTasks > 0', () => {
            expect(mockPortlet.html).toContain('pending follow-up');
            expect(mockPortlet.html).toMatch(/<strong>2<\/strong> pending follow-up/);
        });
    });

    describe('failure-safe rendering when URLs are missing', () => {
        it('renders Place a Call as disabled with warning when softphoneUrl is empty', () => {
            url.resolveScript = jest.fn((opts) => {
                if (opts.scriptId === 'customscript_ctc_sl_softphone') throw new Error('not deployed');
                if (opts.scriptId === 'customscript_ctc_sl_workspace') throw new Error('not deployed');
                return '/app/site/hosting/scriptlet.nl?script=99&id=' + opts.scriptId;
            });

            portlet.render(params);

            expect(mockPortlet.html).toContain('ctc-pl-call-btn-disabled');
            expect(mockPortlet.html).toContain('unavailable');
            expect(mockPortlet.html).toContain('Softphone Suitelet not deployed');
        });

        it('renders approve/reject as disabled when restletUrl is empty', () => {
            url.resolveScript = jest.fn((opts) => {
                if (opts.scriptId === 'customscript_ctc_rl_token') throw new Error('not deployed');
                if (opts.scriptId === 'customscript_ctc_sl_workspace') throw new Error('skip');
                return '/scriptlet.nl?id=' + opts.scriptId;
            });
            workspaceQueries.loadTaskGroups.mockReturnValue({
                groups: [{ call: { id: '500', companyName: 'Test' }, tasks: [{ id: '1001', text: 'Task' }] }],
                totalTasks: 1
            });

            portlet.render(params);

            expect(mockPortlet.html).toMatch(/<button class="ctc-pl-approve"[^>]*disabled/);
        });

        it('no longer renders the portlet footer at all (both Workspace and Activities links removed)', () => {
            portlet.render(params);
            expect(mockPortlet.html).not.toContain('Open Workspace');
            expect(mockPortlet.html).not.toContain('View Activities');
            expect(mockPortlet.html).not.toContain('ctc-pl-footer');
        });

        it('shows error message when history fetch errors', () => {
            workspaceQueries.loadHistoryRows.mockReturnValue({
                rows: [], total: 0, error: 'Permission denied'
            });

            portlet.render(params);

            expect(mockPortlet.html).toContain('Failed to load today');
            expect(mockPortlet.html).toContain('Permission denied');
        });
    });

    describe('layout + styling', () => {
        beforeEach(() => portlet.render(params));

        it('uses NetSuite blue (#345D7E) for the Call button', () => {
            expect(mockPortlet.html).toContain('#345D7E');
            expect(mockPortlet.html).not.toContain('#14B981'); // Aircall green should be gone
        });

        it('aligns header with button left and 4-KPI grid right (auto + 1fr columns)', () => {
            expect(mockPortlet.html).toContain('grid-template-columns: auto 1fr');
            expect(mockPortlet.html).toContain('ctc-pl-kpis');
        });

        it('renders column headers for Today\'s Calls list', () => {
            workspaceQueries.loadHistoryRows.mockReturnValue({
                rows: [{ id: '500', date: '5/13/2026 10:42', companyId: '224', companyName: 'Abbott Inc.',
                         phone: '(281) 797-0761', brief: 'Quote requested', satisfaction: 7, duration: 106 }],
                total: 1
            });
            portlet.render(params);
            expect(mockPortlet.html).toContain('ctc-pl-colhead-calls');
            expect(mockPortlet.html).toContain('>Time<');
            expect(mockPortlet.html).toContain('>Company<');
            expect(mockPortlet.html).toContain('>AI Brief<');
        });

        it('renders Pending Tasks as a flat table with column headers matching the Calls tab style', () => {
            workspaceQueries.loadTaskGroups.mockReturnValue({
                groups: [{ call: { id: '500', companyName: 'Test' }, tasks: [{ id: '1', text: 'Task' }] }],
                totalTasks: 1
            });
            portlet.render(params);
            // Column header present, parallel to Calls
            expect(mockPortlet.html).toContain('ctc-pl-colhead');
            expect(mockPortlet.html).toContain('ctc-pl-colhead-tasks');
            expect(mockPortlet.html).toContain('>Company<');
            expect(mockPortlet.html).toContain('>AI Action Item<');
            expect(mockPortlet.html).toContain('>Due<');
            // No grouped-card wrapper anymore
            expect(mockPortlet.html).not.toContain('ctc-pl-task-group');
        });

        it('flattens tasks across calls into one row per task (no per-call grouping)', () => {
            workspaceQueries.loadTaskGroups.mockReturnValue({
                groups: [{
                    call: { id: '4932', companyId: '6084', companyName: 'Brocus Industrial', brief: 'Burt confirmed reorder' },
                    tasks: [
                        { id: '1', text: 'Send quote', proposedDue: '2026-05-16' },
                        { id: '2', text: 'Follow up on expansion', proposedDue: '2026-05-20' }
                    ]
                }],
                totalTasks: 2
            });
            portlet.render(params);
            // Two separate task rows, each with the company linked
            const rowMatches = mockPortlet.html.match(/<div class="ctc-pl-task-row"[^>]*data-row-id="/g) || [];
            expect(rowMatches).toHaveLength(2);
            expect(mockPortlet.html).toContain('Send quote');
            expect(mockPortlet.html).toContain('Follow up on expansion');
        });

        it('links each task row company to the customer record (parity with Today\'s Calls)', () => {
            workspaceQueries.loadTaskGroups.mockReturnValue({
                groups: [{
                    call: { id: '4932', companyId: '6084', companyName: 'Brocus Industrial' },
                    tasks: [{ id: '1', text: 'Send quote', proposedDue: '2026-05-16' }]
                }],
                totalTasks: 1
            });
            portlet.render(params);
            expect(mockPortlet.html).toMatch(/<a class="ctc-pl-task-company" href="\/app\/common\/entity\/custjob\.nl\?id=6084">Brocus Industrial<\/a>/);
        });

        it('shows due date inline per row (no separate DUE label needed)', () => {
            workspaceQueries.loadTaskGroups.mockReturnValue({
                groups: [{
                    call: { id: '4932', companyId: '6084', companyName: 'Test' },
                    tasks: [{ id: '1', text: 'Send quote', proposedDue: '2026-05-16' }]
                }],
                totalTasks: 1
            });
            portlet.render(params);
            expect(mockPortlet.html).toMatch(/<span class="ctc-pl-task-due">May 16<\/span>/);
        });

        it('approve and reject are compact icon-only buttons (✓ / ✗) — no text labels', () => {
            workspaceQueries.loadTaskGroups.mockReturnValue({
                groups: [{
                    call: { id: '4932', companyId: '6084', companyName: 'Test' },
                    tasks: [{ id: '1', text: 'Task' }]
                }],
                totalTasks: 1
            });
            portlet.render(params);
            // ✓ icon only — no "Approve" text label inside the button
            expect(mockPortlet.html).toMatch(/<button class="ctc-pl-approve"[^>]*>✓<\/button>/);
            expect(mockPortlet.html).toMatch(/<button class="ctc-pl-reject"[^>]*>✗<\/button>/);
            // Tooltips still explain the action
            expect(mockPortlet.html).toMatch(/<button class="ctc-pl-approve"[^>]*title="Approve/);
        });

        it('shows call brief as row tooltip (context available on hover, not visually duplicated)', () => {
            workspaceQueries.loadTaskGroups.mockReturnValue({
                groups: [{
                    call: { id: '4932', companyId: '6084', companyName: 'Test', brief: 'Burt confirmed reorder' },
                    tasks: [{ id: '1', text: 'Send quote' }]
                }],
                totalTasks: 1
            });
            portlet.render(params);
            expect(mockPortlet.html).toMatch(/<div class="ctc-pl-task-row"[^>]*title="Burt confirmed reorder"/);
        });

        it('includes today and tasks tab placeholders', () => {
            expect(mockPortlet.html).toContain('id="ctc-pl-tab-today"');
            expect(mockPortlet.html).toContain('id="ctc-pl-tab-tasks"');
        });

        it('marks today tab active by default', () => {
            expect(mockPortlet.html).toMatch(/class="ctc-pl-tab ctc-pl-tab-active"[^>]*data-tab="today"/);
        });
    });

    describe('date filter chips (Today\'s Calls)', () => {
        beforeEach(() => portlet.render(params));

        it('renders four chips: Today (default active), Yesterday, This Week, Last Week', () => {
            expect(mockPortlet.html).toContain('class="ctc-pl-chips"');
            expect(mockPortlet.html).toMatch(/class="ctc-pl-chip ctc-pl-chip-active"[^>]*data-range="today"/);
            expect(mockPortlet.html).toMatch(/class="ctc-pl-chip"[^>]*data-range="yesterday"/);
            expect(mockPortlet.html).toMatch(/class="ctc-pl-chip"[^>]*data-range="thisweek"/);
            expect(mockPortlet.html).toMatch(/class="ctc-pl-chip"[^>]*data-range="lastweek"/);
        });

        it('each chip onclick fetches getWorkspaceHistory with the matching dateRange', () => {
            expect(mockPortlet.html).toContain('dateRange:&#39;today&#39;');
            expect(mockPortlet.html).toContain('dateRange:&#39;yesterday&#39;');
            expect(mockPortlet.html).toContain('dateRange:&#39;thisweek&#39;');
            expect(mockPortlet.html).toContain('dateRange:&#39;lastweek&#39;');
        });

        it('chip onclick rebuilds rows via createElement (no innerHTML on dynamic content)', () => {
            expect(mockPortlet.html).toContain('document.createElement');
        });

        // Regression: the chip-rebuilt redial button used to use rd.setAttribute('onclick', ...)
        // with `r.phone` / `r.companyId` baked into the attribute STRING. When the onclick later
        // fired, `r` was not in scope → ReferenceError: r is not defined. The fix replaces the
        // string-based setAttribute with closure-based `rd.onclick = function(){ window.open(u, ...) }`
        // where `u` is computed inside the forEach (so `r.phone` / `r.companyId` are captured by
        // the closure at row-build time, not referenced as identifiers in a deferred attribute).
        it('chip-rebuilt redial does NOT use string-interpolated setAttribute("onclick", ...) (ReferenceError fix)', () => {
            expect(mockPortlet.html).not.toContain('rd.setAttribute(&#39;onclick&#39;');
        });

        it('chip-rebuilt redial uses closure capture (rd.onclick = function)', () => {
            expect(mockPortlet.html).toMatch(/rd\.onclick=function\(\)\{window\.open\(u,/);
        });
    });

    describe('bulk approve UI (Pending Tasks)', () => {
        beforeEach(() => {
            workspaceQueries.loadTaskGroups.mockReturnValue({
                groups: [{
                    call: { id: '4932', companyId: '6084', companyName: 'Brocus' },
                    tasks: [
                        { id: '1', text: 'Task A', proposedDue: '2026-05-16' },
                        { id: '2', text: 'Task B', proposedDue: '2026-05-17' }
                    ]
                }],
                totalTasks: 2
            });
            portlet.render(params);
        });

        it('renders a hidden per-row checkbox on every task row (revealed in bulk-mode)', () => {
            // Each row has its own ☐ checkbox; CSS hides it until container.bulk-mode is set.
            expect(mockPortlet.html).toMatch(/<input type="checkbox" class="ctc-pl-task-check"[^>]*onclick=/);
            // CSS contract: hidden by default, visible in bulk-mode
            expect(mockPortlet.html).toMatch(/\.ctc-pl-task-check\s*\{[^}]*visibility:\s*hidden/);
            expect(mockPortlet.html).toMatch(/\.ctc-pl-tasks-container\.bulk-mode\s+\.ctc-pl-task-check\s*\{[^}]*visibility:\s*visible/);
        });

        it('action bar is hidden by default and shown only when a row is selected', () => {
            // CSS contract — `display:none` baseline, `display:flex` when container has `.has-selection`
            expect(mockPortlet.html).toMatch(/\.ctc-pl-tasks-actionbar\s*\{[^}]*display:\s*none/);
            expect(mockPortlet.html).toMatch(/\.ctc-pl-tasks-container\.has-selection\s+\.ctc-pl-tasks-actionbar\s*\{[^}]*display:\s*flex/);
            // Still renders Approve Selected + Clear buttons (just hidden until needed)
            expect(mockPortlet.html).toContain('✓ Approve Selected');
            expect(mockPortlet.html).toContain('class="ctc-pl-bulk-clear"');
        });

        it('column header uses a 6-column grid (check | Type | Company | AI Action | Due | Approve/Reject)', () => {
            expect(mockPortlet.html).toContain('grid-template-columns: 28px 70px 1.4fr 2.5fr 70px 64px');
        });

        it('renders the Type column in the tasks header + each row (Lead / Prospect / Customer)', () => {
            // Header contains "Type" between the checkbox cell and "Company"
            expect(mockPortlet.html).toMatch(/ctc-pl-colhead-tasks[\s\S]*ctc-pl-colhead-check[\s\S]*<span>Type<\/span>[\s\S]*<span>Company<\/span>/);
            // Each row has a .ctc-pl-task-type cell
            expect(mockPortlet.html).toContain('class="ctc-pl-task-type"');
        });

        it('Select all checkbox lives in the column header, left of Company (not in the action bar)', () => {
            const html = mockPortlet.html;
            expect(html).toContain('id="ctc-pl-select-all"');
            // The master sits inside the column header
            expect(html).toMatch(/ctc-pl-colhead-tasks[\s\S]*id="ctc-pl-select-all"/);
            // Must NOT live INSIDE the action bar element. Slice the rendered HTML
            // to just the action-bar div and confirm select-all isn't there.
            const actionBarStart = html.indexOf('<div class="ctc-pl-tasks-actionbar"');
            const actionBarEnd = html.indexOf('</div>', actionBarStart);
            const actionBarSlice = html.slice(actionBarStart, actionBarEnd);
            expect(actionBarSlice).not.toContain('id="ctc-pl-select-all"');
            // Old wrapper label should be gone
            expect(html).not.toContain('class="ctc-pl-select-all-label"');
        });

        it('action bar is rendered AFTER the task rows (above the AI nudge, below the rows)', () => {
            const html = mockPortlet.html;
            const lastRowIdx = html.lastIndexOf('class="ctc-pl-task-row"');
            const actionBarIdx = html.indexOf('class="ctc-pl-tasks-actionbar"');
            const nudgeIdx = html.indexOf('class="ctc-pl-nudge"');
            expect(lastRowIdx).toBeGreaterThan(-1);
            expect(actionBarIdx).toBeGreaterThan(lastRowIdx);
            expect(nudgeIdx).toBeGreaterThan(actionBarIdx);
        });

        it('Select all + per-row checkboxes are wrapped in #ctc-pl-tasks-container for class-driven visibility', () => {
            expect(mockPortlet.html).toContain('id="ctc-pl-tasks-container"');
        });

        it('Select all onclick toggles bulk-mode on the container (reveals per-row checkboxes)', () => {
            expect(mockPortlet.html).toMatch(/id="ctc-pl-select-all"[^>]*onclick="[^"]*classList\.add\(&#39;bulk-mode&#39;\)/);
            expect(mockPortlet.html).toMatch(/id="ctc-pl-select-all"[^>]*onclick="[^"]*classList\.remove\(&#39;bulk-mode&#39;\)/);
        });

        it('Select all onclick still tags every row with data-bulk-selected (for bulk-approve to find them)', () => {
            expect(mockPortlet.html).toMatch(/id="ctc-pl-select-all"[^>]*onclick="[^"]*data-bulk-selected/);
        });

        it('per-row checkbox onclick syncs data-bulk-selected + recomputes selection count', () => {
            // Row checkbox handler walks up to the .ctc-pl-task-row and toggles the attribute
            expect(mockPortlet.html).toMatch(/ctc-pl-task-check[^>]*onclick="[^"]*data-bulk-selected/);
            expect(mockPortlet.html).toMatch(/ctc-pl-task-check[^>]*onclick="[^"]*ctc-pl-selected-count/);
        });

        it('bulk Approve onclick gathers data-row-id from rows tagged data-bulk-selected', () => {
            expect(mockPortlet.html).toContain('bulkApproveProposedTasks');
            // The bulk approve handler reads attribute-tagged rows, not :checked inputs
            expect(mockPortlet.html).toMatch(/ctc-pl-bulk-approve[\s\S]*data-bulk-selected/);
        });
    });

    describe('AI nudge color (NetSuite blue, not purple)', () => {
        beforeEach(() => {
            workspaceQueries.loadTaskGroups.mockReturnValue({
                groups: [{ call: { id: '1', companyName: 'X' }, tasks: [{ id: '1', text: 'T' }] }],
                totalTasks: 1
            });
            portlet.render(params);
        });

        it('uses NetSuite blue (#345D7E) for the nudge — purple shades are gone', () => {
            expect(mockPortlet.html).toContain('#345D7E');
            // Old purple tones removed
            expect(mockPortlet.html).not.toContain('#6B4C8A');
            expect(mockPortlet.html).not.toContain('#8765B3');
            expect(mockPortlet.html).not.toContain('107, 76, 138');
        });
    });
});
