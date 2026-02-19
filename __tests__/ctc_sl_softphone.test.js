import suitelet from 'SuiteScripts/click_to_call/ctc_sl_softphone';
import url from 'N/url';
import runtime from 'N/runtime';
import log from 'N/log';
import file from 'N/file';
import search from 'N/search';

jest.mock('N/url');
jest.mock('N/runtime');
jest.mock('N/log');
jest.mock('N/file');
jest.mock('N/search');

describe('ctc_sl_softphone', () => {
    let mockContext;

    const MOCK_TOKEN_URL = '/app/site/hosting/restlet.nl?script=1&deploy=1';
    const MOCK_SDK_URL = '/SuiteApps/com.netsuite.clicktocall/click_to_call/lib/twilio.min.js';

    beforeEach(() => {
        jest.clearAllMocks();

        url.resolveScript.mockReturnValue(MOCK_TOKEN_URL);
        runtime.getCurrentUser.mockReturnValue({ id: 42, name: 'Test User' });
        file.load.mockReturnValue({ url: MOCK_SDK_URL });

        search.create = jest.fn().mockReturnValue({
            run: jest.fn().mockReturnValue({
                getRange: jest.fn().mockReturnValue([])
            })
        });

        mockContext = {
            request: {
                parameters: {
                    phone: '+15551234567',
                    entityId: '100',
                    entityName: 'Acme Corp',
                    entityType: 'customer'
                }
            },
            response: {
                write: jest.fn()
            }
        };
    });

    describe('onRequest', () => {
        it('resolves RESTlet URL with correct script and deployment IDs', () => {
            suitelet.onRequest(mockContext);

            expect(url.resolveScript).toHaveBeenCalledWith({
                scriptId: 'customscript_ctc_rl_token',
                deploymentId: 'customdeploy_ctc_rl_token',
                returnExternalUrl: false
            });
        });

        it('writes HTML response', () => {
            suitelet.onRequest(mockContext);

            expect(mockContext.response.write).toHaveBeenCalledTimes(1);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('</html>');
        });

        it('embeds token endpoint URL in HTML', () => {
            suitelet.onRequest(mockContext);

            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain(MOCK_TOKEN_URL);
        });

        it('embeds phone number in HTML', () => {
            suitelet.onRequest(mockContext);

            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('+15551234567');
        });

        it('embeds entity name in HTML', () => {
            suitelet.onRequest(mockContext);

            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('Acme Corp');
        });

        it('embeds entity ID in HTML', () => {
            suitelet.onRequest(mockContext);

            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('100');
        });

        it('includes Twilio SDK reference from File Cabinet', () => {
            suitelet.onRequest(mockContext);

            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain(MOCK_SDK_URL);
            expect(file.load).toHaveBeenCalledWith({
                id: '/SuiteApps/com.netsuite.clicktocall/click_to_call/lib/twilio.min.js'
            });
        });

        it('handles missing phone parameter gracefully', () => {
            mockContext.request.parameters = { entityId: '100', entityName: 'Acme Corp' };

            suitelet.onRequest(mockContext);

            expect(mockContext.response.write).toHaveBeenCalledTimes(1);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('<!DOCTYPE html>');
        });

        it('handles all missing parameters gracefully', () => {
            mockContext.request.parameters = {};

            suitelet.onRequest(mockContext);

            expect(mockContext.response.write).toHaveBeenCalledTimes(1);
        });

        it('escapes HTML special characters in entity name', () => {
            mockContext.request.parameters.entityName = '<script>alert("xss")</script>';

            suitelet.onRequest(mockContext);

            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).not.toContain('<script>alert("xss")</script>');
            expect(html).toContain('&lt;script&gt;');
        });

        it('escapes HTML special characters in phone number', () => {
            mockContext.request.parameters.phone = '"><img src=x onerror=alert(1)>';

            suitelet.onRequest(mockContext);

            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).not.toContain('"><img src=x onerror=alert(1)>');
            expect(html).toContain('&quot;&gt;&lt;img');
        });

        it('logs error when RESTlet URL resolution fails', () => {
            url.resolveScript.mockImplementation(() => {
                throw new Error('Script not found');
            });

            suitelet.onRequest(mockContext);

            expect(log.error).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'CTC Softphone — Failed to resolve RESTlet URL'
                })
            );
        });

        it('still writes HTML when RESTlet URL resolution fails', () => {
            url.resolveScript.mockImplementation(() => {
                throw new Error('Script not found');
            });

            suitelet.onRequest(mockContext);

            expect(mockContext.response.write).toHaveBeenCalledTimes(1);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('<!DOCTYPE html>');
        });

        it('uses string codec preferences instead of Twilio.Device.Codec enum', () => {
            suitelet.onRequest(mockContext);

            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain("codecPreferences: ['opus', 'pcmu']");
            expect(html).not.toContain('Twilio.Device.Codec');
        });

        it('includes call control buttons', () => {
            suitelet.onRequest(mockContext);

            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('btnCall');
            expect(html).toContain('btnMute');
            expect(html).toContain('btnHangup');
        });

        it('passes CallerId parameter in device.connect call', () => {
            suitelet.onRequest(mockContext);

            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('CallerId: callerId');
        });

        it('includes page title with entity name', () => {
            suitelet.onRequest(mockContext);

            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('<title>Click-to-Call — Acme Corp</title>');
        });

        it('embeds entityType in JS variable', () => {
            suitelet.onRequest(mockContext);

            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain("ENTITY_TYPE = 'customer'");
        });

        it('queries contacts when entityType is customer', () => {
            suitelet.onRequest(mockContext);

            expect(search.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'contact',
                    filters: [['company', 'anyof', '100']]
                })
            );
        });

        it('does not query contacts for non-customer entityType', () => {
            mockContext.request.parameters.entityType = 'lead';
            suitelet.onRequest(mockContext);

            expect(search.create).not.toHaveBeenCalled();
        });

        it('embeds contacts JSON in HTML when contacts exist', () => {
            search.create.mockReturnValue({
                run: jest.fn().mockReturnValue({
                    getRange: jest.fn().mockReturnValue([
                        {
                            id: '200',
                            getValue: jest.fn((col) => {
                                const vals = { firstname: 'Maria', lastname: 'Rogers', phone: '650-458-1122', mobilephone: '' };
                                return vals[col] || '';
                            })
                        }
                    ])
                })
            });

            suitelet.onRequest(mockContext);

            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('Maria Rogers');
            expect(html).toContain('650-458-1122');
        });

        it('includes contact dropdown HTML', () => {
            suitelet.onRequest(mockContext);

            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('contactSelect');
            expect(html).toContain('contactRow');
        });

        it('includes call logging function', () => {
            suitelet.onRequest(mockContext);

            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('logCallToNetSuite');
            expect(html).toContain("action: 'logCall'");
        });

        it('includes logStatus element', () => {
            suitelet.onRequest(mockContext);

            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('logStatus');
        });
    });
});
