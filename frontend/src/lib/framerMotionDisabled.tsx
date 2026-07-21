import React from 'react';

type AnyProps = Record<string, any>;

const MOTION_ONLY_PROPS = new Set([
  'animate',
  'drag',
  'dragConstraints',
  'dragElastic',
  'dragMomentum',
  'exit',
  'initial',
  'layout',
  'layoutId',
  'transition',
  'variants',
  'whileDrag',
  'whileFocus',
  'whileHover',
  'whileInView',
  'whileTap',
]);

function sanitizeStyle(style: AnyProps | undefined): AnyProps | undefined {
  if (!style || typeof style !== 'object') return style;
  const next: AnyProps = {};
  for (const [key, value] of Object.entries(style)) {
    if (key === 'x' || key === 'y' || key === 'scale' || key === 'rotate') continue;
    if (value && typeof value === 'object' && typeof (value as any).get === 'function') continue;
    next[key] = value;
  }
  return next;
}

function stripMotionProps(props: AnyProps): AnyProps {
  const next: AnyProps = {};
  for (const [key, value] of Object.entries(props)) {
    if (MOTION_ONLY_PROPS.has(key)) continue;
    if (key === 'style') {
      next.style = sanitizeStyle(value);
      continue;
    }
    next[key] = value;
  }
  return next;
}

function createMotionElement(tag: string) {
  return React.forwardRef<HTMLElement, AnyProps>(function MotionElement(props, ref) {
    return React.createElement(tag, { ...stripMotionProps(props), ref });
  });
}

const motionCache = new Map<string, React.ComponentType<AnyProps>>();

export const motion = new Proxy({}, {
  get(_target, property) {
    const tag = String(property);
    if (!motionCache.has(tag)) motionCache.set(tag, createMotionElement(tag));
    return motionCache.get(tag);
  },
}) as Record<string, React.ComponentType<AnyProps>>;

export function AnimatePresence({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

export function useMotionValue<T>(initial: T) {
  let current = initial;
  return {
    get: () => current,
    set: (next: T) => {
      current = next;
    },
    on: () => () => undefined,
  };
}

export function useSpring<T>(value: T) {
  return value;
}

