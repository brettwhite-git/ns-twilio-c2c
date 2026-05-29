/**
 * CheckRow — one preflight/drift check row.
 *
 * Phase 6 fix (2026-05-28) — refactored ternary-null siblings to
 * array-filter pattern. See StatCard.tsx for rationale.
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {StatusIcon} from './StatusIcon';

export interface CheckRowData {
    id?: string;
    label: string;
    status: string;
    detail?: string;
    repairHint?: string;
}

export const CheckRow = (props: { check: CheckRowData }): core.VDom.Node => {
    const {check} = props;

    const textColumnItems = [
        (
            <component.StackPanel.Item>
                <component.Text type={component.Text.Type.STRONG}>
                    {check.label}
                </component.Text>
            </component.StackPanel.Item>
        ),
        check.detail && (
            <component.StackPanel.Item>
                <component.Text
                    type={component.Text.Type.WEAK}
                    size={component.Text.Size.S}
                >
                    {check.detail}
                </component.Text>
            </component.StackPanel.Item>
        ),
        check.repairHint && (
            <component.StackPanel.Item>
                <component.Text size={component.Text.Size.S}>
                    {'→ ' + check.repairHint}
                </component.Text>
            </component.StackPanel.Item>
        )
    ].filter(Boolean);

    return (
        <component.StackPanel
            orientation={component.StackPanel.Orientation.HORIZONTAL}
            alignment={component.StackPanel.Alignment.START}
            itemGap={component.StackPanel.GapSize.M}
        >
            <component.StackPanel.Item>
                <StatusIcon status={check.status} />
            </component.StackPanel.Item>
            <component.StackPanel.Item>
                <component.StackPanel
                    orientation={component.StackPanel.Orientation.VERTICAL}
                    itemGap={component.StackPanel.GapSize.XXS}
                >
                    {textColumnItems as never}
                </component.StackPanel>
            </component.StackPanel.Item>
        </component.StackPanel>
    );
};

export default CheckRow;
