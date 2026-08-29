// Worked example: plugging a fully custom rule set into swarmsim.
//
// The built-in steppers (`step`, `antStep`, `voteStep`) already accept a
// partial override of their DEFAULT_RULES, e.g. `step(state, { jitter: 0.2 }, seed)`.
// This file goes one step further and shows how to write an entirely new
// stepper with its own rule shape, while still following the same
// `(state, rules, seed) -> newState` contract as the built-ins — which is
// what lets it reuse the library's seeded RNG and ASCII renderer unchanged.
//
// See docs/API.md ("Plugging in a custom rule set") for the full guide this
// example follows. Run it directly with `node examples/custom-rules.js`.

import { frameRng } from '../src/rng.js';
import { render, linesToString } from '../src/render.js';

/**
 * A custom rule set for a "gravity well" model: instead of flocking, every
 * boid accelerates toward the nearest well and its velocity decays by
 * `drag` each frame. None of these fields exist on the library's
 * DEFAULT_RULES — a custom stepper is free to define whatever shape of
 * rules its own simulation needs.
 */
export const GRAVITY_RULES = Object.freeze({
  wells: Object.freeze([
    Object.freeze({ x: 10, y: 5, strength: 0.05 }),
    Object.freeze({ x: 30, y: 15, strength: 0.04 }),
  ]),
  drag: 0.95, // fraction of velocity kept each frame; < 1 damps runaway speed
  maxSpeed: 1.5,
  jitter: 0, // magnitude of per-frame random velocity noise; 0 = none
  wrap: true, // treat width/height as a torus instead of an open plane
});

function assertFiniteNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number, got ${String(value)}`);
  }
}

function wrapCoord(value, size) {
  const wrapped = value % size;
  return wrapped < 0 ? wrapped + size : wrapped;
}

/**
 * Advance a gravity-well simulation by exactly one frame. Follows the same
 * contract as `step`/`antStep`/`voteStep`: pure (neither `state` nor `rules`
 * is mutated), and deterministic (calling it again with the same three
 * arguments always returns a deep-equal result), because the only
 * randomness used — optional velocity jitter — is derived from `seed` and
 * `state.frame` via `frameRng`, never from an ambient source.
 *
 * The returned state keeps the `{width, height, frame, boids}` shape, so it
 * renders for free with the library's existing `renderBoids`/`render`
 * functions — a custom stepper only needs a custom renderer if its state
 * shape doesn't already match one of the built-in models.
 *
 * @param {object} state shape as a boids state: {width, height, frame, boids}
 * @param {object} [rules] partial override of GRAVITY_RULES
 * @param {number|string} seed
 * @returns {object} new state, same shape as the input
 */
export function gravityStep(state, rules = {}, seed = 0) {
  if (state === null || typeof state !== 'object') {
    throw new TypeError('state must be an object');
  }
  assertFiniteNumber(state.width, 'state.width');
  assertFiniteNumber(state.height, 'state.height');
  if (!Array.isArray(state.boids)) {
    throw new TypeError('state.boids must be an array');
  }

  const r = { ...GRAVITY_RULES, ...rules };
  if (!Array.isArray(r.wells) || r.wells.length === 0) {
    throw new TypeError('rules.wells must be a non-empty array of {x, y, strength}');
  }

  const frame = Number.isInteger(state.frame) ? state.frame : 0;
  const { width, height, boids } = state;
  const rng = frameRng(seed, frame);

  const nextBoids = boids.map((boid) => {
    let vx = boid.vx * r.drag;
    let vy = boid.vy * r.drag;

    for (const well of r.wells) {
      const dx = well.x - boid.x;
      const dy = well.y - boid.y;
      const dist2 = Math.max(1, dx * dx + dy * dy);
      vx += (dx / dist2) * well.strength * 100;
      vy += (dy / dist2) * well.strength * 100;
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
    }

    let x = boid.x + vx;
    let y = boid.y + vy;
    if (r.wrap) {
      x = wrapCoord(x, width);
      y = wrapCoord(y, height);
    }

    return { x, y, vx, vy };
  });

  return { width, height, frame: frame + 1, boids: nextBoids };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  let state = {
    width: 40,
    height: 20,
    frame: 0,
    boids: Array.from({ length: 8 }, (_, i) => ({
      x: (i * 5) % 40,
      y: (i * 3) % 20,
      vx: 0,
      vy: 0,
    })),
  };
  for (let i = 0; i < 20; i++) {
    state = gravityStep(state, GRAVITY_RULES, 'gravity-demo');
    process.stdout.write(`-- gravity frame ${state.frame} --\n`);
    process.stdout.write(linesToString(render(state)) + '\n');
  }
}
