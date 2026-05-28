import suitelet from 'SuiteScripts/ctc_sl_softphone';
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
    const MOCK_SDK_URL = '/SuiteApps/com.netsuite.clicktocall/lib/twilio.min.js';

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
                id: '/SuiteApps/com.netsuite.clicktocall/lib/twilio.min.js'
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
                    filters: [['company', 'anyof', '100'], 'AND', ['isinactive', 'is', 'F']]
                })
            );
        });

        it('queries contacts when entityType is prospect (same company link as customer)', () => {
            mockContext.request.parameters.entityType = 'prospect';
            suitelet.onRequest(mockContext);

            expect(search.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'contact',
                    filters: [['company', 'anyof', '100'], 'AND', ['isinactive', 'is', 'F']]
                })
            );
        });

        it('does not query contacts for lead entityType (leads don\'t have related contacts via company)', () => {
            mockContext.request.parameters.entityType = 'lead';
            suitelet.onRequest(mockContext);

            expect(search.create).not.toHaveBeenCalled();
        });

        it('does not query contacts for contact entityType (self-reference would be wrong)', () => {
            mockContext.request.parameters.entityType = 'contact';
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

        it('includes the multi-contact picker card (Phase 3 replacement for the legacy single-select)', () => {
            // Phase 7 polish removed the vestigial contactRow / contactSelect /
            // initContactDropdown — the picker-card with its name+number rows
            // is the only contact UI now.
            suitelet.onRequest(mockContext);

            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('id="pickerCard"');
            expect(html).toContain('id="pickerContactBtn"');
            expect(html).toContain('id="pickerNumberBtn"');
            // The legacy dropdown is gone
            expect(html).not.toContain('id="contactSelect"');
            expect(html).not.toContain('id="contactRow"');
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

        it('renders the status pill element', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('status-pill');
            expect(html).toContain('id="status"');
        });

        it('renders the DTMF dialpad with all 12 keys', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            ['data-digit="1"', 'data-digit="2"', 'data-digit="3"',
             'data-digit="4"', 'data-digit="5"', 'data-digit="6"',
             'data-digit="7"', 'data-digit="8"', 'data-digit="9"',
             'data-digit="*"', 'data-digit="0"', 'data-digit="#"']
                .forEach((sel) => expect(html).toContain(sel));
        });

        it('renders idle and active action groups (Call / Mute / Hangup)', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('id="idleActions"');
            expect(html).toContain('id="activeActions"');
            // Dialpad is shown on idle screen (no separate keypad toggle button)
            expect(html).toContain('id="dialpad"');
        });

        it('puts contact picker on the dark phone surface above the dialpad', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            // pickerCard should appear BEFORE the dialpad (on the dark phone
            // surface), not below in the white contact-info panel.
            const dialpadIdx = html.indexOf('id="dialpad"');
            const pickerCardIdx = html.indexOf('id="pickerCard"');
            expect(pickerCardIdx).toBeLessThan(dialpadIdx);
            // And there's a phone-divider hr between device selectors and the picker
            const dividerIdx = html.indexOf('id="phoneDivider"');
            expect(dividerIdx).toBeGreaterThan(0);
        });

        it('exposes entity info to the client via window.__CTC_ENTITY_INFO__', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('window.__CTC_ENTITY_INFO__');
            expect(html).toContain('window.__CTC_ENTITY_NAME__');
        });

        it('renders dynamic info row placeholders with stable IDs for client-side swap', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            ['id="info-email"', 'id="info-title"', 'id="info-owner"', 'id="info-parent"']
                .forEach((sel) => expect(html).toContain(sel));
        });

        it('renders the anonymous-contact SVG silhouette in the avatar', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('class="avatar"');
            expect(html).toContain('<svg');
            expect(html).toContain('<circle cx="12" cy="8" r="4"');
        });

        it('embeds the Aircall-style navy gradient on the phone display', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('--phone-bg-1: #1A2B47');
            expect(html).toContain('--phone-bg-2: #0F1B30');
        });

        it('renders the contact-info panel under the phone display', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('class="contact-panel"');
            expect(html).toContain('Contact information');
        });

        it('renders contact-info rows when lookup returns data', () => {
            search.lookupFields = jest.fn().mockReturnValue({
                email: 'jdoe@acme.com',
                title: 'VP Operations',
                company: [{ value: '999', text: 'Acme Corp' }]
            });
            search.Type = { CUSTOMER: 'customer', CONTACT: 'contact', LEAD: 'lead', PROSPECT: 'prospect' };
            mockContext.request.parameters.entityType = 'contact';

            suitelet.onRequest(mockContext);

            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('jdoe@acme.com');
            expect(html).toContain('VP Operations');
            expect(html).toContain('Acme Corp');
        });

        it('looks up prospect via search.Type.PROSPECT with email + salesrep columns', () => {
            search.lookupFields = jest.fn().mockReturnValue({
                email: 'lead@prospect.com',
                salesrep: [{ value: '42', text: 'Kathryn Glass' }]
            });
            search.Type = { CUSTOMER: 'customer', CONTACT: 'contact', LEAD: 'lead', PROSPECT: 'prospect' };
            mockContext.request.parameters.entityType = 'prospect';

            suitelet.onRequest(mockContext);

            expect(search.lookupFields).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'prospect',
                    id: '100',
                    columns: ['email', 'salesrep']
                })
            );
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('lead@prospect.com');
            expect(html).toContain('Kathryn Glass');
        });

        it('falls back to "No additional contact details available" when lookup is empty', () => {
            search.lookupFields = jest.fn().mockReturnValue({});
            search.Type = { CUSTOMER: 'customer', CONTACT: 'contact', LEAD: 'lead' };

            suitelet.onRequest(mockContext);

            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('No additional contact details available');
        });

        it('does NOT render a "See record in NetSuite" link (removed per UX direction)', () => {
            url.resolveRecord = jest.fn().mockReturnValue('/app/common/entity/custjob.nl?id=100');

            suitelet.onRequest(mockContext);

            const html = mockContext.response.write.mock.calls[0][0];
            // Link was removed in favor of a cleaner contact panel; the panel only shows
            // info rows now (email/title/owner/parent).
            expect(html).not.toContain('See customer in NetSuite');
            // No anchor markup pointing at the resolved record URL
            expect(html).not.toContain('href="/app/common/entity/custjob.nl?id=100"');
        });

        it('preserves the navy palette over the old #1a1a2e dark theme', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            // Old dark-theme body bg should be gone
            expect(html).not.toContain('background: #1a1a2e');
        });

        it('escapes < to \\u003c in window.__CTC_* globals to prevent </script>-break XSS', () => {
            mockContext.request.parameters.entityName = '</script><script>alert(1)</script>';

            suitelet.onRequest(mockContext);

            const html = mockContext.response.write.mock.calls[0][0];
            // The embedded ENTITY_NAME value must be escaped — find that specific assignment
            // and confirm it doesn't contain a raw </script> that would terminate the tag.
            const nameMatch = html.match(/window\.__CTC_ENTITY_NAME__ = "([^;]*)";/);
            expect(nameMatch).toBeTruthy();
            const nameValue = nameMatch[1];
            // The raw attacker payload must not survive verbatim
            expect(nameValue).not.toContain('</script>');
            // The unicode escape is present (proof the safeJsonEmbed helper ran)
            expect(nameValue).toContain('\\u003c');
        });

        it('uses character-class regex [^0-9] (not \\D) inside template-literal JS to dodge backslash collapsing', () => {
            // Template literals consume undefined backslash escapes, so \D becomes literal D.
            // Use [^0-9] in any regex embedded in the inline <script>. Regression guard for the
            // bug that displayed `(760) 889-9821` as `+(760 () 8) 89--9821`.
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            // No raw \D regex literal in the embedded JS
            expect(html).not.toContain('/\\D/g');
            expect(html).not.toContain('/D/g'); // ← the collapsed form that caused the bug
            expect(html).toContain('/[^0-9]/g');
        });

        // HIGH-8 (SAFE review 2026-05-21) — queryContacts must filter
        // out deactivated contacts so reps don't accidentally dial
        // former employees / duplicate records.
        it('HIGH-8: queryContacts filters with isinactive=F to exclude deactivated contacts', () => {
            suitelet.onRequest(mockContext);

            // The contacts search runs against type:'contact' with both
            // company filter AND an isinactive filter.
            const contactSearch = search.create.mock.calls.find(
                (call) => call[0] && call[0].type === 'contact'
            );
            expect(contactSearch).toBeDefined();
            const filters = contactSearch[0].filters;
            // Filters array contains the isinactive guard
            const hasIsinactiveFilter = filters.some(
                (f) => Array.isArray(f) && f[0] === 'isinactive' && f[2] === 'F'
            );
            expect(hasIsinactiveFilter).toBe(true);
        });
    });

    // ─── Iteration B · Phase 1 (Frame & Shell) regression locks ──────────────
    // These pin the new three-zone flex layout and the inert tab strip + audio
    // gear so future refactors don't accidentally collapse the shell.
    describe('Iteration B Phase 1 — shell structure', () => {
        beforeEach(() => mockContext.response.write.mockClear());

        it('renders the three-zone flex shell (phone-top, phone-scroll, phone-footer)', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('<div class="phone-top">');
            expect(html).toContain('<div class="phone-scroll">');
            expect(html).toContain('<div class="phone-footer">');
        });

        it('orders the shell zones top → scroll → footer in the DOM', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            const topIdx    = html.indexOf('<div class="phone-top">');
            const scrollIdx = html.indexOf('<div class="phone-scroll">');
            const footerIdx = html.indexOf('<div class="phone-footer">');
            expect(topIdx).toBeGreaterThan(-1);
            expect(scrollIdx).toBeGreaterThan(topIdx);
            expect(footerIdx).toBeGreaterThan(scrollIdx);
        });

        it('places the call action buttons inside phone-footer (not scroll)', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            const footerIdx        = html.indexOf('<div class="phone-footer">');
            const idleActionsIdx   = html.indexOf('id="idleActions"');
            const activeActionsIdx = html.indexOf('id="activeActions"');
            expect(footerIdx).toBeGreaterThan(-1);
            expect(idleActionsIdx).toBeGreaterThan(footerIdx);
            expect(activeActionsIdx).toBeGreaterThan(footerIdx);
        });

        it('renders the three-tab mode strip with Dial active; Search + Recents both enabled', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('class="mode-tabs"');
            // Dial tab is active
            expect(html).toMatch(/<button class="mode-tab active" id="tabDial"/);
            // Phase 2 enabled the Search tab
            expect(html).toMatch(/id="tabSearch"/);
            expect(html).not.toMatch(/id="tabSearch"[^>]*\bdisabled\b/);
            // Phase 5 enabled the Recents tab
            expect(html).toMatch(/id="tabRecents"/);
            expect(html).not.toMatch(/id="tabRecents"[^>]*\bdisabled\b/);
        });

        it('renders the audio-settings gear button in phone-top (Phase 4 wired)', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            // Phase 4 enabled the gear — it must NOT carry a disabled attribute
            expect(html).toMatch(/id="audioGear"/);
            expect(html).not.toMatch(/id="audioGear"[^>]*\bdisabled\b/);
            // Gear lives between phone-top open and mode-tabs
            const topIdx  = html.indexOf('<div class="phone-top">');
            const gearIdx = html.indexOf('id="audioGear"');
            const tabsIdx = html.indexOf('class="mode-tabs"');
            expect(gearIdx).toBeGreaterThan(topIdx);
            expect(gearIdx).toBeLessThan(tabsIdx);
        });

        it('ships the locked-popup CSS (.phone height: 100%, .phone-scroll overflow-y: auto)', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            // .phone fills the 380×640 popup viewport
            expect(html).toMatch(/\.phone\s*\{[^}]*height:\s*100%/);
            expect(html).toMatch(/\.phone\s*\{[^}]*overflow:\s*hidden/);
            // .phone-scroll absorbs internal growth without resizing the popup
            expect(html).toMatch(/\.phone-scroll\s*\{[^}]*overflow-y:\s*auto/);
        });
    });

    // ─── Iteration B Phase 1.5 — overflow-fix regression locks ───────────────
    // Phase 1 shipped with two debug findings: (1) the popup window kept its
    // stale 400×820 chrome because window.open ignores feature strings when
    // it reuses a same-named window, and (2) the dialpad overflowed the
    // .phone-scroll viewport with an invisible scrollbar. These tests pin the
    // fixes so future deploys can't regress them.
    describe('Iteration B Phase 1.5 — overflow & popup-reuse fix', () => {
        beforeEach(() => mockContext.response.write.mockClear());

        it('ships a visibly-prominent scrollbar (>= 8px wide, thumb alpha >= 0.25)', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            // WebKit track width
            const widthMatch = html.match(/\.phone-scroll::-webkit-scrollbar\s*\{[^}]*width:\s*(\d+)px/);
            expect(widthMatch).toBeTruthy();
            expect(Number(widthMatch[1])).toBeGreaterThanOrEqual(8);
            // Thumb alpha
            const thumbMatch = html.match(/\.phone-scroll::-webkit-scrollbar-thumb\s*\{[^}]*background:\s*rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)/);
            expect(thumbMatch).toBeTruthy();
            expect(Number(thumbMatch[1])).toBeGreaterThanOrEqual(0.25);
        });

        it('renders the device selects inside the audio-overlay (Phase 4 moved them out of phone-top)', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            const overlayOpenIdx = html.indexOf('<div class="audio-overlay hidden"');
            const inputIdx       = html.indexOf('id="inputDevice"');
            const outputIdx      = html.indexOf('id="outputDevice"');
            const overlayCloseIdx = html.indexOf('</div><!-- /audio-overlay -->');
            expect(overlayOpenIdx).toBeGreaterThan(-1);
            expect(overlayCloseIdx).toBeGreaterThan(overlayOpenIdx);
            // Both selects live inside the audio-overlay block
            expect(inputIdx).toBeGreaterThan(overlayOpenIdx);
            expect(inputIdx).toBeLessThan(overlayCloseIdx);
            expect(outputIdx).toBeGreaterThan(overlayOpenIdx);
            expect(outputIdx).toBeLessThan(overlayCloseIdx);
            // Phase 1.5's inline #deviceSelectors row is gone now
            expect(html).not.toContain('id="deviceSelectors"');
        });

        it('hides .timer by default in idle state (call-not-active)', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            // .timer must default to display:none so it doesn't eat scroll
            // height when there's no active call. Existing JS toggles it to
            // visible on connect.
            // Phase 7 polish removed .origin-line entirely — its purpose was
            // re-surfaced inside the audio overlay's caller-ID affordance.
            expect(html).toMatch(/\.timer\s*\{[^}]*display:\s*none/);
            expect(html).not.toContain('.origin-line');
            expect(html).not.toContain('id="originLine"');
        });
    });

    // ─── Iteration B Phase 2 — Search tab + entryPoint-driven default ───────
    describe('Iteration B Phase 2 — Search tab + initial-tab dispatch', () => {
        beforeEach(() => mockContext.response.write.mockClear());

        it('renders both view-dial and view-search siblings inside .phone-scroll', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('<div class="view-dial" id="viewDial">');
            expect(html).toMatch(/<div class="view-search[^"]*" id="viewSearch">/);
            // .view-search starts hidden by default
            expect(html).toContain('<div class="view-search hidden" id="viewSearch">');
        });

        it('renders the search bar with placeholder + filter chips + result-list container', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('id="searchInput"');
            expect(html).toContain('id="searchChips"');
            expect(html).toContain('id="searchResults"');
            // All four filter chips. The empty-filter chip is labelled
            // "My book" (not "All") to make the rep-book scope explicit
            // — see Fix 2 in the Iter B Phase 6 refinements.
            expect(html).toMatch(/data-filter=""[^>]*>My book/);
            expect(html).toMatch(/data-filter="customer"[^>]*>Customer/);
            expect(html).toMatch(/data-filter="prospect"[^>]*>Prospect/);
            expect(html).toMatch(/data-filter="lead"[^>]*>Lead/);
        });

        it('defaults INITIAL_TAB to dial for record entryPoint (phone present)', () => {
            mockContext.request.parameters.entryPoint = 'record';
            mockContext.request.parameters.phone = '+15551234567';
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toMatch(/INITIAL_TAB\s*=\s*'dial'/);
        });

        it('defaults INITIAL_TAB to search for dashboard entryPoint with no phone/entityId', () => {
            mockContext.request.parameters.entryPoint = 'dashboard';
            mockContext.request.parameters.phone = '';
            mockContext.request.parameters.entityId = '';
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toMatch(/INITIAL_TAB\s*=\s*'search'/);
        });

        it('keeps INITIAL_TAB=dial when dashboard launch carries phone/entityId (redial path)', () => {
            mockContext.request.parameters.entryPoint = 'dashboard';
            mockContext.request.parameters.phone = '+14155551234';
            mockContext.request.parameters.entityId = '100';
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toMatch(/INITIAL_TAB\s*=\s*'dial'/);
        });

        it('emits softphoneSuggested + softphoneSearch action labels in inline JS', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain("action: 'softphoneSuggested'");
            expect(html).toContain("action: 'softphoneSearch'");
        });
    });

    // ─── Iteration B Phase 3 — multi-contact picker ─────────────────────────
    describe('Iteration B Phase 3 — multi-contact picker', () => {
        beforeEach(() => mockContext.response.write.mockClear());

        it('renders the picker-card with Contact + Number picker-btn rows + dropdown container', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toMatch(/<div class="picker-card[^"]*" id="pickerCard">/);
            expect(html).toContain('id="pickerContactBtn"');
            expect(html).toContain('id="pickerNumberBtn"');
            expect(html).toContain('id="pickerDropdown"');
            expect(html).toContain('id="pickerContactName"');
            expect(html).toContain('id="pickerNumberValue"');
        });

        it('starts with picker-card hidden so layout stays clean for 0-contact entities', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('<div class="picker-card hidden" id="pickerCard">');
        });

        it('legacy single-select contact picker is removed (Phase 7 polish)', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            // Phase 3 hid the legacy picker via display:none as a transitional
            // vestige; Phase 7 polish deletes it entirely. The new picker-card
            // is the only contact UI.
            expect(html).not.toContain('id="contactRow"');
            expect(html).not.toContain('id="contactSelect"');
            expect(html).not.toContain('.picker-row');
            expect(html).not.toContain('initContactDropdown');
        });

        it('emits the CONTACTS_V2 rich-shape client var and the softphoneContacts action', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toMatch(/var CONTACTS_V2\s*=/);
            expect(html).toContain("action: 'softphoneContacts'");
        });
    });

    // ─── Iteration B Phase 4 — audio-settings overlay ───────────────────────
    describe('Iteration B Phase 4 — audio overlay + localStorage defaults', () => {
        beforeEach(() => mockContext.response.write.mockClear());

        it('renders the audio-overlay block with title, dropdowns, save-default, and Done button', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('<div class="audio-overlay hidden" id="audioOverlay"');
            expect(html).toContain('id="audioDone"');
            expect(html).toContain('id="audioSaveDefault"');
            // Title + sub copy
            expect(html).toContain('Audio settings');
        });

        it('starts with audio-overlay hidden so the rep sees the Dial/Search view first', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('<div class="audio-overlay hidden" id="audioOverlay"');
        });

        it('emits localStorage helpers + AUDIO_LS_KEY in the inline JS', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain("AUDIO_LS_KEY = 'ctc-audio-defaults'");
            expect(html).toContain('loadAudioDefaults');
            expect(html).toContain('saveAudioDefaults');
            expect(html).toContain('applyAudioDefaults');
            // Persistence wires onto both selects
            expect(html).toContain('persistAudioPref');
        });

        it('hides the gear during in-call via .hidden class on #audioGear', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            // The gear gets .hidden added when setCallView('active') runs
            expect(html).toMatch(/setCallView\([^)]*\)\s*\{[\s\S]*audioGear[\s\S]*classList\.add\(['"]hidden['"]\)/);
            // And the .hidden class on .audio-gear is defined in CSS
            expect(html).toMatch(/\.audio-gear\.hidden\s*\{[^}]*display:\s*none/);
        });
    });

    // ─── Iteration B Phase 5 — Recents tab + last-3-dialed shortcut ────────
    describe('Iteration B Phase 5 — Recents + last-dialed', () => {
        beforeEach(() => mockContext.response.write.mockClear());

        it('renders the view-recents sibling block with direction filter chips + recents list', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('<div class="view-recents hidden" id="viewRecents">');
            expect(html).toContain('id="recentsChips"');
            expect(html).toContain('id="recentsList"');
            // All four direction chips present
            expect(html).toMatch(/data-direction=""[^>]*>All/);
            expect(html).toMatch(/data-direction="missed"[^>]*>Missed/);
            expect(html).toMatch(/data-direction="outbound"[^>]*>Out/);
            expect(html).toMatch(/data-direction="inbound"[^>]*>In/);
        });

        it('renders the last-dialed shortcut card on the Dial view (hidden by default)', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('<div class="last-dialed hidden" id="lastDialed">');
            expect(html).toContain('id="lastDialedList"');
            // last-dialed sits inside view-dial, BEFORE the dialpad
            const viewDialIdx     = html.indexOf('<div class="view-dial"');
            const lastDialedIdx   = html.indexOf('id="lastDialed"');
            const dialpadIdx      = html.indexOf('class="dialpad"');
            expect(lastDialedIdx).toBeGreaterThan(viewDialIdx);
            expect(lastDialedIdx).toBeLessThan(dialpadIdx);
        });

        it('emits softphoneRecents action + loadRecents + renderLastDialed in inline JS', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain("action: 'softphoneRecents'");
            expect(html).toContain('function loadRecents');
            expect(html).toContain('function renderLastDialed');
            expect(html).toContain("dateRange: 'last7days'");
        });

        it('kicks off the recents fetch on init so the last-dialed shortcut hydrates', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            // The init-tab block ends with a loadRecents() call
            expect(html).toMatch(/if\s*\(typeof loadRecents === 'function'\)\s*loadRecents\(\)/);
        });
    });

    // ─── Iteration B Phase 6 — in-call account snapshot ────────────────────
    describe('Iteration B Phase 6 — account snapshot card', () => {
        beforeEach(() => mockContext.response.write.mockClear());

        it('renders the account-snapshot card with 4 tiles (hidden by default)', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('<div class="account-snapshot hidden" id="accountSnapshot">');
            expect(html).toContain('id="snapOutstanding"');
            expect(html).toContain('id="snapOpenOpps"');
            expect(html).toContain('id="snapLastInvoice"');
            expect(html).toContain('id="snapLastActivity"');
        });

        it('places the snapshot card inside view-dial after the dialpad', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            const dialpadIdx  = html.indexOf('class="dialpad"');
            const snapshotIdx = html.indexOf('id="accountSnapshot"');
            const viewDialClose = html.indexOf('</div><!-- /view-dial -->');
            expect(snapshotIdx).toBeGreaterThan(dialpadIdx);
            expect(snapshotIdx).toBeLessThan(viewDialClose);
        });

        it('emits softphoneAccountSnapshot action + loadAccountSnapshot in inline JS', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain("action: 'softphoneAccountSnapshot'");
            expect(html).toContain('function loadAccountSnapshot');
            expect(html).toContain('function hideAccountSnapshot');
        });

        it('triggers snapshot fetch on call connect via setCallView(active)', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            // setCallView('active') must invoke loadAccountSnapshot when ENTITY_ID is set
            expect(html).toMatch(/setCallView\([^)]*\)\s*\{[\s\S]*loadAccountSnapshot\(ENTITY_ID\)/);
            // and hide it when going back to idle
            expect(html).toMatch(/setCallView\([^)]*\)\s*\{[\s\S]*hideAccountSnapshot\(\)/);
        });
    });

    // ─── Iteration A/C/D + I alignment: Selected Card + compact meta + hints
    describe('Iteration A/C/D/I — visual alignment to wireframe', () => {
        beforeEach(() => mockContext.response.write.mockClear());

        it('hides the legacy Dial vestiges (avatar / big company name / phone / divider)', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            // CSS rule hides them inside .view-dial
            expect(html).toMatch(/\.view-dial \.avatar[^\{]*\{[\s\S]*?display:\s*none/);
            expect(html).toMatch(/\.view-dial \.contact-name[^\{]*\{[\s\S]*?display:\s*none/);
            expect(html).toMatch(/\.view-dial \.contact-phone[^\{]*\{[\s\S]*?display:\s*none/);
        });

        it('renders the Selected Card header (swatch + name + badge) inside picker-card', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            // Header sits above the picker-btn rows inside picker-card
            const pickerCardIdx  = html.indexOf('id="pickerCard"');
            const swatchIdx      = html.indexOf('id="scSwatch"');
            const nameIdx        = html.indexOf('id="scName"');
            const badgeIdx       = html.indexOf('id="scBadge"');
            const contactBtnIdx  = html.indexOf('id="pickerContactBtn"');
            expect(pickerCardIdx).toBeGreaterThan(-1);
            expect(swatchIdx).toBeGreaterThan(pickerCardIdx);
            expect(nameIdx).toBeGreaterThan(pickerCardIdx);
            expect(badgeIdx).toBeGreaterThan(pickerCardIdx);
            // Header is ABOVE the CONTACT picker button
            expect(swatchIdx).toBeLessThan(contactBtnIdx);
        });

        it('renders the 3-cell compact meta strip (Open record / Owner / Last call)', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('<div class="compact-meta hidden" id="compactMeta">');
            expect(html).toContain('id="metaOpenRecord"');
            expect(html).toContain('id="metaOwner"');
            expect(html).toContain('id="metaLastCall"');
        });

        it('renders the iteration I empty-state hint (hidden by default)', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('<div class="dial-empty-hint hidden" id="dialEmptyHint">');
            expect(html).toContain('Type a number, or switch to Search to find a contact');
        });

        it('compresses the dialpad — key digit font ≤ 16px, min-height ≥ 28px', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            const digitMatch  = html.match(/\.dial-key \.digit\s*\{[^}]*font-size:\s*(\d+)px/);
            const heightMatch = html.match(/\.dial-key\s*\{[^}]*min-height:\s*(\d+)px/);
            expect(digitMatch).toBeTruthy();
            expect(Number(digitMatch[1])).toBeLessThanOrEqual(16);
            expect(heightMatch).toBeTruthy();
            expect(Number(heightMatch[1])).toBeGreaterThanOrEqual(28);
        });

        it('emits renderSelectedCardHeader in inline JS + hooks into selectSearchRow/loadRecentIntoDial', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('function renderSelectedCardHeader');
            // Both contact-load paths call it
            expect(html).toMatch(/function selectSearchRow[\s\S]{0,2000}renderSelectedCardHeader\(/);
            expect(html).toMatch(/function loadRecentIntoDial[\s\S]{0,2000}renderSelectedCardHeader\(/);
        });
    });

    // ─── Iter B Phase 6 refinements — button styling, no-phone state, open-record fix
    describe('Iter B Phase 6 refinements', () => {
        beforeEach(() => mockContext.response.write.mockClear());

        it('audio overlay button label is "Save & Return" (no leading "Done ·")', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('id="audioDone"');
            expect(html).toMatch(/id="audioDone"[^>]*>Save &amp; Return</);
            // The old verbose label is gone
            expect(html).not.toMatch(/Done &middot; save &amp; return/);
        });

        it('audio Save & Return button caps width + uses solid contrast against navy', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            const doneBtn = html.match(/\.audio-overlay \.done-btn\s*\{[^}]+\}/);
            expect(doneBtn).toBeTruthy();
            const body = doneBtn[0];
            // Width is capped — no longer stretches edge-to-edge in the flex column
            expect(body).toMatch(/width:\s*fit-content/);
            // Solid contrast against the dark phone surface (not translucent rgba)
            expect(body).toMatch(/background:\s*#74C0FC/);
            expect(body).toMatch(/color:\s*#0B1426/);
        });

        it('Search "My book" chip replaces the ambiguous "All" label', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            // The empty-filter chip is the rep's book scope, not a system-wide All
            expect(html).toMatch(/data-filter=""[^>]*>My book/);
            expect(html).not.toMatch(/data-filter=""[^>]*>All\b/);
        });

        it('no-phone-on-file Dial state — renders CTA + emits renderPhoneFallback helper', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            // The CTA element + class are in the DOM
            expect(html).toContain('id="noPhoneCta"');
            expect(html).toContain('class="no-phone-cta"');
            expect(html).toMatch(/Add a phone in NetSuite/);
            // The fallback helper exists and is referenced from setDialedNumber
            expect(html).toContain('function renderPhoneFallback');
            expect(html).toMatch(/setDialedNumber[\s\S]{0,500}renderPhoneFallback\(\)/);
            // It emits the canonical "no phone on file" copy (matches Search-tab vocabulary)
            expect(html).toMatch(/return 'no phone on file'/);
        });

        it('Open-record link bug fix — clientResolveEntityUrl synthesizes the URL client-side', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            // Helper exists and uses NetSuite's shared custjob.nl entity path
            expect(html).toContain('function clientResolveEntityUrl');
            expect(html).toContain('/app/common/entity/custjob.nl?id=');
            // Both Search-row and Recents-row paths now pass a resolved recordUrl
            // rather than the old empty-string TODO that fell through to "#"
            expect(html).toMatch(/function selectSearchRow[\s\S]{0,2000}recordUrl:\s*clientResolveEntityUrl/);
            expect(html).toMatch(/function loadRecentIntoDial[\s\S]{0,2000}recordUrl:\s*clientResolveEntityUrl/);
        });

        it('Open-record link bug fix — meta cell hides when no real URL resolves', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            // Defense-in-depth: when resolvedUrl is falsy, remove href + add hidden
            // so the click can never open the Suitelet popup's own URL in a new tab.
            expect(html).toMatch(/metaOpenRecord\.removeAttribute\(['"]href['"]\)/);
            expect(html).toMatch(/metaOpenRecord\.classList\.add\(['"]hidden['"]\)/);
        });

        it('Honest chip counts — emits softphoneBookCounts call + decouples chips from displayed rows', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            // The chip-update helpers split into two paths
            expect(html).toContain('function writeChipCounts');
            expect(html).toContain('function applyBookCountsToChips');
            expect(html).toContain('function updateCountsFromRows');
            expect(html).toContain('function loadBookCounts');
            // The Suggested loader kicks off the book-counts fetch in parallel
            expect(html).toMatch(/function loadSuggested[\s\S]{0,500}loadBookCounts\(\)/);
            // The action is wired to softphoneBookCounts
            expect(html).toContain("action: 'softphoneBookCounts'");
            // Empty-state path uses true book totals, not row-derived counts
            expect(html).toMatch(/function applyVisible[\s\S]{0,400}applyBookCountsToChips/);
            // Typed-search path keeps row-derived counts (filtered matches)
            expect(html).toMatch(/function runSearch[\s\S]{0,2000}updateCountsFromRows/);
        });

        it('Suggested limit bumped from 20 to 30 to cover larger books', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            // The Suggested fetch sends limit=30 (was 20). Burt-style books
            // (112 entities) get better empty-state coverage in the recent
            // slice without making the list unscrollable.
            expect(html).toMatch(/action: 'softphoneSuggested',\s*limit:\s*30/);
            expect(html).not.toMatch(/action: 'softphoneSuggested',\s*limit:\s*20/);
        });
    });

    // ─── Phase 7 polish — mic-level meter ──────────────────────────────────
    describe('Phase 7 — mic-level VU meter', () => {
        beforeEach(() => mockContext.response.write.mockClear());

        it('renders the meter HTML inside the audio overlay', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('id="micMeter"');
            expect(html).toContain('id="micMeterBar"');
            expect(html).toContain('id="micMeterHint"');
        });

        it('emits start/stop/draw helpers + wires getUserMedia + AudioContext analyser', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('function startMicMeter');
            expect(html).toContain('function stopMicMeter');
            expect(html).toContain('function drawMicMeter');
            expect(html).toContain('navigator.mediaDevices.getUserMedia');
            expect(html).toContain('createAnalyser');
            // RMS over the time-domain buffer (not the FFT) — keeps the bar
            // responsive without flicker.
            expect(html).toContain('getByteTimeDomainData');
        });

        it('starts the meter when the overlay opens + stops it when it closes', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toMatch(/function openAudioOverlay[\s\S]{0,500}startMicMeter\(\)/);
            expect(html).toMatch(/function closeAudioOverlay[\s\S]{0,500}stopMicMeter\(\)/);
        });

        it('releases the mic stream when a call starts so Twilio can claim the device', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            // The call-connect path calls stopMicMeter before device.connect
            expect(html).toMatch(/setCallView\('active'\);[\s\S]{0,500}stopMicMeter\(\)/);
            expect(html).toMatch(/stopMicMeter\(\)[\s\S]{0,500}device\.connect/);
        });

        it('re-arms the meter on the new device when the rep swaps mics in the select', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            // input select change handler stops the old stream + starts a fresh one
            expect(html).toMatch(/inputSelect\.addEventListener\('change',[\s\S]{0,500}stopMicMeter\(\)[\s\S]{0,300}startMicMeter\(\)/);
        });
    });

    describe('HIGH-11 — pollForTranscript error surface', () => {
        // Sprint 2 U3 — pre-fix: any RESTlet 200-with-error or HTTP
        // 5xx was rescheduled silently; after 12 polls the rep saw
        // "Transcript will be processed shortly" — indistinguishable
        // from genuine pending state. Post-fix: data.error or HTTP
        // non-2xx short-circuits to a distinct error message with
        // 'log-status error' class; poll-cap reached with status
        // still pending gets a distinct "check back later" copy.

        it('checks res.ok before parsing JSON — HTTP non-2xx throws to terminal catch path', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            // Sprint 2 review #11 — res.ok guard now throws with a
            // ctcHttpStatus sentinel property (not a string prefix).
            // Anchor on the pollForTranscript-specific Sprint 2
            // review #11 sentinel — distinct from the token-fetch
            // res.ok check earlier in the Suitelet.
            expect(html).toMatch(/httpErr\.ctcHttpStatus = res\.status/);
            // Pre-#11 string-prefix sniffing must be gone
            expect(html).not.toMatch(/err\.message\.indexOf\('HTTP_'\)/);
        });

        it('checks data.error explicitly before the status switches', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            // explicit error check fires surfaceTerminalError() before any data.status branch
            expect(html).toMatch(/if \(data && data\.error\)[\s\S]{0,250}surfaceTerminalError\(\)/);
        });

        it('surfaceTerminalError uses log-status error class for distinct visual', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            // distinct error styling — rep can SEE failure vs. pending
            expect(html).toMatch(/function surfaceTerminalError\(\)[\s\S]{0,300}className = 'log-status error'/);
        });

        it('uses distinct copy at poll cap — "still pending — check back later" not "processed shortly"', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            // new copy clarifies admin/scheduled-poll will pick it up
            expect(html).toContain('Transcript still pending');
            expect(html).toContain('check back later');
            // legacy ambiguous copy is gone
            expect(html).not.toContain('Transcript will be processed shortly');
        });

        it('error surface message names admin retry path generically (no Twilio codes leaked)', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            expect(html).toContain('Transcript check failed');
            expect(html).toContain('admin will retry');
            // No raw Twilio error codes / no .error message echoed to DOM
            expect(html).not.toMatch(/textContent\s*=\s*[^;]*data\.error/);
        });

        it('catch path uses ctcHttpStatus sentinel (not string prefix) to distinguish HTTP errors from transient', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            // Sprint 2 review #11 — sentinel property check, not
            // err.message.indexOf('HTTP_'). Refactor-resistant.
            expect(html).toMatch(/typeof err\.ctcHttpStatus === 'number'[\s\S]{0,200}surfaceTerminalError\(\)/);
        });

        it('genuine transient network errors still retry up to the 12-poll cap', () => {
            suitelet.onRequest(mockContext);
            const html = mockContext.response.write.mock.calls[0][0];
            // retry-until-cap behavior preserved for transients
            expect(html).toMatch(/\.catch\(function \(err\)[\s\S]{0,800}setTimeout\(poll, POLL_INTERVAL_MS\)/);
        });
    });
});
