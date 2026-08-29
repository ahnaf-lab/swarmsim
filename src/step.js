import { frameRng } from './rng.js';

/**
 * Default rule set for the boids model. Every value here is a plain number
 * so callers can override just the ones they care about via
 * `{ ...DEFAULT_RULES, ...overrides }`.
 */
export const DEFAULT_RULES = Object.freeze({
  visualRange: 8, // neighbors farther than this are ignored entirely
  protectedRange: 2, // neighbors closer than this trigger separation
  centeringFactor: 0.0005, // cohesion: pull toward local flock center
  matchingFactor: 0.05, // alignment: match local flock's average heading
  avoidFactor: 0.05, // separation: push away from too-close neighbors
  minSpeed: 0.2,
  maxSpeed: 1.5,
  jitter: 0, // magnitude of per-frame random velocity noise; 0 = none
  wrap: true, // treat width/height as a torus instead of hard walls
});

function assertFiniteNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number, got ${String(value)}`);
  }
}

function validateState(state) {
  if (state === null || typeof state !== 'object') {
    throw new TypeError('state must be an object');
  }
  assertFiniteNumber(state.width, 'state.width');
  assertFiniteNumber(state.height, 'state.height');
  if (state.width <= 0 || state.height <= 0) {
    throw new RangeError('state.width and state.height must be > 0');
  }
  if (!Array.isArray(state.boids)) {
    throw new TypeError('state.boids must be an array');
  }
  for (const [i, b] of state.boids.entries()) {
    assertFiniteNumber(b?.x, `state.boids[${i}].x`);
    assertFiniteNumber(b?.y, `state.boids[${i}].y`);
    assertFiniteNumber(b?.vx, `state.boids[${i}].vx`);
    assertFiniteNumber(b?.vy, `state.boids[${i}].vy`);
  }
}

/** Shortest signed delta between two coordinates on a wrapping axis. */
function wrappedDelta(a, b, size) {
  let d = a - b;
  if (d > size / 2) d -= size;
  if (d < -size / 2) d += size;
  return d;
}

function wrapCoord(value, size) {
  const wrapped = value % size;
  return wrapped < 0 ? wrapped + size : wrapped;
}

/**
 * Advance a boids simulation by exactly one frame.
 *
 * Pure function: neither `state` nor `rules` is mutated, and calling this
 * repeatedly with the same three arguments always produces the same result
 * (deep-equal output), because all randomness is derived from `seed` and the
 * current `state.frame` rather than from ambient state like `Date.now` or
 * `Math.random`.
 *
 * @param {object} state
 * @param {number} state.width
 * @param {number} state.height
 * @param {number} [state.frame]
 * @param {Array<{x:number,y:number,vx:number,vy:number}>} state.boids
 * @param {object} [rules] partial override of DEFAULT_RULES
 * @param {number|string} seed
 * @returns {object} new state, same shape as the input
 */
export function step(state, rules = {}, seed = 0) {
  validateState(state);
  const r = { ...DEFAULT_RULES, ...rules };
  const frame = Number.isInteger(state.frame) ? state.frame : 0;
  const { width, height, boids } = state;
  const rng = frameRng(seed, frame);

  const visual2 = r.visualRange * r.visualRange;
  const protect2 = r.protectedRange * r.protectedRange;

  const nextBoids = boids.map((boid) => {
    let closeDx = 0;
    let closeDy = 0;
    let avgVx = 0;
    let avgVy = 0;
    let avgX = 0;
    let avgY = 0;
    let neighborCount = 0;

    for (const other of boids) {
      if (other === boid) continue;
      const dx = r.wrap ? wrappedDelta(other.x, boid.x, width) : other.x - boid.x;
      const dy = r.wrap ? wrappedDelta(other.y, boid.y, height) : other.y - boid.y;
      const dist2 = dx * dx + dy * dy;

      if (dist2 < protect2) {
        closeDx -= dx;
        closeDy -= dy;
      } else if (dist2 < visual2) {
        avgVx += other.vx;
        avgVy += other.vy;
        avgX += dx;
        avgY += dy;
        neighborCount += 1;
      }
    }

    let vx = boid.vx;
    let vy = boid.vy;

    vx += closeDx * r.avoidFactor;
    vy += closeDy * r.avoidFactor;

    if (neighborCount > 0) {
      avgVx /= neighborCount;
      avgVy /= neighborCount;
      avgX /= neighborCount;
      avgY /= neighborCount;

      vx += avgVx * r.matchingFactor;
      vy += avgVy * r.matchingFactor;
      vx += avgX * r.centeringFactor;
      vy += avgY * r.centeringFactor;
    }

    if (r.jitter > 0) {
      vx += (rng() * 2 - 1) * r.jitter;
      vy += (rng() * 2 - 1) * r.jitter;
    }

    const speed = Math.hypot(vx, vy);
    if (speed > r.maxSpeed) {
      const scale = r.maxSpeed / speed;
      vx *= scale;
      vy *= scale;
    } else if (speed > 0 && speed < r.minSpeed) {
      const scale = r.minSpeed / speed;
      vx *= scale;
      vy *= scale;
    }

    let x = boid.x + vx;
    let y = boid.y + vy;

    if (r.wrap) {
      x = wrapCoord(x, width);
      y = wrapCoord(y, height);
    } else {
      if (x < 0) { x = 0; vx = -vx; }
      if (x > width) { x = width; vx = -vx; }
      if (y < 0) { y = 0; vy = -vy; }
      if (y > height) { y = height; vy = -vy; }
    }

    return { x, y, vx, vy };
  });

  return {
    width,
    height,
    frame: frame + 1,
    boids: nextBoids,
  };
}
