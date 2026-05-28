/**
 * PausedBanner — warning banner shown when snapshot.active === false.
 *
 * Phase 5 (2026-05-28) — JSX replacement for the legacy `buildPausedBanner`
 * helper in components/shared/shell.ts. Uses component.BannerMessage
 * with Type.WARNING (Oracle-canonical semantic notification component).
 *
 * The Reactivate button rides inside the banner's `content` slot since
 * BannerMessage has no built-in action slot.
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

    const contentRow = (
        <component.StackPanel
            orientation={component.StackPanel.Orientation.HORIZONTAL}
            itemGap={component.StackPanel.GapSize.L}
            alignment={component.StackPanel.Alignment.CENTER}
        >
            <component.StackPanel.Item>
                <component.Text>
                    Reps cannot place calls until you reactivate. All
                    config is preserved.
                </component.Text>
            </component.StackPanel.Item>
            <component.StackPanel.Item>
                <component.Button
                    label="Reactivate"
                    type={component.Button.Type.PRIMARY}
                    action={handleReactivate}
                />
            </component.StackPanel.Item>
        </component.StackPanel>
    );

    return (
        <component.BannerMessage
            title="Click-to-Call is paused"
            content={contentRow as never}
            type={component.BannerMessage.Type.WARNING}
            showCloseButton={false}
        />
    );
};

export default PausedBanner;
