import { createReadStream, createWriteStream } from 'fs';
import * as fs from 'fs/promises';
import { basename, dirname, extname, join } from 'path';
import { randomBytes } from 'crypto';
import { constants as zlibConstants, createDeflateRaw } from 'zlib';

type DatasetArchiveEntry = {
  fullPath: string;
  name: string;
  mtime: Date;
  size: number;
  directory: boolean;
};

export type DatasetArchiveResult = {
  archivePath: string;
  archiveBytes: number;
  sourceBytes: number;
  fileCount: number;
  directoryCount: number;
};

const ZIP32_MAX = 0xffffffff;
const ZIP32_MAX_ENTRIES = 0xffff;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_DATA_DESCRIPTOR_FLAG = 0x0008;
const ZIP_STORE_METHOD = 0;
const ZIP_DEFLATE_METHOD = 8;
const ALREADY_COMPRESSED_EXTENSIONS = new Set([
  '.7z', '.avif', '.bz2', '.gif', '.gz', '.jpeg', '.jpg', '.lz', '.lz4', '.mp4',
  '.png', '.rar', '.webm', '.webp', '.xz', '.zip', '.zst',
]);

const ZIP_CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function updateCrc32(crc: number, chunk: Uint8Array): number {
  let next = crc >>> 0;
  for (const byte of chunk) {
    next = ZIP_CRC32_TABLE[(next ^ byte) & 0xff] ^ (next >>> 8);
  }
  return next >>> 0;
}

function u16(value: number): Buffer {
  const buffer = Buffer.allocUnsafe(2);
  buffer.writeUInt16LE(value & 0xffff, 0);
  return buffer;
}

function u32(value: number): Buffer {
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeUInt32LE(value >>> 0, 0);
  return buffer;
}

function dosDateTime(dateValue: Date): { date: number; time: number } {
  const year = Math.max(1980, Math.min(2107, dateValue.getFullYear()));
  const month = Math.max(1, Math.min(12, dateValue.getMonth() + 1));
  const day = Math.max(1, Math.min(31, dateValue.getDate()));
  const hours = Math.max(0, Math.min(23, dateValue.getHours()));
  const minutes = Math.max(0, Math.min(59, dateValue.getMinutes()));
  const seconds = Math.max(0, Math.min(59, Math.floor(dateValue.getSeconds() / 2)));
  return {
    date: ((year - 1980) << 9) | (month << 5) | day,
    time: (hours << 11) | (minutes << 5) | seconds,
  };
}

function safeZipEntryName(value: string, directory: boolean): string {
  const segments = String(value || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      if (segment === '.' || segment === '..') throw new Error('Unsafe dataset archive path');
      return segment.replace(/[\u0000-\u001f]/g, '_');
    });
  if (segments.length === 0) throw new Error('Dataset archive entry has no name');
  const normalized = segments.join('/');
  return directory ? `${normalized}/` : normalized;
}

function shouldStoreWithoutDeflate(entry: DatasetArchiveEntry): boolean {
  return ALREADY_COMPRESSED_EXTENSIONS.has(extname(entry.name).toLowerCase());
}

function writeChunk(stream: ReturnType<typeof createWriteStream>, chunk: Uint8Array | Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(chunk, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function finishStream(stream: ReturnType<typeof createWriteStream>): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.once('error', reject);
    stream.end(resolve);
  });
}

async function collectDatasetEntries(datasetPath: string, datasetName: string): Promise<DatasetArchiveEntry[]> {
  const datasetStat = await fs.stat(datasetPath);
  const entries: DatasetArchiveEntry[] = [{
    fullPath: datasetPath,
    name: safeZipEntryName(datasetName, true),
    mtime: datasetStat.mtime,
    size: 0,
    directory: true,
  }];

  const walk = async (folderPath: string, relativeFolder: string) => {
    const children = await fs.readdir(folderPath, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }));
    for (const child of children) {
      if (child.isSymbolicLink()) continue;
      const fullPath = join(folderPath, child.name);
      const relativeName = relativeFolder ? `${relativeFolder}/${child.name}` : child.name;
      if (child.isDirectory()) {
        const stat = await fs.stat(fullPath);
        entries.push({
          fullPath,
          name: safeZipEntryName(`${datasetName}/${relativeName}`, true),
          mtime: stat.mtime,
          size: 0,
          directory: true,
        });
        await walk(fullPath, relativeName);
        continue;
      }
      if (!child.isFile()) continue;
      const stat = await fs.stat(fullPath);
      if (stat.size > ZIP32_MAX) {
        throw new Error(`Dataset file exceeds the portable ZIP limit: ${relativeName}`);
      }
      entries.push({
        fullPath,
        name: safeZipEntryName(`${datasetName}/${relativeName}`, false),
        mtime: stat.mtime,
        size: stat.size,
        directory: false,
      });
    }
  };

  await walk(datasetPath, '');
  if (entries.length > ZIP32_MAX_ENTRIES) {
    throw new Error(`Dataset has too many files for a portable ZIP (${entries.length.toLocaleString()}).`);
  }
  return entries;
}

