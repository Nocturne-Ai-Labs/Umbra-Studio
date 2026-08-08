import { existsSync, statSync } from 'fs';
import * as fs from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';
import {
  applyUmbraUiWatermark,
  convertUmbraUiVideoToGif,
} from '../backend/UmbraUiMediaToolsService';
import { resolveUmbraExtendedVideoFfmpeg } from '../backend/UmbraUiExtendedVideoService';

const root = join(process.cwd(), 'User', 'Temp', 'UmbraUiMediaToolsQualification');
const comfyRoot = join(process.cwd(), 'Tools', 'ComfyUI');

async function run(command: string, args: string[]): Promise<void> {
  const process = Bun.spawn([command, ...args], { cwd: root, stdout: 'ignore', stderr: 'pipe' });
  const errorText = await new Response(process.stderr).text();
  const code = await process.exited;
  if (code !== 0) throw new Error(errorText || `${command} exited with code ${code}.`);
}

async function main(): Promise<void> {
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(root, { recursive: true });
  const sourceImage = join(root, 'source.png');
  const watermark = join(root, 'watermark.png');
  const imageOutput = join(root, 'watermarked.jpg');
  const videoSource = join(root, 'source.mp4');
  const videoOutput = join(root, 'watermarked.mp4');
  const gifOutput = join(root, 'converted.gif');

  await sharp({
    create: { width: 640, height: 360, channels: 3, background: '#17394f' },
  }).png().toFile(sourceImage);
  await sharp(Buffer.from(
    '<svg width="240" height="80" xmlns="http://www.w3.org/2000/svg">'
      + '<rect width="240" height="80" rx="10" fill="#0b0d10" fill-opacity="0.75"/>'
      + '<text x="120" y="51" text-anchor="middle" font-family="Arial" font-size="32" font-weight="700" fill="#67e8f9">UMBRA</text>'
      + '</svg>',
  )).png().toFile(watermark);

  await applyUmbraUiWatermark({
    comfyRoot,
    sourcePath: sourceImage,
    watermarkPath: watermark,
    outputPath: imageOutput,
    workDirectory: root,
    placement: { x: 1, y: 1, scale: 0.25, opacity: 0.72 },
    exportSettings: { resizeEnabled: true, longEdge: 1024, format: 'jpeg', quality: 90 },
  });
  const imageMetadata = await sharp(imageOutput).metadata();
  if (imageMetadata.width !== 1024 || imageMetadata.height !== 576 || imageMetadata.format !== 'jpeg') {
    throw new Error(`Unexpected watermarked image dimensions: ${imageMetadata.width}x${imageMetadata.height}`);
  }

  const ffmpeg = resolveUmbraExtendedVideoFfmpeg(comfyRoot);
  await run(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24:duration=2',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', videoSource,
  ]);
  await applyUmbraUiWatermark({
    comfyRoot,
    sourcePath: videoSource,
    watermarkPath: watermark,
    outputPath: videoOutput,
    workDirectory: root,
    placement: { x: 0, y: 0, scale: 0.22, opacity: 0.8 },
    exportSettings: { resizeEnabled: false, longEdge: 1024, format: 'png', quality: 90 },
    outputWidth: 480,
  });
  await convertUmbraUiVideoToGif({
    comfyRoot,
    sourcePath: videoOutput,
    outputPath: gifOutput,
    workDirectory: root,
    width: 480,
  });

  const gifHeader = (await fs.readFile(gifOutput)).subarray(0, 6).toString('ascii');
  if (!/^GIF8[79]a$/.test(gifHeader)) throw new Error(`Unexpected GIF header: ${gifHeader}`);
  for (const output of [imageOutput, videoOutput, gifOutput]) {
    if (!existsSync(output) || statSync(output).size <= 0) throw new Error(`Missing output: ${output}`);
  }
  console.log(JSON.stringify({
    imageBytes: statSync(imageOutput).size,
    videoBytes: statSync(videoOutput).size,
    gifBytes: statSync(gifOutput).size,
    gifHeader,
  }, null, 2));
}

await main();
