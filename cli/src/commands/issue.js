import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { parseArgs } from '../lib/args.js';
import { readPlanIfExists } from '../lib/json-io.js';

const HELP = `
Usage:
  hoyeon-cli issue --task <id> --json '{...}' <spec_dir>
  hoyeon-cli issue --task <id> --stdin <spec_dir> << 'EOF'

Add a structured issue entry to <spec_dir>/context/issues.json.
Task ID is validated against plan.json if it exists.

Fields (JSON):
  type          One of: failed_approach, out_of_scope, blocker
  description   What happened

Options:
  --task <id>     Task ID (required)
  --json '{...}'  Issue data as JSON string
  --stdin         Read JSON from stdin
  --help, -h      This help
`;

const VALID_TYPES = ['failed_approach', 'out_of_scope', 'blocker'];

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

  // Validate type
  if (data.type && !VALID_TYPES.includes(data.type)) {
    die(`Error: type must be one of: ${VALID_TYPES.join(', ')}`);
  }

  // Validate task against plan.json
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
  }

  // Read or create issues array
  const ctxDir = join(dir, 'context');
  if (!existsSync(ctxDir)) mkdirSync(ctxDir, { recursive: true });
  const filePath = join(ctxDir, 'issues.json');

  let issues = [];
  if (existsSync(filePath)) {
    try { issues = JSON.parse(readFileSync(filePath, 'utf8')); }
    catch { issues = []; }
  }

  // Generate ID
  const maxNum = issues.reduce((max, i) => {
    const m = i.id?.match(/^I(\d+)$/);
    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0);
  const newId = `I${maxNum + 1}`;

  const entry = {
    id: newId,
    task: taskId,
    task_id_validated: taskIdValidated,
    type: data.type || '',
    description: data.description || '',
    created_at: new Date().toISOString(),
  };

  issues.push(entry);
  writeFileSync(filePath, JSON.stringify(issues, null, 2) + '\n');

  process.stdout.write(`Added issue '${newId}' for task '${taskId}'\n`);
  process.stdout.write(JSON.stringify(entry, null, 2) + '\n');
}

export default async function issue(args) {
  if (!args.length || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(HELP);
    return;
  }
  await cmdAdd(args);
}
