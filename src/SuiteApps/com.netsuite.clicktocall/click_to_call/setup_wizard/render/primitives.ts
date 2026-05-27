// @ts-check
/**
 * Render primitives — leaf-level constructors used by every other
 * render helper in the SPA.
 *
 * Path B.3e-1 (2026-05-27) — first file in the render/ tree.
 * Extracted from SpaClient.ts. Currently contains just `safeNew`;
 * future sub-commits will add `buildStatCard` (with defensive
 * fallback dropped in favor of trusting native `Card.metric()`'s
 * typed availability).
 *
 * Why `primitives` (vs `shared` or `shell`)?
 *
 *   The render tree has three conceptual layers:
 *     - primitives:  leaf-level constructors with no UIF-component dependencies
 *                    of their own (safeNew, statCard primitives)
 *     - shared:      cross-section widgets (buildCheckRow, buildTextField,
 *                    buildErrorBox)
 *     - shell:       page-level scaffolding (rerender, wrapContent,
 *                    buildRailContentPane, buildPausedBanner)
 *
 *   safeNew is the smallest leaf — defensively constructs ANY UIF
 *   component class with try/catch + null-return on failure. Every
 *   other render helper in the SPA uses it.
 */

/**
 * Defensive UIF component constructor wrapper.
 *
 * Returns null instead of throwing when:
 *   - The constructor argument is falsy (component class unavailable
 *     in this UIF version)
 *   - The `new Ctor(options)` call itself throws (most often: missing
 *     required prop, invalid enum value)
 *
 * The original SpaClient.js used this pattern because the UIF type
 * catalog wasn't installed during development — Stepper / Card /
 * DataGrid availability was discovered at runtime. With Path A's
 * @oracle/netsuite-uif-types in place, the catalog IS knowable at
 * compile time, but safeNew still adds value:
 *
 *   - Catches construction failures from invalid options (a type
 *     catalog can't enforce every runtime constraint)
 *   - Standardizes the "null on failure" pattern so callers can
 *     `.filter(c => c != null)` arrays of children uniformly
 *   - Logs construction failures with a human-readable label for
 *     debugging in the browser console
 *
 * Path B.5 will revisit which `if (component.X)` guard sites can
 * drop in favor of typed direct instantiation. safeNew itself stays.
 *
 * @param Ctor    A UIF component class (e.g., component.StackPanel) or
 *                null/undefined if the class isn't available in this
 *                UIF version.
 * @param options The options object to pass to `new Ctor()`.
 * @param label   Human-readable label for the console log on failure.
 *                Convention: `"<ComponentName>(<purpose>)"` —
 *                e.g., `"StackPanel(row-right)"`.
 * @returns       The constructed component, or null on failure.
 */
// Using a generic so the return type matches the constructor's
// instance type when Ctor is known. The Ctor itself is typed loosely
// because the same wrapper is used for every UIF component class.
type AnyCtor = new (options?: object) => unknown;

export const safeNew = <T = unknown>(
    Ctor: AnyCtor | null | undefined,
    options: object,
    label: string
): T | null => {
    if (!Ctor) {
        console.log('[CTC Setup Wizard] ' + label + ' constructor missing — skipping');
        return null;
    }
    try {
        return new Ctor(options) as T;
    } catch (e) {
        const err = e as { message?: string };
        console.log('[CTC Setup Wizard] ' + label + ' construction failed:',
            err && err.message ? err.message : e,
            '— options:', options);
        return null;
    }
};
