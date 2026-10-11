import { mangaFont, mangaLettering, mangaPanelPath, type MangaLayer, type MangaPage } from './mangaModel';
import { mangaTextFrames } from './mangaBubbles';
import { mangaTextMesh } from './mangaTextPerspective';

let measureContext: CanvasRenderingContext2D | null = null;
export const mangaCanvasFont = (layer: MangaLayer, size: number) => `${mangaLettering(layer).italic ? 'italic ' : ''}${mangaLettering(layer).weight} ${size}px ${mangaFont(layer.font)}`;
export function mangaTextLayout(layer: MangaLayer) {
  const style = layer.textFit && layer.textFit !== 'manual' ? {...mangaLettering(layer),wrap:true,autoFit:layer.textFit === 'text'} : mangaLettering(layer), legacy = !layer.lettering;
  if (!measureContext && typeof document !== 'undefined') measureContext = document.createElement('canvas').getContext('2d');
  const marginX = layer.kind === 'sfx' && !legacy ? 0 : layer.width * (layer.balloon?.padding ?? (layer.shape === 'square' || layer.kind === 'sfx' ? .07 : .16));
  const marginY = layer.kind === 'sfx' ? 0 : layer.height * (layer.balloon?.padding ?? .16);
  const availableWidth = Math.max(1, layer.width - marginX * 2), availableHeight = Math.max(1, layer.height - marginY * 2);
  const measure = (value: string, size: number) => { if (measureContext) { measureContext.font = mangaCanvasFont(layer, size); if ('letterSpacing' in measureContext) measureContext.letterSpacing = '0px'; } return (measureContext?.measureText(value).width ?? value.length * size * .6) + Math.max(0, Array.from(value).length - 1) * style.letterSpacing; };
  const wrap = (size: number) => layer.text.split('\n').flatMap(paragraph => {
    if (!style.wrap) return [paragraph];
    const lines: string[] = []; let current = '';
    for (const character of Array.from(paragraph)) {
      if (current && measure(current + character, size) > availableWidth) {
        const space = current.lastIndexOf(' ');
        if (space > 0) { lines.push(legacy ? current.slice(0, space).trim() : current.slice(0, space)); current = current.slice(space + 1); }
        else { lines.push(legacy ? current.trim() : current); current = ''; }
      }
      current += character;
    }
    lines.push(legacy ? current.trim() : current); return lines;
  });
  let size = layer.fontSize, lines = wrap(size);
  if (legacy && size <= 1000) {
    // Keep the original integer fitting and wrapping for existing saved books.
    while (size > 8 && lines.length * size * 1.2 > layer.height * .68) { size -= 1; lines = wrap(size); }
  } else if (style.autoFit) {
    const fits = (candidate: number, rows: string[]) => rows.length * candidate * style.lineHeight <= availableHeight && rows.every(line => measure(line, candidate) <= availableWidth);
    if (!fits(size, lines)) {
      let low = layer.lettering ? .1 : 8, high = Math.max(low, size);
      for (let step = 0; step < 20; step++) { const next = (low + high) / 2; if (fits(next, wrap(next))) low = next; else high = next; }
      size = low; lines = wrap(size);
    }
  }
  const lineStep = size * style.lineHeight;
  const x = style.align === 'left' ? marginX : style.align === 'right' ? layer.width - marginX : layer.width / 2;
  const y = style.verticalAlign === 'top' ? marginY + size / 2 : style.verticalAlign === 'bottom' ? layer.height - marginY - size / 2 - (lines.length - 1) * lineStep : layer.height / 2 - (lines.length - 1) * lineStep / 2;
  let baselineOffset = size * .3;
  if (measureContext) {
    // SVG and Canvas use different definitions of “middle”. Measure Canvas's
    // alphabetic offset so preview and raster export place glyphs identically.
    measureContext.font = mangaCanvasFont(layer, size);
    const sample = lines.find(line => line.length) || 'Ag';
    measureContext.textBaseline = 'alphabetic'; const alphabetic = measureContext.measureText(sample).actualBoundingBoxAscent;
    measureContext.textBaseline = 'middle'; const middle = measureContext.measureText(sample).actualBoundingBoxAscent;
    measureContext.textBaseline = 'alphabetic';
    if (Number.isFinite(alphabetic - middle)) baselineOffset = alphabetic - middle;
  }
  return { lines, size, x, y, baselineOffset, lineStep, style, measure: (value: string) => measure(value, size) };
}

export function fitMangaBalloon(layer: MangaLayer): MangaLayer {
  if (layer.kind === 'image' || layer.locked || layer.textFit !== 'balloon') return layer;
  const padding = layer.kind === 'sfx' ? 0 : layer.balloon?.padding ?? .16;
  const preferredWidth = layer.textFitWidth ?? layer.width;
  const frames = mangaTextFrames({...layer,width:preferredWidth,height:4096,textFit:'manual',lettering:{...mangaLettering(layer),wrap:true,autoFit:false}});
  const layouts = frames.map(frame => mangaTextLayout(frame));
  const width = Math.min(4096,Math.max(32,...layouts.flatMap(layout => layout.lines.map(line => layout.measure(line)))) / (1 - padding * 2));
  const height = Math.min(4096,Math.max(32,...layouts.map(layout => layout.lines.length * layout.size * layout.style.lineHeight)) * frames.length / (1 - padding * 2));
  // Keep the balloon center and the speaker's tail target fixed while it grows.
  const dx = (width - layer.width) / 2, dy = (height - layer.height) / 2;
  const coordinate=(value:number)=>Math.max(-8192,Math.min(8192,value));
  return {...layer,width,height,x:coordinate(layer.x-dx),y:coordinate(layer.y-dy),tailX:coordinate(layer.tailX+dx),tailY:coordinate(layer.tailY+dy),textFitWidth:preferredWidth};
}

