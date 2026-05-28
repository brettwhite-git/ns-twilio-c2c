import ctcEntity from 'SuiteScripts/lib/ctc_entity';
import search from 'N/search';

jest.mock('N/search');
jest.mock('N/log');

describe('ctc_entity', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('SOFTPHONE_POPUP constants', () => {
        it('exports versioned popup name', () => {
            expect(ctcEntity.SOFTPHONE_POPUP_NAME).toMatch(/^ctc_softphone_v\d+$/);
        });

        it('exports popup options string with 380×640 dimensions', () => {
            expect(ctcEntity.SOFTPHONE_POPUP_OPTIONS).toContain('width=380');
            expect(ctcEntity.SOFTPHONE_POPUP_OPTIONS).toContain('height=640');
            expect(ctcEntity.SOFTPHONE_POPUP_OPTIONS).toContain('resizable=no');
        });
    });

    // ─── Iteration B Phase 3 — multi-contact picker backend ─────────────────
    describe('getContactsAtEntity', () => {
        it('returns empty array when entityId is falsy', () => {
            const r = ctcEntity.getContactsAtEntity('');
            expect(r).toEqual([]);
        });

        it('filters by company=entityId AND isinactive=F', () => {
            let captured;
            search.create.mockImplementation((opts) => {
                captured = opts;
                return { run: () => ({ getRange: () => [] }) };
            });

            ctcEntity.getContactsAtEntity('100');

            expect(captured.type).toBe('contact');
            expect(captured.filters).toEqual(expect.arrayContaining([
                ['company', 'anyof', '100']
            ]));
            expect(captured.filters).toEqual(expect.arrayContaining([
                ['isinactive', 'is', 'F']
            ]));
        });

        it('selects all four phone columns (work / mobile / home / alt)', () => {
            let captured;
            search.create.mockImplementation((opts) => {
                captured = opts;
                return { run: () => ({ getRange: () => [] }) };
            });

            ctcEntity.getContactsAtEntity('100');

            expect(captured.columns).toEqual(expect.arrayContaining([
                'phone', 'mobilephone', 'homephone', 'altphone'
            ]));
        });

        it('aggregates each contact\'s phones into a phones[] array tagged by type', () => {
            search.create.mockImplementation(() => ({
                run: () => ({
                    getRange: () => [
                        {
                            id: '5001',
                            getValue: (f) => ({
                                firstname: 'Burt',
                                lastname: 'Reynolds',
                                title: 'Purchasing',
                                email: 'burt@brocus.com',
                                phone:       '+17608899821',
                                mobilephone: '+17608899822',
                                homephone:   '',
                                altphone:    ''
                            })[f] || ''
                        }
                    ]
                })
            }));

            const r = ctcEntity.getContactsAtEntity('100');
            expect(r).toHaveLength(1);
            expect(r[0]).toMatchObject({
                contactId: '5001',
                name: 'Burt Reynolds',
                title: 'Purchasing',
                email: 'burt@brocus.com'
            });
            expect(r[0].phones).toEqual([
                { number: '+17608899821', type: 'Work',   isPrimary: true  },
                { number: '+17608899822', type: 'Mobile', isPrimary: false }
            ]);
        });

        it('filters out contacts with zero phones (un-dialable)', () => {
            search.create.mockImplementation(() => ({
                run: () => ({
                    getRange: () => [
                        {
                            id: '1',
                            getValue: (f) => ({ firstname: 'No', lastname: 'Phone' })[f] || ''
                        },
                        {
                            id: '2',
                            getValue: (f) => ({ firstname: 'Has', lastname: 'Phone', phone: '+15551234567' })[f] || ''
                        }
                    ]
                })
            }));

            const r = ctcEntity.getContactsAtEntity('100');
            expect(r).toHaveLength(1);
            expect(r[0].contactId).toBe('2');
        });

        it('returns empty array on search error', () => {
            search.create.mockImplementation(() => { throw new Error('boom'); });
            const r = ctcEntity.getContactsAtEntity('100');
            expect(r).toEqual([]);
        });
    });
});
