import test from 'node:test';
import assert from 'node:assert/strict';
import { gravityStep, GRAVITY_RULES } from '../examples/custom-rules.js';

function makeState(overrides = {}) {
  return {
    width: 40,
    height: 20,
    frame: 0,
    boids: [{ x: 0, y: 0, vx: 0, vy: 0 }],
    ...overrides,
  };
}

test('gravityStep advances the frame counter by exactly one', () => {
  const state = makeState();
  const next = gravityStep(state, GRAVITY_RULES, 'seed-a');
  assert.equal(next.frame, 1);
});

test('gravityStep is deterministic: same state, rules, seed -> identical output', () => {
  const state = makeState();
  const a = gravityStep(state, { jitter: 0.2 }, 'reproduce-me');
  const b = gravityStep(state, { jitter: 0.2 }, 'reproduce-me');
  assert.deepEqual(a, b);
});

test('gravityStep with a different seed diverges when jitter is enabled', () => {
  const state = makeState();
  const a = gravityStep(state, { jitter: 0.5 }, 'seed-one');
  const b = gravityStep(state, { jitter: 0.5 }, 'seed-two');
  assert.notDeepEqual(a, b);
});

test('gravityStep does not mutate the input state or rules', () => {
  const state = makeState();
  const rules = { jitter: 0.1 };
  const stateSnapshot = JSON.parse(JSON.stringify(state));
  const rulesSnapshot = JSON.parse(JSON.stringify(rules));
  gravityStep(state, rules, 'no-mutate');
  assert.deepEqual(state, stateSnapshot);
  assert.deepEqual(rules, rulesSnapshot);
});

test('gravityStep pulls a boid toward the nearest well over many frames', () => {
  let state = makeState({ boids: [{ x: 0, y: 0, vx: 0, vy: 0 }] });
  const rules = { wells: [{ x: 20, y: 10, strength: 0.05 }], drag: 0.9, maxSpeed: 2, wrap: false };
  const initialDist = Math.hypot(20, 10);
  for (let i = 0; i < 30; i++) {
    state = gravityStep(state, rules, 'pull-test');
  }
  const finalDist = Math.hypot(20 - state.boids[0].x, 10 - state.boids[0].y);
  assert.ok(
    finalDist < initialDist,
    `expected boid to move closer to the well (was ${initialDist}, now ${finalDist})`,
  );
});

test('gravityStep throws on malformed state or a missing rule shape', () => {
  assert.throws(() => gravityStep(null, {}, 1), TypeError);
  assert.throws(() => gravityStep({ width: 10, height: 10, boids: 'nope' }, {}, 1), TypeError);
  assert.throws(() => gravityStep(makeState(), { wells: [] }, 1), TypeError);
});
