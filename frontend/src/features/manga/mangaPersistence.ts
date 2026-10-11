import { parseMangaProject, type MangaProject } from './mangaModel';
import type { MangaSavedTarget } from './mangaUserFiles';

let database: Promise<IDBDatabase> | null = null;
function openDatabase(): Promise<IDBDatabase> {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('umbra-manga-private-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('projects');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = null; reject(request.error || new Error('Manga draft storage unavailable.')); };
    request.onblocked = () => reject(new Error('Close another Manga Studio tab to upgrade draft storage.'));
  });
  return database;
}
export async function loadMangaDraft(): Promise<MangaProject | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('projects').objectStore('projects').get('current');
    request.onsuccess = () => { try { resolve(request.result ? parseMangaProject(request.result) : null); } catch (error) { reject(error); } };
    request.onerror = () => reject(request.error);
  });
}
export async function saveMangaDraft(project: MangaProject): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('projects', 'readwrite');
    transaction.objectStore('projects').put(project, 'current');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Manga draft could not be saved.'));
    transaction.onabort = () => reject(transaction.error || new Error('Manga draft save was interrupted.'));
  });
}

export async function loadMangaSavedTarget(projectId: string): Promise<MangaSavedTarget | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('projects').objectStore('projects').get(`target:${projectId}`);
    request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error);
  });
}
export async function rememberMangaSavedTarget(target: MangaSavedTarget): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('projects', 'readwrite'); transaction.objectStore('projects').put(target, `target:${target.projectId}`);
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
  });
}

export async function clearMangaSavedTarget(projectId: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('projects', 'readwrite'); transaction.objectStore('projects').delete(`target:${projectId}`);
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
  });
}
