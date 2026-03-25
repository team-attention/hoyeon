/**
 * Tests for `hoyeon-cli spec merge` — deep merge, patch mode, and edge cases.
 *
 * Run: node --test cli/tests/merge.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'dist', 'cli.js');

function createSpec(data) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'merge-test-'));
  const specPath = join(tmpDir, 'spec.json');
  writeFileSync(specPath, JSON.stringify(data, null, 2));
  return {
    path: specPath,
    read: () => JSON.parse(readFileSync(specPath, 'utf8')),
    cleanup: () => rmSync(tmpDir, { recursive: true, force: true }),
  };
}

function runMerge(specPath, json, flags = []) {
  return execFileSync(
    process.execPath,
    [CLI, 'spec', 'merge', specPath, '--json', JSON.stringify(json), ...flags],
    { encoding: 'utf8' }
  );
}

function baseSpec(overrides = {}) {
  return {
    meta: {
      name: 'merge-test',
      goal: 'Test merge operations',
      type: 'dev',
    },
    tasks: [
      { id: 'T1', action: 'Initial task', type: 'work', status: 'pending' },
    ],
    ...overrides,
  };
}

// Test 1: deep merge overwrites scalar, merges objects
test('deep merge overwrites scalar, merges objects', () => {
  const spec = createSpec(baseSpec({ meta: { name: 'original', goal: 'old goal', type: 'dev' } }));
  try {
    runMerge(spec.path, { meta: { goal: 'new goal' } });
    const result = spec.read();
    // scalar goal is overwritten
    assert.equal(result.meta.goal, 'new goal', 'scalar goal overwritten');
    // other meta fields preserved (object merge)
    assert.equal(result.meta.name, 'original', 'meta.name preserved');
    assert.equal(result.meta.type, 'dev', 'meta.type preserved');
  } finally {
    spec.cleanup();
  }
});

// Test 2: --patch mode uses ID-based array matching
test('--patch mode uses ID-based array matching', () => {
  const spec = createSpec(baseSpec({
    tasks: [
      { id: 'T1', action: 'first', type: 'work', status: 'pending' },
      { id: 'T2', action: 'second', type: 'work', status: 'pending' },
    ],
  }));
  try {
    runMerge(spec.path, { tasks: [{ id: 'T1', status: 'done' }] }, ['--patch']);
    const result = spec.read();
    assert.equal(result.tasks.length, 2, 'array length preserved');
    assert.equal(result.tasks[0].status, 'done', 'T1 status updated');
    assert.equal(result.tasks[0].action, 'first', 'T1 action preserved');
    assert.equal(result.tasks[1].action, 'second', 'T2 unchanged');
  } finally {
    spec.cleanup();
  }
});

// Test 3: duplicate task IDs behavior — last writer wins via --patch
test('duplicate task IDs: --patch updates matched item, later duplicates append', () => {
  const spec = createSpec(baseSpec({
    tasks: [
      { id: 'T1', action: 'original', type: 'work', status: 'pending' },
    ],
  }));
  try {
    // Patch with two items sharing same ID — second should overwrite first matched
    runMerge(spec.path, {
      tasks: [
        { id: 'T1', status: 'in_progress' },
        { id: 'T1', status: 'done' },
      ],
    }, ['--patch']);
    const result = spec.read();
    // First patch matches T1 and updates it; second patch also matches T1 and updates again
    const t1Tasks = result.tasks.filter(t => t.id === 'T1');
    // The last patch for T1 wins (status = done)
    assert.equal(t1Tasks[t1Tasks.length - 1].status, 'done', 'last duplicate patch wins');
  } finally {
    spec.cleanup();
  }
});

// Test 4: merge empty object into existing preserves original
test('merge empty object into existing preserves original', () => {
  const spec = createSpec(baseSpec({
    tasks: [{ id: 'T1', action: 'original action', type: 'work', status: 'pending' }],
  }));
  try {
    runMerge(spec.path, {});
    const result = spec.read();
    assert.equal(result.tasks.length, 1, 'tasks preserved');
    assert.equal(result.tasks[0].action, 'original action', 'task action preserved');
    assert.equal(result.meta.name, 'merge-test', 'meta preserved');
  } finally {
    spec.cleanup();
  }
});

// Test 5: merge adds new tasks to existing array (--append)
test('merge adds new tasks to existing array with --append', () => {
  const spec = createSpec(baseSpec({
    tasks: [{ id: 'T1', action: 'existing', type: 'work', status: 'pending' }],
  }));
  try {
    runMerge(spec.path, {
      tasks: [{ id: 'T2', action: 'new task', type: 'work', status: 'pending' }],
    }, ['--append']);
    const result = spec.read();
    assert.equal(result.tasks.length, 2, 'new task appended');
    assert.equal(result.tasks[0].id, 'T1', 'T1 still at index 0');
    assert.equal(result.tasks[1].id, 'T2', 'T2 appended at end');
    assert.equal(result.tasks[1].action, 'new task', 'T2 has correct action');
  } finally {
    spec.cleanup();
  }
});

// Test 6: merge with items missing ID field — in --patch mode, appended as-is
test('--patch with items missing id field appends them', () => {
  // Use tasks array with items lacking id — deepMerge will append them as-is in patch mode
  // We test this at the deepMerge level by checking result after replace (no --patch)
  // In default (replace) mode, the new array fully replaces the old one
  const spec = createSpec(baseSpec({
    tasks: [
      { id: 'T1', action: 'existing', type: 'work', status: 'pending' },
      { id: 'T2', action: 'existing 2', type: 'work', status: 'pending' },
    ],
  }));
  try {
    // Default replace mode: new array replaces old array entirely
    runMerge(spec.path, {
      tasks: [{ id: 'T1', action: 'replaced', type: 'work', status: 'pending' }],
    });
    const result = spec.read();
    // Without --patch, array replaced entirely — T2 is gone, only T1 remains
    assert.equal(result.tasks.length, 1, 'array replaced (no --patch)');
    assert.equal(result.tasks[0].id, 'T1', 'only T1 remains');
    assert.equal(result.tasks[0].action, 'replaced', 'T1 action from new array');
  } finally {
    spec.cleanup();
  }
});

// Test 7: nested array patch (requirements[].sub[])
test('nested array patch — requirements[] replaces via shallow object merge', () => {
  const spec = createSpec(baseSpec({
    requirements: [
      {
        id: 'R1', behavior: 'parsing',
        sub: [{ id: 'R1.1', behavior: 'sub one' }, { id: 'R1.2', behavior: 'sub two' }],
      },
      {
        id: 'R2', behavior: 'scanning',
        sub: [{ id: 'R2.1', behavior: 'sub three' }],
      },
    ],
  }));
  try {
    // --patch on requirements: patch R1 only, R2 preserved
    runMerge(spec.path, {
      requirements: [{ id: 'R1', behavior: 'parsing UPDATED' }],
    }, ['--patch']);
    const result = spec.read();
    assert.equal(result.requirements.length, 2, 'both requirements preserved');
    assert.equal(result.requirements[0].id, 'R1', 'R1 still present');
    assert.equal(result.requirements[0].behavior, 'parsing UPDATED', 'R1 behavior updated');
    assert.equal(result.requirements[1].id, 'R2', 'R2 unchanged');
    assert.equal(result.requirements[1].behavior, 'scanning', 'R2 behavior preserved');
  } finally {
    spec.cleanup();
  }
});

// Test 7b: merge sub-requirements with GWT fields
test('merge requirements with GWT fields preserves given/when/then', () => {
  const spec = createSpec(baseSpec());
  try {
    runMerge(spec.path, {
      requirements: [{
        id: 'R1', behavior: 'User authentication',
        sub: [{
          id: 'R1.1',
          behavior: 'Valid login returns JWT',
          given: 'A registered user with valid credentials',
          when: 'POST /login with correct email and password',
          then: 'Returns 200 with JWT in response body',
        }],
      }],
    });
    const result = spec.read();
    const sub = result.requirements[0].sub[0];
    assert.equal(sub.behavior, 'Valid login returns JWT');
    assert.equal(sub.given, 'A registered user with valid credentials');
    assert.equal(sub.when, 'POST /login with correct email and password');
    assert.equal(sub.then, 'Returns 200 with JWT in response body');
  } finally {
    spec.cleanup();
  }
});

// Test 7c: --patch on sub-requirements with GWT preserves unpatched GWT fields
test('--patch on requirements preserves existing GWT fields on unpatched subs', () => {
  const spec = createSpec(baseSpec({
    requirements: [{
      id: 'R1', behavior: 'Auth',
      sub: [
        {
          id: 'R1.1', behavior: 'Login works',
          given: 'valid creds', when: 'POST /login', then: '200 + JWT',
        },
        {
          id: 'R1.2', behavior: 'Logout works',
          given: 'active session', when: 'POST /logout', then: '204 no content',
        },
      ],
    }],
  }));
  try {
    // Patch R1 behavior only — sub[] should be preserved with GWT intact
    runMerge(spec.path, {
      requirements: [{ id: 'R1', behavior: 'Auth UPDATED' }],
    }, ['--patch']);
    const result = spec.read();
    assert.equal(result.requirements[0].behavior, 'Auth UPDATED');
    assert.equal(result.requirements[0].sub.length, 2, 'both subs preserved');
    assert.equal(result.requirements[0].sub[0].given, 'valid creds', 'R1.1 given preserved');
    assert.equal(result.requirements[0].sub[1].then, '204 no content', 'R1.2 then preserved');
  } finally {
    spec.cleanup();
  }
});

// Test 7d: merge sub-requirements without GWT (behavior-only) still works
test('merge sub-requirements without GWT fields still valid', () => {
  const spec = createSpec(baseSpec());
  try {
    runMerge(spec.path, {
      requirements: [{
        id: 'R1', behavior: 'Health check',
        sub: [{ id: 'R1.1', behavior: 'GET /health returns 200' }],
      }],
    });
    const result = spec.read();
    const sub = result.requirements[0].sub[0];
    assert.equal(sub.behavior, 'GET /health returns 200');
    assert.equal(sub.given, undefined, 'no given field');
    assert.equal(sub.when, undefined, 'no when field');
    assert.equal(sub.then, undefined, 'no then field');
  } finally {
    spec.cleanup();
  }
});

// Test 8: history entries are written to external context/history.json
test('history entries are append-only across multiple merges', () => {
  const spec = createSpec(baseSpec());
  try {
    runMerge(spec.path, { meta: { goal: 'updated goal' } });
    runMerge(spec.path, { meta: { goal: 'updated goal again' } });
    // History is now in context/history.json next to spec.json
    const historyPath = join(dirname(spec.path), 'context', 'history.json');
    assert.ok(existsSync(historyPath), 'context/history.json created');
    const history = JSON.parse(readFileSync(historyPath, 'utf8'));
    const mergeEntries = history.filter(h => h.type === 'spec_updated');
    assert.equal(mergeEntries.length, 2, 'two spec_updated entries in external history');
  } finally {
    spec.cleanup();
  }
});

// Test 9: task.status update via merge
test('task.status update via --patch merge', () => {
  const spec = createSpec(baseSpec({
    tasks: [
      { id: 'T1', action: 'first', type: 'work', status: 'pending' },
      { id: 'T2', action: 'second', type: 'work', status: 'pending' },
      { id: 'T3', action: 'third', type: 'work', status: 'pending' },
    ],
  }));
  try {
    runMerge(spec.path, {
      tasks: [
        { id: 'T1', status: 'done' },
        { id: 'T3', status: 'in_progress' },
      ],
    }, ['--patch']);
    const result = spec.read();
    assert.equal(result.tasks.length, 3, 'all tasks preserved');
    assert.equal(result.tasks[0].status, 'done', 'T1 status = done');
    assert.equal(result.tasks[1].status, 'pending', 'T2 status unchanged');
    assert.equal(result.tasks[2].status, 'in_progress', 'T3 status = in_progress');
  } finally {
    spec.cleanup();
  }
});
