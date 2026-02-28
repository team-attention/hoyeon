/**
 * state.test.js — Unit tests for dev-cli/src/core/state.js
 * Uses node:test and node:assert (no external test frameworks).
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// We need to control statePath() by changing process.cwd().
// We'll save/restore cwd and use a temp dir for each test.
// ---------------------------------------------------------------------------

let tmpDir;
const originalCwd = process.cwd;

function useTmpDir() {
  tmpDir = mkdtempSync(join(tmpdir(), 'dev-cli-state-test-'));
  // Override process.cwd to return our temp dir
  process.cwd = () => tmpDir;
}

function restoreCwd() {
  process.cwd = originalCwd;
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// Import state module — paths are resolved at import time, but statePath()
// calls process.cwd() at call time, so overriding process.cwd works.
import {
  createState,
  loadState,
  updateState,
  advanceBlock,
  setPendingAction,
  acknowledgePendingAction,
  hasPendingAction,
  appendEvent,
  statePath,
} from '../../src/core/state.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readStateFile(name) {
  const p = statePath(name);
  return JSON.parse(readFileSync(p, 'utf8'));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createState()', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('creates a valid state.json at .dev/specs/{name}/state.json', () => {
    const state = createState('my-feature', { depth: 'standard', interaction: 'interactive' });

    assert.equal(state.schemaVersion, 1);
    assert.equal(state.name, 'my-feature');
    assert.equal(state.mode.depth, 'standard');
    assert.equal(state.mode.interaction, 'interactive');
    assert.equal(state.phase, 'init');
    assert.equal(state.blockIndex, 0);
    assert.equal(state.pendingAction, null);
    assert.ok(state.createdAt);
    assert.ok(state.updatedAt);
    assert.ok(Array.isArray(state.events));
    assert.equal(state.events.length, 1);
    assert.equal(state.events[0].type, 'init');

    // File must exist
    const p = statePath('my-feature');
    assert.ok(existsSync(p), `Expected state file at ${p}`);
  });

  test('throws if state already exists', () => {
    createState('dup-session', {});
    assert.throws(
      () => createState('dup-session', {}),
      /already exists/,
    );
  });

  test('sets recipe and skill when provided', () => {
    const state = createState('with-opts', {
      recipe: 'specify-standard-interactive',
      skill: 'specify',
      depth: 'quick',
      interaction: 'autopilot',
    });
    assert.equal(state.recipe, 'specify-standard-interactive');
    assert.equal(state.skill, 'specify');
    assert.equal(state.mode.depth, 'quick');
    assert.equal(state.mode.interaction, 'autopilot');
  });

  test('includes recipeSteps when opts.recipeSteps is provided', () => {
    const steps = ['classify', 'explore', 'interview', 'plan'];
    const state = createState('with-recipe-steps', {
      recipe: 'specify-standard-interactive',
      recipeSteps: steps,
    });
    assert.ok(Array.isArray(state.recipeSteps), 'recipeSteps should be an array');
    assert.deepEqual(state.recipeSteps, steps);
  });

  test('defaults recipeSteps to empty array when not provided', () => {
    const state = createState('no-recipe-steps', {
      recipe: 'specify-standard-interactive',
    });
    assert.ok(Array.isArray(state.recipeSteps), 'recipeSteps should be an array');
    assert.equal(state.recipeSteps.length, 0, 'recipeSteps should default to empty array');
  });
});

describe('loadState()', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('reads back the state written by createState', () => {
    createState('load-test', { depth: 'standard', interaction: 'interactive' });
    const loaded = loadState('load-test');
    assert.equal(loaded.name, 'load-test');
    assert.equal(loaded.schemaVersion, 1);
  });

  test('throws if session does not exist', () => {
    assert.throws(
      () => loadState('nonexistent'),
      /No state found/,
    );
  });

  test('preserves all required schema fields', () => {
    createState('schema-check', { recipe: 'r', skill: 's' });
    const loaded = loadState('schema-check');

    const requiredFields = [
      'schemaVersion', 'name', 'recipe', 'mode', 'skill',
      'phase', 'currentBlock', 'blockIndex', 'pendingAction',
      'steps', 'agents', 'reviewRounds', 'events', 'lastError',
      'createdAt', 'updatedAt',
    ];
    for (const field of requiredFields) {
      assert.ok(Object.prototype.hasOwnProperty.call(loaded, field), `Missing field: ${field}`);
    }
  });
});

describe('updateState()', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('merges patch into existing state', () => {
    createState('update-test', {});
    const updated = updateState('update-test', { phase: 'interview', reviewRounds: 2 });

    assert.equal(updated.phase, 'interview');
    assert.equal(updated.reviewRounds, 2);
    // Original fields preserved
    assert.equal(updated.schemaVersion, 1);
    assert.equal(updated.name, 'update-test');
  });

  test('updates updatedAt on every write', async () => {
    createState('timestamps', {});
    const first = loadState('timestamps');
    // Small delay to ensure timestamp difference
    await new Promise((r) => setTimeout(r, 10));
    const second = updateState('timestamps', { phase: 'x' });
    assert.ok(
      new Date(second.updatedAt) >= new Date(first.updatedAt),
      'updatedAt should advance',
    );
  });

  test('writes atomically (tmp file + rename pattern)', () => {
    createState('atomic-test', {});
    const stateDir = join(tmpDir, '.dev', 'specs', 'atomic-test');

    updateState('atomic-test', { phase: 'review' });

    // After update, only state.json should exist (no leftover .tmp files)
    const files = readdirSync(stateDir);
    const tmpFiles = files.filter((f) => f.endsWith('.tmp'));
    assert.equal(tmpFiles.length, 0, `Found leftover tmp files: ${tmpFiles.join(', ')}`);

    // And state.json should have the updated value
    const loaded = loadState('atomic-test');
    assert.equal(loaded.phase, 'review');
  });
});

describe('advanceBlock()', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('increments blockIndex by 1', () => {
    createState('advance-test', {});
    const state = loadState('advance-test');
    assert.equal(state.blockIndex, 0);

    const updated = advanceBlock('advance-test');
    assert.equal(updated.blockIndex, 1);
  });

  test('increments multiple times correctly', () => {
    createState('multi-advance', {});
    advanceBlock('multi-advance');
    advanceBlock('multi-advance');
    const third = advanceBlock('multi-advance');
    assert.equal(third.blockIndex, 3);
  });

  test('advanceBlock increments blockIndex without recipeBlocks (removed legacy)', () => {
    createState('recipe-advance', {});
    updateState('recipe-advance', {
      currentBlock: 'init',
      phase: 'init',
    });

    const updated = advanceBlock('recipe-advance');
    assert.equal(updated.blockIndex, 1);
  });
});

describe('pendingAction management', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('setPendingAction sets action with acknowledged=false', () => {
    createState('pending-test', {});
    setPendingAction('pending-test', {
      block: 'interview',
      action: 'llm-loop',
      instruction: 'Ask about trade-offs',
    });

    const state = loadState('pending-test');
    assert.ok(state.pendingAction);
    assert.equal(state.pendingAction.block, 'interview');
    assert.equal(state.pendingAction.action, 'llm-loop');
    assert.equal(state.pendingAction.instruction, 'Ask about trade-offs');
    assert.equal(state.pendingAction.acknowledged, false);
    assert.ok(state.pendingAction.issuedAt);
  });

  test('hasPendingAction returns true when unacknowledged action exists', () => {
    createState('has-pending', {});
    assert.equal(hasPendingAction('has-pending'), false);

    setPendingAction('has-pending', {
      block: 'b',
      action: 'a',
      instruction: 'i',
    });
    assert.equal(hasPendingAction('has-pending'), true);
  });

  test('acknowledgePendingAction marks action as acknowledged', () => {
    createState('ack-test', {});
    setPendingAction('ack-test', { block: 'b', action: 'a', instruction: 'i' });

    assert.equal(hasPendingAction('ack-test'), true);
    acknowledgePendingAction('ack-test');
    assert.equal(hasPendingAction('ack-test'), false);

    const state = loadState('ack-test');
    assert.equal(state.pendingAction.acknowledged, true);
  });

  test('acknowledgePendingAction throws if no pending action', () => {
    createState('no-pending', {});
    assert.throws(
      () => acknowledgePendingAction('no-pending'),
      /No pending action/,
    );
  });
});

describe('concurrent writes basic safety', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('sequential updates do not corrupt state', async () => {
    createState('concurrent-test', {});

    // Simulate rapid sequential updates
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        new Promise((resolve) => {
          setImmediate(() => {
            try {
              updateState('concurrent-test', { reviewRounds: i });
              resolve(null);
            } catch (err) {
              resolve(err);
            }
          });
        }),
      );
    }

    const results = await Promise.all(promises);
    const errors = results.filter((r) => r instanceof Error);
    assert.equal(errors.length, 0, `Got unexpected errors: ${errors.map((e) => e.message).join(', ')}`);

    // State should be parseable (not corrupted)
    const final = loadState('concurrent-test');
    assert.equal(final.schemaVersion, 1);
    assert.equal(final.name, 'concurrent-test');
    assert.ok(typeof final.reviewRounds === 'number');
  });
});
