/**
 * PausedBanner — warning banner shown when snapshot.active === false.
 *
 * Phase 7 fix (2026-05-28) — switched to fully imperative construction
 * (`new BannerMessage({content: new StackPanel(...)})`) returned via the
 * spike-validated `{instance}` JSX child pattern. The JSX prop form
 * `<BannerMessage content={JSXElement} />` apparently doesn't serialize
 * the content JSX through to the runtime — only the title shows.
 * Matches the legacy buildPausedBanner in
 * `_archive/.../components/shared/shell.ts` exactly.
 *
 * 2026-11-03: Reactivate shows "Reactivating…" and is disabled while the
 * server re-runs preflight; a failure (and the failed checks) shows in
 * the banner, next to the button.
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {reactivate} from '../../app/effects/console';
import type {AppState} from '../../app/InitialState';
import {friendlyError} from './friendlyError';
import {buildFailedCheckLines} from './FailedChecks';

interface PausedBannerProps {
    /** Click handler for the Reactivate button. Defaults to the console.reactivate effect. */
    onReactivate?: () => void;
    /** Changes on every store dispatch so the banner re-renders. */
    tick?: number;
}

export const PausedBanner = (props: PausedBannerProps): core.VDom.Node => {
    const c = (store.getState() as AppState).console;
    const handleReactivate = props.onReactivate || ((): void => { reactivate('banner'); });

    const bodyText = new component.Text({
        text: 'Reps\' phones stop within about a minute; calls in progress finish. ' +
              'Calling stays off until you reactivate. All config is preserved.'
    });

    const reactivateBtn = new component.Button({
        label: c.reactivating ? 'Reactivating…' : 'Reactivate',
        type: component.Button.Type.PRIMARY,
        enabled: !c.reactivating,
        action: handleReactivate
    } as never);

    const contentRow = new component.StackPanel({
        items: [bodyText, reactivateBtn],
        orientation: component.StackPanel.Orientation.HORIZONTAL,
        itemGap: component.StackPanel.GapSize.L,
        justification: component.StackPanel.Justification.SPACE_BETWEEN,
        alignment: component.StackPanel.Alignment.CENTER
    } as never);

    const showError = !!c.reactivateError && c.reactivateSource === 'banner';
    const content = showError
        ? new component.StackPanel({
            items: [
                contentRow,
                new component.Text({
                    text: '✕ Reactivate failed: ' + friendlyError(c.reactivateError),
                    type: component.Text.Type.STRONG
                }),
                ...buildFailedCheckLines(c.reactivateFailedChecks)
            ],
            orientation: component.StackPanel.Orientation.VERTICAL,
            itemGap: component.StackPanel.GapSize.XS
        } as never)
        : contentRow;

    const banner = new component.BannerMessage({
        title: 'Click-to-Call is paused',
        content,
        type: component.BannerMessage.Type.WARNING,
        showCloseButton: false
    } as never);

    return banner as never;
};

export default PausedBanner;
