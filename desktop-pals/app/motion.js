/* DeskFur screen physics. Coordinates on pets remain normalized; velocities are px/s. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PetMotion = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MODES = new Set(['idle', 'walk', 'sit', 'jump', 'fall', 'land', 'climb', 'hang', 'drag', 'follow']);
  const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

  function motion(pet) {
    if (!pet || typeof pet !== 'object') throw new TypeError('A pet object is required.');
    if (!pet.motion || typeof pet.motion !== 'object') pet.motion = {};
    const m = pet.motion;
    if (!MODES.has(m.mode)) m.mode = 'idle';
    m.vx = finite(m.vx, 0); m.vy = finite(m.vy, 0);
    m.elapsed = Math.max(0, finite(m.elapsed, 0));
    m.duration = Math.max(0, finite(m.duration, 2));
    m.direction = m.direction === -1 || m.direction === 1 ? m.direction : (pet.facing === -1 ? -1 : 1);
    m.side = m.side === -1 ? -1 : 1;
    return m;
  }

  function mode(m, name, duration) {
    m.mode = name; m.elapsed = 0;
    m.duration = duration === undefined ? 2 : duration;
  }

  function grab(pet) {
    const m = motion(pet);
    mode(m, 'drag'); m.vx = 0; m.vy = 0; m.target = null;
    m.launch = false; m.attach = false; m.afterLand = null;
    pet.pose = 'drag'; pet.behavior = 'play';
    return pet;
  }

  function release(pet, velocity = {}) {
    const m = motion(pet);
    mode(m, 'fall'); m.vx = clamp(finite(velocity.vx, 0), -1200, 1200);
    m.vy = clamp(finite(velocity.vy, 0), -900, 1400);
    m.target = null; m.afterLand = null;
    m.launch = false; m.attach = false;
    pet.pose = 'fall'; pet.behavior = 'play';
    return pet;
  }

  function command(pet, name, target) {
    const m = motion(pet);
    if (!MODES.has(name) || name === 'drag' || name === 'land') return pet;
    mode(m, name, name === 'sit' ? 5 : (name === 'hang' ? 4 : 3));
    m.vx = 0; m.vy = 0; m.target = null; m.afterLand = null;
    m.launch = false; m.attach = false;
    if (target && Number.isFinite(target.x)) m.target = {x: target.x, y: finite(target.y, 0)};
    if (name === 'jump') m.launch = true;
    if (name === 'climb') { m.attach = true; m.climbDirection = -1; }
    if (name === 'hang') m.attach = true;
    pet.pose = name;
    return pet;
  }

  function update(pet, delta, options = {}) {
    const m = motion(pet);
    const width = Math.max(1, finite(options.width, 1280));
    const height = Math.max(1, finite(options.height, 720));
    const size = clamp(finite(options.size, 128), 1, 1024);
    const speed = clamp(finite(options.speed, 42), 0, 300);
    const dt = clamp(finite(delta, 0), 0, .05);
    const half = Math.min(size * .46, width / 2);
    const bounds = {left: half, right: width - half, floor: Math.max(0, height - 28)};
    bounds.ceiling = Math.min(bounds.floor, size * 1.08 + 8);
    m.bounds = bounds;
    let x = clamp(finite(pet.x, .5) * width, bounds.left, bounds.right);
    let y = clamp(finite(pet.y, .8) * height, bounds.ceiling, bounds.floor);
    const rng = () => {
      const value = typeof options.random === 'function' ? options.random() : Math.random();
      return clamp(finite(value, .5), 0, .999999999);
    };
    const publish = () => {
      pet.x = clamp(x / width, 0, 1); pet.y = clamp(y / height, 0, 1);
      pet.facing = m.direction;
      pet.pose = m.mode === 'follow' ? (
        m.target && Math.abs(clamp(m.target.x, bounds.left, bounds.right) - x) <= 4 ? 'idle' : 'walk') : m.mode;
      pet.behavior = options.sleeping ? 'sleep' : (
        ['walk', 'climb', 'hang'].includes(pet.pose) ? 'walk' :
        ['jump', 'fall', 'land', 'drag'].includes(m.mode) ? 'play' : 'idle');
      return pet;
    };
    if (options.enabled === false || options.paused || m.mode === 'drag' || !dt) return publish();

    // Sleeping pets settle naturally rather than sleeping in midair or on the ceiling.
    if (options.sleeping) {
      m.vx = 0;
      if (y < bounds.floor - .5) {
        if (m.mode !== 'fall') { mode(m, 'fall'); m.vy = Math.max(0, m.vy); }
      } else { y = bounds.floor; mode(m, 'idle'); m.vy = 0; return publish(); }
    }
    m.elapsed += dt;

    // Explicit grounded commands first fall onto the desktop; ordinary idle preserves placement.
    if (speed > 0 && ['walk', 'sit', 'follow'].includes(m.mode) && y < bounds.floor - .5) {
      m.afterLand = m.mode; mode(m, 'fall'); m.vy = Math.max(0, m.vy);
    }

    if (m.mode === 'jump' || m.mode === 'fall') {
      if (m.launch) {
        m.launch = false;
        m.vy = -Math.min(530, Math.max(300, height * .65));
        m.vx = m.direction * Math.max(40, speed * 1.9);
      }
      const nextVy = Math.min(1300, m.vy + 1500 * dt);
      const damping = Math.exp(-1.15 * dt);
      x += m.vx * (1 - damping) / 1.15; y += (m.vy + nextVy) * .5 * dt;
      m.vx *= damping; m.vy = nextVy;
      if (x <= bounds.left || x >= bounds.right) { x = clamp(x, bounds.left, bounds.right); m.vx *= -.2; }
      if (y <= bounds.ceiling) { y = bounds.ceiling; m.vy = Math.max(0, m.vy); }
      if (m.vy >= 0 && m.mode === 'jump') mode(m, 'fall');
      if (y >= bounds.floor) {
        y = bounds.floor; m.impact = Math.abs(m.vy); m.vy = 0; m.vx = 0;
        mode(m, options.sleeping ? 'idle' : 'land', .22);
      }
    } else if (m.mode === 'land') {
      if (m.elapsed >= m.duration) { const next = m.afterLand || 'idle'; m.afterLand = null; mode(m, next, 1 + rng() * 2); }
    } else if (speed > 0 && m.mode === 'climb') {
      if (m.attach) {
        m.attach = false; m.side = m.target ? (m.target.x < width / 2 ? -1 : 1) : (x < width / 2 ? -1 : 1);
      }
      x = m.side === -1 ? bounds.left : bounds.right;
      m.direction = -m.side;
      y += (m.climbDirection === 1 ? 1 : -1) * Math.max(35, speed * .95) * dt;
      if (y <= bounds.ceiling) { y = bounds.ceiling; mode(m, 'hang', 2.5 + rng() * 3); m.direction = -m.side; }
      else if (y >= bounds.floor) { y = bounds.floor; mode(m, 'walk', 2 + rng() * 3); m.direction = -m.side; }
    } else if (speed > 0 && m.mode === 'hang') {
      if (m.attach) { m.attach = false; y = bounds.ceiling; }
      y = bounds.ceiling;
      x += m.direction * speed * .65 * dt;
      if (x <= bounds.left || x >= bounds.right) {
        x = clamp(x, bounds.left, bounds.right); m.side = x <= bounds.left ? -1 : 1;
        if (rng() < .5) { mode(m, 'climb'); m.climbDirection = 1; }
        else m.direction *= -1;
      }
      if (m.elapsed >= m.duration) { mode(m, 'fall'); m.vx = m.direction * speed * .4; m.vy = 30; }
    } else if (speed > 0 && (m.mode === 'walk' || m.mode === 'follow')) {
      y = bounds.floor;
      if (m.mode === 'follow' && options.target && Number.isFinite(options.target.x)) {
        m.target = {x: options.target.x, y: finite(options.target.y, 0)};
      }
      if (m.mode === 'follow' && m.target) {
        const destination = clamp(m.target.x, bounds.left, bounds.right);
        const distance = destination - x;
        if (Math.abs(distance) > 4) {
          m.direction = distance < 0 ? -1 : 1;
          x += m.direction * Math.min(Math.abs(distance), speed * 1.2 * dt);
        }
      } else {
        x += m.direction * speed * dt;
        if (x <= bounds.left || x >= bounds.right) {
          x = clamp(x, bounds.left, bounds.right); m.side = x <= bounds.left ? -1 : 1;
          if (rng() < .65 && bounds.ceiling < bounds.floor - 20) { mode(m, 'climb'); m.climbDirection = -1; }
          else { m.direction *= -1; mode(m, 'walk', 2 + rng() * 3); }
        } else if (m.elapsed >= m.duration) mode(m, rng() < .6 ? 'idle' : 'sit', 1.5 + rng() * 4);
      }
    } else if (speed > 0 && (m.mode === 'idle' || m.mode === 'sit') && m.elapsed >= m.duration) {
      const choice = rng();
      if (choice < .17 && y >= bounds.floor - .5) { mode(m, 'jump'); m.launch = true; }
      else if (choice < .78) { m.direction = rng() < .5 ? -1 : 1; mode(m, 'walk', 2.5 + rng() * 5); }
      else mode(m, 'sit', 2 + rng() * 5);
    }
    x = clamp(x, bounds.left, bounds.right); y = clamp(y, bounds.ceiling, bounds.floor);
    return publish();
  }

  return {update, grab, release, command};
});
