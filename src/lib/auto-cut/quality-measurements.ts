import type { QualityMeasurements } from './quality';

export const qualityFrameSize = 72;
const size = qualityFrameSize;

export function measureQualityFrame(pixels: Uint8Array, timeMs: number, next?: Uint8Array): QualityMeasurements['frames'][number] {
  let total = 0, shadows = 0, highlights = 0, edges = 0;
  for (const value of pixels) {
    total += value;
    if (value <= 22) shadows++;
    if (value >= 235) highlights++;
  }
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
    const i = y * size + x;
    edges += Math.abs(4 * pixels[i] - pixels[i - 1] - pixels[i + 1] - pixels[i - size] - pixels[i + size]);
  }
  const edgeDetail = Math.min(255, edges / (size - 2) ** 2);
  let shift: number | undefined, motionX: number | undefined, motionY: number | undefined;
  if (next && edgeDetail >= 3) {
    let best = Infinity, zero = Infinity, displacement = 0, bestX = 0, bestY = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      let difference = 0;
      for (let y = 5; y < size - 5; y += 2) for (let x = 5; x < size - 5; x += 2) {
        difference += Math.abs(pixels[y * size + x] - next[(y + dy) * size + x + dx]);
      }
      if (dx === 0 && dy === 0) zero = difference;
      const shift = Math.hypot(dx, dy);
      if (difference < best || (difference === best && shift < displacement)) { best = difference; displacement = shift; bestX = dx; bestY = dy; }
    }
    // Avoid judging a cut or a moving subject as camera shake without a coherent global match.
    if (zero < 5000) shift = 0;
    else if (best < zero * 0.7 && best < 9000) { shift = displacement; motionX = bestX; motionY = bestY; }
  }
  return { timeMs, edgeDetail, luminance: total / pixels.length, shadows: shadows / pixels.length,
    highlights: highlights / pixels.length, ...(shift === undefined ? {} : { shift }),
    ...(motionX === undefined || motionY === undefined ? {} : { motionX, motionY }) };
}

export function reduceFingerprintFrame(frame: Uint8Array) {
  const result = Buffer.alloc(24 * 24);
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    let total = 0;
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) total += frame[(y * 3 + dy) * size + x * 3 + dx];
    result[y * 24 + x] = Math.round(total / 9);
  }
  return result;
}
