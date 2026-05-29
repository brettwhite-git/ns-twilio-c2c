/**
 * StatusIcon — SystemIcon image keyed by check status.
 *
 * Phase 5 (2026-05-28) — JSX replacement for the legacy `badgeFor`
 * helper in components/shared/shared.ts. Used by CheckRow and other
 * status-display widgets.
 *
 * Status mapping (mirrors the legacy behavior):
 *   pass          → STATUS_SUCCESS_FILLED + SUCCESS color
 *   fail          → STATUS_ERROR_FILLED   + DANGER color
 *   warn          → STATUS_WARNING_FILLED + WARNING color
 *   info_enabled  → STATUS_INFO_FILLED    + INFO color
 *   info_disabled → STATUS_INFO           + NEUTRAL color (outlined)
 *   default       → STATUS_INFO           + NEUTRAL color
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';

export type CheckStatus =
    | 'pass'
    | 'fail'
    | 'warn'
    | 'info_enabled'
    | 'info_disabled';

interface StatusIconProps {
    status: CheckStatus | string;
    size?: unknown;
}

export const StatusIcon = (props: StatusIconProps): core.VDom.Node => {
    let icon: unknown;
    let color: unknown;
    switch (props.status) {
        case 'pass':
            icon = core.SystemIcon.STATUS_SUCCESS_FILLED;
            color = core.ImageConstant.Color.SUCCESS;
            break;
        case 'fail':
            icon = core.SystemIcon.STATUS_ERROR_FILLED;
            color = core.ImageConstant.Color.DANGER;
            break;
        case 'warn':
            icon = core.SystemIcon.STATUS_WARNING_FILLED;
            color = core.ImageConstant.Color.WARNING;
            break;
        case 'info_enabled':
            icon = core.SystemIcon.STATUS_INFO_FILLED;
            color = core.ImageConstant.Color.INFO;
            break;
        case 'info_disabled':
            icon = core.SystemIcon.STATUS_INFO;
            color = core.ImageConstant.Color.NEUTRAL;
            break;
        default:
            icon = core.SystemIcon.STATUS_INFO;
            color = core.ImageConstant.Color.NEUTRAL;
    }

    return (
        <component.Image
            image={icon as never}
            size={(props.size || component.Image.Size.M) as never}
            color={color as never}
            presentation={true}
        />
    );
};

export default StatusIcon;
