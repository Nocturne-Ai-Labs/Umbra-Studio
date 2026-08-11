'use client';

import React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContextMenuItem } from '@/hooks/useContextMenu';
import { ContextMenu } from './ContextMenu';

export interface UmbraSelectOption {
  value: string;
  label: string;
  description?: string;
  badge?: string | number;
  disabled?: boolean;
  icon?: React.ReactNode;
}

interface UmbraSelectProps {
  value: string;
  options: UmbraSelectOption[];
  onValueChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  buttonStyle?: React.CSSProperties;
  size?: 'xs' | 'sm' | 'md';
  menuTitle?: string;
  menuSubtitle?: string;
  boundarySelector?: string;
  leadingIcon?: React.ReactNode;
  triggerId?: string;
  triggerTitle?: string;
  required?: boolean;
  name?: string;
}

const sizeClasses = {
  xs: 'h-7 px-2 text-[8px]',
  sm: 'h-8 px-2.5 text-[10px]',
  md: 'h-10 px-3 text-xs',
} as const;

export function UmbraSelect({
  value,
  options,
  onValueChange,
  ariaLabel,
  placeholder = 'Select',
  disabled = false,
  className,
  buttonClassName,
  buttonStyle,
  size = 'md',
  menuTitle,
  menuSubtitle,
  boundarySelector,
  leadingIcon,
  triggerId,
  triggerTitle,
  required = false,
  name,
}: UmbraSelectProps) {
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const selectedOption = React.useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  const updatePosition = React.useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({ x: rect.left, y: rect.bottom + 4 });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  React.useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const items = React.useMemo<ContextMenuItem[]>(() => options.map((option) => {
    const selected = option.value === value;
    return {
      label: option.label,
      description: option.description,
      badge: option.badge,
      disabled: option.disabled,
      icon: selected
        ? <Check size={13} />
        : option.icon || <span className="block h-3 w-3" />,
      action: () => onValueChange(option.value),
    };
  }), [onValueChange, options, value]);

  const displayLabel = selectedOption?.label || (value ? value : placeholder);

  return (
    <div className={cn('min-w-0', className)}>
      <button
        ref={triggerRef}
        id={triggerId}
        name={name}
        type="button"
        title={triggerTitle}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-required={required || undefined}
        data-open={open ? 'true' : 'false'}
        style={buttonStyle}
        disabled={disabled}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          if (disabled) return;
          updatePosition();
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          updatePosition();
          setOpen(true);
        }}
        className={cn(
          'umbra-select-trigger flex w-full touch-manipulation items-center gap-2 rounded-md border text-left outline-none transition-[border-color,background-color,box-shadow,color]',
          disabled && 'cursor-not-allowed opacity-40',
          sizeClasses[size],
          buttonClassName,
        )}
      >
        {leadingIcon ? <span className="umbra-context-menu-icon flex h-4 w-4 shrink-0 items-center justify-center">{leadingIcon}</span> : null}
        <span className="min-w-0 flex-1 truncate">{displayLabel}</span>
        {selectedOption?.badge !== undefined ? <span className="umbra-context-menu-badge shrink-0 px-1.5 py-0.5">{selectedOption.badge}</span> : null}
        <ChevronDown size={13} className={cn('umbra-select-chevron shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      <ContextMenu
        isOpen={open}
        position={position}
        items={items}
        onClose={() => setOpen(false)}
        boundarySelector={boundarySelector}
        title={menuTitle || ariaLabel}
        subtitle={menuSubtitle || (selectedOption ? `Current: ${selectedOption.label}` : 'Choose an option')}
      />
    </div>
  );
}

export default UmbraSelect;
