import * as React from 'react';

export type UmbraLogoProps = {
  color?: string;
  src?: string;
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
};

const DEFAULT_LOGO_SRC = '/assets/umbra-logo-source-clean.png';
const VIEWBOX_WIDTH = 917;
const VIEWBOX_HEIGHT = 661;

function normalizeHex(input: string): string {
  let hex = input.trim();
  if (!hex.startsWith('#')) hex = `#${hex}`;
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    const r = hex[1];
    const g = hex[2];
    const b = hex[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex.toLowerCase();
  return '#ff3030';
}

function hexToRgb(hexInput: string) {
  const hex = normalizeHex(hexInput);
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function makeColorMatrix(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const rr = (r / 255).toFixed(4);
  const gg = (g / 255).toFixed(4);
  const bb = (b / 255).toFixed(4);
  return [`${rr} 0 0 0 0`, `${gg} 0 0 0 0`, `${bb} 0 0 0 0`, '0 0 0 1 0'].join(' ');
}

export function UmbraLogo({
  color = '#ff3030',
  src,
  width = '100%',
  height,
  className,
  style,
  title = 'Umbra Studio',
}: UmbraLogoProps) {
  const rawId = React.useId().replace(/:/g, '');
  const filterId = `umbraLogoColorize${rawId}`;
  const normalizedColor = normalizeHex(color);
  const matrix = makeColorMatrix(normalizedColor);
  const imageHref = src || DEFAULT_LOGO_SRC;

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      width={width}
      height={height}
      className={className}
      style={{ display: 'block', overflow: 'visible', ...style }}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <defs>
        <filter id={filterId} x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
          <feColorMatrix in="SourceGraphic" type="matrix" values={matrix} />
        </filter>
      </defs>
      <image
        href={imageHref}
        xlinkHref={imageHref}
        width={VIEWBOX_WIDTH}
        height={VIEWBOX_HEIGHT}
        preserveAspectRatio="xMidYMid meet"
        filter={`url(#${filterId})`}
      />
    </svg>
  );
}

export default UmbraLogo;
