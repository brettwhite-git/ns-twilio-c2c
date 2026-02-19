import clientScript from 'SuiteScripts/click_to_call/ctc_cl_phone_button';
import url from 'N/url';
import currentRecord from 'N/currentRecord';

jest.mock('N/url');
jest.mock('N/currentRecord');

describe('ctc_cl_phone_button', () => {
    let mockRec;
    let mockLabelEl;
    let capturedClickHandler;

    beforeEach(() => {
        jest.clearAllMocks();
        capturedClickHandler = null;

        // Mock DOM globals
        mockLabelEl = {
            querySelector: jest.fn().mockReturnValue(null),
            appendChild: jest.fn()
        };

        const mockBtn = {
            setAttribute: jest.fn(),
            addEventListener: jest.fn((event, handler) => {
                if (event === 'click') capturedClickHandler = handler;
            }),
            style: {}
        };

        global.document = {
            getElementById: jest.fn().mockReturnValue(null),
            createElement: jest.fn().mockReturnValue(mockBtn)
        };

        global.window = {
            open: jest.fn()
        };

        url.resolveScript.mockReturnValue('https://example.com/suitelet');

        mockRec = {
            type: 'customer',
            id: '100',
            getValue: jest.fn()
        };
    });

    afterEach(() => {
        delete global.document;
        delete global.window;
    });

    // --- Helpers ---
    const setFieldValues = (values) => {
        mockRec.getValue.mockImplementation(({ fieldId }) => values[fieldId] || '');
    };

    const setDomTarget = (fieldId) => {
        document.getElementById.mockImplementation((id) => {
            if (id === fieldId + '_fs_lbl_uir_label') return mockLabelEl;
            return null;
        });
    };

    /** Run pageInit and simulate clicking the injected button, then return the resolveScript call args. */
    const initAndClick = () => {
        clientScript.pageInit({ currentRecord: mockRec });
        if (capturedClickHandler) capturedClickHandler();
    };

    // =========================================
    // Entity Name Resolution
    // =========================================

    describe('entity name resolution', () => {
        beforeEach(() => {
            setDomTarget('phone');
        });

        it('uses companyname for customer records', () => {
            setFieldValues({ phone: '+15551234567', companyname: 'Acme Corp' });
            initAndClick();

            expect(url.resolveScript).toHaveBeenCalledWith(
                expect.objectContaining({
                    params: expect.objectContaining({ entityName: 'Acme Corp' })
                })
            );
        });

        it('falls back to firstname+lastname for customer without companyname', () => {
            setFieldValues({ phone: '+15551234567', companyname: '', firstname: 'John', lastname: 'Doe' });
            initAndClick();

            expect(url.resolveScript).toHaveBeenCalledWith(
                expect.objectContaining({
                    params: expect.objectContaining({ entityName: 'John Doe' })
                })
            );
        });

        it('falls back to entityid for customer without name fields', () => {
            setFieldValues({ phone: '+15551234567', companyname: '', firstname: '', lastname: '', entityid: 'CUST-42' });
            initAndClick();

            expect(url.resolveScript).toHaveBeenCalledWith(
                expect.objectContaining({
                    params: expect.objectContaining({ entityName: 'CUST-42' })
                })
            );
        });

        it('uses firstname+lastname for contact records', () => {
            mockRec.type = 'contact';
            setFieldValues({ phone: '+15551234567', firstname: 'Jane', lastname: 'Smith' });
            initAndClick();

            expect(url.resolveScript).toHaveBeenCalledWith(
                expect.objectContaining({
                    params: expect.objectContaining({ entityName: 'Jane Smith' })
                })
            );
        });

        it('falls back to record ID for contact without name', () => {
            mockRec.type = 'contact';
            setFieldValues({ phone: '+15551234567', firstname: '', lastname: '' });
            initAndClick();

            expect(url.resolveScript).toHaveBeenCalledWith(
                expect.objectContaining({
                    params: expect.objectContaining({ entityName: '100' })
                })
            );
        });

        it('uses companyname for lead records', () => {
            mockRec.type = 'lead';
            setFieldValues({ phone: '+15551234567', companyname: 'Lead Inc' });
            initAndClick();

            expect(url.resolveScript).toHaveBeenCalledWith(
                expect.objectContaining({
                    params: expect.objectContaining({ entityName: 'Lead Inc' })
                })
            );
        });
    });

    // =========================================
    // Phone Field Scanning
    // =========================================

    describe('phone field scanning', () => {
        beforeEach(() => {
            setDomTarget('phone');
        });

        it('reads phone and altphone for customer', () => {
            setFieldValues({ phone: '+15551234567', companyname: 'Test' });
            clientScript.pageInit({ currentRecord: mockRec });

            expect(mockRec.getValue).toHaveBeenCalledWith({ fieldId: 'phone' });
            expect(mockRec.getValue).toHaveBeenCalledWith({ fieldId: 'altphone' });
        });

        it('reads phone, altphone, and mobilephone for contact', () => {
            mockRec.type = 'contact';
            setFieldValues({ phone: '+15551234567', firstname: 'J', lastname: 'D' });
            clientScript.pageInit({ currentRecord: mockRec });

            expect(mockRec.getValue).toHaveBeenCalledWith({ fieldId: 'phone' });
            expect(mockRec.getValue).toHaveBeenCalledWith({ fieldId: 'altphone' });
            expect(mockRec.getValue).toHaveBeenCalledWith({ fieldId: 'mobilephone' });
        });

        it('skips fields with empty phone values', () => {
            setFieldValues({ phone: '', companyname: 'Test' });
            clientScript.pageInit({ currentRecord: mockRec });

            expect(document.getElementById).not.toHaveBeenCalled();
        });

        it('does nothing for unknown record types', () => {
            mockRec.type = 'vendor';
            clientScript.pageInit({ currentRecord: mockRec });

            expect(mockRec.getValue).not.toHaveBeenCalled();
        });
    });

    // =========================================
    // DOM Injection
    // =========================================

    describe('DOM injection', () => {
        it('tries multiple selectors to find label element', () => {
            setFieldValues({ phone: '+15551234567', companyname: 'Test' });

            document.getElementById.mockImplementation((id) => {
                if (id === 'phone_fs_lbl') return mockLabelEl;
                return null;
            });

            clientScript.pageInit({ currentRecord: mockRec });

            expect(document.getElementById).toHaveBeenCalledWith('phone_fs_lbl_uir_label');
            expect(document.getElementById).toHaveBeenCalledWith('phone_fs_lbl');
        });

        it('creates a span element with phone icon', () => {
            setDomTarget('phone');
            setFieldValues({ phone: '+15551234567', companyname: 'Test' });

            clientScript.pageInit({ currentRecord: mockRec });

            expect(document.createElement).toHaveBeenCalledWith('span');
        });

        it('skips injection when no DOM target found', () => {
            document.getElementById.mockReturnValue(null);
            document.querySelector = jest.fn().mockReturnValue(null);
            setFieldValues({ phone: '+15551234567', companyname: 'Test' });

            clientScript.pageInit({ currentRecord: mockRec });

            expect(document.createElement).not.toHaveBeenCalled();
        });

        it('prevents duplicate injection via data-ctc-btn marker', () => {
            mockLabelEl.querySelector.mockReturnValue({ exists: true });
            setDomTarget('phone');
            setFieldValues({ phone: '+15551234567', companyname: 'Test' });

            clientScript.pageInit({ currentRecord: mockRec });

            expect(document.createElement).not.toHaveBeenCalled();
        });

        it('appends button to label element', () => {
            setDomTarget('phone');
            setFieldValues({ phone: '+15551234567', companyname: 'Test' });

            clientScript.pageInit({ currentRecord: mockRec });

            expect(mockLabelEl.appendChild).toHaveBeenCalled();
        });
    });

    // =========================================
    // Softphone Popup
    // =========================================

    describe('softphone popup', () => {
        it('resolves Suitelet URL with correct script IDs on click', () => {
            setDomTarget('phone');
            setFieldValues({ phone: '+15551234567', companyname: 'Acme Corp' });
            initAndClick();

            expect(url.resolveScript).toHaveBeenCalledWith({
                scriptId: 'customscript_ctc_sl_softphone',
                deploymentId: 'customdeploy_ctc_sl_softphone',
                params: {
                    phone: '+15551234567',
                    entityId: '100',
                    entityName: 'Acme Corp',
                    entityType: 'customer'
                }
            });
        });

        it('opens popup with correct window name and features', () => {
            setDomTarget('phone');
            setFieldValues({ phone: '+15551234567', companyname: 'Test' });
            initAndClick();

            expect(window.open).toHaveBeenCalledWith(
                'https://example.com/suitelet',
                'ctc_softphone',
                'width=380,height=560,resizable=no,scrollbars=no,toolbar=no,menubar=no,location=no'
            );
        });

        it('passes phone number from field value', () => {
            setDomTarget('phone');
            setFieldValues({ phone: '+18005551234', companyname: 'Test' });
            initAndClick();

            expect(url.resolveScript).toHaveBeenCalledWith(
                expect.objectContaining({
                    params: expect.objectContaining({ phone: '+18005551234' })
                })
            );
        });

        it('passes entity ID from record', () => {
            mockRec.id = '999';
            setDomTarget('phone');
            setFieldValues({ phone: '+15551234567', companyname: 'Test' });
            initAndClick();

            expect(url.resolveScript).toHaveBeenCalledWith(
                expect.objectContaining({
                    params: expect.objectContaining({ entityId: '999' })
                })
            );
        });
    });
});
