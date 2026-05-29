/**
 * ErrorText — single-line error body content.
 *
 * Phase 5 (2026-05-28) — JSX replacement for the legacy `buildErrorBox`
 * helper. Renders as STRONG Text so it stands out against surrounding
 * form content. Used for transient error states where an inline message
 * is more appropriate than a full BannerMessage.
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';

interface ErrorTextProps {
    message: string;
    /** Prepend an "✕ " glyph (default true). */
    glyph?: boolean;
}

export const ErrorText = (props: ErrorTextProps): core.VDom.Node => {
    const prefix = props.glyph === false ? '' : '✕ ';
    return (
        <component.Text type={component.Text.Type.STRONG}>
            {prefix + props.message}
        </component.Text>
    );
};

export default ErrorText;
