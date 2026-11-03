/**
 * Console hash routes — pure (no store, no UIF), so jest can test it.
 *
 *   #/overview · #/phones · #/inbound · #/outbound · #/transcripts ·
 *   #/health · #/account · #/setup/<1-5>
 *
 * Old hashes still open the right page: #/voice → #/outbound,
 * #/credentials → #/account (navigation.ts rewrites the hash with
 * replaceState, so the old hash leaves no history entry).
 */

import type {SectionName} from './InitialState';

export const SECTIONS: SectionName[] =
    ['overview', 'phones', 'inbound', 'outbound', 'transcripts', 'health', 'account'];

/** Old section paths and the page that replaced them. */
export const LEGACY_SECTIONS: Record<string, SectionName> = {
    voice: 'outbound',
    credentials: 'account'
};

export type HashRoute =
    | { kind: 'section'; section: SectionName; redirected?: boolean }
    | { kind: 'step'; step: number };

/**
 * Parse a location hash ('#/phones', '#/setup/3', '#/voice'). null = empty
 * or unknown. An old path gives its new section with redirected: true.
 */
export function parseHash(hash: string): HashRoute | null {
    const path = String(hash || '').replace(/^#\/?/, '').replace(/\/+$/, '');
    if (!path) return null;
    const step = /^setup\/([1-5])$/.exec(path);
    if (step) return { kind: 'step', step: Number(step[1]) };
    const section = SECTIONS.find((sec) => sec === path);
    if (section) return { kind: 'section', section };
    if (Object.prototype.hasOwnProperty.call(LEGACY_SECTIONS, path)) {
        return { kind: 'section', section: LEGACY_SECTIONS[path], redirected: true };
    }
    return null;
}

/** The hash a route shows in the address bar. */
export const hashFor = (route: HashRoute): string =>
    route.kind === 'section' ? '#/' + route.section : '#/setup/' + route.step;
