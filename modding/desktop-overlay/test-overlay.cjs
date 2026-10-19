// Execute the patch's JavaScript-compatible GML control code with window/input
// bindings. These verify the launcher protocol; they do not emulate rendering.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const step = fs.readFileSync(path.join(__dirname, 'overlay-step.gml'), 'utf8');
const create = fs.readFileSync(path.join(__dirname, 'overlay-create.gml'), 'utf8');

function game(overrides = {}, arguments_ = []) {
  const pressed = new Set();
  const calls = [];
  let caption = "Wife's Bedroom: Hyper Edition";
  const state = {
    global: {
      mod_desktop_overlay: false, mod_desktop_waiting: false,
      mod_desktop_launcher: true, mod_desktop_previous: false,
      mod_desktop_base_caption: caption, mod_desktop_window_colour: 42,
      mod_hd_debug: true,
    },
    title: true, title_scale: 1, start_timer: -1, disclaimer: false,
    custom_menu: true, submenu: 3, fullscreen: true,
    vk_f9: 'F9', vk_escape: 'Escape', cr_default: 0, cr_none: -1,
    min: Math.min, floor: Math.floor,
    parameter_count: () => arguments_.length,
    parameter_string: index => arguments_[index - 1],
    display_get_width: () => 1920, display_get_height: () => 1080,
    keyboard_check_pressed: key => pressed.has(key),
    keyboard_clear: key => { pressed.delete(key); calls.push(['clear', key]); },
    window_get_caption: () => caption,
    window_set_caption: value => { caption = value; calls.push(['caption', value]); },
    window_get_colour: () => 42,
    window_set_colour: value => calls.push(['colour', value]),
    make_color_rgb: (r, g, b) => r | g << 8 | b << 16,
    window_set_cursor: value => calls.push(['cursor', value]),
    window_set_fullscreen: value => calls.push(['fullscreen', value]),
    window_set_size: (w, h) => calls.push(['size', w, h]),
    application_surface_draw_enable: value => calls.push(['surface', value]),
    ...overrides,
  };
  vm.createContext(state);
  return {
    state, calls, pressed, caption: () => caption,
    create: () => vm.runInContext(create, state),
    step: (...keys) => { pressed.clear(); keys.forEach(key => pressed.add(key)); vm.runInContext(step, state); },
  };
}
function ready(g) { Object.assign(g.state, { title: false, title_scale: 0, start_timer: 0 }); }

test('ordinary launch preserves the original startup and window', () => {
  const g = game();
  g.create();
  g.step('F9');
  assert.equal(g.state.global.mod_desktop_launcher, false);
  assert.equal(g.state.title, true);
  assert.equal(g.state.disclaimer, false);
  assert.equal(g.state.fullscreen, true);
  assert.deepEqual(g.calls, []);
});

test('launcher queues overlay without skipping the original Begin flow', () => {
  const g = game({}, ['--desktop-overlay']);
  g.create(); g.step();
  assert.equal(g.state.global.mod_desktop_waiting, true);
  assert.equal(g.state.global.mod_desktop_overlay, false);
  assert.equal(g.state.title, true);
  assert.equal(g.state.disclaimer, false);
  assert.match(g.caption(), / \[Desktop Waiting\]$/);
  assert.deepEqual(g.calls.find(c => c[0] === 'size'), ['size', 1280, 720]);
});

test('queued overlay waits for the title transition and game start timer', () => {
  const g = game({}, ['--desktop-overlay']); g.create(); ready(g);
  g.state.start_timer = 10; g.step();
  assert.equal(g.state.global.mod_desktop_overlay, false);
  g.state.start_timer = 0; g.step();
  assert.equal(g.state.global.mod_desktop_overlay, true);
  assert.equal(g.state.global.mod_desktop_waiting, false);
  assert.equal(g.state.custom_menu, false);
  assert.equal(g.state.submenu, -1);
  assert.match(g.caption(), / \[Desktop Overlay\]$/);
  assert.ok(g.calls.some(c => c[0] === 'colour' && c[1] === 0x030201));
});

test('F9 cancels a queued start even on the first eligible game frame', () => {
  const g = game({}, ['--desktop-overlay']); g.create(); ready(g); g.step('F9');
  assert.equal(g.state.global.mod_desktop_waiting, false);
  assert.equal(g.state.global.mod_desktop_overlay, false);
  assert.match(g.caption(), / \[Desktop Ready\]$/);
});

test('normal view can enter and leave overlay through the same mode key', () => {
  const g = game(); ready(g); g.step('F9');
  assert.equal(g.state.global.mod_desktop_overlay, true);
  g.step('F9');
  assert.equal(g.state.global.mod_desktop_overlay, false);
  assert.match(g.caption(), / \[Desktop Ready\]$/);
  assert.ok(g.calls.some(c => c[0] === 'colour' && c[1] === 42));
  assert.ok(g.calls.some(c => c[0] === 'cursor' && c[1] === -1));
});

test('Escape restores normal view and is consumed before original title input', () => {
  const g = game(); ready(g); g.step('F9'); g.step('Escape');
  assert.equal(g.state.global.mod_desktop_overlay, false);
  assert.equal(g.state.title, false);
  assert.equal(g.pressed.has('Escape'), false);
  assert.match(g.caption(), / \[Desktop Ready\]$/);
});

test('F9 before Begin queues and cancels without changing the title', () => {
  const g = game(); g.step('F9');
  assert.equal(g.state.global.mod_desktop_waiting, true);
  g.step('F9');
  assert.equal(g.state.global.mod_desktop_waiting, false);
  assert.equal(g.state.global.mod_desktop_overlay, false);
  assert.equal(g.state.title, true);
});

test('launch size fits a small desktop while keeping the 16:9 game view', () => {
  const g = game({display_get_width: () => 1000, display_get_height: () => 500}, ['--desktop-overlay']);
  g.create();
  const [, width, height] = g.calls.find(c => c[0] === 'size');
  assert.ok(width <= 800 && height <= 400);
  assert.ok(Math.abs(width / height - 16 / 9) < 0.003);
});
