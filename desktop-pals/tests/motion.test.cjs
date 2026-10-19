'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const Motion = require('../app/motion.js');
const settings = {width: 1000, height: 800, size: 128, speed: 65, random: () => .25};
function step(pet, seconds, options = {}) {
  for (let t = 0; t < seconds; t += 1 / 60) Motion.update(pet, 1 / 60, {...settings, ...options});
}
function pet(x = .5, y = .6) { return {x, y, facing: 1}; }

test('module runs in a browser without Node or Electron globals', () => {
  const context = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../app/motion.js'), 'utf8'), context);
  assert.equal(typeof context.PetMotion.update, 'function');
});

test('new pets preserve placement, and speed zero disables voluntary movement', () => {
  const p = pet();
  step(p, 15, {speed: 0});
  assert.equal(p.x, .5); assert.equal(p.y, .6); assert.equal(p.pose, 'idle');
  Motion.command(p, 'walk');
  step(p, 3, {speed: 0});
  assert.equal(p.x, .5); assert.equal(p.y, .6);
});

test('released pets fall under gravity and land above their label area', () => {
  const p = pet();
  Motion.release(p, {vx: 110, vy: 0});
  Motion.update(p, .05, settings);
  assert.ok(p.x > .5); assert.ok(p.y > .6); assert.equal(p.pose, 'fall');
  step(p, 2, {speed: 0});
  assert.equal(p.y * 800, 772); assert.equal(p.motion.vy, 0); assert.equal(p.pose, 'idle');
  assert.ok(p.motion.impact > 0);
});

test('pickup suspends gravity until release, and throwing is bounded', () => {
  const p = pet(); Motion.grab(p); step(p, 2);
  assert.equal(p.x, .5); assert.equal(p.y, .6); assert.equal(p.pose, 'drag');
  Motion.release(p, {vx: 50000, vy: -50000});
  assert.equal(p.motion.vx, 1200); assert.equal(p.motion.vy, -900);
  step(p, 4, {speed: 0});
  assert.ok(p.x >= .05888 && p.x <= .94112); assert.equal(p.y, .965);
});

test('jump arcs upward, turns into falling, and lands', () => {
  const p = pet(.5, .965); Motion.command(p, 'jump');
  Motion.update(p, .05, settings);
  assert.ok(p.y < .965); assert.equal(p.pose, 'jump');
  step(p, 1.6, {speed: 0}); assert.equal(p.y, .965); assert.equal(p.pose, 'idle');
});

test('walking reaches a side, climbs it, and crawls across the ceiling', () => {
  const p = pet(.94, .965); Motion.command(p, 'walk');
  step(p, .2); assert.equal(p.pose, 'climb'); assert.equal(p.motion.side, 1);
  const before = p.y; step(p, .5); assert.ok(p.y < before);
  step(p, 9.8); assert.equal(p.pose, 'hang');
  assert.equal(p.y * 800, settings.size * 1.08 + 8);
  const x = p.x; step(p, .5); assert.ok(p.x < x);
  step(p, 4); assert.ok(['fall', 'land', 'idle', 'walk'].includes(p.pose));
});

test('left wall climbing and descending use the same safe screen bounds', () => {
  const p = pet(.3, .4); Motion.command(p, 'climb', {x: 0, y: 100});
  step(p, .1); assert.equal(p.x, .05888); assert.equal(p.motion.side, -1);
  const y = p.y; p.motion.climbDirection = 1; step(p, .5); assert.ok(p.y > y);
  step(p, 10); assert.ok(p.x >= .05888 && p.x <= .94112);
});

test('ceiling pets eventually drop instead of hanging forever', () => {
  const p = pet(); Motion.command(p, 'hang'); step(p, .1);
  assert.equal(p.pose, 'hang'); assert.equal(p.y * 800, 146.24);
  step(p, 4); assert.equal(p.pose, 'fall');
});