async function writeDatasetZip(entries: DatasetArchiveEntry[], zipPath: string): Promise<{ size: number; sourceBytes: number }> {
  const stream = createWriteStream(zipPath);
  const centralDirectory: Buffer[] = [];
  let offset = 0;
  let sourceBytes = 0;

  const ensureZip32Offset = () => {
    if (offset > ZIP32_MAX) throw new Error('Compressed dataset exceeds the 4 GB portable ZIP limit.');
  };

  try {
    for (const entry of entries) {
      const nameBuffer = Buffer.from(entry.name, 'utf8');
      const { date, time } = dosDateTime(entry.mtime);
      const entryOffset = offset;
      const method = entry.directory || shouldStoreWithoutDeflate(entry) ? ZIP_STORE_METHOD : ZIP_DEFLATE_METHOD;
      const flags = ZIP_UTF8_FLAG | (entry.directory ? 0 : ZIP_DATA_DESCRIPTOR_FLAG);
      const localHeader = Buffer.concat([
        u32(0x04034b50),
        u16(20),
        u16(flags),
        u16(method),
        u16(time),
        u16(date),
        u32(0),
        u32(0),
        u32(0),
        u16(nameBuffer.length),
        u16(0),
        nameBuffer,
      ]);
      await writeChunk(stream, localHeader);
      offset += localHeader.length;
      ensureZip32Offset();

      let crc = 0xffffffff;
      let uncompressedSize = 0;
      let compressedSize = 0;

      if (!entry.directory) {
        sourceBytes += entry.size;
        if (method === ZIP_STORE_METHOD) {
          for await (const chunk of createReadStream(entry.fullPath)) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            crc = updateCrc32(crc, buffer);
            uncompressedSize += buffer.length;
            compressedSize += buffer.length;
            await writeChunk(stream, buffer);
            offset += buffer.length;
            ensureZip32Offset();
          }
        } else {
          const input = createReadStream(entry.fullPath);
          const deflater = createDeflateRaw({
            level: zlibConstants.Z_BEST_COMPRESSION,
            memLevel: 9,
          });
          input.on('data', (chunk: Buffer) => {
            crc = updateCrc32(crc, chunk);
            uncompressedSize += chunk.length;
          });
          input.on('error', (error) => deflater.destroy(error));
          input.pipe(deflater);
          for await (const chunk of deflater) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            compressedSize += buffer.length;
            await writeChunk(stream, buffer);
            offset += buffer.length;
            ensureZip32Offset();
          }
        }
        crc = (crc ^ 0xffffffff) >>> 0;
        if (uncompressedSize > ZIP32_MAX || compressedSize > ZIP32_MAX) {
          throw new Error(`Dataset file exceeds the portable ZIP limit: ${entry.name}`);
        }
        const descriptor = Buffer.concat([
          u32(0x08074b50),
          u32(crc),
          u32(compressedSize),
          u32(uncompressedSize),
        ]);
        await writeChunk(stream, descriptor);
        offset += descriptor.length;
        ensureZip32Offset();
      } else {
        crc = 0;
      }

      centralDirectory.push(Buffer.concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(flags),
        u16(method),
        u16(time),
        u16(date),
        u32(crc),
        u32(compressedSize),
        u32(uncompressedSize),
        u16(nameBuffer.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(entry.directory ? 0x10 : 0),
        u32(entryOffset),
        nameBuffer,
      ]));
    }

    const centralOffset = offset;
    for (const entry of centralDirectory) {
      await writeChunk(stream, entry);
      offset += entry.length;
      ensureZip32Offset();
    }
    const centralSize = offset - centralOffset;
    const endRecord = Buffer.concat([
      u32(0x06054b50),
      u16(0),
      u16(0),
      u16(centralDirectory.length),
      u16(centralDirectory.length),
      u32(centralSize),
      u32(centralOffset),
      u16(0),
    ]);
    await writeChunk(stream, endRecord);
    offset += endRecord.length;
    ensureZip32Offset();
    await finishStream(stream);
    return { size: offset, sourceBytes };
  } catch (error) {
    stream.destroy();
    await fs.rm(zipPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function createDatasetArchive(options: {
  datasetPath: string;
  datasetName: string;
  archivePath: string;
}): Promise<DatasetArchiveResult> {
  const entries = await collectDatasetEntries(options.datasetPath, options.datasetName);
  const temporaryPath = join(
    dirname(options.archivePath),
    `.${basename(options.archivePath)}.${randomBytes(5).toString('hex')}.partial`,
  );

  try {
    const result = await writeDatasetZip(entries, temporaryPath);
    await fs.rm(options.archivePath, { force: true });
    await fs.rename(temporaryPath, options.archivePath);
    return {
      archivePath: options.archivePath,
      archiveBytes: result.size,
      sourceBytes: result.sourceBytes,
      fileCount: entries.filter((entry) => !entry.directory).length,
      directoryCount: entries.filter((entry) => entry.directory).length,
    };
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
