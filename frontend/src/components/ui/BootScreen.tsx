'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BootRainContent, useThemeStore } from '@/store/useThemeStore';
import { getBootAsciiLogo } from '@/lib/bootAscii';
import { getBootImageBackground } from '@/lib/bootBackgrounds';
import { IS_UMBRA_DEV_MODE } from '@/utils/devMode';
import { UmbraLogo } from './UmbraLogo';

// Kanji and katakana characters for matrix rain
const MATRIX_CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン゙゚ーァィゥェォャュョッ日月火水木金土中大小上下左右前後東西南北春夏秋冬風雷雨雪花鳥虫魚山川海空星雲夢幻影光闇命心魂力技道剣刀弓槍盾鎧兜龍虎鳳凰麒麟';
const PROMPT_RAIN_TOKENS = [
  'masterpiece',
  'best quality',
  'cinematic lighting',
  'soft shadows',
  'volumetric glow',
  'high contrast',
  'depth of field',
  'sharp focus',
  'dynamic pose',
  'expressive eyes',
  'detailed hair',
  'rim lighting',
  'ambient occlusion',
  'rich colors',
  'clean lineart',
  'dramatic angle',
  'studio light',
  'anime render',
  'ultra detailed',
];
const DANBOORU_RAIN_TOKENS = [
  '1girl',
  'solo',
  'long_hair',
  'blue_eyes',
  'smile',
  'looking_at_viewer',
  'upper_body',
  'full_body',
  'school_uniform',
  'twintails',
  'blush',
  'open_mouth',
  'night',
  'fireworks',
  'beach',
  'bikini',
  'thighhighs',
  'hair_ornament',
  'sidelocks',
  'dynamic_angle',
  'from_above',
  'arms_up',
  'cowboy_shot',
  'city_lights',
];

const getMatrixRainTokens = (content: BootRainContent) => {
  if (content === 'prompts') return PROMPT_RAIN_TOKENS;
  if (content === 'danbooru') return DANBOORU_RAIN_TOKENS;
  return MATRIX_CHARS.split('');
};

const KANJI_RAIN_SIGNATURE = 'Umbra Studio';

// ============================================
// MATRIX RAIN ANIMATION
// ============================================
const MatrixRain = ({ accent, depth, content }: { accent: string; depth: number; content: BootRainContent }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const isTokenRain = content !== 'kanji';
    const fontSize = isTokenRain ? 13 : 14;
    const columnWidth = isTokenRain ? 68 : fontSize;
    const columns = Math.ceil(canvas.width / columnWidth) + (isTokenRain ? 2 : 0);
    const drops: number[] = Array(columns).fill(0).map(() => (
      isTokenRain ? Math.random() * (canvas.height / fontSize) : 1
    ));
    const speeds: number[] = Array(columns).fill(0).map(() => (
      isTokenRain ? 0.7 + Math.random() * (depth / 34) : 0.5 + Math.random() * (depth / 50)
    ));
    const columnOffsets: number[] = Array(columns).fill(0).map(() => (
      isTokenRain ? (Math.random() - 0.5) * 18 : 0
    ));
    const tokens = getMatrixRainTokens(content);

    const draw = () => {
      ctx.fillStyle = 'rgba(5, 5, 8, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < drops.length; i++) {
        const token = content === 'kanji' && Math.random() < 0.008
          ? KANJI_RAIN_SIGNATURE
          : tokens[Math.floor(Math.random() * tokens.length)];
        const x = i * columnWidth + columnOffsets[i] - (isTokenRain ? columnWidth : 0);
        const y = drops[i] * fontSize;

        // Depth-based opacity and color
        const depthFactor = (drops[i] % 30) / 30;
        const opacity = 0.3 + depthFactor * 0.7;

        // Leading character is brighter (use accent color, not white)
        if (depthFactor > 0.9) {
          // Brighten the accent color for leading chars
          ctx.fillStyle = accent;
          ctx.shadowBlur = 15;
          ctx.shadowColor = accent;
        } else {
          ctx.fillStyle = accent + Math.floor(opacity * 255).toString(16).padStart(2, '0');
          ctx.shadowBlur = 0;
        }

        ctx.font = `${fontSize}px monospace`;
        ctx.fillText(token, x, y);
        ctx.shadowBlur = 0;

        if (y > canvas.height && Math.random() > (isTokenRain ? 0.958 : 0.975)) {
          drops[i] = 0;
        }
        drops[i] += speeds[i];
      }
    };

    const interval = setInterval(draw, 33);
    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', resize);
    };
  }, [accent, content, depth]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />;
};