test('follow uses a pixel target, stays on the floor, and does not overshoot', () => {
  const p = pet(.5, .965); Motion.command(p, 'follow', {x: 610, y: 0});
  step(p, 3); assert.ok(Math.abs(p.x * 1000 - 610) <= 4); assert.equal(p.y, .965);
  Motion.command(p, 'follow', {x: -100}); step(p, 9);
  assert.ok(Math.abs(p.x * 1000 - 58.88) <= 4);
  step(p, 2, {target: {x: 150, y: 200}});
  assert.ok(Math.abs(p.x * 1000 - 150) <= 4);
});

test('commands cancel old jump launch and wall attach requests', () => {
  const p = pet(); Motion.command(p, 'jump'); Motion.command(p, 'fall');
  Motion.update(p, .05, settings); assert.ok(p.y > .6); assert.ok(p.motion.vy > 0);
  Motion.command(p, 'jump'); Motion.grab(p); Motion.release(p);
  Motion.update(p, .05, settings); assert.ok(p.motion.vy > 0);
  p.motion.direction = 1; p.facing = -1;
  Motion.update(p, 0, settings); assert.equal(p.motion.direction, 1); assert.equal(p.facing, 1);
});

test('follow publishes wire-compatible walk and idle poses while retaining follow mode', () => {
  const p = pet(.5, .965); Motion.command(p, 'follow', {x: 600, y: 0});
  Motion.update(p, 1 / 60, settings);
  assert.equal(p.pose, 'walk'); assert.equal(p.behavior, 'walk'); assert.equal(p.motion.mode, 'follow');
  step(p, 2); assert.equal(p.pose, 'idle'); assert.equal(p.behavior, 'idle'); assert.equal(p.motion.mode, 'follow');
});

test('pause, disabled mode, sleep, and zero speed stop climbing and wandering', () => {
  for (const option of [{paused: true}, {enabled: false}, {speed: 0}]) {
    const p = pet(.8, .5); Motion.command(p, 'climb');
    step(p, 3, option); assert.equal(p.x, .8); assert.equal(p.y, .5);
  }
  const sleepy = pet(.5, .4); Motion.command(sleepy, 'hang'); step(sleepy, 2, {sleeping: true});
  assert.equal(sleepy.y, .965); assert.equal(sleepy.behavior, 'sleep');
});

test('screens, pet sizes, and resize operations always keep legal bounds', () => {
  for (const [width, height, size] of [[1920, 1080, 180], [320, 240, 180], [50, 50, 180], [1, 1, 180]]) {
    const p = pet(-30, 100); Motion.release(p, {vx: -1200, vy: -900});
    step(p, 2, {width, height, size});
    const b = p.motion.bounds;
    assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
    assert.ok(p.x * width >= b.left - 1e-8 && p.x * width <= b.right + 1e-8);
    assert.ok(p.y * height >= b.ceiling - 1e-8 && p.y * height <= b.floor + 1e-8);
  }
  const p = pet(.99, .99); Motion.update(p, .016, {width: 400, height: 300, size: 180});
  assert.ok(Math.abs(p.x - .793) < 1e-12); assert.equal(p.y, 272 / 300);
});

test('invalid time and position values stay finite and huge time steps are capped', () => {
  const p = {x: NaN, y: Infinity}; Motion.release(p, {vx: NaN, vy: Infinity});
  for (const dt of [NaN, Infinity, -1, undefined]) Motion.update(p, dt, settings);
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  const a = pet(), b = pet(); Motion.release(a); Motion.release(b);
  Motion.update(a, 999, settings); Motion.update(b, .05, settings);
  assert.equal(a.x, b.x); assert.equal(a.y, b.y);
});

test('gravity is consistent at 30 and 60 frames per second', () => {
  const a = pet(.5, .4), b = pet(.5, .4); Motion.release(a); Motion.release(b);
  for (let i = 0; i < 12; i++) Motion.update(a, 1 / 30, settings);
  for (let i = 0; i < 24; i++) Motion.update(b, 1 / 60, settings);
  assert.ok(Math.abs(a.y - b.y) * 800 < 6);
  assert.ok(Math.abs(a.motion.vy - b.motion.vy) < 1e-8);
});
