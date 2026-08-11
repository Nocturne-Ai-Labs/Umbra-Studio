#!/usr/bin/env bun

import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyDanbooruTag } from '../shared/danbooru/tagClassifiers.ts';
import { parseCsvRows } from './lib/danbooru-localization.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const defaultFiles = [
  path.join(repoRoot, 'defaults', 'PowerPrompter', 'CSV', 'tags', 'UmbraDanbooruTagsv1.csv'),
  path.join(repoRoot, 'User', 'PowerPrompter', 'CSV', 'tags', 'UmbraDanbooruTagsv1.csv'),
];

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function enrichFile(filePath) {
  const rows = parseCsvRows(await readFile(filePath, 'utf8'));
  const headers = rows.shift();
  if (!headers?.length) throw new Error(`${filePath} is empty.`);

  const normalizedHeaders = headers.map((value) => String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_'));
  const tagIndex = normalizedHeaders.indexOf('tag');
  const categoryIndex = normalizedHeaders.indexOf('category');
  const postCountIndex = normalizedHeaders.indexOf('post_count');
  if (tagIndex < 0 || categoryIndex < 0 || postCountIndex < 0) {
    throw new Error(`${filePath} must contain tag, category, and post_count columns.`);
  }

  let classifierIndex = normalizedHeaders.indexOf('classifiers');
  const insertedClassifierColumn = classifierIndex < 0;
  if (classifierIndex < 0) {
    classifierIndex = postCountIndex + 1;
    headers.splice(classifierIndex, 0, 'classifiers');
  } else {
    headers[classifierIndex] = 'classifiers';
  }

  const counts = new Map();
  let classifiedRows = 0;
  for (const row of rows) {
    if (insertedClassifierColumn) row.splice(classifierIndex, 0, '');
    while (row.length < headers.length) row.push('');
    const classifiers = classifyDanbooruTag(row[tagIndex], Number(row[categoryIndex] || 0));
    row[classifierIndex] = classifiers.join('|');
    if (classifiers.length > 0) classifiedRows += 1;
    for (const classifier of classifiers) counts.set(classifier, (counts.get(classifier) || 0) + 1);
  }

  const output = `${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
  const temporaryPath = `${filePath}.classifiers.tmp`;
  await writeFile(temporaryPath, output, 'utf8');
  await rename(temporaryPath, filePath);
  return { filePath, rows: rows.length, classifiedRows, counts };
}

const requestedFiles = process.argv.slice(2).filter((value) => !value.startsWith('-'));
const files = requestedFiles.length > 0 ? requestedFiles.map((value) => path.resolve(value)) : defaultFiles;
for (const filePath of files) {
  const result = await enrichFile(filePath);
  const summary = [...result.counts.entries()].map(([id, count]) => `${id}=${count}`).join(', ');
  console.log(`${path.relative(repoRoot, result.filePath)}: ${result.classifiedRows.toLocaleString()} / ${result.rows.toLocaleString()} classified`);
  console.log(`  ${summary}`);
}
