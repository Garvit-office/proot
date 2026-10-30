// Regenerates every logo/icon file in the repo from src/brand.ts.
// Run with `npm run brand:export` from the repo root after changing the artwork.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { brandColors, markSvg, wordmarkSvg } from "../dist/brand.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const out = (path) => resolve(root, path);

async function write(path, data) {
  await mkdir(dirname(out(path)), { recursive: true });
  await writeFile(out(path), data);
  console.log("wrote", path);
}

function png(svg, size) {
  return sharp(Buffer.from(svg), { density: 600 }).resize(size, size, { fit: "contain", background: "#0000" }).png();
}

// Bare face, centered on a transparent square canvas at `scale` of its width.
async function paddedFace(size, scale, svg = markSvg({ tile: false })) {
  const inner = Math.round(size * scale);
  const face = await png(svg, inner).toBuffer();
  const pad = Math.floor((size - inner) / 2);
  return sharp({ create: { width: size, height: size, channels: 4, background: "#0000" } })
    .composite([{ input: face, left: pad, top: pad }])
    .png()
    .toBuffer();
}

const tile = markSvg();
const monochrome = markSvg({ tile: false }).replaceAll(brandColors.cream, "#FFFFFF");

// Source SVGs for designers / docs.
await write("packages/shared/brand/proot-wordmark.svg", wordmarkSvg("light"));
await write("packages/shared/brand/proot-wordmark-dark.svg", wordmarkSvg("dark"));
await write("packages/shared/brand/proot-mark.svg", tile);

// Next.js file-based favicons.
for (const app of ["webuser", "webadmin"]) {
  await write(`apps/${app}/app/icon.svg`, tile);
  await write(`apps/${app}/app/apple-icon.png`, await png(tile, 180).toBuffer());
}

// Expo assets (paths referenced from apps/mobile/app.json).
const img = "apps/mobile/assets/images";
await write(`${img}/icon.png`, await png(tile, 1024).toBuffer());
await write(`${img}/favicon.png`, await png(tile, 48).toBuffer());
await write(`${img}/splash-icon.png`, await paddedFace(1024, 0.8));
await write(`${img}/android-icon-foreground.png`, await paddedFace(512, 0.56));
await write(`${img}/android-icon-monochrome.png`, await paddedFace(432, 0.56, monochrome));
await write(
  `${img}/android-icon-background.png`,
  await sharp({ create: { width: 512, height: 512, channels: 4, background: brandColors.teal } }).png().toBuffer(),
);
