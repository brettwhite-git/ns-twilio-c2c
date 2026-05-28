/**
 * CheckRow — one preflight/drift check row.
 *
 * Phase 5 (2026-05-28) — JSX replacement for the legacy `buildCheckRow`
 * helper in components/shared/shared.ts. Used by Step5, HealthPage,
 * and the prereqs list.
 *
 * Layout: [StatusIcon, vertical-stack(label, detail, repairHint)] in a
 * horizontal StackPanel. Detail and repairHint are optional and omitted
 * when absent.
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
                    <component.StackPanel.Item>
                        <component.Text type={component.Text.Type.STRONG}>
                            {check.label}
                        </component.Text>
                    </component.StackPanel.Item>
                    {check.detail ? (
                        <component.StackPanel.Item>
                            <component.Text
                                type={component.Text.Type.WEAK}
                                size={component.Text.Size.S}
                            >
                                {check.detail}
                            </component.Text>
                        </component.StackPanel.Item>
                    ) : null}
                    {check.repairHint ? (
                        <component.StackPanel.Item>
                            <component.Text size={component.Text.Size.S}>
                                {'→ ' + check.repairHint}
                            </component.Text>
                        </component.StackPanel.Item>
                    ) : null}
                </component.StackPanel>
            </component.StackPanel.Item>
        </component.StackPanel>
    );
};

export default CheckRow;
