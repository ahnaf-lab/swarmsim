import test from 'node:test';
import assert from 'node:assert/strict';
import { step, DEFAULT_RULES } from '../src/step.js';
import { mulberry32, hashSeed, deriveFrameSeed } from '../src/rng.js';

function makeState(overrides = {}) {
  return {
    width: 20,
    height: 20,
    frame: 0,
    boids: [
      { x: 5, y: 5, vx: 0.5, vy: 0 },
      { x: 6, y: 5, vx: -0.5, vy: 0.2 },
      { x: 15, y: 15, vx: 0, vy: 0.5 },
    ],
    ...overrides,
  };
}

test('step advances the frame counter by exactly one', () => {
  const state = makeState();
  const next = step(state, {}, 'seed-a');
  assert.equal(next.frame, 1);
  const next2 = step(next, {}, 'seed-a');
  assert.equal(next2.frame, 2);
});

test('step returns the same boid count and finite coordinates', () => {
  const state = makeState();
  const next = step(state, {}, 42);
  assert.equal(next.boids.length, state.boids.length);
  for (const b of next.boids) {
    assert.ok(Number.isFinite(b.x));
    assert.ok(Number.isFinite(b.y));
    assert.ok(Number.isFinite(b.vx));
    assert.ok(Number.isFinite(b.vy));
  }
});

test('step is deterministic: same state, rules, seed -> identical output', () => {
  const state = makeState();
  const a = step(state, { jitter: 0.3 }, 'reproduce-me');
  const b = step(state, { jitter: 0.3 }, 'reproduce-me');
  assert.deepEqual(a, b);
});

test('step with a different seed diverges when jitter is enabled', () => {
  const state = makeState();
  const a = step(state, { jitter: 0.5 }, 'seed-one');
  const b = step(state, { jitter: 0.5 }, 'seed-two');
  assert.notDeepEqual(a, b);
});

test('step does not mutate the input state or rules', () => {
  const state = makeState();
  const rules = { jitter: 0.1 };
  const stateSnapshot = JSON.parse(JSON.stringify(state));
  const rulesSnapshot = JSON.parse(JSON.stringify(rules));
  step(state, rules, 'no-mutate');
  assert.deepEqual(state, stateSnapshot);
  assert.deepEqual(rules, rulesSnapshot);
});

test('step wraps positions around the torus when rules.wrap is true', () => {
  const state = makeState({
    boids: [{ x: 19.9, y: 19.9, vx: 0.5, vy: 0.5 }],
  });
  const next = step(state, { wrap: true, jitter: 0 }, 1);
  const b = next.boids[0];
  assert.ok(b.x >= 0 && b.x < state.width);
  assert.ok(b.y >= 0 && b.y < state.height);
});

test('step bounces off walls when rules.wrap is false', () => {
  const state = makeState({
    boids: [{ x: 0.1, y: 10, vx: -0.5, vy: 0 }],
  });
  const next = step(state, { wrap: false, jitter: 0 }, 1);
  const b = next.boids[0];
  assert.ok(b.x >= 0, 'boid should be clamped at the wall, not past it');
  assert.ok(b.vx > 0, 'velocity should have reflected away from the wall');
});

test('step clamps speed to rules.maxSpeed', () => {
  const state = makeState({
    boids: [{ x: 10, y: 10, vx: 50, vy: 50 }],
  });
  const next = step(state, { maxSpeed: 1, jitter: 0 }, 1);
  const b = next.boids[0];
  const speed = Math.hypot(b.vx, b.vy);
  assert.ok(speed <= 1 + 1e-9, `speed ${speed} exceeded maxSpeed`);
});

test('step throws on malformed state', () => {
  assert.throws(() => step(null, {}, 1), TypeError);
  assert.throws(() => step({ width: 10, height: 10, boids: 'nope' }, {}, 1), TypeError);
  assert.throws(
    () => step({ width: 10, height: 10, boids: [{ x: 1, y: 1, vx: NaN, vy: 0 }] }, {}, 1),
    TypeError,
  );
});

test('DEFAULT_RULES is not mutated by step overrides', () => {
  const state = makeState();
  step(state, { maxSpeed: 999 }, 1);
  assert.equal(DEFAULT_RULES.maxSpeed, 1.5);
});

test('mulberry32 produces a deterministic, repeatable sequence', () => {
  const seed = hashSeed('repro');
  const seqA = Array.from({ length: 5 }, mulberry32(seed));
  const seqB = Array.from({ length: 5 }, mulberry32(seed));
  assert.deepEqual(seqA, seqB);
  for (const value of seqA) {
    assert.ok(value >= 0 && value < 1);
  }
});

test('deriveFrameSeed produces different seeds for different frames', () => {
  const s0 = deriveFrameSeed('x', 0);
  const s1 = deriveFrameSeed('x', 1);
  assert.notEqual(s0, s1);
});
