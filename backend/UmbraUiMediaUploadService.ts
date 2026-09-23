export async function writeAllUploadedMediaBytes(
  writer: { write(bytes: Uint8Array): Promise<{ bytesWritten: number }> },
  bytes: Uint8Array,
): Promise<number> {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const { bytesWritten } = await writer.write(bytes.subarray(offset));
    if (!Number.isInteger(bytesWritten) || bytesWritten <= 0 || bytesWritten > bytes.byteLength - offset) {
      throw new Error('Media upload file write did not complete.');
    }
    offset += bytesWritten;
  }
  return offset;
}
