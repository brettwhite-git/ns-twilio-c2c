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
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {reactivate} from '../../app/effects/console';

interface PausedBannerProps {
    /** Click handler for the Reactivate button. Defaults to the console.reactivate effect. */
    onReactivate?: () => void;
}

export const PausedBanner = (props: PausedBannerProps): core.VDom.Node => {
    const handleReactivate = props.onReactivate || ((): void => { reactivate(); });

    const bodyText = new component.Text({
        text: 'Reps cannot place calls until you reactivate. All ' +
              'config is preserved.'
    });

    const reactivateBtn = new component.Button({
        label: 'Reactivate',
        type: component.Button.Type.PRIMARY,
        action: handleReactivate
    });

    const contentRow = new component.StackPanel({
        items: [bodyText, reactivateBtn],
        orientation: component.StackPanel.Orientation.HORIZONTAL,
        itemGap: component.StackPanel.GapSize.L,
        justification: component.StackPanel.Justification.SPACE_BETWEEN,
        alignment: component.StackPanel.Alignment.CENTER
    } as never);

    const banner = new component.BannerMessage({
        title: 'Click-to-Call is paused',
        content: contentRow,
        type: component.BannerMessage.Type.WARNING,
        showCloseButton: false
    } as never);

    return banner as never;
};

export default PausedBanner;
