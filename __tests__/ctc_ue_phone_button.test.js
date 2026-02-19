import ueScript from 'SuiteScripts/click_to_call/ctc_ue_phone_button';
import url from 'N/url';
import runtime from 'N/runtime';
import log from 'N/log';

jest.mock('N/url');
jest.mock('N/runtime');
jest.mock('N/log');

describe('ctc_ue_phone_button', () => {
    let mockContext;
    let mockForm;
    let mockInlineField;

    beforeEach(() => {
        jest.clearAllMocks();

        url.resolveScript.mockReturnValue('/app/site/hosting/scriptlet.nl?script=1&deploy=1&phone=%2B15551234567&entityId=100&entityName=Acme+Corp');

        mockInlineField = { defaultValue: '' };
        mockForm = {
            addButton: jest.fn(),
            addField: jest.fn().mockReturnValue(mockInlineField)
        };

        mockContext = {
            type: 'view',
            UserEventType: { VIEW: 'view', EDIT: 'edit', CREATE: 'create' },
            form: mockForm,
            newRecord: {
                type: 'customer',
                id: '100',
                getValue: jest.fn()
            }
        };
    });

    const setFieldValues = (values) => {
        mockContext.newRecord.getValue.mockImplementation(({ fieldId }) => values[fieldId] || '');
    };

    describe('beforeLoad', () => {
        it('adds Call button in view mode', () => {
            setFieldValues({ phone: '+15551234567', companyname: 'Acme Corp' });

            ueScript.beforeLoad(mockContext);

            expect(mockForm.addButton).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'custpage_ctc_call',
                    label: '\u{1F4DE} Call'
                })
            );
        });

        it('adds Call button in edit mode', () => {
            mockContext.type = 'edit';
            setFieldValues({ phone: '+15551234567', companyname: 'Acme Corp' });

            ueScript.beforeLoad(mockContext);

            expect(mockForm.addButton).toHaveBeenCalledTimes(1);
        });

        it('skips button for create mode', () => {
            mockContext.type = 'create';
            setFieldValues({ phone: '+15551234567', companyname: 'Acme Corp' });

            ueScript.beforeLoad(mockContext);

            expect(mockForm.addButton).not.toHaveBeenCalled();
        });

        it('skips button when no phone number', () => {
            setFieldValues({ companyname: 'Acme Corp' });

            ueScript.beforeLoad(mockContext);

            expect(mockForm.addButton).not.toHaveBeenCalled();
        });

        it('resolves Suitelet URL with correct params', () => {
            setFieldValues({ phone: '+15551234567', companyname: 'Acme Corp' });

            ueScript.beforeLoad(mockContext);

            expect(url.resolveScript).toHaveBeenCalledWith({
                scriptId: 'customscript_ctc_sl_softphone',
                deploymentId: 'customdeploy_ctc_sl_softphone',
                params: {
                    phone: '+15551234567',
                    entityId: '100',
                    entityName: 'Acme Corp'
                }
            });
        });

        it('uses firstname+lastname for contacts', () => {
            mockContext.newRecord.type = 'contact';
            setFieldValues({ phone: '+15551234567', firstname: 'John', lastname: 'Doe' });

            ueScript.beforeLoad(mockContext);

            expect(url.resolveScript).toHaveBeenCalledWith(
                expect.objectContaining({
                    params: expect.objectContaining({ entityName: 'John Doe' })
                })
            );
        });

        it('button functionName opens popup window', () => {
            setFieldValues({ phone: '+15551234567', companyname: 'Acme Corp' });

            ueScript.beforeLoad(mockContext);

            const call = mockForm.addButton.mock.calls[0][0];
            expect(call.functionName).toContain('window.open(');
            expect(call.functionName).toContain('ctc_softphone');
        });

        it('adds INLINEHTML field for phone icon injection', () => {
            setFieldValues({ phone: '+15551234567', companyname: 'Acme Corp' });

            ueScript.beforeLoad(mockContext);

            expect(mockForm.addField).toHaveBeenCalledWith({
                id: 'custpage_ctc_inline',
                type: 'INLINEHTML',
                label: ' '
            });
        });

        it('INLINEHTML script contains softphone URL and icon injection logic', () => {
            setFieldValues({ phone: '+15551234567', companyname: 'Acme Corp' });

            ueScript.beforeLoad(mockContext);

            const html = mockInlineField.defaultValue;
            expect(html).toContain('<script>');
            expect(html).toContain('ctc-phone-icon');
            expect(html).toContain('ctc_softphone');
            expect(html).toContain('phone_val');
        });

        it('does not add INLINEHTML field when no phone', () => {
            setFieldValues({ companyname: 'Acme Corp' });

            ueScript.beforeLoad(mockContext);

            expect(mockForm.addField).not.toHaveBeenCalled();
        });

        it('logs error when URL resolution fails', () => {
            url.resolveScript.mockImplementation(() => { throw new Error('Not found'); });
            setFieldValues({ phone: '+15551234567', companyname: 'Acme Corp' });

            ueScript.beforeLoad(mockContext);

            expect(log.error).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'CTC UE — Failed to resolve Suitelet URL'
                })
            );
            expect(mockForm.addButton).not.toHaveBeenCalled();
        });
    });
});
