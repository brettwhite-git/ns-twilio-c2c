/**
 * TextField — labeled text input.
 *
 * Phase 5 (2026-05-28) — JSX replacement for the legacy `buildTextField`
 * helper in components/shared/shared.ts. A UIF Field (label above the
 * input) wrapping a TextBox.
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';

interface TextFieldProps {
    label: string;
    placeholder?: string;
    value: string;
    onChange: (value: string) => void;
}

export const TextField = (props: TextFieldProps): core.VDom.Node => {
    const {label, placeholder, value, onChange} = props;
    return (
        <component.Field
            label={label}
            orientation={component.Field.Orientation.VERTICAL}
        >
            <component.TextBox
                text={value || ''}
                placeholder={placeholder || ''}
                onTextChanged={(args: { text?: string } | undefined): void => {
                    onChange((args && args.text) || '');
                }}
            />
        </component.Field>
    );
};

export default TextField;
