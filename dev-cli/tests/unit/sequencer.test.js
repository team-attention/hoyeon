/**
 * sequencer.test.js — Unit tests for dev-cli/src/core/sequencer.js
 * Uses node:test and node:assert (no external test frameworks).
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createState,
  loadState,
  updateState,
  statePath,
} from '../../src/core/state.js';

import { next, stepComplete, stepInvalidate } from '../../src/core/sequencer.js';

// ---------------------------------------------------------------------------
// Temp dir management (same pattern as state.test.js)
// ---------------------------------------------------------------------------

let tmpDir;
const originalCwd = process.cwd;

function useTmpDir() {
  tmpDir = mkdtempSync(join(tmpdir(), 'dev-cli-seq-test-'));
  process.cwd = () => tmpDir;
}

function restoreCwd() {
  process.cwd = originalCwd;
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Fixtures: inline recipe blocks (stored in state.recipeBlocks)
// ---------------------------------------------------------------------------

const LLM_BLOCKS = [
  {
    id: 'classify-intent',
    type: 'llm',
    instruction: 'Classify user intent',
    save: 'dev-cli draft update {name} --section intent',
  },
];

const LLM_LOOP_BLOCKS = [
  {
    id: 'interview',
    type: 'llm-loop',
    instruction: 'Present exploration summary',
    save: 'dev-cli draft update {name} --section decisions',
    exitCheck: 'dev-cli draft validate {name}',
  },
];

const LLM_PLUS_CLI_BLOCKS = [
  {
    id: 'generate-plan',
    type: 'llm+cli',
    instruction: 'Write a structured plan as JSON',
    then: 'dev-cli plan import {name}',
  },
];

const SUBAGENT_BLOCKS = [
  {
    id: 'explore-full',
    type: 'subagent',
    agents: [
      { type: 'Explore', promptHint: 'Find patterns', output: 'findings/1.md' },
    ],
    parallel: true,
    onComplete: 'dev-cli draft import {name}',
  },
];

const SUBAGENT_LOOP_BLOCKS = [
  {
    id: 'explore-loop',
    type: 'subagent-loop',
    agents: [{ type: 'Analysis', promptHint: 'Analyze results' }],
    maxRounds: 3,
    exitWhen: 'dev-cli check done {name}',
  },
];

const CLI_BLOCKS = [
  { id: 'run-init', type: 'cli', command: 'dev-cli init {name}' },
];

const CLI_THEN_LLM_BLOCKS = [
  { id: 'run-init', type: 'cli', command: 'dev-cli init {name}' },
  {
    id: 'classify-intent',
    type: 'llm',
    instruction: 'Classify user intent',
    save: 'dev-cli draft update {name} --section intent',
  },
];

const MULTI_CLI_THEN_LLM_BLOCKS = [
  { id: 'run-init', type: 'cli', command: 'dev-cli init {name}' },
  { id: 'run-setup', type: 'cli', command: 'dev-cli setup {name}' },
  {
    id: 'classify-intent',
    type: 'llm',
    instruction: 'Classify user intent',
    save: 'dev-cli draft update {name} --section intent',
  },
];

const ALL_CLI_BLOCKS = [
  { id: 'step-a', type: 'cli', command: 'echo a' },
  { id: 'step-b', type: 'cli', command: 'echo b' },
];

// ---------------------------------------------------------------------------
// Helper: create a session with recipeBlocks stored in state
// ---------------------------------------------------------------------------

function createSessionWithBlocks(sessionName, blocks) {
  createState(sessionName, { recipe: null });
  updateState(sessionName, { recipeBlocks: blocks });
  return loadState(sessionName);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('next() — llm block', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('returns correct JSON for llm block type', async () => {
    createSessionWithBlocks('llm-test', LLM_BLOCKS);

    const result = await next('llm-test');

    assert.equal(result.action, 'llm');
    assert.equal(result.block, 'classify-intent');
    assert.equal(result.instruction, 'Classify user intent');
    assert.equal(result.saveWith, 'dev-cli draft update {name} --section intent');
  });

  test('sets pendingAction in state after llm next()', async () => {
    createSessionWithBlocks('llm-pending', LLM_BLOCKS);
    await next('llm-pending');

    const state = loadState('llm-pending');
    assert.ok(state.pendingAction, 'pendingAction should be set');
    assert.equal(state.pendingAction.block, 'classify-intent');
    assert.equal(state.pendingAction.action, 'llm');
    assert.equal(state.pendingAction.acknowledged, false);
  });
});

describe('next() — llm-loop block', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('returns correct JSON for llm-loop block type', async () => {
    createSessionWithBlocks('llm-loop-test', LLM_LOOP_BLOCKS);

    const result = await next('llm-loop-test');

    assert.equal(result.action, 'llm-loop');
    assert.equal(result.block, 'interview');
    assert.equal(result.instruction, 'Present exploration summary');
    assert.equal(result.saveWith, 'dev-cli draft update {name} --section decisions');
    assert.equal(result.exitCheck, 'dev-cli draft validate {name}');
  });
});

describe('next() — llm+cli block', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('returns correct JSON for llm+cli block type', async () => {
    createSessionWithBlocks('llm-plus-cli-test', LLM_PLUS_CLI_BLOCKS);

    const result = await next('llm-plus-cli-test');

    assert.equal(result.action, 'llm+cli');
    assert.equal(result.block, 'generate-plan');
    assert.equal(result.instruction, 'Write a structured plan as JSON');
    assert.equal(result.then, 'dev-cli plan import {name}');
  });
});

describe('next() — subagent block', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('returns correct JSON for subagent block type', async () => {
    createSessionWithBlocks('subagent-test', SUBAGENT_BLOCKS);

    const result = await next('subagent-test');

    assert.equal(result.action, 'dispatch-subagents');
    assert.equal(result.block, 'explore-full');
    assert.ok(Array.isArray(result.agents));
    assert.equal(result.agents.length, 1);
    assert.equal(result.parallel, true);
    assert.equal(result.onComplete, 'dev-cli draft import {name}');
  });
});

describe('next() — subagent-loop block', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('returns correct JSON for subagent-loop block type', async () => {
    createSessionWithBlocks('subagent-loop-test', SUBAGENT_LOOP_BLOCKS);

    const result = await next('subagent-loop-test');

    assert.equal(result.action, 'dispatch-subagents-loop');
    assert.equal(result.block, 'explore-loop');
    assert.ok(Array.isArray(result.agents));
    assert.equal(result.maxRounds, 3);
    assert.equal(result.exitWhen, 'dev-cli check done {name}');
  });
});

describe('next() — idempotency (unacknowledged pendingAction)', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('returns same pending instruction when pendingAction is unacknowledged', async () => {
    createSessionWithBlocks('idempotent-test', LLM_BLOCKS);

    // First call sets pendingAction
    const first = await next('idempotent-test');
    assert.equal(first.action, 'llm');

    // Second call without acknowledging should return pending response
    const second = await next('idempotent-test');
    assert.equal(second.action, 'pending');
    assert.equal(second.block, 'classify-intent');
    assert.ok(typeof second.message === 'string');
    assert.ok(second.message.includes('classify-intent'));
  });

  test('returns the original instruction in the pending response', async () => {
    createSessionWithBlocks('idempotent-instruction', LLM_BLOCKS);

    const first = await next('idempotent-instruction');
    assert.equal(first.instruction, 'Classify user intent');

    // The pending response should include instruction from pendingAction
    const second = await next('idempotent-instruction');
    assert.equal(second.action, 'pending');
    assert.ok(second.instruction !== undefined || second.message !== undefined);
  });

  test('after stepComplete, next() proceeds to next block', async () => {
    const blocks = [
      { id: 'step-1', type: 'llm', instruction: 'Do step 1' },
      { id: 'step-2', type: 'llm', instruction: 'Do step 2' },
    ];
    createSessionWithBlocks('two-step', blocks);

    // First next()
    const first = await next('two-step');
    assert.equal(first.action, 'llm');
    assert.equal(first.block, 'step-1');

    // stepComplete acknowledges and advances
    stepComplete('two-step', 'step-1', { result: 'done' });

    // Second next() should return step-2
    const second = await next('two-step');
    assert.equal(second.action, 'llm');
    assert.equal(second.block, 'step-2');
  });
});

describe('next() — cli block auto-advance', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('cli-only blocks auto-advance and return done', async () => {
    createSessionWithBlocks('cli-only', CLI_BLOCKS);

    const result = await next('cli-only');

    // CLI block auto-executes → all CLI blocks exhausted → done
    assert.equal(result.action, 'cli-chain');
    assert.equal(result.done, true);
    assert.ok(result.results);
    assert.ok(result.results['run-init']);
  });

  test('cli block followed by llm: returns cli-chain then llm response', async () => {
    createSessionWithBlocks('cli-then-llm', CLI_THEN_LLM_BLOCKS);

    const result = await next('cli-then-llm');

    // Should have executed cli and then returned the llm action
    assert.equal(result.action, 'llm');
    assert.equal(result.block, 'classify-intent');
    assert.ok(result.cliChain, 'should include cliChain results');
    assert.ok(result.cliChain['run-init']);
  });

  test('multiple cli blocks chain before llm', async () => {
    createSessionWithBlocks('multi-cli-then-llm', MULTI_CLI_THEN_LLM_BLOCKS);

    const result = await next('multi-cli-then-llm');

    assert.equal(result.action, 'llm');
    assert.equal(result.block, 'classify-intent');
    assert.ok(result.cliChain);
    assert.ok(result.cliChain['run-init']);
    assert.ok(result.cliChain['run-setup']);
  });

  test('all-cli recipe returns cli-chain with done:true', async () => {
    createSessionWithBlocks('all-cli', ALL_CLI_BLOCKS);

    const result = await next('all-cli');

    assert.equal(result.action, 'cli-chain');
    assert.equal(result.done, true);
    assert.ok(result.results['step-a']);
    assert.ok(result.results['step-b']);
  });
});

describe('next() — done state', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('returns { done: true } when no recipe is set', async () => {
    createState('no-recipe', { recipe: null });

    const result = await next('no-recipe');

    assert.deepEqual(result, { done: true });
  });

  test('returns { done: true } when all blocks are consumed', async () => {
    const blocks = [{ id: 'step-1', type: 'llm', instruction: 'Do step 1' }];
    createSessionWithBlocks('exhausted', blocks);

    // next() → pendingAction set
    await next('exhausted');
    // stepComplete → blockIndex advances to 1 (past end)
    stepComplete('exhausted', 'step-1', null);

    const result = await next('exhausted');
    assert.deepEqual(result, { done: true });
  });
});

describe('stepComplete()', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('acknowledges pendingAction and advances blockIndex', async () => {
    createSessionWithBlocks('step-complete-test', LLM_BLOCKS);

    await next('step-complete-test');

    const before = loadState('step-complete-test');
    assert.equal(before.pendingAction.acknowledged, false);
    assert.equal(before.blockIndex, 0);

    stepComplete('step-complete-test', 'classify-intent', { summary: 'intent: add auth' });

    const after = loadState('step-complete-test');
    assert.equal(after.pendingAction.acknowledged, true);
    assert.equal(after.blockIndex, 1);
  });

  test('stores result in steps[step]', async () => {
    createSessionWithBlocks('step-result', LLM_BLOCKS);

    await next('step-result');
    stepComplete('step-result', 'classify-intent', { output: 'some result' });

    const state = loadState('step-result');
    assert.ok(state.steps['classify-intent'], 'steps entry should exist');
    assert.equal(state.steps['classify-intent'].status, 'done');
    assert.deepEqual(state.steps['classify-intent'].result, { output: 'some result' });
  });

  test('logs block.complete event', async () => {
    createSessionWithBlocks('step-event', LLM_BLOCKS);

    await next('step-event');
    stepComplete('step-event', 'classify-intent', null);

    const state = loadState('step-event');
    const events = state.events.filter((e) => e.type === 'block.complete');
    assert.equal(events.length, 1);
    assert.equal(events[0].data.block, 'classify-intent');
  });
});

describe('stepInvalidate()', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('marks target step as stale', () => {
    const blocks = [
      { id: 'step-1', type: 'llm', instruction: 'Step 1' },
      { id: 'step-2', type: 'llm', instruction: 'Step 2' },
      { id: 'step-3', type: 'llm', instruction: 'Step 3' },
    ];
    createSessionWithBlocks('invalidate-test', blocks);
    updateState('invalidate-test', {
      steps: {
        'step-1': { status: 'done', at: new Date().toISOString() },
        'step-2': { status: 'done', at: new Date().toISOString() },
        'step-3': { status: 'done', at: new Date().toISOString() },
      },
    });

    stepInvalidate('invalidate-test', 'step-2');

    const state = loadState('invalidate-test');
    assert.equal(state.steps['step-1'].status, 'done', 'step-1 should remain done');
    assert.equal(state.steps['step-2'].status, 'stale', 'step-2 should be stale');
    assert.equal(state.steps['step-3'].status, 'stale', 'step-3 (downstream) should be stale');
  });

  test('marks first step and all downstream as stale', () => {
    const blocks = [
      { id: 'a', type: 'llm', instruction: 'A' },
      { id: 'b', type: 'llm', instruction: 'B' },
      { id: 'c', type: 'llm', instruction: 'C' },
    ];
    createSessionWithBlocks('invalidate-all', blocks);
    updateState('invalidate-all', {
      steps: {
        a: { status: 'done' },
        b: { status: 'done' },
        c: { status: 'done' },
      },
    });

    stepInvalidate('invalidate-all', 'a');

    const state = loadState('invalidate-all');
    assert.equal(state.steps.a.status, 'stale');
    assert.equal(state.steps.b.status, 'stale');
    assert.equal(state.steps.c.status, 'stale');
  });

  test('creates stale entry even if step was not previously recorded', () => {
    const blocks = [
      { id: 'step-x', type: 'llm', instruction: 'X' },
    ];
    createSessionWithBlocks('invalidate-new', blocks);
    // No steps recorded yet

    stepInvalidate('invalidate-new', 'step-x');

    const state = loadState('invalidate-new');
    assert.ok(state.steps['step-x']);
    assert.equal(state.steps['step-x'].status, 'stale');
  });

  test('logs block.invalidate event', () => {
    const blocks = [{ id: 'step-1', type: 'llm', instruction: 'Step 1' }];
    createSessionWithBlocks('invalidate-event', blocks);

    stepInvalidate('invalidate-event', 'step-1');

    const state = loadState('invalidate-event');
    const events = state.events.filter((e) => e.type === 'block.invalidate');
    assert.equal(events.length, 1);
    assert.equal(events[0].data.block, 'step-1');
  });
});
