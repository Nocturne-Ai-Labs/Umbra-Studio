export interface MangaTemplate { id: string; name: string; category: string; boxes: number[][]; shapes?: Record<number, number[]>; bleed?: boolean }
const rows = (counts: number[], weights = counts.map(() => 1)): number[][] => {
  const gap = .02, total = weights.reduce((a, b) => a + b, 0), usable = 1 - gap * (counts.length - 1); let y = 0;
  return counts.flatMap((count, row) => { const height = usable * weights[row] / total, width = (1 - gap * (count - 1)) / count; const boxes = Array.from({ length: count }, (_, col) => [col * (width + gap), y, width, height]); y += height + gap; return boxes; });
};
const columns = (counts: number[], weights?: number[]) => rows(counts, weights).map(([x, y, w, h]) => [y, x, h, w]);
export const MANGA_TEMPLATES: MangaTemplate[] = [
  { id: 'blank', name: 'Blank page', category: 'Splash & insets', boxes: [] },
  { id: 'splash', name: 'Splash', category: 'Splash & insets', boxes: [[0, 0, 1, 1]] },
  { id: 'two', name: 'Two scenes', category: 'Classic', boxes: rows([1, 1]) },
  { id: 'three', name: 'Wide + two', category: 'Classic', boxes: rows([1, 2]) },
  { id: 'four', name: 'Four panels', category: 'Classic', boxes: rows([2, 2]) },
  { id: 'six', name: 'Six panels', category: 'Classic', boxes: rows([2, 2, 2]) },
  { id: 'hero', name: 'Hero + strips', category: 'Columns', boxes: columns([1, 3], [2, 1]) },
  { id: 'yonkoma', name: 'Four-strip', category: 'Strips', boxes: rows([1, 1, 1, 1]) },
  ...[[2,1],[1,2,2],[2,1,2],[2,2,1],[3,3],[3,2],[2,3],[3,1,2],[2,1,3],[2,2,2,2],[3,3,3],[1,3,2],[3,2,1]].map((counts, index) => ({ id: `classic-${index}`, name: counts.join(' / ') + ' panels', category: 'Classic', boxes: rows(counts) })),
  ...[
    { name: 'Establishing shot', counts: [1,2,2], weights: [2,1,1] },
    { name: 'Final reveal', counts: [2,2,1], weights: [1,1,2] },
    { name: 'Wide confrontation', counts: [2,1,2], weights: [1,2,1] },
    { name: 'Panorama triptych', counts: [1,1,1], weights: [1,1,1] },
    { name: 'Thin reaction strips', counts: [1,1,1,1,1], weights: [1,1,1,1,1] },
    { name: 'Double widescreen', counts: [1,2,1], weights: [2,1,2] },
    { name: 'Opening montage', counts: [3,1,2], weights: [1,3,1] },
    { name: 'Cliffhanger', counts: [2,3,1], weights: [1,1,3] },
  ].map((item,index) => ({ id: `cinema-${index}`, name: item.name, category: 'Cinematic', boxes: rows(item.counts,item.weights) })),
  ...[[1,1],[1,1,1],[1,2],[2,1],[1,3],[3,1],[2,2],[1,4],[4,1],[2,3],[3,2]].map((counts,index) => ({ id: `column-${index}`, name: `Columns ${counts.join(' / ')}`, category: 'Columns', boxes: columns(counts) })),
  ...[3,5,6,8].map(count => ({ id: `strip-${count}`, name: `${count} story beats`, category: 'Strips', boxes: rows(Array(count).fill(1)) })),
  { id: 'full-bleed', name: 'Full bleed', category: 'Splash & insets', bleed: true, boxes: [[0,0,1,1]] },
  { id: 'splash-corner', name: 'Splash + corner', category: 'Splash & insets', boxes: [[0,0,1,1],[.62,.64,.34,.32]] },
  { id: 'splash-reactions', name: 'Splash + reactions', category: 'Splash & insets', boxes: [[0,0,1,1],[.05,.05,.28,.2],[.67,.72,.28,.23]] },
  { id: 'inset-stack', name: 'Splash + inset stack', category: 'Splash & insets', boxes: [[0,0,1,1],[.66,.08,.28,.22],[.66,.34,.28,.22],[.66,.6,.28,.22]] },
  { id: 'floating', name: 'Floating moments', category: 'Splash & insets', boxes: [[0,0,.65,.43],[.4,.32,.6,.38],[.05,.65,.7,.35]] },
  { id: 'diagonal-duel', name: 'Diagonal duel', category: 'Diagonal', boxes: [[0,0,1,1],[0,0,1,1]], shapes: { 0: [0,0,.97,0,0,.97], 1: [1,.03,1,1,.03,1] } },
  { id: 'slanted-halves', name: 'Slanted halves', category: 'Diagonal', boxes: [[0,0,1,.62],[0,.38,1,.62]], shapes: { 0: [0,0,1,0,1,.6,0,1], 1: [0,.4,1,0,1,1,0,1] } },
  { id: 'action-wedges', name: 'Action wedges', category: 'Diagonal', boxes: [[0,0,.59,1],[.41,0,.59,1]], shapes: { 0: [0,0,1,0,.65,1,0,1], 1: [.35,0,1,0,1,1,0,1] } },
  { id: 'diagonal-four', name: 'Slanted quartet', category: 'Diagonal', boxes: rows([2,2]), shapes: { 0:[0,0,1,0,.85,1,0,.8],1:[0,0,1,0,1,.8,.15,1],2:[0,.2,.85,0,1,1,0,1],3:[.15,0,1,.2,1,1,0,1] } },
  { id: 'diamond', name: 'Diamond spotlight', category: 'Diagonal', boxes: [[0,0,1,1]], shapes: {0:[.5,0,1,.5,.5,1,0,.5]} },
  { id: 'impact-inset', name: 'Impact inset', category: 'Diagonal', boxes: [[0,0,1,1],[.25,.25,.5,.5]], shapes: {1:[.5,0,1,.5,.5,1,0,.5]} },
];
export const MANGA_TEMPLATE_CATEGORIES = [...new Set(MANGA_TEMPLATES.map(item => item.category))];
