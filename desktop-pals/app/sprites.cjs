'use strict';

// Sprite packs contain data only: no scripts, URLs, HTML, or executable content.
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { randomUUID } = require('node:crypto');

const MAX_PNG_BYTES = 2 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_DIMENSION = 4096;
const MAX_PIXELS = 4096 * 4096;
const ANIMATIONS = ['idle', 'walk', 'sleep', 'play'];
const OPTIONAL_ANIMATIONS = ['eat', 'pet', 'happy', 'sad', 'surprised', 'angry'];
const ALLOWED_ANIMATIONS = [...ANIMATIONS, ...OPTIONAL_ANIMATIONS];
const PREFIX = 'data:image/png;base64,';
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let crc = n;
  for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function fail(message) { throw new Error(`Sprite pack: ${message}`); }

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngInfo(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_PNG_BYTES) fail('PNG must be no larger than 2 MiB.');
  if (buffer.length < 45 || !buffer.subarray(0, 8).equals(SIGNATURE)) fail('Image is not a PNG.');
  let offset = 8;
  let info;
  let hasPalette = false;
  let ended = false;
  let dataEnded = false;
  const compressed = [];
  while (offset < buffer.length) {
    if (buffer.length - offset < 12) fail('PNG contains a truncated chunk.');
    const length = buffer.readUInt32BE(offset);
    if (length > buffer.length - offset - 12) fail('PNG contains a truncated chunk.');
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) fail('PNG has an invalid chunk type.');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (crc32(buffer.subarray(offset + 4, offset + 8 + length)) !== buffer.readUInt32BE(offset + 8 + length)) {
      fail('PNG checksum failed. Please re-export the image.');
    }
    if (!info && type !== 'IHDR') fail('PNG is missing its header.');
    if (type === 'IHDR') {
      if (info || offset !== 8 || length !== 13) fail('PNG has an invalid header.');
      const width = data.readUInt32BE(0);
      const height = data.readUInt32BE(4);
      const depth = data[8];
      const color = data[9];
      const allowedDepths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) {
        fail('PNG dimensions must be between 1 and 4096 pixels per side.');
      }
      if (!allowedDepths[color]?.includes(depth) || data[10] !== 0 || data[11] !== 0 || data[12] > 1) {
        fail('PNG uses an unsupported format. Export a standard RGB or RGBA PNG.');
      }
      info = { width, height, depth, color, interlace: data[12] };
    } else if (type === 'PLTE') {
      if (hasPalette || compressed.length || !length || length > 768 || length % 3) fail('PNG has an invalid palette.');
      hasPalette = true;
    } else if (type === 'IDAT') {
      if (dataEnded || (info.color === 3 && !hasPalette)) fail('PNG has invalid image data ordering.');
      compressed.push(data);
    } else if (type === 'IEND') {
      if (length || !compressed.length || offset + 12 !== buffer.length) fail('PNG has an invalid end marker.');
      ended = true;
      break;
    } else {
      if (compressed.length) dataEnded = true;
      if (type[0] === type[0].toUpperCase()) fail(`PNG has an unsupported critical chunk (${type}).`);
      if (type === 'acTL') fail('Animated PNG is not supported. Use a sprite sheet and JSON instead.');
    }
    offset += length + 12;
  }
  if (!ended) fail('PNG is incomplete.');
  // Validate the actual compressed image, including Adam7 interlaced images.
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[info.color];
  const passes = info.interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  const rows = [];
  let expected = 0;
  for (const [x, y, dx, dy] of passes) {
    const width = Math.max(0, Math.ceil((info.width - x) / dx));
    const height = Math.max(0, Math.ceil((info.height - y) / dy));
    if (!width || !height) continue;
    const rowSize = Math.ceil(width * channels * info.depth / 8) + 1;
    rows.push({ rowSize, height });
    expected += rowSize * height;
  }
  let pixels;
  try { pixels = zlib.inflateSync(Buffer.concat(compressed), { maxOutputLength: expected }); }
  catch { fail('PNG image data is damaged. Please re-export the image.'); }
  if (pixels.length !== expected) fail('PNG image data has an incorrect size.');
  let cursor = 0;
  for (const { rowSize, height } of rows) {
    for (let row = 0; row < height; row++, cursor += rowSize) {
      if (pixels[cursor] > 4) fail('PNG contains an invalid scanline filter.');
    }
  }
  return { width: info.width, height: info.height };
}

function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) fail(`${label} must be a whole number from ${min} to ${max}.`);
  return value;
}