// ============================================
// HEX GRID ANIMATION
// ============================================
const HexGrid = ({ accent, depth }: { accent: string; depth: number }) => {
  const hexCount = Math.floor(depth / 2);
  const hexagons = useMemo(() =>
    Array.from({ length: hexCount }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 20 + Math.random() * 40,
      delay: Math.random() * 2,
      duration: 2 + Math.random() * 3,
    })), [hexCount]
  );

  return (
    <div className="absolute inset-0 overflow-hidden">
      {hexagons.map((hex) => (
        <motion.div
          key={hex.id}
          className="absolute"
          style={{
            left: `${hex.x}%`,
            top: `${hex.y}%`,
            width: hex.size,
            height: hex.size * 1.15,
          }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0, 0.6, 0],
            scale: [0.5, 1, 0.5],
            rotate: [0, 180, 360],
          }}
          transition={{
            duration: hex.duration,
            delay: hex.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          <svg viewBox="0 0 100 115" className="w-full h-full">
            <polygon
              points="50,0 100,25 100,75 50,100 0,75 0,25"
              fill="none"
              stroke={accent}
              strokeWidth="2"
              style={{ filter: `drop-shadow(0 0 ${depth / 10}px ${accent})` }}
            />
          </svg>
        </motion.div>
      ))}
    </div>
  );
};

