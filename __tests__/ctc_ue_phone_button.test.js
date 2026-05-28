import ueScript from 'SuiteScripts/ctc_ue_phone_button';
import url from 'N/url';
import runtime from 'N/runtime';
import log from 'N/log';

jest.mock('N/url');
jest.mock('N/runtime');
jest.mock('N/log');
// U9: phone-button UE now gates on cfg.active. Mock loadConfig so the
// existing test suite (which assumes activation) gets active=true.
jest.mock('SuiteScripts/lib/ctc_config', () => ({
    loadConfig: jest.fn().mockReturnValue({
        accountSid: 'AC_test', apiKeySid: 'SK_test',
        apiSecretId: 'custsecret_ctc_api_key_secret',
        twimlAppSid: 'AP_test', phoneNumber: '+15551234567',
        intelServiceSid: '', active: true
    })
}));
const ctcConfig = require('SuiteScripts/lib/ctc_config');

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
        it('adds Call button in view mode with entity-type label', () => {
            setFieldValues({ phone: '+15551234567', companyname: 'Acme Corp' });

            ueScript.beforeLoad(mockContext);

            expect(mockForm.addButton).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'custpage_ctc_call',
                    label: expect.stringMatching(/Call (Customer|Contact|Lead)/)
                })
            );
        });

        it('injects CSS that promotes Call button to NetSuite blue with white text', () => {
            setFieldValues({ phone: '+15551234567', companyname: 'Acme Corp' });

            ueScript.beforeLoad(mockContext);

            const inlineCall = mockForm.addField.mock.calls.find(
                (c) => c[0].id === 'custpage_ctc_inline'
            );
            expect(inlineCall).toBeDefined();
            const html = mockInlineField.defaultValue;
            expect(html).toContain('#custpage_ctc_call');
            expect(html).toContain('#345D7E');
            expect(html).toContain('color: #FFFFFF');
        });

        it('adds Call button in edit mode', () => {
            mockContext.type = 'edit';
            setFieldValues({ phone: '+15551234567', companyname: 'Acme Corp' });

            ueScript.beforeLoad(mockContext);

            expect(mockForm.addButton).toHaveBeenCalledTimes(1);
            expect(mockForm.addButton).toHaveBeenCalledWith(expect.objectContaining({ id: 'custpage_ctc_call' }));
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

        it('resolves Suitelet URL with correct params including entityType + entryPoint=record', () => {
            setFieldValues({ phone: '+15551234567', companyname: 'Acme Corp' });

            ueScript.beforeLoad(mockContext);

            expect(url.resolveScript).toHaveBeenCalledWith({
                scriptId: 'customscript_ctc_sl_softphone',
                deploymentId: 'customdeploy_ctc_sl_softphone',
                params: {
                    phone: '+15551234567',
                    entityId: '100',
                    entityName: 'Acme Corp',
                    entityType: 'customer',
                    // Iteration B Phase 2: record launches must pass entryPoint=record so
                    // the Suitelet defaults to the Dial tab. Dashboard launches pass
                    // entryPoint=dashboard from the portlet.
                    entryPoint: 'record'
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

        // Iteration B Phase 1: popup is locked to the 380 × 640 emulator size,
        // resize disabled so state changes never grow the window. Constants live
        // in lib/ctc_entity.js; this test pins that the UE actually emits them.
        it('opens popup at the locked 380 × 640 dimensions (Iteration B Phase 1)', () => {
            setFieldValues({ phone: '+15551234567', companyname: 'Acme Corp' });

            ueScript.beforeLoad(mockContext);

            const call = mockForm.addButton.mock.calls[0][0];
            expect(call.functionName).toContain('width=380');
            expect(call.functionName).toContain('height=640');
            expect(call.functionName).toContain('resizable=no');
        });

        // Iteration B Phase 1.5: window.open silently ignores the features
        // string when it reuses a same-named window. We bump the version
        // suffix on the name every time popup dimensions or chrome change,
        // so reps don't see stale popups from before the deploy. This test
        // pins that pattern: any future dimension change requires bumping
        // the version number in lib/ctc_entity.js.
        it('uses a versioned popup name so dimension changes force fresh chrome', () => {
            setFieldValues({ phone: '+15551234567', companyname: 'Acme Corp' });

            ueScript.beforeLoad(mockContext);

            const call = mockForm.addButton.mock.calls[0][0];
            // Match the name argument inside window.open(...). The pattern is:
            //   window.open('url','<name>','features')
            const nameMatch = call.functionName.match(/window\.open\('[^']*','([^']+)','[^']*'\)/);
            expect(nameMatch).toBeTruthy();
            // Name must follow ctc_softphone_v<N> so dimension changes are tied
            // to a version bump in lib/ctc_entity.js.
            expect(nameMatch[1]).toMatch(/^ctc_softphone_v\d+$/);
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

        it('INLINEHTML field carries only the toolbar-button restyle CSS (no field icon script)', () => {
            setFieldValues({ phone: '+15551234567', companyname: 'Acme Corp' });

            ueScript.beforeLoad(mockContext);

            const html = mockInlineField.defaultValue;
            // CSS for the toolbar Call button
            expect(html).toContain('<style>');
            expect(html).toContain('#custpage_ctc_call');
            // Field-level icon injection was removed in favor of the toolbar button alone
            expect(html).not.toContain('ctc-phone-icon');
            expect(html).not.toContain('phone_val');
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

    describe('beforeLoad — U9 active-flag gate', () => {
        it('does NOT add the phone button when cfg.active is false (fresh install before wizard activates)', () => {
            ctcConfig.loadConfig.mockReturnValueOnce({
                accountSid: '', apiKeySid: '', apiSecretId: '',
                twimlAppSid: '', phoneNumber: '', intelServiceSid: '',
                active: false
            });
            setFieldValues({ phone: '+15551234567', companyname: 'Acme Corp' });

            ueScript.beforeLoad(mockContext);

            expect(mockForm.addButton).not.toHaveBeenCalled();
            expect(url.resolveScript).not.toHaveBeenCalled();
        });

        it('does NOT add the phone button when loadConfig throws (config record missing)', () => {
            ctcConfig.loadConfig.mockImplementationOnce(() => {
                throw new Error('CTC config record not found');
            });
            setFieldValues({ phone: '+15551234567' });

            ueScript.beforeLoad(mockContext);

            expect(mockForm.addButton).not.toHaveBeenCalled();
        });

        it('treats populated-config-with-unset-active as active (back-compat for pre-Phase-2 installs)', () => {
            // Existing installs may have a populated config but no active
            // field. We don't want to break their phone button at deploy time.
            ctcConfig.loadConfig.mockReturnValueOnce({
                accountSid: 'AC_existing', apiKeySid: 'SK_existing',
                apiSecretId: 'custsecret_ctc_api_key_secret',
                twimlAppSid: 'AP_existing', phoneNumber: '+15551234567',
                intelServiceSid: '', active: undefined
            });
            setFieldValues({ phone: '+15551234567', companyname: 'Acme Corp' });

            ueScript.beforeLoad(mockContext);

            expect(mockForm.addButton).toHaveBeenCalled();
        });

        it('adds the button when cfg.active is true (post-activation)', () => {
            // Default mock already returns active=true; just confirm
            // the gate doesn't block the normal flow.
            setFieldValues({ phone: '+15551234567', companyname: 'Acme Corp' });

            ueScript.beforeLoad(mockContext);

            expect(mockForm.addButton).toHaveBeenCalled();
        });
    });
});
