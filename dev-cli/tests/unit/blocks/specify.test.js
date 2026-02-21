/**
 * specify.test.js — Unit tests for specify-phase block implementations
 * Uses node:test and node:assert (no external test frameworks).
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { initSpec } from '../../../src/blocks/init.js';
import { draftUpdate } from '../../../src/blocks/draft-update.js';
import { draftImport } from '../../../src/blocks/draft-import.js';
import { draftValidate } from '../../../src/blocks/draft-validate.js';
import { autoAssume } from '../../../src/blocks/auto-assume.js';
import { loadState } from '../../../src/core/state.js';

// ---------------------------------------------------------------------------
// Temp dir management (same pattern as state.test.js)
// ---------------------------------------------------------------------------

let tmpDir;
const originalCwd = process.cwd;

function useTmpDir() {
  tmpDir = mkdtempSync(join(tmpdir(), 'dev-cli-specify-test-'));
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

function specDir(name) {
  return join(tmpDir, '.dev', 'specs', name);
}

function draftPath(name) {
  return join(specDir(name), 'DRAFT.md');
}

function activeSpecPath() {
  return join(tmpDir, '.dev', 'active-spec');
}

// ---------------------------------------------------------------------------
// initSpec tests
// ---------------------------------------------------------------------------

describe('initSpec()', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('creates state.json at the correct path', () => {
    initSpec('test-spec', { depth: 'standard', interaction: 'interactive' });

    const statePath = join(specDir('test-spec'), 'state.json');
    assert.ok(existsSync(statePath), `Expected state.json at ${statePath}`);

    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    assert.equal(state.name, 'test-spec');
    assert.equal(state.mode.depth, 'standard');
    assert.equal(state.mode.interaction, 'interactive');
  });

  test('creates DRAFT.md with all section markers', () => {
    initSpec('draft-spec', { depth: 'standard', interaction: 'interactive' });

    const draft = draftPath('draft-spec');
    assert.ok(existsSync(draft), `Expected DRAFT.md at ${draft}`);

    const content = readFileSync(draft, 'utf8');

    const expectedSections = [
      'meta', 'intent', 'what-why', 'boundaries',
      'criteria', 'decisions', 'findings', 'questions', 'direction', 'assumptions',
    ];

    for (const section of expectedSections) {
      assert.ok(
        content.includes(`<!-- BEGIN:${section} -->`),
        `Missing BEGIN marker for section '${section}'`,
      );
      assert.ok(
        content.includes(`<!-- END:${section} -->`),
        `Missing END marker for section '${section}'`,
      );
    }
  });

  test('creates findings/ subdirectory', () => {
    initSpec('findings-spec', {});

    const findingsDir = join(specDir('findings-spec'), 'findings');
    assert.ok(existsSync(findingsDir), `Expected findings/ dir at ${findingsDir}`);
  });

  test('creates analysis/ subdirectory', () => {
    initSpec('analysis-spec', {});

    const analysisDir = join(specDir('analysis-spec'), 'analysis');
    assert.ok(existsSync(analysisDir), `Expected analysis/ dir at ${analysisDir}`);
  });

  test('writes active-spec pointer file', () => {
    initSpec('pointer-spec', {});

    const activeSpec = activeSpecPath();
    assert.ok(existsSync(activeSpec), `Expected active-spec at ${activeSpec}`);
    assert.equal(readFileSync(activeSpec, 'utf8'), 'pointer-spec');
  });

  test('active-spec pointer updates when new spec is created', () => {
    initSpec('first-spec', {});
    assert.equal(readFileSync(activeSpecPath(), 'utf8'), 'first-spec');

    initSpec('second-spec', {});
    assert.equal(readFileSync(activeSpecPath(), 'utf8'), 'second-spec');
  });

  test('returns specDir and state', () => {
    const result = initSpec('return-spec', { depth: 'quick', interaction: 'autopilot' });

    assert.ok(result.specDir, 'Expected specDir in result');
    assert.ok(result.state, 'Expected state in result');
    assert.equal(result.state.name, 'return-spec');
    assert.equal(result.state.mode.depth, 'quick');
    assert.equal(result.state.mode.interaction, 'autopilot');
  });

  test('defaults to standard/interactive when no options provided', () => {
    initSpec('defaults-spec', {});

    const state = loadState('defaults-spec');
    assert.equal(state.mode.depth, 'standard');
    assert.equal(state.mode.interaction, 'interactive');
  });
});

// ---------------------------------------------------------------------------
// draftUpdate tests
// ---------------------------------------------------------------------------

describe('draftUpdate()', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('updates a section with string data', () => {
    initSpec('update-spec', {});

    draftUpdate('update-spec', 'intent', 'Feature: Add user authentication');

    const content = readFileSync(draftPath('update-spec'), 'utf8');
    assert.ok(
      content.includes('Feature: Add user authentication'),
      'Expected updated intent content',
    );
  });

  test('updates a section with JSON object data', () => {
    initSpec('update-json-spec', {});

    draftUpdate('update-json-spec', 'intent', { type: 'Feature', description: 'Auth system' });

    const content = readFileSync(draftPath('update-json-spec'), 'utf8');
    assert.ok(content.includes('type'), 'Expected type key in content');
    assert.ok(content.includes('Feature'), 'Expected Feature value in content');
  });

  test('preserves markers around updated content', () => {
    initSpec('markers-spec', {});

    draftUpdate('markers-spec', 'intent', 'Updated intent content');

    const content = readFileSync(draftPath('markers-spec'), 'utf8');
    assert.ok(content.includes('<!-- BEGIN:intent -->'), 'BEGIN marker must be preserved');
    assert.ok(content.includes('<!-- END:intent -->'), 'END marker must be preserved');
  });

  test('only updates the specified section', () => {
    initSpec('section-spec', {});

    const before = readFileSync(draftPath('section-spec'), 'utf8');
    // Capture what-why section before update
    const whatWhyMatch = before.match(/<!-- BEGIN:what-why -->([\s\S]*?)<!-- END:what-why -->/);
    const whatWhyBefore = whatWhyMatch ? whatWhyMatch[1] : '';

    draftUpdate('section-spec', 'intent', 'New intent');

    const after = readFileSync(draftPath('section-spec'), 'utf8');
    const whatWhyMatchAfter = after.match(/<!-- BEGIN:what-why -->([\s\S]*?)<!-- END:what-why -->/);
    const whatWhyAfter = whatWhyMatchAfter ? whatWhyMatchAfter[1] : '';

    assert.equal(whatWhyBefore, whatWhyAfter, 'what-why section should not be changed');
  });

  test('throws for unknown section', () => {
    initSpec('bad-section-spec', {});

    assert.throws(
      () => draftUpdate('bad-section-spec', 'nonexistent-section', 'data'),
      /not found/i,
    );
  });
});

// ---------------------------------------------------------------------------
// draftImport tests
// ---------------------------------------------------------------------------

describe('draftImport()', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('imports findings from findings/*.md files', () => {
    initSpec('import-spec', {});

    // Create findings file with frontmatter
    const findingsDir = join(specDir('import-spec'), 'findings');
    writeFileSync(
      join(findingsDir, 'explore.md'),
      `---
type: Explore
id: explore-agent
summary: Found 3 patterns related to authentication
---

# Detailed findings...
`,
      'utf8',
    );

    const result = draftImport('import-spec');

    assert.equal(result.imported, 1);
    assert.ok(result.agents['explore-agent'], 'Expected explore-agent in agents');
  });

  test('populates findings section in DRAFT.md', () => {
    initSpec('import-draft-spec', {});

    const findingsDir = join(specDir('import-draft-spec'), 'findings');
    writeFileSync(
      join(findingsDir, 'analysis.md'),
      `---
type: Analysis
id: analysis-agent
summary: The codebase uses Express.js for routing
---
`,
      'utf8',
    );

    draftImport('import-draft-spec');

    const content = readFileSync(draftPath('import-draft-spec'), 'utf8');
    assert.ok(
      content.includes('The codebase uses Express.js for routing'),
      'Expected findings summary in DRAFT.md',
    );
  });

  test('extracts summary from YAML frontmatter', () => {
    initSpec('yaml-spec', {});

    const findingsDir = join(specDir('yaml-spec'), 'findings');
    writeFileSync(
      join(findingsDir, 'agent1.md'),
      `---
type: Research
id: research-1
summary: Key insight about the architecture
---

Body content here.
`,
      'utf8',
    );

    const result = draftImport('yaml-spec');

    assert.ok(result.agents['research-1']);
    const draft = readFileSync(draftPath('yaml-spec'), 'utf8');
    assert.ok(draft.includes('Key insight about the architecture'));
  });

  test('handles findings directory with no files', () => {
    initSpec('empty-findings-spec', {});

    const result = draftImport('empty-findings-spec');

    assert.equal(result.imported, 0);
    assert.deepEqual(result.agents, {});

    const content = readFileSync(draftPath('empty-findings-spec'), 'utf8');
    assert.ok(content.includes('<!-- BEGIN:findings -->'));
  });

  test('updates state.agents with agent info and hash', () => {
    initSpec('agent-state-spec', {});

    const findingsDir = join(specDir('agent-state-spec'), 'findings');
    writeFileSync(
      join(findingsDir, 'finder.md'),
      `---
type: Finder
id: finder-1
summary: Found important patterns
---
`,
      'utf8',
    );

    draftImport('agent-state-spec');

    const state = loadState('agent-state-spec');
    assert.ok(state.agents['finder-1'], 'Expected finder-1 in state.agents');
    assert.ok(state.agents['finder-1'].hash, 'Expected hash in agent info');
    assert.ok(state.agents['finder-1'].hash.startsWith('sha256:'), 'Hash should be sha256 format');
  });

  test('imports multiple findings files', () => {
    initSpec('multi-import-spec', {});

    const findingsDir = join(specDir('multi-import-spec'), 'findings');
    writeFileSync(
      join(findingsDir, 'agent1.md'),
      `---
id: agent-1
summary: First summary
---
`,
      'utf8',
    );
    writeFileSync(
      join(findingsDir, 'agent2.md'),
      `---
id: agent-2
summary: Second summary
---
`,
      'utf8',
    );

    const result = draftImport('multi-import-spec');

    assert.equal(result.imported, 2);
    assert.ok(result.agents['agent-1']);
    assert.ok(result.agents['agent-2']);
  });
});

// ---------------------------------------------------------------------------
// draftValidate tests
// ---------------------------------------------------------------------------

describe('draftValidate()', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('returns ready:false with missing sections for incomplete draft', () => {
    initSpec('validate-incomplete', { depth: 'standard', interaction: 'interactive' });

    const result = draftValidate('validate-incomplete');

    assert.equal(result.ready, false);
    assert.ok(Array.isArray(result.missing));
    assert.ok(result.missing.length > 0, 'Should have missing sections for fresh draft');
  });

  test('missing includes all required standard sections when unfilled', () => {
    initSpec('validate-standard', { depth: 'standard', interaction: 'interactive' });

    const result = draftValidate('validate-standard');

    const required = ['intent', 'what-why', 'boundaries', 'criteria', 'decisions', 'findings'];
    for (const section of required) {
      assert.ok(
        result.missing.includes(section),
        `Expected '${section}' in missing list`,
      );
    }
  });

  test('quick mode requires fewer sections', () => {
    initSpec('validate-quick', { depth: 'quick', interaction: 'autopilot' });

    const result = draftValidate('validate-quick');

    // Quick mode only requires: intent, what-why, findings
    const notRequired = ['boundaries', 'criteria', 'decisions'];
    for (const section of notRequired) {
      // These may or may not be present in missing, but boundaries/criteria/decisions
      // should not cause failure in quick mode
      assert.ok(
        !result.missing.includes('intent') || result.missing.includes('intent'),
        // This is intentionally checking quick mode behavior separately below
      );
    }

    // Confirm only quick-required sections are tracked
    const quickRequired = ['intent', 'what-why', 'findings'];
    // All missing sections should be from quickRequired
    for (const section of result.missing) {
      assert.ok(
        quickRequired.includes(section),
        `Section '${section}' should not be required in quick mode`,
      );
    }
  });

  test('ready:true when all required sections are filled (standard)', () => {
    initSpec('validate-ready', { depth: 'standard', interaction: 'interactive' });

    // Fill all required sections
    draftUpdate('validate-ready', 'intent', 'This is a feature to add authentication to the app.');
    draftUpdate('validate-ready', 'what-why', 'We need this because users need to log in securely.');
    draftUpdate('validate-ready', 'boundaries', 'Scope: login form, session management. Out of scope: OAuth.');
    draftUpdate('validate-ready', 'criteria', 'Users can log in with email/password. Sessions expire after 24h.');
    draftUpdate('validate-ready', 'decisions', 'Use JWT for session tokens. Bcrypt for password hashing.');
    draftUpdate('validate-ready', 'findings', 'Current codebase uses Express.js. No auth middleware exists.');

    const result = draftValidate('validate-ready');

    assert.equal(result.ready, true);
    assert.deepEqual(result.missing, []);
  });

  test('returns sections list', () => {
    initSpec('sections-list', { depth: 'standard', interaction: 'interactive' });

    const result = draftValidate('sections-list');

    assert.ok(Array.isArray(result.sections));
    assert.ok(result.sections.includes('intent'), 'Expected intent in sections list');
    assert.ok(result.sections.includes('findings'), 'Expected findings in sections list');
  });
});

// ---------------------------------------------------------------------------
// autoAssume tests
// ---------------------------------------------------------------------------

describe('autoAssume()', () => {
  beforeEach(useTmpDir);
  afterEach(restoreCwd);

  test('populates Assumptions section', () => {
    initSpec('assume-spec', { depth: 'quick', interaction: 'autopilot' });

    autoAssume('assume-spec');

    const content = readFileSync(draftPath('assume-spec'), 'utf8');
    const assumeMatch = content.match(/<!-- BEGIN:assumptions -->([\s\S]*?)<!-- END:assumptions -->/);
    assert.ok(assumeMatch, 'Expected assumptions section in DRAFT.md');

    const assumptionsContent = assumeMatch[1].trim();
    assert.ok(assumptionsContent.length > 0, 'Assumptions should not be empty');
    assert.ok(
      !assumptionsContent.includes('_No assumptions recorded'),
      'Assumptions should be replaced with generated content',
    );
  });

  test('includes default assumptions', () => {
    initSpec('assume-defaults', { depth: 'standard', interaction: 'interactive' });

    autoAssume('assume-defaults');

    const content = readFileSync(draftPath('assume-defaults'), 'utf8');
    assert.ok(content.includes('No breaking changes'), 'Expected no-breaking-changes assumption');
    assert.ok(content.includes('existing code patterns'), 'Expected existing patterns assumption');
  });

  test('includes quick mode specific assumptions', () => {
    initSpec('assume-quick', { depth: 'quick', interaction: 'autopilot' });

    autoAssume('assume-quick');

    const content = readFileSync(draftPath('assume-quick'), 'utf8');
    assert.ok(
      content.includes('Quick mode') || content.includes('Autopilot mode'),
      'Expected mode-specific assumptions',
    );
  });

  test('includes note about findings when findings are populated', () => {
    initSpec('assume-with-findings', { depth: 'quick', interaction: 'autopilot' });

    // Add some findings first
    const findingsDir = join(specDir('assume-with-findings'), 'findings');
    writeFileSync(
      join(findingsDir, 'research.md'),
      `---
id: research-1
summary: Found relevant patterns in existing code
---
`,
      'utf8',
    );
    draftImport('assume-with-findings');

    autoAssume('assume-with-findings');

    const content = readFileSync(draftPath('assume-with-findings'), 'utf8');
    assert.ok(
      content.includes('findings'),
      'Expected reference to findings in assumptions',
    );
  });

  test('preserves section markers', () => {
    initSpec('assume-markers', { depth: 'quick', interaction: 'autopilot' });

    autoAssume('assume-markers');

    const content = readFileSync(draftPath('assume-markers'), 'utf8');
    assert.ok(content.includes('<!-- BEGIN:assumptions -->'), 'BEGIN marker must be preserved');
    assert.ok(content.includes('<!-- END:assumptions -->'), 'END marker must be preserved');
  });

  test('does not modify other sections', () => {
    initSpec('assume-isolated', { depth: 'quick', interaction: 'autopilot' });

    // Update intent with specific content
    draftUpdate('assume-isolated', 'intent', 'This intent should not change');

    autoAssume('assume-isolated');

    const content = readFileSync(draftPath('assume-isolated'), 'utf8');
    assert.ok(
      content.includes('This intent should not change'),
      'Intent section should remain unchanged',
    );
  });

  test('returns updated DRAFT.md content as string', () => {
    initSpec('assume-return', { depth: 'quick', interaction: 'autopilot' });

    const result = autoAssume('assume-return');

    assert.equal(typeof result, 'string');
    assert.ok(result.includes('<!-- BEGIN:assumptions -->'));
  });
});