// ============================================
// GLITCH EFFECT
// ============================================
const GlitchText = ({ text, accent }: { text: string; accent: string }) => {
  const [glitchText, setGlitchText] = useState(text);
  const glitchChars = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`░▒▓█▀▄';

  useEffect(() => {
    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      if (frame % 5 === 0) {
        const chars = text.split('');
        const glitchCount = Math.floor(Math.random() * 5);
        for (let i = 0; i < glitchCount; i++) {
          const idx = Math.floor(Math.random() * chars.length);
          if (chars[idx] !== ' ' && chars[idx] !== '\n') {
            chars[idx] = glitchChars[Math.floor(Math.random() * glitchChars.length)];
          }
        }
        setGlitchText(chars.join(''));
      } else if (frame % 7 === 0) {
        setGlitchText(text);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [text]);

  return (
    <div className="relative">
      <pre
        className="font-mono text-[7px] sm:text-[9px] md:text-[11px] leading-[1.15] whitespace-pre select-none"
        style={{ color: accent }}
      >
        {glitchText}
      </pre>
      {/* Glitch layers */}
      <motion.pre
        className="absolute inset-0 font-mono text-[7px] sm:text-[9px] md:text-[11px] leading-[1.15] whitespace-pre select-none opacity-70"
        style={{ color: '#ff0000' }}
        animate={{ x: [-2, 2, -2], opacity: [0, 0.5, 0] }}
        transition={{ duration: 0.2, repeat: Infinity, repeatType: 'mirror' }}
      >
        {glitchText}
      </motion.pre>
      <motion.pre
        className="absolute inset-0 font-mono text-[7px] sm:text-[9px] md:text-[11px] leading-[1.15] whitespace-pre select-none opacity-70"
        style={{ color: '#00ffff' }}
        animate={{ x: [2, -2, 2], opacity: [0, 0.5, 0] }}
        transition={{ duration: 0.15, repeat: Infinity, repeatType: 'mirror' }}
      >
        {glitchText}
      </motion.pre>
    </div>
  );
};

// ============================================
// ANIMATED ASCII (typewriter + scanline)
// ============================================
const AnimatedASCII = ({ text, accent, animated }: { text: string; accent: string; animated: boolean }) => {
  const [visibleChars, setVisibleChars] = useState(animated ? 0 : text.length);
  const [scanlineY, setScanlineY] = useState(0);

  useEffect(() => {
    if (!animated) {
      setVisibleChars(text.length);
      return;
    }

    let charIndex = 0;
    const typeInterval = setInterval(() => {
      charIndex += 25; // Much faster: ~300ms to complete instead of 1.6s
      setVisibleChars(charIndex);
      if (charIndex >= text.length) {
        clearInterval(typeInterval);
      }
    }, 8);

    return () => clearInterval(typeInterval);
  }, [animated, text]);

  useEffect(() => {
    const scanInterval = setInterval(() => {
      setScanlineY((prev) => (prev + 2) % 100);
    }, 50);
    return () => clearInterval(scanInterval);
  }, []);

  const displayText = text.slice(0, visibleChars);

  return (
    <div className="relative">
      <pre
        className="font-mono text-[7px] sm:text-[9px] md:text-[11px] leading-[1.15] whitespace-pre select-none"
        style={{
          color: accent,
          textShadow: `0 0 10px ${accent}40, 0 0 20px ${accent}20`,
        }}
      >
        {displayText}
        {visibleChars < text.length && (
          <motion.span
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.5, repeat: Infinity }}
            style={{ color: accent }}
          >
            █
          </motion.span>
        )}
      </pre>
      {/* Scanline effect */}
      <div
        className="absolute left-0 right-0 h-[2px] pointer-events-none"
        style={{
          top: `${scanlineY}%`,
          background: `linear-gradient(90deg, transparent, ${accent}40, transparent)`,
        }}
      />
    </div>
  );
};

const UmbraDynamicBootLogo = ({ accent, progress }: { accent: string; progress: number }) => {
  const dissolve = Math.max(0, Math.min(1, progress / 68));
  return (
    <motion.div
      className="relative mx-auto w-[min(720px,82vw)]"
      initial={{ opacity: 0, scale: 0.93, filter: 'blur(18px)' }}
      animate={{
        opacity: [0, 0.72, 1],
        scale: [0.93, 1.012, 1],
        filter: ['blur(18px)', 'blur(3px)', 'blur(0px)'],
      }}
      transition={{ duration: 1.35, ease: 'easeOut' }}
      style={{
        ['--umbra-boot-dissolve' as string]: `${Math.round(dissolve * 100)}%`,
      }}
    >
      <UmbraLogo
        color={accent}
        className="relative z-10 block h-auto w-full select-none"
        style={{
          WebkitMaskImage: 'linear-gradient(90deg, black var(--umbra-boot-dissolve), rgba(0,0,0,0.18) calc(var(--umbra-boot-dissolve) + 8%), transparent calc(var(--umbra-boot-dissolve) + 18%))',
          maskImage: 'linear-gradient(90deg, black var(--umbra-boot-dissolve), rgba(0,0,0,0.18) calc(var(--umbra-boot-dissolve) + 8%), transparent calc(var(--umbra-boot-dissolve) + 18%))',
          filter: 'drop-shadow(0 20px 45px rgba(0,0,0,0.68))',
        }}
      />
      <motion.div
        className="pointer-events-none absolute inset-x-[10%] bottom-[7%] z-20 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: [0, 1, 0.8], opacity: [0, 0.72, 0.24] }}
        transition={{ duration: 1.6, ease: 'easeOut', delay: 0.25 }}
      />
    </motion.div>
  );
};

const UMBRA_SERVICE_NODES = [
  {
    id: 'power',
    label: 'POWER PROMPTER',
    shortLabel: 'PROMPTER',
    x: 22,
    y: 31,
    subs: [
      { id: 'cards', label: 'CARDS', x: 11, y: 20 },
      { id: 'presets', label: 'PRESETS', x: 22, y: 13 },
      { id: 'dispatch', label: 'DISPATCH', x: 34, y: 22 },
    ],
  },
  {
    id: 'comfy',
    label: 'COMFYUI',
    shortLabel: 'COMFY',
    x: 78,
    y: 31,
    subs: [
      { id: 'bridge', label: 'BRIDGE', x: 66, y: 22 },
      { id: 'queue', label: 'QUEUE', x: 78, y: 13 },
      { id: 'preview', label: 'PREVIEW', x: 89, y: 20 },
    ],
  },
  {
    id: 'library',
    label: 'LIBRARY',
    shortLabel: 'LIBRARY',
    x: 22,
    y: 70,
    subs: [
      { id: 'gallery', label: 'GALLERY', x: 11, y: 80 },
      { id: 'tags', label: 'TAGS', x: 22, y: 90 },
      { id: 'filmstrip', label: 'FILMSTRIP', x: 34, y: 81 },
    ],
  },
  {
    id: 'models',
    label: 'MODEL MANAGER',
    shortLabel: 'MODELS',
    x: 78,
    y: 70,
    subs: [
      { id: 'catalog', label: 'CATALOG', x: 66, y: 81 },
      { id: 'downloads', label: 'DOWNLOADS', x: 78, y: 90 },
      { id: 'scanner', label: 'SCAN', x: 90, y: 80 },
    ],
  },
  {
    id: 'inspector',
    label: 'IMAGE INSPECTOR',
    shortLabel: 'INSPECT',
    x: 50,
    y: 23,
    subs: [
      { id: 'metadata', label: 'METADATA', x: 42, y: 10 },
      { id: 'tagger', label: 'TAGGER', x: 58, y: 10 },
    ],
  },
  {
    id: 'boards',
    label: 'DATA FORGE',
    shortLabel: 'FORGE',
    x: 50,
    y: 75,
    subs: [
      { id: 'boardBrowser', label: 'FORGE', x: 42, y: 90 },
      { id: 'datasets', label: 'DATASETS', x: 58, y: 90 },
    ],
  },
] as const;

const UMBRA_REMOTE_SERVICE = {
  id: 'remote',
  label: 'UMBRA REMOTE',
  shortLabel: 'REMOTE',
  x: 91,
  y: 51,
  subs: [
    { id: 'devices', label: 'DEVICES', x: 96, y: 39 },
    { id: 'session', label: 'SESSION', x: 96, y: 63 },
  ],
} as const;

const UMBRA_BOOT_SERVICES = [
  'CORE',
  'PROMPTS',
  'COMFY',
  'LIBRARY',
  'MODELS',
  'INSPECT',
  'FORGE',
] as const;

type UmbraServiceNode = typeof UMBRA_SERVICE_NODES[number] | typeof UMBRA_REMOTE_SERVICE;

const getUmbraBootServices = (): UmbraServiceNode[] => {
  return IS_UMBRA_DEV_MODE
    ? [...UMBRA_SERVICE_NODES, UMBRA_REMOTE_SERVICE]
    : [...UMBRA_SERVICE_NODES];
};

const UMBRA_HUB = { x: 50, y: 52, label: 'UMBRA CORE' } as const;

const activationForIndex = (index: number, total: number, progress: number) => {
  if (total <= 1) return true;
  return progress >= (index / Math.max(1, total - 1)) * 86 + 4;
};

const ServicePill = ({
  label,
  active,
  accent,
  accentSecondary,
  x,
  y,
  compact = false,
  delay = 0,
}: {
  label: string;
  active: boolean;
  accent: string;
  accentSecondary: string;
  x: number;
  y: number;
  compact?: boolean;
  delay?: number;
}) => (
  <motion.div
    className="absolute -translate-x-1/2 -translate-y-1/2 rounded-md border px-2 py-1 text-center font-black uppercase"
    style={{
      left: `${x}%`,
      top: `${y}%`,
      minWidth: compact ? 48 : 76,
      color: active ? accent : 'rgb(82 82 91)',
      borderColor: active
        ? `color-mix(in srgb, ${accent} 56%, transparent)`
        : 'rgba(255,255,255,0.10)',
      background: active
        ? `linear-gradient(180deg, color-mix(in srgb, ${accent} 16%, black), rgba(0,0,0,0.84))`
        : 'rgba(0,0,0,0.62)',
      boxShadow: active
        ? `0 0 18px color-mix(in srgb, ${accentSecondary} 18%, transparent)`
        : 'none',
      fontSize: compact ? 9 : 10,
    }}
    initial={{ scale: 0.78, opacity: 0 }}
    animate={{
      scale: active ? [0.98, 1.05, 0.98] : 0.95,
      opacity: active ? 1 : 0.44,
    }}
    transition={{
      duration: active ? 1.3 : 0.28,
      repeat: active ? Infinity : 0,
      ease: 'easeInOut',
      delay,
    }}
  >
    {label}
  </motion.div>
);

const BootLink = ({
  x1,
  y1,
  x2,
  y2,
  active,
  accent,
  delay = 0,
  width = 0.55,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  active: boolean;
  accent: string;
  delay?: number;
  width?: number;
}) => (
  <motion.line
    x1={x1}
    y1={y1}
    x2={x2}
    y2={y2}
    stroke={accent}
    strokeWidth={width}
    strokeLinecap="round"
    initial={{ pathLength: 0, opacity: 0 }}
    animate={{
      pathLength: active ? [0.08, 1, 1] : 1,
      opacity: active ? [0.18, 0.76, 0.42] : 0.1,
    }}
    transition={{
      duration: active ? 2.8 : 0.25,
      repeat: active ? Infinity : 0,
      ease: 'easeInOut',
      delay,
    }}
  />
);

const GraphPacket = ({
  fromX,
  fromY,
  toX,
  toY,
  active,
  accent,
  delay = 0,
}: {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  active: boolean;
  accent: string;
  delay?: number;
}) => {
  if (!active) return null;
  return (
    <motion.div
      className="absolute h-1.5 w-1.5 rounded-full"
      style={{
        left: `${fromX}%`,
        top: `${fromY}%`,
        backgroundColor: accent,
        boxShadow: `0 0 12px ${accent}`,
      }}
      animate={{
        left: [`${fromX}%`, `${toX}%`],
        top: [`${fromY}%`, `${toY}%`],
        opacity: [0, 1, 0],
        scale: [0.7, 1.3, 0.7],
      }}
      transition={{
        duration: 2.4,
        repeat: Infinity,
        repeatDelay: 0.7,
        ease: 'easeInOut',
        delay,
      }}
    />
  );
};

const UmbraComfyBoot = ({
  accent,
  accentSecondary,
  depth,
  progress,
}: {
  accent: string;
  accentSecondary: string;
  depth: number;
  progress: number;
}) => {
  const services = getUmbraBootServices();
  const serviceCount = Math.max(3, Math.min(services.length, Math.round(depth / 18) + 4));
  const visibleServices = services.slice(0, serviceCount);
  const subserviceCount = visibleServices.reduce((total, service) => total + service.subs.length, 0);
  const totalActivationSteps = 1 + visibleServices.length + subserviceCount;
  const activeServiceIndex = Math.min(UMBRA_BOOT_SERVICES.length - 1, Math.floor((progress / 100) * UMBRA_BOOT_SERVICES.length));

  return (
    <div className="relative w-[min(920px,calc(100vw-40px))] px-4 py-3 text-left">
      <div
        className="absolute inset-0 opacity-45"
        style={{
          backgroundImage: `
            linear-gradient(to right, color-mix(in srgb, ${accent} 18%, transparent) 1px, transparent 1px),
            linear-gradient(to bottom, color-mix(in srgb, ${accent} 12%, transparent) 1px, transparent 1px)
          `,
          backgroundSize: '42px 42px',
          maskImage: 'linear-gradient(to bottom, transparent, black 20%, black 78%, transparent)',
        }}
      />

      <motion.div
        className="relative overflow-hidden rounded-xl border bg-black/70 p-4 shadow-2xl"
        style={{
          borderColor: `color-mix(in srgb, ${accent} 48%, transparent)`,
          boxShadow: `0 0 40px color-mix(in srgb, ${accent} 18%, transparent), inset 0 0 70px rgba(0,0,0,0.68)`,
        }}
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.32, ease: 'easeOut' }}
      >
        <motion.div
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${accent}, ${accentSecondary}, transparent)` }}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        />

        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.26em] text-zinc-500">Umbra Studio</div>
            <div
              className="mt-1 text-4xl font-black uppercase leading-none text-white"
              style={{ textShadow: `0 0 22px color-mix(in srgb, ${accent} 42%, transparent)` }}
            >
              UMBRA
            </div>
            <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-600">
              Service graph {visibleServices.length}/{services.length}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {UMBRA_BOOT_SERVICES.map((service, index) => (
              <motion.div
                key={service}
                className="rounded border px-2 py-1 text-[10px] font-black uppercase text-center"
                style={{
                  color: index <= activeServiceIndex ? accent : 'rgb(113 113 122)',
                  borderColor: index <= activeServiceIndex
                    ? `color-mix(in srgb, ${accent} 54%, transparent)`
                    : 'rgba(255,255,255,0.10)',
                  backgroundColor: index <= activeServiceIndex
                    ? `color-mix(in srgb, ${accent} 12%, transparent)`
                    : 'rgba(255,255,255,0.03)',
                }}
                animate={index === activeServiceIndex ? { opacity: [0.62, 1, 0.62] } : { opacity: 1 }}
                transition={{ duration: 0.9, repeat: index === activeServiceIndex ? Infinity : 0 }}
              >
                {service}
              </motion.div>
            ))}
          </div>
        </div>

        <div className="relative h-72 overflow-hidden rounded-lg border border-white/10 bg-zinc-950/90">
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {visibleServices.map((service, index) => {
              const active = activationForIndex(index + 1, totalActivationSteps, progress);
              return (
                <BootLink
                  key={`hub-${service.id}`}
                  x1={UMBRA_HUB.x}
                  y1={UMBRA_HUB.y}
                  x2={service.x}
                  y2={service.y}
                  active={active}
                  accent={accent}
                  delay={index * 0.08}
                  width={0.65}
                />
              );
            })}
            {visibleServices.flatMap((service, serviceIndex) => (
              service.subs.map((sub, subIndex) => {
                const active = activationForIndex(
                  visibleServices.length + serviceIndex + subIndex + 1,
                  totalActivationSteps,
                  progress
                );
                return (
                  <BootLink
                    key={`${service.id}-${sub.id}`}
                    x1={service.x}
                    y1={service.y}
                    x2={sub.x}
                    y2={sub.y}
                    active={active}
                    accent={subIndex % 2 === 0 ? accent : accentSecondary}
                    delay={(serviceIndex + subIndex) * 0.06}
                    width={0.38}
                  />
                );
              })
            ))}
          </svg>

          {visibleServices.map((service, index) => {
            const active = activationForIndex(index + 1, totalActivationSteps, progress);
            return (
              <GraphPacket
                key={`packet-hub-${service.id}`}
                fromX={UMBRA_HUB.x}
                fromY={UMBRA_HUB.y}
                toX={service.x}
                toY={service.y}
                active={active}
                accent={accent}
                delay={index * 0.24}
              />
            );
          })}

          {visibleServices.flatMap((service, serviceIndex) => (
            service.subs.map((sub, subIndex) => {
              const active = activationForIndex(
                visibleServices.length + serviceIndex + subIndex + 1,
                totalActivationSteps,
                progress
              );
              return (
                <GraphPacket
                  key={`packet-${service.id}-${sub.id}`}
                  fromX={service.x}
                  fromY={service.y}
                  toX={sub.x}
                  toY={sub.y}
                  active={active}
                  accent={subIndex % 2 === 0 ? accent : accentSecondary}
                  delay={0.28 + serviceIndex * 0.18 + subIndex * 0.12}
                />
              );
            })
          ))}

          <motion.div
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-4 py-3 text-center"
            style={{
              left: `${UMBRA_HUB.x}%`,
              top: `${UMBRA_HUB.y}%`,
              color: 'white',
              borderColor: `color-mix(in srgb, ${accent} 70%, transparent)`,
              background: `radial-gradient(circle, color-mix(in srgb, ${accent} 22%, black), rgba(0,0,0,0.9) 70%)`,
              boxShadow: `0 0 30px color-mix(in srgb, ${accent} 36%, transparent)`,
            }}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: [1, 1.06, 1], opacity: 1 }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <div className="text-[10px] font-black uppercase tracking-[0.16em]">{UMBRA_HUB.label}</div>
          </motion.div>

          {visibleServices.map((service, index) => {
            const serviceActive = activationForIndex(index + 1, totalActivationSteps, progress);
            return (
              <ServicePill
                key={service.id}
                label={service.shortLabel}
                active={serviceActive}
                accent={accent}
                accentSecondary={accentSecondary}
                x={service.x}
                y={service.y}
                delay={index * 0.08}
              />
            );
          })}

          {visibleServices.flatMap((service, serviceIndex) => (
            service.subs.map((sub, subIndex) => {
              const subActive = activationForIndex(
                visibleServices.length + serviceIndex + subIndex + 1,
                totalActivationSteps,
                progress
              );
              return (
                <ServicePill
                  key={`${service.id}-${sub.id}`}
                  label={sub.label}
                  active={subActive}
                  accent={subIndex % 2 === 0 ? accent : accentSecondary}
                  accentSecondary={accentSecondary}
                  x={sub.x}
                  y={sub.y}
                  compact
                  delay={(serviceIndex + subIndex) * 0.05}
                />
              );
            })
          ))}

        </div>
      </motion.div>
    </div>
  );
};

