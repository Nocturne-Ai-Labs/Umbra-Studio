import { isMangaUserFont, mangaFont, mangaLettering, parseMangaProject, type MangaLayer, type MangaProject } from './mangaModel';

export interface MangaUserFont { id: string; filename: string; label: string; url: string }
export interface MangaSavedTarget { projectId: string; filename: string; etag: string }
export interface MangaSavedProject { filename: string; id: string; name: string; pages: number; etag: string }
const faces = new Map<string, FontFace>();
async function response<T>(request: Promise<Response>): Promise<T> {
  const result = await request, body = await result.json();
  if (!result.ok) throw new Error(body.error || `Manga storage request failed (${result.status}).`);
  return body as T;
}
export async function loadMangaUserFonts(): Promise<{ fonts: MangaUserFont[]; issues: string[] }> {
  await Promise.all(['"Umbra Comic Neue"', '"Umbra Bangers"'].map(font => document.fonts.load(`700 36px ${font}`)));
  const catalog = await response<{ fonts: MangaUserFont[]; issues: string[] }>(fetch('/api/manga/fonts'));
  const fonts: MangaUserFont[] = [], issues = [...catalog.issues];
  for (const font of catalog.fonts) {
    try {
      if (!faces.has(font.id)) {
        const file = await fetch(font.url); if (!file.ok) throw new Error('Font file could not be read.');
        const face = new FontFace(`UmbraManga_${font.id.slice(10)}`, await file.arrayBuffer());
        await face.load(); document.fonts.add(face); faces.set(font.id, face);
      }
      fonts.push(font);
    } catch { issues.push(`${font.filename}: this browser could not load the font.`); }
  }
  for (const [id, face] of faces) if (!fonts.some(font => font.id === id)) { document.fonts.delete(face); faces.delete(id); }
  return { fonts, issues };
}
export async function ensureMangaPageFonts(layers: MangaLayer[]): Promise<void> {
  const requests = new Set<string>();
  for (const layer of layers) {
    if (isMangaUserFont(layer.font) && !faces.has(layer.font)) throw new Error('A font used on this page is missing. Place it in User/Fonts and refresh fonts before exporting.');
    const style = mangaLettering(layer);
    requests.add(`${style.italic ? 'italic ' : ''}${style.weight} 36px ${mangaFont(layer.font)}`);
  }
  for (const request of requests) await document.fonts.load(request);
  await document.fonts.ready;
}
export function mangaProjectFontReferences(project: MangaProject, fonts: MangaUserFont[]): MangaProject {
  const used = new Set(project.pages.flatMap(page => page.layers.map(layer => layer.font)).filter(isMangaUserFont));
  const refs = new Map([...(project.fonts || []).map(font => [font.id, font.filename] as const), ...fonts.map(font => [font.id, font.filename] as const)]);
  return { ...project, fonts: [...used].map(id => ({ id, filename: refs.get(id) || 'Missing custom font' })) };
}
export async function listMangaSavedProjects() { return response<{ projects: MangaSavedProject[]; issues: string[] }>(fetch('/api/manga/projects')); }
export async function openMangaSavedProject(filename: string) {
  const result = await response<{ project: unknown; filename: string; etag: string }>(fetch(`/api/manga/projects/${encodeURIComponent(filename)}`));
  const project = parseMangaProject(result.project);
  return { project, target: { projectId: project.id, filename: result.filename, etag: result.etag } };
}
export async function saveMangaUserProject(project: MangaProject, target: MangaSavedTarget | null) {
  const name = target?.projectId === project.id ? target.filename : `${project.id}.umbra-manga.json`;
  const result = await response<{ filename: string; etag: string }>(fetch(`/api/manga/projects/${encodeURIComponent(name)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project, expected: target?.projectId === project.id ? target.etag : null }) }));
  return { projectId: project.id, filename: result.filename, etag: result.etag };
}
