'use client';

import React, { useEffect, useRef, useState, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useThemeStore } from '@/store/useThemeStore';

// Cursor Individual Trail Dot Component - Memoized for performance
const TrailDot = memo(function TrailDot({
  x,
  y,
  index,
  total,
  smoothing,
  trailSize,
  trailOpacity,
  trailBlur,
  style
}: {
  x: any;
  y: any;
  index: number;
  total: number;
  smoothing: number;
  trailSize: number;
  trailOpacity: number;
  trailBlur: number;
  style: string;
}) {
  const smoothingFactor = smoothing / 100;

  // Memoize spring config - only recalculate when dependencies change
  const springConfig = useMemo(() => ({
    damping: 20 + (index * 2) + (smoothingFactor * 20),
    stiffness: 1000 - (index * 40) - (smoothingFactor * 600),
    mass: 0.1 + (index * 0.05) + (smoothingFactor * 0.5),
  }), [index, smoothingFactor]);

  const dotX = useSpring(x, springConfig);
  const dotY = useSpring(y, springConfig);

  const size = trailSize * (1 - (index / total) * 0.5);
  const isRetro = style === 'retro';

  return (
    <motion.div
      className="absolute"
      style={{
        width: size,
        height: size,
        backgroundColor: 'var(--umbra-accent)',
        borderRadius: isRetro ? '0px' : '50%',
        opacity: (trailOpacity / 100) * (1 - (index / total)),
        filter: `blur(${trailBlur}px)`,
        x: dotX,
        y: dotY,
        translateX: -size / 2,
        translateY: -size / 2,
        mixBlendMode: style === 'galaxy' ? 'screen' : 'plus-lighter',
        willChange: 'transform'
      }}
    />
  );
});

export const CursorEffects = () => {
  const cursorSettings = useThemeStore((state) => state.cursorSettings);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const cursorX = useMotionValue(0);
  const cursorY = useMotionValue(0);

  // Memoize main cursor spring config - only recalculate when smoothing changes
  const smoothingFactor = (cursorSettings?.smoothing ?? 20) / 100;
  const mainSpringConfig = useMemo(() => ({
    damping: 20 + (smoothingFactor * 40),
    stiffness: 1200 - (smoothingFactor * 1000),
    mass: 0.1 + (smoothingFactor * 1.5),
    restDelta: 0.001
  }), [smoothingFactor]);

  const cursorXSpring = useSpring(cursorX, mainSpringConfig);
  const cursorYSpring = useSpring(cursorY, mainSpringConfig);

  const [isClicking, setIsClicking] = useState(false);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const rippleIdRef = useRef(0);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      cursorX.set(e.clientX);
      cursorY.set(e.clientY);
    };

    const handleMouseDown = () => setIsClicking(true);
    const handleMouseUp = () => setIsClicking(false);

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [cursorX, cursorY]);

  // Click ripples effect
  useEffect(() => {
    if (!isClicking || !cursorSettings?.ripple?.enabled) return;

    const newRipple = {
      id: rippleIdRef.current++,
      x: cursorX.get(),
      y: cursorY.get(),
    };
    setRipples((prev) => [...prev, newRipple]);

    const timeout = setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
    }, cursorSettings.ripple.duration);

    return () => clearTimeout(timeout);
  }, [isClicking, cursorSettings?.ripple?.enabled, cursorX, cursorY]);

  const dotSize = cursorSettings?.dot?.size ?? 8;
  const ringSize = cursorSettings?.ring?.size ?? 32;
  const isRetro = cursorSettings?.style === 'retro';

  if (!mounted) return null;

  const cursorContent = (
    <div className="pointer-events-none fixed inset-0 z-[9999999]">
      {/* Trail Dots - Each with its own physics (memoized) */}
      {cursorSettings.trail.enabled && [...Array(cursorSettings.trail.count)].map((_, i) => (
        <TrailDot
          key={i}
          x={cursorX}
          y={cursorY}
          index={i}
          total={cursorSettings.trail.count}
          smoothing={cursorSettings.smoothing}
          trailSize={cursorSettings.trail.size}
          trailOpacity={cursorSettings.trail.opacity}
          trailBlur={cursorSettings.trail.blur}
          style={cursorSettings.style}
        />
      ))}

      {/* Main Cursor Dot */}
      {cursorSettings.dot.enabled && (
        <motion.div
          className="absolute mix-blend-difference will-change-transform"
          style={{
            width: dotSize,
            height: dotSize,
            backgroundColor: 'var(--umbra-accent)',
            borderRadius: isRetro ? '0px' : '50%',
            opacity: cursorSettings.dot.opacity / 100,
            filter: `blur(${cursorSettings.dot.blur}px)${cursorSettings.dot.glow ? ` drop-shadow(0 0 ${dotSize/2}px var(--umbra-accent))` : ''}`,
            x: cursorXSpring,
            y: cursorYSpring,
            translateX: -dotSize / 2,
            translateY: -dotSize / 2,
            scale: isClicking ? 0.7 : 1,
          }}
        />
      )}

      {/* Cursor Ring */}
      {cursorSettings.ring.enabled && (
        <motion.div
          className="absolute mix-blend-difference will-change-transform"
          style={{
            width: ringSize,
            height: ringSize,
            border: `${cursorSettings.ring.thickness}px solid var(--umbra-accent)`,
            borderRadius: isRetro ? '0px' : '50%',
            opacity: cursorSettings.ring.opacity / 100,
            filter: `blur(${cursorSettings.ring.blur}px)`,
            x: cursorXSpring,
            y: cursorYSpring,
            translateX: -ringSize / 2,
            translateY: -ringSize / 2,
          }}
          animate={{
            scale: cursorSettings.ring.pulse ? [1, 1.1, 1] : isClicking ? 1.5 : 1,
            rotate: cursorSettings.ring.rotate ? 360 : 0,
          }}
          transition={{
            scale: cursorSettings.ring.pulse
              ? { duration: 2, repeat: Infinity, ease: 'easeInOut' }
              : { type: 'spring', stiffness: 300, damping: 20 },
            rotate: cursorSettings.ring.rotate
              ? { duration: 8, repeat: Infinity, ease: 'linear' }
              : { duration: 0 }
          }}
        />
      )}

      {/* Click Ripples */}
      {ripples.map((ripple) => (
        <motion.div
          key={ripple.id}
          className="absolute rounded-full"
          style={{
            border: `${cursorSettings.ripple.thickness}px solid var(--umbra-accent)`,
            filter: `blur(${cursorSettings.ripple.blur}px)`,
            left: ripple.x,
            top: ripple.y,
          }}
          initial={{
            width: 0,
            height: 0,
            x: 0,
            y: 0,
            opacity: cursorSettings.ripple.opacity / 100,
          }}
          animate={{
            width: cursorSettings.ripple.maxSize,
            height: cursorSettings.ripple.maxSize,
            x: -cursorSettings.ripple.maxSize / 2,
            y: -cursorSettings.ripple.maxSize / 2,
            opacity: 0,
          }}
          transition={{
            duration: cursorSettings.ripple.duration / 1000,
            ease: 'easeOut',
          }}
        />
      ))}
    </div>
  );

  return createPortal(cursorContent, document.body);
};

