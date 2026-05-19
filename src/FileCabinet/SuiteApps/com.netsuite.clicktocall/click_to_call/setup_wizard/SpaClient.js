/* eslint-disable suitescript/script-type */
/**
 * @NApiVersion 2.1
 *
 * Setup Wizard v2 — DIAGNOSTIC v2 client script.
 *
 * Prior diagnostic (b79f43a) confirmed:
 *   - SpaClient.run is called with a scriptContext that has 5 keys
 *   - core / component each expose ~30+ keys (sliced)
 *   - scriptContext.rootContainer / .addItem / .render are ALL undefined
 *   - `new component.Banner({...})` actually constructs (got past lookup,
 *     failed only on prop validation: 'content' must be a Ra/xr instance,
 *     i.e. a UIF component instance not a raw string)
 *
 * So UIF imperative construction WORKS — we just have the wrong mount
 * model. This pass:
 *   1. Logs the actual key NAMES on scriptContext (not just count)
 *   2. Logs the FULL key arrays for core + component so we can find the
 *      Stepper / Text / StackPanel / Field exports
 *   3. Tries the return-the-tree pattern (SPA renders whatever run()
 *      returns) as the next mount hypothesis
 *   4. Wraps Banner.content in `new component.Text({...})` so the
 *      fallback path can actually render
 */
define(["require", "exports", "@uif-js/core", "@uif-js/component"],
       function (require, exports, core, component) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.run = void 0;

    var run = function (scriptContext) {
        try {
            console.log("[CTC Setup Wizard] === DIAGNOSTIC v2 ===");

            // 1. Log scriptContext shape with actual key names
            if (scriptContext) {
                var ctxKeys = Object.keys(scriptContext);
                console.log("[CTC Setup Wizard] scriptContext keys (" +
                    ctxKeys.length + "):", ctxKeys);
                ctxKeys.forEach(function (k) {
                    var v = scriptContext[k];
                    var t = typeof v;
                    console.log("[CTC Setup Wizard]   scriptContext." + k +
                        " (" + t + "):", v);
                });
            } else {
                console.log("[CTC Setup Wizard] scriptContext is null/undefined");
            }

            // 2. Log full key sets for core + component so we can find
            //    Heading, Text, StackPanel, Stepper, Button, etc.
            if (core) {
                var coreKeys = Object.keys(core).sort();
                console.log("[CTC Setup Wizard] core keys (" +
                    coreKeys.length + "):", coreKeys);
            }
            if (component) {
                var compKeys = Object.keys(component).sort();
                console.log("[CTC Setup Wizard] component keys (" +
                    compKeys.length + "):", compKeys);
            }

            // 3. Build a simple component tree and try BOTH:
            //    a. returning it (SPA-renders-the-return-value hypothesis)
            //    b. assigning it to scriptContext.content / .root / .view
            //       if those keys exist
            var heading = null;
            try {
                heading = new component.Heading({
                    text: "CTC Setup Wizard — DIAG v2 (return-the-tree)"
                });
                console.log("[CTC Setup Wizard] Constructed Heading OK:", heading);
            } catch (e) {
                console.log("[CTC Setup Wizard] Heading construction failed:",
                    e && e.message ? e.message : e);
            }

            // Try assigning to whichever scriptContext key might be the
            // mount slot. Iterate the actual keys and try common names.
            if (heading && scriptContext) {
                var tryAssignKeys = ['content', 'root', 'view', 'component',
                                     'children', 'body', 'main'];
                tryAssignKeys.forEach(function (key) {
                    if (key in scriptContext) {
                        try {
                            console.log("[CTC Setup Wizard] Attempting " +
                                "scriptContext." + key + " = heading");
                            scriptContext[key] = heading;
                            console.log("[CTC Setup Wizard]   assigned " +
                                "OK; value is now:", scriptContext[key]);
                        } catch (e) {
                            console.log("[CTC Setup Wizard]   assign to " +
                                key + " failed:",
                                e && e.message ? e.message : e);
                        }
                    } else {
                        console.log("[CTC Setup Wizard]   scriptContext." +
                            key + " not present, skipped");
                    }
                });

                // Try setter-style method calls on scriptContext for any
                // method-shaped keys (typeof === 'function').
                Object.keys(scriptContext).forEach(function (k) {
                    if (typeof scriptContext[k] === 'function') {
                        console.log("[CTC Setup Wizard] scriptContext." +
                            k + " is a function; signature unknown — " +
                            "skipping invocation until we know args");
                    }
                });
            }

            // Fallback Banner with a proper Text component as content.
            // Even if no mount happens, the framework MAY render whatever
            // we return from run().
            var bannerNode = null;
            try {
                bannerNode = new component.Banner({
                    title: "Setup Wizard diagnostic",
                    content: new component.Text({
                        text: "If you see this banner, run() return-value " +
                              "rendering works. If not, check console for " +
                              "scriptContext keys."
                    })
                });
                console.log("[CTC Setup Wizard] Banner constructed OK");
            } catch (e) {
                console.log("[CTC Setup Wizard] Banner construction failed:",
                    e && e.message ? e.message : e);
            }

            // Return the heading (or banner if heading failed) as the
            // last-chance render path.
            return heading || bannerNode;
        } catch (e) {
            console.error("[CTC Setup Wizard] run() threw:", e);
            return null;
        }
    };

    exports.run = run;
});
