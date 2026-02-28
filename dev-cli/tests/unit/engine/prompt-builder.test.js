/**
 * prompt-builder.test.js — Unit tests for prompt-builder module
 *
 * Tests that each prompt builder:
 * - Includes all required sections
 * - Handles optional fields correctly
 * - Is deterministic (same input → same output)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWorkerPrompt,
  buildVerifyPrompt,
  buildFixPrompt,
  buildWrapupPrompt,
  buildCommitPrompt,
  buildCodeReviewPrompt,
  buildFinalVerifyPrompt,
  buildFinalizeFixPrompt,
  buildReportPrompt,
} from '../../../src/engine/prompt-builder.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTodo(overrides = {}) {
  return {
    id: 'todo-1',
    title: 'Create parser',
    type: 'work',
    risk: 'LOW',
    steps: ['Write the parser', 'Add tests', 'Run lint'],
    outputs: [
      {
        name: 'parser',
        type: 'file',
        value: 'src/parser.js',
        description: 'The main parser module',
      },
    ],
    acceptanceCriteria: {
      functional: ['Parser handles valid input'],
      static: ['node --check passes'],
      runtime: ['All tests pass'],
    },
    mustNotDo: ['Do not use eval', 'Do not modify unrelated files'],
    references: ['docs/parser-spec.md', 'docs/style-guide.md'],
    ...overrides,
  };
}

function makeResolvedInputs() {
  return [
    { name: 'config', type: 'file', ref: 'config.json' },
    { name: 'schema', type: 'file', ref: 'src/schema.js' },
  ];
}

function makeContext(overrides = {}) {
  return {
    learnings: '',
    issues: '',
    ...overrides,
  };
}

function makeWorkerResult() {
  return {
    outputs: { parser: 'src/parser.js' },
    acceptance_criteria: [
      { id: 'func_1', category: 'functional', description: 'Parser works', status: 'PASS' },
    ],
    learnings: ['ESM only project'],
    issues: [],
    decisions: ['Used recursive descent'],
  };
}

function makeVerifyResult(overrides = {}) {
  return {
    status: 'FAILED',
    criteria: [
      { name: 'Parser handles valid input', pass: false, evidence: 'Test failed at line 42' },
      { name: 'node --check passes', pass: true, evidence: 'No syntax errors' },
      { name: 'All tests pass', pass: false, evidence: '2 tests failed' },
    ],
    mustNotDoViolations: [
      { rule: 'Do not use eval', violated: true, evidence: 'eval() found in parser.js:10' },
      { rule: 'Do not modify unrelated files', violated: false, evidence: 'No violations' },
    ],
    sideEffects: [],
    suggestedAdaptation: null,
    summary: 'Two criteria failed, one mustNotDo violation',
    ...overrides,
  };
}

function makeCommitEntry() {
  return {
    message: 'feat: add parser module',
    files: ['src/parser.js', 'tests/parser.test.js'],
    condition: 'always',
  };
}

// ---------------------------------------------------------------------------
// buildWorkerPrompt() tests
// ---------------------------------------------------------------------------

describe('buildWorkerPrompt()', () => {
  test('includes TASK section with id, title, type, and risk', () => {
    const todo = makeTodo();
    const prompt = buildWorkerPrompt(todo, makeResolvedInputs(), makeContext());

    assert.ok(prompt.includes('# TASK'), 'Should include TASK section header');
    assert.ok(prompt.includes('TODO todo-1:'), 'Should include TODO id');
    assert.ok(prompt.includes('Create parser'), 'Should include todo title');
    assert.ok(prompt.includes('Type: work'), 'Should include todo type');
    assert.ok(prompt.includes('Risk: LOW'), 'Should include todo risk');
  });

  test('includes STEPS section with numbered list', () => {
    const todo = makeTodo();
    const prompt = buildWorkerPrompt(todo, makeResolvedInputs(), makeContext());

    assert.ok(prompt.includes('# STEPS'), 'Should include STEPS section header');
    assert.ok(prompt.includes('1. Write the parser'), 'Should include first step numbered');
    assert.ok(prompt.includes('2. Add tests'), 'Should include second step numbered');
    assert.ok(prompt.includes('3. Run lint'), 'Should include third step numbered');
  });

  test('includes EXPECTED OUTCOME section with outputs and acceptance criteria', () => {
    const todo = makeTodo();
    const prompt = buildWorkerPrompt(todo, makeResolvedInputs(), makeContext());

    assert.ok(prompt.includes('# EXPECTED OUTCOME'), 'Should include EXPECTED OUTCOME section');
    assert.ok(prompt.includes('## Outputs'), 'Should include Outputs subsection');
    assert.ok(prompt.includes('src/parser.js'), 'Should include output value');
    assert.ok(prompt.includes('The main parser module'), 'Should include output description');
    assert.ok(prompt.includes('## Acceptance Criteria'), 'Should include Acceptance Criteria subsection');
    assert.ok(prompt.includes('Parser handles valid input'), 'Should include functional criterion');
    assert.ok(prompt.includes('node --check passes'), 'Should include static criterion');
    assert.ok(prompt.includes('All tests pass'), 'Should include runtime criterion');
  });

  test('includes MUST NOT DO section', () => {
    const todo = makeTodo();
    const prompt = buildWorkerPrompt(todo, makeResolvedInputs(), makeContext());

    assert.ok(prompt.includes('# MUST NOT DO'), 'Should include MUST NOT DO section header');
    assert.ok(prompt.includes('Do not use eval'), 'Should include first mustNotDo item');
    assert.ok(prompt.includes('Do not modify unrelated files'), 'Should include second mustNotDo item');
  });

  test('includes REFERENCES section', () => {
    const todo = makeTodo();
    const prompt = buildWorkerPrompt(todo, makeResolvedInputs(), makeContext());

    assert.ok(prompt.includes('# REFERENCES'), 'Should include REFERENCES section header');
    assert.ok(prompt.includes('docs/parser-spec.md'), 'Should include first reference');
    assert.ok(prompt.includes('docs/style-guide.md'), 'Should include second reference');
  });

  test('includes CONTEXT section with resolved inputs', () => {
    const todo = makeTodo();
    const resolvedInputs = makeResolvedInputs();
    const prompt = buildWorkerPrompt(todo, resolvedInputs, makeContext());

    assert.ok(prompt.includes('# CONTEXT'), 'Should include CONTEXT section header');
    assert.ok(prompt.includes('## Resolved Inputs'), 'Should include Resolved Inputs subsection');
    assert.ok(prompt.includes('config'), 'Should include first input name');
    assert.ok(prompt.includes('config.json'), 'Should include first input ref');
    assert.ok(prompt.includes('schema'), 'Should include second input name');
    assert.ok(prompt.includes('src/schema.js'), 'Should include second input ref');
  });

  test('includes learnings section when provided and non-empty', () => {
    const todo = makeTodo();
    const context = makeContext({ learnings: 'ESM only project. Use import/export.' });
    const prompt = buildWorkerPrompt(todo, makeResolvedInputs(), context);

    assert.ok(prompt.includes('### Inherited Learnings'), 'Should include Inherited Learnings header');
    assert.ok(prompt.includes('ESM only project'), 'Should include learnings content');
  });

  test('includes issues section when provided and non-empty', () => {
    const todo = makeTodo();
    const context = makeContext({ issues: 'Circular dependency in utils module.' });
    const prompt = buildWorkerPrompt(todo, makeResolvedInputs(), context);

    assert.ok(prompt.includes('### Known Issues'), 'Should include Known Issues header');
    assert.ok(prompt.includes('Circular dependency'), 'Should include issues content');
  });

  test('omits learnings section when empty string', () => {
    const todo = makeTodo();
    const context = makeContext({ learnings: '' });
    const prompt = buildWorkerPrompt(todo, makeResolvedInputs(), context);

    assert.ok(!prompt.includes('### Inherited Learnings'), 'Should NOT include Inherited Learnings header when empty');
  });

  test('omits learnings section when whitespace-only string', () => {
    const todo = makeTodo();
    const context = makeContext({ learnings: '   \n  ' });
    const prompt = buildWorkerPrompt(todo, makeResolvedInputs(), context);

    assert.ok(!prompt.includes('### Inherited Learnings'), 'Should NOT include Inherited Learnings header when whitespace only');
  });

  test('omits issues section when empty string', () => {
    const todo = makeTodo();
    const context = makeContext({ issues: '' });
    const prompt = buildWorkerPrompt(todo, makeResolvedInputs(), context);

    assert.ok(!prompt.includes('### Known Issues'), 'Should NOT include Known Issues header when empty');
  });

  test('omits learnings section when context is empty object', () => {
    const todo = makeTodo();
    const prompt = buildWorkerPrompt(todo, makeResolvedInputs(), {});

    assert.ok(!prompt.includes('### Inherited Learnings'), 'Should NOT include Inherited Learnings when context has no learnings key');
    assert.ok(!prompt.includes('### Known Issues'), 'Should NOT include Known Issues when context has no issues key');
  });

  test('is deterministic (same input produces same output)', () => {
    const todo = makeTodo();
    const resolvedInputs = makeResolvedInputs();
    const context = makeContext({ learnings: 'some learnings', issues: 'some issues' });

    const prompt1 = buildWorkerPrompt(todo, resolvedInputs, context);
    const prompt2 = buildWorkerPrompt(todo, resolvedInputs, context);

    assert.equal(prompt1, prompt2, 'Same input must produce identical output');
  });

  test('includes cleanup criteria when present', () => {
    const todo = makeTodo({
      acceptanceCriteria: {
        functional: ['Feature works'],
        static: ['tsc passes'],
        runtime: ['Tests pass'],
        cleanup: ['Remove unused imports'],
      },
    });
    const prompt = buildWorkerPrompt(todo, makeResolvedInputs(), makeContext());

    assert.ok(prompt.includes('**Cleanup:**'), 'Should include Cleanup section');
    assert.ok(prompt.includes('Remove unused imports'), 'Should include cleanup criterion');
  });
});

// ---------------------------------------------------------------------------
// buildVerifyPrompt() tests
// ---------------------------------------------------------------------------

describe('buildVerifyPrompt()', () => {
  test('includes all 5 parts', () => {
    const todo = makeTodo();
    const workerResult = makeWorkerResult();
    const prompt = buildVerifyPrompt(todo, workerResult);

    assert.ok(prompt.includes('## Part 1: Acceptance Criteria Check'), 'Should include Part 1');
    assert.ok(prompt.includes('## Part 2: Must-NOT-Do Violations'), 'Should include Part 2');
    assert.ok(prompt.includes('## Part 3: Side-Effect Audit'), 'Should include Part 3');
    assert.ok(prompt.includes('## Part 4: Sandbox Lifecycle'), 'Should include Part 4');
    assert.ok(prompt.includes('## Part 5: Scope Blockage Detection'), 'Should include Part 5');
  });

  test('includes correct heading with todo id', () => {
    const todo = makeTodo();
    const prompt = buildVerifyPrompt(todo, makeWorkerResult());

    assert.ok(prompt.includes('# Verify: TODO todo-1'), 'Should include heading with todo id');
  });

  test('includes acceptance criteria in Part 1', () => {
    const todo = makeTodo();
    const prompt = buildVerifyPrompt(todo, makeWorkerResult());

    assert.ok(prompt.includes('Parser handles valid input'), 'Should include functional criterion');
    assert.ok(prompt.includes('node --check passes'), 'Should include static criterion');
    assert.ok(prompt.includes('All tests pass'), 'Should include runtime criterion');
  });

  test('includes mustNotDo in Part 2', () => {
    const todo = makeTodo();
    const prompt = buildVerifyPrompt(todo, makeWorkerResult());

    assert.ok(prompt.includes('Do not use eval'), 'Should include first mustNotDo rule');
    assert.ok(prompt.includes('Do not modify unrelated files'), 'Should include second mustNotDo rule');
  });

  test('includes serialized worker output', () => {
    const todo = makeTodo();
    const workerResult = makeWorkerResult();
    const prompt = buildVerifyPrompt(todo, workerResult);

    assert.ok(prompt.includes('## Worker Output'), 'Should include Worker Output section');
    assert.ok(prompt.includes('"ESM only project"'), 'Should include serialized worker learnings');
  });

  test('includes JSON output format specification', () => {
    const todo = makeTodo();
    const prompt = buildVerifyPrompt(todo, makeWorkerResult());

    assert.ok(prompt.includes('## Required Output Format'), 'Should include Required Output Format header');
    assert.ok(prompt.includes('"status": "VERIFIED" | "FAILED"'), 'Should include status field spec');
    assert.ok(prompt.includes('"criteria"'), 'Should include criteria field spec');
    assert.ok(prompt.includes('"mustNotDoViolations"'), 'Should include mustNotDoViolations field spec');
    assert.ok(prompt.includes('"sideEffects"'), 'Should include sideEffects field spec');
    assert.ok(prompt.includes('"suggestedAdaptation"'), 'Should include suggestedAdaptation field spec');
    assert.ok(prompt.includes('"summary"'), 'Should include summary field spec');
  });

  test('is deterministic (same input produces same output)', () => {
    const todo = makeTodo();
    const workerResult = makeWorkerResult();

    const prompt1 = buildVerifyPrompt(todo, workerResult);
    const prompt2 = buildVerifyPrompt(todo, workerResult);

    assert.equal(prompt1, prompt2, 'Same input must produce identical output');
  });
});

// ---------------------------------------------------------------------------
// buildFixPrompt() tests
// ---------------------------------------------------------------------------

describe('buildFixPrompt()', () => {
  test('includes correct heading with todo id', () => {
    const todo = makeTodo();
    const verifyResult = makeVerifyResult();
    const prompt = buildFixPrompt(todo, verifyResult);

    assert.ok(prompt.includes('# Fix: TODO todo-1'), 'Should include heading with todo id');
  });

  test('lists only failed criteria (pass === false)', () => {
    const todo = makeTodo();
    const verifyResult = makeVerifyResult();
    const prompt = buildFixPrompt(todo, verifyResult);

    assert.ok(prompt.includes('Parser handles valid input'), 'Should include failed criterion 1');
    assert.ok(prompt.includes('Test failed at line 42'), 'Should include evidence for failed criterion 1');
    assert.ok(prompt.includes('All tests pass'), 'Should include failed criterion 2');
    assert.ok(prompt.includes('2 tests failed'), 'Should include evidence for failed criterion 2');
    assert.ok(!prompt.includes('node --check passes'), 'Should NOT include passing criterion');
  });

  test('lists only violated mustNotDo rules (violated === true)', () => {
    const todo = makeTodo();
    const verifyResult = makeVerifyResult();
    const prompt = buildFixPrompt(todo, verifyResult);

    assert.ok(prompt.includes('Do not use eval'), 'Should include violated rule');
    assert.ok(prompt.includes('eval() found in parser.js:10'), 'Should include evidence for violation');
    assert.ok(!prompt.includes('Do not modify unrelated files'), 'Should NOT include non-violated rule');
  });

  test('includes instructions section', () => {
    const todo = makeTodo();
    const verifyResult = makeVerifyResult();
    const prompt = buildFixPrompt(todo, verifyResult);

    assert.ok(prompt.includes('## Instructions'), 'Should include Instructions section');
    assert.ok(prompt.includes('Fix ONLY the issues listed above'), 'Should include fix-only instruction');
    assert.ok(prompt.includes('Do not refactor or improve other code'), 'Should include no-refactor instruction');
  });

  test('shows (none) when no failed criteria', () => {
    const todo = makeTodo();
    const verifyResult = makeVerifyResult({
      criteria: [
        { name: 'All tests pass', pass: true, evidence: 'Green' },
      ],
      mustNotDoViolations: [],
    });
    const prompt = buildFixPrompt(todo, verifyResult);

    assert.ok(prompt.includes('## Failed Criteria'), 'Should include Failed Criteria section');
    assert.ok(prompt.includes('(none)'), 'Should show (none) when no failures');
  });

  test('is deterministic (same input produces same output)', () => {
    const todo = makeTodo();
    const verifyResult = makeVerifyResult();

    const prompt1 = buildFixPrompt(todo, verifyResult);
    const prompt2 = buildFixPrompt(todo, verifyResult);

    assert.equal(prompt1, prompt2, 'Same input must produce identical output');
  });
});

// ---------------------------------------------------------------------------
// buildWrapupPrompt() tests
// ---------------------------------------------------------------------------

describe('buildWrapupPrompt()', () => {
  test('includes correct heading with todo id', () => {
    const todo = makeTodo();
    const prompt = buildWrapupPrompt(todo);

    assert.ok(prompt.includes('# Wrap-up: TODO todo-1'), 'Should include heading with todo id');
  });

  test('mentions outputs.json', () => {
    const todo = makeTodo();
    const prompt = buildWrapupPrompt(todo);

    assert.ok(prompt.includes('context/outputs.json'), 'Should mention outputs.json');
  });

  test('mentions learnings.md', () => {
    const todo = makeTodo();
    const prompt = buildWrapupPrompt(todo);

    assert.ok(prompt.includes('context/learnings.md'), 'Should mention learnings.md');
  });

  test('mentions issues.md', () => {
    const todo = makeTodo();
    const prompt = buildWrapupPrompt(todo);

    assert.ok(prompt.includes('context/issues.md'), 'Should mention issues.md');
  });

  test('mentions marking TODO as checked in PLAN.md', () => {
    const todo = makeTodo();
    const prompt = buildWrapupPrompt(todo);

    assert.ok(prompt.includes('PLAN.md'), 'Should mention PLAN.md');
    assert.ok(prompt.includes('[x]'), 'Should mention [x] checkbox');
  });

  test('is deterministic (same input produces same output)', () => {
    const todo = makeTodo();

    const prompt1 = buildWrapupPrompt(todo);
    const prompt2 = buildWrapupPrompt(todo);

    assert.equal(prompt1, prompt2, 'Same input must produce identical output');
  });
});

// ---------------------------------------------------------------------------
// buildCommitPrompt() tests
// ---------------------------------------------------------------------------

describe('buildCommitPrompt()', () => {
  test('includes correct heading with todo id', () => {
    const todo = makeTodo();
    const commitEntry = makeCommitEntry();
    const prompt = buildCommitPrompt(todo, commitEntry);

    assert.ok(prompt.includes('# Commit: TODO todo-1'), 'Should include heading with todo id');
  });

  test('includes commit message when entry is provided', () => {
    const todo = makeTodo();
    const commitEntry = makeCommitEntry();
    const prompt = buildCommitPrompt(todo, commitEntry);

    assert.ok(prompt.includes('feat: add parser module'), 'Should include commit message');
  });

  test('includes files list when entry is provided', () => {
    const todo = makeTodo();
    const commitEntry = makeCommitEntry();
    const prompt = buildCommitPrompt(todo, commitEntry);

    assert.ok(prompt.includes('src/parser.js'), 'Should include first file');
    assert.ok(prompt.includes('tests/parser.test.js'), 'Should include second file');
  });

  test('includes condition when entry is provided', () => {
    const todo = makeTodo();
    const commitEntry = makeCommitEntry();
    const prompt = buildCommitPrompt(todo, commitEntry);

    assert.ok(prompt.includes('Condition: always'), 'Should include commit condition');
  });

  test('says "Skip commit" when entry is null', () => {
    const todo = makeTodo();
    const prompt = buildCommitPrompt(todo, null);

    assert.ok(prompt.includes('Skip commit'), 'Should say Skip commit when entry is null');
    assert.ok(prompt.includes('No commit strategy entry'), 'Should explain why to skip');
  });

  test('null entry prompt still includes heading with todo id', () => {
    const todo = makeTodo();
    const prompt = buildCommitPrompt(todo, null);

    assert.ok(prompt.includes('# Commit: TODO todo-1'), 'Should include heading with todo id even for null entry');
  });

  test('is deterministic with entry (same input produces same output)', () => {
    const todo = makeTodo();
    const commitEntry = makeCommitEntry();

    const prompt1 = buildCommitPrompt(todo, commitEntry);
    const prompt2 = buildCommitPrompt(todo, commitEntry);

    assert.equal(prompt1, prompt2, 'Same input must produce identical output');
  });

  test('is deterministic with null entry (same input produces same output)', () => {
    const todo = makeTodo();

    const prompt1 = buildCommitPrompt(todo, null);
    const prompt2 = buildCommitPrompt(todo, null);

    assert.equal(prompt1, prompt2, 'Same input must produce identical output');
  });
});

// ---------------------------------------------------------------------------
// buildCodeReviewPrompt() tests
// ---------------------------------------------------------------------------

describe('buildCodeReviewPrompt()', () => {
  test('includes code review heading', () => {
    const prompt = buildCodeReviewPrompt();

    assert.ok(prompt.includes('# Code Review'), 'Should include Code Review heading');
  });

  test('includes all 4 check items', () => {
    const prompt = buildCodeReviewPrompt();

    assert.ok(prompt.includes('Code quality and consistency'), 'Should include quality check');
    assert.ok(prompt.includes('Security vulnerabilities'), 'Should include security check');
    assert.ok(prompt.includes('Missing error handling'), 'Should include error handling check');
    assert.ok(prompt.includes('Test coverage gaps'), 'Should include test coverage check');
  });

  test('includes JSON output format specification', () => {
    const prompt = buildCodeReviewPrompt();

    assert.ok(prompt.includes('"verdict": "SHIP" | "NEEDS_FIXES"'), 'Should include verdict field spec');
    assert.ok(prompt.includes('"issues"'), 'Should include issues field spec');
    assert.ok(prompt.includes('"summary"'), 'Should include summary field spec');
  });

  test('is deterministic (same input produces same output)', () => {
    const prompt1 = buildCodeReviewPrompt();
    const prompt2 = buildCodeReviewPrompt();

    assert.equal(prompt1, prompt2, 'Same input must produce identical output');
  });
});

// ---------------------------------------------------------------------------
// buildFinalVerifyPrompt() tests
// ---------------------------------------------------------------------------

describe('buildFinalVerifyPrompt()', () => {
  test('includes final verification heading', () => {
    const commands = [{ run: 'npm test', expect: 'exit 0' }];
    const prompt = buildFinalVerifyPrompt(commands);

    assert.ok(prompt.includes('# Final Verification'), 'Should include Final Verification heading');
  });

  test('lists all provided commands', () => {
    const commands = [
      { run: 'npm test', expect: 'exit 0' },
      { run: 'npm run lint', expect: 'exit 0' },
      { run: 'node --check src/index.js', expect: 'exit 0' },
    ];
    const prompt = buildFinalVerifyPrompt(commands);

    assert.ok(prompt.includes('`npm test`'), 'Should include first command');
    assert.ok(prompt.includes('expect: exit 0'), 'Should include command expectation');
    assert.ok(prompt.includes('`npm run lint`'), 'Should include second command');
    assert.ok(prompt.includes('`node --check src/index.js`'), 'Should include third command');
  });

  test('includes JSON output format specification', () => {
    const commands = [{ run: 'npm test', expect: 'exit 0' }];
    const prompt = buildFinalVerifyPrompt(commands);

    assert.ok(prompt.includes('"status": "PASS" | "FAIL"'), 'Should include status field spec');
    assert.ok(prompt.includes('"results"'), 'Should include results field spec');
    assert.ok(prompt.includes('"exitCode"'), 'Should include exitCode field spec');
    assert.ok(prompt.includes('"summary"'), 'Should include summary field spec');
  });

  test('handles empty commands list', () => {
    const prompt = buildFinalVerifyPrompt([]);

    assert.ok(prompt.includes('# Final Verification'), 'Should still include heading');
    assert.ok(prompt.includes('(none)'), 'Should show (none) for empty commands');
  });

  test('is deterministic (same input produces same output)', () => {
    const commands = [
      { run: 'npm test', expect: 'exit 0' },
      { run: 'npm run lint', expect: 'exit 0' },
    ];

    const prompt1 = buildFinalVerifyPrompt(commands);
    const prompt2 = buildFinalVerifyPrompt(commands);

    assert.equal(prompt1, prompt2, 'Same input must produce identical output');
  });
});

// ---------------------------------------------------------------------------
// buildReportPrompt() tests
// ---------------------------------------------------------------------------

describe('buildReportPrompt()', () => {
  test('includes execution report heading', () => {
    const prompt = buildReportPrompt('standard', 5);

    assert.ok(prompt.includes('# Execution Report'), 'Should include Execution Report heading');
  });

  test('includes mode', () => {
    const prompt = buildReportPrompt('standard', 5);

    assert.ok(prompt.includes('Mode: standard'), 'Should include mode');
  });

  test('includes todo count', () => {
    const prompt = buildReportPrompt('standard', 5);

    assert.ok(prompt.includes('Total TODOs: 5'), 'Should include todo count');
  });

  test('reflects different modes and counts', () => {
    const promptQuick = buildReportPrompt('quick', 3);

    assert.ok(promptQuick.includes('Mode: quick'), 'Should include quick mode');
    assert.ok(promptQuick.includes('Total TODOs: 3'), 'Should include correct count');
  });

  test('is deterministic (same input produces same output)', () => {
    const prompt1 = buildReportPrompt('standard', 7);
    const prompt2 = buildReportPrompt('standard', 7);

    assert.equal(prompt1, prompt2, 'Same input must produce identical output');
  });
});

// ---------------------------------------------------------------------------
// buildFinalizeFixPrompt() tests
// ---------------------------------------------------------------------------

describe('buildFinalizeFixPrompt()', () => {
  test('includes correct heading for code-review', () => {
    const prompt = buildFinalizeFixPrompt('code-review', { verdict: 'NEEDS_FIXES' }, ['bug in a.js']);

    assert.ok(prompt.includes('# Fix: Code Review Issues'), 'Should include code review heading');
  });

  test('includes correct heading for final-verify', () => {
    const prompt = buildFinalizeFixPrompt('final-verify', { status: 'FAIL' }, ['npm test failed']);

    assert.ok(prompt.includes('# Fix: Final Verification Issues'), 'Should include final verify heading');
  });

  test('lists all issues', () => {
    const issues = ['[error] a.js:10 — missing check', '[warning] b.js:20 — unused var'];
    const prompt = buildFinalizeFixPrompt('code-review', {}, issues);

    assert.ok(prompt.includes('missing check'), 'Should include first issue');
    assert.ok(prompt.includes('unused var'), 'Should include second issue');
  });

  test('includes original result as JSON', () => {
    const stepResult = { verdict: 'NEEDS_FIXES', issues: [{ file: 'x.js' }] };
    const prompt = buildFinalizeFixPrompt('code-review', stepResult, ['issue']);

    assert.ok(prompt.includes('## Original Result'), 'Should include Original Result section');
    assert.ok(prompt.includes('"verdict": "NEEDS_FIXES"'), 'Should include serialized result');
  });

  test('includes fix-only instructions', () => {
    const prompt = buildFinalizeFixPrompt('code-review', {}, ['issue']);

    assert.ok(prompt.includes('## Instructions'), 'Should include Instructions section');
    assert.ok(prompt.includes('Fix ONLY the issues listed above'), 'Should include fix-only instruction');
    assert.ok(prompt.includes('Do not refactor or change other code'), 'Should include no-refactor instruction');
  });

  test('shows (none) when no issues', () => {
    const prompt = buildFinalizeFixPrompt('code-review', {}, []);

    assert.ok(prompt.includes('(none)'), 'Should show (none) for empty issues');
  });

  test('is deterministic (same input produces same output)', () => {
    const result = { verdict: 'NEEDS_FIXES' };
    const issues = ['issue 1'];

    const prompt1 = buildFinalizeFixPrompt('code-review', result, issues);
    const prompt2 = buildFinalizeFixPrompt('code-review', result, issues);

    assert.equal(prompt1, prompt2, 'Same input must produce identical output');
  });
});
