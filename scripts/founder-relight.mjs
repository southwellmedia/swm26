/* eslint-disable no-console -- a CLI, its output is the point */
/**
 * Founder relight prep
 *
 * FounderRelight (the depth-relit portrait on the homepage) draws from two
 * textures prepared here from the one portrait and its depth map:
 *
 *   MichaelFroseth-relight.webp        the photograph, 1024 wide
 *   MichaelFroseth-relight-depth.webp  depth, 0 far .. 255 near, lossless
 *
 * The depth map (MichaelFroseth-depth-full.png, made from the same frame as
 * MichaelFrosethColored-2.jpg, white = near, black = backdrop) is smoothed a
 * touch in float before it is quantised, so the normals the shader derives
 * from it do not carry the staircase of the 8-bit source. Depth stays
 * lossless: a lossy encode blocks the smooth gradients and the blocks show
 * up as cells under a raking light.
 *
 * Run it again if the portrait or the depth map changes:
 *   node scripts/founder-relight.mjs
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { statSync } from 'node:fs';

const DIR = fileURLToPath(new URL('../src/assets/authors/', import.meta.url));
const PHOTO = `${DIR}MichaelFrosethColored-2.jpg`;
const DEPTH = `${DIR}MichaelFroseth-depth-full.png`;
const W = 1024;

const photo = sharp(PHOTO).resize({ width: W });
const { height: H } = await photo
  .clone()
  .toBuffer({ resolveWithObject: true })
  .then((r) => r.info);

await photo.clone().webp({ quality: 84 }).toFile(`${DIR}MichaelFroseth-relight.webp`);

// Depth: the map's frame differs from the photograph's by a fraction of a
// percent, so it is resized to the photograph's exact frame. A light blur
// before the resize takes the 8-bit staircase out of the smooth areas.
const depth = sharp(DEPTH)
  .removeAlpha()
  .toColourspace('b-w')
  .blur(1.2)
  .resize({ width: W, height: H, fit: 'fill' });
await depth.clone().webp({ lossless: true }).toFile(`${DIR}MichaelFroseth-relight-depth.webp`);

const kB = (file) => `${(statSync(`${DIR}${file}`).size / 1024).toFixed(0)} kB`;
console.log(
  `photo ${W}x${H} ${kB('MichaelFroseth-relight.webp')} · depth ${kB('MichaelFroseth-relight-depth.webp')}`
);
