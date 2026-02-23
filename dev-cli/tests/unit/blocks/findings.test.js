/**
 * findings.test.js — Unit tests for findings-aggregate block
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { initSpec } from '../../../src/blocks/init.js';
import { findingsAggregate } from '../../../src/blocks/findings-aggregate.js';
import { findingsDir as _findingsDir, analysisDir as _analysisDir } from '../../../src/core/paths.js';

// ---------------------------------------------------------------------------
// Temp dir management
// ---------------------------------------------------------------------------

let tmpDir;
const originalCwd = process.cwd;

function useTmpDir() {
  tmpDir = mkdtempSync(join(tmpdir(), 'dev-cli-findings-test-'));
  process.cwd = () => tmpDir;
}

function restoreCwd() {
  process.cwd = originalCwd;
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('findingsAggregate()', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('returns empty findings when no files exist', () => {
    initSpec('empty-spec', {});

    const result = findingsAggregate('empty-spec');

    assert.deepEqual(result.findings, []);
    assert.deepEqual(result.analysis, []);
    assert.equal(result.stats.totalFindings, 0);
    assert.equal(result.stats.totalAnalysis, 0);
    assert.deepEqual(result.stats.agentTypes, []);
  });

  test('aggregates findings with frontmatter', () => {
    initSpec('agg-spec', {});

    const findingsDir = _findingsDir('agg-spec');
    writeFileSync(
      join(findingsDir, 'explore-1.md'),
      `---
type: Explore
id: explore-1
summary: Found 3 patterns related to auth
---

# Detailed findings

Some detailed content here.
`,
      'utf8',
    );

    const result = findingsAggregate('agg-spec');

    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].file, 'explore-1.md');
    assert.equal(result.findings[0].agentType, 'Explore');
    assert.equal(result.findings[0].agentId, 'explore-1');
    assert.equal(result.findings[0].summary, 'Found 3 patterns related to auth');
    assert.ok(result.findings[0].content.includes('# Detailed findings'));
    assert.ok(result.findings[0].hash.startsWith('sha256:'));
  });

  test('aggregates multiple findings files', () => {
    initSpec('multi-spec', {});

    const findingsDir = _findingsDir('multi-spec');
    writeFileSync(
      join(findingsDir, 'agent1.md'),
      `---
type: Explore
id: explore-1
summary: First finding
---
Body 1`,
      'utf8',
    );
    writeFileSync(
      join(findingsDir, 'agent2.md'),
      `---
type: docs-researcher
id: docs-1
summary: Second finding
---
Body 2`,
      'utf8',
    );

    const result = findingsAggregate('multi-spec');

    assert.equal(result.stats.totalFindings, 2);
    assert.ok(result.stats.agentTypes.includes('Explore'));
    assert.ok(result.stats.agentTypes.includes('docs-researcher'));
  });

  test('excludes analysis by default', () => {
    initSpec('no-analysis-spec', {});

    const findingsDir = _findingsDir('no-analysis-spec');
    writeFileSync(join(findingsDir, 'finding.md'), '---\nid: f1\n---\nBody', 'utf8');

    const analysisDir = _analysisDir('no-analysis-spec');
    writeFileSync(join(analysisDir, 'report.md'), '---\nid: a1\n---\nAnalysis', 'utf8');

    const result = findingsAggregate('no-analysis-spec');

    assert.equal(result.stats.totalFindings, 1);
    assert.equal(result.stats.totalAnalysis, 0);
    assert.deepEqual(result.analysis, []);
  });

  test('includes analysis with --include-analysis flag', () => {
    initSpec('with-analysis-spec', {});

    const findingsDir = _findingsDir('with-analysis-spec');
    writeFileSync(join(findingsDir, 'finding.md'), '---\nid: f1\ntype: Explore\n---\nBody', 'utf8');

    const analysisDir = _analysisDir('with-analysis-spec');
    writeFileSync(join(analysisDir, 'report.md'), '---\nid: a1\ntype: ux-reviewer\n---\nAnalysis body', 'utf8');

    const result = findingsAggregate('with-analysis-spec', { includeAnalysis: true });

    assert.equal(result.stats.totalFindings, 1);
    assert.equal(result.stats.totalAnalysis, 1);
    assert.equal(result.analysis[0].agentId, 'a1');
    assert.ok(result.analysis[0].content.includes('Analysis body'));
    assert.ok(result.stats.agentTypes.includes('Explore'));
    assert.ok(result.stats.agentTypes.includes('ux-reviewer'));
  });

  test('handles files without frontmatter', () => {
    initSpec('no-fm-spec', {});

    const findingsDir = _findingsDir('no-fm-spec');
    writeFileSync(join(findingsDir, 'plain.md'), '# Just a plain markdown file\n\nNo frontmatter here.', 'utf8');

    const result = findingsAggregate('no-fm-spec');

    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].agentType, 'plain');
    assert.equal(result.findings[0].agentId, 'plain');
    assert.equal(result.findings[0].summary, '');
    assert.ok(result.findings[0].content.includes('Just a plain markdown file'));
  });

  test('returns full content including frontmatter', () => {
    initSpec('full-content-spec', {});

    const findingsDir = _findingsDir('full-content-spec');
    const fullContent = `---
type: Explore
id: explore-1
summary: Test summary
---

# Full Content

This is the full body.`;
    writeFileSync(join(findingsDir, 'test.md'), fullContent, 'utf8');

    const result = findingsAggregate('full-content-spec');

    // content should be the entire file including frontmatter
    assert.equal(result.findings[0].content, fullContent);
  });
});
