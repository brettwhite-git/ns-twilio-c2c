/**
 * @NApiVersion 2.1
 * @NScriptType SpaServerScript
 *
 * Sales Central spike (2026-11-21, throwaway): server init. Logs who
 * opened it; the page fetches everything else itself.
 */

import runtime from 'N/runtime';
import log from 'N/log';

export const initializeSpa = (scriptContext: unknown): void => {
    void scriptContext;
    const user = runtime.getCurrentUser();
    log.audit({ title: 'CTC SC spike opened', details: 'user=' + user.id + ' role=' + user.role });
};