export function mangaTextBounds(layer: MangaLayer) {
  const layout=mangaTextLayout(layer),padding=layout.size+layout.style.outlineWidth+Math.abs(layout.style.letterSpacing);
  const width=Math.max(1,...layout.lines.map(line=>Math.abs(layout.measure(line))));
  const x=layout.x-(layout.style.align==='center'?width/2:layout.style.align==='right'?width:0);
  return {x:x-padding,y:layout.y-padding,width:width+2*padding,height:(layout.lines.length-1)*layout.lineStep+2*padding};
}

export function drawMangaText(context: CanvasRenderingContext2D, layer: MangaLayer, page?: MangaPage): void {
  context.save();
  const clipping = page?.panels.find(panel => panel.id === layer.clipPanelId);
  if (clipping) context.clip(new Path2D(mangaPanelPath(clipping, false, (page?.panelGap || 0) / 2)));
  context.translate(layer.x, layer.y); context.translate(layer.width / 2, layer.height / 2); context.rotate(layer.rotation * Math.PI / 180); context.translate(-layer.width / 2, -layer.height / 2);
  for (const frame of mangaTextFrames(layer)) {
    const layout = mangaTextLayout(frame), style = layout.style;
    context.save(); context.translate(layer.textTransform?.offsetX || 0, frame.y - layer.y + (layer.textTransform?.offsetY || 0));
    if (layer.textTransform) {
      const transform = layer.textTransform;
      context.translate(frame.width / 2, frame.height / 2); context.rotate((transform.rotation || 0) * Math.PI / 180); context.transform(1, 0, Math.tan(transform.skewX * Math.PI / 180), 1, 0, 0); context.transform(1, Math.tan((transform.skewY || 0) * Math.PI / 180), 0, 1, 0, 0); context.scale(transform.scaleX, transform.scaleY); context.translate(-frame.width / 2, -frame.height / 2);
    }
    const paint = (target: CanvasRenderingContext2D) => {
    target.font = mangaCanvasFont(frame, layout.size); target.textAlign = style.align; target.textBaseline = 'middle'; target.lineJoin = 'round';
    target.fillStyle = style.color || (layer.inverted ? '#ffffff' : '#111111'); target.strokeStyle = style.outlineColor || (layer.inverted ? '#111111' : '#ffffff'); target.lineWidth = style.outlineWidth;
    const nativeSpacing = Reflect.has(context, 'letterSpacing');
    if (nativeSpacing) target.letterSpacing = `${style.letterSpacing}px`;
    layout.lines.forEach((line, index) => {
      const y = layout.y + index * layout.lineStep;
      if (nativeSpacing || !style.letterSpacing) { if (style.outlineWidth > 0) target.strokeText(line, layout.x, y); target.fillText(line, layout.x, y); }
      else {
        const width = layout.measure(line); let x = layout.x - (style.align === 'center' ? width / 2 : style.align === 'right' ? width : 0); target.textAlign = 'left';
        for (const character of Array.from(line)) { if (style.outlineWidth > 0) target.strokeText(character, x, y); target.fillText(character, x, y); x += target.measureText(character).width + style.letterSpacing; }
        target.textAlign = style.align;
      }
      if (style.underline) { const width = layout.measure(line); const x = layout.x - (style.align === 'center' ? width / 2 : style.align === 'right' ? width : 0); target.fillRect(x, y + layout.size * .45, width, Math.max(1, layout.size / 20)); }
    });
    };
    const mesh = mangaTextMesh(mangaTextBounds(frame), frame.width, frame.height, layer.textTransform?.tiltX || 0, layer.textTransform?.tiltY || 0);
    if (mesh.length) {
      const bounds = mangaTextBounds(frame), canvas = document.createElement('canvas');
      const resolution = Math.min(1, 4096 / Math.max(bounds.width, bounds.height));
      canvas.width = Math.max(1, Math.ceil(bounds.width * resolution)); canvas.height = Math.max(1, Math.ceil(bounds.height * resolution));
      const source = canvas.getContext('2d');
      if (!source) throw new Error('Lettering export canvas is unavailable.');
      source.scale(resolution, resolution); source.translate(-bounds.x, -bounds.y); paint(source);
      for (const triangle of mesh) {
        context.save(); context.beginPath(); triangle.target.forEach((point, i) => i ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)); context.closePath(); context.clip();
        const [a,b,c,d,e,f] = triangle.matrix; context.transform(a,b,c,d,e,f);
        context.drawImage(canvas, bounds.x, bounds.y, canvas.width / resolution, canvas.height / resolution); context.restore();
      }
    } else paint(context);
    context.restore();
  }
  context.restore();
}
