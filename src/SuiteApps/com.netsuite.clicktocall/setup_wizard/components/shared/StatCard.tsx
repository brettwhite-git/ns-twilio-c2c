/**
 * StatCard — KPI card for the Overview dashboard.
 *
 * Phase 6 fix (2026-05-28) — refactored from `{cond ? Item : null}`
 * sibling pattern to array-filter pattern. StackPanel rejects `null`
 * children at runtime ("Invalid StackPanel item"); siblings must be
 * passed as a filtered array.
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';

export type StatCardTone = 'success' | 'warning' | 'info' | 'neutral';

interface StatCardProps {
    title: string;
    metric: string;
    description?: string;
    icon?: unknown;
    tone?: StatCardTone;
}

const toneToColor = (tone: StatCardTone | undefined): unknown => {
    switch (tone) {
        case 'success': return core.ImageConstant.Color.SUCCESS;
        case 'warning': return core.ImageConstant.Color.WARNING;
        case 'info':    return core.ImageConstant.Color.INFO;
        case 'neutral': return core.ImageConstant.Color.NEUTRAL;
        default: return core.ImageConstant.Color.NEUTRAL;
    }
};

export const StatCard = (props: StatCardProps): core.VDom.Node => {
    const iconColor = toneToColor(props.tone);

    const metricRowItems = [
        props.icon && (
            <component.StackPanel.Item>
                <component.Image
                    image={props.icon as never}
                    size={component.Image.Size.M}
                    color={iconColor as never}
                    presentation={true}
                />
            </component.StackPanel.Item>
        ),
        (
            <component.StackPanel.Item>
                <component.Heading level={3}>
                    {props.metric}
                </component.Heading>
            </component.StackPanel.Item>
        )
    ].filter(Boolean);

    const cardItems = [
        (
            <component.StackPanel.Item>
                <component.Text
                    type={component.Text.Type.WEAK}
                    size={component.Text.Size.S}
                >
                    {props.title}
                </component.Text>
            </component.StackPanel.Item>
        ),
        (
            <component.StackPanel.Item>
                <component.StackPanel
                    orientation={component.StackPanel.Orientation.HORIZONTAL}
                    alignment={component.StackPanel.Alignment.CENTER}
                    itemGap={component.StackPanel.GapSize.XS}
                >
                    {metricRowItems as never}
                </component.StackPanel>
            </component.StackPanel.Item>
        ),
        props.description && (
            <component.StackPanel.Item>
                <component.Text
                    type={component.Text.Type.WEAK}
                    size={component.Text.Size.S}
                >
                    {props.description}
                </component.Text>
            </component.StackPanel.Item>
        )
    ].filter(Boolean);

    return (
        <component.StackPanel
            orientation={component.StackPanel.Orientation.VERTICAL}
            itemGap={component.StackPanel.GapSize.XS}
            rootStyle={{
                padding: '16px',
                border: '1px solid #E2E3E5',
                borderRadius: '6px',
                background: '#FFFFFF'
            }}
        >
            {cardItems as never}
        </component.StackPanel>
    );
};

export default StatCard;