function normalize(sprite, buffer) {
  if (!sprite || typeof sprite !== 'object' || Array.isArray(sprite)) fail('Settings must be an object.');
  const { width, height } = pngInfo(buffer);
  const name = sprite.name;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 48 || /[\u0000-\u001f\u007f]/.test(name)) {
    fail('Name must contain 1–48 characters, without control characters.');
  }
  const fps = sprite.fps ?? 8;
  if (typeof fps !== 'number' || !Number.isFinite(fps) || fps < 1 || fps > 24) fail('FPS must be between 1 and 24.');
  const frameWidth = integer(sprite.frameWidth ?? width, 1, MAX_DIMENSION, 'Frame width');
  const frameHeight = integer(sprite.frameHeight ?? height, 1, MAX_DIMENSION, 'Frame height');
  if (width % frameWidth || height % frameHeight) fail('Frame size must divide the sprite sheet exactly.');
  const count = width / frameWidth * (height / frameHeight);
  if (count > 256) fail('A sprite sheet can contain at most 256 frames.');
  const input = sprite.animations ?? { idle: [0] };
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Animations must be an object.');
  if (Object.keys(input).some(key => !ALLOWED_ANIMATIONS.includes(key))) fail('Supported animations are idle, walk, sleep, play, eat, pet, happy, sad, surprised, and angry.');
  const animations = {};
  const idle = input.idle ?? [0];
  for (const key of [...ANIMATIONS, ...OPTIONAL_ANIMATIONS.filter(key => Object.hasOwn(input, key))]) {
    const frames = input[key] ?? idle;
    if (!Array.isArray(frames) || !frames.length || frames.length > 64) fail(`${key} must contain 1–64 frame numbers.`);
    animations[key] = frames.map(frame => integer(frame, 0, count - 1, `${key} frame`));
  }
  return { name: name.trim(), fps, frameWidth, frameHeight, animations, image: PREFIX + buffer.toString('base64') };
}

function validateSprite(sprite) {
  if (!sprite || typeof sprite.image !== 'string' || !sprite.image.startsWith(PREFIX)) fail('Image must be a PNG data URL.');
  const encoded = sprite.image.slice(PREFIX.length);
  if (!encoded || encoded.length > Math.ceil(MAX_PNG_BYTES / 3) * 4 || encoded.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    fail('PNG data URL is invalid or larger than 2 MiB.');
  }
  const buffer = Buffer.from(encoded, 'base64');
  if (buffer.toString('base64') !== encoded) fail('PNG data URL is invalid.');
  return normalize(sprite, buffer);
}

async function readLimited(filePath, maxSize) {
  const handle = await fs.open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxSize) fail(`File must be a regular file no larger than ${Math.round(maxSize / 1024)} KiB.`);
    const buffer = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > stat.size || length > maxSize) fail('File changed size while importing. Try again.');
    return buffer.subarray(0, length);
  } finally { await handle.close(); }
}

async function importSprite(filePath) {
  const chosen = path.resolve(filePath);
  const extension = path.extname(chosen).toLowerCase();
  if (extension === '.png') {
    const actual = await fs.realpath(chosen);
    const buffer = await readLimited(actual, MAX_PNG_BYTES);
    return normalize({ name: path.basename(chosen, path.extname(chosen)).slice(0, 48) || 'Custom pal' }, buffer);
  }
  if (extension !== '.json') fail('Choose a PNG image or a JSON sprite pack.');
  const manifest = await readLimited(await fs.realpath(chosen), MAX_MANIFEST_BYTES);
  let settings;
  try { settings = JSON.parse(manifest.toString('utf8').replace(/^\uFEFF/, '')); }
  catch { fail('Settings JSON is not valid. Check commas and quotation marks.'); }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) fail('Settings must be an object.');
  const imagePath = settings.image;
  if (typeof imagePath !== 'string' || !imagePath || imagePath.includes('\\') || imagePath.includes('\0') || path.posix.isAbsolute(imagePath) || /^[A-Za-z]:/.test(imagePath) || imagePath.split('/').some(part => !part || part === '.' || part === '..')) {
    fail('Image must be a relative path inside the sprite pack folder (for example, sheet.png).');
  }
  if (path.extname(imagePath).toLowerCase() !== '.png') fail('Sprite pack image must be a PNG.');
  const root = await fs.realpath(path.dirname(chosen));
  const imageFile = await fs.realpath(path.join(root, imagePath));
  const relative = path.relative(root, imageFile);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) fail('Image cannot point outside the sprite pack folder.');
  return normalize({ ...settings, name: settings.name ?? path.basename(chosen, path.extname(chosen)).slice(0, 48) }, await readLimited(imageFile, MAX_PNG_BYTES));
}

async function exportSprite(sprite, targetManifestPath) {
  const canonical = validateSprite(sprite);
  const target = path.resolve(targetManifestPath);
  if (path.extname(target).toLowerCase() !== '.json') fail('Save the sprite pack with a .json extension.');
  const directory = await fs.realpath(path.dirname(target));
  const manifestFile = path.join(directory, path.basename(target));
  const id = randomUUID();
  const imageName = `deskfur-${id}.png`;
  const imageFile = path.join(directory, imageName);
  const temporaryFile = path.join(directory, `.deskfur-${id}.tmp`);
  const { image, ...settings } = canonical;
  let createdImage = false;
  try {
    await fs.writeFile(imageFile, Buffer.from(image.slice(PREFIX.length), 'base64'), { flag: 'wx', mode: 0o600 });
    createdImage = true;
    await fs.writeFile(temporaryFile, JSON.stringify({ ...settings, image: imageName }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await fs.rename(temporaryFile, manifestFile);
    return manifestFile;
  } catch (error) {
    await fs.rm(temporaryFile, { force: true }).catch(() => {});
    if (createdImage) await fs.rm(imageFile, { force: true }).catch(() => {});
    throw error;
  }
}

module.exports = { importSprite, exportSprite, validateSprite };
