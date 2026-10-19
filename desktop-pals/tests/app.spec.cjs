const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
let staticServer, baseURL, relay, sprite;

test.beforeAll(async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'sprite-examples/mochi/character.json'), 'utf8'));
  sprite = { ...manifest, image: 'data:image/png;base64,' + (await fs.readFile(path.join(root, 'sprite-examples/mochi/sheet.png'))).toString('base64') };
  staticServer = http.createServer(async (req, res) => {
    try {
      const requested = req.url === '/' ? '/app/index.html' : new URL(req.url, 'http://localhost').pathname;
      const file = path.resolve(root, '.' + requested);
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      const content = await fs.readFile(file);
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
      res.end(content);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => staticServer.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${staticServer.address().port}/app/index.html`;
  const { startServer } = await import(pathToFileURL(path.join(root, 'server/server.js')).href);
  relay = await startServer({ port: 0, host: '127.0.0.1', spriteCooldownMs: 0 });
});

test.afterAll(async () => {
  if (relay) await relay.close();
  if (staticServer) await new Promise(resolve => staticServer.close(resolve));
});

async function openApp(page, config = {}) {
  await page.addInitScript(({ config, sprite }) => {
    window.testBridge = { saves: [], imports: 0, exports: [], passthrough: [] };
    window.desktop = {
      load: async () => ({ muted: true, speed: 0, ...config }),
      save: async value => { window.testBridge.saves.push(structuredClone(value)); return value; },
      importSprite: async () => { window.testBridge.imports++; return { sprite }; },
      exportSprite: async value => { window.testBridge.exports.push(structuredClone(value)); return { ok: true }; },
      passthrough: value => window.testBridge.passthrough.push(value),
      onShow: callback => { window.testShowControls = callback; },
      quit: () => { window.testQuit = true; },
    };
  }, { config, sprite });
  await page.goto(baseURL);
  await page.waitForFunction(() => window.deskFur && document.getElementById('pets').width && window.deskFur.getState().config.muted);
}

const state = page => page.evaluate(() => window.deskFur.getState());
const tab = (page, name) => page.locator(`[data-tab="${name}"]`).click();

test('real renderer draws an original anthro pet without script errors', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await openApp(page);
  await expect(page.getByRole('heading', { name: 'DeskFur', exact: true })).toBeVisible();
  const pixels = await page.evaluate(() => {
    const c = document.getElementById('pets'), data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) opaque++;
    return opaque;
  });
  expect(pixels).toBeGreaterThan(3000);
  await page.screenshot({ path: testInfo.outputPath('deskfur-desktop.png') });
  expect(errors).toEqual([]);
});

test('feeding, petting, sleep, expressions, and local time update the live pet', async ({ page }) => {
  await openApp(page);
  await page.locator('#feed').click();
  await expect(page.locator('#fullness')).toHaveText('90');
  expect((await state(page)).local.action).toBe('eat');
  await page.locator('#petting').click();
  await expect(page.locator('#bond')).toHaveText('58');
  expect((await state(page)).local.action).toBe('pet');
  await page.locator('#sleep').click();
  await expect.poll(async () => (await state(page)).local.behavior).toBe('sleep');
  await page.locator('#sleep').click();
  await page.waitForTimeout(3100);
  await page.locator('#expression').selectOption('surprised');
  await expect.poll(async () => (await state(page)).local.expression).toBe('surprised');
  await page.locator('#time').click();
  await expect(page.locator('#feedback')).toContainText('Your local time:');
  await tab(page, 'friends');
  await page.locator('#chat').fill('/time');
  await page.locator('#chatForm button').click();
  await expect(page.locator('#feedback')).toContainText('Your local time:');
});

test('duo mode adds a second draggable pet and selected-pet care follows the buddy', async ({ page }) => {
  await openApp(page);
  await page.locator('#dual').check();
  expect((await state(page)).config.dual).toBe(true);
  const before = (await state(page)).buddy;
  const viewport = page.viewportSize();
  const start = { x: before.x * viewport.width, y: before.y * viewport.height - 45 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 140, start.y - 90, { steps: 8 });
  await page.mouse.up();
  const moved = (await state(page)).buddy;
  expect(moved.x).toBeLessThan(before.x - .08);
  expect(moved.y).toBeLessThan(before.y - .06);
  await page.locator('#petting').click();
  await expect(page.locator('#feedback')).toContainText('Companion enjoys the attention.');
  await expect.poll(async () => (await state(page)).buddy.action).toBe('pet');
  await page.locator('#dual').uncheck();
  await page.locator('#feed').click();
  await expect(page.locator('#feedback')).toContainText('My pet enjoyed a snack.');
});

test('zero wandering speed stops movement; settings save through the desktop bridge', async ({ page }) => {
  await openApp(page, { name: 'Sora', x: .25 });
  const startX = (await state(page)).local.x;
  await page.waitForTimeout(350);
  expect((await state(page)).local.x).toBe(startX);
  await page.locator('#speed').fill('100');
  await page.locator('#speed').dispatchEvent('input');
  await expect.poll(async () => Math.abs((await state(page)).local.x - startX)).toBeGreaterThan(.01);
  await page.locator('#speed').fill('0');
  await page.locator('#speed').dispatchEvent('input');
  const stopped = (await state(page)).local.x;
  await page.waitForTimeout(350);
  expect((await state(page)).local.x).toBe(stopped);
  await expect.poll(() => page.evaluate(() => window.testBridge.saves.at(-1)?.speed)).toBe(0);
  expect(await page.evaluate(() => window.testBridge.saves.at(-1).name)).toBe('Sora');
});

test('custom PNG pack imports, animates, validates its grid, and exports editable settings', async ({ page }) => {
  await openApp(page);
  await tab(page, 'sprites');
  await page.locator('#import').click();
  await expect(page.locator('#spriteInfo')).toContainText('Mochi');
  await expect(page.locator('#columns')).toHaveValue('4');
  await expect(page.locator('#rows')).toHaveValue('3');
  await page.locator('#fps').fill('12');
  await page.locator('#animWalk').fill('2,3,4,5');
  await page.locator('#applySprite').click();
  await expect(page.locator('#feedback')).toContainText('Animation settings applied');
  expect((await state(page)).config.sprite.fps).toBe(12);
  expect((await state(page)).config.sprite.animations.walk).toEqual([2, 3, 4, 5]);
  await page.locator('#animIdle').fill('99');
  await page.locator('#applySprite').click();
  await expect(page.locator('#feedback')).toContainText('valid frame numbers');
  expect((await state(page)).config.sprite.animations.idle).toEqual([0, 1]);
  await page.locator('#export').click();
  expect(await page.evaluate(() => window.testBridge.exports.at(-1).fps)).toBe(12);
  await page.locator('#builtin').click();
  expect((await state(page)).config.sprite).toBeNull();
  await expect(page.locator('#spriteInfo')).toContainText('built-in kemono');
});

test('hidden controls restore and blank desktop requests mouse passthrough', async ({ page }) => {
  await openApp(page);
  await page.mouse.move(20, 20);
  await expect.poll(() => page.evaluate(() => window.testBridge.passthrough.at(-1))).toBe(true);
  await page.locator('#hide').click();
  await expect(page.locator('#panel')).toBeHidden();
  await page.locator('#show').click();
  await expect(page.locator('#panel')).toBeVisible();
  expect(await page.evaluate(() => window.testBridge.passthrough.at(-1))).toBe(false);
});

test('separate browser clients join a real relay, sync movement and custom sprites, and deliver private messages', async ({ browser }) => {
  const a = await browser.newContext(), b = await browser.newContext();
  try {
    const host = await a.newPage(), friend = await b.newPage();
    await openApp(host, { name: 'Rowan', x: .2 });
    await openApp(friend, { name: 'Mika', x: .65 });
    await tab(host, 'friends');
    await host.locator('#relay').fill(relay.url);
    await host.locator('#create').click();
    await expect(host.locator('#connection')).toHaveText('Together online');
    const code = await host.locator('#roomCode').textContent();
    expect(code).toMatch(/^[A-Z0-9]{12}$/);
    await tab(friend, 'friends');
    await friend.locator('#relay').fill(relay.url);
    await friend.locator('#code').fill(code);
    await friend.locator('#join').click();
    await expect(friend.locator('#connection')).toHaveText('Together online');
    await expect(host.locator('#people')).toContainText('Mika');
    await expect(friend.locator('#people')).toContainText('Rowan');
    const friendId = (await state(friend)).myId;
    await host.locator('#messageTo').selectOption(friendId);
    await host.locator('#chat').fill('A private hello from Rowan');
    await host.locator('#chatForm button').click();
    await expect(friend.locator('#messages')).toContainText('Rowan (private): A private hello from Rowan');
    await host.evaluate(() => window.pawPals.setPosition(.34, .55));
    await expect.poll(async () => (await state(friend)).peers[0]?.x).toBeCloseTo(.34, 3);
    await expect.poll(async () => (await state(friend)).peers[0]?.y).toBeCloseTo(.55, 3);
    await tab(host, 'sprites');
    await host.locator('#import').click();
    await expect.poll(async () => (await state(friend)).peers[0]?.sprite?.name).toBe('Mochi');
    expect((await state(friend)).peers[0].sprite.image).toBe(sprite.image);
    // Exercise the actual renderer dispatch and authoritative relay through a
    // complete game, rather than only injecting synthetic game-state events.
    await tab(host, 'games');
    await tab(friend, 'games');
    await host.locator('#game-opponent').selectOption(friendId);
    await host.locator('#game-start').click();
    await expect(friend.locator('.game-invite')).toContainText('Rowan invited you');
    await friend.getByRole('button', { name: 'Accept', exact: true }).click();
    for (const [player, cell] of [[host, 0], [friend, 3], [host, 1], [friend, 4], [host, 2]]) {
      await expect(player.locator('#game-cell-' + cell)).toBeEnabled();
      await player.locator('#game-cell-' + cell).click();
    }
    await expect(host.locator('.game-outcome')).toContainText('You win');
    await expect(friend.locator('.game-outcome')).toContainText('Rowan wins');
    await host.locator('#game-die').selectOption('20');
    await host.locator('#game-modifier').fill('2');
    await host.locator('#game-roll').click();
    await expect(friend.locator('.game-dice-caption')).toContainText('Rowan · D20 + 2');
    const hostRoll = await host.locator('.game-dice-number').textContent();
    await expect(friend.locator('.game-dice-number')).toHaveText(hostRoll);
    expect(Number(hostRoll)).toBeGreaterThanOrEqual(3);
    expect(Number(hostRoll)).toBeLessThanOrEqual(22);
    await tab(host, 'friends');
    await host.locator('#leave').click();
    await expect.poll(async () => (await state(friend)).peers.length).toBe(0);
    await expect(host.locator('#connection')).toHaveText('Cozy offline');
  } finally {
    await a.close(); await b.close();
  }
});
