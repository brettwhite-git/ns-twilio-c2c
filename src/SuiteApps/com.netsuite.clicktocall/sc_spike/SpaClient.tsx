/**
 * @NApiVersion 2.1
 *
 * Sales Central spike (2026-11-21, throwaway): entry point. The page is
 * plain DOM (spikePage.ts) inside one HtmlWrapper; the question is the
 * dock, not UIF.
 */

import {HtmlWrapper} from '@uif-js/component';
import {buildSpikePage} from './spikePage';

interface SpaScriptContext {
    setContent: (content: unknown) => void;
    setLayout?: (mode: 'application' | 'natural') => void;
}

export const run = (context: SpaScriptContext): void => {
    const root = document.createElement('div');
    buildSpikePage(root, window);
    context.setContent(HtmlWrapper.ofElement(root));
};
