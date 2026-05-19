/* eslint-disable suitescript/script-type */
/**
 * @NApiVersion 2.1
 *
 * Setup Wizard v2 — DIAGNOSTIC client script.
 *
 * The earlier hand-authored "imperative API" attempt at this file
 * rendered a blank page because I guessed at the UIF method signatures
 * (Component.create({...}), addItem({item:x}), StackOrientation enum,
 * etc.) — none of which exist. UIF's authoring surface is React-style
 * JSX, which compiles to `new ComponentName(options)` constructor calls.
 * Without a JSX build chain (Babel + the @uif-js Babel preset), we
 * cannot hand-author UIF SPAs from this project today.
 *
 * THIS DIAGNOSTIC VERSION:
 *   1. Logs the full shape of `scriptContext` to the browser console
 *      so the next session can see exactly what's reachable.
 *   2. Tries the most likely mount patterns in order, logging which
 *      one succeeds (if any).
 *   3. Surfaces a visible error in the DOM if every pattern fails, so
 *      blank-page-no-feedback debugging stops here.
 *
 * Next session task: based on this diagnostic output, decide whether to
 *   (a) set up a JSX build chain locally and author the wizard properly
 *       in TSX/JSX (compile to AMD on deploy), or
 *   (b) revert to the Suitelet shell that was working before the SPA
 *       pivot and ship the wizard there with a proper centerlink for
 *       Setup > Click-to-Call menu placement.
 */
define(["require", "exports", "@uif-js/core", "@uif-js/component"],
       function (require, exports, core, component) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.run = void 0;

    var run = function (scriptContext) {
        try {
            console.log("[CTC Setup Wizard] SpaClient.run invoked");
            console.log("[CTC Setup Wizard] scriptContext keys:",
                scriptContext ? Object.keys(scriptContext) : "(null)");
            console.log("[CTC Setup Wizard] scriptContext:", scriptContext);
            console.log("[CTC Setup Wizard] @uif-js/core keys:",
                core ? Object.keys(core).slice(0, 30) : "(null)");
            console.log("[CTC Setup Wizard] @uif-js/component keys:",
                component ? Object.keys(component).slice(0, 30) : "(null)");

            // Try the most likely mount patterns. The first one that
            // doesn't throw wins. All others get caught and logged.
            var mounted = tryMountPatterns(scriptContext, component);

            if (!mounted) {
                fallbackVisibleError(scriptContext,
                    "UIF mount failed — see browser console for diagnostic output. " +
                    "All known mount patterns threw. Next session: pick a build-chain path OR revert to Suitelet.");
            }
        } catch (e) {
            console.error("[CTC Setup Wizard] run() threw:", e);
            try {
                fallbackVisibleError(scriptContext,
                    "Wizard initialization failed: " + (e && e.message ? e.message : String(e)));
            } catch (e2) {
                console.error("[CTC Setup Wizard] fallback error also threw:", e2);
            }
        }
    };

    function tryMountPatterns(scriptContext, component) {
        var patterns = [
            {
                name: "new Heading + scriptContext.rootContainer.addItem",
                fn: function () {
                    if (!component || !component.Heading) throw new Error("component.Heading undefined");
                    var heading = new component.Heading({ text: "CTC Setup Wizard — diagnostic mount A" });
                    scriptContext.rootContainer.addItem({ item: heading });
                }
            },
            {
                name: "new Heading + scriptContext.rootContainer.addItem(child) without wrapper",
                fn: function () {
                    var heading = new component.Heading({ text: "CTC Setup Wizard — diagnostic mount B" });
                    scriptContext.rootContainer.addItem(heading);
                }
            },
            {
                name: "new Text + scriptContext.addItem",
                fn: function () {
                    if (!scriptContext.addItem) throw new Error("scriptContext.addItem undefined");
                    var text = new component.Text({ text: "CTC Setup Wizard — diagnostic mount C" });
                    scriptContext.addItem({ item: text });
                }
            },
            {
                name: "new StackPanel with children option + rootContainer.addItem",
                fn: function () {
                    var stack = new component.StackPanel({
                        children: [
                            new component.Heading({ text: "CTC Setup Wizard — diagnostic mount D" })
                        ]
                    });
                    scriptContext.rootContainer.addItem({ item: stack });
                }
            },
            {
                name: "scriptContext.render(component)",
                fn: function () {
                    if (!scriptContext.render) throw new Error("scriptContext.render undefined");
                    scriptContext.render(new component.Heading({ text: "CTC Setup Wizard — diagnostic mount E" }));
                }
            }
        ];

        for (var i = 0; i < patterns.length; i++) {
            var p = patterns[i];
            try {
                p.fn();
                console.log("[CTC Setup Wizard] MOUNT SUCCESS via pattern: " + p.name);
                return true;
            } catch (e) {
                console.log("[CTC Setup Wizard] Pattern '" + p.name + "' failed:", e && e.message ? e.message : e);
            }
        }
        return false;
    }

    function fallbackVisibleError(scriptContext, message) {
        // Last-resort visible error path. UIF doesn't allow raw DOM, but
        // if we got here every other path already failed — try anyway.
        try {
            if (component && component.Banner) {
                var banner = new component.Banner({
                    title: "Setup Wizard error",
                    content: message,
                    color: "ORANGE"
                });
                scriptContext.rootContainer.addItem({ item: banner });
            }
        } catch (e) {
            console.error("[CTC Setup Wizard] Even Banner failed:", e);
        }
    }

    exports.run = run;
});
