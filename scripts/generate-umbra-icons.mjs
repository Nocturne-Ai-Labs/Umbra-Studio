import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const assetsDir = path.join(root, 'frontend', 'public', 'assets');
const sourcePath = path.join(assetsDir, 'UMBRA.png');
const iconSourcePath = path.join(assetsDir, 'UMBRA-icon.png');
const icoPath = path.join(assetsDir, 'UMBRA.ico');
const iconSizes = [16, 24, 32, 48, 64, 128, 256];

function writeIco(pngEntries, outputPath) {
  const headerSize = 6;
  const directorySize = pngEntries.length * 16;
  let imageOffset = headerSize + directorySize;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngEntries.length, 4);

  const directory = Buffer.alloc(directorySize);
  for (let i = 0; i < pngEntries.length; i += 1) {
    const entry = pngEntries[i];
    const offset = i * 16;
    directory[offset] = entry.size >= 256 ? 0 : entry.size;
    directory[offset + 1] = entry.size >= 256 ? 0 : entry.size;
    directory[offset + 2] = 0;
    directory[offset + 3] = 0;
    directory.writeUInt16LE(1, offset + 4);
    directory.writeUInt16LE(32, offset + 6);
    directory.writeUInt32LE(entry.buffer.length, offset + 8);
    directory.writeUInt32LE(imageOffset, offset + 12);
    imageOffset += entry.buffer.length;
  }

  fs.writeFileSync(outputPath, Buffer.concat([header, directory, ...pngEntries.map((entry) => entry.buffer)]));
}

async function detectRedLogoBounds() {
  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const index = (y * info.width + x) * 4;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const alpha = data[index + 3];
      if (alpha > 20 && red > 90 && red > green * 1.25 && red > blue * 1.25) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX <= minX || maxY <= minY) {
    throw new Error('[umbra-icons] Could not detect red logo bounds in UMBRA.png');
  }

  return { minX, minY, maxX, maxY };
}

function squareCropFromBounds(bounds, imageSize) {
  const width = bounds.maxX - bounds.minX + 1;
  const height = bounds.maxY - bounds.minY + 1;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const size = Math.min(imageSize, Math.ceil(Math.max(width, height) * 1.18));
  const left = Math.max(0, Math.min(imageSize - size, Math.round(centerX - size / 2)));
  const top = Math.max(0, Math.min(imageSize - size, Math.round(centerY - size / 2)));
  return { left, top, width: size, height: size };
}

const metadata = await sharp(sourcePath).metadata();
if (metadata.width !== metadata.height) {
  throw new Error('[umbra-icons] UMBRA.png must be square to generate the app icon.');
}

const bounds = await detectRedLogoBounds();
const crop = squareCropFromBounds(bounds, metadata.width);

await sharp(sourcePath)
  .extract(crop)
  .resize(1024, 1024, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
  .png({ compressionLevel: 9 })
  .toFile(iconSourcePath);

const pngEntries = [];
for (const size of iconSizes) {
  const buffer = await sharp(iconSourcePath)
    .resize(size, size, { fit: 'contain', kernel: sharp.kernel.lanczos3 })
    .sharpen(size <= 32 ? { sigma: 0.7, m1: 1.2, m2: 2 } : { sigma: 0.4 })
    .png({ compressionLevel: 9 })
    .toBuffer();
  pngEntries.push({ size, buffer });
}

writeIco(pngEntries, icoPath);

console.log(`[umbra-icons] Wrote ${path.relative(root, iconSourcePath)}`);
console.log(`[umbra-icons] Wrote ${path.relative(root, icoPath)}`);
