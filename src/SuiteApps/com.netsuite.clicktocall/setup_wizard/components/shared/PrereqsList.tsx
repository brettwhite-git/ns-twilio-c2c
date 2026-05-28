/**
 * PrereqsList — vertical list of CheckRows.
 *
 * Phase 5 (2026-05-28) — JSX replacement for the legacy `buildPrereqsList`
 * helper in components/shared/shared.ts. Used by Step 1's prereqs render
 * and Step 5's preflight section.
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {CheckRow} from './CheckRow';
import type {CheckRowData} from './CheckRow';

interface PrereqsListProps {
    checks: CheckRowData[];
}

export const PrereqsList = (props: PrereqsListProps): core.VDom.Node => {
    const {checks} = props;

    if (!checks || checks.length === 0) {
        return (
            <component.Text type={component.Text.Type.WEAK}>
                No checks returned.
            </component.Text>
        );
    }

    return (
        <component.StackPanel
            orientation={component.StackPanel.Orientation.VERTICAL}
            itemGap={component.StackPanel.GapSize.M}
        >
            {checks.map((c, idx) => (
                <component.StackPanel.Item key={'check-' + (c.id || idx)}>
                    <CheckRow check={c} />
                </component.StackPanel.Item>
            ))}
        </component.StackPanel>
    );
};

export default PrereqsList;
