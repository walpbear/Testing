'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { importSprite, exportSprite, validateSprite } = require('../app/sprites.cjs');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const kind = Buffer.from(type);
  const header = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([kind, data])));
  return Buffer.concat([header, kind, data, checksum]);
}

function png(width = 32, height = 16, pixels = null) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const data = pixels ?? Buffer.alloc((width * 4 + 1) * height);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(data)), chunk('IEND', Buffer.alloc(0))]);
}

function dataURL(buffer) { return 'data:image/png;base64,' + buffer.toString('base64'); }
function profile(overrides = {}) {
  return { name: 'Mochi', fps: 8, frameWidth: 16, frameHeight: 16, animations: { idle: [0], walk: [0, 1] }, image: dataURL(png()), ...overrides };
}
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'deskfur-sprites-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

test('imports a plain PNG as one static frame and supplies all animations', async t => {
  const folder = await fixture(t);
  const file = path.join(folder, 'Mochi.png');
  await fs.writeFile(file, png());
  const sprite = await importSprite(file);
  assert.equal(sprite.name, 'Mochi');
  assert.equal(sprite.frameWidth, 32);
  assert.equal(sprite.frameHeight, 16);
  assert.deepEqual(sprite.animations, { idle: [0], walk: [0], sleep: [0], play: [0] });
});

test('imports a complete animated pack and inherits idle for omitted animations', async t => {
  const folder = await fixture(t);
  await fs.mkdir(path.join(folder, 'art'));
  await fs.writeFile(path.join(folder, 'art', 'sheet.png'), png());
  await fs.writeFile(path.join(folder, 'pal.json'), JSON.stringify({ name: '  Fluff  ', image: 'art/sheet.png', frameWidth: 16, frameHeight: 16, fps: 12, animations: { idle: [1, 0], walk: [0, 1] } }));
  const result = await importSprite(path.join(folder, 'pal.json'));
  assert.equal(result.name, 'Fluff');
  assert.equal(result.fps, 12);
  assert.deepEqual(result.animations.sleep, [1, 0]);
  result.animations.sleep.push(0);
  assert.deepEqual(result.animations.idle, [1, 0], 'fallback animations should be independent arrays');
});

test('accepts a real 4096 × 4096 static PNG', () => {
  const image = png(4096, 4096);
  const sprite = validateSprite({ name: '4K Fluff', image: dataURL(image) });
  assert.equal(sprite.frameWidth, 4096);
  assert.equal(sprite.frameHeight, 4096);
});

test('round-trips exported settings and uses fresh PNG names without overwriting unrelated files', async t => {
  const folder = await fixture(t);
  const target = path.join(folder, 'character.json');
  await fs.writeFile(path.join(folder, 'sheet.png'), 'Do not overwrite me');
  const expected = validateSprite(profile());
  assert.equal(await exportSprite(expected, target), target);
  const first = JSON.parse(await fs.readFile(target, 'utf8'));
  assert.match(first.image, /^deskfur-[0-9a-f-]+\.png$/);
  assert.deepEqual(await importSprite(target), expected);
  await exportSprite(expected, target);
  const second = JSON.parse(await fs.readFile(target, 'utf8'));
  assert.notEqual(first.image, second.image);
  assert.equal(await fs.readFile(path.join(folder, 'sheet.png'), 'utf8'), 'Do not overwrite me');
});

test('rejects traversal, absolute paths, Windows paths, and remote image URLs', async t => {
  const folder = await fixture(t);
  const target = path.join(folder, 'bad.json');
  for (const image of ['../outside.png', 'sub/../../outside.png', '/tmp/outside.png', 'C:/outside.png', 'C:\\outside.png', 'https://example.com/x.png', './sheet.png', 'sub//sheet.png']) {
    await fs.writeFile(target, JSON.stringify({ name: 'Nope', image }));
    await assert.rejects(importSprite(target), /relative path|PNG/);
  }
});

test('rejects symlinks that escape the pack folder', async t => {
  const folder = await fixture(t);
  const outside = await fixture(t);
  await fs.writeFile(path.join(outside, 'sheet.png'), png());
  await fs.symlink(path.join(outside, 'sheet.png'), path.join(folder, 'sheet.png'));
  await fs.writeFile(path.join(folder, 'bad.json'), JSON.stringify({ image: 'sheet.png', name: 'Nope' }));
  await assert.rejects(importSprite(path.join(folder, 'bad.json')), /outside the sprite pack/);
});

test('export replaces a manifest symlink rather than writing through it', async t => {
  const folder = await fixture(t);
  const outside = await fixture(t);
  const valuable = path.join(outside, 'keep.json');
  await fs.writeFile(valuable, 'Do not overwrite me');
  const manifest = path.join(folder, 'pet.json');
  await fs.symlink(valuable, manifest);
  await exportSprite(profile(), manifest);
  assert.equal(await fs.readFile(valuable, 'utf8'), 'Do not overwrite me');
  assert.equal((await fs.lstat(manifest)).isSymbolicLink(), false);
  assert.deepEqual(await importSprite(manifest), validateSprite(profile()));
});

