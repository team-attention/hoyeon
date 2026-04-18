import { existsSync } from 'fs';
import { parseArgs, getPath } from '../lib/args.js';
import {
  specPaths, readPlanIfExists,
  validatePlan, mergePlan, writeJsonAtomic,
} from '../lib/json-io.js';

const TASK_STATES = ['pending', 'running', 'done', 'failed', 'blocked'];

const HELP = `
Usage:
  hoyeon-cli plan <command> [options]

Commands:
  init <spec_dir> --type <greenfield|feature|refactor|bugfix> [--force]
      Create an empty plan.json stub (schema: plan/v1).
      --force: overwrite existing plan.json.

  merge <spec_dir> --json '<payload>' [--patch|--append]
      Merge payload into plan.json with schema validation.
      Default: replace (field-by-field). --append: push arrays. --patch: deep merge.

  get <spec_dir> --path <dotted.path>
      Read a field (e.g. meta.type, tasks[0].id, journeys[0].composes).

  list <spec_dir> [--status <${TASK_STATES.join('|')}>] [--json]
      List tasks. Filter by status. --json for machine-readable output.

  task <spec_dir> --status <task_id>=<state> [--summary '...']
      Mutate a task's status. <state> must be one of:
        ${TASK_STATES.join(' | ')}
      Idempotent: re-setting the same status exits 0 with no write.
      Monotonic: a task already in 'done' cannot transition to anything else.

  validate <spec_dir>
      Schema check + internal cross-ref integrity.

Options:
  --help, -h   This help.
`;

// ---------------- init ----------------

async function cmdInit(args) {
  const parsed = parseArgs(args);
  const { _: [specDir], type } = parsed;
  if (!specDir) die('Error: <spec_dir> required');
  if (!type) die('Error: --type required (greenfield|feature|refactor|bugfix)');

  const force = parsed.force === true;
  const path = specPaths(specDir).plan;
  if (existsSync(path) && !force) die(`Error: ${path} already exists (use --force to overwrite)`);

  const stub = {
    schema: 'plan/v1',
    meta: { type, goal: '<TBD>', non_goals: [] },
    contracts: { artifact: null, interfaces: [], invariants: [] },
    tasks: [],
    journeys: [],
    verify_plan: [],
  };
  writeJsonAtomic(path, stub);
  process.stdout.write(`Wrote ${path}\n`);
}

// ---------------- merge ----------------

async function cmdMerge(args) {
  const parsed = parseArgs(args);
  const specDir = parsed._[0];
  if (!specDir) die('Error: <spec_dir> required');
  if (!parsed.json || typeof parsed.json !== 'string') die('Error: --json <payload> required');

  let payload;
  try { payload = JSON.parse(parsed.json); }
  catch (err) { die(`Error: invalid --json payload: ${err.message}`); }

  const mode = parsed.patch ? 'patch' : parsed.append ? 'append' : 'replace';

  const path = specPaths(specDir).plan;
  const existing = readPlanIfExists(specDir);
  const next = mergePlan(existing, payload, mode);

  const { ok, errors } = validatePlan(next);
  if (!ok) {
    process.stderr.write(`Schema validation failed:\n`);
    for (const e of errors) process.stderr.write(`  - ${e}\n`);
    process.exit(1);
  }

  writeJsonAtomic(path, next);
  process.stdout.write(`Wrote ${path} (mode=${mode})\n`);
}

// ---------------- get ----------------

async function cmdGet(args) {
  const { _: [specDir], path } = parseArgs(args);
  if (!specDir) die('Error: <spec_dir> required');
  if (!path) die('Error: --path required');
  const plan = readPlanIfExists(specDir);
  if (!plan) die(`Error: plan.json not found in ${specDir}`);
  const val = getPath(plan, path);
  if (val === undefined) { process.stderr.write(`path not found: ${path}\n`); process.exit(1); }
  process.stdout.write(typeof val === 'string' ? val + '\n' : JSON.stringify(val, null, 2) + '\n');
}

// ---------------- validate (internal cross-ref only) ----------------

async function cmdValidate(args) {
  const { _: [specDir] } = parseArgs(args);
  if (!specDir) die('Error: <spec_dir> required');

  const plan = readPlanIfExists(specDir);
  if (!plan) die(`Error: plan.json not found in ${specDir}`);

  const errors = [];

  const { ok, errors: schemaErrs } = validatePlan(plan);
  if (!ok) errors.push(...schemaErrs.map((e) => `schema: ${e}`));

  const tasks = plan.tasks || [];
  const journeys = plan.journeys || [];
  const vp = plan.verify_plan || [];

  const taskIds = new Set(tasks.map((t) => t.id));
  const subReqTargets = new Set(vp.filter((v) => v.type === 'sub_req').map((v) => v.target));
  const journeyTargets = new Set(vp.filter((v) => v.type === 'journey').map((v) => v.target));
  const journeyIds = new Set(journeys.map((j) => j.id));

  // 1. tasks.fulfills ⊆ verify_plan sub_req targets
  for (const t of tasks) {
    for (const f of t.fulfills || []) {
      if (!subReqTargets.has(f)) {
        errors.push(`task ${t.id} fulfills '${f}' but no verify_plan entry of type=sub_req targets it`);
      }
    }
  }

  // 2. journeys.composes ⊆ verify_plan sub_req targets
  for (const j of journeys) {
    for (const c of j.composes || []) {
      if (!subReqTargets.has(c)) {
        errors.push(`journey ${j.id} composes '${c}' but no verify_plan entry of type=sub_req targets it`);
      }
    }
  }

  // 3. every journey.id must have a verify_plan entry with type=journey
  for (const jid of journeyIds) {
    if (!journeyTargets.has(jid)) {
      errors.push(`journey ${jid} declared but no verify_plan entry of type=journey targets it`);
    }
  }

  // 4. every verify_plan entry with type=journey must reference an existing journey
  for (const jt of journeyTargets) {
    if (!journeyIds.has(jt)) {
      errors.push(`verify_plan targets journey '${jt}' but no matching journey declaration exists`);
    }
  }

  // 5. tasks.depends_on ⊆ tasks.id
  for (const t of tasks) {
    for (const d of t.depends_on || []) {
      if (!taskIds.has(d)) errors.push(`task ${t.id} depends_on unknown task '${d}'`);
    }
  }

  if (errors.length) {
    for (const e of errors) process.stderr.write(`✗ ${e}\n`);
    process.stderr.write(`\n${errors.length} error(s)\n`);
    process.exit(1);
  }

  process.stdout.write(
    `✓ plan.json valid — ${tasks.length} tasks, ${journeys.length} journeys, ${vp.length} verify entries\n`
  );
}

