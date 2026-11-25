import { MAX_FRAMES } from '@/schemas/investigation';

import type { Annotation } from '@/types';

const MAX_EDGE_PX = 768;
const JPEG_QUALITY = 0.6;

/** Picks up to `max` frames spread across the session (first, middle, last), skipping annotations without one. */
export function selectEvidenceFrames(annotations: Annotation[], max: number = MAX_FRAMES): string[] {
  const withFrames = annotations.filter((a) => a.capturedFrameUrl).map((a) => a.capturedFrameUrl as string);
  if (withFrames.length <= max) return withFrames;
  const picked = new Set<number>();
  for (let i = 0; i < max; i += 1) {
    picked.add(Math.round((i * (withFrames.length - 1)) / (max - 1)));
  }
  return [...picked].map((index) => withFrames[index]);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('frame could not be decoded'));
    image.src = src;
  });
}

/**
 * Downscales a frame to a small JPEG before it leaves the browser (cost, latency, less data shared).
 * Resolves to `null` if the frame cannot be processed; callers then simply omit it.
 */
export async function downscaleFrame(dataUrl: string): Promise<string | null> {
  try {
    const image = await loadImage(dataUrl);
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } catch (e) {
    console.error('Skipping evidence frame:', e);
    return null;
  }
}
