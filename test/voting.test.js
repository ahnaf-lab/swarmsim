import test from 'node:test';
import assert from 'node:assert/strict';
import { voteStep, DEFAULT_VOTE_RULES } from '../src/voting.js';

function makeState(overrides = {}) {
  const width = 5;
  const height = 5;
  return {
    width,
    height,
    frame: 0,
    opinions: Array.from({ length: width * height }, (_, i) => i % 2),
    ...overrides,
  };
}

test('voteStep advances the frame counter by exactly one', () => {
  const state = makeState();
  const next = voteStep(state, {}, 'seed-a');
  assert.equal(next.frame, 1);
  const next2 = voteStep(next, {}, 'seed-a');
  assert.equal(next2.frame, 2);
});

test('voteStep returns valid opinions of the same length as the input', () => {
  const state = makeState();
  const next = voteStep(state, { numOpinions: 2 }, 42);
  assert.equal(next.opinions.length, state.opinions.length);
  for (const opinion of next.opinions) {
    assert.ok(Number.isInteger(opinion) && opinion >= 0 && opinion < 2);
  }
});

test('voteStep is deterministic: same state, rules, seed -> identical output', () => {
  const state = makeState();
  const a = voteStep(state, { noise: 0.1 }, 'reproduce-me');
  const b = voteStep(state, { noise: 0.1 }, 'reproduce-me');
  assert.deepEqual(a, b);
});

test('voteStep with a different seed can diverge', () => {
  const state = makeState();
  const a = voteStep(state, { noise: 0.3 }, 'seed-one');
  const b = voteStep(state, { noise: 0.3 }, 'seed-two');
  assert.notDeepEqual(a, b);
});

test('voteStep does not mutate the input state or rules', () => {
  const state = makeState();
  const rules = { noise: 0.1 };
  const stateSnapshot = JSON.parse(JSON.stringify(state));
  const rulesSnapshot = JSON.parse(JSON.stringify(rules));
  voteStep(state, rules, 'no-mutate');
  assert.deepEqual(state, stateSnapshot);
  assert.deepEqual(rules, rulesSnapshot);
});

test('a uniform grid stays uniform when noise is zero', () => {
  const state = makeState({ opinions: new Array(25).fill(1) });
  const next = voteStep(state, { noise: 0 }, 'uniform');
  assert.ok(next.opinions.every((o) => o === 1));
});

test('voteStep throws on malformed state', () => {
  assert.throws(() => voteStep(null, {}, 1), TypeError);
  assert.throws(() => voteStep({ width: 5, height: 5, opinions: 'nope' }, {}, 1), TypeError);
  assert.throws(
    () => voteStep({ width: 5, height: 5, opinions: new Array(25).fill(-1) }, {}, 1),
    TypeError,
  );
});

test('voteStep throws when rules.numOpinions is invalid', () => {
  const state = makeState();
  assert.throws(() => voteStep(state, { numOpinions: 1 }, 1), RangeError);
});

test('DEFAULT_VOTE_RULES is not mutated by voteStep overrides', () => {
  const state = makeState();
  voteStep(state, { noise: 0.9 }, 1);
  assert.equal(DEFAULT_VOTE_RULES.noise, 0.02);
});
