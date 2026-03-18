/**
 * Integration tests for hoyeon-cli spec coverage subcommand.
 *
 * Run: node --test cli/tests/coverage.test.mjs
 *
 * Tests:
 *  1. spec coverage passes on valid spec with full derivation chain
 *  2. spec coverage --layer decisions checks decision-requirement traceability (exit 0 on valid)
 *  3. spec coverage --layer scenarios checks scenario coverage completeness (exit 0 on valid)
 *  4. spec coverage detects uncovered decisions (decision not referenced by any requirement)
 *  5. spec coverage detects orphaned scenario references in tasks
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixture, createTempSpec, runCli } from './helpers.js';

// ============================================================
// Test 1: spec coverage passes on valid spec with full derivation chain
// ============================================================
test('spec coverage passes on valid spec with full derivation chain', () => {
  const { path, cleanup } = createTempSpec(loadFixture('coverage-valid.json'));

  try {
    const { stdout, status } = runCli(['spec', 'coverage', path, '--json']);
    assert.equal(status, 0, `exit code should be 0, got: ${status}`);
    const result = JSON.parse(stdout);
    assert.equal(result.coverage, 'pass', `coverage should be "pass", got: ${result.coverage}`);
    assert.deepEqual(result.gaps, [], 'gaps should be empty');
  } finally {
    cleanup();
  }
});

// ============================================================
// Test 2: spec coverage --layer decisions checks decision-requirement traceability (exit 0 on valid)
// ============================================================
test('spec coverage --layer decisions checks decision-requirement traceability', () => {
  const { path, cleanup } = createTempSpec(loadFixture('coverage-valid.json'));

  try {
    const { stdout, status } = runCli(['spec', 'coverage', path, '--layer', 'decisions', '--json']);
    assert.equal(status, 0, `exit code should be 0, got: ${status}`);
    const result = JSON.parse(stdout);
    assert.equal(result.coverage, 'pass', 'decisions layer should pass on valid spec');
    assert.ok(
      result.gaps.filter(g => g.layer === 'decisions').length === 0,
      'no decision gaps expected',
    );
  } finally {
    cleanup();
  }
});

// ============================================================
// Test 3: spec coverage --layer scenarios checks scenario coverage completeness (exit 0 on valid)
// ============================================================
test('spec coverage --layer scenarios checks scenario coverage completeness', () => {
  const { path, cleanup } = createTempSpec(loadFixture('coverage-valid.json'));

  try {
    const { stdout, status } = runCli(['spec', 'coverage', path, '--layer', 'scenarios', '--json']);
    assert.equal(status, 0, `exit code should be 0, got: ${status}`);
    const result = JSON.parse(stdout);
    assert.equal(result.coverage, 'pass', 'scenarios layer should pass on valid spec');
  } finally {
    cleanup();
  }
});

// ============================================================
// Test 4: spec coverage detects uncovered decisions (decision not referenced by any requirement)
// ============================================================
test('spec coverage detects uncovered decisions (decision not referenced by any requirement)', () => {
  // Spec with decisions D1 and D2, but only R2 references D3 (non-existent).
  // D3 does not exist, R1 has no ref, D1 and D2 are uncovered.
  const { path, cleanup } = createTempSpec(loadFixture('coverage-missing-decision.json'));

  try {
    const { stdout, status } = runCli(['spec', 'coverage', path, '--json'], { expectFail: true });
    assert.notEqual(status, 0, 'exit code should be non-zero when decisions are uncovered');
    const result = JSON.parse(stdout);
    assert.equal(result.coverage, 'fail', 'coverage should be "fail"');
    assert.ok(result.gaps.length > 0, 'gaps should be non-empty');

    const decisionGaps = result.gaps.filter(g => g.layer === 'decisions');
    assert.ok(decisionGaps.length > 0, 'should have decision-layer gaps');

    const hasSourceRefError = decisionGaps.some(g => g.check === 'source.ref-integrity');
    const hasCoverageError = decisionGaps.some(g => g.check === 'decision-coverage');
    assert.ok(
      hasSourceRefError || hasCoverageError,
      `gaps should include source.ref-integrity or decision-coverage check, got: ${JSON.stringify(decisionGaps)}`,
    );
  } finally {
    cleanup();
  }
});

// ============================================================
// Test 5: spec coverage detects orphaned scenario references in tasks
// ============================================================
test('spec coverage detects orphaned scenario references in tasks', () => {
  // R1-S4 is defined in requirements but not referenced by any task AC.
  const { path, cleanup } = createTempSpec(loadFixture('coverage-orphan-scenario.json'));

  try {
    const { stdout, status } = runCli(['spec', 'coverage', path, '--json'], { expectFail: true });
    assert.notEqual(status, 0, 'exit code should be non-zero when orphan scenarios exist');
    const result = JSON.parse(stdout);
    assert.equal(result.coverage, 'fail', 'coverage should be "fail"');

    const orphanGaps = result.gaps.filter(g => g.check === 'orphan-scenario');
    assert.ok(orphanGaps.length > 0, 'should detect at least one orphaned scenario');
    assert.ok(
      orphanGaps.some(g => g.message.includes('R1-S4')),
      `orphan gap should mention R1-S4, got: ${JSON.stringify(orphanGaps)}`,
    );
  } finally {
    cleanup();
  }
});
