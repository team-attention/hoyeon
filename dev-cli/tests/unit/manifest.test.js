/**
 * manifest.test.js — Unit tests for dev-cli/src/core/manifest.js
 * Uses node:test and node:assert (no external test frameworks).
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createState, updateState, statePath } from '../../src/core/state.js';
import { manifest, manifestJSON } from '../../src/core/manifest.js';

// ---------------------------------------------------------------------------
// Temp dir management
// ---------------------------------------------------------------------------

let tmpDir;
const originalCwd = process.cwd;

function useTmpDir() {
  tmpDir = mkdtempSync(join(tmpdir(), 'dev-cli-manifest-test-'));
  process.cwd = () => tmpDir;
}

function restoreCwd() {
  process.cwd = originalCwd;
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sessionDir(name) {
  // Mirrors sessionDir in manifest.js
  return join(tmpDir, '.dev', 'specs', name);
}

function writeDraftMd(name, content) {
  const dir = sessionDir(name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'DRAFT.md'), content, 'utf8');
}

function writePlanMd(name, content) {
  const dir = sessionDir(name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'PLAN.md'), content, 'utf8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('manifest() — basic output', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('returns human-readable string (not JSON)', () => {
    createState('basic-manifest', {});

    const result = manifest('basic-manifest');

    assert.equal(typeof result, 'string', 'manifest should return a string');
    // Should not be parseable as JSON object
    assert.throws(() => JSON.parse(result));
  });

  test('includes current step and mode', () => {
    createState('step-mode', { depth: 'quick', interaction: 'autopilot' });
    updateState('step-mode', { currentBlock: 'interview', phase: 'interview' });

    const result = manifest('step-mode');

    assert.ok(result.includes('interview'), `Expected 'interview' in: ${result}`);
    assert.ok(result.includes('quick/autopilot'), `Expected 'quick/autopilot' in: ${result}`);
  });

  test('includes "Next:" action hint', () => {
    createState('next-action', {});

    const result = manifest('next-action');

    assert.ok(result.includes('Next:'), `Expected 'Next:' in: ${result}`);
  });

  test('handles missing state gracefully', () => {
    // Don't createState — session does not exist
    const result = manifest('nonexistent-session');

    assert.ok(typeof result === 'string');
    assert.ok(result.includes('nonexistent-session'));
  });
});

describe('manifest() — interview phase', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('shows DRAFT fill status when DRAFT.md exists', () => {
    createState('interview-draft', { depth: 'standard', interaction: 'interactive' });
    updateState('interview-draft', { currentBlock: 'interview', phase: 'interview' });

    writeDraftMd('interview-draft', `# Draft

## intent
User wants to add authentication.

## boundaries
<!-- TODO -->

## criteria
<!-- TODO -->

## decisions
JWT tokens will be used.
`);

    const result = manifest('interview-draft');

    assert.ok(result.includes('DRAFT:'), `Expected 'DRAFT:' in: ${result}`);
    // 2 filled (intent, decisions), 2 missing (boundaries, criteria) out of 4 total
    assert.ok(result.includes('2/4'), `Expected '2/4' in: ${result}`);
  });

  test('lists missing fields from DRAFT.md', () => {
    createState('missing-fields', {});
    updateState('missing-fields', { currentBlock: 'interview', phase: 'interview' });

    writeDraftMd('missing-fields', `## intent
Classified.

## boundaries
<!-- TODO -->

## criteria
TBD
`);

    const result = manifest('missing-fields');

    assert.ok(result.includes('missing:'), `Expected 'missing:' in: ${result}`);
    assert.ok(result.includes('boundaries') || result.includes('criteria'),
      `Expected missing field names in: ${result}`);
  });

  test('includes next action hint about missing fields', () => {
    createState('next-hint', {});
    updateState('next-hint', { currentBlock: 'interview', phase: 'interview' });

    writeDraftMd('next-hint', `## intent
Classified.

## boundaries
<!-- TODO -->
`);

    const result = manifest('next-hint');

    // Next hint should mention continuing interview or asking about missing fields
    assert.ok(result.includes('Next:'), `Expected 'Next:' in: ${result}`);
    assert.ok(
      result.includes('boundaries') || result.includes('Continue interview'),
      `Expected mention of missing boundaries in: ${result}`
    );
  });
});

describe('manifest() — plan phase', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('shows PLAN TODO progress when PLAN.md exists', () => {
    createState('plan-phase', { depth: 'standard', interaction: 'interactive' });
    updateState('plan-phase', { currentBlock: 'review-plan', phase: 'planning' });

    writePlanMd('plan-phase', `# Plan

## Tasks

- [x] Set up auth middleware
- [x] Create user model
- [ ] Write tests
- [ ] Deploy
`);

    const result = manifest('plan-phase');

    assert.ok(result.includes('PLAN:'), `Expected 'PLAN:' in: ${result}`);
    assert.ok(result.includes('2/4'), `Expected '2/4 TODOs' in: ${result}`);
  });

  test('shows mode for plan phase', () => {
    createState('plan-mode', { depth: 'quick', interaction: 'autopilot' });
    updateState('plan-mode', { currentBlock: 'build-plan', phase: 'planning' });

    const result = manifest('plan-mode');

    assert.ok(result.includes('quick/autopilot'), `Expected mode in: ${result}`);
  });
});

describe('manifest() — pending action', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('shows resume hint when pendingAction is unacknowledged', () => {
    createState('pending-manifest', {});
    updateState('pending-manifest', {
      currentBlock: 'interview',
      phase: 'interview',
      pendingAction: {
        block: 'interview',
        action: 'llm-loop',
        instruction: 'Ask follow-up questions',
        issuedAt: new Date().toISOString(),
        acknowledged: false,
      },
    });

    const result = manifest('pending-manifest');

    assert.ok(result.includes('Next:'), `Expected 'Next:' in: ${result}`);
    assert.ok(
      result.includes('Resume') || result.includes('pending'),
      `Expected resume/pending hint in: ${result}`
    );
  });
});

describe('manifest() — decisions', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('shows decisions when state.decisions is populated', () => {
    createState('with-decisions', {});
    updateState('with-decisions', {
      decisions: {
        Auth: 'JWT',
        Routes: '/api/users/*',
      },
    });

    const result = manifest('with-decisions');

    assert.ok(result.includes('Decisions'), `Expected 'Decisions' in: ${result}`);
    assert.ok(result.includes('Auth=JWT'), `Expected 'Auth=JWT' in: ${result}`);
    assert.ok(result.includes('Routes=/api/users/*'), `Expected 'Routes=' in: ${result}`);
  });

  test('shows no decisions line when no decisions recorded', () => {
    createState('no-decisions', {});

    const result = manifest('no-decisions');

    // Should not have a Decisions line
    assert.ok(!result.includes('Decisions so far:'), `Unexpected 'Decisions so far:' in: ${result}`);
  });
});

describe('manifest() — agent status', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('shows agent progress when agents are tracked', () => {
    createState('with-agents', {});
    updateState('with-agents', {
      agents: {
        'explore-1': { type: 'Explore', status: 'done' },
        'explore-2': { type: 'Explore', status: 'done' },
        'explore-3': { type: 'Explore', status: 'running' },
        'explore-4': { type: 'Explore', status: 'running' },
      },
    });

    const result = manifest('with-agents');

    assert.ok(result.includes('Agents:'), `Expected 'Agents:' in: ${result}`);
    assert.ok(result.includes('2/4'), `Expected '2/4' in: ${result}`);
    assert.ok(result.includes('Explore'), `Expected 'Explore' in: ${result}`);
  });

  test('omits agents line when no agents tracked', () => {
    createState('no-agents', {});

    const result = manifest('no-agents');

    assert.ok(!result.includes('Agents:'), `Unexpected 'Agents:' in: ${result}`);
  });
});

describe('manifest() — output format matches RFC example', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('produces RFC-like compact summary', () => {
    createState('rfc-example', { depth: 'standard', interaction: 'interactive' });
    updateState('rfc-example', {
      currentBlock: 'interview',
      phase: 'interview',
      decisions: { Auth: 'JWT', Routes: '/api/users/*' },
      agents: {
        'explore-1': { type: 'explore', status: 'done' },
        'explore-2': { type: 'explore', status: 'done' },
        'explore-3': { type: 'explore', status: 'done' },
        'explore-4': { type: 'explore', status: 'done' },
        'analysis-1': { type: 'analysis', status: 'pending' },
        'analysis-2': { type: 'analysis', status: 'pending' },
        'analysis-3': { type: 'analysis', status: 'pending' },
        'analysis-4': { type: 'analysis', status: 'pending' },
      },
    });

    writeDraftMd('rfc-example', `## intent
Classified.

## boundaries
<!-- TODO -->

## criteria
<!-- TODO -->

## decisions
JWT.

## tech-stack
Node.js + Express.
`);

    const result = manifest('rfc-example');

    // Should match format: "Step: interview | Mode: standard/interactive | DRAFT: N/M filled"
    assert.ok(result.includes('Step: interview'), `Expected 'Step: interview' in:\n${result}`);
    assert.ok(result.includes('Mode: standard/interactive'), `Expected mode in:\n${result}`);
    assert.ok(result.includes('DRAFT:'), `Expected DRAFT in:\n${result}`);
    assert.ok(result.includes('missing:'), `Expected missing: in:\n${result}`);
    assert.ok(result.includes('Agents:'), `Expected Agents: in:\n${result}`);
    assert.ok(result.includes('Next:'), `Expected Next: in:\n${result}`);
    assert.ok(result.includes('Decisions'), `Expected Decisions in:\n${result}`);
  });
});

// ---------------------------------------------------------------------------
// manifestJSON() — structured recovery with recipeSteps
// ---------------------------------------------------------------------------

describe('manifestJSON() — recipeSteps-based currentStep', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('currentStep is first non-done step in recipeSteps order', () => {
    const recipeSteps = ['classify', 'explore', 'interview', 'plan'];
    createState('recipe-steps-current', { recipeSteps });

    const now = new Date().toISOString();
    updateState('recipe-steps-current', {
      steps: {
        init: { status: 'done', at: now },
        classify: { status: 'done', at: now },
        explore: { status: 'done', at: now },
        // interview and plan not done
      },
    });

    const result = manifestJSON('recipe-steps-current');
    assert.equal(result.currentStep, 'interview',
      `Expected currentStep to be 'interview' (first non-done in recipeSteps), got: ${result.currentStep}`);
  });

  test('completedSteps are sorted by recipeSteps order', () => {
    const recipeSteps = ['classify', 'explore', 'interview', 'plan'];
    createState('recipe-steps-order', { recipeSteps });

    const now = new Date().toISOString();
    // Add completed steps out-of-order in state.steps object
    updateState('recipe-steps-order', {
      steps: {
        init: { status: 'done', at: now },
        plan: { status: 'done', at: now },
        classify: { status: 'done', at: now },
        explore: { status: 'done', at: now },
        // interview not done
      },
    });

    const result = manifestJSON('recipe-steps-order');
    // completedSteps should follow recipeSteps order: classify, explore, plan
    // (not plan before classify as would happen with object key order)
    const completedFromRecipe = result.completedSteps.filter((s) => recipeSteps.includes(s));
    assert.deepEqual(completedFromRecipe, ['classify', 'explore', 'plan'],
      `Expected recipe steps in recipe order, got: ${JSON.stringify(completedFromRecipe)}`);
  });

  test('legacy state without recipeSteps still works correctly', () => {
    createState('legacy-no-recipe-steps', {});

    const now = new Date().toISOString();
    updateState('legacy-no-recipe-steps', {
      steps: {
        init: { status: 'done', at: now },
        classify: { status: 'done', at: now },
      },
      currentBlock: 'explore',
      phase: 'interview',
    });

    const result = manifestJSON('legacy-no-recipe-steps');
    assert.ok(result.completedSteps.includes('init'),
      `Expected 'init' in completedSteps: ${JSON.stringify(result.completedSteps)}`);
    assert.ok(result.completedSteps.includes('classify'),
      `Expected 'classify' in completedSteps: ${JSON.stringify(result.completedSteps)}`);
    // currentStep falls back to state.steps non-done or currentBlock
    assert.ok(typeof result.currentStep === 'string' && result.currentStep.length > 0,
      `Expected a non-empty currentStep string, got: ${result.currentStep}`);
  });
});
