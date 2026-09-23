import * as fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { booruSourceSidecar } from './BooruDownloadService';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.avif']);

type MoveEntry = { source: string; destination: string; keepSource: boolean };

async function regularFile(path: string): Promise<boolean> {
  const stat = await fs.lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (stat && !stat.isFile()) throw new Error(`Dataset entry is not a regular file: ${basename(path)}`);
  return Boolean(stat);
}

export async function moveDatasetImages(fromPath: string, toPath: string, filenames: unknown): Promise<number> {
  if (!Array.isArray(filenames) || !filenames.length || filenames.some(name => typeof name !== 'string')) {
    throw new Error('Select images to move.');
  }
  if (resolve(fromPath).toLowerCase() === resolve(toPath).toLowerCase()) {
    throw new Error('Select a different destination concept.');
  }
  const names = filenames as string[];
  const selected = new Set(names);
  if (selected.size !== names.length || names.some(name =>
    !name || name !== basename(name) || /[\\/:*?"<>|\x00-\x1f]/.test(name) || !IMAGE_EXTENSIONS.has(extname(name).toLowerCase())
  )) throw new Error('Invalid or duplicate dataset image name.');

  const allSourceNames = await fs.readdir(fromPath);
  const allDestinationNames = await fs.readdir(toPath);
  const entries: MoveEntry[] = [];
  const planned = new Set<string>();
  const add = async (name: string, keepSource = false) => {
    if (planned.has(name)) return;
    const source = join(fromPath, name);
    const destination = join(toPath, name);
    if (!await regularFile(source)) return;
    if (await regularFile(destination)) throw new Error(`Destination already contains ${name}.`);
    planned.add(name);
    entries.push({ source, destination, keepSource });
  };

  for (const name of names) {
    if (!await regularFile(join(fromPath, name))) throw new Error(`Source image is missing: ${name}.`);
    const base = name.slice(0, -extname(name).length);
    if (allDestinationNames.some(other => IMAGE_EXTENSIONS.has(extname(other).toLowerCase())
      && other.slice(0, -extname(other).length).toLowerCase() === base.toLowerCase())) {
      throw new Error(`Destination already contains an image named ${base}.`);
    }
    const associatedNames = new Set([
      `${base}.txt`, `${base}.json`, `${name}.txt`, `${name}.json`, booruSourceSidecar(name),
    ].map(other => other.toLowerCase()));
    if (allDestinationNames.some(other => associatedNames.has(other.toLowerCase()))) {
      throw new Error(`Destination already contains data associated with ${name}.`);
    }
    const hasRemainingSibling = allSourceNames.some(other =>
      !selected.has(other) && other.slice(0, -extname(other).length).toLowerCase() === base.toLowerCase()
        && IMAGE_EXTENSIONS.has(extname(other).toLowerCase())
    );
    await add(name);
    await add(`${base}.txt`, hasRemainingSibling);
    await add(`${name}.txt`);
    await add(`${base}.json`, hasRemainingSibling);
    await add(`${name}.json`);
    await add(booruSourceSidecar(name));
  }

  const created: MoveEntry[] = [];
  const removed: MoveEntry[] = [];
  try {
    for (const entry of entries) {
      try {
        await fs.link(entry.source, entry.destination);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (!['EPERM', 'EOPNOTSUPP', 'ENOTSUP', 'ENOSYS', 'EXDEV'].includes(code || '')) throw error;
        await fs.copyFile(entry.source, entry.destination, fsConstants.COPYFILE_EXCL);
      }
      created.push(entry);
    }
    for (const entry of entries) {
      if (entry.keepSource) continue;
      await fs.unlink(entry.source);
      removed.push(entry);
    }
  } catch (error) {
    let recovered = true;
    for (const entry of removed.reverse()) {
      try { await fs.link(entry.destination, entry.source); }
      catch {
        try { await fs.copyFile(entry.destination, entry.source, fsConstants.COPYFILE_EXCL); }
        catch { recovered = false; }
      }
    }
    if (recovered) {
      for (const entry of created.reverse()) await fs.unlink(entry.destination).catch(() => undefined);
    }
    if (!recovered) throw new Error('The move stopped during cleanup. Both concept folders may contain files; review them before retrying.');
    throw error;
  }
  return names.length;
}
