import {MangaGifArt} from './MangaGifArt';
import React from 'react';
import { mangaFont, mangaLayerFrame, mangaPanelPath, mangaIsPanelBackground, type MangaLayer, type MangaPage } from './mangaModel';
import { mangaTextBounds, mangaTextLayout } from './mangaLettering';
import { mangaTextMesh, mangaTrianglePath } from './mangaTextPerspective';
import { mangaBalloonPath, mangaBalloonStyle, mangaTelepathySpikes, mangaTextFrames } from './mangaBubbles';

function MangaTextArt({ layer, ink, fill, prefix }: { layer: MangaLayer; ink: string; fill: string; prefix: string }) {
  return <>{mangaTextFrames(layer).map((frame, index) => {
    const text = mangaTextLayout(frame), transform = layer.textTransform;
    const mesh = mangaTextMesh(mangaTextBounds(frame), frame.width, frame.height, transform?.tiltX || 0, transform?.tiltY || 0);
    const id = `${prefix}-${layer.id}-lettering-${index}`;
    const content = <>
      <text x={text.x} y={text.y + (layer.lettering ? text.baselineOffset : 0)} fill={text.style.color || ink} fontFamily={mangaFont(layer.font)} fontSize={text.size} fontWeight={text.style.weight} textAnchor={text.style.align === 'left' ? 'start' : text.style.align === 'right' ? 'end' : 'middle'} dominantBaseline={layer.lettering ? 'alphabetic' : 'middle'} strokeLinejoin="round" stroke={text.style.outlineWidth > 0 ? text.style.outlineColor || fill : 'none'} strokeWidth={text.style.outlineWidth} paintOrder="stroke fill" fontStyle={text.style.italic ? 'italic' : undefined} letterSpacing={text.style.letterSpacing}>
        {text.lines.map((line, row) => <tspan key={row} x={text.x} dy={row ? text.lineStep : 0} xmlSpace="preserve">{line}</tspan>)}
      </text>
      {text.style.underline && text.lines.map((line, row) => { const width = text.measure(line); const x = text.x - (text.style.align === 'center' ? width / 2 : text.style.align === 'right' ? width : 0); return <rect key={row} x={x + Math.min(0, width)} y={text.y + row * text.lineStep + text.size * .45} width={Math.abs(width)} height={Math.max(1, text.size / 20)} fill={text.style.color || ink} />; })}
    </>;
    return <g key={index} transform={`translate(${transform?.offsetX || 0} ${frame.y - layer.y + (transform?.offsetY || 0)})${transform ? ` translate(${frame.width / 2} ${frame.height / 2}) rotate(${transform.rotation || 0}) skewX(${transform.skewX}) skewY(${transform.skewY || 0}) scale(${transform.scaleX} ${transform.scaleY}) translate(${-frame.width / 2} ${-frame.height / 2})` : ''}`}>
      {mesh.length ? <><defs><g id={id}>{content}</g>{mesh.map((triangle, i) => <clipPath key={i} id={`${id}-clip-${i}`}><path d={mangaTrianglePath(triangle)} /></clipPath>)}</defs>{mesh.map((triangle, i) => <g key={i} clipPath={`url(#${id}-clip-${i})`}><use href={`#${id}`} transform={`matrix(${triangle.matrix.join(' ')})`} /></g>)}</> : content}
    </g>;
  })}</>;
}

export function mangaBubblePath(width: number, height: number, shape: MangaLayer['shape'], textType?: MangaLayer['textType']): string {
  if (shape === 'square') return `M 12 0 H ${width - 12} Q ${width} 0 ${width} 12 V ${height - 12} Q ${width} ${height} ${width - 12} ${height} H 12 Q 0 ${height} 0 ${height - 12} V 12 Q 0 0 12 0 Z`;
  if (shape === 'spiky') {
    const count = textType === 'angry' ? 28 : 48;
    const points = Array.from({ length: count }, (_, i) => { const angle = i * Math.PI * 2 / count; const radius = i % 2 ? (textType === 'angry' ? .68 + (i % 3) * .06 : .82) : 1; return `${width / 2 + Math.cos(angle) * width / 2 * radius},${height / 2 + Math.sin(angle) * height / 2 * radius}`; });
    return `M ${points.join(' L ')} Z`;
  }
  if (shape === 'thought') {
    const points = Array.from({ length: 120 }, (_, i) => { const angle = i * Math.PI / 60; const radius = .94 + .06 * Math.cos(angle * 12); return `${width / 2 + Math.cos(angle) * width / 2 * radius},${height / 2 + Math.sin(angle) * height / 2 * radius}`; });
    return `M ${points.join(' L ')} Z`;
  }
  return `M 0 ${height / 2} A ${width / 2} ${height / 2} 0 1 0 ${width} ${height / 2} A ${width / 2} ${height / 2} 0 1 0 0 ${height / 2} Z`;
}