// Magnetic Button Component - Elements get pulled toward cursor
export const MagneticElement = ({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  const magneticStrength = useThemeStore((state) => state.cursorSettings.magneticStrength);
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const deltaX = e.clientX - centerX;
      const deltaY = e.clientY - centerY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      const range = 150;
      if (distance < range) {
        const force = (range - distance) / range;
        const strength = magneticStrength / 100;
        setPosition({
          x: deltaX * strength * force,
          y: deltaY * strength * force,
        });
      } else {
        setPosition({ x: 0, y: 0 });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [magneticStrength]);

  return (
    <motion.div
      ref={ref}
      className={className}
      animate={{
        x: position.x,
        y: position.y,
      }}
      transition={{
        type: 'spring',
        stiffness: 200,
        damping: 20,
      }}
    >
      {children}
    </motion.div>
  );
};

// Warping Container - Elements bend/distort near cursor
export const WarpContainer = ({ children }: { children: React.ReactNode }) => {
  const [warp, setWarp] = useState({ x: 0, y: 0, intensity: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;

      // Check if mouse is over the container
      if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
        setWarp({
          x: (x - 0.5) * 2,
          y: (y - 0.5) * 2,
          intensity: 1
        });
      } else {
        setWarp({ x: 0, y: 0, intensity: 0 });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <motion.div
      ref={containerRef}
      className="relative"
      animate={{
        rotateX: warp.y * 5 * warp.intensity,
        rotateY: warp.x * 5 * warp.intensity,
        scale: 1 + warp.intensity * 0.02,
      }}
      transition={{
        type: 'spring',
        stiffness: 100,
        damping: 15,
      }}
      style={{
        transformStyle: 'preserve-3d',
        perspective: 1000,
      }}
    >
      {children}
    </motion.div>
  );
};