test('rejects invalid frame grids, frame numbers, animation lengths, and speeds', () => {
  for (const overrides of [
    { frameWidth: 15 }, { frameWidth: 0 }, { frameHeight: 5000 },
    { frameWidth: 1, frameHeight: 1 },
    { animations: { idle: [2] } }, { animations: { idle: [-1] } }, { animations: { idle: [0.5] } },
    { animations: { idle: [] } }, { animations: { idle: Array(65).fill(0) } },
    { animations: { idle: [0], unknown: [0] } }, { animations: [] },
    { fps: 0 }, { fps: 25 }, { fps: NaN }, { name: ' ' }, { name: 'x'.repeat(49) }, { name: 'Bad\nName' },
  ]) assert.throws(() => validateSprite(profile(overrides)), /Sprite pack:/);
});

test('preserves optional feed, pet, and expression animations through validation and export', async t => {
  const folder = await fixture(t);
  const animations = { idle: [0], eat: [0, 1], pet: [1, 0, 1], happy: [1], sad: [0], surprised: [1], angry: [0, 1, 0] };
  const original = validateSprite(profile({ animations }));
  for (const key of ['eat', 'pet', 'happy', 'sad', 'surprised', 'angry']) assert.deepEqual(original.animations[key], animations[key]);
  const target = await exportSprite(original, path.join(folder, 'expressions.json'));
  assert.deepEqual(await importSprite(target), original);
  assert.equal(Object.hasOwn(validateSprite(profile()).animations, 'eat'), false, 'omitted optional animations must remain optional');
  for (const frames of [[], [-1], [2], Array(65).fill(0), '0,1']) {
    assert.throws(() => validateSprite(profile({ animations: { idle: [0], eat: frames } })), /Sprite pack:/);
  }
});

test('Shimeji motion animations survive import and export while remaining optional', async t => {
  const folder = await fixture(t);
  const poses = ['sit', 'climb', 'hang', 'fall', 'jump', 'drag', 'land'];
  const animations = { idle: [0], walk: [0, 1] };
  for (const pose of poses) animations[pose] = [1, 0, 1];
  const original = validateSprite(profile({ animations }));
  const target = await exportSprite(original, path.join(folder, 'motion.json'));
  const imported = await importSprite(target);
  assert.deepEqual(imported, original);
  for (const pose of poses) {
    assert.deepEqual(imported.animations[pose], [1, 0, 1]);
    assert.equal(Object.hasOwn(validateSprite(profile()).animations, pose), false);
    for (const frames of [[], [-1], [2], Array(65).fill(0), '0,1']) {
      assert.throws(() => validateSprite(profile({ animations: { idle: [0], [pose]: frames } })), /Sprite pack:/);
    }
  }
  assert.throws(() => validateSprite(profile({ animations: { idle: [0], execute: [0] } })), /Supported animations/);
});

test('rejects corrupt PNG headers, checksums, scanlines, compression, and incomplete data', () => {
  const good = png();
  const corrupt = Buffer.from(good); corrupt[40] ^= 1;
  const badRows = Buffer.alloc((32 * 4 + 1) * 16); badRows[0] = 5;
  const cases = [Buffer.from('not png'), good.subarray(0, good.length - 3), corrupt, png(32, 16, badRows), png(32, 16, Buffer.alloc(1)), Buffer.concat([good, Buffer.from('trailing')]), png(4097, 1)];
  for (const image of cases) assert.throws(() => validateSprite(profile({ image: dataURL(image) })), /Sprite pack:/);
});

test('rejects invalid or excessive data URLs without trusting persisted settings', () => {
  for (const image of ['https://example.com/pet.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,###=', dataURL(png()).replace(/=$/, ''), 'data:image/png;base64,' + 'A'.repeat(3 * 1024 * 1024)]) {
    assert.throws(() => validateSprite(profile({ image })), /Sprite pack:/);
  }
});

test('bounds input sizes, rejects malformed JSON, and cleans failed exports', async t => {
  const folder = await fixture(t);
  await fs.writeFile(path.join(folder, 'huge.png'), Buffer.alloc(2 * 1024 * 1024 + 1));
  await assert.rejects(importSprite(path.join(folder, 'huge.png')), /no larger/);
  await fs.writeFile(path.join(folder, 'large.json'), ' '.repeat(64 * 1024 + 1));
  await assert.rejects(importSprite(path.join(folder, 'large.json')), /no larger/);
  await fs.writeFile(path.join(folder, 'bad.json'), '{oops');
  await assert.rejects(importSprite(path.join(folder, 'bad.json')), /JSON is not valid/);
  await fs.mkdir(path.join(folder, 'directory.json'));
  const before = (await fs.readdir(folder)).sort();
  await assert.rejects(exportSprite(profile(), path.join(folder, 'directory.json')));
  assert.deepEqual((await fs.readdir(folder)).sort(), before, 'failed export must remove temporary manifest and PNG');
});

test('the included Mochi pack loads with all four animations', async () => {
  const result = await importSprite(path.join(__dirname, '..', 'sprite-examples', 'mochi', 'character.json'));
  assert.equal(result.name, 'Mochi');
  assert.equal(result.frameWidth, 96);
  assert.equal(result.frameHeight, 96);
  for (const key of ['idle', 'walk', 'sleep', 'play']) assert.ok(result.animations[key].length > 1);
});
