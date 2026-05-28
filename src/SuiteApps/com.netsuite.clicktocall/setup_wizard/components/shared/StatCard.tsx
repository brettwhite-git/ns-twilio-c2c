/**
 * StatCard — KPI card for the Overview dashboard.
 *
 * Phase 5 (2026-05-28) — JSX replacement for the legacy `buildStatCard`
 * helper in components/shared/shell.ts. Used by OverviewPage's 4-card
 * KPI grid.
 *
 * The legacy version delegated to Card.metric() with an icon-in-description
 * fallback for the Status card. This JSX version hand-rolls the layout
 * (title / metric+icon / description) because Card.metric()'s slot shape
 * doesn't accept a horizontally-positioned icon next to the metric, and
 * the hand-rolled layout reads cleaner alongside the other JSX content.
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';

export type StatCardTone = 'success' | 'warning' | 'info' | 'neutral';

interface StatCardProps {
    title: string;
    metric: string;
    description?: string;
    /** SystemIcon source — rendered next to the metric when set. */
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
            <component.StackPanel.Item>
                <component.Text
                    type={component.Text.Type.WEAK}
                    size={component.Text.Size.S}
                >
                    {props.title}
                </component.Text>
            </component.StackPanel.Item>
            <component.StackPanel.Item>
                <component.StackPanel
                    orientation={component.StackPanel.Orientation.HORIZONTAL}
                    alignment={component.StackPanel.Alignment.CENTER}
                    itemGap={component.StackPanel.GapSize.XS}
                >
                    {props.icon ? (
                        <component.StackPanel.Item>
                            <component.Image
                                image={props.icon as never}
                                size={component.Image.Size.M}
                                color={iconColor as never}
                                presentation={true}
                            />
                        </component.StackPanel.Item>
                    ) : null}
                    <component.StackPanel.Item>
                        <component.Heading level={3}>
                            {props.metric}
                        </component.Heading>
                    </component.StackPanel.Item>
                </component.StackPanel>
            </component.StackPanel.Item>
            {props.description ? (
                <component.StackPanel.Item>
                    <component.Text
                        type={component.Text.Type.WEAK}
                        size={component.Text.Size.S}
                    >
                        {props.description}
                    </component.Text>
                </component.StackPanel.Item>
            ) : null}
        </component.StackPanel>
    );
};

export default StatCard;
