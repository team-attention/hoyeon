import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CLI = resolve(import.meta.dirname, '../dist/cli.js');
const TMP = resolve(import.meta.dirname, '../.tmp-v1-test');
const SPEC = resolve(TMP, 'spec.json');

function run(cmd) {
  return execSync(`node ${CLI} ${cmd}`, { encoding: 'utf8', cwd: TMP });
}

function runFail(cmd) {
  try {
    execSync(`node ${CLI} ${cmd}`, { encoding: 'utf8', cwd: TMP, stdio: 'pipe' });
    assert.fail('Expected command to fail');
  } catch (e) {
    return e.stderr || e.stdout || '';
  }
}

function readSpec() {
  return JSON.parse(readFileSync(SPEC, 'utf8'));
}

describe('v1 schema', () => {
  before(() => {
    mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('spec init with --schema v1 creates valid spec', () => {
    run(`spec init test-v1 --goal "Test v1" --schema v1 --type dev ${SPEC}`);
    const spec = readSpec();
    assert.equal(spec.meta.schema_version, 'v1');
    assert.equal(spec.meta.name, 'test-v1');
  });

  it('spec validate passes on fresh v1 spec', () => {
    const out = run(`spec validate ${SPEC}`);
    assert.match(out, /Coverage passed/);
  });

  it('spec merge --stdin works', () => {
    execSync(
      `echo '{"context":{"confirmed_goal":"Build a test system"}}' | node ${CLI} spec merge ${SPEC} --stdin`,
      { encoding: 'utf8', cwd: TMP }
    );
    const spec = readSpec();
    assert.equal(spec.context.confirmed_goal, 'Build a test system');
  });

  it('spec merge --stdin --append adds decisions', () => {
    execSync(
      `echo '{"context":{"decisions":[{"id":"D1","decision":"Use v1","rationale":"Simpler"}]}}' | node ${CLI} spec merge ${SPEC} --stdin --append`,
      { encoding: 'utf8', cwd: TMP }
    );
    const spec = readSpec();
    assert.equal(spec.context.decisions.length, 1);
    assert.equal(spec.context.decisions[0].id, 'D1');
  });

  it('spec merge appends second decision', () => {
    execSync(
      `echo '{"context":{"decisions":[{"id":"D2","decision":"TBD","rationale":"User unsure"}]}}' | node ${CLI} spec merge ${SPEC} --stdin --append`,
      { encoding: 'utf8', cwd: TMP }
    );
    const spec = readSpec();
    assert.equal(spec.context.decisions.length, 2);
    assert.equal(spec.context.decisions[1].id, 'D2');
  });

  it('spec merge constraints with v1 schema', () => {
    execSync(
      `echo '{"constraints":[{"id":"C1","rule":"No breaking changes"}]}' | node ${CLI} spec merge ${SPEC} --stdin`,
      { encoding: 'utf8', cwd: TMP }
    );
    const spec = readSpec();
    assert.equal(spec.constraints[0].rule, 'No breaking changes');
  });

  it('spec merge requirements works', () => {
    execSync(
      `echo '{"requirements":[{"id":"R1","behavior":"Use v1 schema","sub":[{"id":"R1.1","behavior":"All specs use v1"}]},{"id":"R2","behavior":"JSON storage","sub":[{"id":"R2.1","behavior":"Valid JSON output"}]}]}' | node ${CLI} spec merge ${SPEC} --stdin`,
      { encoding: 'utf8', cwd: TMP }
    );
    const spec = readSpec();
    assert.equal(spec.requirements.length, 2);
    assert.equal(spec.requirements[0].sub.length, 1);
  });

  it('spec derive-tasks creates stubs from requirements', () => {
    const out = run(`spec derive-tasks ${SPEC}`);
    assert.match(out, /Derived 2 tasks/); // T1 + T2 (no TF — Final Verify handles holistic verification)
    const spec = readSpec();
    assert.equal(spec.tasks.length, 2);
    assert.equal(spec.tasks[0].id, 'T1');
    assert.equal(spec.tasks[1].id, 'T2');
  });

  it('spec validate passes after derive-tasks', () => {
    const out = run(`spec validate ${SPEC}`);
    assert.match(out, /Coverage passed/);
  });

  it('spec guide --schema v1 shows schema', () => {
    const out = run('spec guide constraints --schema v1');
    assert.match(out, /required: id, rule/);
  });

  it('sub-requirements with given/when/then fields pass v1 schema validation', () => {
    execSync(
      `echo '{"requirements":[{"id":"R1","behavior":"GWT test","sub":[{"id":"R1.1","behavior":"User login with valid credentials","given":"a registered user on the login page","when":"the user submits valid credentials","then":"the user is redirected to the dashboard"}]}]}' | node ${CLI} spec merge ${SPEC} --stdin`,
      { encoding: 'utf8', cwd: TMP }
    );
    const out = run(`spec validate ${SPEC}`);
    assert.match(out, /Coverage passed/);
    const spec = readSpec();
    const sub = spec.requirements[0].sub[0];
    assert.equal(sub.given, 'a registered user on the login page');
    assert.equal(sub.when, 'the user submits valid credentials');
    assert.equal(sub.then, 'the user is redirected to the dashboard');
    assert.equal(sub.behavior, 'User login with valid credentials');
  });

  it('sub-requirements with only behavior (no GWT) still pass validation', () => {
    execSync(
      `echo '{"requirements":[{"id":"R1","behavior":"Behavior-only test","sub":[{"id":"R1.1","behavior":"System returns 200 on health check"}]}]}' | node ${CLI} spec merge ${SPEC} --stdin`,
      { encoding: 'utf8', cwd: TMP }
    );
    const out = run(`spec validate ${SPEC}`);
    assert.match(out, /Coverage passed/);
    const spec = readSpec();
    const sub = spec.requirements[0].sub[0];
    assert.equal(sub.behavior, 'System returns 200 on health check');
    assert.equal(sub.given, undefined);
    assert.equal(sub.when, undefined);
    assert.equal(sub.then, undefined);
  });

  it('sub-requirements with unknown extra fields fail validation (additionalProperties)', () => {
    // Save current spec, write invalid one, test, then restore
    const originalSpec = readFileSync(SPEC, 'utf8');
    const spec = readSpec();
    spec.requirements = [{
      id: 'R1', behavior: 'Bad sub test',
      sub: [{ id: 'R1.1', behavior: 'has extra field', extraField: 'should fail' }],
    }];
    writeFileSync(SPEC, JSON.stringify(spec, null, 2));
    const out = runFail(`spec validate ${SPEC}`);
    // Restore original spec so subsequent tests are not affected
    writeFileSync(SPEC, originalSpec);
    // The validation should fail due to additionalProperties
    assert.match(out, /must NOT have additional properties/);
  });

  it('known_gaps is string array in v1', () => {
    execSync(
      `echo '{"context":{"known_gaps":["Performance TBD","Mobile layout undecided"]}}' | node ${CLI} spec merge ${SPEC} --stdin --append`,
      { encoding: 'utf8', cwd: TMP }
    );
    const spec = readSpec();
    assert.equal(spec.context.known_gaps.length, 2);
    assert.equal(typeof spec.context.known_gaps[0], 'string');
  });
});
