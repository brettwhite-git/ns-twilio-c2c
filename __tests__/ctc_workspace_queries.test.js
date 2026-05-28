import workspaceQueries from 'SuiteScripts/lib/ctc_workspace_queries';
import search from 'N/search';
import query from 'N/query';

jest.mock('N/search');
jest.mock('N/query');
jest.mock('N/log');

describe('ctc_workspace_queries', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        search.Type = { PHONE_CALL: 'phonecall', CUSTOMER: 'customer' };
        search.Sort = { DESC: 'DESC', ASC: 'ASC' };
        search.createColumn = jest.fn((opts) => opts);
        // N/query SuiteQL runner — return a stable two-customer book by default
        // so loadHistoryRows / loadTaskGroups don't short-circuit on the
        // getBookCustomerIds pre-query. Tests that exercise specific SuiteQL
        // shapes (getBookCounts, runBookEntityQuery) override this with their
        // own mockImplementation.
        query.runSuiteQL = jest.fn().mockReturnValue({
            asMappedResults: () => [{ id: '500' }, { id: '501' }]
        });
    });

    describe('loadHistoryRows', () => {
        it('scopes by book customer-id set (primary OR salesteam) + non-empty call_sid', () => {
            let capturedFilters;
            search.create.mockImplementation((opts) => {
                capturedFilters = opts.filters;
                return { run: () => ({ getRange: () => [] }) };
            });

            workspaceQueries.loadHistoryRows({ userId: 42 });

            // Book customer-id set comes from the SuiteQL getBookCustomerIds
            // pre-query (mocked above to return ['500','501']). N/search is
            // unchanged below this filter — the old `company.salesrep` join
            // would have missed any call to a customer where the rep was
            // secondary on the Sales Team (Burt → Abbott was hidden).
            expect(capturedFilters).toEqual(expect.arrayContaining([
                ['company', 'anyof', ['500', '501']]
            ]));
            // Old narrower filter is gone
            expect(JSON.stringify(capturedFilters)).not.toContain('"company.salesrep"');
            // NOT the old phonecall.assigned filter
            expect(JSON.stringify(capturedFilters)).not.toContain('"assigned","anyof"');
            expect(capturedFilters).toEqual(expect.arrayContaining([
                ['custevent_ctc_call_sid', 'isnotempty', '']
            ]));
        });

        it('applies todayOnly filter', () => {
            let capturedFilters;
            search.create.mockImplementation((opts) => {
                capturedFilters = opts.filters;
                return { run: () => ({ getRange: () => [] }) };
            });

            workspaceQueries.loadHistoryRows({ userId: 42, todayOnly: true });

            expect(capturedFilters).toEqual(expect.arrayContaining([
                ['startdate', 'on', 'today']
            ]));
        });

        it('applies dateRange=yesterday filter', () => {
            let capturedFilters;
            search.create.mockImplementation((opts) => {
                capturedFilters = opts.filters;
                return { run: () => ({ getRange: () => [] }) };
            });

            workspaceQueries.loadHistoryRows({ userId: 42, dateRange: 'yesterday' });

            expect(capturedFilters).toEqual(expect.arrayContaining([
                ['startdate', 'on', 'yesterday']
            ]));
        });

        it('applies dateRange=thisweek filter (uses NetSuite "within" operator)', () => {
            let capturedFilters;
            search.create.mockImplementation((opts) => {
                capturedFilters = opts.filters;
                return { run: () => ({ getRange: () => [] }) };
            });

            workspaceQueries.loadHistoryRows({ userId: 42, dateRange: 'thisweek' });

            expect(capturedFilters).toEqual(expect.arrayContaining([
                ['startdate', 'within', 'thisweek']
            ]));
        });

        it('applies dateRange=lastweek filter', () => {
            let capturedFilters;
            search.create.mockImplementation((opts) => {
                capturedFilters = opts.filters;
                return { run: () => ({ getRange: () => [] }) };
            });

            workspaceQueries.loadHistoryRows({ userId: 42, dateRange: 'lastweek' });

            expect(capturedFilters).toEqual(expect.arrayContaining([
                ['startdate', 'within', 'lastweek']
            ]));
        });

        it('dateRange takes precedence over todayOnly', () => {
            let capturedFilters;
            search.create.mockImplementation((opts) => {
                capturedFilters = opts.filters;
                return { run: () => ({ getRange: () => [] }) };
            });

            workspaceQueries.loadHistoryRows({ userId: 42, dateRange: 'yesterday', todayOnly: true });

            // yesterday wins
            expect(capturedFilters).toEqual(expect.arrayContaining([
                ['startdate', 'on', 'yesterday']
            ]));
            expect(JSON.stringify(capturedFilters)).not.toContain('"on","today"');
        });

        it('applies date-range filters when todayOnly is false', () => {
            let capturedFilters;
            search.create.mockImplementation((opts) => {
                capturedFilters = opts.filters;
                return { run: () => ({ getRange: () => [] }) };
            });

            workspaceQueries.loadHistoryRows({
                userId: 42,
                filters: { dateFrom: '2026-05-01', dateTo: '2026-05-13', satMin: 5, status: 'Transcribed' }
            });

            expect(capturedFilters).toEqual(expect.arrayContaining([
                ['startdate', 'onorafter', '2026-05-01']
            ]));
            expect(capturedFilters).toEqual(expect.arrayContaining([
                ['startdate', 'onorbefore', '2026-05-13']
            ]));
            // String coercion added in Sprint 2a — N/search filter API is
            // typed as string; both '5' and 5 work at runtime but the typed
            // contract is string. Path A @ts-check surfaced this.
            expect(capturedFilters).toEqual(expect.arrayContaining([
                ['custevent_ctc_satisfaction', 'greaterthanorequalto', '5']
            ]));
        });

        it('extracts companyId when getValue returns a plain string (non-joined SELECT — the bug we just fixed)', () => {
            // NetSuite N/search returns SELECT field values as plain string IDs for unjoined columns.
            // Old `extractId` only handled the array shape and silently returned '' for strings —
            // which broke every Call History row's Company link href.
            search.create.mockImplementation(() => ({
                run: () => ({ getRange: () => [{
                    id: '500',
                    getValue: jest.fn((col) => {
                        if (col === 'company') return '6084';  // string, not array
                        if (col === 'phone') return '(555) 432-9911';
                        return '';
                    }),
                    getText: jest.fn((col) => (col === 'company' ? 'Brocus Industrial Supply' : ''))
                }] })
            }));

            const result = workspaceQueries.loadHistoryRows({ userId: 42 });

            expect(result.rows[0].companyId).toBe('6084');
            expect(result.rows[0].companyName).toBe('Brocus Industrial Supply');
            expect(result.rows[0].phone).toBe('(555) 432-9911');
        });

        it('extracts companyId when getValue returns the array shape (joined column path)', () => {
            search.create.mockImplementation(() => ({
                run: () => ({ getRange: () => [{
                    id: '500',
                    getValue: jest.fn((col) => {
                        if (col === 'company') return [{ value: '6084', text: 'Brocus Industrial Supply' }];
                        return '';
                    }),
                    getText: jest.fn(() => '')
                }] })
            }));

            const result = workspaceQueries.loadHistoryRows({ userId: 42 });
            expect(result.rows[0].companyId).toBe('6084');
        });

        it('maps result rows to expected shape', () => {
            search.create.mockImplementation(() => ({
                run: () => ({ getRange: () => [{
                    id: '500',
                    getValue: jest.fn((arg) => {
                        const col = typeof arg === 'string' ? arg : arg.name;
                        const vals = {
                            startdate: '2026-05-13',
                            company: [{ value: '224', text: 'Abbott Inc.' }],
                            phone: '(281) 797-0761',
                            custevent_ctc_ai_brief: 'Quote requested',
                            custevent_ctc_satisfaction: '7',
                            custevent_ctc_duration: '106',
                            custevent_ctc_call_status: 'Transcribed'
                        };
                        return vals[col] !== undefined ? vals[col] : '';
                    }),
                    getText: jest.fn((arg) => {
                        const col = typeof arg === 'string' ? arg : arg.name;
                        return col === 'company' ? 'Abbott Inc.' : '';
                    })
                }] })
            }));

            const result = workspaceQueries.loadHistoryRows({ userId: 42 });

            expect(result.rows).toHaveLength(1);
            expect(result.rows[0]).toEqual(expect.objectContaining({
                id: '500',
                companyId: '224',
                companyName: 'Abbott Inc.',
                phone: '(281) 797-0761',
                brief: 'Quote requested',
                satisfaction: 7,
                duration: 106,
                callStatus: 'Transcribed'
            }));
            expect(result.total).toBe(1);
        });

        it('returns error envelope with empty rows on exception', () => {
            search.create.mockImplementation(() => { throw new Error('boom'); });

            const result = workspaceQueries.loadHistoryRows({ userId: 42 });

            expect(result.error).toBeDefined();
            expect(result.rows).toEqual([]);
            expect(result.total).toBe(0);
        });

        it('enriches rows with entityType via a batched stage lookup against customer (Lead / Prospect / Customer)', () => {
            // search.create is called twice — first for PhoneCall, then for Customer (batched stage lookup).
            // NetSuite rejects `{name:'stage', join:'company'}` from a PhoneCall search, so we do the second
            // round-trip directly against customer.
            let callCount = 0;
            search.create.mockImplementation((opts) => {
                callCount += 1;
                if (callCount === 1) {
                    // PhoneCall search returns 3 rows with different companyIds
                    return {
                        run: () => ({ getRange: () => [
                            { id: '500', getValue: jest.fn((c) => c === 'company' ? '6084' : ''), getText: jest.fn(() => 'Brocus') },
                            { id: '501', getValue: jest.fn((c) => c === 'company' ? '6085' : ''), getText: jest.fn(() => 'Abbott') },
                            { id: '502', getValue: jest.fn((c) => c === 'company' ? '6086' : ''), getText: jest.fn(() => 'Vandelay') }
                        ] })
                    };
                }
                // Second create: customer stage lookup
                expect(opts.type).toBe('customer');
                expect(opts.filters[0][0]).toBe('internalid');
                expect(opts.columns).toContain('stage');
                return {
                    run: () => ({ getRange: () => [
                        { id: '6084', getValue: jest.fn(() => 'LEAD') },
                        { id: '6085', getValue: jest.fn(() => 'CUSTOMER') },
                        { id: '6086', getValue: jest.fn(() => 'PROSPECT') }
                    ] })
                };
            });

            const result = workspaceQueries.loadHistoryRows({ userId: 42 });

            expect(result.rows[0].entityType).toBe('Lead');
            expect(result.rows[1].entityType).toBe('Customer');
            expect(result.rows[2].entityType).toBe('Prospect');
            expect(callCount).toBe(2); // ensure batched lookup actually fired
        });

        it('short-circuits to empty rows when getBookCustomerIds returns no ids', () => {
            // Override the default book mock to return an empty array — N/search
            // `anyof` would reject this anyway, so the function must short-circuit
            // before hitting search.create.
            query.runSuiteQL.mockReturnValue({ asMappedResults: () => [] });
            search.create.mockImplementation(() => { throw new Error('should not call'); });

            const r = workspaceQueries.loadHistoryRows({ userId: 42 });
            expect(r).toEqual({ rows: [], total: 0 });
        });

        it('book-customer-ids pre-query runs the same primary-OR-salesteam SuiteQL as the rest of the codebase', () => {
            let captured;
            query.runSuiteQL.mockImplementation((opts) => {
                captured = opts;
                return { asMappedResults: () => [{ id: '500' }] };
            });
            search.create.mockImplementation(() => ({ run: () => ({ getRange: () => [] }) }));

            workspaceQueries.loadHistoryRows({ userId: 42 });

            const sql = String(captured.query);
            expect(sql).toMatch(/SELECT\s+DISTINCT\s+c\.id/i);
            expect(sql).toMatch(/LEFT\s+JOIN\s+customerSalesTeam\s+cst\s+ON\s+cst\.customer\s*=\s*c\.id/i);
            expect(sql).toMatch(/c\.salesrep\s*=\s*\?\s*OR\s*cst\.employee\s*=\s*\?/i);
            expect(captured.params).toEqual([42, 42]);
        });
    });

    describe('loadTaskGroups', () => {
        // Helper: set up the two-step search mock — first call for phonecall (returns
        // a list of callIds the user owns), second call for proposed_task (the one
        // we want to assert on).
        const setupTwoStepMock = () => {
            const captured = [];
            search.create.mockImplementation((opts) => {
                captured.push(opts);
                if (opts.type === 'phonecall') {
                    return { run: () => ({ getRange: () => [{ id: '500' }, { id: '501' }] }) };
                }
                return { run: () => ({ getRange: () => [] }) };
            });
            search.Type.PHONE_CALL = 'phonecall';
            return captured;
        };

        it('applies pending tab filter', () => {
            const captured = setupTwoStepMock();

            workspaceQueries.loadTaskGroups({ userId: 42, tab: 'pending' });

            // Second search.create call is the proposed_task search; its filters carry the tab
            const flat = JSON.stringify(captured[1].filters);
            expect(flat).toContain('Pending');
        });

        it('applies awaiting tab filter (Approved + task_completed=F)', () => {
            const captured = setupTwoStepMock();

            workspaceQueries.loadTaskGroups({ userId: 42, tab: 'awaiting' });

            const flat = JSON.stringify(captured[1].filters);
            expect(flat).toContain('Approved');
            expect(flat).toContain('custrecord_ctc_pt_task_completed');
        });

        it('scopes to specific phone call when phoneCallId provided', () => {
            let capturedFilters;
            search.create.mockImplementation((opts) => {
                capturedFilters = opts.filters;
                return { run: () => ({ getRange: () => [] }) };
            });

            workspaceQueries.loadTaskGroups({ userId: 42, tab: 'pending', phoneCallId: '500' });

            const flat = JSON.stringify(capturedFilters);
            expect(flat).toContain('"500"');
            expect(flat).not.toContain('phone_call.company.salesrep');
        });

        it('uses two-step query (phonecall lookup then proposed_task filter) to avoid invalid 3-hop join', () => {
            const captured = [];
            search.create.mockImplementation((opts) => {
                captured.push(opts);
                if (opts.type === 'phonecall') {
                    return { run: () => ({ getRange: () => [{ id: '500' }, { id: '501' }] }) };
                }
                return { run: () => ({ getRange: () => [] }) };
            });
            search.Type.PHONE_CALL = 'phonecall';

            workspaceQueries.loadTaskGroups({ userId: 42, tab: 'pending' });

            // Step 1: phonecall search scoped by the SuiteQL book customer-id
            // set (primary OR Sales Team). The old narrower company.salesrep
            // filter is gone — Burt's calls to entities where he's secondary
            // (e.g. Abbott) now flow through to step 2.
            expect(captured[0].type).toBe('phonecall');
            expect(JSON.stringify(captured[0].filters)).toContain('"company","anyof"');
            expect(JSON.stringify(captured[0].filters)).not.toContain('"company.salesrep"');
            // Step 2: proposed_task search filters by phone_call anyof [500, 501]
            expect(captured[1].type).toBe('customrecord_ctc_proposed_task');
            expect(JSON.stringify(captured[1].filters)).toContain('"custrecord_ctc_pt_phone_call"');
            // Never use the invalid 3-hop join
            expect(JSON.stringify(captured)).not.toContain('phone_call.company.salesrep');
        });

        it('short-circuits with empty groups when user has no accessible calls', () => {
            search.create.mockImplementation((opts) => {
                if (opts.type === 'phonecall') {
                    return { run: () => ({ getRange: () => [] }) };  // no calls owned
                }
                return { run: () => ({ getRange: () => [{ /* should NOT be reached */ }] }) };
            });
            search.Type.PHONE_CALL = 'phonecall';

            const result = workspaceQueries.loadTaskGroups({ userId: 42, tab: 'pending' });

            expect(result.groups).toEqual([]);
            expect(result.totalTasks).toBe(0);
        });

        it('extracts companyId from joined column (regression: prevents "224 · ..." ID-prefix bug)', () => {
            const row = {
                id: '1001',
                getValue: jest.fn((arg) => {
                    const col = typeof arg === 'string' ? arg : (arg.name + (arg.join ? '@' + arg.join : ''));
                    const vals = {
                        'custrecord_ctc_pt_phone_call': [{ value: '500', text: 'Call 500' }],
                        'custrecord_ctc_pt_text': 'Test task',
                        'custrecord_ctc_pt_status': [{ value: '1', text: 'Pending' }],
                        'company@custrecord_ctc_pt_phone_call': [{ value: '6084', text: 'Brocus Industrial Supply' }]
                    };
                    return vals[col] !== undefined ? vals[col] : '';
                }),
                getText: jest.fn((arg) => {
                    const col = typeof arg === 'string' ? arg : (arg.name + (arg.join ? '@' + arg.join : ''));
                    if (col === 'company@custrecord_ctc_pt_phone_call') return 'Brocus Industrial Supply';
                    if (col === 'custrecord_ctc_pt_status') return 'Pending';
                    return '';
                })
            };

            search.create.mockImplementation(() => ({
                run: () => ({ getRange: () => [row] })
            }));

            const result = workspaceQueries.loadTaskGroups({ userId: 42, tab: 'pending' });
            expect(result.groups[0].call.companyId).toBe('6084');
            expect(result.groups[0].call.companyName).toBe('Brocus Industrial Supply');
        });

        it('groups results by source phone call', () => {
            const makeRow = (id, callId, text) => ({
                id: id,
                getValue: jest.fn((arg) => {
                    const col = typeof arg === 'string' ? arg : (arg.name + (arg.join ? '@' + arg.join : ''));
                    const vals = {
                        'custrecord_ctc_pt_phone_call': [{ value: callId, text: 'Call ' + callId }],
                        'custrecord_ctc_pt_text': text,
                        'custrecord_ctc_pt_status': [{ value: '1', text: 'Pending' }],
                        'custrecord_ctc_pt_proposed_due': '2026-05-16',
                        'custrecord_ctc_pt_proposed_assignee': [{ value: '42', text: 'Kathryn Glass' }],
                        'custrecord_ctc_pt_task_completed': false,
                        'custrecord_ctc_pt_created_task': '',
                        'company@custrecord_ctc_pt_phone_call': [{ value: '224', text: 'Abbott Inc.' }],
                        'custevent_ctc_ai_brief@custrecord_ctc_pt_phone_call': 'Quote requested',
                        'custevent_ctc_satisfaction@custrecord_ctc_pt_phone_call': '7',
                        'startdate@custrecord_ctc_pt_phone_call': '2026-05-13'
                    };
                    return vals[col] !== undefined ? vals[col] : '';
                })
            });

            search.create.mockImplementation(() => ({
                run: () => ({ getRange: () => [
                    makeRow('1001', '500', 'Send brochure'),
                    makeRow('1002', '500', 'Schedule demo')
                ]})
            }));

            const result = workspaceQueries.loadTaskGroups({ userId: 42, tab: 'pending' });

            expect(result.groups).toHaveLength(1);
            expect(result.groups[0].tasks).toHaveLength(2);
            expect(result.groups[0].call.companyName).toBe('Abbott Inc.');
            expect(result.totalTasks).toBe(2);
        });

        it('returns empty groups gracefully when phonecall lookup throws (no accessible calls)', () => {
            search.create.mockImplementation(() => { throw new Error('boom'); });
            search.Type.PHONE_CALL = 'phonecall';

            const result = workspaceQueries.loadTaskGroups({ userId: 42 });

            // Inner try/catch swallows the phonecall lookup failure → no accessible calls →
            // short-circuit with empty groups (not an error envelope, since the action
            // semantically succeeded — there's just nothing to show).
            expect(result.groups).toEqual([]);
            expect(result.totalTasks).toBe(0);
        });

        it('returns error envelope when the proposed_task search itself throws', () => {
            // First call (phonecall) succeeds, second call (proposed_task) throws
            let callCount = 0;
            search.create.mockImplementation(() => {
                callCount += 1;
                if (callCount === 1) {
                    return { run: () => ({ getRange: () => [{ id: '500' }] }) };
                }
                throw new Error('proposed_task search failed');
            });
            search.Type.PHONE_CALL = 'phonecall';

            const result = workspaceQueries.loadTaskGroups({ userId: 42 });

            expect(result.error).toBeDefined();
            expect(result.groups).toEqual([]);
            expect(result.totalTasks).toBe(0);
        });
    });

    describe('computeStats', () => {
        it('computes callsToday, avgSat, talkTimeMinutes from rows', () => {
            const rows = [
                { satisfaction: 7, duration: 60 },
                { satisfaction: 8, duration: 120 },
                { satisfaction: null, duration: 30 }
            ];

            const stats = workspaceQueries.computeStats(rows);

            expect(stats.callsToday).toBe(3);
            expect(stats.avgSat).toBe('7.5');
            expect(stats.talkTimeMinutes).toBe(4);  // (60+120+30)/60 = 3.5 → rounded to 4
        });

        it('returns "—" for avgSat when no rows have satisfaction', () => {
            const stats = workspaceQueries.computeStats([
                { satisfaction: null, duration: 60 }
            ]);

            expect(stats.avgSat).toBe('—');
        });

        it('handles empty input', () => {
            const stats = workspaceQueries.computeStats([]);

            expect(stats.callsToday).toBe(0);
            expect(stats.avgSat).toBe('—');
            expect(stats.talkTimeMinutes).toBe(0);
        });

        it('handles undefined/null input', () => {
            const stats = workspaceQueries.computeStats(null);
            expect(stats.callsToday).toBe(0);
        });
    });

    // ─── Iteration B Phase 2 — softphone Search tab backend ─────────────────
    // SuiteQL-based: book scope = primary salesrep OR a member of the
    // customer's Sales Team sublist. N/search's `salesteam.employee` join
    // silently returned 0 rows; SuiteQL's customerSalesTeam table is a
    // deterministic schema and the LEFT JOIN expresses the OR natively.
    describe('getSuggestedContacts', () => {
        it('runs a SuiteQL query joining customer LEFT JOIN customerSalesTeam, scoped by salesrep OR cst.employee', () => {
            let captured;
            query.runSuiteQL.mockImplementation((opts) => {
                captured = opts;
                return { asMappedResults: () => [] };
            });

            workspaceQueries.getSuggestedContacts({ userId: 42 });

            expect(captured).toBeDefined();
            const sql = String(captured.query || '');
            expect(sql).toMatch(/FROM\s+customer\s+c/i);
            expect(sql).toMatch(/LEFT\s+JOIN\s+customerSalesTeam\s+cst\s+ON\s+cst\.customer\s*=\s*c\.id/i);
            // Book scope OR — primary salesrep OR sales-team member
            expect(sql).toMatch(/c\.salesrep\s*=\s*\?\s*OR\s*cst\.employee\s*=\s*\?/i);
            // Active only + the three CRM stages
            expect(sql).toMatch(/c\.isInactive\s*=\s*'F'/i);
            expect(sql).toMatch(/c\.stage\s+IN\s*\(\s*'LEAD'\s*,\s*'PROSPECT'\s*,\s*'CUSTOMER'\s*\)/i);
            // userId is parameterized twice (one per OR side)
            expect(captured.params).toEqual([42, 42]);
        });

        it('caps limit at 50 even when caller requests more', () => {
            let captured;
            query.runSuiteQL.mockImplementation((opts) => {
                captured = opts;
                return { asMappedResults: () => [] };
            });

            workspaceQueries.getSuggestedContacts({ userId: 1, limit: 999 });

            expect(String(captured.query)).toMatch(/FETCH FIRST 50 ROWS ONLY/i);
        });

        it('returns error envelope when userId is missing', () => {
            const r = workspaceQueries.getSuggestedContacts({});
            expect(r.error).toBeTruthy();
            expect(r.rows).toEqual([]);
        });

        it('packs each SuiteQL row with id, type, companyName, contactName, phone, email', () => {
            query.runSuiteQL.mockReturnValue({
                asMappedResults: () => [
                    {
                        id: '100',
                        stage: 'PROSPECT',
                        companyname: 'Apex Innovations',
                        firstname: 'Maria',
                        lastname: 'Lopez',
                        phone: '+14155550100',
                        email: 'maria@apex.co',
                        lastmodifieddate: '2026-05-01'
                    }
                ]
            });

            const r = workspaceQueries.getSuggestedContacts({ userId: 1 });
            expect(r.rows[0]).toMatchObject({
                id: '100',
                type: 'prospect',
                companyName: 'Apex Innovations',
                contactName: 'Maria Lopez',
                phone: '+14155550100',
                email: 'maria@apex.co'
            });
        });
    });

    describe('searchOwnedEntities', () => {
        it('returns empty rows for empty query without hitting SuiteQL', () => {
            query.runSuiteQL.mockImplementation(() => { throw new Error('should not call'); });
            const r = workspaceQueries.searchOwnedEntities({ userId: 1, query: '   ' });
            expect(r.rows).toEqual([]);
            expect(r.total).toBe(0);
        });

        it('appends a case-insensitive contains predicate across companyname / firstname / lastname / phone / email', () => {
            let captured;
            query.runSuiteQL.mockImplementation((opts) => {
                captured = opts;
                return { asMappedResults: () => [] };
            });

            workspaceQueries.searchOwnedEntities({ userId: 1, query: 'apex' });

            const sql = String(captured.query);
            expect(sql).toMatch(/LOWER\(c\.companyname\)\s+LIKE\s+\?/i);
            expect(sql).toMatch(/LOWER\(c\.firstname\)\s+LIKE\s+\?/i);
            expect(sql).toMatch(/LOWER\(c\.lastname\)\s+LIKE\s+\?/i);
            expect(sql).toMatch(/LOWER\(c\.phone\)\s+LIKE\s+\?/i);
            expect(sql).toMatch(/LOWER\(c\.email\)\s+LIKE\s+\?/i);
            // userId twice + the same lowercased LIKE pattern five times
            expect(captured.params).toEqual([1, 1, '%apex%', '%apex%', '%apex%', '%apex%', '%apex%']);
        });

        it('narrows stage IN clause when typeFilter is specified', () => {
            let captured;
            query.runSuiteQL.mockImplementation((opts) => {
                captured = opts;
                return { asMappedResults: () => [] };
            });

            workspaceQueries.searchOwnedEntities({ userId: 1, query: 'apex', typeFilter: 'lead' });

            expect(String(captured.query)).toMatch(/c\.stage\s+IN\s*\(\s*'LEAD'\s*\)/i);
        });

        it('book scope includes secondary Sales Team members (the Burt-on-Abbott case)', () => {
            // Mock: SuiteQL returns Abbott once, even though the underlying
            // LEFT JOIN matches both Burt's salesteam row and (if any) the
            // primary's salesteam row — GROUP BY collapses the duplicates.
            let captured;
            query.runSuiteQL.mockImplementation((opts) => {
                captured = opts;
                return { asMappedResults: () => [
                    { id: '224', stage: 'CUSTOMER', companyname: 'Abbott Inc.',
                      firstname: '', lastname: '',
                      phone: '+12817970761', email: '', lastmodifieddate: '2026-05-12' }
                ] };
            });

            const r = workspaceQueries.searchOwnedEntities({ userId: 999, query: 'abbott' });

            const sql = String(captured.query);
            // The OR is what surfaces secondary-team-member entities
            expect(sql).toMatch(/c\.salesrep\s*=\s*\?\s*OR\s*cst\.employee\s*=\s*\?/i);
            expect(r.rows).toHaveLength(1);
            expect(r.rows[0]).toMatchObject({ id: '224', companyName: 'Abbott Inc.' });
        });

        it('returns error envelope when userId is missing', () => {
            const r = workspaceQueries.searchOwnedEntities({ query: 'apex' });
            expect(r.error).toBeTruthy();
        });

    });

    // ─── Iteration B Phase 5 — Recents tab backend ──────────────────────────
    describe('loadHistoryRows — Phase 5 additions', () => {
        it('applies a last-7-days filter when dateRange=last7days', () => {
            let capturedFilters;
            search.create.mockImplementation((opts) => {
                capturedFilters = opts.filters;
                return { run: () => ({ getRange: () => [] }) };
            });

            workspaceQueries.loadHistoryRows({ userId: 42, dateRange: 'last7days' });

            // 'lastweektodate' is NetSuite's relative-date alias closest to "last 7 days"
            expect(capturedFilters).toEqual(expect.arrayContaining([
                ['startdate', 'within', 'lastweektodate']
            ]));
        });

        it('stamps direction=outbound + isMissed=false on each row (Phase 5: outbound-only MVP)', () => {
            search.create.mockImplementation(() => ({
                run: () => ({
                    getRange: () => [{
                        id: '99',
                        getValue: () => '',
                        getText: () => ''
                    }]
                })
            }));

            const r = workspaceQueries.loadHistoryRows({ userId: 1 });

            expect(r.rows[0]).toMatchObject({
                direction: 'outbound',
                isMissed: false
            });
        });
    });

    // ─── Iter B Phase 6 refinements — true book counts for chip badges ─────
    // The empty-state chip counts ("My book 95 / Customer 95 / Prospect 4 /
    // Lead 13") must come from a separate COUNT(DISTINCT) query, not from
    // the displayed-slice rows. Otherwise reps see "My book 30" when their
    // actual book has 112 entities.
    describe('getBookCounts', () => {
        it('runs a single SuiteQL with CASE-counted stages over the customerSalesTeam scope', () => {
            let captured;
            query.runSuiteQL.mockImplementation((opts) => {
                captured = opts;
                return { asMappedResults: () => [
                    { total: 112, customer: 95, prospect: 4, lead: 13 }
                ] };
            });

            const r = workspaceQueries.getBookCounts({ userId: 120 });

            const sql = String(captured.query);
            expect(sql).toMatch(/COUNT\(DISTINCT c\.id\)\s+AS\s+total/i);
            expect(sql).toMatch(/CASE\s+WHEN\s+c\.stage\s*=\s*'CUSTOMER'/i);
            expect(sql).toMatch(/CASE\s+WHEN\s+c\.stage\s*=\s*'PROSPECT'/i);
            expect(sql).toMatch(/CASE\s+WHEN\s+c\.stage\s*=\s*'LEAD'/i);
            expect(sql).toMatch(/LEFT\s+JOIN\s+customerSalesTeam\s+cst\s+ON\s+cst\.customer\s*=\s*c\.id/i);
            expect(sql).toMatch(/c\.salesrep\s*=\s*\?\s*OR\s*cst\.employee\s*=\s*\?/i);
            expect(captured.params).toEqual([120, 120]);

            expect(r).toEqual({ total: 112, customer: 95, prospect: 4, lead: 13 });
        });

        it('returns zero-filled envelope when userId is missing', () => {
            const r = workspaceQueries.getBookCounts({});
            expect(r.error).toBeTruthy();
            expect(r).toMatchObject({ total: 0, customer: 0, prospect: 0, lead: 0 });
        });

        it('coerces SuiteQL string counts to integers', () => {
            // Some NetSuite environments return COUNT() as a string — coerce
            // so the client doesn't render "NaN" in the chip badges.
            query.runSuiteQL.mockReturnValue({
                asMappedResults: () => [{ total: '112', customer: '95', prospect: '4', lead: '13' }]
            });
            const r = workspaceQueries.getBookCounts({ userId: 120 });
            expect(r.total).toBe(112);
            expect(r.customer).toBe(95);
            expect(r.prospect).toBe(4);
            expect(r.lead).toBe(13);
        });
    });

    // ─── Iteration B Phase 6 — in-call account snapshot ─────────────────────
    describe('getAccountSnapshot', () => {
        beforeEach(() => {
            // Provide the extra search types this function uses.
            search.Type = {
                PHONE_CALL: 'phonecall',
                CUSTOMER: 'customer',
                INVOICE: 'invoice',
                OPPORTUNITY: 'opportunity',
                TASK: 'task',
                CALENDAR_EVENT: 'calendarevent'
            };
        });

        it('returns error envelope when entityId is missing', () => {
            const r = workspaceQueries.getAccountSnapshot({});
            expect(r.error).toBeTruthy();
        });

        it('rolls up outstanding invoices: count + sum + avg age', () => {
            search.create.mockImplementation((opts) => {
                if (opts.type === 'invoice' && JSON.stringify(opts.filters).indexOf('CustInvc:A') >= 0) {
                    return {
                        run: () => ({
                            getRange: () => [
                                { getValue: (f) => ({ amountremaining: '500', trandate: '2026-04-01' })[f] || '' },
                                { getValue: (f) => ({ amountremaining: '1500', trandate: '2026-03-01' })[f] || '' }
                            ]
                        })
                    };
                }
                return { run: () => ({ getRange: () => [] }) };
            });

            const r = workspaceQueries.getAccountSnapshot({ entityId: '42' });
            expect(r.outstanding.count).toBe(2);
            expect(r.outstanding.sum).toBe(2000);
            expect(r.outstanding.avgAgeDays).toBeGreaterThanOrEqual(0);
        });

        it('counts + sums open opportunities (excluding Closed Won/Lost)', () => {
            let oppFilters;
            search.create.mockImplementation((opts) => {
                if (opts.type === 'opportunity') {
                    oppFilters = opts.filters;
                    return {
                        run: () => ({
                            getRange: () => [
                                { getValue: () => '50000' },
                                { getValue: () => '74000' }
                            ]
                        })
                    };
                }
                return { run: () => ({ getRange: () => [] }) };
            });

            const r = workspaceQueries.getAccountSnapshot({ entityId: '42' });
            expect(r.openOpps.count).toBe(2);
            expect(r.openOpps.sum).toBe(124000);
            // Filter must exclude Closed Won + Closed Lost statuses
            expect(JSON.stringify(oppFilters)).toContain('Opprtnty:D');
            expect(JSON.stringify(oppFilters)).toContain('Opprtnty:G');
            expect(JSON.stringify(oppFilters)).toContain('noneof');
        });

        it('picks the most-recent invoice for the lastInvoice tile', () => {
            search.create.mockImplementation((opts) => {
                // The "last invoice" query has only the mainline filter (no status filter)
                if (opts.type === 'invoice' && JSON.stringify(opts.filters).indexOf('CustInvc:A') < 0) {
                    return {
                        run: () => ({
                            getRange: () => [{
                                getValue: (f) => ({
                                    trandate: '2026-05-10',
                                    tranid: 'INV-4421',
                                    total: '12800'
                                })[f] || ''
                            }]
                        })
                    };
                }
                return { run: () => ({ getRange: () => [] }) };
            });

            const r = workspaceQueries.getAccountSnapshot({ entityId: '42' });
            expect(r.lastInvoice).toMatchObject({
                docNumber: 'INV-4421',
                amount: 12800
            });
        });

        it('returns null lastInvoice / lastActivity for an entity with no history', () => {
            search.create.mockImplementation(() => ({ run: () => ({ getRange: () => [] }) }));
            const r = workspaceQueries.getAccountSnapshot({ entityId: '42' });
            expect(r.lastInvoice).toBeNull();
            expect(r.lastActivity).toBeNull();
            expect(r.outstanding.count).toBe(0);
            expect(r.openOpps.count).toBe(0);
        });
    });
});
