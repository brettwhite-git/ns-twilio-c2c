/**
 * RailContentShell — page-level scroll + padding scaffolding.
 *
 * Phase 5 (2026-05-28) — JSX replacement for the legacy `wrapContent`
 * helper in components/shared/shell.ts. ScrollPanel(VERTICAL) wrapping a
 * ContentPanel whose `outerGap` is THE single source of truth for the
 * rail-edge → content margin across every section + step.
 *
 * Margin values (preserved from legacy):
 *   start    XXL (48px) — generous inset from rail's flush-left edge
 *   end      XXL (48px) — symmetric inset from browser right
 *   vertical M   (24px) — top + bottom inset
 *
 * Update the outerGap values here to change layout spacing across EVERY
 * page uniformly.
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';

interface RailContentShellProps {
    children?: core.VDom.Node | core.VDom.Node[];
}

export const RailContentShell = (props: RailContentShellProps): core.VDom.Node => {
    return (
        <component.ScrollPanel
            orientation={component.ScrollPanel.Orientation.VERTICAL}
        >
            <component.ContentPanel
                horizontalAlignment={component.ContentPanel.HorizontalAlignment.STRETCH}
                outerGap={{
                    start: component.ContentPanel.GapSize.XXL,
                    end: component.ContentPanel.GapSize.XXL,
                    vertical: component.ContentPanel.GapSize.M
                } as never}
            >
                {props.children as never}
            </component.ContentPanel>
        </component.ScrollPanel>
    );
};

export default RailContentShell;
