/**
 * @NApiVersion 2.1
 * @NScriptType SpaServerScript
 *
 * Sales Central: server init. Logs who opened it; the page fetches its data
 * from the ctc_rl_token RESTlet.
 */

import runtime from 'N/runtime';
import log from 'N/log';

export const initializeSpa = (scriptContext: unknown): void => {
    void scriptContext;
    const user = runtime.getCurrentUser();
    log.audit({ title: 'CTC Sales Central opened', details: 'user=' + user.id + ' role=' + user.role });
};
