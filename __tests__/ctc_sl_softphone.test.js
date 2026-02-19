import suitelet from 'SuiteScripts/click_to_call/ctc_sl_softphone';
import url from 'N/url';
import runtime from 'N/runtime';
import log from 'N/log';

jest.mock('N/url');
jest.mock('N/runtime');
jest.mock('N/log');

describe('ctc_sl_softphone', () => {
    let mockContext;

    const MOCK_TOKEN_URL = 'https://12345.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=1&deploy=1';

    beforeEach(() => {
        jest.clearAllMocks();

        url.resolveScript.mockReturnValue(MOCK_TOKEN_URL);
        runtime.getCurrentUser.mockReturnValue({ id: 42, name: 'Test User' });

        mockContext = {
            request: {
                parameters: {
                    phone: '+15551234567',
                    entityId: '100',
                    entityName: 'Acme Corp'
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
                returnExternalUrl: true
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

        it('includes Twilio SDK CDN reference', () => {
            suitelet.onRequest(mockContext);

            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('https://sdk.twilio.com/js/client/releases/2.7.3/twilio.min.js');
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

        it('includes call control buttons', () => {
            suitelet.onRequest(mockContext);

            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('btnCall');
            expect(html).toContain('btnMute');
            expect(html).toContain('btnHangup');
        });

        it('includes page title with entity name', () => {
            suitelet.onRequest(mockContext);

            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('<title>Click-to-Call — Acme Corp</title>');
        });
    });
});
