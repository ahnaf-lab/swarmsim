import test from 'node:test';
import assert from 'node:assert/strict';
import { antStep, DEFAULT_ANT_RULES } from '../src/ants.js';

function makeState(overrides = {}) {
  const width = 6;
  const height = 6;
  return {
    width,
    height,
    frame: 0,
    nest: { x: 0, y: 0 },
    food: new Array(width * height).fill(0),
    pheromone: new Array(width * height).fill(0),
    ants: [
      { x: 2, y: 2, carrying: false },
      { x: 4, y: 3, carrying: false },
    ],
    ...overrides,
  };
}

test('antStep advances the frame counter by exactly one', () => {
  const state = makeState();
  const next = antStep(state, {}, 'seed-a');
  assert.equal(next.frame, 1);
  const next2 = antStep(next, {}, 'seed-a');
  assert.equal(next2.frame, 2);
});

test('antStep is deterministic: same state, rules, seed -> identical output', () => {
  const state = makeState();
  const a = antStep(state, { sensorNoise: 0.5 }, 'reproduce-me');
  const b = antStep(state, { sensorNoise: 0.5 }, 'reproduce-me');
  assert.deepEqual(a, b);
});

test('antStep with a different seed can diverge', () => {
  const state = makeState();
  const a = antStep(state, { sensorNoise: 0.9 }, 'seed-one');
  const b = antStep(state, { sensorNoise: 0.9 }, 'seed-two');
  assert.notDeepEqual(a, b);
});

test('antStep does not mutate the input state or rules', () => {
  const state = makeState();
  const rules = { sensorNoise: 0.3 };
  const stateSnapshot = JSON.parse(JSON.stringify(state));
  const rulesSnapshot = JSON.parse(JSON.stringify(rules));
  antStep(state, rules, 'no-mutate');
  assert.deepEqual(state, stateSnapshot);
  assert.deepEqual(rules, rulesSnapshot);
});

test('an ant standing on a food cell picks the food up', () => {
  const state = makeState({
    food: (() => {
      const grid = new Array(36).fill(0);
      grid[2 * 6 + 2] = 3; // matches ants[0] at (2,2)
      return grid;
    })(),
    ants: [{ x: 2, y: 2, carrying: false }],
  });
  const next = antStep(state, {}, 'pickup');
  assert.equal(next.food[2 * 6 + 2], 2, 'one unit of food should be removed');
  assert.equal(next.ants[0].carrying, true);
});

test('an ant carrying food drops it off at the nest', () => {
  const state = makeState({
    nest: { x: 0, y: 0 },
    ants: [{ x: 0, y: 0, carrying: true }],
  });
  const next = antStep(state, {}, 'dropoff');
  assert.equal(next.ants[0].carrying, false);
});

test('pheromone evaporates every frame and ants deposit where they stand', () => {
  const state = makeState({
    pheromone: new Array(36).fill(10),
    ants: [],
  });
  const next = antStep(state, { evaporation: 0.5 }, 'evap');
  for (const level of next.pheromone) {
    assert.equal(level, 5, 'pheromone should decay by the evaporation fraction');
  }
});

test('antStep throws on malformed state', () => {
  assert.throws(() => antStep(null, {}, 1), TypeError);
  assert.throws(
    () => antStep({ width: 4, height: 4, nest: { x: 0, y: 0 }, food: [], pheromone: [], ants: 'nope' }, {}, 1),
    TypeError,
  );
  assert.throws(
    () =>
      antStep(
        { width: 4, height: 4, nest: { x: 0, y: 0 }, food: new Array(16).fill(0), pheromone: new Array(16).fill(0), ants: [{ x: 0, y: 0, carrying: 'no' }] },
        {},
        1,
      ),
    TypeError,
  );
});

test('DEFAULT_ANT_RULES is not mutated by antStep overrides', () => {
  const state = makeState();
  antStep(state, { evaporation: 0.9 }, 1);
  assert.equal(DEFAULT_ANT_RULES.evaporation, 0.02);
});
