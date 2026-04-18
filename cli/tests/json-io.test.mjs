import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { validatePlan, mergePlan } from '../src/lib/json-io.js';

const MINIMAL = {
  schema: 'plan/v1',
  meta: { type: 'greenfield', goal: 'X' },
  tasks: [
    { id: 'T1', action: 'do', depends_on: [], fulfills: ['R-U1.1'] },
  ],
  verify_plan: [
    { target: 'R-U1.1', type: 'sub_req', gates: [1, 2] },
  ],
};

test('validatePlan accepts minimal valid plan', () => {
  const { ok, errors } = validatePlan(MINIMAL);
  assert.equal(ok, true, JSON.stringify(errors));
});

test('validatePlan rejects malformed task id', () => {
  const bad = structuredClone(MINIMAL);
  bad.tasks[0].id = 'not-a-task-id';
  const { ok } = validatePlan(bad);
  assert.equal(ok, false);
});

test('validatePlan rejects bad fulfills pattern', () => {
  const bad = structuredClone(MINIMAL);
  bad.tasks[0].fulfills = ['R-GHOST.1']; // lowercase/odd; must match ^R-[A-Z]\d+…
  bad.tasks[0].fulfills = ['not-a-req'];
  const { ok } = validatePlan(bad);
  assert.equal(ok, false);
});

test('validatePlan rejects gate out of 1-4', () => {
  const bad = structuredClone(MINIMAL);
  bad.verify_plan[0].gates = [1, 5];
  const { ok } = validatePlan(bad);
  assert.equal(ok, false);
});

test('validatePlan rejects verify_plan target that doesn\'t match R-X.Y or J\\d+', () => {
  const bad = structuredClone(MINIMAL);
  bad.verify_plan[0].target = 'not-an-id';
  const { ok } = validatePlan(bad);
  assert.equal(ok, false);
});

test('validatePlan accepts a journey entry in verify_plan', () => {
  const good = structuredClone(MINIMAL);
  good.journeys = [
    {
      id: 'J1',
      name: 'flow',
      composes: ['R-U1.1', 'R-T1.1'],
      given: 'g', when: 'w', then: 't',
    },
  ];
  good.verify_plan.push({ target: 'J1', type: 'journey', gates: [1, 2, 3] });
  // also need the composed sub_req to exist in verify_plan for validate (internal cross-ref)
  good.verify_plan.push({ target: 'R-T1.1', type: 'sub_req', gates: [1, 2] });
  const { ok, errors } = validatePlan(good);
  assert.equal(ok, true, JSON.stringify(errors));
});

test('validatePlan rejects journey composes with fewer than 2 items', () => {
  const bad = structuredClone(MINIMAL);
  bad.journeys = [
    { id: 'J1', name: 'x', composes: ['R-U1.1'], given: 'g', when: 'w', then: 't' },
  ];
  const { ok } = validatePlan(bad);
  assert.equal(ok, false);
});

test('mergePlan replace mode overwrites top-level keys', () => {
  const merged = mergePlan(MINIMAL, { tasks: [] }, 'replace');
  assert.equal(merged.tasks.length, 0);
  assert.equal(merged.meta.goal, 'X');
});

test('mergePlan append pushes into arrays', () => {
  const merged = mergePlan(MINIMAL, {
    tasks: [{ id: 'T2', action: 'y', depends_on: [] }],
  }, 'append');
  assert.equal(merged.tasks.length, 2);
});

test('mergePlan patch merges array items by id', () => {
  const merged = mergePlan(MINIMAL, {
    tasks: [{ id: 'T1', status: 'completed' }],
  }, 'patch');
  assert.equal(merged.tasks.length, 1);
  assert.equal(merged.tasks[0].action, 'do');
  assert.equal(merged.tasks[0].status, 'completed');
});
