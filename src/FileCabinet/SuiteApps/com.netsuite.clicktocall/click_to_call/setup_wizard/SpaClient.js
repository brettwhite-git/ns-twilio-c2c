/* eslint-disable suitescript/script-type */
/**
 * @NApiVersion 2.1
 *
 * Setup Wizard v2 — SpaClient (first real render).
 *
 * Diagnostic v2 (commit dc1575e) confirmed the mount API:
 *   scriptContext = { baseUrl, uifContext, setLayout, setContent,
 *                     setSupportedThemes }
 *   Mount point: scriptContext.setContent(rootComponent)
 *   UIF imperative construction works: `new component.X({...})` ✓
 *
 * This first-real-render version:
 *   - Builds a Stepper + Heading + placeholder Text content for the
 *     current step
 *   - Wraps everything in a StackPanel
 *   - Mounts via scriptContext.setContent
 *   - Each component construction is wrapped in try/catch so a single
 *     bad component option doesn't blank the page — we log and fall
 *     back to the next simpler thing
 *
 * Per-step business logic ships in U3-U7. This proves the render path
 * end-to-end and gives a visible "you reached the wizard" surface.
 */
define(["require", "exports", "@uif-js/core", "@uif-js/component"],
       function (require, exports, core, component) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.run = void 0;

    var STEPS = [
        { num: 1, label: 'Prerequisites',   sub: 'Setup checks' },
        { num: 2, label: 'Connect Twilio',  sub: 'SIDs & secrets' },
        { num: 3, label: 'Voice config',    sub: 'TwiML & caller ID' },
        { num: 4, label: 'Phone numbers',   sub: 'Claim & assign' },
        { num: 5, label: 'Reps & roles',    sub: 'Permissions' },
        { num: 6, label: 'Test & activate', sub: 'Go live' }
    ];

    // Until U3 wires the server-snapshot fetch, land on Step 1 (prereqs).
    // Resumability via config snapshot ships in U3.
    var CURRENT_STEP = 1;

    var run = function (scriptContext) {
        try {
            if (!scriptContext || typeof scriptContext.setContent !== 'function') {
                console.error("[CTC Setup Wizard] scriptContext.setContent " +
                    "is not a function — cannot mount. Keys:",
                    scriptContext ? Object.keys(scriptContext) : "(null)");
                return;
            }

            var root = buildRoot(component);
            console.log("[CTC Setup Wizard] mounting root component:", root);
            scriptContext.setContent(root);
            console.log("[CTC Setup Wizard] mount complete");
        } catch (e) {
            console.error("[CTC Setup Wizard] run() threw:", e);
            // Last-resort visible surface: bare heading via setContent.
            try {
                var fallback = new component.Heading({
                    text: "CTC Setup Wizard — rendering error: " +
                        (e && e.message ? e.message : String(e))
                });
                scriptContext.setContent(fallback);
            } catch (e2) {
                console.error("[CTC Setup Wizard] fallback render also " +
                    "failed:", e2);
            }
        }
    };

    /**
     * Compose the wizard root. Each layer is try/caught so partial
     * render is possible if the framework rejects an option shape.
     */
    function buildRoot(component) {
        var heading = safeNew(component.Heading, {
            text: "Click-to-Call Setup Wizard"
        }, "Heading");

        var subheading = safeNew(component.Text, {
            text: "Step " + CURRENT_STEP + " of " + STEPS.length + " — " +
                STEPS[CURRENT_STEP - 1].label
        }, "Text");

        var stepper = buildStepper(component);

        var stepContent = safeNew(component.Text, {
            text: "This step's UI ships in U3. The render path is " +
                "confirmed working — setContent mount via UIF " +
                "components is the right pattern for this SuiteApp."
        }, "Text(stepContent)");

        // Try to wrap in a StackPanel. If the children/items API isn't
        // what we guessed, fall back to a single component.
        var stackChildren = [heading, subheading, stepper, stepContent]
            .filter(function (c) { return c != null; });

        // Try several known-pattern children options in priority order.
        var stack = safeNew(component.StackPanel, {
            items: stackChildren,
            itemGap: 'M'
        }, "StackPanel(items)");

        if (!stack) {
            stack = safeNew(component.StackPanel, {
                children: stackChildren,
                itemGap: 'M'
            }, "StackPanel(children)");
        }

        // If StackPanel composition fails entirely, mount the heading
        // alone so we at least see *something* rendered.
        return stack || heading || subheading;
    }

    function buildStepper(component) {
        if (!component.Stepper) {
            console.log("[CTC Setup Wizard] component.Stepper not found; " +
                "skipping stepper");
            return null;
        }

        // StepperItem children
        var items = [];
        for (var i = 0; i < STEPS.length; i++) {
            var s = STEPS[i];
            var stepperItem = safeNew(component.StepperItem, {
                label: s.label,
                description: s.sub,
                done: (s.num < CURRENT_STEP),
                disabled: (s.num > CURRENT_STEP)
            }, "StepperItem(" + s.label + ")");
            if (stepperItem) items.push(stepperItem);
        }
        if (items.length === 0) return null;

        return safeNew(component.Stepper, {
            items: items,
            selectedStepIndex: CURRENT_STEP - 1
        }, "Stepper");
    }

    /**
     * Construct a UIF component with try/catch. Logs on failure and
     * returns null so the caller can fall back gracefully.
     */
    function safeNew(Ctor, options, label) {
        if (!Ctor) {
            console.log("[CTC Setup Wizard] " + label + " constructor " +
                "missing — skipping");
            return null;
        }
        try {
            var instance = new Ctor(options);
            return instance;
        } catch (e) {
            console.log("[CTC Setup Wizard] " + label + " construction " +
                "failed:", e && e.message ? e.message : e,
                "— options:", options);
            return null;
        }
    }

    exports.run = run;
});
