import viewer from 'SuiteScripts/ctc_ue_transcript_viewer';
import serverWidget from 'N/ui/serverWidget';

jest.mock('N/ui/serverWidget');

describe('ctc_ue_transcript_viewer', () => {

    let mockContext;
    let mockRecord;
    let mockForm;
    let mockField;
    let mockTab;
    let mockHiddenFields;

    const FIELD_VALUES = {
        custevent_ctc_processed: true,
        custevent_ctc_ai_summary: 'Customer asked about pricing. Rep provided quotes. Customer interested in enterprise plan.',
        custevent_ctc_satisfaction: 8,
        custevent_ctc_duration: 185,
        custevent_ctc_tone_keywords: 'interested, positive, engaged',
        custevent_ctc_action_items: 'Send enterprise pricing sheet\nSchedule follow-up demo',
        custevent_ctc_transcript: '[REP] Hello, thanks for calling.<br>[CUSTOMER] Hi, I wanted to ask about pricing.<br>[REP] Sure, let me walk you through our plans.',
        custevent_ctc_recording_url: 'https://api.twilio.com/2010-04-01/Accounts/AC123/Recordings/RE456.mp3'
    };

    beforeEach(() => {
        jest.clearAllMocks();

        mockField = {
            defaultValue: '',
            updateLayoutType: jest.fn(),
            updateBreakType: jest.fn()
        };
        mockTab = { label: 'Custom' };
        mockHiddenFields = {};
        mockForm = {
            addField: jest.fn().mockReturnValue(mockField),
            getTab: jest.fn().mockReturnValue(mockTab),
            getField: jest.fn((opts) => {
                const f = { updateDisplayType: jest.fn() };
                mockHiddenFields[opts.id] = f;
                return f;
            })
        };
        mockRecord = {
            getValue: jest.fn((opts) => FIELD_VALUES[opts.fieldId])
        };
        mockContext = {
            type: 'view',
            UserEventType: { VIEW: 'view', EDIT: 'edit', CREATE: 'create' },
            newRecord: mockRecord,
            form: mockForm
        };

        serverWidget.FieldLayoutType = { OUTSIDEABOVE: 'OUTSIDEABOVE' };
        serverWidget.FieldBreakType = { STARTROW: 'STARTROW' };
        serverWidget.FieldDisplayType = { HIDDEN: 'HIDDEN' };
    });

    describe('beforeLoad guards', () => {
        it('skips CREATE mode', () => {
            mockContext.type = 'create';
            viewer.beforeLoad(mockContext);
            expect(mockForm.addField).not.toHaveBeenCalled();
        });

        it('skips when custevent_ctc_processed is false', () => {
            mockRecord.getValue.mockImplementation((opts) => {
                if (opts.fieldId === 'custevent_ctc_processed') return false;
                return FIELD_VALUES[opts.fieldId];
            });

            viewer.beforeLoad(mockContext);
            expect(mockForm.addField).not.toHaveBeenCalled();
        });

        it('skips when custevent_ctc_processed is empty/null', () => {
            mockRecord.getValue.mockImplementation((opts) => {
                if (opts.fieldId === 'custevent_ctc_processed') return '';
                return FIELD_VALUES[opts.fieldId];
            });

            viewer.beforeLoad(mockContext);
            expect(mockForm.addField).not.toHaveBeenCalled();
        });
    });

    describe('tab rename', () => {
        it('renames Custom tab to Call Intel', () => {
            viewer.beforeLoad(mockContext);
            expect(mockForm.getTab).toHaveBeenCalledWith({ id: 'custom' });
            expect(mockTab.label).toBe('Call Intel');
        });

        it('handles missing custom tab gracefully', () => {
            mockForm.getTab.mockReturnValue(null);
            expect(() => viewer.beforeLoad(mockContext)).not.toThrow();
        });
    });

    describe('field positioning', () => {
        it('sets OUTSIDEABOVE layout type', () => {
            viewer.beforeLoad(mockContext);
            expect(mockField.updateLayoutType).toHaveBeenCalledWith({
                layoutType: 'OUTSIDEABOVE'
            });
        });

        it('sets STARTROW break type', () => {
            viewer.beforeLoad(mockContext);
            expect(mockField.updateBreakType).toHaveBeenCalledWith({
                breakType: 'STARTROW'
            });
        });

        it('includes DOM fallback script', () => {
            viewer.beforeLoad(mockContext);
            expect(mockField.defaultValue).toContain('<script>');
            expect(mockField.defaultValue).toContain('ctc-viewer');
            expect(mockField.defaultValue).toContain('insertBefore');
        });
    });

    describe('panel rendering in VIEW mode', () => {
        it('adds INLINEHTML field to form', () => {
            viewer.beforeLoad(mockContext);

            expect(mockForm.addField).toHaveBeenCalledWith({
                id: 'custpage_ctc_viewer',
                type: 'INLINEHTML',
                label: ' '
            });
        });

        it('sets HTML as field defaultValue', () => {
            viewer.beforeLoad(mockContext);
            expect(mockField.defaultValue).toContain('ctc-viewer');
        });

        it('renders AI summary', () => {
            viewer.beforeLoad(mockContext);
            expect(mockField.defaultValue).toContain('Customer asked about pricing');
        });

        it('renders satisfaction score with color', () => {
            viewer.beforeLoad(mockContext);
            expect(mockField.defaultValue).toContain('#28a745');
            expect(mockField.defaultValue).toContain('>8<');
        });

        it('renders duration', () => {
            viewer.beforeLoad(mockContext);
            expect(mockField.defaultValue).toContain('3m 5s');
        });

        it('renders tone keyword pills', () => {
            viewer.beforeLoad(mockContext);
            expect(mockField.defaultValue).toContain('ctc-pill');
            expect(mockField.defaultValue).toContain('interested');
            expect(mockField.defaultValue).toContain('positive');
            expect(mockField.defaultValue).toContain('engaged');
        });

        it('renders action items in orange quote block', () => {
            viewer.beforeLoad(mockContext);
            expect(mockField.defaultValue).toContain('ctc-action-block');
            expect(mockField.defaultValue).toContain('ctc-action-line');
            expect(mockField.defaultValue).toContain('Send enterprise pricing sheet');
            expect(mockField.defaultValue).toContain('Schedule follow-up demo');
        });

        it('renders transcript lines with speaker classes', () => {
            viewer.beforeLoad(mockContext);
            expect(mockField.defaultValue).toContain('ctc-rep');
            expect(mockField.defaultValue).toContain('ctc-cust');
            expect(mockField.defaultValue).toContain('[REP] Hello, thanks for calling.');
            expect(mockField.defaultValue).toContain('[CUSTOMER] Hi, I wanted to ask about pricing.');
        });

        it('renders recording link', () => {
            viewer.beforeLoad(mockContext);
            expect(mockField.defaultValue).toContain('Download recording');
            expect(mockField.defaultValue).toContain('RE456.mp3');
        });

        it('uses 4-column metrics row with recording link', () => {
            viewer.beforeLoad(mockContext);
            expect(mockField.defaultValue).toContain('ctc-metrics-row');
            expect(mockField.defaultValue).toContain('grid-template-columns: 1fr 1fr 1fr 1fr');
            expect(mockField.defaultValue).toContain('Download recording');
        });
    });

    describe('panel rendering in EDIT mode', () => {
        it('renders panel in EDIT mode', () => {
            mockContext.type = 'edit';
            viewer.beforeLoad(mockContext);
            expect(mockForm.addField).toHaveBeenCalled();
            expect(mockField.defaultValue).toContain('ctc-viewer');
        });

        it('does not hide CRM fields in EDIT mode', () => {
            mockContext.type = 'edit';
            viewer.beforeLoad(mockContext);
            Object.values(mockHiddenFields).forEach((f) => {
                expect(f.updateDisplayType).not.toHaveBeenCalled();
            });
        });
    });

    describe('field hiding in VIEW mode', () => {
        it('hides redundant CRM fields', () => {
            viewer.beforeLoad(mockContext);
            const expectedHidden = [
                'custevent_ctc_ai_summary', 'custevent_ctc_satisfaction',
                'custevent_ctc_tone_keywords', 'custevent_ctc_action_items',
                'custevent_ctc_duration', 'custevent_ctc_recording_url',
                'custevent_ctc_transcript'
            ];
            expectedHidden.forEach((fid) => {
                expect(mockForm.getField).toHaveBeenCalledWith({ id: fid });
                expect(mockHiddenFields[fid].updateDisplayType).toHaveBeenCalledWith({
                    displayType: 'HIDDEN'
                });
            });
        });

        it('handles missing fields gracefully', () => {
            mockForm.getField.mockReturnValue(null);
            expect(() => viewer.beforeLoad(mockContext)).not.toThrow();
        });
    });

    describe('score color coding', () => {
        it('uses red for low scores (1-3)', () => {
            mockRecord.getValue.mockImplementation((opts) => {
                if (opts.fieldId === 'custevent_ctc_satisfaction') return 2;
                return FIELD_VALUES[opts.fieldId];
            });

            viewer.beforeLoad(mockContext);
            expect(mockField.defaultValue).toContain('#dc3545');
            expect(mockField.defaultValue).toContain('Low satisfaction');
        });

        it('uses amber for moderate scores (4-6)', () => {
            mockRecord.getValue.mockImplementation((opts) => {
                if (opts.fieldId === 'custevent_ctc_satisfaction') return 5;
                return FIELD_VALUES[opts.fieldId];
            });

            viewer.beforeLoad(mockContext);
            expect(mockField.defaultValue).toContain('#f0ad4e');
            expect(mockField.defaultValue).toContain('Moderate satisfaction');
        });

        it('uses green for high scores (7-10)', () => {
            viewer.beforeLoad(mockContext);
            expect(mockField.defaultValue).toContain('#28a745');
            expect(mockField.defaultValue).toContain('High satisfaction');
        });
    });

    describe('transcript line splitting', () => {
        it('splits on <br> tags from NetSuite storage', () => {
            viewer.beforeLoad(mockContext);
            expect(mockField.defaultValue).toContain('Transcript (3 lines)');
        });

        it('splits on \\n for fresh data', () => {
            mockRecord.getValue.mockImplementation((opts) => {
                if (opts.fieldId === 'custevent_ctc_transcript') {
                    return '[REP] Hello\n[CUSTOMER] Hi\n[REP] Bye';
                }
                return FIELD_VALUES[opts.fieldId];
            });

            viewer.beforeLoad(mockContext);
            expect(mockField.defaultValue).toContain('Transcript (3 lines)');
        });

        it('handles mixed \\n and <br> separators', () => {
            mockRecord.getValue.mockImplementation((opts) => {
                if (opts.fieldId === 'custevent_ctc_transcript') {
                    return '[REP] Line 1<br>[CUSTOMER] Line 2\n[REP] Line 3<br />[CUSTOMER] Line 4';
                }
                return FIELD_VALUES[opts.fieldId];
            });

            viewer.beforeLoad(mockContext);
            expect(mockField.defaultValue).toContain('Transcript (4 lines)');
        });

        it('handles self-closing <br/> tags', () => {
            mockRecord.getValue.mockImplementation((opts) => {
                if (opts.fieldId === 'custevent_ctc_transcript') {
                    return '[REP] A<br/>[CUSTOMER] B';
                }
                return FIELD_VALUES[opts.fieldId];
            });

            viewer.beforeLoad(mockContext);
            expect(mockField.defaultValue).toContain('Transcript (2 lines)');
        });
    });

    describe('transcript scrolling', () => {
        it('renders all lines without hiding any (scrollable container)', () => {
            const longTranscript = Array.from({ length: 20 }, (_, i) =>
                (i % 2 === 0 ? '[REP]' : '[CUSTOMER]') + ' Line ' + (i + 1)
            ).join('<br>');

            mockRecord.getValue.mockImplementation((opts) => {
                if (opts.fieldId === 'custevent_ctc_transcript') return longTranscript;
                return FIELD_VALUES[opts.fieldId];
            });

            viewer.beforeLoad(mockContext);
            expect(mockField.defaultValue).toContain('Transcript (20 lines)');
            expect(mockField.defaultValue).not.toContain('ctc-hidden');
            expect(mockField.defaultValue).not.toContain('Show all');
            expect(mockField.defaultValue).toContain('max-height: 300px');
            expect(mockField.defaultValue).toContain('overflow-y: auto');
        });
    });

    describe('edge cases', () => {
        it('handles empty summary gracefully', () => {
            mockRecord.getValue.mockImplementation((opts) => {
                if (opts.fieldId === 'custevent_ctc_ai_summary') return '';
                return FIELD_VALUES[opts.fieldId];
            });

            viewer.beforeLoad(mockContext);
            expect(mockField.defaultValue).toContain('No summary available');
        });

        it('handles empty transcript', () => {
            mockRecord.getValue.mockImplementation((opts) => {
                if (opts.fieldId === 'custevent_ctc_transcript') return '';
                return FIELD_VALUES[opts.fieldId];
            });

            viewer.beforeLoad(mockContext);
            expect(mockField.defaultValue).not.toContain('Transcript (');
        });

        it('handles no recording URL', () => {
            mockRecord.getValue.mockImplementation((opts) => {
                if (opts.fieldId === 'custevent_ctc_recording_url') return '';
                return FIELD_VALUES[opts.fieldId];
            });

            viewer.beforeLoad(mockContext);
            expect(mockField.defaultValue).not.toContain('Download recording');
            expect(mockField.defaultValue).toContain('No recording');
        });

        it('omits action items section when empty', () => {
            mockRecord.getValue.mockImplementation((opts) => {
                if (opts.fieldId === 'custevent_ctc_action_items') return '';
                return FIELD_VALUES[opts.fieldId];
            });

            viewer.beforeLoad(mockContext);
            expect(mockField.defaultValue).not.toContain('Send enterprise pricing sheet');
            expect(mockField.defaultValue).not.toMatch(/<div class="ctc-action-block">/);
        });

        it('handles no tone keywords', () => {
            mockRecord.getValue.mockImplementation((opts) => {
                if (opts.fieldId === 'custevent_ctc_tone_keywords') return '';
                return FIELD_VALUES[opts.fieldId];
            });

            viewer.beforeLoad(mockContext);
            expect(mockField.defaultValue).toContain('ctc-muted');
            expect(mockField.defaultValue).toContain('None');
        });
    });

    describe('escapeHtml', () => {
        it('escapes HTML special characters', () => {
            const result = viewer.escapeHtml('<script>alert("xss")</script>');
            expect(result).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
            expect(result).not.toContain('<script>');
        });

        it('escapes ampersands', () => {
            expect(viewer.escapeHtml('A & B')).toBe('A &amp; B');
        });

        it('escapes single quotes', () => {
            expect(viewer.escapeHtml("it's")).toBe('it&#39;s');
        });
    });

    describe('splitLines', () => {
        it('splits on newline', () => {
            expect(viewer.splitLines('a\nb\nc')).toEqual(['a', 'b', 'c']);
        });

        it('splits on <br>', () => {
            expect(viewer.splitLines('a<br>b<br>c')).toEqual(['a', 'b', 'c']);
        });

        it('splits on <br/> and <br />', () => {
            expect(viewer.splitLines('a<br/>b<br />c')).toEqual(['a', 'b', 'c']);
        });

        it('filters empty entries', () => {
            expect(viewer.splitLines('a<br>\n<br>b')).toEqual(['a', 'b']);
        });

        it('handles mixed separators', () => {
            expect(viewer.splitLines('a\nb<br>c<br />d')).toEqual(['a', 'b', 'c', 'd']);
        });
    });
});
