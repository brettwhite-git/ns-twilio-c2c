/* eslint-disable suitescript/script-type */
/**
 * @NApiVersion 2.1
 *
 * Setup Wizard v2 — SpaClient (proper props, no more guessing).
 *
 * Rewrote against the actual @uif-js TypeScript definitions
 * (component.d.ts from the netsuite-uif-reference skill). Earlier
 * iterations were guessing prop names from JSX conventions. Real shapes:
 *
 *   Heading       — `content` (NOT `text`), `type: PAGE_TITLE|...`
 *   Text          — `text` (correct), `type/size/weight/color` enums
 *   StepperItem   — `label` only (description/done/disabled aren't in Options)
 *   Stepper       — `items, selectedStepIndex, orientation, descriptionGenerator`
 *                   step "done/active" is computed from selectedStepIndex
 *   ContentPanel  — `content, horizontalAlignment: STRETCH, outerGap`
 *   StackPanel    — `items, orientation, itemGap` (with own enums)
 *
 * The HTML reference at docs/architecture/setup-wizard-v2.html ships a
 * specific page layout (stepper across the top, content card below); the
 * UIF equivalent below uses StackPanel(VERTICAL) [ContentPanel-wrapped
 * Stepper, ContentPanel-wrapped step body ].
 */
define(["require", "exports", "@uif-js/core", "@uif-js/component"],
       function (require, exports, core, component) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.run = void 0;

    // 5-step flow. Mirrors lib/ctc_wizard_state.js STEPS — original
    // 6-step plan collapsed "Reps & roles" into the final "Test &
    // activate" page (which now combines review + preflight + activate
    // in one surface — see U7-collapse commit).
    var STEPS = [
        { num: 1, label: 'Prerequisites',   sub: 'Setup checks' },
        { num: 2, label: 'Connect Twilio',  sub: 'SIDs & secrets' },
        { num: 3, label: 'Voice config',    sub: 'TwiML & caller ID' },
        { num: 4, label: 'Phone numbers',   sub: 'Claim & assign' },
        { num: 5, label: 'Test & activate', sub: 'Review & go live' }
    ];
    var CURRENT_STEP = 1; // 1-based; mutated by Continue/Back

    // Suitelet-as-API endpoint backing the wizard SPA. Same-origin →
    // NetSuite session cookies carry through; no separate auth needed.
    var WIZARD_API_URL =
        '/app/site/hosting/scriptlet.nl' +
        '?script=customscript_ctc_sl_wizard_api' +
        '&deploy=customdeploy_ctc_sl_wizard_api';

    // Module-level state — populated by mount + form inputs.
    var scriptCtx = null;          // for re-render via setContent
    var bodyContainer = null;      // for swapping step body
    var enums = null;              // cached enum bag from run()
    var STATE = {
        step2: { accountSid: '', apiKeySid: '', apiSecretId: '' },
        step3: {
            twimlAppSid: '',
            phoneNumber: '',
            intelServiceSid: '',
            // Auto-populated dropdown source lists. Fetched from the
            // server via wizardListTwiMLApps / wizardListPhoneNumbers /
            // wizardListIntelServices on Step 3 mount. Secret VALUE
            // never travels — server uses SecureString + custsecret
            // pointer at the N/https socket boundary.
            twimlApps: null,        // null = not yet fetched
            phoneNumbers: null,
            intelServices: null,
            listLoadError: null
        },
        step4: {
            // Source lists (null = not yet fetched)
            phoneNumbers: null,    // from Twilio (live)
            employees:    null,    // from NetSuite
            // assignments shape: { <phoneSid>: { employeeIds: [n], label: '', primaryEmployeeId: n }, ... }
            assignments: {},
            listLoadError: null
        },
        step5: {
            snapshot: null,        // from wizardSnapshot — config record state
            assignments: null,     // from wizardLoadAssignments — current rep list
            preflight: null,       // from wizardRunPreflight — check results array
            activated: false,      // true after successful activate
            activateError: null,
            loading: false         // true while preflight is running
        }
    };

    /**
     * Shared Ajax helper. POSTs to the wizard API and returns the
     * unwrapped payload (or null).
     */
    function wizardCall(action, payload) {
        return core.Ajax.post(
            WIZARD_API_URL + '&action=' + action,
            payload || {},
            { dataType: core.Ajax.DataType.JSON,
              responseType: core.Ajax.ResponseType.JSON }
        ).then(extractPayload);
    }

    var run = function (scriptContext) {
        try {
            console.log("[CTC Setup Wizard] === REAL API PASS ===");

            // Resolve enums from the actual classes (verified against d.ts).
            var SP    = component.StackPanel;
            var CP    = component.ContentPanel;
            var H     = component.Heading;
            var T     = component.Text;
            var Stp   = component.Stepper;
            var SI    = component.StepperItem;

            var SP_Orient = SP && SP.Orientation || {};
            var SP_Gap    = SP && SP.GapSize || {};
            var CP_Gap    = CP && CP.GapSize || {};
            var CP_HAlign = CP && CP.HorizontalAlignment || {};
            var H_Type    = H && H.Type || {};
            var T_Type    = T && T.Type || {};
            // Stepper.Orientation aliases StepperItem.Orientation per d.ts
            var Stp_Orient = (Stp && Stp.Orientation) ||
                             (SI && SI.Orientation) || {};

            enums = {
                SP: SP, CP: CP, H: H, T: T, Stp: Stp, SI: SI,
                SP_Orient: SP_Orient,
                SP_Gap: SP_Gap,
                CP_Gap: CP_Gap,
                CP_HAlign: CP_HAlign,
                H_Type: H_Type,
                T_Type: T_Type,
                Stp_Orient: Stp_Orient
            };
            scriptCtx = scriptContext;

            // U9 fix: previously CURRENT_STEP was always 1 on mount,
            // dropping returning admins back at the prereqs check.
            // Now we fetch the config snapshot and route to the right
            // step via lib/ctc_wizard_state.determineCurrentStep.
            //
            // While snapshot is in flight, render Step 1 with a loader
            // so the admin sees something immediately. When the
            // snapshot lands, goToStep navigates to the correct step
            // and fires its per-step loader.
            rerender();
            loadPrereqs(); // immediate Step 1 affordance during routing

            wizardCall('wizardSnapshot', {}).then(function (payload) {
                var snap = payload && payload.snapshot;
                if (!snap) return; // fresh install — stay on Step 1
                var target = determineLandingStep(snap);
                if (target !== CURRENT_STEP) {
                    console.log("[CTC Setup Wizard] resumability — routing to step " + target);
                    goToStep(target);
                }
            }).catch(function (e) {
                console.warn("[CTC Setup Wizard] resumability snapshot " +
                    "failed; staying on Step 1:", e);
            });
        } catch (e) {
            console.error("[CTC Setup Wizard] run() threw:", e);
        }
    };

    /**
     * U9: Determine the right landing step from a snapshot. Mirrors
     * `lib/ctc_wizard_state.js:determineCurrentStep`. Inlined here
     * because SPA Client runtime AMD require semantics for cross-folder
     * libs are uncertain in NetSuite UIF — safer to keep the routing
     * tiny and local.
     *
     * @param {Object} snap — masked snapshot from wizardSnapshot action
     * @returns {number} 1..5
     */
    function determineLandingStep(snap) {
        var has = function (v) { return !!(v && String(v).trim().length > 0); };
        if (!has(snap.accountSid) || !has(snap.apiKeySid)) return 2;
        if (!has(snap.apiSecretId)) return 2;
        if (!has(snap.twimlAppSid) || !has(snap.phoneNumber)) return 3;
        // hasVoiceConfig met. Step 4 (phone assignments) or Step 5 (activate).
        // We don't have the rep-assignment count in the snapshot — Step 4's
        // loader will reveal it. Land on Step 5 when active; otherwise land
        // on Step 4 so admin can review/adjust assignments before preflight.
        if (snap.active) return 5;
        return 4;
    }

    /**
     * Rebuild and mount the full root tree. Called on initial render
     * and on every step navigation. Keeps the stepper + title in sync
     * with CURRENT_STEP.
     */
    function rerender() {
        if (!scriptCtx || !enums) return;
        try {
            var root = buildRoot(enums);
            scriptCtx.setContent(root);
            console.log("[CTC Setup Wizard] rerender — step " + CURRENT_STEP);
        } catch (e) {
            console.error("[CTC Setup Wizard] rerender threw:", e);
        }
    }

    /**
     * Advance to the next step (or jump to a specific step). Re-renders.
     */
    function goToStep(stepNum) {
        CURRENT_STEP = Math.max(1, Math.min(STEPS.length, stepNum));
        rerender();
        if (CURRENT_STEP === 1) loadPrereqs();
        if (CURRENT_STEP === 3) loadStep3Lists();
        if (CURRENT_STEP === 4) loadStep4Lists();
        if (CURRENT_STEP === 5) loadStep5();
    }

    /**
     * Call the wizardPrereqs action and swap the body content with
     * the rendered check rows when the response arrives.
     */
    function loadPrereqs() {
        if (!bodyContainer) {
            console.warn("[CTC Setup Wizard] bodyContainer missing — " +
                "cannot render prereqs");
            return;
        }
        console.log("[CTC Setup Wizard] Calling wizardPrereqs...");
        wizardCall('wizardPrereqs', {}).then(function (payload) {
            var body;
            if (payload && payload.ok && payload.checks) {
                // Wrap prereqs list with the nav footer so Continue button
                // sits below the rows. Since loadPrereqs runs ONLY on
                // initial Step 1 mount, we re-render the whole tree to
                // pick up the new body.
                body = buildPrereqsList(payload.checks);
            } else if (payload && payload.error) {
                body = buildErrorBox(payload.error);
            } else {
                body = buildErrorBox('unexpected response shape — see console');
            }

            // Compose body + nav footer so the Continue button is visible.
            var stack = safeNew(component.StackPanel, {
                items: [body, buildNavFooter(enums)]
                    .filter(function (c) { return c != null; }),
                orientation: component.StackPanel.Orientation.VERTICAL,
                itemGap: component.StackPanel.GapSize.L
            }, "StackPanel(prereqs+footer)") || body;

            try { bodyContainer.setContent(stack); }
            catch (e) {
                console.error("[CTC Setup Wizard] bodyContainer.setContent " +
                    "failed:", e);
            }
        }).catch(function (err) {
            console.error("[CTC Setup Wizard] wizardPrereqs Ajax failed:", err);
            try {
                bodyContainer.setContent(buildErrorBox(
                    'Network or server error calling wizardPrereqs — ' +
                    'check browser DevTools Network tab and the NetSuite ' +
                    'Script Execution Log for details.'));
            } catch (e) { /* ignore */ }
        });
    }

    function buildRoot(d) {
        // ── Page title (Heading uses `content`, not `text`) ─────────────
        var title = safeNew(d.H, {
            content: "Click-to-Call Setup Wizard",
            type: d.H_Type.PAGE_TITLE
        }, "Heading(title)");

        var subtitle = safeNew(d.T, {
            text: "Step " + CURRENT_STEP + " of " + STEPS.length + " — " +
                STEPS[CURRENT_STEP - 1].label
        }, "Text(subtitle)");

        // ── Stepper (full-width, horizontal) ────────────────────────────
        var stepper = buildStepper(d);

        // Wrap stepper in a STRETCH-aligned ContentPanel so it fills the
        // page width (fix for the overlapping-labels issue: items got
        // tiny widths because the Stepper container itself was narrow).
        var stepperBox = null;
        if (stepper) {
            stepperBox = safeNew(d.CP, {
                content: stepper,
                horizontalAlignment: d.CP_HAlign.STRETCH,
                outerGap: d.CP_Gap.M
            }, "ContentPanel(stepper, STRETCH)") || stepper;
        }

        // ── Step body — buildStepBody is async (Ajax call) ──────────────
        //   Initial render shows a Loader; the Ajax response replaces it
        //   via the body container's setContent post-mount.
        var bodyBox = buildStepBodyContainer(d);

        // ── Outer vertical stack ────────────────────────────────────────
        var children = [title, subtitle, stepperBox, bodyBox]
            .filter(function (c) { return c != null; });

        var stack = safeNew(d.SP, {
            items: children,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.L
        }, "StackPanel(outer)");

        if (!stack) return title || subtitle;

        // Wrap outer stack in a top-level ContentPanel for page padding +
        // STRETCH so it fills the available width.
        var page = safeNew(d.CP, {
            content: stack,
            horizontalAlignment: d.CP_HAlign.STRETCH,
            outerGap: d.CP_Gap.L
        }, "ContentPanel(page)");

        return page || stack;
    }

    /**
     * Custom step indicator built from primitives (Badge + Text +
     * StackPanel) rather than the UIF Stepper component.
     *
     * Background: 3 separate attempts to use component.Stepper produced
     * a silent-invisible result — no console errors, no exception, no
     * pixels. The Stepper.Options API (with `children`, `index`,
     * `descriptionGenerator`) appeared to construct cleanly but the
     * component never appeared in the DOM. Rather than spend more
     * cycles debugging an opaque component, we build the step strip
     * from documented primitives that demonstrably render.
     *
     * Structure per step:
     *   StackPanel(VERTICAL, alignment=CENTER, gap=XS) [
     *     Badge(content="1"|"2"|...|"✓", type=SOLID|SUBTLE),
     *     Text(label, type=STRONG when current, else DEFAULT),
     *     Text(sublabel, type=WEAK, size=S)
     *   ]
     *
     * Outer container:
     *   StackPanel(HORIZONTAL, justification=SPACE_BETWEEN, gap=M)
     */
    /**
     * core.Ajax may return either the parsed JSON body directly, or a
     * wrapper object like { status, statusText, data, responseHeaders }.
     * Probe both shapes so we don't care which one this UIF version
     * uses.
     */
    function extractPayload(response) {
        if (response == null) return null;
        // Direct: response IS the parsed body
        if (response.ok !== undefined || response.checks !== undefined ||
            response.error !== undefined) {
            return response;
        }
        // Wrapped: try common wrapper keys
        if (typeof response === 'object') {
            if (response.data && typeof response.data === 'object') return response.data;
            if (response.body && typeof response.body === 'object') return response.body;
            if (response.response && typeof response.response === 'object') return response.response;
            // Sometimes the response is a string that needs re-parse
            if (typeof response.responseText === 'string') {
                try { return JSON.parse(response.responseText); }
                catch (e) { /* fall through */ }
            }
        }
        if (typeof response === 'string') {
            try { return JSON.parse(response); }
            catch (e) { return null; }
        }
        return null;
    }

    /**
     * Step-router for the body content. Dispatches on CURRENT_STEP and
     * builds the appropriate per-step UI. Stash the outer container on
     * a module-level variable so async actions can swap its content.
     */
    function buildStepBodyContainer(d) {
        var initial;
        if (CURRENT_STEP === 1) {
            initial = safeNew(component.Loader, {
                label: "Running prerequisite checks…",
                indeterminate: true
            }, "Loader(prereqs)") || safeNew(d.T, {
                text: "Loading prerequisite checks…"
            }, "Text(loading-fallback)");
        } else if (CURRENT_STEP === 2) {
            initial = buildStep2Form(d);
        } else if (CURRENT_STEP === 3) {
            initial = buildStep3Form(d);
        } else if (CURRENT_STEP === 4) {
            initial = buildStep4Form(d);
        } else if (CURRENT_STEP === 5) {
            initial = buildStep5Activate(d);
        } else {
            initial = safeNew(d.T, {
                text: "Step " + CURRENT_STEP + " not implemented.",
                type: d.T_Type.WEAK
            }, "Text(stub-step-" + CURRENT_STEP + ")");
        }

        // Wrap content + navigation footer (Back/Continue) in a vertical
        // StackPanel so the footer sits below whatever the step renders.
        var stack = safeNew(d.SP, {
            items: [initial, buildNavFooter(d)]
                .filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.L
        }, "StackPanel(body+footer)");

        var box = safeNew(d.CP, {
            content: stack || initial,
            horizontalAlignment: d.CP_HAlign.STRETCH,
            outerGap: d.CP_Gap.L
        }, "ContentPanel(body)");

        bodyContainer = box;
        return box;
    }

    /**
     * Back / Continue button row at the bottom of every step.
     * Step 1: no Back; Step N>1: Back goes to N-1; Continue advances
     * (with per-step validation/save in onContinueClick).
     */
    function buildNavFooter(d) {
        var ButtonType = (component.Button && component.Button.Type) || {};

        var backBtn = (CURRENT_STEP > 1) ? safeNew(component.Button, {
            label: "Back",
            type: ButtonType.DEFAULT,
            action: function () { goToStep(CURRENT_STEP - 1); }
        }, "Button(back)") : null;

        var nextBtn = (CURRENT_STEP < STEPS.length) ? safeNew(component.Button, {
            label: "Continue",
            type: ButtonType.PRIMARY,
            action: function () { onContinueClick(); }
        }, "Button(continue)") : null;

        var items = [backBtn, nextBtn]
            .filter(function (c) { return c != null; });
        if (items.length === 0) return null;

        return safeNew(d.SP, {
            items: items,
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.M
        }, "StackPanel(nav-footer)");
    }

    /**
     * Per-step Continue logic. Step 1 has no validation server-side
     * (the prereqs were already loaded; admin chose to advance). Steps
     * 2 + 3 dispatch the Save action; if it returns ok, advance.
     */
    function onContinueClick() {
        if (CURRENT_STEP === 1) {
            goToStep(2);
            return;
        }
        if (CURRENT_STEP === 2) {
            wizardCall('wizardSavePublicIds', {
                accountSid:   STATE.step2.accountSid,
                apiKeySid:    STATE.step2.apiKeySid,
                apiSecretId:  STATE.step2.apiSecretId
            }).then(function (payload) {
                if (payload && payload.saved) goToStep(3);
                else alert("Save failed: " +
                    ((payload && payload.error) || 'unknown'));
            }).catch(function (e) {
                alert("Network error saving Step 2: " +
                    (e && e.message ? e.message : String(e)));
            });
            return;
        }
        if (CURRENT_STEP === 3) {
            wizardCall('wizardSaveVoice', {
                twimlAppSid:     STATE.step3.twimlAppSid,
                phoneNumber:     STATE.step3.phoneNumber,
                intelServiceSid: STATE.step3.intelServiceSid
            }).then(function (payload) {
                if (payload && payload.saved) goToStep(4);
                else alert("Save failed: " +
                    ((payload && payload.error) || 'unknown'));
            }).catch(function (e) {
                alert("Network error saving Step 3: " +
                    (e && e.message ? e.message : String(e)));
            });
            return;
        }
        if (CURRENT_STEP === 4) {
            // Translate STATE.step4.assignments map → API payload shape
            var rows = [];
            var phoneNumbers = STATE.step4.phoneNumbers || [];
            for (var i = 0; i < phoneNumbers.length; i++) {
                var pn = phoneNumbers[i];
                var assignment = STATE.step4.assignments[pn.sid] || {};
                var employeeIds = assignment.employeeIds || [];
                // Only include rows where at least one employee is assigned;
                // empty rows shouldn't generate noise in the rep_assignment table
                if (employeeIds.length === 0) continue;
                rows.push({
                    phoneSid: pn.sid,
                    phoneNumber: pn.phoneNumber,
                    label: assignment.label || pn.friendlyName || '',
                    employeeIds: employeeIds,
                    primaryEmployeeId: assignment.primaryEmployeeId || employeeIds[0]
                });
            }
            wizardCall('wizardSaveAssignments', { assignments: rows })
            .then(function (payload) {
                if (payload && payload.saved) goToStep(5);
                else alert("Save failed: " +
                    ((payload && payload.error) || 'unknown'));
            }).catch(function (e) {
                alert("Network error saving Step 4: " +
                    (e && e.message ? e.message : String(e)));
            });
            return;
        }
        goToStep(CURRENT_STEP + 1);
    }

    /* ────────────────────────────────────────────────────────────────── */
    /* Step 2 — Connect Twilio                                            */
    /* ────────────────────────────────────────────────────────────────── */

    function buildStep2Form(d) {
        var rows = [];

        rows.push(safeNew(d.H, {
            content: "Connect to your Twilio account",
            type: d.H_Type.MEDIUM_HEADING
        }, "Heading(step2)"));

        rows.push(safeNew(d.T, {
            text: "Enter your Twilio Account SID and API Key SID. " +
                  "The API Key Secret must already exist in NetSuite " +
                  "API Secrets (Setup > Company > API Secrets) — paste " +
                  "its script ID below. Live validation against Twilio " +
                  "runs at Step 6 (Test & activate) using the configured " +
                  "secret pointer — no need to paste the secret value here."
        }, "Text(step2-intro)"));

        rows.push(buildTextField('Account SID', 'AC...',
            STATE.step2.accountSid,
            function (v) { STATE.step2.accountSid = v; }));

        rows.push(buildTextField('API Key SID', 'SK...',
            STATE.step2.apiKeySid,
            function (v) { STATE.step2.apiKeySid = v; }));

        rows.push(buildTextField('API Key Secret script ID',
            'custsecret_...',
            STATE.step2.apiSecretId,
            function (v) { STATE.step2.apiSecretId = v; }));

        return safeNew(d.SP, {
            items: rows.filter(function (r) { return r != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.M
        }, "StackPanel(step2)");
    }

    /* ────────────────────────────────────────────────────────────────── */
    /* Step 3 — Voice config                                              */
    /* ────────────────────────────────────────────────────────────────── */

    function buildStep3Form(d) {
        var rows = [];

        rows.push(safeNew(d.H, {
            content: "Voice configuration",
            type: d.H_Type.MEDIUM_HEADING
        }, "Heading(step3)"));

        rows.push(safeNew(d.T, {
            text: "Pick the TwiML application, default outbound caller " +
                  "ID, and (optional) Conversational Intelligence " +
                  "service from your Twilio account. These are fetched " +
                  "live from Twilio using the secure API Secret " +
                  "configured in Step 2 — the secret value never leaves " +
                  "NetSuite's vault."
        }, "Text(step3-intro)"));

        // Loading state — lists not yet fetched.
        if (STATE.step3.twimlApps === null ||
            STATE.step3.phoneNumbers === null ||
            STATE.step3.intelServices === null) {
            var loader = safeNew(component.Loader, {
                label: "Loading from Twilio…",
                indeterminate: true
            }, "Loader(step3-lists)");
            if (loader) rows.push(loader);
            else rows.push(safeNew(d.T, {
                text: "Loading from Twilio…"
            }, "Text(loading-fallback)"));

            return safeNew(d.SP, {
                items: rows.filter(function (r) { return r != null; }),
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, "StackPanel(step3-loading)");
        }

        // Error state — at least one list failed.
        if (STATE.step3.listLoadError) {
            rows.push(safeNew(d.T, {
                text: "✕ Could not load Twilio lists: " +
                    STATE.step3.listLoadError + ". Verify the API " +
                    "Secret value is set at Setup > Company > API " +
                    "Secrets, then go back to Step 2 and Continue " +
                    "again to retry.",
                type: d.T_Type.STRONG
            }, "Text(step3-error)"));

            return safeNew(d.SP, {
                items: rows.filter(function (r) { return r != null; }),
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, "StackPanel(step3-error)");
        }

        // Loaded — render dropdowns.
        rows.push(buildDropdownField(d, 'TwiML Application',
            STATE.step3.twimlApps,
            STATE.step3.twimlAppSid,
            function (sid) { STATE.step3.twimlAppSid = sid; }));

        rows.push(buildDropdownField(d, 'Default outbound caller ID',
            STATE.step3.phoneNumbers.map(function (n) {
                return { value: n.phoneNumber,
                         label: n.phoneNumber +
                                (n.friendlyName ? ' — ' + n.friendlyName : '') };
            }),
            STATE.step3.phoneNumber,
            function (val) { STATE.step3.phoneNumber = val; },
            { valueIsString: true }));

        rows.push(buildDropdownField(d,
            'Conversational Intelligence Service (optional)',
            STATE.step3.intelServices,
            STATE.step3.intelServiceSid,
            function (sid) { STATE.step3.intelServiceSid = sid; },
            { allowEmpty: true }));

        return safeNew(d.SP, {
            items: rows.filter(function (r) { return r != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.M
        }, "StackPanel(step3)");
    }

    /**
     * Fire the three list-fetch actions in parallel. Populate STATE
     * and rerender when each resolves. Called from goToStep when
     * advancing INTO Step 3.
     */
    function loadStep3Lists() {
        // Reset to loading state
        STATE.step3.twimlApps = null;
        STATE.step3.phoneNumbers = null;
        STATE.step3.intelServices = null;
        STATE.step3.listLoadError = null;

        function handle(field, payload) {
            if (payload && payload.items) {
                STATE.step3[field] = payload.items;

                // Sync the first item's value to STATE so Continue sees
                // a valid selection even if the admin never touched the
                // dropdown. UIF's onSelectionChanged only fires on USER
                // interaction — not on the constructor's selectedValue
                // default — so STATE would otherwise stay empty when
                // the admin accepts the default.
                if (payload.items.length > 0) {
                    if (field === 'twimlApps' && !STATE.step3.twimlAppSid) {
                        STATE.step3.twimlAppSid = payload.items[0].sid;
                    }
                    if (field === 'phoneNumbers' && !STATE.step3.phoneNumber) {
                        STATE.step3.phoneNumber = payload.items[0].phoneNumber;
                    }
                    // intelServiceSid stays empty by default — that field
                    // is optional (allowEmpty: true on the dropdown)
                }
            } else {
                STATE.step3[field] = [];
                if (payload && payload.errorMessage) {
                    STATE.step3.listLoadError = payload.errorMessage;
                }
            }
            // Re-render once all three settle (or when the last one lands)
            if (STATE.step3.twimlApps !== null &&
                STATE.step3.phoneNumbers !== null &&
                STATE.step3.intelServices !== null) {
                rerender();
            }
        }

        wizardCall('wizardListTwiMLApps', {})
            .then(function (p) { handle('twimlApps', p); })
            .catch(function (e) {
                STATE.step3.listLoadError = 'TwiML apps: ' +
                    (e && e.message ? e.message : String(e));
                handle('twimlApps', null);
            });

        wizardCall('wizardListPhoneNumbers', {})
            .then(function (p) { handle('phoneNumbers', p); })
            .catch(function (e) {
                STATE.step3.listLoadError = 'Phone numbers: ' +
                    (e && e.message ? e.message : String(e));
                handle('phoneNumbers', null);
            });

        wizardCall('wizardListIntelServices', {})
            .then(function (p) { handle('intelServices', p); })
            .catch(function (e) {
                STATE.step3.listLoadError = 'Intel services: ' +
                    (e && e.message ? e.message : String(e));
                handle('intelServices', null);
            });
    }

    /**
     * Build a Field-like Dropdown row. Items can be either:
     *   - List of { sid, friendlyName, ... } (Twilio resource shape) — uses
     *     `sid` as value, "<friendlyName> — <sid>" as display
     *   - List of { value, label } (already-shaped) — uses as-is when
     *     opts.valueIsString = true
     */
    function buildDropdownField(d, label, items, currentValue, onChange, opts) {
        opts = opts || {};

        // Normalize items to { value, label }
        var normalized = (items || []).map(function (it) {
            if (opts.valueIsString) return it; // already { value, label }
            return {
                value: it.sid,
                label: (it.friendlyName || '(unnamed)') +
                    (it.sid ? '  [' + it.sid + ']' : '')
            };
        });

        if (normalized.length === 0) {
            return safeNew(component.StackPanel, {
                items: [
                    safeNew(component.Text, { text: label,
                        type: component.Text.Type.STRONG,
                        size: component.Text.Size.S
                    }, "Text(label-" + label + ")"),
                    safeNew(component.Text, {
                        text: "(no items found in Twilio for this account)",
                        type: component.Text.Type.WEAK,
                        size: component.Text.Size.S
                    }, "Text(empty-" + label + ")")
                ].filter(function (c) { return c != null; }),
                orientation: component.StackPanel.Orientation.VERTICAL,
                itemGap: component.StackPanel.GapSize.XXS
            }, "StackPanel(empty-" + label + ")");
        }

        var ds = new core.ArrayDataSource(normalized);

        var dropdown = safeNew(component.Dropdown, {
            dataSource: ds,
            valueMember: 'value',
            displayMember: 'label',
            selectedValue: currentValue || (opts.allowEmpty ? null : normalized[0].value),
            allowEmpty: !!opts.allowEmpty,
            placeholder: opts.allowEmpty ? '(none)' : 'Select…',
            onSelectionChanged: function (args) {
                onChange(args && args.value);
            }
        }, "Dropdown(" + label + ")");

        if (!dropdown) {
            // Fallback to TextBox if Dropdown construction fails (shouldn't,
            // but gives a usable form so admin can complete the wizard)
            return buildTextField(label, '', currentValue || '', onChange);
        }

        var lblText = safeNew(component.Text, {
            text: label,
            type: component.Text.Type.STRONG,
            size: component.Text.Size.S
        }, "Text(label-" + label + ")");

        return safeNew(component.StackPanel, {
            items: [lblText, dropdown].filter(function (c) { return c != null; }),
            orientation: component.StackPanel.Orientation.VERTICAL,
            itemGap: component.StackPanel.GapSize.XXS
        }, "StackPanel(field-" + label + ")") || dropdown;
    }

    /* ────────────────────────────────────────────────────────────────── */
    /* Step 4 — Phone numbers + rep assignments                           */
    /* ────────────────────────────────────────────────────────────────── */

    function buildStep4Form(d) {
        var rows = [];

        rows.push(safeNew(d.H, {
            content: "Phone numbers & rep assignments",
            type: d.H_Type.MEDIUM_HEADING
        }, "Heading(step4)"));

        rows.push(safeNew(d.T, {
            text: "Assign reps to your Twilio phone numbers. Each rep " +
                  "with a number assigned will use it as their outbound " +
                  "caller ID. Reps without an assignment fall back to " +
                  "the default caller ID set in Step 3."
        }, "Text(step4-intro)"));

        // Loading state
        if (STATE.step4.phoneNumbers === null ||
            STATE.step4.employees === null) {
            var loader = safeNew(component.Loader, {
                label: "Loading phone numbers and employees…",
                indeterminate: true
            }, "Loader(step4)");
            if (loader) rows.push(loader);
            return safeNew(d.SP, {
                items: rows.filter(function (r) { return r != null; }),
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, "StackPanel(step4-loading)");
        }

        // Error state
        if (STATE.step4.listLoadError) {
            rows.push(safeNew(d.T, {
                text: "✕ " + STATE.step4.listLoadError,
                type: d.T_Type.STRONG
            }, "Text(step4-error)"));
            return safeNew(d.SP, {
                items: rows.filter(function (r) { return r != null; }),
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, "StackPanel(step4-error)");
        }

        if (STATE.step4.phoneNumbers.length === 0) {
            rows.push(safeNew(d.T, {
                text: "(no phone numbers owned by this Twilio account — " +
                      "buy one in Twilio Console before continuing)",
                type: d.T_Type.WEAK
            }, "Text(step4-empty)"));
            return safeNew(d.SP, {
                items: rows.filter(function (r) { return r != null; }),
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, "StackPanel(step4-empty)");
        }

        // One row per phone number
        for (var i = 0; i < STATE.step4.phoneNumbers.length; i++) {
            var pn = STATE.step4.phoneNumbers[i];
            rows.push(buildStep4AssignmentRow(d, pn));
        }

        return safeNew(d.SP, {
            items: rows.filter(function (r) { return r != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.L
        }, "StackPanel(step4)");
    }

    function buildStep4AssignmentRow(d, phoneNumber) {
        var current = STATE.step4.assignments[phoneNumber.sid] || {};
        var employees = STATE.step4.employees || [];

        var pnLabel = safeNew(d.T, {
            text: phoneNumber.phoneNumber +
                (phoneNumber.friendlyName ? '  —  ' + phoneNumber.friendlyName : ''),
            type: d.T_Type.STRONG
        }, "Text(step4-pn-" + phoneNumber.sid + ")");

        // Multi-select employee picker via MultiselectDropdown
        var dataItems = employees.map(function (e) {
            return { value: e.id, label: e.name +
                (e.email ? ' (' + e.email + ')' : '') };
        });

        var ds = new core.ArrayDataSource(dataItems);
        var selectedItems = (current.employeeIds || []).map(function (id) {
            return { value: id, label: lookupEmployeeName(id) };
        });

        var picker = safeNew(component.MultiselectDropdown, {
            dataSource: ds,
            valueMember: 'value',
            displayMember: 'label',
            selectedItems: selectedItems,
            placeholder: 'Assign reps…',
            onSelectionChanged: function (args) {
                var items = (args && args.items) || [];
                var ids = items.map(function (it) {
                    return (it && (it.value != null ? it.value : it));
                });
                if (!STATE.step4.assignments[phoneNumber.sid]) {
                    STATE.step4.assignments[phoneNumber.sid] = {};
                }
                STATE.step4.assignments[phoneNumber.sid].employeeIds = ids;
                // Default primary to first selected if not already set
                var a = STATE.step4.assignments[phoneNumber.sid];
                if (!a.primaryEmployeeId || ids.indexOf(a.primaryEmployeeId) === -1) {
                    a.primaryEmployeeId = ids.length > 0 ? ids[0] : null;
                }
            }
        }, "MultiselectDropdown(emp-" + phoneNumber.sid + ")");

        var children = [pnLabel, picker].filter(function (c) { return c != null; });
        return safeNew(d.SP, {
            items: children,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.XS
        }, "StackPanel(step4-row-" + phoneNumber.sid + ")");
    }

    function lookupEmployeeName(id) {
        var employees = STATE.step4.employees || [];
        for (var i = 0; i < employees.length; i++) {
            if (Number(employees[i].id) === Number(id)) return employees[i].name;
        }
        return '(id ' + id + ')';
    }

    function loadStep4Lists() {
        // Reset
        STATE.step4.phoneNumbers = null;
        STATE.step4.employees = null;
        STATE.step4.assignments = {};
        STATE.step4.listLoadError = null;

        function rerenderIfReady() {
            if (STATE.step4.phoneNumbers !== null &&
                STATE.step4.employees !== null) {
                rerender();
            }
        }

        wizardCall('wizardListPhoneNumbers', {})
            .then(function (p) {
                STATE.step4.phoneNumbers = (p && p.items) || [];
                if (p && p.errorMessage) STATE.step4.listLoadError = p.errorMessage;
                rerenderIfReady();
            }).catch(function (e) {
                STATE.step4.phoneNumbers = [];
                STATE.step4.listLoadError = 'Phone numbers: ' +
                    (e && e.message ? e.message : String(e));
                rerenderIfReady();
            });

        wizardCall('wizardListEmployees', {})
            .then(function (p) {
                STATE.step4.employees = (p && p.items) || [];
                if (p && p.errorMessage) STATE.step4.listLoadError = p.errorMessage;
                rerenderIfReady();
            }).catch(function (e) {
                STATE.step4.employees = [];
                STATE.step4.listLoadError = 'Employees: ' +
                    (e && e.message ? e.message : String(e));
                rerenderIfReady();
            });

        // Load existing assignments so revisits show prior state
        wizardCall('wizardLoadAssignments', {})
            .then(function (p) {
                var items = (p && p.items) || [];
                var map = {};
                items.forEach(function (a) {
                    if (!map[a.phoneSid]) {
                        map[a.phoneSid] = {
                            employeeIds: [],
                            label: a.label || '',
                            primaryEmployeeId: null
                        };
                    }
                    var empId = Number(a.employeeId);
                    map[a.phoneSid].employeeIds.push(empId);
                    if (a.isPrimary) map[a.phoneSid].primaryEmployeeId = empId;
                });
                STATE.step4.assignments = map;
                // Don't rerender on this one — phoneNumbers/employees
                // arrival triggers the render and picks up assignments
                // synchronously since they're already in STATE.
            }).catch(function () { /* ignore — non-fatal */ });
    }

    /* ────────────────────────────────────────────────────────────────── */
    /* Step 5 — Test & activate (review + preflight + activate)           */
    /* ────────────────────────────────────────────────────────────────── */

    function buildStep5Activate(d) {
        var rows = [];

        rows.push(safeNew(d.H, {
            content: "Test & activate",
            type: d.H_Type.MEDIUM_HEADING
        }, "Heading(step5)"));

        // If activated, show success state
        if (STATE.step5.activated) {
            rows.push(safeNew(d.T, {
                text: "✓ Click-to-Call is active. Sales reps can now use " +
                      "the phone icon on Customer, Lead, and Contact " +
                      "records.",
                type: d.T_Type.STRONG
            }, "Text(activated)"));
            return safeNew(d.SP, {
                items: rows.filter(function (r) { return r != null; }),
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, "StackPanel(step5-activated)");
        }

        // Loading state (preflight running)
        if (STATE.step5.loading) {
            var loader = safeNew(component.Loader, {
                label: "Running preflight checks…",
                indeterminate: true
            }, "Loader(step5)");
            if (loader) rows.push(loader);
            return safeNew(d.SP, {
                items: rows.filter(function (r) { return r != null; }),
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, "StackPanel(step5-loading)");
        }

        // ── Configuration review section ─────────────────────────────
        if (STATE.step5.snapshot) {
            rows.push(safeNew(d.H, {
                content: "Configuration review",
                type: d.H_Type.SMALL_HEADING
            }, "Heading(review)"));

            var snap = STATE.step5.snapshot;
            var assignmentCount = (STATE.step5.assignments || []).length;
            var phoneNumbersWithReps = {};
            (STATE.step5.assignments || []).forEach(function (a) {
                if (a.phoneSid) phoneNumbersWithReps[a.phoneSid] = true;
            });

            var lines = [
                'Account SID:        ' + (snap.accountSid || '(not set)'),
                'API Key SID:        ' + (snap.apiKeySid || '(not set)'),
                'API Key Secret:     ' + (snap.apiSecretId || '(not set)'),
                'TwiML Application:  ' + (snap.twimlAppSid || '(not set)'),
                'Default caller ID:  ' + (snap.phoneNumber || '(not set)'),
                'Intel Service:      ' + (snap.intelServiceSid || '(none)'),
                'Phone assignments:  ' + assignmentCount + ' rep(s) across ' +
                    Object.keys(phoneNumbersWithReps).length + ' number(s)'
            ];
            lines.forEach(function (l) {
                rows.push(safeNew(d.T, {
                    text: l,
                    type: d.T_Type.DEFAULT,
                    size: d.T && d.T.Size ? d.T.Size.S : undefined
                }, "Text(review-line)"));
            });
        }

        // ── Preflight checks section ─────────────────────────────────
        if (STATE.step5.preflight) {
            rows.push(safeNew(d.H, {
                content: "Preflight checks",
                type: d.H_Type.SMALL_HEADING
            }, "Heading(preflight)"));

            STATE.step5.preflight.forEach(function (check) {
                rows.push(buildCheckRow(check));
            });
        }

        // ── Activate button ──────────────────────────────────────────
        var allPassed = STATE.step5.preflight &&
            STATE.step5.preflight.every(function (c) { return c.status === 'pass'; });

        var activateBtn = safeNew(component.Button, {
            label: allPassed ? "Activate Click-to-Call"
                             : "Activate Click-to-Call (fix preflight first)",
            type: (component.Button && component.Button.Type)
                ? component.Button.Type.PRIMARY : undefined,
            enabled: allPassed,
            action: function () { onActivateClick(); }
        }, "Button(activate)");
        if (activateBtn) rows.push(activateBtn);

        if (STATE.step5.activateError) {
            rows.push(safeNew(d.T, {
                text: "✕ Activation failed: " + STATE.step5.activateError,
                type: d.T_Type.STRONG
            }, "Text(activate-error)"));
        }

        // Re-run preflight button (for transient failures)
        var rerunBtn = safeNew(component.Button, {
            label: "Re-run preflight",
            type: (component.Button && component.Button.Type)
                ? component.Button.Type.DEFAULT : undefined,
            action: function () { loadStep5(); }
        }, "Button(rerun-preflight)");
        if (rerunBtn) rows.push(rerunBtn);

        return safeNew(d.SP, {
            items: rows.filter(function (r) { return r != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.M
        }, "StackPanel(step5)");
    }

    function loadStep5() {
        STATE.step5.loading = true;
        STATE.step5.activateError = null;
        STATE.step5.snapshot = null;
        STATE.step5.assignments = null;
        STATE.step5.preflight = null;
        rerender();

        // U9 fix: previously these 3 calls fired in parallel and the
        // preflight callback was the sole rerender trigger. If
        // wizardLoadAssignments resolved AFTER wizardRunPreflight, the
        // Configuration Review rendered with `assignments === null`,
        // showing "0 rep(s) across 0 number(s)" even though saves
        // succeeded. Now: wait for ALL three to settle, then rerender
        // once with complete data.
        var settled = 0;
        function onSettled() {
            settled += 1;
            if (settled >= 3) {
                STATE.step5.loading = false;
                rerender();
            }
        }

        wizardCall('wizardSnapshot', {})
            .then(function (p) { STATE.step5.snapshot = p && p.snapshot; })
            .catch(function () { STATE.step5.snapshot = null; })
            .then(onSettled);

        wizardCall('wizardLoadAssignments', {})
            .then(function (p) { STATE.step5.assignments = (p && p.items) || []; })
            .catch(function () { STATE.step5.assignments = []; })
            .then(onSettled);

        wizardCall('wizardRunPreflight', {})
            .then(function (p) {
                STATE.step5.preflight = (p && p.checks) || [];
            }).catch(function (e) {
                STATE.step5.preflight = [{
                    id: 'network', label: 'Preflight call', status: 'fail',
                    detail: 'Network error: ' +
                        (e && e.message ? e.message : String(e))
                }];
            }).then(onSettled);
    }

    function onActivateClick() {
        wizardCall('wizardActivate', {})
        .then(function (payload) {
            if (payload && payload.activated) {
                STATE.step5.activated = true;
                STATE.step5.activateError = null;
            } else {
                STATE.step5.activateError =
                    (payload && payload.error) || 'unknown';
                if (payload && payload.failedChecks) {
                    STATE.step5.preflight = payload.failedChecks;
                }
            }
            rerender();
        }).catch(function (e) {
            STATE.step5.activateError = 'Network: ' +
                (e && e.message ? e.message : String(e));
            rerender();
        });
    }

    /* ────────────────────────────────────────────────────────────────── */
    /* Shared form helper                                                 */
    /* ────────────────────────────────────────────────────────────────── */

    function buildTextField(label, placeholder, currentValue, onChange) {
        var tb = safeNew(component.TextBox, {
            text: currentValue || '',
            placeholder: placeholder,
            onTextChanged: function (args) {
                onChange(args && args.text ? args.text : '');
            }
        }, "TextBox(" + label + ")");
        if (!tb) return null;

        var lbl = safeNew(component.Text, {
            text: label,
            type: component.Text.Type.STRONG,
            size: component.Text.Size ? component.Text.Size.S : undefined
        }, "Text(label-" + label + ")");

        return safeNew(component.StackPanel, {
            items: [lbl, tb].filter(function (c) { return c != null; }),
            orientation: component.StackPanel.Orientation.VERTICAL,
            itemGap: component.StackPanel.GapSize.XXS
        }, "StackPanel(field-" + label + ")") || tb;
    }


    /**
     * Render a vertical list of prerequisite check rows.
     * Each row: pass/fail icon + label + detail (+ repair hint if any).
     */
    function buildPrereqsList(checks) {
        var rows = checks.map(function (c) { return buildCheckRow(c); })
                         .filter(function (r) { return r != null; });

        if (rows.length === 0) {
            return safeNew(component.Text, {
                text: "No checks returned."
            }, "Text(empty-checks)");
        }

        return safeNew(component.StackPanel, {
            items: rows,
            orientation: component.StackPanel.Orientation.VERTICAL,
            itemGap: component.StackPanel.GapSize.M
        }, "StackPanel(prereqs)");
    }

    /**
     * One check row. Status icon comes from a Badge (SOLID green-ish
     * for pass, SUBTLE for warn/info, SOLID red-ish for fail — within
     * the limits of Badge.Type's two-value enum).
     */
    function buildCheckRow(check) {
        var icon = badgeFor(check.status);

        var labelText = safeNew(component.Text, {
            text: check.label,
            type: component.Text.Type.STRONG
        }, "Text(row-label)");

        var detailText = check.detail ? safeNew(component.Text, {
            text: check.detail,
            type: component.Text.Type.WEAK,
            size: component.Text.Size.S
        }, "Text(row-detail)") : null;

        var hintText = check.repairHint ? safeNew(component.Text, {
            text: "→ " + check.repairHint,
            type: component.Text.Type.DEFAULT,
            size: component.Text.Size.S
        }, "Text(row-hint)") : null;

        var rightStackItems = [labelText, detailText, hintText]
            .filter(function (c) { return c != null; });

        var rightStack = safeNew(component.StackPanel, {
            items: rightStackItems,
            orientation: component.StackPanel.Orientation.VERTICAL,
            itemGap: component.StackPanel.GapSize.XXS
        }, "StackPanel(row-right)");

        var rowItems = [icon, rightStack]
            .filter(function (c) { return c != null; });

        return safeNew(component.StackPanel, {
            items: rowItems,
            orientation: component.StackPanel.Orientation.HORIZONTAL,
            alignment: component.StackPanel.Alignment.START,
            itemGap: component.StackPanel.GapSize.M
        }, "StackPanel(row)");
    }

    /**
     * Status badge: pass=✓, fail=✕, warn=!, info_enabled=ⓘ, info_disabled=○
     */
    function badgeFor(status) {
        var content, type;
        switch (status) {
            case 'pass':
                content = '✓';
                type = component.Badge.Type.SOLID;
                break;
            case 'fail':
                content = '✕';
                type = component.Badge.Type.SOLID;
                break;
            case 'warn':
                content = '!';
                type = component.Badge.Type.SOLID;
                break;
            case 'info_enabled':
                content = 'ⓘ';
                type = component.Badge.Type.SUBTLE;
                break;
            case 'info_disabled':
                content = '○';
                type = component.Badge.Type.SUBTLE;
                break;
            default:
                content = '?';
                type = component.Badge.Type.SUBTLE;
        }
        return safeNew(component.Badge, {
            content: content,
            type: type,
            size: component.Badge.Size.DEFAULT
        }, "Badge(status-" + status + ")");
    }

    /**
     * Error-state body content when the Ajax call fails or the server
     * returns ok=false.
     */
    function buildErrorBox(errorMessage) {
        return safeNew(component.Text, {
            text: "Could not load prerequisite checks: " + errorMessage,
            type: component.Text.Type.STRONG
        }, "Text(error)");
    }

    function buildStepper(d) {
        if (!d.SP || !d.T || !d.SI) {
            // Note: d.SI here is just used as a presence check (StepperItem
            // class) — we still want the badge if the rest fail.
        }

        var Badge = component.Badge;
        var BadgeType = (Badge && Badge.Type) || {};
        var BadgeSize = (Badge && Badge.Size) || {};
        var TextType = (d.T && d.T.Type) || {};
        var TextSize = (d.T && d.T.Size) || {};

        var SPAlign = (d.SP && d.SP.Alignment) || {};
        var SPJust = (d.SP && d.SP.Justification) || {};

        var pills = STEPS.map(function (s) {
            var isCurrent = (s.num === CURRENT_STEP);
            var isDone    = (s.num < CURRENT_STEP);

            var badge = safeNew(Badge, {
                content: isDone ? "✓" : String(s.num), // ✓ for done
                type: isCurrent || isDone
                    ? BadgeType.SOLID
                    : BadgeType.SUBTLE,
                size: BadgeSize.DEFAULT
            }, "Badge(" + s.num + ")");

            var label = safeNew(d.T, {
                text: s.label,
                type: isCurrent ? TextType.STRONG : TextType.DEFAULT
            }, "Text(label-" + s.num + ")");

            var sublabel = safeNew(d.T, {
                text: s.sub,
                type: TextType.WEAK,
                size: TextSize.S
            }, "Text(sub-" + s.num + ")");

            var pillItems = [badge, label, sublabel]
                .filter(function (c) { return c != null; });

            return safeNew(d.SP, {
                items: pillItems,
                orientation: d.SP_Orient.VERTICAL,
                alignment: SPAlign.CENTER,
                itemGap: d.SP_Gap.XS
            }, "StackPanel(pill-" + s.num + ")");
        }).filter(function (p) { return p != null; });

        if (pills.length === 0) return null;

        return safeNew(d.SP, {
            items: pills,
            orientation: d.SP_Orient.HORIZONTAL,
            justification: SPJust.SPACE_BETWEEN,
            itemGap: d.SP_Gap.M
        }, "StackPanel(stepper-strip)");
    }

    function safeNew(Ctor, options, label) {
        if (!Ctor) {
            console.log("[CTC Setup Wizard] " + label + " constructor " +
                "missing — skipping");
            return null;
        }
        try {
            return new Ctor(options);
        } catch (e) {
            console.log("[CTC Setup Wizard] " + label + " construction " +
                "failed:", e && e.message ? e.message : e,
                "— options:", options);
            return null;
        }
    }

    exports.run = run;
});
