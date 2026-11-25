/**
 * Sales Central: the place lives in the URL hash, so a reload (and phone
 * mode's u=) returns to it. '#needs', '#calls', '#needs/a/7' (drawer on
 * account 7).
 */

export type TabId = 'needs' | 'pipeline' | 'tasks' | 'calls' | 'money';
export const LIVE_TABS: TabId[] = ['needs', 'pipeline', 'tasks', 'calls'];

export interface Route { tab: TabId; account: string; }

export const parseRoute = (hash: string): Route => {
    const parts = String(hash || '').replace(/^#\/?/, '').split('/');
    const tab = (LIVE_TABS as string[]).indexOf(parts[0]) !== -1 ? parts[0] as TabId : 'needs';
    const account = parts[1] === 'a' && /^[0-9]{1,12}$/.test(parts[2] || '') ? parts[2] : '';
    return { tab, account };
};

export const formatRoute = (r: Route): string => '#' + r.tab + (r.account ? '/a/' + r.account : '');
