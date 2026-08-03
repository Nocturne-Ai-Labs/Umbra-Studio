export function applyUmbraCanvasSlidingExtrema(
  source: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
  radius: number,
  maximum: boolean,
): Uint8ClampedArray<ArrayBuffer> {
  if (radius <= 0) return source;
  const horizontal = new Uint8ClampedArray(source.length);
  const output = new Uint8ClampedArray(source.length);
  const compare = maximum
    ? (left: number, right: number) => left <= right
    : (left: number, right: number) => left >= right;
  const runLine = (
    length: number,
    read: (index: number) => number,
    write: (index: number, value: number) => void,
  ) => {
    const windowSize = radius * 2 + 1;
    const extendedLength = length + radius * 2;
    const dequeIndices = new Int32Array(extendedLength);
    const dequeValues = new Uint8ClampedArray(extendedLength);
    let head = 0;
    let tail = 0;
    for (let extendedIndex = 0; extendedIndex < extendedLength; extendedIndex += 1) {
      const sourceIndex = extendedIndex - radius;
      const value = sourceIndex >= 0 && sourceIndex < length ? read(sourceIndex) : 0;
      while (head < tail && dequeIndices[head] <= extendedIndex - windowSize) head += 1;
      while (head < tail && compare(dequeValues[tail - 1], value)) tail -= 1;
      dequeIndices[tail] = extendedIndex;
      dequeValues[tail] = value;
      tail += 1;
      if (extendedIndex >= windowSize - 1) write(extendedIndex - (windowSize - 1), dequeValues[head]);
    }
  };

  for (let y = 0; y < height; y += 1) {
    runLine(width, (x) => source[y * width + x], (x, value) => { horizontal[y * width + x] = value; });
  }
  for (let x = 0; x < width; x += 1) {
    runLine(height, (y) => horizontal[y * width + x], (y, value) => { output[y * width + x] = value; });
  }
  return output;
}
