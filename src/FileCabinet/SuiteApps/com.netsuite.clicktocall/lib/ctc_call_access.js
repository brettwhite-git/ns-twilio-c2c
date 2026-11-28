/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Who may see one CTC Phone Call: the Reporting Central rule, shared by
 * the RESTlet's getCallDetail and the recording audio Suitelet so both
 * answer the same question the same way.
 *   - Manager scope (lib/ctc_rc_scope resolveOwnerScope gives ownerIds):
 *     the call's `assigned` employee is in the resolved team / member.
 *   - Own calls: the call's company is in the user's book (primary sales
 *     rep OR Sales Team member, lib/ctc_workspace_queries).
 * The team is read fresh for each call. Cost: team SuiteQL (10) + book
 * SuiteQL (10, own calls only).
 */
define(['./ctc_rc_scope', './ctc_workspace_queries'], (rcScope, workspaceQueries) => {

    /**
     * @param {Object} p
     * @param {string} p.companyId - the call's company internal id ('' when none)
     * @param {string} p.ownerId - the call's assigned employee internal id ('' when none)
     * @param {number|string} p.userId - session user
     * @param {number|string} p.role - session role
     * @param {string} [p.owner] - the page's owner param ('team' | 'me' | <employee id>)
     * @returns {boolean}
     */
    const isCallInScope = (p) => {
        rcScope.clearTeamCache();
        const scope = rcScope.resolveOwnerScope({
            userId: p.userId, role: p.role, owner: typeof p.owner === 'string' ? p.owner : ''
        });
        if (scope.ownerIds) {
            return !!p.ownerId && scope.ownerIds.indexOf(p.ownerId) !== -1;
        }
        if (!p.companyId) return false;
        return workspaceQueries.getBookCustomerIds({ userId: p.userId }).indexOf(p.companyId) !== -1;
    };

    return { isCallInScope };
});
