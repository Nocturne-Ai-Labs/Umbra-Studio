export class DatasetUploadTooLargeError extends Error {}

/** Bound multipart bytes before parsing; Content-Length alone is not trustworthy for chunked requests. */
export async function parseDatasetUploadFormData(request: Request, maxBytes: number) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
    throw new Error('Expected a multipart image upload.');
  }
  const contentLength = request.headers.get('content-length');
  if (contentLength && Number(contentLength) > maxBytes) throw new DatasetUploadTooLargeError('Upload is too large.');
  if (!request.body) throw new Error('Image upload is empty.');

  const chunks: Buffer[] = [];
  let total = 0;
  const reader = request.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new DatasetUploadTooLargeError('Upload is too large.');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return new Response(Buffer.concat(chunks, total), { headers: { 'Content-Type': contentType } }).formData();
}
