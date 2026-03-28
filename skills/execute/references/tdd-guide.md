# TDD Guide for Workers

This guide is loaded when `TDD Mode: ON` is present in the Worker description.
Workers read this file at Step 4 (Implement) to follow test-driven development.

---

## Phase 0: Detect Test Infrastructure

Before writing any tests, understand what the project already has.

```
1. package.json scripts → "test", "test:unit", "test:e2e", "test:integration"
2. Config files → jest.config.*, vitest.config.*, pytest.ini, pyproject.toml
3. Test directories → __tests__/, test/, tests/, spec/
4. Existing test files → *.test.*, *.spec.*, *_test.*
5. Test runner → extract from scripts or config (jest, vitest, pytest, go test)
```

**Conflict resolution**: If multiple configs exist, use the runner referenced in `package.json` `"test"` script. If no `"test"` script, prefer the most recently modified config. If still ambiguous, prefer vitest > jest (faster, ESM-native).

### No test infra? Bootstrap minimally

**NEVER install a new test runner if ANY test runner is already a direct or transitive dependency.** If the project has a lockfile (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`), do NOT run install commands that modify it — report as BLOCKED instead.

| Stack | Runner | Setup |
|-------|--------|-------|
| Node.js (ESM/CJS) | vitest | `npm install -D vitest` + add `"test": "vitest run"` to scripts |
| Node.js (existing jest) | jest | Use existing config, add test files only |
| Python | pytest | `pip install pytest` + create `tests/` dir |
| Go | go test | Built-in, create `*_test.go` files |
| Rust | cargo test | Built-in, add `#[cfg(test)]` modules |

> **Out of scope**: React Native, native mobile, and platform-specific testing. This guide covers server-side, CLI, and web frontend use cases.

Do NOT over-engineer test setup. One command to install, one command to run.

**DONE when**: Test runner command identified and test file location pattern determined.

---

## Phase 1: RED — Write Failing Tests

### Step 1: Map sub-requirements to test cases

Read `fulfills[]` → requirements → `sub[]`. If a sub-req has GWT fields (`given`, `when`, `then`), use them as the primary test structure. Otherwise, derive test cases from the `behavior` field.

**GWT-to-test mapping:**
- `given` → **Arrange/Setup** — establish preconditions (test fixtures, state, mocks)
- `when` → **Act** — execute the action under test
- `then` → **Assert** — verify the expected outcome

**Example: GWT sub-req → test case**

Sub-req:
```json
{
  "id": "R1.1",
  "behavior": "Expired trial users are downgraded",
  "given": "a user with plan 'pro_trial' and trial_ends_at in the past",
  "when": "the trial expiration scheduler runs",
  "then": "the user's plan is updated to 'free'"
}
```

Test:
```typescript
test('expired trial users are downgraded to free', async () => {
  // given: a user with plan 'pro_trial' and trial_ends_at in the past
  await db.insert(users).values({
    id: 'test-user', plan: 'pro_trial',
    trial_ends_at: new Date('2020-01-01'),
  });

  // when: the trial expiration scheduler runs
  await trialExpirationScheduler.run();

  // then: the user's plan is updated to 'free'
  const user = await db.select().from(users).where(eq(users.id, 'test-user'));
  expect(user.plan).toBe('free');
});
```

**Rule: One sub-req = one `test()` block minimum.** If a behavior has multiple assertions, group them in one test. If it has distinct paths (happy/error), split into separate tests.

### Step 2: Choose test tier

Match the sub-req's GWT scenario (or behavior, if no GWT) to the right tier. **Default to E2E (outside-in).**

> **Strategy: Outside-In TDD** — Start from the highest tier that covers the behavior, then drill down only when needed. E2E tests catch integration issues early and verify real user flows. Add unit/integration tests only for complex logic that E2E alone cannot adequately cover.

**Tier selection priority** (try top-first, fall back only when inappropriate):

| Priority | Tier | When to use | Tools |
|----------|------|-------------|-------|
| 1st | **E2E** | User-facing flows, API endpoints, multi-step interactions, DB read/write via API | Playwright, Cypress, supertest (full stack) |
| 2nd | **Integration** | Internal service interactions not reachable via E2E, DB-only operations without API surface | supertest, httpx, real DB |
| 3rd | **Unit** | Pure logic, transforms, calculations, complex algorithms where E2E feedback is too slow/coarse | Direct function calls |

**When to drop down a tier:**
- E2E → Integration: No UI or API endpoint exists for the behavior (internal service only)
- E2E → Unit: Behavior is pure computation with many edge cases (e.g., date parsing, math)
- Integration → Unit: No external dependencies involved, function is self-contained

**When in doubt, go higher** — E2E tests verify real user experience and catch integration bugs that unit tests miss. See [VERIFICATION.md](../../../VERIFICATION.md) Tier 3 for E2E guidance.

### Step 3: Write the test file

**Placement rules** (in priority order):
1. Follow existing project conventions (look for patterns in existing test files)
2. Co-locate: `src/auth/login.ts` → `src/auth/login.test.ts`
3. Mirror in test dir: `src/auth/login.ts` → `test/auth/login.test.ts`

**Naming**: Match the source file name + `.test` or `.spec` suffix (whichever the project uses).

**TDD special case — source file does not exist yet:**
Write the test file first with the import path pointing to where the source file WILL be created. Use the project's existing directory structure as a guide. The import will fail (expected — this is part of RED). Proceed to Phase 2 where you create the source file at the imported path.

**Test data**: Use existing project test fixtures, factories, or seed data. If no pattern exists, use clearly-fake data (e.g., `test-user-${Date.now()}@example.com`). Do not hardcode credentials or PII.

### Examples by use case

#### Web Frontend (React/Vue)

```typescript
// Sub-req: "Dark mode toggle switches theme class on document.body"
import { render, fireEvent, screen } from '@testing-library/react';
import { ThemeToggle } from './ThemeToggle';

test('dark mode toggle switches theme class on body', () => {
  render(<ThemeToggle />);
  fireEvent.click(screen.getByRole('button', { name: /dark mode/i }));
  expect(document.body.classList.contains('dark')).toBe(true);
});
```

#### API Server (NestJS/Express/FastAPI)

```typescript
// Sub-req: "POST /login with valid credentials returns 200 + JWT"
import request from 'supertest';

test('POST /login with valid credentials returns 200 + JWT', async () => {
  const res = await request(app)
    .post('/login')
    .send({ email: 'user@test.com', password: 'valid123' });
  expect(res.status).toBe(200);
  expect(res.body.token).toBeDefined();
  expect(res.body.token).toMatch(/^eyJ/); // JWT prefix
});

// Sub-req: "POST /login with wrong password returns 401"
test('POST /login with wrong password returns 401', async () => {
  const res = await request(app)
    .post('/login')
    .send({ email: 'user@test.com', password: 'wrong' });
  expect(res.status).toBe(401);
});
```

#### Python API Server

```python
# Sub-req: "POST /login with valid credentials returns 200 + JWT"
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_login_returns_jwt(app):
    async with AsyncClient(app=app, base_url="http://test") as client:
        res = await client.post("/login", json={"email": "user@test.com", "password": "valid123"})
    assert res.status_code == 200
    assert res.json()["token"].startswith("eyJ")
```

#### CLI Tool

```typescript
// Sub-req: "Running `cli parse input.json` outputs valid CSV to stdout"
import { execSync } from 'child_process';

test('cli parse outputs valid CSV', () => {
  const output = execSync('node dist/cli.js parse test/fixtures/input.json', {
    encoding: 'utf-8',
  });
  const lines = output.trim().split('\n');
  expect(lines[0]).toBe('name,email,role'); // header
  expect(lines.length).toBeGreaterThan(1);  // has data rows
});
```

#### Database Operations

```typescript
// Sub-req: "Creating a project inserts a row with status 'active'"
// Wrap in transaction for test isolation
beforeEach(async () => { await db.query('BEGIN'); });
afterEach(async () => { await db.query('ROLLBACK'); });

test('creating a project inserts row with active status', async () => {
  const project = await projectService.create({ name: 'Test', ownerId: testUser.id });
  const row = await db.query('SELECT * FROM projects WHERE id = $1', [project.id]);
  expect(row.status).toBe('active');
  expect(row.name).toBe('Test');
});
```

#### Background Job / Worker Process

```typescript
// Sub-req: "Expired trial users are downgraded to free plan by scheduler"
beforeEach(async () => { await db.query('BEGIN'); });
afterEach(async () => { await db.query('ROLLBACK'); });

test('expired trial users are downgraded to free', async () => {
  await db.insert(users).values({
    id: 'test-user',
    plan: 'pro_trial',
    trial_ends_at: new Date('2020-01-01'),
  });

  await trialExpirationScheduler.run();

  const user = await db.select().from(users).where(eq(users.id, 'test-user'));
  expect(user.plan).toBe('free');
});
```

### Step 4: Run tests — confirm RED

```bash
# Run only the new test file (faster feedback)
npm test -- --testPathPattern="login.test"
# or
npx vitest run src/auth/login.test.ts
```

Tests MUST fail at this point. **Verify the failure is an assertion failure** (expected vs actual mismatch), NOT a compilation error, import error, or runtime crash. A test that fails because the file doesn't exist yet is acceptable only if the import path is correct and the test body contains real assertions.

If tests pass, they are vacuous — fix them before proceeding.

**DONE when**: All tests are written AND confirmed failing with assertion failures (RED).

---

## Phase 2: GREEN — Minimum Implementation

Write the **minimum code** to make all tests pass. No more.

- Don't optimize prematurely
- Don't add features beyond what tests require
- After tests pass, add standard defensive coding: null/undefined guards on public API inputs and reasonable error messages for invalid arguments. These are not "extra features" — they are baseline code quality.

### Mocking policy

If a test needs a dependency (DB, external HTTP, file system):

- **Mock at the boundary** — HTTP clients, database adapters, file system modules. Never mock the module under test.
- **Integration tests**: Use the real dependency if sandbox/docker is available.
- **Unit tests**: Mock external calls. Verify the mock matches the real function's type signature.
- Use the project's existing mock patterns (check `test/mocks/`, `__mocks__/`, or `jest.mock`/`vi.mock` usage).

```bash
# Run after each implementation change
npm test -- --testPathPattern="login.test"
# or
npx vitest run src/auth/login.test.ts
```

**DONE when**: All tests pass (GREEN). Run the full test command once to confirm.

---

## Phase 3: REFACTOR — Clean Up

With green tests as your safety net:

1. Remove duplication
2. Extract helpers if pattern repeats 3+ times
3. Improve naming
4. Run full test suite to catch regressions: `npm test`

**Do NOT add new tests in this phase.** Refactoring should not change behavior.

**DONE when**: Refactoring complete and all tests still pass.

---

## Edge Cases

### Sub-req is not testable with code

Some behaviors require human judgment:
- "Error message is user-friendly" → Write test for message presence, skip "friendliness"
- "UI feels responsive" → Write test for render time < threshold, skip subjective feel
- "Design matches mockup" → Skip, note as MANUAL in output

**Rule**: Test the observable, measurable part. Note the subjective part as `status: SKIP` with reason.

### Project uses monorepo

Run tests from the correct workspace:
```bash
# pnpm workspace
pnpm --filter @app/server test
# turborepo
turbo run test --filter=server
```

### Test needs running server/DB

If the behavior requires integration testing:
1. Check for `sandbox:up` / `docker compose up` scripts
2. If available, ensure they're running before tests
3. If not available, use in-memory alternatives (SQLite for DB, msw for HTTP)

### Test isolation for DB tests

Integration tests that write to a database MUST clean up. Use one of:
- Transaction rollback: `beforeEach(BEGIN)` / `afterEach(ROLLBACK)`
- Truncate tables in `beforeEach`
- Use the project's existing test helper (check `test/utils/`, `test/helpers/`)

Each test must be independently runnable — no dependency on execution order.

---

## Output Checklist

Before reporting DONE, verify:

- [ ] Every sub-req in `fulfills[]` has at least one test case
- [ ] All tests pass (`npm test` / equivalent)
- [ ] Test file paths included in `outputs.test_file` (array of paths)
- [ ] Test run command included in `outputs.test_command`
- [ ] No test is vacuous (each tested a real behavior that was initially RED)
- [ ] DB tests have cleanup (transaction rollback or truncate)
