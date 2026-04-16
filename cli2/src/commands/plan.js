import { existsSync } from 'fs';
import { parseArgs, getPath } from '../lib/args.js';
import {
  specPaths, readPlanIfExists,
  validatePlan, mergePlan, writeJsonAtomic,
} from '../lib/json-io.js';

const HELP = `
Usage:
  hoyeon-cli2 plan <command> [options]

Commands:
  init <spec_dir> --type <greenfield|feature|refactor|bugfix>
      Create an empty plan.json stub (schema: plan/v1).

  merge <spec_dir> --json '<payload>' [--patch|--append]
      Merge payload into plan.json with schema validation.
      Default: replace (field-by-field). --append: push arrays. --patch: deep merge.

  get <spec_dir> --path <dotted.path>
      Read a field (e.g. meta.type, tasks[0].id, journeys[0].composes).

  validate <spec_dir>
      Schema check + internal cross-ref integrity:
        - tasks.fulfills ⊆ verify_plan targets (type=sub_req)
        - journeys.composes ⊆ verify_plan targets (type=sub_req)
        - journeys.id ⊆ verify_plan targets (type=journey)
        - tasks.depends_on ⊆ tasks.id
      (Does NOT validate coverage against requirements.md — that is the LLM's job.)

Options:
  --help, -h   This help.

Note:
  cli2 never reads requirements.md. Sub-requirement coverage is enforced at
  /blueprint generation time by the LLM — cli2 only ensures plan.json is
  self-consistent.
`;

// ---------------- init ----------------

async function cmdInit(args) {
  const { _: [specDir], type } = parseArgs(args);
  if (!specDir) die('Error: <spec_dir> required');
  if (!type) die('Error: --type required (greenfield|feature|refactor|bugfix)');

  const path = specPaths(specDir).plan;
  if (existsSync(path)) die(`Error: ${path} already exists`);

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

// ---------------- dispatcher ----------------

function die(msg) { process.stderr.write(msg + '\n'); process.exit(1); }

const COMMANDS = {
  init: cmdInit,
  merge: cmdMerge,
  get: cmdGet,
  validate: cmdValidate,
};

export default async function plan(args) {
  const sub = args[0];
  if (!sub || sub === '--help' || sub === '-h') {
    process.stdout.write(HELP);
    return;
  }
  const fn = COMMANDS[sub];
  if (!fn) die(`Error: unknown plan command '${sub}'. Run 'hoyeon-cli2 plan --help'.`);
  await fn(args.slice(1));
}
