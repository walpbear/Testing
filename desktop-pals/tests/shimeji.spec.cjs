const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
let staticServer, baseURL;

test.beforeAll(async () => {
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
});

test.afterAll(async () => {
  if (staticServer) await new Promise(resolve => staticServer.close(resolve));
});

async function openApp(page, config = {}) {
  await page.addInitScript(config => {
    window.testBridge = { saves: [], passthrough: [] };
    window.desktop = {
      load: async () => ({ shimeji: true, startHidden: false, speed: 80, muted: true, x: .35, y: .4, ...config }),
      save: async value => { window.testBridge.saves.push(structuredClone(value)); return value; },
      passthrough: value => window.testBridge.passthrough.push(value),
      onShow: callback => { window.testShowControls = callback; },
      quit: () => {},
    };
  }, config);
  await page.goto(baseURL);
  await page.waitForFunction(() => window.deskFur?.getState().config.muted && document.getElementById('pets').width);
}

const state = page => page.evaluate(() => window.deskFur.getState());
const floor = page => (page.viewportSize().height - 28) / page.viewportSize().height;

async function land(page, id = 'local') {
  await expect.poll(async () => Math.abs((await state(page))[id].y - floor(page)), { timeout: 8000 }).toBeLessThan(.003);
}

async function contextMenu(page, id = 'local') {
  const pet = (await state(page))[id];
  const size = page.viewportSize();
  await page.mouse.click(pet.x * size.width, pet.y * size.height - 55, { button: 'right' });
  await expect(page.locator('#petMenu')).toBeVisible();
}

test('desktop gravity brings the pet from midair to the desktop floor', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await openApp(page);
  expect((await state(page)).config.shimeji).toBe(true);
  await expect.poll(async () => (await state(page)).local.pose).toBe('fall');
  await land(page);
  expect((await state(page)).local.y).toBeGreaterThan(.9);
  await page.screenshot({ path: testInfo.outputPath('deskfur-shimeji-desktop.png') });
  expect(errors).toEqual([]);
});

test('picking up a pet changes its pose, and releasing it resumes gravity', async ({ page }) => {
  await openApp(page, { x: .25 });
  await land(page);
  const pet = (await state(page)).local;
  const size = page.viewportSize();
  await page.mouse.move(pet.x * size.width, pet.y * size.height - 55);
  await page.mouse.down();
  await page.mouse.move(size.width * .45, size.height * .3, { steps: 12 });
  await expect.poll(async () => (await state(page)).local.pose).toBe('drag');
  const held = (await state(page)).local;
  expect(held.y).toBeLessThan(.5);
  await page.waitForTimeout(200);
  expect((await state(page)).local.y).toBeCloseTo(held.y, 3);
  await page.mouse.up();
  await expect.poll(async () => (await state(page)).local.pose).toBe('fall');
  await land(page);
});

test('pet context commands really sit, jump, and restore settings', async ({ page }) => {
  await openApp(page);
  await land(page);
  await page.locator('#hide').click();
  await expect(page.locator('#panel')).toBeHidden();
  await contextMenu(page);
  await page.locator('#petMenu [data-command="sit"]').click();
  await expect(page.locator('#petMenu')).toBeHidden();
  await expect.poll(async () => (await state(page)).local.pose).toBe('sit');
  const seated = (await state(page)).local;
  await page.waitForTimeout(200);
  expect((await state(page)).local.x).toBeCloseTo(seated.x, 3);
  await contextMenu(page);
  await page.locator('#petMenu [data-command="jump"]').click();
  await expect.poll(async () => (await state(page)).local.y).toBeLessThan(floor(page) - .02);
  await land(page);
  await contextMenu(page);
  await page.locator('#menuSettings').click();
  await expect(page.locator('#panel')).toBeVisible();
  expect(await page.evaluate(() => window.testBridge.passthrough.at(-1))).toBe(false);
});

test('Shimeji can be disabled for classic placement, and the choice is saved', async ({ page }) => {
  await openApp(page);
  await page.locator('#shimeji').uncheck();
  await page.locator('#speed').fill('0');
  await page.locator('#speed').dispatchEvent('input');
  await page.evaluate(() => window.pawPals.setPosition(.24, .42));
  await page.waitForTimeout(350);
  expect((await state(page)).local.x).toBeCloseTo(.24, 3);
  expect((await state(page)).local.y).toBeCloseTo(.42, 3);
  await expect.poll(() => page.evaluate(() => window.testBridge.saves.at(-1)?.shimeji)).toBe(false);
  await page.locator('#shimeji').check();
  await land(page);
  await expect.poll(() => page.evaluate(() => window.testBridge.saves.at(-1)?.shimeji)).toBe(true);
});

test('two pets have independent poses and the selected buddy receives menu care', async ({ page }) => {
  await openApp(page);
  await land(page);
  await page.locator('#dual').check();
  await land(page, 'buddy');
  expect(await page.evaluate(() => {
    const { local, buddy } = window.deskFur.getState();
    return Boolean(local.motion && buddy.motion && local.motion !== buddy.motion);
  })).toBe(true);
  await page.locator('#hide').click();
  await contextMenu(page, 'buddy');
  await page.locator('#petMenu [data-command="sit"]').click();
  await expect.poll(async () => (await state(page)).buddy.pose).toBe('sit');
  expect((await state(page)).local.pose).not.toBe('sit');
  await contextMenu(page, 'buddy');
  await page.locator('#menuCareFeed').click();
  await expect.poll(async () => (await state(page)).buddy.action).toBe('eat');
  await expect(page.locator('#feedback')).toContainText('Companion enjoyed a snack.');
  await contextMenu(page, 'local');
  await page.locator('#petMenu [data-command="jump"]').click();
  await expect.poll(async () => (await state(page)).local.y).toBeLessThan(floor(page) - .02);
  expect((await state(page)).buddy.y).toBeCloseTo(floor(page), 2);
});

test('desktop startup can keep controls hidden until explicitly requested', async ({ page }) => {
  await openApp(page, { startHidden: true });
  await expect(page.locator('#panel')).toBeHidden();
  await expect(page.locator('#show')).toBeVisible();
  await page.locator('#show').click();
  await expect(page.locator('#panel')).toBeVisible();
  await page.locator('#hide').click();
  await page.evaluate(() => window.testShowControls());
  await expect(page.locator('#panel')).toBeVisible();
});

test('follow tracks a moving cursor and the climb command travels up the screen edge', async ({ page }) => {
  await openApp(page, { speed: 120 });
  await land(page);
  await page.locator('#hide').click();
  await contextMenu(page);
  await page.locator('#petMenu [data-command="follow"]').click();
  const start = (await state(page)).local.x;
  await page.mouse.move(120, 400);
  await expect.poll(async () => (await state(page)).local.x).toBeLessThan(start - .02);
  const left = (await state(page)).local.x;
  await page.mouse.move(800, 400);
  await expect.poll(async () => (await state(page)).local.x).toBeGreaterThan(left + .03);
  expect((await state(page)).local.motion.mode).toBe('follow');
  await contextMenu(page);
  await page.locator('#petMenu [data-command="climb"]').click();
  await expect.poll(async () => (await state(page)).local.pose).toBe('climb');
  await expect.poll(async () => (await state(page)).local.y).toBeLessThan(floor(page) - .02);
  const climbing = (await state(page)).local;
  expect(climbing.x < .06 || climbing.x > .94).toBe(true);
});