// ---------------- list ----------------

async function cmdList(args) {
  const parsed = parseArgs(args);
  const specDir = parsed._[0];
  if (!specDir) die('Error: <spec_dir> required');

  const plan = readPlanIfExists(specDir);
  if (!plan) die(`Error: plan.json not found in ${specDir}`);

  let tasks = plan.tasks || [];
  const filterStatus = parsed.status;
  if (filterStatus) {
    tasks = tasks.filter((t) => t.status === filterStatus);
  }

  if (parsed.json) {
    process.stdout.write(JSON.stringify({ tasks, total: (plan.tasks || []).length, filtered: tasks.length }, null, 2) + '\n');
  } else {
    if (tasks.length === 0) {
      process.stdout.write(filterStatus ? `No tasks with status '${filterStatus}'\n` : 'No tasks\n');
      return;
    }
    const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
    process.stdout.write(pad('ID', 6) + pad('STATUS', 14) + pad('LAYER', 6) + 'ACTION\n');
    process.stdout.write('-'.repeat(60) + '\n');
    for (const t of tasks) {
      process.stdout.write(
        pad(t.id, 6) +
        pad(t.status || 'pending', 14) +
        pad(t.layer || '-', 6) +
        (t.action.length > 50 ? t.action.slice(0, 47) + '...' : t.action) + '\n'
      );
    }
    process.stdout.write(`\n${tasks.length}/${(plan.tasks || []).length} tasks shown\n`);
  }
}

// ---------------- task (status mutation) ----------------

async function cmdTask(args) {
  const parsed = parseArgs(args);
  const specDir = parsed._[0];
  if (!specDir) die('Error: <spec_dir> required');
  if (!parsed.status || parsed.status === true) {
    die('Error: --status <task_id>=<state> required');
  }

  const eq = parsed.status.indexOf('=');
  if (eq <= 0 || eq === parsed.status.length - 1) {
    die(`Error: --status must be '<task_id>=<state>' (got '${parsed.status}')`);
  }
  const taskId = parsed.status.slice(0, eq);
  const nextState = parsed.status.slice(eq + 1);

  if (!/^T\d+$/.test(taskId)) {
    die(`Error: invalid task ID format '${taskId}' (must match schema /^T\\d+$/)`);
  }

  if (!TASK_STATES.includes(nextState)) {
    die(`Error: invalid state '${nextState}'. Must be one of: ${TASK_STATES.join(', ')}`);
  }

  const plan = readPlanIfExists(specDir);
  if (!plan) die(`Error: plan.json not found in ${specDir}`);

  const task = (plan.tasks || []).find((t) => t.id === taskId);
  if (!task) die(`Error: task '${taskId}' not found in plan.json`);

  const currentState = task.status || 'pending';

  if (currentState === nextState) {
    process.stdout.write(`${taskId}: ${nextState} (no change)\n`);
    return;
  }

  if (currentState === 'done') {
    process.stderr.write(
      `Error: task '${taskId}' is already 'done' — INV-9 forbids re-transition to '${nextState}'\n`
    );
    process.exit(1);
  }

  task.status = nextState;
  if (parsed.summary && parsed.summary !== true) task.summary = parsed.summary;

  const { ok, errors } = validatePlan(plan);
  if (!ok) {
    process.stderr.write(`Schema validation failed:\n`);
    for (const e of errors) process.stderr.write(`  - ${e}\n`);
    process.exit(1);
  }

  const path = specPaths(specDir).plan;
  writeJsonAtomic(path, plan);
  process.stdout.write(
    `${taskId}: ${currentState} → ${nextState}${parsed.summary && parsed.summary !== true ? ' — ' + parsed.summary : ''}\n`
  );
}

// ---------------- dispatcher ----------------

function die(msg) { process.stderr.write(msg + '\n'); process.exit(1); }

const COMMANDS = {
  init: cmdInit,
  merge: cmdMerge,
  get: cmdGet,
  list: cmdList,
  task: cmdTask,
  validate: cmdValidate,
};

export default async function plan(args) {
  const sub = args[0];
  if (!sub || sub === '--help' || sub === '-h') {
    process.stdout.write(HELP);
    return;
  }
  const fn = COMMANDS[sub];
  if (!fn) die(`Error: unknown plan command '${sub}'. Run 'hoyeon-cli plan --help'.`);
  await fn(args.slice(1));
}
