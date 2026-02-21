/**
 * specify-flow.test.js — Integration tests for the specify recipe flow
 *
 * Tests end-to-end sequencer behavior when driven by a real recipe file.
 * Uses temp directories for test isolation (same pattern as sequencer.test.js).
 *
 * Uses node:test and node:assert (no external test frameworks).
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadRecipe } from '../../src/core/recipe-loader.js';
import { next, stepComplete } from '../../src/core/sequencer.js';
import { createState, loadState, updateState } from '../../src/core/state.js';
import { initSpec } from '../../src/blocks/init.js';

// ---------------------------------------------------------------------------
// Temp dir management
// ---------------------------------------------------------------------------

let tmpDir;
const originalCwd = process.cwd;

function useTmpDir() {
  tmpDir = mkdtempSync(join(tmpdir(), 'dev-cli-flow-test-'));
  process.cwd = () => tmpDir;
}

function restoreCwd() {
  process.cwd = originalCwd;
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Helper: create session with recipe reference
// ---------------------------------------------------------------------------

function createSessionWithRecipe(sessionName, recipeName) {
  createState(sessionName, { recipe: recipeName });
  return loadState(sessionName);
}

// ---------------------------------------------------------------------------
// Tests: Recipe loading
// ---------------------------------------------------------------------------

describe('loadRecipe() — integration with real recipe files', () => {
  test('loads specify-standard-interactive with template vars', () => {
    const recipe = loadRecipe('specify-standard-interactive', { name: 'add-oauth' });
    assert.equal(recipe.name, 'specify-standard-interactive');
    assert.equal(recipe.blocks.length, 11);
    assert.equal(recipe.blocks[0].id, 'init');
    // Verify template substitution in a command field
    const initBlock = recipe.blocks[0];
    assert.ok(initBlock.command.includes('add-oauth'));
  });

  test('loads specify-quick-autopilot with template vars', () => {
    const recipe = loadRecipe('specify-quick-autopilot', { name: 'fix-bug-42' });
    assert.equal(recipe.name, 'specify-quick-autopilot');
    assert.equal(recipe.blocks.length, 9);
    assert.equal(recipe.blocks[0].id, 'init');
    assert.equal(recipe.blocks[recipe.blocks.length - 1].id, 'cleanup');
  });
});

// ---------------------------------------------------------------------------
// Tests: initSpec() + sequencer integration
// ---------------------------------------------------------------------------

describe('initSpec() creates state that sequencer can use', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('initSpec creates state.json with correct initial state', () => {
    const { state } = initSpec('my-session', { depth: 'standard', interaction: 'interactive' });

    assert.equal(state.name, 'my-session');
    assert.equal(state.mode.depth, 'standard');
    assert.equal(state.mode.interaction, 'interactive');
    assert.equal(state.blockIndex, 0);
    assert.equal(state.phase, 'init');
  });

  test('state created by initSpec is loadable by loadState', () => {
    initSpec('loadable-session', { depth: 'quick', interaction: 'autopilot' });
    const loaded = loadState('loadable-session');
    assert.equal(loaded.name, 'loadable-session');
    assert.equal(loaded.mode.depth, 'quick');
  });
});

// ---------------------------------------------------------------------------
// Tests: Sequencer with real recipe reference
// ---------------------------------------------------------------------------

describe('next() — sequencer drives through recipe blocks', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('next() on standard-interactive returns correct first non-cli instruction', async () => {
    // init block is cli and auto-advances; classify-intent is first llm block
    createSessionWithRecipe('std-interactive', 'specify-standard-interactive');

    const result = await next('std-interactive');

    // init is cli → auto-advances; first pending should be classify-intent (llm)
    assert.equal(result.action, 'llm');
    assert.equal(result.block, 'classify-intent');
    assert.ok(result.instruction, 'instruction should be set');
    assert.ok(result.cliChain, 'cliChain results should be present for auto-advanced cli blocks');
    assert.ok(result.cliChain['init'], 'init cli block should be in cliChain');
  });

  test('next() on quick-autopilot returns correct first non-cli instruction', async () => {
    // init → cli (auto-advance); classify-intent → llm (first pending)
    createSessionWithRecipe('quick-auto', 'specify-quick-autopilot');

    const result = await next('quick-auto');

    assert.equal(result.action, 'llm');
    assert.equal(result.block, 'classify-intent');
    assert.ok(result.cliChain);
    assert.ok(result.cliChain['init']);
  });

  test('stepComplete() advances from classify-intent to explore block', async () => {
    createSessionWithRecipe('seq-advance', 'specify-standard-interactive');

    // First next() triggers init (cli, auto) + classify-intent (llm)
    const first = await next('seq-advance');
    assert.equal(first.block, 'classify-intent');

    // Complete classify-intent
    stepComplete('seq-advance', 'classify-intent', { intent: 'Feature' });

    // Next block: explore-full (subagent)
    const second = await next('seq-advance');
    assert.equal(second.action, 'dispatch-subagents');
    assert.equal(second.block, 'explore-full');
    assert.ok(Array.isArray(second.agents));
    assert.equal(second.agents.length, 4);
    assert.equal(second.parallel, true);
  });

  test('state.blockIndex advances correctly after stepComplete', async () => {
    createSessionWithRecipe('blockindex-test', 'specify-quick-autopilot');

    // next() auto-advances init (cli) → blockIndex=1, sets pendingAction for classify-intent
    await next('blockindex-test');
    const afterFirst = loadState('blockindex-test');
    assert.equal(afterFirst.blockIndex, 1);

    // stepComplete advances blockIndex to 2
    stepComplete('blockindex-test', 'classify-intent', null);
    const afterComplete = loadState('blockindex-test');
    assert.equal(afterComplete.blockIndex, 2);
  });

  test('next() idempotency: returns pending if called again before stepComplete', async () => {
    createSessionWithRecipe('idempotent-flow', 'specify-quick-interactive');

    // First call: init auto-advances → classify-intent pending
    const first = await next('idempotent-flow');
    assert.equal(first.action, 'llm');
    assert.equal(first.block, 'classify-intent');

    // Second call without stepComplete: should return pending response
    const second = await next('idempotent-flow');
    assert.equal(second.action, 'pending');
    assert.equal(second.block, 'classify-intent');
    assert.ok(second.message.includes('classify-intent'));
  });
});

// ---------------------------------------------------------------------------
// Tests: Full mini-flow through quick-autopilot
// ---------------------------------------------------------------------------

describe('Full mini-flow — specify-quick-autopilot sequence', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('drives through classify-intent → explore-lite → auto-assume(cli) → analyze-lite', async () => {
    createSessionWithRecipe('full-flow', 'specify-quick-autopilot');

    // Step 1: init (cli auto-advance) → classify-intent (llm)
    const step1 = await next('full-flow');
    assert.equal(step1.action, 'llm');
    assert.equal(step1.block, 'classify-intent');

    // Complete classify-intent
    stepComplete('full-flow', 'classify-intent', { intent: 'Bug' });

    // Step 2: explore-lite (subagent, 2 agents)
    const step2 = await next('full-flow');
    assert.equal(step2.action, 'dispatch-subagents');
    assert.equal(step2.block, 'explore-lite');
    assert.equal(step2.agents.length, 2);

    // Complete explore-lite
    stepComplete('full-flow', 'explore-lite', null);

    // Step 3: auto-assume (cli auto-advance) → analyze-lite (subagent)
    const step3 = await next('full-flow');
    // auto-assume is cli → auto-advances; analyze-lite is subagent
    assert.equal(step3.action, 'dispatch-subagents');
    assert.equal(step3.block, 'analyze-lite');
    assert.ok(step3.cliChain, 'cliChain should include auto-assume');
    assert.ok(step3.cliChain['auto-assume'], 'auto-assume should be in cliChain');
    assert.equal(step3.agents.length, 1);
    assert.equal(step3.agents[0].type, 'tradeoff-analyzer');

    // Complete analyze-lite
    stepComplete('full-flow', 'analyze-lite', null);

    // Step 4: generate-plan (llm+cli)
    const step4 = await next('full-flow');
    assert.equal(step4.action, 'llm+cli');
    assert.equal(step4.block, 'generate-plan');

    // Complete generate-plan
    stepComplete('full-flow', 'generate-plan', null);

    // Step 5: review-once (subagent)
    const step5 = await next('full-flow');
    assert.equal(step5.action, 'dispatch-subagents');
    assert.equal(step5.block, 'review-once');

    // Complete review-once
    stepComplete('full-flow', 'review-once', null);

    // Step 6: summary + cleanup (cli auto-advance) → done
    const step6 = await next('full-flow');
    assert.equal(step6.action, 'cli-chain');
    assert.equal(step6.done, true);
    assert.ok(step6.results['summary'], 'summary should be in cli-chain results');
    assert.ok(step6.results['cleanup'], 'cleanup should be in cli-chain results');
  });
});

// ---------------------------------------------------------------------------
// Tests: Full mini-flow through standard-interactive (first 3 non-cli steps)
// ---------------------------------------------------------------------------

describe('Partial flow — specify-standard-interactive first few steps', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('drives through init → classify-intent → explore-full → interview', async () => {
    createSessionWithRecipe('partial-std', 'specify-standard-interactive');

    // Step 1: init (cli auto) → classify-intent (llm)
    const step1 = await next('partial-std');
    assert.equal(step1.action, 'llm');
    assert.equal(step1.block, 'classify-intent');
    stepComplete('partial-std', 'classify-intent', { intent: 'Feature' });

    // Step 2: explore-full (subagent, 4 agents)
    const step2 = await next('partial-std');
    assert.equal(step2.action, 'dispatch-subagents');
    assert.equal(step2.block, 'explore-full');
    assert.equal(step2.agents.length, 4);
    assert.equal(step2.parallel, true);
    stepComplete('partial-std', 'explore-full', null);

    // Step 3: interview (llm-loop)
    const step3 = await next('partial-std');
    assert.equal(step3.action, 'llm-loop');
    assert.equal(step3.block, 'interview');
    assert.ok(step3.instruction, 'interview instruction should be set');
    assert.ok(step3.exitCheck, 'interview exitCheck should be set');
    stepComplete('partial-std', 'interview', null);

    // Step 4: decision-confirm (llm)
    const step4 = await next('partial-std');
    assert.equal(step4.action, 'llm');
    assert.equal(step4.block, 'decision-confirm');
  });
});

// ---------------------------------------------------------------------------
// Tests: initSpec() + recipe reference combination
// ---------------------------------------------------------------------------

describe('initSpec() + recipe reference integration', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('session created by initSpec can be updated with recipe reference and sequenced', async () => {
    // Create session using initSpec
    const { state } = initSpec('init-recipe-combo', {
      depth: 'quick',
      interaction: 'autopilot',
    });

    // Attach recipe to the state
    updateState('init-recipe-combo', { recipe: 'specify-quick-autopilot' });

    // Verify next() drives through the recipe
    const result = await next('init-recipe-combo');

    // blockIndex starts at 0, init is cli → auto-advance; classify-intent is next
    assert.equal(result.action, 'llm');
    assert.equal(result.block, 'classify-intent');
  });

  test('state.mode fields set by initSpec persist after recipe attachment', async () => {
    initSpec('mode-persist', { depth: 'standard', interaction: 'interactive' });
    updateState('mode-persist', { recipe: 'specify-standard-interactive' });

    const state = loadState('mode-persist');
    assert.equal(state.mode.depth, 'standard');
    assert.equal(state.mode.interaction, 'interactive');
    assert.equal(state.recipe, 'specify-standard-interactive');
  });
});
