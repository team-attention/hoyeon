import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { parseArgs } from '../lib/args.js';
import { readPlanIfExists } from '../lib/json-io.js';

const HELP = `
Usage:
  hoyeon-cli learning --task <id> --json '{...}' <spec_dir>
  hoyeon-cli learning --task <id> --stdin <spec_dir> << 'EOF'

Add a structured learning entry to <spec_dir>/context/learnings.json.
Task ID is validated against plan.json if it exists.

Fields (JSON):
  problem   What went wrong
  cause     Root cause
  rule      Rule to prevent recurrence
  tags      Array of tags

Options:
  --task <id>     Task ID (required)
  --json '{...}'  Learning data as JSON string
  --stdin         Read JSON from stdin
  --help, -h      This help
`;

function die(msg) { process.stderr.write(msg + '\n'); process.exit(1); }

function readJsonInput(parsed) {
  let jsonStr = parsed.json;
  if (parsed.stdin !== undefined) {
    if (typeof parsed.stdin === 'string') parsed._.unshift(parsed.stdin);
    try { jsonStr = readFileSync(0, 'utf8').trim(); }
    catch (err) { die(`Error: failed to read stdin: ${err.message}`); }
  }
  if (!jsonStr) die('Error: --json or --stdin is required');
  try { return JSON.parse(jsonStr); }
  catch (err) { die(`Error: invalid JSON: ${err.message}`); }
}

async function cmdAdd(args) {
  const parsed = parseArgs(args);
  const taskId = parsed.task;
  if (!taskId) die('Error: --task <task-id> is required');

  const data = readJsonInput(parsed);

  const specDir = parsed._[0];
  if (!specDir) die('Error: <spec_dir> is required');
  const dir = resolve(specDir);

  // Validate task against plan.json
  let requirementIds = [];
  let taskIdValidated = false;
  const plan = readPlanIfExists(dir);
  if (plan) {
    const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      const available = tasks.map(t => t.id).join(', ') || '(none)';
      die(`Error: task not found: ${taskId} (available: ${available})`);
    }
    taskIdValidated = true;
    requirementIds = [...new Set(task.fulfills || [])];
  }

  // Read or create learnings array
  const ctxDir = join(dir, 'context');
  if (!existsSync(ctxDir)) mkdirSync(ctxDir, { recursive: true });
  const filePath = join(ctxDir, 'learnings.json');

  let learnings = [];
  if (existsSync(filePath)) {
    try { learnings = JSON.parse(readFileSync(filePath, 'utf8')); }
    catch { learnings = []; }
  }

  // Generate ID
  const maxNum = learnings.reduce((max, l) => {
    const m = l.id?.match(/^L(\d+)$/);
    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0);
  const newId = `L${maxNum + 1}`;

  const entry = {
    id: newId,
    task: taskId,
    task_id_validated: taskIdValidated,
    requirements: requirementIds,
    problem: data.problem || '',
    cause: data.cause || '',
    rule: data.rule || '',
    tags: data.tags || [],
    created_at: new Date().toISOString(),
  };

  learnings.push(entry);
  writeFileSync(filePath, JSON.stringify(learnings, null, 2) + '\n');

  process.stdout.write(`Added learning '${newId}' for task '${taskId}' → requirements: [${requirementIds.join(', ')}]\n`);
  process.stdout.write(JSON.stringify(entry, null, 2) + '\n');
}

export default async function learning(args) {
  if (!args.length || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(HELP);
    return;
  }
  await cmdAdd(args);
}
