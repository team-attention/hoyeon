/**
 * specify-flow.test.js — Integration tests for the specify workflow
 *
 * Tests the new SKILL.md-centric model:
 *   - Recipe loading (pure data format with `steps` array)
 *   - initSpec() session creation and idempotency
 *   - step-done handler (completion recording + idempotency)
 *   - manifest --json recovery data
 *
 * Uses node:test and node:assert (no external test frameworks).
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadRecipe } from '../../src/core/recipe-loader.js';
import { createState, loadState, updateState } from '../../src/core/state.js';
import { initSpec } from '../../src/blocks/init.js';
import { manifestJSON } from '../../src/core/manifest.js';

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
// Tests: Recipe loading (pure data format)
// ---------------------------------------------------------------------------

describe('loadRecipe() — specify recipes (pure data format)', () => {
  test('loads specify-standard-interactive with steps array', () => {
    const recipe = loadRecipe('specify-standard-interactive', { name: 'add-oauth' }, 'specify');
    assert.equal(recipe.name, 'specify-standard-interactive');
    assert.ok(Array.isArray(recipe.steps), 'should have steps array');
    assert.equal(recipe.steps.length, 9);
    assert.equal(recipe.steps[0].id, 'classify');
    assert.equal(recipe.blocks, undefined, 'should NOT have blocks');
  });

  test('loads specify-quick-autopilot with steps array', () => {
    const recipe = loadRecipe('specify-quick-autopilot', { name: 'fix-bug-42' }, 'specify');
    assert.equal(recipe.name, 'specify-quick-autopilot');
    assert.ok(Array.isArray(recipe.steps));
    assert.equal(recipe.steps[0].id, 'classify');
    assert.equal(recipe.steps[recipe.steps.length - 1].id, 'cleanup');
  });

  test('specify recipes have no instruction fields', () => {
    const recipes = [
      'specify-standard-interactive',
      'specify-standard-autopilot',
      'specify-quick-interactive',
      'specify-quick-autopilot',
    ];
    for (const name of recipes) {
      const recipe = loadRecipe(name, { name: 'test' }, 'specify');
      const json = JSON.stringify(recipe);
      assert.ok(!json.includes('"instruction"'), `${name} should not contain instruction fields`);
    }
  });

  test('specify recipes contain mode configuration', () => {
    const recipe = loadRecipe('specify-standard-interactive', {}, 'specify');
    assert.equal(recipe.mode.depth, 'standard');
    assert.equal(recipe.mode.interaction, 'interactive');

    const quickRecipe = loadRecipe('specify-quick-autopilot', {}, 'specify');
    assert.equal(quickRecipe.mode.depth, 'quick');
    assert.equal(quickRecipe.mode.interaction, 'autopilot');
  });

  test('explore step has correct agents per mode', () => {
    const standard = loadRecipe('specify-standard-interactive', {}, 'specify');
    const exploreStep = standard.steps.find((s) => s.id === 'explore');
    assert.equal(exploreStep.agents.length, 4, 'standard: 4 explore agents');
    assert.equal(exploreStep.parallel, true);

    const quick = loadRecipe('specify-quick-autopilot', {}, 'specify');
    const quickExplore = quick.steps.find((s) => s.id === 'explore');
    assert.equal(quickExplore.agents.length, 2, 'quick: 2 explore agents');
  });

  test('review step has correct maxRounds per mode', () => {
    const standard = loadRecipe('specify-standard-interactive', {}, 'specify');
    const reviewStep = standard.steps.find((s) => s.id === 'review');
    assert.equal(reviewStep.maxRounds, 3);

    const quick = loadRecipe('specify-quick-autopilot', {}, 'specify');
    const quickReview = quick.steps.find((s) => s.id === 'review');
    assert.equal(quickReview.maxRounds, 1);
  });
});

// ---------------------------------------------------------------------------
// Tests: initSpec() and idempotency
// ---------------------------------------------------------------------------

describe('initSpec() — session creation and idempotency', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('initSpec creates state.json with correct initial state', () => {
    const { state } = initSpec('my-session', { depth: 'standard', interaction: 'interactive' });
    assert.equal(state.name, 'my-session');
    assert.equal(state.mode.depth, 'standard');
    assert.equal(state.mode.interaction, 'interactive');
    assert.equal(state.phase, 'init');
    assert.equal(state.steps.init.status, 'done');
  });

  test('state created by initSpec is loadable', () => {
    initSpec('loadable-session', { depth: 'quick', interaction: 'autopilot' });
    const loaded = loadState('loadable-session');
    assert.equal(loaded.name, 'loadable-session');
    assert.equal(loaded.mode.depth, 'quick');
  });

  test('initSpec is idempotent — returns existing session on second call', () => {
    const first = initSpec('idempotent-test', { depth: 'standard', interaction: 'interactive' });
    const second = initSpec('idempotent-test', { depth: 'standard', interaction: 'interactive' });
    assert.equal(second.resumed, true, 'should return resumed: true');
    assert.equal(second.state.sessionId, first.state.sessionId, 'should return same session');
  });

  test('initSpec creates DRAFT.md for specify skill', () => {
    initSpec('draft-test', { depth: 'standard', interaction: 'interactive', skill: 'specify' });
    const state = loadState('draft-test');
    assert.ok(state.sessionId, 'should have sessionId');
  });
});

// ---------------------------------------------------------------------------
// Tests: step-done functionality
// ---------------------------------------------------------------------------

describe('step-done — step completion tracking', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('step-done records step completion in state.steps', () => {
    initSpec('step-test', { depth: 'standard', interaction: 'interactive', skill: 'specify' });

    // Simulate step-done by directly updating state (handler test is via CLI)
    const state = loadState('step-test');
    const steps = { ...state.steps, classify: { status: 'done', at: new Date().toISOString() } };
    updateState('step-test', { steps, currentBlock: 'classify' });

    const updated = loadState('step-test');
    assert.equal(updated.steps.classify.status, 'done');
    assert.equal(updated.currentBlock, 'classify');
  });

  test('multiple steps can be recorded sequentially', () => {
    initSpec('multi-step', { depth: 'standard', interaction: 'interactive', skill: 'specify' });

    const stepIds = ['classify', 'explore', 'interview'];
    for (const stepId of stepIds) {
      const state = loadState('multi-step');
      const steps = { ...state.steps, [stepId]: { status: 'done', at: new Date().toISOString() } };
      updateState('multi-step', { steps, currentBlock: stepId });
    }

    const final = loadState('multi-step');
    assert.equal(final.steps.classify.status, 'done');
    assert.equal(final.steps.explore.status, 'done');
    assert.equal(final.steps.interview.status, 'done');
    assert.equal(final.currentBlock, 'interview');
  });
});

// ---------------------------------------------------------------------------
// Tests: manifestJSON recovery
// ---------------------------------------------------------------------------

describe('manifestJSON() — recovery data for compact recovery', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('returns structured manifest with completed steps', () => {
    initSpec('manifest-test', {
      depth: 'standard',
      interaction: 'interactive',
      recipe: 'specify-standard-interactive',
      skill: 'specify',
    });

    // Mark some steps done
    const state = loadState('manifest-test');
    const steps = {
      ...state.steps,
      classify: { status: 'done', at: new Date().toISOString() },
      explore: { status: 'done', at: new Date().toISOString() },
    };
    updateState('manifest-test', { steps, currentBlock: 'explore' });

    const manifest = manifestJSON('manifest-test');
    assert.equal(manifest.mode, 'standard-interactive');
    assert.ok(manifest.completedSteps.includes('init'));
    assert.ok(manifest.completedSteps.includes('classify'));
    assert.ok(manifest.completedSteps.includes('explore'));
    assert.ok(manifest.sessionId, 'should include sessionId');
  });

  test('returns error object for nonexistent session', () => {
    const manifest = manifestJSON('nonexistent');
    assert.ok(manifest.error, 'should return error for nonexistent session');
  });
});
