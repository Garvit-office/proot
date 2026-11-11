function assertImage(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
}

function context(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser can’t process images.');
  return ctx;
}

/** Center-crop to a square and downscale, so profile photos stay well under the API's size limit. */
export async function fileToAvatarDataUrl(file: File, size = 640): Promise<string> {
  assertImage(file);
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(size, side);
  context(canvas).drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}

/**
 * Downscale keeping the aspect ratio so the longest side is at most `maxSide`, as JPEG.
 * Used for listing, service, and meal photos.
 */
export async function fileToImageDataUrl(file: File, maxSide = 1280, quality = 0.82): Promise<string> {
  assertImage(file);
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = context(canvas);
  // JPEG has no alpha: paint white under transparent PNGs.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', quality);
}