export function MangaLayerArt({ layer, page, prefix, exporting = false, reader = false }: { layer: MangaLayer; page: MangaPage; prefix: string; exporting?: boolean; reader?:boolean }) {
  const frame = mangaLayerFrame(layer, page);
  const { width, height } = frame;
  const panel = page.panels.find(item => item.id === layer.panelId);
  const fill = layer.inverted ? '#111111' : '#ffffff';
  const ink = layer.inverted ? '#ffffff' : '#111111';
  const modern = !!layer.balloon || ['manga', 'rough', 'telepathy', 'joined'].includes(layer.shape);
  const balloon = mangaBalloonStyle(layer);
  const clipping = page.panels.find(item => item.id === layer.clipPanelId);
  if (layer.kind === 'image') return <g opacity={layer.opacity ?? 1} data-manga-reader-animation={reader && layer.imageUrl.startsWith('data:image/gif;') ? '' : undefined}>
    {panel && <defs><clipPath id={`${prefix}-${layer.id}-panel`}><path d={mangaPanelPath(panel, false, (page.panelGap || 0) / 2)} /></clipPath></defs>}
    <g clipPath={panel ? `url(#${prefix}-${layer.id}-panel)` : undefined}>
      <g transform={`translate(${frame.x} ${frame.y}) rotate(${mangaIsPanelBackground(layer) ? 0 : layer.rotation} ${width / 2} ${height / 2})`}>
        <defs><clipPath id={`${prefix}-${layer.id}`}><rect width={width} height={height} /></clipPath></defs>
        <g clipPath={`url(#${prefix}-${layer.id})`}>{layer.imageUrl.startsWith('data:image/gif;') && !reader ? <MangaGifArt imageUrl={layer.imageUrl} animation={layer.animation} x={width * (1 - layer.zoom) / 2 + layer.cropX * width / 100} y={height * (1 - layer.zoom) / 2 + layer.cropY * height / 100} width={width*layer.zoom} height={height*layer.zoom} fit={layer.imageFit === 'contain' ? 'contain':'cover'} /> : <image data-manga-gif={reader && layer.imageUrl.startsWith('data:image/gif;') ? '' : undefined} data-speed={layer.animation?.speed || 1} data-loop={layer.animation?.loop !== false} data-trigger={layer.animation?.trigger || 'visible'} data-name={layer.name} href={layer.imageUrl} x={width * (1 - layer.zoom) / 2 + layer.cropX * width / 100} y={height * (1 - layer.zoom) / 2 + layer.cropY * height / 100} width={width * layer.zoom} height={height * layer.zoom} preserveAspectRatio={layer.imageFit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice'} />}</g>
      </g>
    </g>
  </g>;
  return <g data-manga-lettering="">
    {clipping && <defs><clipPath id={`${prefix}-${layer.id}-text-panel`}><path d={mangaPanelPath(clipping, false, (page.panelGap || 0) / 2)} /></clipPath></defs>}
    <g clipPath={clipping ? `url(#${prefix}-${layer.id}-text-panel)` : undefined}>
    <g transform={`translate(${frame.x} ${frame.y}) rotate(${layer.panelId ? 0 : layer.rotation} ${width / 2} ${height / 2})`}>
    <>
      {layer.kind === 'bubble' && layer.bubbleVisible !== false && <>
        <path data-manga-text-container="" d={modern ? mangaBalloonPath(layer) : mangaBubblePath(width, height, layer.shape, layer.textType)} fill={fill} stroke={ink} strokeWidth={modern ? balloon.strokeWidth : 4} strokeLinejoin="round" strokeDasharray={!modern && layer.textType === 'off-screen' ? '12 8' : undefined} />
        {layer.shape === 'telepathy' && <>
          {mangaTelepathySpikes(layer).map((path, index) => <path key={index} data-manga-balloon-spike="" d={path} fill={fill} stroke={ink} strokeWidth={balloon.strokeWidth} strokeLinejoin="round" />)}
          <path data-manga-inner-outline="" d={mangaBalloonPath(layer, Math.min(balloon.outlineGap, width * .2, height * .2), false)} fill="none" stroke={ink} strokeWidth={balloon.strokeWidth} />
        </>}
        {layer.tail && (layer.shape === 'thought' ? <><ellipse cx={layer.tailX} cy={layer.tailY} rx={10} ry={8} fill={fill} stroke={ink} strokeWidth={3} /><ellipse cx={(layer.tailX + width / 2) / 2} cy={(layer.tailY + height * .8) / 2} rx={15} ry={12} fill={fill} stroke={ink} strokeWidth={3} /></> : !modern && <path d={`M ${width * .4} ${height * .88} L ${layer.tailX} ${layer.tailY} L ${width * .58} ${height * .88}`} fill={fill} stroke={ink} strokeWidth={4} />)}
      </>}
      {!exporting && <MangaTextArt layer={layer} ink={ink} fill={fill} prefix={prefix} />}
    </>
    </g></g>
  </g>;
}

export function MangaPageArt({ page, prefix = 'page', onSelect, onEditText, selectedId, drawMode = false, exporting = false, reader = false }: { page: MangaPage; prefix?: string; onSelect?: (id: string, event: React.PointerEvent<SVGGElement>) => void; onEditText?: (id: string) => void; selectedId?: string | null; drawMode?: boolean; exporting?: boolean; reader?:boolean }) {
  return <>
    {page.background === 'white' && <rect width={page.width} height={page.height} fill="#ffffff" />}
    {page.panels.map(panel => <g key={panel.id}>
      <g data-manga-item={panel.id} onPointerDown={event => onSelect?.(panel.id, event)} style={{ cursor: onSelect ? 'move' : undefined, pointerEvents: drawMode ? 'none' : undefined }}>
        <path d={mangaPanelPath(panel, false, (page.panelGap || 0) / 2)} fill={page.background === 'white' ? '#ffffff' : 'transparent'} />
      </g>
      {page.layers.filter(layer => layer.visible && layer.panelId === panel.id).map(layer => <g key={layer.id} data-manga-item={layer.id} onDoubleClick={() => { if (layer.kind !== 'image' && !layer.locked) onEditText?.(layer.id); }} onPointerDown={event => onSelect?.(layer.id, event)} style={{ cursor: onSelect ? 'move' : undefined, pointerEvents: drawMode ? 'none' : undefined }}>
        <MangaLayerArt layer={layer} page={page} prefix={prefix} exporting={exporting} reader={reader} />
        {onSelect && <g clipPath={`url(#${prefix}-${layer.id}-panel)`}><rect {...mangaLayerFrame(layer, page)} fill="transparent" transform={`rotate(${mangaIsPanelBackground(layer) ? 0 : layer.rotation} ${mangaLayerFrame(layer, page).x + mangaLayerFrame(layer, page).width / 2} ${mangaLayerFrame(layer, page).y + mangaLayerFrame(layer, page).height / 2})`} stroke="none" /></g>}
      </g>)}
      <path d={mangaPanelPath(panel, false, (page.panelGap || 0) / 2)} fill="none" stroke="#111111" strokeWidth={5} pointerEvents="none" />
    </g>)}
    {page.layers.filter(layer => layer.visible && !layer.panelId).map(layer => <g key={layer.id} data-manga-item={layer.id} onDoubleClick={() => { if (layer.kind !== 'image' && !layer.locked) onEditText?.(layer.id); }} onPointerDown={event => onSelect?.(layer.id, event)} style={{ cursor: onSelect ? 'move' : undefined, pointerEvents: drawMode ? 'none' : undefined }}>
      <MangaLayerArt layer={layer} page={page} prefix={prefix} exporting={exporting} reader={reader} />
      {onSelect && <g clipPath={layer.clipPanelId ? `url(#${prefix}-${layer.id}-text-panel)` : undefined}><rect {...mangaLayerFrame(layer, page)} fill="transparent" stroke="none" transform={`rotate(${layer.rotation} ${layer.x + layer.width / 2} ${layer.y + layer.height / 2})`} /></g>}
    </g>)}
    {selectedId && (() => { const layer = page.layers.find(layer => layer.id === selectedId); const item = layer || page.panels.find(panel => panel.id === selectedId); if (!item) return null; const frame = layer ? mangaLayerFrame(layer, page) : item;
      return <rect {...{ x: frame.x, y: frame.y, width: frame.width, height: frame.height }} transform={`rotate(${layer && mangaIsPanelBackground(layer) ? 0 : layer?.rotation || 0} ${frame.x + frame.width / 2} ${frame.y + frame.height / 2})`} fill="none" stroke="var(--umbra-accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeDasharray="6 4" pointerEvents="none" />;
    })()}
  </>;
}
