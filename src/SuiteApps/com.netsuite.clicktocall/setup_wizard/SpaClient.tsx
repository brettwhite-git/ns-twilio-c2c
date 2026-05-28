// @ts-check
/**
 * @NApiVersion 2.1
 *
 * Setup Wizard SPA — entry point.
 *
 * Path D-Store-3a (2026-05-27) — mirrors Oracle's airport360 canonical
 * 5-line SpaClient.tsx pattern. All app logic lives in <App />; this
 * file just sets the layout and mounts the root component.
 *
 * Before D-Store-3a, this file held all 1,377 lines of imperative
 * builder + handler + loader logic (the run() function). That code
 * moved to AppController.tsx (still imperative — JSX migration is
 * D-Store-3b); App.tsx wraps it in a PureComponent for UIF's canonical
 * setState-driven render model.
 */

import App from './App';

interface SpaScriptContext {
    setContent: (content: unknown) => void;
    setLayout?: (mode: 'application' | 'natural') => void;
}

export const run = (context: SpaScriptContext): void => {
    // U1.5: per the UIF catalog (Integration > SuiteApps > Code tips >
    // Layout), calling context.setLayout('application') makes the SPA
    // fill the entire viewport. Without it, 'natural' sizes the SPA to
    // its content height, and the rail's `rows: '100%'` collapses.
    try {
        if (typeof context.setLayout === 'function') {
            context.setLayout('application');
        }
    } catch (e) {
        console.warn("[CTC Setup Wizard] setLayout('application') failed; " +
            "rail may not fill viewport:", e);
    }
    context.setContent(<App />);
};