// ============================================
// MAIN BOOT SCREEN
// ============================================
export const BootScreen = ({
  onComplete,
  hold = false,
  holdStatus = 'WARMING SERVICES',
}: {
  onComplete: () => void;
  hold?: boolean;
  holdStatus?: string;
}) => {
  const accent = useThemeStore((s) => s.colors.accent);
  const accentSecondary = useThemeStore((s) => s.colors.accentSecondary || s.colors.accent);
  const bootAnimation = useThemeStore((s) => s.bootAnimation);
  const bootGraphEnabled = useThemeStore((s) => s.bootGraphEnabled);
  const bootRainContent = useThemeStore((s) => s.bootRainContent ?? 'kanji');
  const bootDepth = useThemeStore((s) => s.bootDepth ?? 50);
  const bootImageBackgroundId = useThemeStore((s) => s.bootImageBackgroundId ?? 'random');
  const bootLogoStyle = useThemeStore((s) => s.bootLogoStyle ?? 'banner');
  const bootAsciiAnimated = useThemeStore((s) => s.bootAsciiAnimated ?? true);
  const bootTextVariant = useThemeStore((s) => s.bootTextVariant ?? 'bloody');
  const asciiLogo = getBootAsciiLogo(bootTextVariant);
  const [progress, setProgress] = useState(0);
  const completeTriggeredRef = useRef(false);
  const randomBackgroundIndexRef = useRef(Math.floor(Math.random() * 100000));
  const isImageBoot = bootAnimation === 'image';
  const showBootGraph = !isImageBoot && (bootGraphEnabled || bootAnimation === 'comfy');
  const hasBootVisual = bootAnimation !== 'none' || showBootGraph;
  const showBootLogo = !isImageBoot;
  const bootImageBackground = getBootImageBackground(bootImageBackgroundId, randomBackgroundIndexRef.current);

  const status = useMemo(() => {
    if (hold) return holdStatus;
    if (progress >= 100) return 'READY';
    if (progress >= 82) return 'FINALIZING';
    if (progress >= 42) return 'LOADING INTERFACES';
    return 'INITIALIZING';
  }, [hold, holdStatus, progress]);

  useEffect(() => {
    if (!hasBootVisual) {
      onComplete();
      return;
    }

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (hold) {
          const holdStep = bootAnimation === 'fade'
            ? 4.5
            : showBootGraph
              ? 0.72
              : 2.8;
          const holdCap = 92;
          return prev >= holdCap ? holdCap : Math.min(holdCap, prev + holdStep);
        }

        if (prev >= 100) return 100;
        const releaseStep = showBootGraph
          ? (prev < 92 ? 1.8 : 3.2)
          : (prev < 92 ? 8 : 12);
        return Math.min(100, prev + releaseStep);
      });
    }, showBootGraph ? 28 : 16);

    return () => {
      clearInterval(interval);
    };
  }, [bootAnimation, hasBootVisual, hold, onComplete, showBootGraph]);

  useEffect(() => {
    if (!hasBootVisual || hold || progress < 100) return;
    const timer = setTimeout(() => {
      if (completeTriggeredRef.current) return;
      completeTriggeredRef.current = true;
      onComplete();
    }, 80);
    return () => clearTimeout(timer);
  }, [hasBootVisual, hold, onComplete, progress]);

  if (!hasBootVisual) return null;

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="pointer-events-none fixed inset-0 z-[99999999] bg-[#050508] flex flex-col items-center justify-center overflow-hidden"
    >
      {/* Background Effects - fade in behind logo */}
      <AnimatePresence>
        {bootAnimation === 'matrix' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
            className="pointer-events-none absolute inset-0"
          >
            <MatrixRain accent={accent} depth={bootDepth} content={bootRainContent} />
          </motion.div>
        )}

        {bootAnimation === 'hex' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.7 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
            className="pointer-events-none absolute inset-0"
          >
            <HexGrid accent={accent} depth={bootDepth} />
          </motion.div>
        )}

        {bootAnimation === 'image' && bootImageBackground && (
          <div className="pointer-events-none absolute inset-0">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${bootImageBackground.src})` }}
            />
            <div
              className="absolute inset-0"
              style={{
                background: `
                  radial-gradient(circle at 50% 42%, rgba(0,0,0,0.08), rgba(0,0,0,0.46) 62%, rgba(0,0,0,0.82)),
                  linear-gradient(120deg, rgba(0,0,0,0.22), rgba(0,0,0,0.48))
                `,
              }}
            />
          </div>
        )}

        {showBootGraph && bootAnimation === 'none' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.85 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24 }}
            className="pointer-events-none absolute inset-0"
            style={{
              background: `
                linear-gradient(120deg, rgba(0,0,0,0.88), rgba(0,0,0,0.56)),
                linear-gradient(to bottom, color-mix(in srgb, ${accent} 10%, transparent), transparent 42%, color-mix(in srgb, ${accentSecondary} 8%, transparent))
              `,
            }}
          />
        )}
      </AnimatePresence>

      {showBootLogo && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="relative z-10 mb-6 text-center"
        >
          {showBootGraph ? (
            <UmbraComfyBoot accent={accent} accentSecondary={accentSecondary} depth={bootDepth} progress={progress} />
          ) : bootLogoStyle === 'banner' ? (
            <UmbraDynamicBootLogo accent={accent} progress={progress} />
          ) : bootAnimation === 'glitch' ? (
            <GlitchText text={asciiLogo} accent={accent} />
          ) : (
            <AnimatedASCII text={asciiLogo} accent={accent} animated={bootAsciiAnimated} />
          )}
        </motion.div>
      )}

      {/* Progress Bar */}
      <motion.div
        initial={{ opacity: 0, width: 0 }}
        animate={{ opacity: 1, width: 192 }}
        transition={{ delay: 0.1, duration: 0.2 }}
        className="relative z-10"
      >
        <div className="w-48 h-[2px] bg-zinc-900 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{
              backgroundColor: accent,
              boxShadow: `0 0 10px ${accent}`,
            }}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.1 }}
          />
        </div>
      </motion.div>

      {/* Loading Text */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.3 }}
        transition={{ delay: 0.2 }}
        className="relative z-10 mt-4 text-zinc-600 text-[10px] font-mono tracking-wider"
      >
        {status}
      </motion.p>
    </motion.div>
  );
};
