/**
 * Schema validation tests for dev-spec v5 and v4.
 *
 * Run: node --test cli/tests/schema.test.mjs
 *
 * Tests use AJV directly (loadSchema/validateSpec are not exported from spec.js).
 * All 10 tests cover: v5 pass, v4 compat, missing fields, enum violation,
 * schema routing, case sensitivity, empty tasks, unknown fields,
 * nested scenario required fields, requirement.source.ref format.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load schemas via createRequire (JSON imports with assertions may vary by Node version)
const require = createRequire(import.meta.url);
const v4Schema = require(join(__dirname, '../schemas/dev-spec-v4.schema.json'));
const v5Schema = require(join(__dirname, '../schemas/dev-spec-v5.schema.json'));

// Lazy-import Ajv to avoid top-level await issues
const { default: Ajv2020 } = await import('ajv/dist/2020.js');
const { default: addFormats } = await import('ajv-formats');

/**
 * Build a compiled AJV validator for the given schema.
 */
function buildValidator(schema) {
  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

/**
 * Mirror of spec.js loadSchema logic:
 * - specData.meta.schema_version === 'v4' → v4 schema
 * - anything else (v5, undefined, null) → v5 schema
 */
function selectSchema(specData) {
  if (specData?.meta?.schema_version === 'v4') {
    return v4Schema;
  }
  return v5Schema;
}

// Minimal valid v5 task
const minimalTask = {
  id: 'T1',
  action: 'Do something',
  type: 'work',
};

// Minimal valid v5 spec
function makeV5(overrides = {}) {
  return {
    meta: { name: 'test-spec', goal: 'Test goal', schema_version: 'v5' },
    tasks: [{ ...minimalTask }],
    ...overrides,
  };
}

// Minimal valid v4 spec (no source on requirements, no auto_merged on known_gaps)
function makeV4(overrides = {}) {
  return {
    meta: { name: 'test-spec-v4', goal: 'Test goal v4', schema_version: 'v4' },
    tasks: [{ ...minimalTask }],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: valid v5 spec passes validation
// ─────────────────────────────────────────────────────────────────────────────
test('valid v5 spec passes validation', () => {
  const spec = makeV5();
  const validate = buildValidator(v5Schema);
  const valid = validate(spec);
  assert.equal(valid, true, `Validation errors: ${JSON.stringify(validate.errors)}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: valid v4 spec passes (backward compat)
// ─────────────────────────────────────────────────────────────────────────────
test('valid v4 spec passes validation (backward compat)', () => {
  const spec = makeV4();
  const validate = buildValidator(v4Schema);
  const valid = validate(spec);
  assert.equal(valid, true, `Validation errors: ${JSON.stringify(validate.errors)}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: missing meta.goal fails with clear error
// ─────────────────────────────────────────────────────────────────────────────
test('missing meta.goal fails with clear error', () => {
  const spec = {
    meta: { name: 'test-spec' }, // goal is missing
    tasks: [{ ...minimalTask }],
  };
  const validate = buildValidator(v5Schema);
  const valid = validate(spec);
  assert.equal(valid, false, 'Expected validation to fail');
  assert.ok(validate.errors, 'Expected errors array');
  const hasGoalError = validate.errors.some(
    (e) => e.instancePath === '/meta' && e.message && e.message.includes('goal')
  );
  assert.ok(hasGoalError, `Expected error about missing 'goal', got: ${JSON.stringify(validate.errors)}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: invalid task.status enum value rejected
// ─────────────────────────────────────────────────────────────────────────────
test('invalid task.status enum value is rejected', () => {
  const spec = makeV5({
    tasks: [{ id: 'T1', action: 'Do it', type: 'work', status: 'INVALID_STATUS' }],
  });
  const validate = buildValidator(v5Schema);
  const valid = validate(spec);
  assert.equal(valid, false, 'Expected validation to fail for bad enum');
  assert.ok(validate.errors, 'Expected errors array');
  const hasEnumError = validate.errors.some(
    (e) => e.instancePath === '/tasks/0/status'
  );
  assert.ok(hasEnumError, `Expected enum error at /tasks/0/status, got: ${JSON.stringify(validate.errors)}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: schema_version routing (v4 → v4 schema, undefined/v5 → v5 schema)
// ─────────────────────────────────────────────────────────────────────────────
test('schema_version routing: v4 routes to v4 schema, undefined routes to v5', () => {
  // v4 routing
  const v4Spec = makeV4();
  assert.equal(selectSchema(v4Spec), v4Schema, 'v4 spec should route to v4 schema');

  // v5 explicit routing
  const v5Spec = makeV5();
  assert.equal(selectSchema(v5Spec), v5Schema, 'v5 spec should route to v5 schema');

  // undefined schema_version → v5 (default)
  const noVersionSpec = { meta: { name: 'x', goal: 'y' }, tasks: [minimalTask] };
  assert.equal(selectSchema(noVersionSpec), v5Schema, 'no schema_version should default to v5');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: case sensitivity — 'V4' (uppercase) does NOT route to v4 schema
// ─────────────────────────────────────────────────────────────────────────────
test('schema_version routing is case-sensitive (V4 != v4)', () => {
  const upperCaseSpec = {
    meta: { name: 'x', goal: 'y', schema_version: 'V4' },
    tasks: [{ ...minimalTask }],
  };
  // selectSchema checks for exact 'v4' string — 'V4' falls through to v5
  assert.equal(selectSchema(upperCaseSpec), v5Schema, "'V4' should fall through to v5 schema (not v4)");

  // Furthermore, 'V4' is not a valid enum value in the v5 schema (only 'v4' and 'v5' are)
  const validate = buildValidator(v5Schema);
  const valid = validate(upperCaseSpec);
  assert.equal(valid, false, "Expected schema validation to reject 'V4' enum value");
  const hasEnumError = validate.errors.some(
    (e) => e.instancePath === '/meta/schema_version'
  );
  assert.ok(hasEnumError, `Expected enum error at /meta/schema_version for 'V4'`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: empty tasks array is invalid (minItems: 1)
// ─────────────────────────────────────────────────────────────────────────────
test('empty tasks array fails validation (minItems: 1 required)', () => {
  const spec = makeV5({ tasks: [] });
  const validate = buildValidator(v5Schema);
  const valid = validate(spec);
  assert.equal(valid, false, 'Expected empty tasks array to fail validation');
  assert.ok(validate.errors, 'Expected errors array');
  const hasMinItemsError = validate.errors.some(
    (e) => e.instancePath === '/tasks'
  );
  assert.ok(hasMinItemsError, `Expected minItems error at /tasks, got: ${JSON.stringify(validate.errors)}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 8: unknown top-level fields fail (additionalProperties: false)
// ─────────────────────────────────────────────────────────────────────────────
test('unknown top-level fields are rejected (additionalProperties: false)', () => {
  const spec = makeV5({ unknown_field: 'should not be here' });
  const validate = buildValidator(v5Schema);
  const valid = validate(spec);
  assert.equal(valid, false, 'Expected validation to reject unknown top-level field');
  assert.ok(validate.errors, 'Expected errors array');
  const hasAdditionalPropError = validate.errors.some(
    (e) => e.keyword === 'additionalProperties'
  );
  assert.ok(hasAdditionalPropError, `Expected additionalProperties error, got: ${JSON.stringify(validate.errors)}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 9: nested scenario requires given/when/then fields
// ─────────────────────────────────────────────────────────────────────────────
test('nested scenario missing required given/when/then fields fails validation', () => {
  const spec = makeV5({
    requirements: [
      {
        id: 'R1',
        behavior: 'Some behavior',
        priority: 1,
        scenarios: [
          {
            id: 'R1-S1',
            // given is missing
            when: 'something happens',
            then: 'result is correct',
            verified_by: 'agent',
            verify: { type: 'assertion', checks: ['output matches'] },
          },
        ],
      },
    ],
  });
  const validate = buildValidator(v5Schema);
  const valid = validate(spec);
  assert.equal(valid, false, 'Expected validation to fail for missing scenario.given');
  assert.ok(validate.errors, 'Expected errors array');
  const hasGivenError = validate.errors.some(
    (e) => e.instancePath === '/requirements/0/scenarios/0' && e.message && e.message.includes('given')
  );
  assert.ok(hasGivenError, `Expected error about missing 'given', got: ${JSON.stringify(validate.errors)}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 10: sandbox_capability in context passes validation
// ─────────────────────────────────────────────────────────────────────────────
test('context.sandbox_capability with all fields passes validation', () => {
  const spec = makeV5({
    context: {
      request: 'Build iOS app',
      sandbox_capability: {
        docker: false,
        browser: false,
        simulator: true,
        desktop: true,
        tools: ['xcrun simctl', 'macos-automator-mcp'],
        confirmed_at: '2026-03-19',
        detected: true,
        scaffold_required: false,
      },
    },
  });
  const validate = buildValidator(v5Schema);
  const valid = validate(spec);
  assert.equal(valid, true, `Validation errors: ${JSON.stringify(validate.errors)}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 11: sandbox_capability with only partial fields passes (all optional)
// ─────────────────────────────────────────────────────────────────────────────
test('context.sandbox_capability with partial fields passes validation', () => {
  const spec = makeV5({
    context: {
      sandbox_capability: {
        docker: true,
        browser: true,
        confirmed_at: '2026-03-19',
      },
    },
  });
  const validate = buildValidator(v5Schema);
  const valid = validate(spec);
  assert.equal(valid, true, `Validation errors: ${JSON.stringify(validate.errors)}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 12: sandbox_capability rejects unknown fields (additionalProperties: false)
// ─────────────────────────────────────────────────────────────────────────────
test('context.sandbox_capability rejects unknown fields', () => {
  const spec = makeV5({
    context: {
      sandbox_capability: {
        docker: true,
        unknown_sandbox_field: 'oops',
      },
    },
  });
  const validate = buildValidator(v5Schema);
  const valid = validate(spec);
  assert.equal(valid, false, 'Expected validation to reject unknown sandbox_capability field');
  assert.ok(validate.errors.some((e) => e.keyword === 'additionalProperties'));
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 13: requirement.source.ref must be a string (type validation)
// ─────────────────────────────────────────────────────────────────────────────
// (renumbered from Test 10)
test('requirement.source.ref must be a string (integer rejected)', () => {
  const spec = makeV5({
    requirements: [
      {
        id: 'R1',
        behavior: 'Some behavior',
        priority: 1,
        source: {
          type: 'decision',
          ref: 123, // must be string, not integer
        },
        scenarios: [],
      },
    ],
  });
  const validate = buildValidator(v5Schema);
  const valid = validate(spec);
  assert.equal(valid, false, 'Expected validation to fail for non-string source.ref');
  assert.ok(validate.errors, 'Expected errors array');
  const hasRefError = validate.errors.some(
    (e) => e.instancePath === '/requirements/0/source/ref'
  );
  assert.ok(hasRefError, `Expected type error at /requirements/0/source/ref, got: ${JSON.stringify(validate.errors)}`);
});
