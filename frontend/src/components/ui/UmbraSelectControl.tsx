'use client';

import React from 'react';
import { UmbraSelect, type UmbraSelectOption } from './UmbraSelect';

type NativeSelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'multiple' | 'size'>;

interface UmbraSelectControlProps extends NativeSelectProps {
  menuTitle?: string;
  menuSubtitle?: string;
  boundarySelector?: string;
  controlSize?: 'xs' | 'sm' | 'md';
}

function optionLabel(children: React.ReactNode): string {
  return React.Children.toArray(children)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') return String(child);
      return '';
    })
    .join('')
    .trim();
}

function collectOptions(children: React.ReactNode, group = ''): UmbraSelectOption[] {
  const options: UmbraSelectOption[] = [];
  let groupHeadingUsed = false;

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === React.Fragment) {
      options.push(...collectOptions(child.props.children, group));
      return;
    }
    if (child.type === 'optgroup') {
      const label = String(child.props.label || '');
      options.push(...collectOptions(child.props.children, label));
      return;
    }
    if (child.type !== 'option') return;

    const label = optionLabel(child.props.children);
    const value = child.props.value === undefined ? label : String(child.props.value);
    options.push({
      value,
      label: label || value,
      disabled: Boolean(child.props.disabled),
      description: group && !groupHeadingUsed ? group : undefined,
    });
    groupHeadingUsed = true;
  });

  return options;
}

export function UmbraSelectControl({
  value,
  defaultValue,
  onChange,
  children,
  disabled = false,
  className,
  style,
  title,
  id,
  name,
  required,
  'aria-label': ariaLabel,
  menuTitle,
  menuSubtitle,
  boundarySelector,
  controlSize = 'md',
}: UmbraSelectControlProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [inferredLabel, setInferredLabel] = React.useState('');
  const options = React.useMemo(() => collectOptions(children), [children]);
  const controlledValue = String(value ?? defaultValue ?? '');
  const resolvedLabel = ariaLabel || title || menuTitle || name || inferredLabel || 'Select option';

  React.useLayoutEffect(() => {
    if (ariaLabel || title || menuTitle || name) return;
    const container = containerRef.current;
    const label = container?.closest('label');
    if (!container || !label) return;
    const directText = Array.from(label.childNodes)
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent?.trim() || '')
      .filter(Boolean)
      .join(' ')
      .trim();
    const candidate = directText || Array.from(label.children)
      .filter((element) => element !== container && !element.contains(container))
      .map((element) => element.textContent?.trim() || '')
      .find((text) => text.length > 0 && text.length <= 80);
    if (candidate) setInferredLabel(candidate);
  }, [ariaLabel, menuTitle, name, title]);

  return (
    <div ref={containerRef} className="umbra-select-control-adapter contents">
      <UmbraSelect
        value={controlledValue}
        options={options}
        onValueChange={(nextValue) => {
          onChange?.({ target: { value: nextValue }, currentTarget: { value: nextValue } } as React.ChangeEvent<HTMLSelectElement>);
        }}
        ariaLabel={resolvedLabel}
        disabled={disabled}
        size={controlSize}
        buttonClassName={className}
        buttonStyle={style}
        menuTitle={menuTitle || resolvedLabel}
        menuSubtitle={menuSubtitle}
        boundarySelector={boundarySelector}
        triggerId={id}
        triggerTitle={title}
        required={required}
        name={name}
      />
    </div>
  );
}

export default UmbraSelectControl;
