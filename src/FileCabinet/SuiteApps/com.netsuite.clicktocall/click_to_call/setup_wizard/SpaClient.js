/* eslint-disable suitescript/script-type */
/**
 * @NApiVersion 2.1
 *
 * Setup Wizard v2 — SpaClient (UI polish pass).
 *
 * Render proven (commit 77c7da8 + render-3): scriptContext.setContent
 * with a StackPanel root renders. Confirmed:
 *   - GapSize.M = 'm' (lowercase string enum) via component.StackPanel.GapSize.M
 *   - component.Stepper.Item exists as a constructor
 *   - setContent is the visible-content slot; setLayout is page chrome
 *     (calling both with the same tree double-rendered)
 *
 * This pass:
 *   1. Outer StackPanel switches to VERTICAL orientation so heading /
 *      stepper / step body stack top-to-bottom (default horizontal
 *      squashed everything onto one line)
 *   2. Drops the experimental setLayout(root) call — setContent is enough
 *   3. Stepper uses Stepper.Item class instances (the class exists)
 *   4. Wraps content in a ContentPanel for padding + page chrome
 *   5. Logs the resolved orientation enum + ContentPanel availability
 *      so we can iterate if either doesn't render the way we expect
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
    var CURRENT_STEP = 1;

    var run = function (scriptContext) {
        try {
            console.log("[CTC Setup Wizard] === UI POLISH PASS ===");

            // Resolve enums up front.
            var SP = component.StackPanel;
            var GapSize = (SP && SP.GapSize) || {};
            var Orientation = (SP && SP.Orientation) || {};
            var GAP_M = GapSize.M;
            var GAP_L = GapSize.L;
            var VERTICAL = Orientation.VERTICAL;
            var HORIZONTAL = Orientation.HORIZONTAL;

            console.log("[CTC Setup Wizard] GAP_M=" + GAP_M +
                ", GAP_L=" + GAP_L +
                ", VERTICAL=" + VERTICAL +
                ", HORIZONTAL=" + HORIZONTAL);

            if (VERTICAL === undefined) {
                console.log("[CTC Setup Wizard] StackPanel.Orientation " +
                    "static keys:", SP && Object.keys(SP.Orientation || {}));
                logShape("component.StackPanel", SP);
            }

            var root = buildRoot({
                GAP_M: GAP_M,
                GAP_L: GAP_L,
                VERTICAL: VERTICAL,
                HORIZONTAL: HORIZONTAL
            });

            console.log("[CTC Setup Wizard] Mounting root:", root);
            scriptContext.setContent(root);
            console.log("[CTC Setup Wizard] setContent OK");
        } catch (e) {
            console.error("[CTC Setup Wizard] run() threw:", e);
        }
    };

    function buildRoot(enums) {
        var heading = safeNew(component.Heading, {
            text: "Click-to-Call Setup Wizard"
        }, "Heading");

        var subheading = safeNew(component.Text, {
            text: "Step " + CURRENT_STEP + " of " + STEPS.length + " — " +
                STEPS[CURRENT_STEP - 1].label
        }, "Text(sub)");

        var stepper = buildStepper(enums);

        var stepBody = safeNew(component.Text, {
            text: "Per-step UI ships in U3-U7. The render path is " +
                "confirmed working — scriptContext.setContent with UIF " +
                "components is the SPA mount API for this SuiteApp."
        }, "Text(body)");

        var children = [heading, subheading, stepper, stepBody]
            .filter(function (c) { return c != null; });

        // Outer wrapper: vertical StackPanel so children stack top-to-bottom.
        var stackOpts = { items: children };
        if (enums.VERTICAL !== undefined) stackOpts.orientation = enums.VERTICAL;
        if (enums.GAP_L !== undefined) stackOpts.itemGap = enums.GAP_L;

        var stack = safeNew(component.StackPanel, stackOpts,
            "StackPanel(vertical)");

        if (!stack) {
            // Last-resort fallback if orientation enum was wrong: try
            // without orientation set (default), accept horizontal squash
            // over total non-render.
            stack = safeNew(component.StackPanel,
                { items: children, itemGap: enums.GAP_L },
                "StackPanel(no orientation)");
        }

        // Wrap in ContentPanel for page padding + visual chrome.
        if (stack && component.ContentPanel) {
            var panel = safeNew(component.ContentPanel, {
                content: stack,
                outerGap: enums.GAP_L
            }, "ContentPanel");
            if (panel) return panel;
        }

        return stack || heading;
    }

    function buildStepper(enums) {
        if (!component.Stepper) return null;

        // Stepper.Item is a real class (confirmed in render-3 logs).
        var ItemCtor = component.Stepper && component.Stepper.Item;

        var items;
        if (ItemCtor) {
            items = STEPS.map(function (s) {
                return safeNew(ItemCtor, {
                    label: s.label,
                    description: s.sub,
                    done: s.num < CURRENT_STEP,
                    disabled: s.num > CURRENT_STEP
                }, "Stepper.Item(" + s.label + ")");
            }).filter(function (it) { return it != null; });
        } else {
            // Plain-object fallback (worked in render-3).
            items = STEPS.map(function (s) {
                return {
                    label: s.label,
                    description: s.sub,
                    done: s.num < CURRENT_STEP,
                    disabled: s.num > CURRENT_STEP
                };
            });
        }
        if (items.length === 0) return null;

        // Stepper stays horizontal — that's the wizard convention.
        var stepperOpts = {
            items: items,
            selectedStepIndex: CURRENT_STEP - 1
        };
        if (enums.HORIZONTAL !== undefined) {
            stepperOpts.orientation = enums.HORIZONTAL;
        }

        return safeNew(component.Stepper, stepperOpts, "Stepper");
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

    function logShape(name, obj) {
        if (obj == null) {
            console.log("[CTC Setup Wizard] " + name + " = (null/undef)");
            return;
        }
        if (typeof obj === 'function') {
            console.log("[CTC Setup Wizard] " + name +
                " static keys:", Object.keys(obj));
        } else if (typeof obj === 'object') {
            var keys = Object.keys(obj);
            console.log("[CTC Setup Wizard] " + name + " keys:", keys);
            keys.slice(0, 15).forEach(function (k) {
                var v = obj[k];
                if (typeof v !== 'object' && typeof v !== 'function') {
                    console.log("[CTC Setup Wizard]   " + name + "." +
                        k + " =", v);
                }
            });
        }
    }

    exports.run = run;
});
