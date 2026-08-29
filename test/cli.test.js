import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { parseArgs, run } from '../bin/swarmsim.js';

const cliPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'swarmsim.js');

function runCli(args) {
  return execFileSync(process.execPath, [cliPath, ...args], { encoding: 'utf8' });
}

test('parseArgs applies defaults when no flags are given', () => {
  const opts = parseArgs([]);
  assert.equal(opts.model, 'boids');
  assert.equal(opts.seed, 'swarmsim');
  assert.equal(opts.steps, 30);
});

test('parseArgs reads both --flag value and --flag=value forms', () => {
  const opts = parseArgs(['--model', 'ants', '--steps=5', '--seed', 'abc']);
  assert.equal(opts.model, 'ants');
  assert.equal(opts.steps, '5');
  assert.equal(opts.seed, 'abc');
});

test('parseArgs rejects an unrecognized flag', () => {
  assert.throws(() => parseArgs(['--nonsense', '1']), /unrecognized option/);
});

test('run() with a fixed seed produces identical output across two runs', async () => {
  const opts = { model: 'boids', seed: 'repeat-me', steps: 4, speed: 0, width: 15, height: 8, count: 5 };
  let outA = '';
  let outB = '';
  await run(opts, { write: (s) => { outA += s; } });
  await run(opts, { write: (s) => { outB += s; } });
  assert.equal(outA, outB);
  assert.ok(outA.length > 0);
});

test('run() with different seeds produces different output', async () => {
  const base = { model: 'boids', steps: 3, speed: 0, width: 15, height: 8, count: 5 };
  let outA = '';
  let outB = '';
  await run({ ...base, seed: 'seed-one' }, { write: (s) => { outA += s; } });
  await run({ ...base, seed: 'seed-two' }, { write: (s) => { outB += s; } });
  assert.notEqual(outA, outB);
});

test('run() prints exactly one frame block per step, each the right shape', async () => {
  const width = 12;
  const height = 6;
  const steps = 4;
  let out = '';
  await run(
    { model: 'voting', seed: 'shape-check', steps, speed: 0, width, height, count: 1 },
    { write: (s) => { out += s; } },
  );
  const blocks = out.split(/^-- /m).filter(Boolean);
  assert.equal(blocks.length, steps);
  for (const block of blocks) {
    const lines = block.trimEnd().split('\n').slice(1); // drop the header line
    assert.equal(lines.length, height);
    for (const line of lines) {
      assert.equal(line.length, width);
    }
  }
});

test('CLI subprocess runs the ants model end-to-end and exits 0', () => {
  const out = runCli(['--model', 'ants', '--steps', '2', '--speed', '0', '--width', '8', '--height', '4', '--count', '2', '--seed', 'cli-ants']);
  assert.match(out, /-- ants frame 1\/2 \(seed=cli-ants\) --/);
  assert.match(out, /-- ants frame 2\/2 \(seed=cli-ants\) --/);
});

test('CLI subprocess exits non-zero and reports an error for a bad model', () => {
  assert.throws(() => runCli(['--model', 'not-a-model']), (err) => {
    assert.equal(err.status, 1);
    assert.match(err.stderr.toString(), /unknown --model/);
    return true;
  });
});

test('CLI subprocess prints help and exits 0', () => {
  const out = runCli(['--help']);
  assert.match(out, /Usage:/);
  assert.match(out, /--model/);
});
