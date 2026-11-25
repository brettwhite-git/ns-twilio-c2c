/**
 * @NApiVersion 2.1
 *
 * Sales Central (slice 1): entry point. The page is plain DOM (app.ts) in
 * one HtmlWrapper, so it matches the ORCA boards exactly.
 */

import {HtmlWrapper} from '@uif-js/component';
import {startApp} from './app';

interface SpaScriptContext {
    setContent: (content: unknown) => void;
    setLayout?: (mode: 'application' | 'natural') => void;
}

export const run = (context: SpaScriptContext): void => {
    const root = document.createElement('div');
    startApp(root, window);
    context.setContent(HtmlWrapper.ofElement(root));
};
