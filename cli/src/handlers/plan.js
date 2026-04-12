/**
 * plan.js — Handler for `hoyeon-cli plan ...`
 *
 * Manages plan.json (a byproduct of /execute). spec-v2 removed tasks[] from
 * spec.json, so task state lives here. Commands: init, get, status, list, merge.
 *
 * Concurrency: status/merge acquire a lock via atomic `mkdir` on a .lock sidecar
 * directory (POSIX-atomic, no external dependency). Timeout: 5s.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmdirSync, renameSync } from 'fs';
import { resolve, dirname } from 'path';

const HELP = `
Usage:
  hoyeon-cli plan init <path> [--spec-ref <spec-path>]            Create a new plan.json
  hoyeon-cli plan get <task-id> <path>                             Print task JSON to stdout
  hoyeon-cli plan status <task-id> <path> --status <s> [opts]      Update task status
                                                                   opts: --summary "..." --commit <sha>
                                                                   status: pending|in_progress|done|failed
  hoyeon-cli plan list <path> [--status <s>] [--json]              List tasks (optional filter)
  hoyeon-cli plan merge <path> --stdin [--append] [--patch]        Deep-merge JSON fragment (heredoc-friendly)

Options:
  --help, -h   Show this help message

Examples:
  hoyeon-cli plan init .hoyeon/specs/foo/plan.json --spec-ref .hoyeon/specs/foo/spec.json
  hoyeon-cli plan get T1 ./plan.json
  hoyeon-cli plan status T1 ./plan.json --status done --summary "impl done" --commit abc123
  hoyeon-cli plan list ./plan.json --status pending --json
  cat task.json | hoyeon-cli plan merge ./plan.json --stdin --patch
`;

const VALID_STATUS = ['pending', 'in_progress', 'done', 'failed'];
const FULFILLS_RE = /^R\d+(\.\d+)?$/;
const LOCK_TIMEOUT_MS = 5000;
const LOCK_POLL_MS = 50;

// ---------- arg parsing (matches spec.js style) ----------
function parseArgs(args) {
  const result = { _: [] };
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        result[key] = next;
        i += 2;
      } else {
        result[key] = true;
        i += 1;
      }
    } else {
      result._.push(arg);
      i += 1;
    }
  }
  return result;
}

// ---------- locking ----------
function acquireLock(planPath) {
  const lockPath = planPath + '.lock';
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  // Ensure parent dir exists before we attempt mkdir on the lock
  mkdirSync(dirname(planPath), { recursive: true });
  while (true) {
    try {
      mkdirSync(lockPath);
      return lockPath;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      if (Date.now() >= deadline) {
        throw new Error(`Lock contention: ${lockPath} held for >${LOCK_TIMEOUT_MS}ms`);
      }
      // tight sync spin-wait (busy) — acceptable given 5s cap and no async path
      const until = Date.now() + LOCK_POLL_MS;
      while (Date.now() < until) { /* spin */ }
    }
  }
}

function releaseLock(lockPath) {
  try { rmdirSync(lockPath); } catch { /* ignore */ }
}

function withLock(planPath, fn) {
  const lock = acquireLock(planPath);
  try {
    return fn();
  } finally {
    releaseLock(lock);
  }
}

// ---------- plan IO ----------
function readPlan(planPath) {
  let raw;
  try {
    raw = readFileSync(planPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      process.stderr.write(`Error: plan file not found: ${planPath}\n`);
      process.exit(1);
    }
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    process.stderr.write(`Error: invalid JSON in plan file: ${err.message}\n`);
    process.exit(1);
  }
}

function writePlanAtomic(planPath, data) {
  data.updated_at = new Date().toISOString();
  const tmp = planPath + '.tmp';
  mkdirSync(dirname(planPath), { recursive: true });
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  renameSync(tmp, planPath);
}

// ---------- validation ----------
function validateTask(task, ctx = 'task') {
  if (!task || typeof task !== 'object' || Array.isArray(task)) {
    throw new Error(`${ctx}: must be an object`);
  }
  if (typeof task.id !== 'string' || task.id.length === 0) {
    throw new Error(`${ctx}: id (string) is required`);
  }
  if (typeof task.action !== 'string') {
    throw new Error(`${ctx} ${task.id}: action (string) is required`);
  }
  if (!VALID_STATUS.includes(task.status)) {
    throw new Error(`${ctx} ${task.id}: status must be one of ${VALID_STATUS.join('|')}`);
  }
  if (task.depends_on !== undefined && task.depends_on !== null) {
    if (!Array.isArray(task.depends_on) || !task.depends_on.every(d => typeof d === 'string')) {
      throw new Error(`${ctx} ${task.id}: depends_on must be string[]`);
    }
  }
  if (task.fulfills !== undefined && task.fulfills !== null) {
    if (!Array.isArray(task.fulfills)) {
      throw new Error(`${ctx} ${task.id}: fulfills must be string[]`);
    }
    for (const f of task.fulfills) {
      if (typeof f !== 'string' || !FULFILLS_RE.test(f)) {
        throw new Error(`${ctx} ${task.id}: fulfills entry '${f}' must match ^R\\d+(\\.\\d+)?$ (sub-req ids only; journey 'J...' ids rejected)`);
      }
    }
  }
  if (task.summary !== undefined && task.summary !== null && typeof task.summary !== 'string') {
    throw new Error(`${ctx} ${task.id}: summary must be string|null`);
  }
  if (task.commit_sha !== undefined && task.commit_sha !== null && typeof task.commit_sha !== 'string') {
    throw new Error(`${ctx} ${task.id}: commit_sha must be string|null`);
  }
}

function validatePlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    throw new Error('plan: must be an object');
  }
  if (!Array.isArray(plan.tasks)) {
    throw new Error('plan: tasks must be an array');
  }
  if (!Array.isArray(plan.history)) {
    throw new Error('plan: history must be an array');
  }
  const ids = new Set();
  for (const t of plan.tasks) {
    validateTask(t);
    if (ids.has(t.id)) throw new Error(`plan: duplicate task id '${t.id}'`);
    ids.add(t.id);
  }
}

// ---------- deep merge (mirrors spec.js semantics) ----------
function deepMerge(target, source, append = false, patch = false) {
  for (const key of Object.keys(source)) {
    if (source[key] === null || source[key] === undefined) continue;
    if (Array.isArray(source[key])) {
      if (patch && Array.isArray(target[key])) {
        for (const item of source[key]) {
          if (item && typeof item === 'object' && item.id) {
            const idx = target[key].findIndex(t => t && t.id === item.id);
            if (idx >= 0) {
              for (const k of Object.keys(item)) {
                if (item[k] === null || item[k] === undefined) continue;
                if (Array.isArray(item[k]) && Array.isArray(target[key][idx][k])) {
                  const nestedT = { [k]: target[key][idx][k] };
                  deepMerge(nestedT, { [k]: item[k] }, false, true);
                  target[key][idx][k] = nestedT[k];
                } else if (typeof item[k] === 'object' && !Array.isArray(item[k])
                  && target[key][idx][k] && typeof target[key][idx][k] === 'object'
                  && !Array.isArray(target[key][idx][k])) {
                  deepMerge(target[key][idx][k], item[k], false, true);
                } else {
                  target[key][idx][k] = item[k];
                }
              }
            } else {
              target[key].push(item);
            }
          } else {
            target[key].push(item);
          }
        }
      } else if (append && Array.isArray(target[key])) {
        target[key] = target[key].concat(source[key]);
      } else {
        target[key] = source[key];
      }
    } else if (typeof source[key] === 'object') {
      if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
        target[key] = {};
      }
      deepMerge(target[key], source[key], append, patch);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// ---------- history ----------
function appendHistory(plan, entry) {
  plan.history.push({ ts: new Date().toISOString(), ...entry });
}

// ---------- commands ----------
async function handleInit(args) {
  const parsed = parseArgs(args);
  const filePath = parsed._[0];
  if (!filePath) {
    process.stderr.write('Error: <path> is required\n');
    process.stderr.write('Usage: hoyeon-cli plan init <path> [--spec-ref <spec-path>]\n');
    process.exit(1);
  }
  const planPath = resolve(filePath);
  if (existsSync(planPath)) {
    process.stderr.write(`Error: file already exists: ${planPath}\n`);
    process.exit(1);
  }
  const now = new Date().toISOString();
  const plan = {
    spec_ref: parsed['spec-ref'] ? String(parsed['spec-ref']) : null,
    created_at: now,
    updated_at: now,
    tasks: [],
    history: [{ ts: now, event: 'plan_created' }],
  };
  writePlanAtomic(planPath, plan);
  process.stdout.write(`Plan created: ${planPath}\n`);
  if (plan.spec_ref) process.stdout.write(`  spec_ref: ${plan.spec_ref}\n`);
  process.exit(0);
}

async function handleGet(args) {
  const parsed = parseArgs(args);
  const taskId = parsed._[0];
  const filePath = parsed._[1];
  if (!taskId || !filePath) {
    process.stderr.write('Error: <task-id> and <path> are required\n');
    process.stderr.write('Usage: hoyeon-cli plan get <task-id> <path>\n');
    process.exit(1);
  }
  const plan = readPlan(resolve(filePath));
  const task = (plan.tasks || []).find(t => t && t.id === taskId);
  if (!task) {
    process.stderr.write(`Error: task not found: ${taskId}\n`);
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(task, null, 2) + '\n');
  process.exit(0);
}

async function handleStatus(args) {
  const parsed = parseArgs(args);
  const taskId = parsed._[0];
  const filePath = parsed._[1];
  if (!taskId || !filePath) {
    process.stderr.write('Error: <task-id> and <path> are required\n');
    process.stderr.write('Usage: hoyeon-cli plan status <task-id> <path> --status <s> [--summary "..."] [--commit <sha>]\n');
    process.exit(1);
  }
  const newStatus = parsed.status;
  if (!newStatus || !VALID_STATUS.includes(newStatus)) {
    process.stderr.write(`Error: --status must be one of ${VALID_STATUS.join('|')}\n`);
    process.exit(1);
  }
  const planPath = resolve(filePath);

  try {
    withLock(planPath, () => {
      const plan = readPlan(planPath);
      const task = (plan.tasks || []).find(t => t && t.id === taskId);
      if (!task) {
        process.stderr.write(`Error: task not found: ${taskId}\n`);
        process.exit(1);
      }
      const from = task.status;
      task.status = newStatus;
      if (parsed.summary !== undefined && parsed.summary !== true) {
        task.summary = String(parsed.summary);
      }
      if (parsed.commit !== undefined && parsed.commit !== true) {
        task.commit_sha = String(parsed.commit);
      }
      validateTask(task);
      appendHistory(plan, { event: 'task_status', task: taskId, from, to: newStatus });
      writePlanAtomic(planPath, plan);
      process.stdout.write(`Task ${taskId}: ${from} → ${newStatus}\n`);
    });
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
  process.exit(0);
}

async function handleList(args) {
  const parsed = parseArgs(args);
  const filePath = parsed._[0];
  if (!filePath) {
    process.stderr.write('Error: <path> is required\n');
    process.stderr.write('Usage: hoyeon-cli plan list <path> [--status <s>] [--json]\n');
    process.exit(1);
  }
  const plan = readPlan(resolve(filePath));
  let tasks = plan.tasks || [];
  if (parsed.status && parsed.status !== true) {
    if (!VALID_STATUS.includes(parsed.status)) {
      process.stderr.write(`Error: --status must be one of ${VALID_STATUS.join('|')}\n`);
      process.exit(1);
    }
    tasks = tasks.filter(t => t.status === parsed.status);
  }
  if (parsed.json === true) {
    process.stdout.write(JSON.stringify(tasks, null, 2) + '\n');
  } else {
    if (tasks.length === 0) {
      process.stdout.write('(no tasks)\n');
    } else {
      for (const t of tasks) {
        const deps = (t.depends_on && t.depends_on.length) ? ` deps=[${t.depends_on.join(',')}]` : '';
        const ff = (t.fulfills && t.fulfills.length) ? ` fulfills=[${t.fulfills.join(',')}]` : '';
        process.stdout.write(`${t.id}  [${t.status}]  ${t.action}${deps}${ff}\n`);
      }
    }
  }
  process.exit(0);
}

async function handleMerge(args) {
  const parsed = parseArgs(args);
  const filePath = parsed._[0];
  if (!filePath) {
    process.stderr.write('Error: <path> is required\n');
    process.stderr.write('Usage: hoyeon-cli plan merge <path> --stdin [--append] [--patch]\n');
    process.exit(1);
  }
  if (parsed.stdin !== true) {
    process.stderr.write('Error: --stdin is required (heredoc-friendly)\n');
    process.exit(1);
  }
  const append = parsed.append === true;
  const patch = parsed.patch === true;
  if (append && patch) {
    process.stderr.write('Error: --append and --patch are mutually exclusive\n');
    process.exit(1);
  }

  let jsonStr;
  try {
    jsonStr = readFileSync(0, 'utf8');
  } catch (err) {
    process.stderr.write(`Error: failed to read stdin: ${err.message}\n`);
    process.exit(1);
  }
  let fragment;
  try {
    fragment = JSON.parse(jsonStr);
  } catch (err) {
    process.stderr.write(`Error: invalid JSON fragment: ${err.message}\n`);
    process.exit(1);
  }
  if (typeof fragment !== 'object' || Array.isArray(fragment)) {
    process.stderr.write('Error: JSON fragment must be an object\n');
    process.exit(1);
  }

  const planPath = resolve(filePath);
  try {
    withLock(planPath, () => {
      const plan = readPlan(planPath);
      deepMerge(plan, fragment, append, patch);
      validatePlan(plan);
      appendHistory(plan, { event: 'plan_merged', mode: patch ? 'patch' : (append ? 'append' : 'replace') });
      writePlanAtomic(planPath, plan);
      process.stdout.write(`Plan merged: ${planPath}\n`);
    });
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
  process.exit(0);
}

// ---------- entry ----------
export default async function handlePlan(args) {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(HELP);
    process.exit(0);
  }
  const sub = args[0];
  const rest = args.slice(1);
  switch (sub) {
    case 'init':   return handleInit(rest);
    case 'get':    return handleGet(rest);
    case 'status': return handleStatus(rest);
    case 'list':   return handleList(rest);
    case 'merge':  return handleMerge(rest);
    default:
      process.stderr.write(`Error: unknown 'plan' subcommand '${sub}'\n`);
      process.stderr.write(`Run 'hoyeon-cli plan --help' for usage.\n`);
      process.exit(1);
  }
}
