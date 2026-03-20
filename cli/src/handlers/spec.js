import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import specSchema from '../../schemas/dev-spec-v4.schema.json' with { type: 'json' };
import specSchemaV5 from '../../schemas/dev-spec-v5.schema.json' with { type: 'json' };
// v5 is the default schema. Pass specData with meta.schema_version === 'v4' to use legacy v4 validation.

import { writeState } from '../lib/state-io.js';

const SPEC_HELP = `
Usage:
  hoyeon-cli spec init <name> --goal "..." <path>   Create a minimal valid spec.json
  hoyeon-cli spec merge <path> --json '{...}'       Deep-merge a JSON fragment into spec.json
                                                    --append: concatenate arrays
                                                    --patch:  ID-based merge (match by id, update in place)
  hoyeon-cli spec validate <path>                   Validate a spec.json file against the schema
  hoyeon-cli spec plan <path> [--format text|mermaid|json]  Show execution plan with parallel groups
  hoyeon-cli spec task <task-id> --status <status> [--summary "..."] <path>  Update task status
  hoyeon-cli spec task <task-id> --get <path>                               Get task details as JSON
  hoyeon-cli spec status <path>                     Show task completion status (exit 0=done, 1=incomplete)
  hoyeon-cli spec meta <path>                       Show spec meta (name, goal, non_goals, mode, etc.)
  hoyeon-cli spec check <path>                      Check internal consistency
  hoyeon-cli spec coverage <path> [--layer decisions|requirements|scenarios|tasks] [--json]  Check spec coverage (source.ref, decision coverage, scenario min count, orphan scenarios)
  hoyeon-cli spec amend --reason <feedback-id> --spec <path>  Amend spec.json based on feedback
  hoyeon-cli spec guide [section]                             Show schema guide for a section
  hoyeon-cli spec scenario <scenario-id> --get <path>              Get scenario details as JSON
  hoyeon-cli spec derive --parent <id> --source <src> --trigger <t> --action <a> --reason <r> <path>  Create a derived task
  hoyeon-cli spec drift <path>                       Show drift ratio (derived vs planned tasks)
  hoyeon-cli spec requirement --status <path> [--json]  Show all requirements/scenarios with verification status
  hoyeon-cli spec requirement <id> --get <path>     Get individual scenario as JSON
  hoyeon-cli spec requirement <id> --status pass|fail|skipped --task <task_id> [--reason <msg>] <path>  Update scenario status
  hoyeon-cli spec sandbox-tasks <path> [--json]     Auto-generate T_SANDBOX + T_SV tasks for sandbox scenarios
  hoyeon-cli spec learning --task <id> --json '{...}' <path>  Add structured learning to context/learnings.json
  hoyeon-cli spec issue --task <id> --json '{...}' <path>    Add structured issue to context/issues.json
  hoyeon-cli spec search "query" [--specs-dir .dev/specs] [--limit 10] [--json]  BM25 search across all specs

Options:
  --help, -h    Show this help message

Examples:
  hoyeon-cli spec init api-auth --goal "Add JWT auth" .dev/specs/api-auth/spec.json
  hoyeon-cli spec merge .dev/specs/api-auth/spec.json --json '{"context":{"request":"Add auth"}}'
  hoyeon-cli spec validate ./spec.json
  hoyeon-cli spec plan ./spec.json
  hoyeon-cli spec task T1 --status done --summary "implemented" ./spec.json
  hoyeon-cli spec task T1 --get ./spec.json
  hoyeon-cli spec status ./spec.json
  hoyeon-cli spec meta ./spec.json
  hoyeon-cli spec check ./spec.json
  hoyeon-cli spec amend --reason fb-001 --spec ./spec.json
  hoyeon-cli spec requirement --status ./spec.json
  hoyeon-cli spec requirement R1-S1 --get ./spec.json
  hoyeon-cli spec requirement R1-S1 --status pass --task T1 ./spec.json
  hoyeon-cli spec sandbox-tasks ./spec.json
`;

function loadSchema(specData) {
  if (specData?.meta?.schema_version === 'v4') {
    return specSchema;
  }
  return specSchemaV5;
}

/**
 * Extract unique top-level sections from validation errors and print guide hints.
 */
function printGuideHints(errors) {
  const sections = new Set();
  for (const e of errors) {
    const path = e.instancePath || '';
    // Extract first path segment: "/constraints/0/verify" → "constraints"
    const match = path.match(/^\/([^/]+)/);
    if (match) sections.add(match[1]);
  }
  if (sections.size > 0) {
    process.stderr.write('\nHint: check schema with:\n');
    for (const s of sections) {
      process.stderr.write(`  hoyeon-cli spec guide ${s}\n`);
    }
  }
}

/**
 * Append a history entry to context/history.json (external to spec.json).
 * @param {string} specPath - Absolute path to spec.json
 * @param {object} entry - History entry object (ts auto-set if missing)
 */
function appendHistory(specPath, entry) {
  const contextDir = resolve(dirname(specPath), 'context');
  if (!existsSync(contextDir)) {
    mkdirSync(contextDir, { recursive: true });
  }
  const historyPath = resolve(contextDir, 'history.json');
  let history = [];
  if (existsSync(historyPath)) {
    try {
      history = JSON.parse(readFileSync(historyPath, 'utf8'));
    } catch {
      history = [];
    }
  }
  if (!entry.ts) {
    entry.ts = new Date().toISOString();
  }
  history.push(entry);
  writeFileSync(historyPath, JSON.stringify(history, null, 2) + '\n');
}

function validateSpec(specData) {
  let schema;
  try {
    schema = loadSchema(specData);
  } catch (err) {
    process.stderr.write(`Error: could not load schema: ${err.message}\n`);
    process.exit(1);
  }
  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const valid = validate(specData);
  if (!valid) {
    process.stderr.write('Validation failed:\n');
    for (const e of validate.errors) {
      const path = e.instancePath || '(root)';
      process.stderr.write(`  ${path}: ${e.message}\n`);
    }
    printGuideHints(validate.errors);
    process.exit(1);
  }
}

/**
 * Deep-merge source into target.
 * - Objects are recursively merged
 * - Arrays are replaced by default, or concatenated with --append
 */
function deepMerge(target, source, append = false, patch = false) {
  for (const key of Object.keys(source)) {
    if (source[key] === null || source[key] === undefined) {
      continue;
    }
    if (Array.isArray(source[key])) {
      if (patch && Array.isArray(target[key])) {
        // --patch: ID-based merge — match by id, merge arrays recursively, replace objects
        for (const item of source[key]) {
          if (item && typeof item === 'object' && item.id) {
            const idx = target[key].findIndex(t => t && t.id === item.id);
            if (idx >= 0) {
              // Merge item fields: arrays recurse (patch), objects recurse (patch), scalars overwrite
              for (const itemKey of Object.keys(item)) {
                if (item[itemKey] === null || item[itemKey] === undefined) continue;
                if (Array.isArray(item[itemKey]) && Array.isArray(target[key][idx][itemKey])) {
                  // Nested array: recurse with patch semantics (ID-based merge)
                  const nested = { [itemKey]: item[itemKey] };
                  const nestedTarget = { [itemKey]: target[key][idx][itemKey] };
                  deepMerge(nestedTarget, nested, false, true);
                  target[key][idx][itemKey] = nestedTarget[itemKey];
                } else if (typeof item[itemKey] === 'object' && !Array.isArray(item[itemKey])
                  && target[key][idx][itemKey] && typeof target[key][idx][itemKey] === 'object'
                  && !Array.isArray(target[key][idx][itemKey])) {
                  // Nested object: merge fields (preserves existing keys not in patch)
                  // But replace entirely if source has 'type' field (oneOf discriminator)
                  if ('type' in item[itemKey]) {
                    target[key][idx][itemKey] = item[itemKey];
                  } else {
                    deepMerge(target[key][idx][itemKey], item[itemKey], false, true);
                  }
                } else {
                  // Scalars and new fields: direct replace
                  target[key][idx][itemKey] = item[itemKey];
                }
              }
            } else {
              target[key].push(item);
            }
          } else {
            // No id field — append as-is
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

async function handleInit(args) {
  const parsed = parseArgs(args);
  const name = parsed._[0];

  if (!name) {
    process.stderr.write('Error: <name> is required\n');
    process.stderr.write('Usage: hoyeon-cli spec init <name> --goal "..." <path>\n');
    process.exit(1);
  }

  if (!parsed.goal) {
    process.stderr.write('Error: --goal "..." is required\n');
    process.stderr.write('Usage: hoyeon-cli spec init <name> --goal "..." <path>\n');
    process.exit(1);
  }

  const filePath = parsed._[1];
  if (!filePath) {
    process.stderr.write('Error: <path> is required\n');
    process.stderr.write('Usage: hoyeon-cli spec init <name> --goal "..." <path>\n');
    process.exit(1);
  }

  const specPath = resolve(filePath);

  // Check if file already exists
  try {
    readFileSync(specPath, 'utf8');
    process.stderr.write(`Error: file already exists: ${specPath}\n`);
    process.stderr.write('Use "hoyeon-cli spec merge" to update an existing spec.\n');
    process.exit(1);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      process.stderr.write(`Error: ${err.message}\n`);
      process.exit(1);
    }
  }

  const now = new Date().toISOString();

  const specData = {
    meta: {
      name,
      goal: parsed.goal,
      created_at: now,
    },
    tasks: [
      { id: 'T1', action: 'TODO', type: 'work', status: 'pending' },
    ],
  };

  // Add optional type
  if (parsed.type !== undefined) {
    const validTypes = ['dev', 'plain'];
    if (!validTypes.includes(parsed.type)) {
      process.stderr.write(`Error: invalid --type '${parsed.type}'. Valid values: ${validTypes.join(', ')}\n`);
      process.exit(1);
    }
    specData.meta.type = parsed.type;
  }

  // Add optional mode
  if (parsed.depth || parsed.interaction) {
    specData.meta.mode = {};
    if (parsed.depth) specData.meta.mode.depth = parsed.depth;
    if (parsed.interaction) specData.meta.mode.interaction = parsed.interaction;
  }

  validateSpec(specData);
  writeState(specPath, specData);
  appendHistory(specPath, { ts: now, type: 'spec_created' });

  process.stdout.write(`Spec created: ${specPath}\n`);
  process.stdout.write(`  name: ${name}\n`);
  process.stdout.write(`  goal: ${parsed.goal}\n`);
  if (specData.meta.mode) {
    process.stdout.write(`  mode: ${specData.meta.mode.depth || '-'}/${specData.meta.mode.interaction || '-'}\n`);
  }
  process.exit(0);
}

async function handleMerge(args) {
  const parsed = parseArgs(args);
  const filePath = parsed._[0];

  if (!filePath) {
    process.stderr.write('Error: <path> is required\n');
    process.stderr.write('Usage: hoyeon-cli spec merge <path> --json \'{...}\' [--append]\n');
    process.exit(1);
  }

  if (!parsed.json) {
    process.stderr.write('Error: --json \'{...}\' is required\n');
    process.stderr.write('Usage: hoyeon-cli spec merge <path> --json \'{...}\' [--append] [--patch]\n');
    process.exit(1);
  }

  let fragment;
  try {
    fragment = JSON.parse(parsed.json);
  } catch (err) {
    process.stderr.write(`Error: invalid JSON fragment: ${err.message}\n`);
    process.exit(1);
  }

  if (typeof fragment !== 'object' || Array.isArray(fragment)) {
    process.stderr.write('Error: JSON fragment must be an object\n');
    process.exit(1);
  }

  const specPath = resolve(filePath);
  const specData = loadSpec(specPath);

  const append = parsed.append === true;
  const patch = parsed.patch === true;
  if (append && patch) {
    process.stderr.write('Error: --append and --patch are mutually exclusive\n');
    process.exit(1);
  }
  deepMerge(specData, fragment, append, patch);

  // Auto-add history entry for merge
  const now = new Date().toISOString();
  const mergedKeys = Object.keys(fragment).join(', ');

  // Update meta.updated_at
  if (specData.meta) {
    specData.meta.updated_at = now;
  }

  validateSpec(specData);
  writeState(specPath, specData);
  appendHistory(specPath, { ts: now, type: 'spec_updated', detail: `merged: ${mergedKeys}` });

  process.stdout.write(`Spec merged: ${specPath}\n`);
  process.stdout.write(`  merged keys: ${mergedKeys}\n`);
  if (append) process.stdout.write('  mode: append (arrays concatenated)\n');
  if (patch) process.stdout.write('  mode: patch (ID-based merge)\n');
  process.exit(0);
}

async function handleValidate(args) {
  const filePath = args[0];

  if (!filePath) {
    process.stderr.write('Error: missing <path> argument\n');
    process.stderr.write('Usage: hoyeon-cli spec validate <path>\n');
    process.exit(1);
  }

  let data;
  try {
    const raw = readFileSync(filePath, 'utf8');
    data = JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      process.stderr.write(`Error: file not found: ${filePath}\n`);
    } else if (err instanceof SyntaxError) {
      process.stderr.write(`Error: invalid JSON in ${filePath}: ${err.message}\n`);
    } else {
      process.stderr.write(`Error: could not read file: ${err.message}\n`);
    }
    process.exit(1);
  }

  let schema;
  try {
    schema = loadSchema(data);
  } catch (err) {
    process.stderr.write(`Error: could not load schema: ${err.message}\n`);
    process.exit(1);
  }

  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);

  const validate = ajv.compile(schema);
  const valid = validate(data);

  if (valid) {
    process.stdout.write(JSON.stringify({ valid: true, errors: [] }) + '\n');
    process.exit(0);
  } else {
    const errors = validate.errors.map((e) => ({
      instancePath: e.instancePath,
      schemaPath: e.schemaPath,
      keyword: e.keyword,
      message: e.message,
      params: e.params,
    }));

    process.stdout.write(JSON.stringify({ valid: false, errors }) + '\n');
    process.stderr.write('Validation failed:\n');
    for (const e of validate.errors) {
      const path = e.instancePath || '(root)';
      process.stderr.write(`  ${path}: ${e.message}\n`);
    }
    printGuideHints(validate.errors);
    process.exit(1);
  }
}

function loadSpec(filePath) {
  try {
    const raw = readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      process.stderr.write(`Error: file not found: ${filePath}\n`);
    } else if (err instanceof SyntaxError) {
      process.stderr.write(`Error: invalid JSON in ${filePath}: ${err.message}\n`);
    } else {
      process.stderr.write(`Error: could not read file: ${err.message}\n`);
    }
    process.exit(1);
  }
}

/**
 * Build verify_plan array for a task by mapping its AC scenarios to verify entries.
 */
function buildVerifyPlan(task, spec) {
  const scenarioIds = (task.acceptance_criteria && task.acceptance_criteria.scenarios) || [];
  if (scenarioIds.length === 0) return [];

  // Build a flat lookup: scenario id → scenario object
  const scenarioMap = new Map();
  for (const req of (spec.requirements || [])) {
    for (const s of (req.scenarios || [])) {
      scenarioMap.set(s.id, s);
    }
  }

  return scenarioIds.map(sid => {
    const s = scenarioMap.get(sid);
    if (!s) return { scenario: sid, method: 'unknown', env: 'host' };

    const env = s.execution_env || 'host';
    const method = s.verified_by;

    const entry = {
      scenario: s.id,
      method,
      env,
    };

    if (method === 'machine' && s.verify) {
      entry.run = s.verify.run;
      if (s.verify.expect !== undefined) entry.expect = s.verify.expect;
    }

    if (method === 'agent' && env !== 'sandbox' && s.verify) {
      entry.checks = s.verify.checks;
    }

    if (env === 'sandbox') {
      entry.subject = s.subject;
      entry.recipe = `${s.subject}.md`;
    }

    if (method === 'human') {
      entry.action = 'skip';
    }

    return entry;
  });
}

/**
 * Build execution plan from spec.json tasks using topological sort.
 * Groups tasks into parallel rounds based on depends_on.
 */
function buildPlan(tasks) {
  const taskMap = new Map();
  for (const t of tasks) {
    taskMap.set(t.id, { ...t, depends_on: t.depends_on || [] });
  }

  // Validate dependency references
  for (const t of taskMap.values()) {
    for (const dep of t.depends_on) {
      if (!taskMap.has(dep)) {
        process.stderr.write(`Warning: task ${t.id} depends on unknown task ${dep}\n`);
      }
    }
  }

  // Kahn's algorithm — topological sort into rounds
  const inDegree = new Map();
  for (const t of taskMap.values()) {
    if (!inDegree.has(t.id)) inDegree.set(t.id, 0);
    for (const dep of t.depends_on) {
      // dep → t.id edge
      inDegree.set(t.id, (inDegree.get(t.id) || 0));
    }
  }
  // Count in-degrees
  for (const t of taskMap.values()) {
    inDegree.set(t.id, t.depends_on.filter(d => taskMap.has(d)).length);
  }

  const rounds = [];
  const done = new Set();

  while (done.size < taskMap.size) {
    const round = [];
    for (const t of taskMap.values()) {
      if (done.has(t.id)) continue;
      const allDepsDone = t.depends_on.every(d => done.has(d) || !taskMap.has(d));
      if (allDepsDone) round.push(t.id);
    }

    if (round.length === 0) {
      // Cycle detection
      const remaining = [...taskMap.keys()].filter(id => !done.has(id));
      process.stderr.write(`Error: circular dependency detected among: ${remaining.join(', ')}\n`);
      process.exit(1);
    }

    rounds.push(round);
    for (const id of round) done.add(id);
  }

  return rounds;
}

/**
 * Find the critical path (longest path through the DAG).
 */
function findCriticalPath(tasks) {
  const taskMap = new Map();
  for (const t of tasks) {
    taskMap.set(t.id, { ...t, depends_on: t.depends_on || [] });
  }

  // longest path to each node + predecessor
  const dist = new Map();
  const pred = new Map();
  for (const id of taskMap.keys()) {
    dist.set(id, 0);
    pred.set(id, null);
  }

  // Process in topological order
  const rounds = buildPlan(tasks);
  for (const round of rounds) {
    for (const id of round) {
      const t = taskMap.get(id);
      for (const dep of t.depends_on) {
        if (!taskMap.has(dep)) continue;
        if (dist.get(dep) + 1 > dist.get(id)) {
          dist.set(id, dist.get(dep) + 1);
          pred.set(id, dep);
        }
      }
    }
  }

  // Find the node with max distance
  let maxDist = -1;
  let endNode = null;
  for (const [id, d] of dist) {
    if (d > maxDist) {
      maxDist = d;
      endNode = id;
    }
  }

  // Trace back
  const path = [];
  let cur = endNode;
  while (cur) {
    path.unshift(cur);
    cur = pred.get(cur);
  }

  return path;
}

function formatText(spec, rounds, criticalPath) {
  const taskMap = new Map();
  for (const t of spec.tasks) taskMap.set(t.id, t);

  const lines = [];
  lines.push(`Plan: ${spec.meta.name}`);
  lines.push(`Goal: ${spec.meta.goal}`);
  lines.push('');

  const totalTasks = spec.tasks.length;
  const parallelTasks = rounds.filter(r => r.length > 1).reduce((sum, r) => sum + r.length, 0);
  lines.push(`Tasks: ${totalTasks}  Rounds: ${rounds.length}  Max parallel: ${Math.max(...rounds.map(r => r.length))}`);
  lines.push('');

  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i];
    const parallel = round.length > 1;
    lines.push(`Round ${i + 1}${parallel ? ' (parallel)' : ''}:`);
    for (const id of round) {
      const t = taskMap.get(id);
      const type = t.type === 'verification' ? 'verify' : 'work';
      const risk = t.risk ? ` [${t.risk}]` : '';
      const deps = (t.depends_on || []).length > 0 ? ` ← ${t.depends_on.join(', ')}` : '';
      const cp = criticalPath.includes(id) ? ' *' : '';
      lines.push(`  ${id}: ${t.action} (${type}${risk})${deps}${cp}`);
    }
    lines.push('');
  }

  lines.push(`Critical path: ${criticalPath.join(' → ')}`);

  // Show fulfills summary if any task has it
  const hasFulfills = spec.tasks.some(t => t.fulfills && t.fulfills.length > 0);
  if (hasFulfills) {
    lines.push('');
    lines.push('Requirement coverage:');
    const reqMap = new Map();
    for (const t of spec.tasks) {
      for (const r of (t.fulfills || [])) {
        if (!reqMap.has(r)) reqMap.set(r, []);
        reqMap.get(r).push(t.id);
      }
    }
    for (const [r, tasks] of reqMap) {
      lines.push(`  ${r} ← ${tasks.join(', ')}`);
    }
  }

  return lines.join('\n');
}

function formatMermaid(spec, rounds, criticalPath) {
  const taskMap = new Map();
  for (const t of spec.tasks) taskMap.set(t.id, t);
  const cpSet = new Set(criticalPath);

  const lines = ['graph LR'];

  for (const t of spec.tasks) {
    const label = `${t.id}[${t.id}: ${t.action}]`;
    lines.push(`  ${label}`);
  }

  for (const t of spec.tasks) {
    for (const dep of (t.depends_on || [])) {
      if (taskMap.has(dep)) {
        lines.push(`  ${dep} --> ${t.id}`);
      }
    }
  }

  // Style critical path
  if (criticalPath.length > 0) {
    lines.push(`  style ${criticalPath.join(',')} stroke:#f66,stroke-width:3px`);
  }

  // Style verification tasks
  const verifyTasks = spec.tasks.filter(t => t.type === 'verification').map(t => t.id);
  if (verifyTasks.length > 0) {
    lines.push(`  style ${verifyTasks.join(',')} stroke:#6a6,stroke-dasharray: 5 5`);
  }

  return lines.join('\n');
}

function formatJson(spec, rounds, criticalPath) {
  const taskMap = new Map();
  for (const t of spec.tasks) taskMap.set(t.id, t);

  return JSON.stringify({
    name: spec.meta.name,
    goal: spec.meta.goal,
    total_tasks: spec.tasks.length,
    total_rounds: rounds.length,
    max_parallel: Math.max(...rounds.map(r => r.length)),
    critical_path: criticalPath,
    rounds: rounds.map((round, i) => ({
      round: i + 1,
      parallel: round.length > 1,
      tasks: round.map(id => {
        const t = taskMap.get(id);
        return {
          id: t.id,
          action: t.action,
          type: t.type,
          status: t.status || 'pending',
          risk: t.risk || null,
          depends_on: t.depends_on || [],
          steps: t.steps || [],
          file_scope: t.file_scope || [],
          verify_plan: buildVerifyPlan(t, spec),
        };
      }),
    })),
  }, null, 2);
}

function formatSlim(spec, rounds, criticalPath) {
  return JSON.stringify({
    name: spec.meta.name,
    goal: spec.meta.goal,
    total_tasks: spec.tasks.length,
    total_rounds: rounds.length,
    max_parallel: Math.max(...rounds.map(r => r.length)),
    critical_path: criticalPath,
    rounds: rounds.map((round, i) => ({
      round: i + 1,
      parallel: round.length > 1,
      tasks: round.map(id => {
        const t = (spec.tasks || []).find(task => task.id === id) || {};
        const isDerived = t.origin === 'derived';
        return {
          id: t.id,
          action: t.action,
          type: t.type,
          status: t.status || 'pending',
          derived: isDerived,
          depends_on: t.depends_on || [],
          ...(t.tool ? { tool: t.tool } : {}),
          ...(t.args ? { args: t.args } : {}),
          verify_plan: buildVerifyPlan(t, spec),
        };
      }),
    })),
  }, null, 2);
}

async function handlePlan(args) {
  const parsed = parseArgs(args);
  const filePath = parsed._[0] || parsed.spec;

  if (!filePath) {
    process.stderr.write('Error: missing <path> argument\n');
    process.stderr.write('Usage: hoyeon-cli spec plan <path> [--format text|mermaid|json|slim]\n');
    process.exit(1);
  }

  const spec = loadSpec(filePath);

  if (!spec.tasks || spec.tasks.length === 0) {
    process.stderr.write('Error: spec has no tasks\n');
    process.exit(1);
  }

  const rounds = buildPlan(spec.tasks);
  const criticalPath = findCriticalPath(spec.tasks);
  const format = parsed.format || 'text';

  let output;
  if (format === 'mermaid') {
    output = formatMermaid(spec, rounds, criticalPath);
  } else if (format === 'json') {
    output = formatJson(spec, rounds, criticalPath);
  } else if (format === 'slim') {
    output = formatSlim(spec, rounds, criticalPath);
  } else {
    output = formatText(spec, rounds, criticalPath);
  }

  process.stdout.write(output + '\n');
}

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

async function handleAmend(args) {
  const parsed = parseArgs(args);

  if (!parsed.reason) {
    process.stderr.write('Error: --reason <feedback-id> is required\n');
    process.stderr.write('Usage: hoyeon-cli spec amend --reason <feedback-id> --spec <path>\n');
    process.exit(1);
  }

  if (!parsed.spec) {
    process.stderr.write('Error: --spec <path> is required\n');
    process.stderr.write('Usage: hoyeon-cli spec amend --reason <feedback-id> --spec <path>\n');
    process.exit(1);
  }

  const specPath = resolve(parsed.spec);
  const feedbackId = parsed.reason;

  // Derive feedback file path relative to spec directory
  const specDir = dirname(specPath);
  const feedbackPath = resolve(specDir, 'feedback', `${feedbackId}.json`);

  let feedbackData;
  try {
    const raw = readFileSync(feedbackPath, 'utf8');
    feedbackData = JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      process.stderr.write(`Error: feedback file not found: ${feedbackPath}\n`);
    } else if (err instanceof SyntaxError) {
      process.stderr.write(`Error: invalid JSON in feedback file: ${err.message}\n`);
    } else {
      process.stderr.write(`Error: could not read feedback file: ${err.message}\n`);
    }
    process.exit(1);
  }

  let specData;
  try {
    const raw = readFileSync(specPath, 'utf8');
    specData = JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      process.stderr.write(`Error: spec file not found: ${specPath}\n`);
    } else if (err instanceof SyntaxError) {
      process.stderr.write(`Error: invalid JSON in spec file: ${err.message}\n`);
    } else {
      process.stderr.write(`Error: could not read spec file: ${err.message}\n`);
    }
    process.exit(1);
  }

  // Display the feedback message
  process.stdout.write(`Feedback (${feedbackId}): ${feedbackData.message}\n`);

  // Phase 1: update meta.updated_at as a placeholder for future amendment logic
  if (!specData.meta) {
    specData.meta = {};
  }
  specData.meta.updated_at = new Date().toISOString();

  try {
    writeFileSync(specPath, JSON.stringify(specData, null, 2), 'utf8');
  } catch (err) {
    process.stderr.write(`Error: could not write spec file: ${err.message}\n`);
    process.exit(1);
  }

  process.stdout.write(`Spec amended: ${specPath}\n`);
  process.stdout.write(`Note: actual spec modification logic will be added in later phases\n`);
  process.exit(0);
}

async function handleTask(args) {
  const taskId = args[0];

  if (!taskId || taskId.startsWith('--')) {
    process.stderr.write('Error: <task-id> is required\n');
    process.stderr.write('Usage: hoyeon-cli spec task <task-id> --status <status> [--summary "..."] <path>\n');
    process.stderr.write('       hoyeon-cli spec task <task-id> --get <path>\n');
    process.exit(1);
  }

  const parsed = parseArgs(args.slice(1));

  // --get mode: read-only task retrieval
  // Usage: hoyeon-cli spec task <id> --get <path>
  if (parsed.get !== undefined) {
    if (typeof parsed.get !== 'string') {
      process.stderr.write('Error: --get requires <path> argument\n');
      process.stderr.write('Usage: hoyeon-cli spec task <task-id> --get <path>\n');
      process.exit(1);
    }
    const filePath = parsed.get;
    const specData = loadSpec(resolve(filePath));
    const task = specData.tasks.find(t => t.id === taskId);
    if (!task) {
      process.stderr.write(`Error: task '${taskId}' not found in spec\n`);
      process.exit(1);
    }
    process.stdout.write(JSON.stringify(task, null, 2) + '\n');
    process.exit(0);
  }

  let status = parsed.status;
  if (parsed.done === true) status = 'done';
  if (parsed['in-progress'] === true) status = 'in_progress';

  if (!status) {
    process.stderr.write('Error: --status <status> is required (or use --done / --in-progress / --get)\n');
    process.exit(1);
  }

  const validStatuses = ['pending', 'in_progress', 'done'];
  if (!validStatuses.includes(status)) {
    process.stderr.write(`Error: invalid status '${status}'. Valid values: ${validStatuses.join(', ')}\n`);
    process.exit(1);
  }

  const filePath = parsed._[0];
  if (!filePath) {
    process.stderr.write('Error: <path> to spec.json is required\n');
    process.exit(1);
  }

  const specPath = resolve(filePath);
  const specData = loadSpec(specPath);

  const task = specData.tasks.find(t => t.id === taskId);
  if (!task) {
    process.stderr.write(`Error: task '${taskId}' not found in spec\n`);
    process.exit(1);
  }

  const now = new Date().toISOString();

  task.status = status;

  if (status === 'in_progress' && !task.started_at) {
    task.started_at = now;
  }

  if (status === 'done') {
    task.completed_at = now;
    if (parsed.summary) {
      task.summary = parsed.summary;
    }
  }

  const historyType = status === 'in_progress' ? 'task_start' : status === 'done' ? 'task_done' : 'spec_updated';
  const entry = { ts: now, type: historyType, task: taskId };
  if (parsed.summary) {
    entry.summary = parsed.summary;
  }

  // Validate before writing
  let schema;
  try {
    schema = loadSchema(specData);
  } catch (err) {
    process.stderr.write(`Error: could not load schema: ${err.message}\n`);
    process.exit(1);
  }

  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const valid = validate(specData);

  if (!valid) {
    process.stderr.write('Validation failed after update:\n');
    for (const e of validate.errors) {
      const path = e.instancePath || '(root)';
      process.stderr.write(`  ${path}: ${e.message}\n`);
    }
    printGuideHints(validate.errors);
    process.exit(1);
  }

  // Atomic write (reuse state-io pattern)
  writeState(specPath, specData);
  appendHistory(specPath, entry);

  process.stdout.write(`Updated task '${taskId}' status to '${status}'\n`);
  process.exit(0);
}

async function handleStatus(args) {
  const filePath = args[0];

  if (!filePath) {
    process.stderr.write('Error: missing <path> argument\n');
    process.stderr.write('Usage: hoyeon-cli spec status <path>\n');
    process.exit(1);
  }

  const specData = loadSpec(resolve(filePath));

  const tasks = specData.tasks || [];
  const done = tasks.filter(t => t.status === 'done');
  const inProgress = tasks.filter(t => t.status === 'in_progress');
  const pending = tasks.filter(t => t.status === 'pending' || !t.status);
  const remaining = tasks.filter(t => t.status !== 'done');

  const plannedTasks = tasks.filter(t => t.origin !== 'derived');
  const derivedTasks = tasks.filter(t => t.origin === 'derived');
  const plannedDone = plannedTasks.filter(t => t.status === 'done');
  const derivedDone = derivedTasks.filter(t => t.status === 'done');

  const result = {
    name: specData.meta?.name || 'unknown',
    done: done.length,
    in_progress: inProgress.length,
    pending: pending.length,
    total: tasks.length,
    planned: { done: plannedDone.length, total: plannedTasks.length },
    derived: { done: derivedDone.length, total: derivedTasks.length },
    complete: remaining.length === 0,
    remaining: remaining.map(t => ({ id: t.id, action: t.action, status: t.status || 'pending' })),
  };

  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(remaining.length === 0 ? 0 : 1);
}

async function handleMeta(args) {
  const filePath = args[0];

  if (!filePath) {
    process.stderr.write('Error: missing <path> argument\n');
    process.stderr.write('Usage: hoyeon-cli spec meta <path>\n');
    process.exit(1);
  }

  const specData = loadSpec(resolve(filePath));
  const meta = specData.meta || {};

  process.stdout.write(JSON.stringify(meta, null, 2) + '\n');
  process.exit(0);
}

/**
 * Collect all scenario IDs defined in requirements and the set of scenario IDs
 * referenced by at least one task's acceptance_criteria.scenarios array.
 *
 * Shared helper used by handleCheck and handleCoverage (C2).
 *
 * @param {object} specData - parsed spec JSON
 * @returns {{ allScenarioIds: Set<string>, referencedScenarioIds: Set<string> }}
 */
function collectScenarioSets(specData) {
  const allScenarioIds = new Set();
  for (const req of (specData.requirements || [])) {
    for (const sc of (req.scenarios || [])) {
      if (sc.id) allScenarioIds.add(sc.id);
    }
  }

  const referencedScenarioIds = new Set();
  for (const task of (specData.tasks || [])) {
    for (const scenarioRef of (task.acceptance_criteria?.scenarios || [])) {
      if (scenarioRef) referencedScenarioIds.add(scenarioRef);
    }
  }

  return { allScenarioIds, referencedScenarioIds };
}

const VALID_COVERAGE_LAYERS = ['decisions', 'requirements', 'scenarios', 'tasks'];

/**
 * Implement spec coverage checks.
 * Checks: source.ref integrity, decision coverage, scenario min count (HP+EP+BC), orphan scenarios.
 * Reuses collectScenarioSets() helper (C2).
 *
 * @param {string[]} args
 */
async function handleCoverage(args) {
  const parsed = parseArgs(args);
  const filePath = parsed._[0];

  if (!filePath) {
    process.stderr.write('Error: missing <path> argument\n');
    process.stderr.write('Usage: hoyeon-cli spec coverage <path> [--layer decisions|requirements|scenarios|tasks] [--json]\n');
    process.exit(1);
  }

  const layer = parsed.layer;
  if (layer !== undefined && !VALID_COVERAGE_LAYERS.includes(layer)) {
    process.stderr.write(`Error: invalid --layer '${layer}'. Valid values: ${VALID_COVERAGE_LAYERS.join(', ')}\n`);
    process.exit(1);
  }

  const useJson = parsed.json === true;
  const specData = loadSpec(resolve(filePath));
  const gaps = [];

  const decisions = specData.context?.decisions || specData.decisions || [];
  const requirements = specData.requirements || [];
  const decisionIds = new Set(decisions.map(d => d.id).filter(Boolean));

  const runDecisions = !layer || layer === 'decisions';
  const runRequirements = !layer || layer === 'requirements';
  const runScenarios = !layer || layer === 'scenarios';
  const runTasks = !layer || layer === 'tasks';

  // --- Check 1: source.ref integrity (decisions layer) ---
  // When decisions exist, each requirement's source.ref must point to a real decision ID.
  // When decisions exist, requirements without source.ref are also flagged.
  if (runDecisions && decisionIds.size > 0) {
    for (const req of requirements) {
      const ref = req.source?.ref;
      if (ref === undefined || ref === null) {
        gaps.push({
          layer: 'decisions',
          check: 'source.ref-integrity',
          message: `requirement '${req.id}' has no source.ref (decisions exist — link required)`,
        });
      } else if (!decisionIds.has(ref)) {
        gaps.push({
          layer: 'decisions',
          check: 'source.ref-integrity',
          message: `requirement '${req.id}' source.ref '${ref}' does not match any decision ID`,
        });
      }
    }
  }

  // --- Check 2: decision coverage (decisions layer) ---
  // Every decision must be referenced by at least one requirement source.ref.
  if (runDecisions && decisionIds.size > 0 && requirements.length > 0) {
    const coveredDecisionIds = new Set();
    for (const req of requirements) {
      const ref = req.source?.ref;
      if (ref) coveredDecisionIds.add(ref);
    }
    for (const decId of decisionIds) {
      if (!coveredDecisionIds.has(decId)) {
        gaps.push({
          layer: 'decisions',
          check: 'decision-coverage',
          message: `decision '${decId}' is not referenced by any requirement source.ref`,
        });
      }
    }
  }

  // --- Check 3: scenario min count (requirements layer) ---
  // Each requirement needs HP+EP+BC (when category field present) or ≥3 scenarios (count-only).
  if (runRequirements) {
    for (const req of requirements) {
      const scenarios = req.scenarios || [];
      // Check if any scenario has a category field
      const anyHasCategory = scenarios.some(sc => sc.category !== undefined);

      if (anyHasCategory) {
        // Category-aware mode: check for HP, EP, BC presence
        const categories = new Set(scenarios.map(sc => sc.category).filter(Boolean));
        const missing = [];
        if (!categories.has('HP')) missing.push('HP');
        if (!categories.has('EP')) missing.push('EP');
        if (!categories.has('BC')) missing.push('BC');
        if (missing.length > 0) {
          gaps.push({
            layer: 'requirements',
            check: 'scenario-min-count',
            message: `requirement '${req.id}' is missing scenario categories: ${missing.join(', ')}`,
          });
        }
      } else {
        // Count-only mode (no category field on any scenario): enforce minimum of 3 scenarios.
        if (scenarios.length < 3) {
          gaps.push({
            layer: 'requirements',
            check: 'scenario-min-count',
            message: `requirement '${req.id}' has ${scenarios.length} scenario(s) but needs at least 3 (count-only mode — no category field present)`,
          });
        }
      }
    }
  }

  // --- Check 4: orphan scenario detection (scenarios layer) ---
  // Reuses collectScenarioSets() helper (C2).
  // Only runs when runTasks is true — orphan detection requires tasks to exist.
  if (runScenarios && runTasks) {
    const { allScenarioIds, referencedScenarioIds } = collectScenarioSets(specData);
    const tasksWithAC = (specData.tasks || []).filter(t => t.acceptance_criteria?.scenarios);
    if (allScenarioIds.size > 0 && tasksWithAC.length > 0) {
      for (const scenarioId of allScenarioIds) {
        if (!referencedScenarioIds.has(scenarioId)) {
          gaps.push({
            layer: 'scenarios',
            check: 'orphan-scenario',
            message: `scenario '${scenarioId}' is defined but not referenced by any task acceptance_criteria`,
          });
        }
      }
    }
  }

  // --- Output ---
  if (useJson) {
    const result = {
      coverage: gaps.length === 0 ? 'pass' : 'fail',
      gaps,
    };
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(gaps.length === 0 ? 0 : 1);
  }

  if (gaps.length > 0) {
    process.stderr.write('Coverage gaps found:\n');
    for (const gap of gaps) {
      process.stderr.write(`  [${gap.layer}/${gap.check}] ${gap.message}\n`);
    }
    process.exit(1);
  }

  process.stdout.write('Coverage passed: all coverage checks OK\n');
  process.exit(0);
}

async function handleCheck(args) {
  const filePath = args[0];

  if (!filePath) {
    process.stderr.write('Error: missing <path> argument\n');
    process.stderr.write('Usage: hoyeon-cli spec check <path>\n');
    process.exit(1);
  }

  const specData = loadSpec(resolve(filePath));
  const issues = [];

  const taskIds = new Set(specData.tasks.map(t => t.id));

  // Check for duplicate IDs
  if (taskIds.size !== specData.tasks.length) {
    issues.push('duplicate task IDs detected');
  }

  // Check depends_on references
  for (const task of specData.tasks) {
    for (const dep of (task.depends_on || [])) {
      if (!taskIds.has(dep)) {
        issues.push(`task '${task.id}' depends on unknown task '${dep}'`);
      }
    }
  }

  // Check done tasks have completed_at
  for (const task of specData.tasks) {
    if (task.status === 'done' && !task.completed_at) {
      issues.push(`task '${task.id}' is done but missing completed_at`);
    }
  }

  // Check depends_on completion for in_progress/done tasks
  for (const task of specData.tasks) {
    if (task.status === 'in_progress' || task.status === 'done') {
      for (const dep of (task.depends_on || [])) {
        const depTask = specData.tasks.find(t => t.id === dep);
        if (depTask && depTask.status !== 'done') {
          issues.push(`task '${task.id}' is ${task.status} but dependency '${dep}' is not done`);
        }
      }
    }
  }

  // Check derived task constraints
  for (const task of specData.tasks) {
    if (task.origin === 'derived') {
      if (!task.derived_from || !task.derived_from.parent) {
        issues.push(`task '${task.id}' has origin=derived but is missing derived_from.parent`);
      } else if (!taskIds.has(task.derived_from.parent)) {
        issues.push(`task '${task.id}' derived_from.parent '${task.derived_from.parent}' does not reference a valid task ID`);
      }
    }
  }

  // Referential integrity: AC.scenarios[] must reference valid requirements[].scenarios[].id
  const { allScenarioIds, referencedScenarioIds } = collectScenarioSets(specData);
  for (const task of specData.tasks) {
    for (const scenarioRef of (task.acceptance_criteria?.scenarios || [])) {
      if (!allScenarioIds.has(scenarioRef)) {
        issues.push(`task '${task.id}' acceptance_criteria.scenarios references unknown scenario '${scenarioRef}'`);
      }
    }
  }

  // source.ref referential integrity: requirement.source.ref must match an existing decision ID
  // (skip gracefully when decisions array or source.ref are absent — v4 compat)
  const decisionIds = new Set((specData.context?.decisions || specData.decisions || []).map(d => d.id).filter(Boolean));
  for (const req of (specData.requirements || [])) {
    const ref = req.source?.ref;
    if (ref !== undefined && ref !== null) {
      if (!decisionIds.has(ref)) {
        issues.push(`requirement '${req.id}' source.ref '${ref}' does not match any decision ID`);
      }
    }
  }

  // Orphan scenario detection: scenarios defined but not referenced by any task AC
  // (skip gracefully when no task defines acceptance_criteria — v4 compat)
  const tasksWithAC = (specData.tasks || []).filter(t => t.acceptance_criteria?.scenarios);
  if (allScenarioIds.size > 0 && tasksWithAC.length > 0) {
    for (const scenarioId of allScenarioIds) {
      if (!referencedScenarioIds.has(scenarioId)) {
        issues.push(`scenario '${scenarioId}' is defined but not referenced by any task acceptance_criteria`);
      }
    }
  }

  // Check file_scope overlap across tasks (warning only)
  const warnings = [];

  // Decision coverage: every decision ID must appear in at least one requirement source.ref
  // (skip gracefully when decisions or requirements are absent — v4 compat)
  if ((specData.context?.decisions || specData.decisions || []).length > 0 && (specData.requirements || []).length > 0) {
    const coveredDecisionIds = new Set();
    for (const req of (specData.requirements || [])) {
      const ref = req.source?.ref;
      if (ref) coveredDecisionIds.add(ref);
    }
    for (const decId of decisionIds) {
      if (!coveredDecisionIds.has(decId)) {
        warnings.push(`decision '${decId}' is not referenced by any requirement source.ref`);
      }
    }
  }
  const fileScopeMap = new Map();
  for (const task of specData.tasks) {
    for (const file of (task.file_scope || [])) {
      if (!fileScopeMap.has(file)) fileScopeMap.set(file, []);
      fileScopeMap.get(file).push(task.id);
    }
  }
  for (const [file, taskList] of fileScopeMap) {
    if (taskList.length > 1) {
      warnings.push(`file '${file}' appears in file_scope of multiple tasks: ${taskList.join(', ')}`);
    }
  }

  if (issues.length > 0) {
    process.stderr.write('Spec check failed:\n');
    for (const issue of issues) {
      process.stderr.write(`  - ${issue}\n`);
    }
    process.exit(1);
  }

  if (warnings.length > 0) {
    process.stderr.write('Warnings:\n');
    for (const w of warnings) {
      process.stderr.write(`  - ${w}\n`);
    }
  }

  process.stdout.write('Spec check passed: internal consistency OK\n');
  process.exit(0);
}

/**
 * Generate compact, LLM-friendly guide from the JSON Schema.
 * Resolves $ref, shows required/optional fields, types, enums, and minimal examples.
 */
function generateGuide(section) {
  const schema = loadSchema(); // defaults to v5
  const defs = schema.$defs || {};

  const SECTIONS = {
    meta: { ref: 'meta', desc: 'Spec metadata (name, goal, mode, etc.)' },
    context: { ref: 'context', desc: 'Request context, interview decisions, research, assumptions' },
    tasks: { ref: 'task', desc: 'Task DAG (work items + verification)', isArray: true },
    requirements: { ref: 'requirement', desc: 'Requirements with scenarios and verification', isArray: true },
    constraints: { ref: 'constraint', desc: 'Must-not-do / preserve constraints', isArray: true },
    history: { ref: 'historyEntry', desc: 'Spec change history entries', isArray: true },
    verification: { ref: 'verificationSummary', desc: 'A/H/S verification classification summary' },
    external: { ref: 'externalDependencies', desc: 'Human-only pre/post-work dependencies' },
    scenario: { ref: 'scenario', desc: 'Requirement scenario (given/when/then + verify)' },
    verify: { ref: null, desc: 'Verify types: command, assertion, instruction', custom: 'verify' },
    merge: { ref: null, desc: 'Merge modes: replace (default), --append, --patch', custom: 'merge' },
    'acceptance-criteria': { ref: null, desc: 'v5 AC structure: scenarios[] + checks[]', custom: 'acceptance-criteria' },
  };

  if (!section || section === 'list') {
    const lines = ['Available guide sections:'];
    for (const [name, info] of Object.entries(SECTIONS)) {
      lines.push(`  ${name.padEnd(16)} ${info.desc}`);
    }
    lines.push('');
    lines.push('Usage: hoyeon-cli spec guide <section>');
    lines.push('       hoyeon-cli spec guide full      (all sections)');
    lines.push('       hoyeon-cli spec guide root      (top-level structure)');
    return lines.join('\n');
  }

  if (section === 'root') {
    return formatRoot(schema);
  }

  if (section === 'full') {
    const lines = [formatRoot(schema), ''];
    for (const [name, info] of Object.entries(SECTIONS)) {
      const def = defs[info.ref];
      if (def) {
        lines.push(`--- ${name} ---`);
        lines.push(formatDef(name, def, defs, info.isArray));
        lines.push('');
      }
    }
    return lines.join('\n');
  }

  const info = SECTIONS[section];
  if (!info) {
    return `Error: unknown section '${section}'. Run 'hoyeon-cli spec guide' to see available sections.`;
  }

  if (info.custom === 'verify') {
    return formatVerifyGuide(defs);
  }

  if (info.custom === 'merge') {
    return formatMergeGuide();
  }

  if (info.custom === 'acceptance-criteria') {
    return formatAcceptanceCriteriaGuide();
  }

  const def = defs[info.ref];
  if (!def) {
    return `Error: schema definition '${info.ref}' not found.`;
  }

  let output = formatDef(section, def, defs, info.isArray);

  // Append conditional requirement notes for scenario
  if (section === 'scenario') {
    output += '\n';
    output += '\n  notes:';
    output += '\n    subject: conditionally required when execution_env is sandbox';
    output += '\n             enum(web|server|cli|database) — identifies which system under test';
  }

  return output;
}

function formatRoot(schema) {
  const lines = ['spec.json top-level structure:'];
  lines.push(`  required: ${(schema.required || []).join(', ')}`);
  lines.push('  fields:');
  for (const [key, val] of Object.entries(schema.properties || {})) {
    if (key === '$schema') continue;
    const req = (schema.required || []).includes(key) ? '*' : ' ';
    const desc = val.description || '';
    lines.push(`    ${req} ${key}${desc ? ` — ${desc}` : ''}`);
  }
  lines.push('');
  lines.push('  * = required');
  return lines.join('\n');
}

function formatDef(name, def, defs, isArray) {
  const lines = [];
  if (isArray) {
    lines.push(`${name}: array of objects`);
  } else {
    lines.push(`${name}: object`);
  }

  const required = new Set(def.required || []);
  if (required.size > 0) {
    lines.push(`  required: ${[...required].join(', ')}`);
  }

  const props = def.properties || {};
  for (const [key, prop] of Object.entries(props)) {
    const req = required.has(key) ? '*' : ' ';
    const typeStr = resolveType(prop, defs, '    ');
    lines.push(`  ${req} ${key}: ${typeStr}`);
  }

  // Add example
  const example = generateExample(name, def, defs, required);
  if (example) {
    lines.push('');
    if (isArray) {
      lines.push(`  example merge: --json '{"${name}":[${example}]}'`);
    } else {
      lines.push(`  example merge: --json '{"${name}":${example}}'`);
    }
  }

  return lines.join('\n');
}

function resolveType(prop, defs, indent) {
  if (prop.$ref) {
    const refName = prop.$ref.replace('#/$defs/', '');
    const refDef = defs[refName];
    if (refDef) {
      if (refDef.enum) return `enum(${refDef.enum.join('|')})`;
      if (refDef.type === 'object') return `{${refName}}`;
      return refDef.type || refName;
    }
    return refName;
  }
  if (prop.oneOf) {
    const types = prop.oneOf.map(o => {
      if (o.$ref) return `{${o.$ref.replace('#/$defs/', '')}}`;
      if (o.type) return o.type;
      return '?';
    });
    return types.join(' | ');
  }
  if (prop.enum) return `enum(${prop.enum.join('|')})`;
  if (prop.type === 'array') {
    if (prop.items) {
      if (prop.items.$ref) {
        const refName = prop.items.$ref.replace('#/$defs/', '');
        return `[{${refName}}]`;
      }
      if (prop.items.oneOf) return `[mixed]`;
      // Inline anonymous object arrays
      if (prop.items.type === 'object' && prop.items.properties) {
        return formatInlineObject(prop.items, indent);
      }
      return `[${prop.items.type || 'any'}]`;
    }
    return '[]';
  }
  if (prop.const) return `"${prop.const}"`;
  // Inline anonymous objects
  if (prop.type === 'object' && prop.properties) {
    return formatInlineObject(prop, indent);
  }
  let t = prop.type || 'any';
  if (prop.minimum !== undefined || prop.maximum !== undefined) {
    const parts = [];
    if (prop.minimum !== undefined) parts.push(`min:${prop.minimum}`);
    if (prop.maximum !== undefined) parts.push(`max:${prop.maximum}`);
    t += `(${parts.join(',')})`;
  }
  return t;
}

function formatInlineObject(schema, indent = '    ') {
  const req = new Set(schema.required || []);
  const props = schema.properties || {};
  const fields = [];
  for (const [k, v] of Object.entries(props)) {
    const r = req.has(k) ? '*' : ' ';
    const t = v.enum ? `enum(${v.enum.join('|')})` : (v.const ? `"${v.const}"` : (v.type || 'any'));
    fields.push(`${indent}  ${r} ${k}: ${t}`);
  }
  const isArray = schema === schema ? '' : ''; // just object
  return `[object]\n${fields.join('\n')}`;
}

function generateExample(name, def, defs, required) {
  const props = def.properties || {};
  const obj = {};
  for (const key of required) {
    const prop = props[key];
    if (!prop) continue;
    obj[key] = exampleValue(key, prop, defs);
  }

  // Add 1-2 common optional fields for context
  const optionals = Object.keys(props).filter(k => !required.has(k));
  let added = 0;
  for (const key of optionals) {
    if (added >= 2) break;
    const prop = props[key];
    if (prop.type === 'string' || prop.enum) {
      obj[key] = exampleValue(key, prop, defs);
      added++;
    }
  }

  try {
    return JSON.stringify(obj);
  } catch {
    return null;
  }
}

function exampleValue(key, prop, defs) {
  if (prop.enum) return prop.enum[0];
  if (prop.const) return prop.const;
  if (prop.$ref) {
    const refName = prop.$ref.replace('#/$defs/', '');
    const refDef = defs[refName];
    if (refDef?.enum) return refDef.enum[0];
    return `<${refName}>`;
  }
  if (prop.type === 'string') return `<${key}>`;
  if (prop.type === 'integer') return prop.minimum || 1;
  if (prop.type === 'boolean') return false;
  if (prop.type === 'array') return [];
  if (prop.type === 'object') return {};
  return `<${key}>`;
}

function formatMergeGuide() {
  const lines = [
    'spec merge modes:',
    '',
    '  (default) — replace',
    '    Arrays are replaced entirely. Objects are deep-merged.',
    '    hoyeon-cli spec merge <path> --json \'{"tasks":[...]}\'',
    '',
    '  --append — concatenate arrays',
    '    New array items are appended to existing arrays.',
    '    hoyeon-cli spec merge <path> --json \'{"tasks":[{"id":"T2",...}]}\' --append',
    '',
    '  --patch — ID-based merge',
    '    Array items with matching "id" are updated in place.',
    '    Items with new ids are appended. Non-array fields deep-merge normally.',
    '    hoyeon-cli spec merge <path> --json \'{"tasks":[{"id":"T1","status":"done"}]}\' --patch',
    '',
    '  --append and --patch are mutually exclusive.',
    '',
    '  When to use which:',
    '    replace   — rewrite a section completely (e.g. set all tasks at once)',
    '    --append  — add new items without touching existing (e.g. add requirements)',
    '    --patch   — update specific items by id (e.g. update one task\'s status)',
  ];
  return lines.join('\n');
}

function formatAcceptanceCriteriaGuide() {
  const lines = [
    'acceptance_criteria (v5): scenarios[] + checks[]',
    '',
    '  scenarios: string[]',
    '    List of scenario IDs from requirements[].scenarios[].id that this task fulfills.',
    '    These are referential — spec check validates that each ID exists in requirements.',
    '    example: ["R1-S1", "R1-S2", "R2-S1"]',
    '',
    '  checks: taskCheck[]',
    '    Automated checks to run when verifying the task.',
    '    Each check has:',
    '      * type: enum(static|build|lint|format)',
    '      * run: string (shell command)',
    '    example: [{"type":"build","run":"cd cli && node build.mjs"},{"type":"static","run":"tsc --noEmit"}]',
    '',
    '  example acceptance_criteria:',
    '    {',
    '      "scenarios": ["R1-S1", "R2-S1"],',
    '      "checks": [',
    '        {"type": "build", "run": "cd cli && node build.mjs"},',
    '        {"type": "lint", "run": "eslint src/"}',
    '      ]',
    '    }',
    '',
    '  Note: spec check validates referential integrity.',
    '    AC.scenarios IDs must exist in requirements[].scenarios[].id.',
    '    Run: hoyeon-cli spec check <path>',
  ];
  return lines.join('\n');
}

function formatVerifyGuide(defs) {
  const lines = [
    'verify: oneOf — choose based on verified_by value:',
    '',
    '  verified_by: "machine" → verifyCommand',
    '    * type: "command"',
    '    * run: string (shell command)',
    '    * expect: { *exit_code: int, stdout_contains?: string, stderr_empty?: bool }',
    '    example: {"type":"command","run":"npm test","expect":{"exit_code":0}}',
    '',
    '  verified_by: "agent" → verifyAssertion',
    '    * type: "assertion"',
    '    * checks: [string] (min 1 item)',
    '    example: {"type":"assertion","checks":["file exists at src/foo.ts"]}',
    '',
    '  verified_by: "human" → verifyInstruction',
    '    * type: "instruction"',
    '    * ask: string (question for human)',
    '    example: {"type":"instruction","ask":"Does the UI look correct?"}',
  ];
  return lines.join('\n');
}

async function handleGuide(args) {
  const section = args[0];
  const output = generateGuide(section);
  process.stdout.write(output + '\n');
  process.exit(0);
}

/**
 * Generate the next available derived task ID for a given parent and trigger.
 * Format: {parent_id}.{trigger}-{N} where N starts at 1 and increments.
 */
function generateDerivedId(tasks, parentId, trigger) {
  const prefix = `${parentId}.${trigger}-`;
  let maxN = 0;
  for (const t of tasks) {
    if (t.id.startsWith(prefix)) {
      const suffix = t.id.slice(prefix.length);
      const n = parseInt(suffix, 10);
      if (!isNaN(n) && n > maxN) maxN = n;
    }
  }
  return `${prefix}${maxN + 1}`;
}

async function handleDerive(args) {
  const parsed = parseArgs(args);

  // Required flags
  const requiredFlags = ['parent', 'source', 'trigger', 'action', 'reason'];
  for (const flag of requiredFlags) {
    if (!parsed[flag]) {
      process.stderr.write(`Error: --${flag} is required\n`);
      process.stderr.write('Usage: hoyeon-cli spec derive --parent <id> --source <src> --trigger <trigger> --action <action> --reason <reason> [--attempt <n>] [--file-scope <f1,f2>] [--steps <s1,s2>] <path>\n');
      process.exit(1);
    }
  }

  // Validate trigger value
  const validTriggers = ['adapt', 'retry', 'code_review', 'final_verify'];
  if (!validTriggers.includes(parsed.trigger)) {
    process.stderr.write(`Error: --trigger must be one of: ${validTriggers.join(', ')}\n`);
    process.exit(1);
  }

  // Path argument
  const filePath = parsed._[0];
  if (!filePath) {
    process.stderr.write('Error: <path> to spec.json is required\n');
    process.exit(1);
  }

  const specPath = resolve(filePath);
  const specData = loadSpec(specPath);

  // Validate parent task exists
  const parentTask = (specData.tasks || []).find(t => t.id === parsed.parent);
  if (!parentTask) {
    process.stderr.write(`Error: parent task '${parsed.parent}' not found in spec\n`);
    process.exit(1);
  }

  // Depth-1 enforcement: parent must be planned (or have no origin, which defaults to planned)
  const parentOrigin = parentTask.origin || 'planned';
  if (parentOrigin === 'derived' || parentOrigin === 'adapted') {
    process.stderr.write(`Error: Parent must be a planned task (depth-1 enforcement)\n`);
    process.exit(1);
  }

  // Auto-generate ID
  const newId = generateDerivedId(specData.tasks || [], parsed.parent, parsed.trigger);

  // Parse optional flags
  const fileScope = parsed['file-scope']
    ? parsed['file-scope'].split(',').map(s => s.trim()).filter(Boolean)
    : undefined;

  const steps = parsed.steps
    ? parsed.steps.split(',').map(s => s.trim()).filter(Boolean)
    : undefined;

  // Build derived_from object (schema: parent, trigger, source, reason — no attempt in schema)
  const derivedFrom = {
    parent: parsed.parent,
    trigger: parsed.trigger,
    source: parsed.source,
    reason: parsed.reason,
  };

  // Build new task object
  const newTask = {
    id: newId,
    action: parsed.action,
    type: 'work',
    status: 'pending',
    origin: 'derived',
    derived_from: derivedFrom,
    depends_on: [parsed.parent],
  };

  if (fileScope) newTask.file_scope = fileScope;
  if (steps) newTask.steps = steps;

  // Merge task into spec using append logic
  if (!specData.tasks) specData.tasks = [];
  specData.tasks = specData.tasks.concat([newTask]);

  // Add history entry
  const now = new Date().toISOString();

  // Update meta
  if (specData.meta) specData.meta.updated_at = now;

  // Validate spec
  validateSpec(specData);

  // Rebuild DAG (plan) to verify consistency — just call buildPlan for validation
  buildPlan(specData.tasks);

  // Write spec
  writeState(specPath, specData);
  appendHistory(specPath, {
    ts: now,
    type: 'tasks_changed',
    task: newId,
    detail: `derived from ${parsed.parent} via ${parsed.trigger}`,
  });

  // Output created task ID as JSON
  process.stdout.write(JSON.stringify({ created: newId }) + '\n');
  process.exit(0);
}

async function handleDrift(args) {
  const filePath = args[0];

  if (!filePath) {
    process.stderr.write('Error: missing <path> argument\n');
    process.stderr.write('Usage: hoyeon-cli spec drift <path>\n');
    process.exit(1);
  }

  const specData = loadSpec(resolve(filePath));
  const tasks = specData.tasks || [];

  const plannedTasks = tasks.filter(t => !t.origin || t.origin === 'planned' || t.origin === 'adapted');
  const derivedTasks = tasks.filter(t => t.origin === 'derived');

  const plannedCount = plannedTasks.length;
  const derivedCount = derivedTasks.length;
  const driftRatio = plannedCount === 0 ? 0 : derivedCount / plannedCount;

  // Group derived tasks by trigger
  const byTrigger = {};
  for (const t of derivedTasks) {
    const trigger = t.derived_from?.trigger || 'unknown';
    byTrigger[trigger] = (byTrigger[trigger] || 0) + 1;
  }

  // Group derived tasks by source
  const bySource = {};
  for (const t of derivedTasks) {
    const source = t.derived_from?.source || 'unknown';
    bySource[source] = (bySource[source] || 0) + 1;
  }

  const result = {
    planned: plannedCount,
    derived: derivedCount,
    drift_ratio: Math.round(driftRatio * 1000) / 1000,
    by_trigger: byTrigger,
    by_source: bySource,
  };

  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(0);
}

async function handleScenario(args) {
  const scenarioId = args[0];

  if (!scenarioId || scenarioId.startsWith('--')) {
    process.stderr.write('Error: <scenario-id> is required\n');
    process.stderr.write('Usage: hoyeon-cli spec scenario <scenario-id> --get <path>\n');
    process.exit(1);
  }

  const parsed = parseArgs(args.slice(1));

  if (parsed.get === undefined) {
    process.stderr.write('Error: --get <path> is required\n');
    process.stderr.write('Usage: hoyeon-cli spec scenario <scenario-id> --get <path>\n');
    process.exit(1);
  }

  if (typeof parsed.get !== 'string') {
    process.stderr.write('Error: --get requires <path> argument\n');
    process.stderr.write('Usage: hoyeon-cli spec scenario <scenario-id> --get <path>\n');
    process.exit(1);
  }

  const filePath = parsed.get;
  const specData = loadSpec(resolve(filePath));

  let found = null;
  for (const req of (specData.requirements || [])) {
    for (const scenario of (req.scenarios || [])) {
      if (scenario.id === scenarioId) {
        found = scenario;
        break;
      }
    }
    if (found) break;
  }

  if (!found) {
    process.stderr.write(`Error: scenario '${scenarioId}' not found in spec\n`);
    process.exit(1);
  }

  process.stdout.write(JSON.stringify(found, null, 2) + '\n');
  process.exit(0);
}

/**
 * Helper to find a scenario by ID across all requirements.
 * Returns { scenario, requirement } or null.
 */
function findScenarioById(specData, scenarioId) {
  for (const req of (specData.requirements || [])) {
    for (const scenario of (req.scenarios || [])) {
      if (scenario.id === scenarioId) {
        return { scenario, requirement: req };
      }
    }
  }
  return null;
}

async function handleRequirement(args) {
  const parsed = parseArgs(args);

  // Determine mode:
  // A) --status (flag without id) → full status view  (args[0] === '--status' or no positional id but --status flag)
  // B) <id> --get <path>         → individual scenario lookup
  // C) <id> --status <val> --task <task_id> <path> → update scenario status

  // Check if first positional looks like a flag (or absent)
  const firstPositional = parsed._[0];
  const isStatusFlag = parsed.status === true; // --status without value

  // Mode A: spec requirement --status <path>
  // Detection: no scenario id positional AND --status is boolean true
  if (!firstPositional && isStatusFlag) {
    const filePath = parsed._[0] || parsed._[1];
    // path comes as next positional after --status
    // Re-parse with positional collection
    // The path is in parsed._ but --status consumed nothing, so path is parsed._[0]
    // Actually parseArgs puts the path in _[0] if it appears before --status,
    // or the user runs: spec requirement --status <path>
    // parseArgs sees --status <path> where path doesn't start with --, so it becomes parsed.status = path
    // Let's handle that:
    const resolvedPath = typeof parsed.status === 'string' ? parsed.status : parsed._[0];
    if (!resolvedPath) {
      process.stderr.write('Error: <path> is required\n');
      process.stderr.write('Usage: hoyeon-cli spec requirement --status <path> [--json]\n');
      process.exit(1);
    }
    const specData = loadSpec(resolve(resolvedPath));
    const useJson = parsed.json === true;
    return handleRequirementStatusView(specData, useJson);
  }

  // Mode A (alternative detection): first token is a path-like string and --status is string
  // e.g. spec requirement --status ./spec.json
  if (!firstPositional && typeof parsed.status === 'string') {
    const resolvedPath = parsed.status;
    if (!resolvedPath) {
      process.stderr.write('Error: <path> is required\n');
      process.exit(1);
    }
    const specData = loadSpec(resolve(resolvedPath));
    const useJson = parsed.json === true;
    return handleRequirementStatusView(specData, useJson);
  }

  // If we have a positional (scenario id):
  const scenarioId = firstPositional;

  if (!scenarioId) {
    process.stderr.write('Error: <scenario-id> or --status flag is required\n');
    process.stderr.write('Usage: hoyeon-cli spec requirement --status <path>\n');
    process.stderr.write('       hoyeon-cli spec requirement <id> --get <path>\n');
    process.stderr.write('       hoyeon-cli spec requirement <id> --status pass|fail|skipped --task <task_id> <path>\n');
    process.exit(1);
  }

  // Mode B: spec requirement <id> --get <path>
  if (parsed.get !== undefined) {
    if (typeof parsed.get !== 'string') {
      process.stderr.write('Error: --get requires <path> argument\n');
      process.exit(1);
    }
    const specData = loadSpec(resolve(parsed.get));
    const found = findScenarioById(specData, scenarioId);
    if (!found) {
      process.stderr.write(`Error: scenario '${scenarioId}' not found in spec\n`);
      process.exit(1);
    }
    process.stdout.write(JSON.stringify(found.scenario, null, 2) + '\n');
    process.exit(0);
  }

  // Mode C: spec requirement <id> --status pass|fail|skipped --task <task_id> [--reason <msg>] <path>
  const statusValue = typeof parsed.status === 'string' ? parsed.status : null;
  if (statusValue) {
    const validStatuses = ['pass', 'fail', 'skipped'];
    if (!validStatuses.includes(statusValue)) {
      process.stderr.write(`Error: --status must be one of: ${validStatuses.join(', ')}\n`);
      process.exit(1);
    }

    if (!parsed.task) {
      process.stderr.write('Error: --task <task_id> is required when updating scenario status\n');
      process.exit(1);
    }

    const filePath = parsed._[1];
    if (!filePath) {
      process.stderr.write('Error: <path> to spec.json is required\n');
      process.exit(1);
    }

    const specPath = resolve(filePath);
    const specData = loadSpec(specPath);

    const found = findScenarioById(specData, scenarioId);
    if (!found) {
      process.stderr.write(`Error: scenario '${scenarioId}' not found in spec\n`);
      process.exit(1);
    }

    // Update scenario fields
    found.scenario.status = statusValue;
    found.scenario.verified_by_task = parsed.task;
    if (parsed.reason) {
      found.scenario.verification_reason = parsed.reason;
    }

    // Add history entry
    const now = new Date().toISOString();
    if (specData.meta) specData.meta.updated_at = now;

    writeState(specPath, specData);
    appendHistory(specPath, {
      ts: now,
      type: 'scenario_verified',
      scenario: scenarioId,
      status: statusValue,
      task: parsed.task,
    });

    process.stdout.write(`Updated scenario '${scenarioId}': status=${statusValue}, verified_by_task=${parsed.task}\n`);
    process.exit(0);
  }

  // Fallback: unknown usage
  process.stderr.write('Error: could not determine mode. Use --get, --status (flag), or --status <value> --task <id>\n');
  process.exit(1);
}

function handleRequirementStatusView(specData, useJson) {
  const requirements = specData.requirements || [];

  const requirementRows = requirements.map(req => {
    const scenarios = (req.scenarios || []).map(sc => {
      const verifiedBy = sc.verified_by || 'unknown';
      const execEnv = sc.execution_env ? `[${sc.execution_env}]` : '';
      const status = sc.status || 'pending';
      const verifiedByTask = sc.verified_by_task || null;

      return {
        id: sc.id,
        verified_by: verifiedBy,
        execution_env: sc.execution_env || null,
        status,
        verified_by_task: verifiedByTask,
      };
    });
    return {
      id: req.id,
      behavior: req.behavior,
      scenarios,
    };
  });

  // Compute summary
  let passCount = 0;
  let failCount = 0;
  let pendingCount = 0;
  let skippedCount = 0;
  for (const req of requirementRows) {
    for (const sc of req.scenarios) {
      if (sc.status === 'pass') passCount++;
      else if (sc.status === 'fail') failCount++;
      else if (sc.status === 'skipped') skippedCount++;
      else pendingCount++;
    }
  }

  const summary = { pass: passCount, fail: failCount, pending: pendingCount, skipped: skippedCount };

  if (useJson) {
    process.stdout.write(JSON.stringify({ requirements: requirementRows, summary }, null, 2) + '\n');
    process.exit(0);
  }

  // Text format
  const lines = [];
  for (const req of requirementRows) {
    const scCount = req.scenarios.length;
    lines.push(`${req.id}: ${req.behavior} (${scCount} scenario${scCount !== 1 ? 's' : ''})`);
    for (const sc of req.scenarios) {
      const verifiedByLabel = sc.verified_by === 'human' ? 'Manual' :
        sc.verified_by === 'agent' ? `Agent ${sc.execution_env ? `[${sc.execution_env}]` : ''}`.trim() :
        sc.verified_by === 'machine' ? `Auto ${sc.execution_env ? `[${sc.execution_env}]` : ''}`.trim() :
        sc.verified_by;
      const taskLabel = sc.verified_by_task ? ` (${sc.verified_by_task})` : '';
      lines.push(`  ${sc.id}: ${verifiedByLabel.padEnd(16)} ${sc.status}${taskLabel}`);
    }
    lines.push('');
  }

  const summaryParts = [];
  if (passCount > 0) summaryParts.push(`${passCount} pass`);
  if (failCount > 0) summaryParts.push(`${failCount} fail`);
  if (pendingCount > 0) summaryParts.push(`${pendingCount} pending`);
  if (skippedCount > 0) summaryParts.push(`${skippedCount} skipped`);
  lines.push(`Summary: ${summaryParts.join(', ') || 'no scenarios'}`);

  process.stdout.write(lines.join('\n') + '\n');
  process.exit(0);
}

async function handleSandboxTasks(args) {
  const parsed = parseArgs(args);
  const filePath = parsed._[0];

  if (!filePath) {
    process.stderr.write('Error: <path> is required\n');
    process.stderr.write('Usage: hoyeon-cli spec sandbox-tasks <path> [--json]\n');
    process.exit(1);
  }

  const specPath = resolve(filePath);
  const specData = loadSpec(specPath);
  const useJson = parsed.json === true;

  // Find all sandbox scenarios
  const sandboxScenarios = [];
  for (const req of (specData.requirements || [])) {
    for (const sc of (req.scenarios || [])) {
      if (sc.execution_env === 'sandbox') {
        sandboxScenarios.push({ ...sc, requirement_id: req.id });
      }
    }
  }

  if (sandboxScenarios.length === 0) {
    if (useJson) {
      process.stdout.write(JSON.stringify({ sandbox_scenarios: [], created_tasks: [] }, null, 2) + '\n');
    } else {
      process.stdout.write('No sandbox scenarios found. Nothing to do.\n');
    }
    process.exit(0);
  }

  const existingTasks = specData.tasks || [];
  const existingTaskIds = new Set(existingTasks.map(t => t.id));

  // Build set of sandbox scenario IDs for lookup
  const sandboxScenarioIds = new Set(sandboxScenarios.map(sc => sc.id));

  // Find work tasks that reference sandbox scenarios in their acceptance_criteria.scenarios
  const workTasksReferencingSandbox = existingTasks.filter(t => {
    const acScenarios = t.acceptance_criteria?.scenarios || [];
    return acScenarios.some(sid => sandboxScenarioIds.has(sid));
  });

  const createdTasks = [];

  // Create T_SANDBOX if it doesn't exist
  if (!existingTaskIds.has('T_SANDBOX')) {
    const sandboxInfraTask = {
      id: 'T_SANDBOX',
      action: 'Prepare sandbox environment for scenario verification',
      type: 'work',
      status: 'pending',
      depends_on: workTasksReferencingSandbox.map(t => t.id),
    };
    existingTasks.push(sandboxInfraTask);
    existingTaskIds.add('T_SANDBOX');
    createdTasks.push(sandboxInfraTask);
  }

  // Create T_SV1, T_SV2, ... for each sandbox scenario
  let svCounter = 1;
  // Find the max existing T_SV number
  for (const t of existingTasks) {
    const m = t.id.match(/^T_SV(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= svCounter) svCounter = n + 1;
    }
  }

  const newSvTasks = [];
  for (const sc of sandboxScenarios) {
    const svId = `T_SV${svCounter++}`;
    if (!existingTaskIds.has(svId)) {
      const svTask = {
        id: svId,
        action: `Verify ${sc.id}: ${sc.then}`,
        type: 'work',
        status: 'pending',
        depends_on: ['T_SANDBOX'],
      };
      existingTasks.push(svTask);
      existingTaskIds.add(svId);
      createdTasks.push(svTask);
      newSvTasks.push(svTask);
    }
  }

  // Update spec tasks and write
  specData.tasks = existingTasks;

  const now = new Date().toISOString();
  if (specData.meta) specData.meta.updated_at = now;

  writeState(specPath, specData);
  appendHistory(specPath, {
    ts: now,
    type: 'tasks_changed',
    detail: `sandbox-tasks: created ${createdTasks.map(t => t.id).join(', ')}`,
  });

  if (useJson) {
    process.stdout.write(JSON.stringify({
      sandbox_scenarios: sandboxScenarios.map(sc => sc.id),
      created_tasks: createdTasks.map(t => t.id),
    }, null, 2) + '\n');
  } else {
    process.stdout.write(`Created ${createdTasks.length} task(s):\n`);
    for (const t of createdTasks) {
      process.stdout.write(`  ${t.id}: ${t.action}\n`);
    }
  }
  process.exit(0);
}

// ── BM25 tokenizer ──────────────────────────────────────────────────────────
function tokenize(text) {
  if (!text) return [];
  return text.toLowerCase()
    .replace(/[^a-z0-9가-힣\s\-_]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

// ── spec learning ───────────────────────────────────────────────────────────
async function handleLearning(args) {
  const parsed = parseArgs(args);

  const taskId = parsed.task;
  if (!taskId) {
    process.stderr.write('Error: --task <task-id> is required\n');
    process.stderr.write('Usage: hoyeon-cli spec learning --task T1 --json \'{"problem":"...","cause":"...","rule":"...","tags":[...]}\' <path>\n');
    process.stderr.write('   or: hoyeon-cli spec learning --task T1 --stdin <path> << \'EOF\'\n');
    process.exit(1);
  }

  let jsonStr = parsed.json;

  // Support --stdin: read JSON from stdin (avoids tmp files and SESSION_ID dependency)
  // parseArgs may consume the next positional arg as --stdin's value, so recover it
  if (parsed.stdin !== undefined) {
    if (typeof parsed.stdin === 'string') {
      // --stdin consumed the spec path as its value — push it back to positionals
      parsed._.unshift(parsed.stdin);
    }
    try {
      jsonStr = readFileSync('/dev/stdin', 'utf8').trim();
    } catch (err) {
      process.stderr.write(`Error: failed to read stdin: ${err.message}\n`);
      process.exit(1);
    }
  }

  if (!jsonStr) {
    process.stderr.write('Error: --json or --stdin is required\n');
    process.exit(1);
  }

  let learningData;
  try {
    learningData = JSON.parse(jsonStr);
  } catch (err) {
    process.stderr.write(`Error: invalid JSON: ${err.message}\n`);
    process.exit(1);
  }

  const filePath = parsed._[0];
  if (!filePath) {
    process.stderr.write('Error: <path> to spec.json is required\n');
    process.exit(1);
  }

  const specPath = resolve(filePath);
  const specData = loadSpec(specPath);

  // Find task and auto-map requirements
  const task = specData.tasks.find(t => t.id === taskId);
  if (!task) {
    process.stderr.write(`Error: task '${taskId}' not found in spec\n`);
    process.exit(1);
  }

  // Extract requirement IDs from acceptance_criteria.scenarios
  const requirementIds = [];
  if (task.acceptance_criteria?.scenarios) {
    for (const scenarioId of task.acceptance_criteria.scenarios) {
      const reqId = scenarioId.replace(/-S\d+$/, '');
      if (!requirementIds.includes(reqId)) {
        requirementIds.push(reqId);
      }
    }
  }

  // Load or create learnings.json
  const contextDir = resolve(dirname(specPath), 'context');
  const learningsPath = resolve(contextDir, 'learnings.json');

  let learnings = [];
  if (existsSync(learningsPath)) {
    try {
      learnings = JSON.parse(readFileSync(learningsPath, 'utf8'));
    } catch {
      learnings = [];
    }
  } else if (!existsSync(contextDir)) {
    mkdirSync(contextDir, { recursive: true });
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
    requirements: requirementIds,
    problem: learningData.problem || '',
    cause: learningData.cause || '',
    rule: learningData.rule || '',
    tags: learningData.tags || [],
    created_at: new Date().toISOString()
  };

  learnings.push(entry);
  writeFileSync(learningsPath, JSON.stringify(learnings, null, 2) + '\n');

  process.stdout.write(`Added learning '${newId}' for task '${taskId}' → requirements: [${requirementIds.join(', ')}]\n`);
  process.stdout.write(JSON.stringify(entry, null, 2) + '\n');
  process.exit(0);
}

// ── spec issue ──────────────────────────────────────────────────────────────
async function handleIssue(args) {
  const parsed = parseArgs(args);

  const taskId = parsed.task;
  if (!taskId) {
    process.stderr.write('Error: --task <task-id> is required\n');
    process.stderr.write('Usage: hoyeon-cli spec issue --task T1 --json \'{"type":"blocker","description":"..."}\' <path>\n');
    process.stderr.write('   or: hoyeon-cli spec issue --task T1 --stdin <path> << \'EOF\'\n');
    process.exit(1);
  }

  let jsonStr = parsed.json;

  // Support --stdin: read JSON from stdin (avoids tmp files and SESSION_ID dependency)
  // parseArgs may consume the next positional arg as --stdin's value, so recover it
  if (parsed.stdin !== undefined) {
    if (typeof parsed.stdin === 'string') {
      // --stdin consumed the spec path as its value — push it back to positionals
      parsed._.unshift(parsed.stdin);
    }
    try {
      jsonStr = readFileSync('/dev/stdin', 'utf8').trim();
    } catch (err) {
      process.stderr.write(`Error: failed to read stdin: ${err.message}\n`);
      process.exit(1);
    }
  }

  if (!jsonStr) {
    process.stderr.write('Error: --json or --stdin is required\n');
    process.exit(1);
  }

  let issueData;
  try {
    issueData = JSON.parse(jsonStr);
  } catch (err) {
    process.stderr.write(`Error: invalid JSON: ${err.message}\n`);
    process.exit(1);
  }

  const filePath = parsed._[0];
  if (!filePath) {
    process.stderr.write('Error: <path> to spec.json is required\n');
    process.exit(1);
  }

  const specPath = resolve(filePath);
  const specData = loadSpec(specPath);

  // Validate task exists
  const task = specData.tasks.find(t => t.id === taskId);
  if (!task) {
    process.stderr.write(`Error: task '${taskId}' not found in spec\n`);
    process.exit(1);
  }

  // Validate type field
  const validTypes = ['failed_approach', 'out_of_scope', 'blocker'];
  const issueType = issueData.type;
  if (issueType && !validTypes.includes(issueType)) {
    process.stderr.write(`Error: type must be one of: ${validTypes.join(', ')}\n`);
    process.exit(1);
  }

  // Load or create issues.json
  const contextDir = resolve(dirname(specPath), 'context');
  const issuesPath = resolve(contextDir, 'issues.json');

  let issues = [];
  if (existsSync(issuesPath)) {
    try {
      issues = JSON.parse(readFileSync(issuesPath, 'utf8'));
    } catch {
      issues = [];
    }
  } else if (!existsSync(contextDir)) {
    mkdirSync(contextDir, { recursive: true });
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
    type: issueData.type || '',
    description: issueData.description || '',
    created_at: new Date().toISOString()
  };

  issues.push(entry);
  writeFileSync(issuesPath, JSON.stringify(issues, null, 2) + '\n');

  process.stdout.write(`Added issue '${newId}' for task '${taskId}'\n`);
  process.stdout.write(JSON.stringify(entry, null, 2) + '\n');
  process.exit(0);
}

// ── spec search (BM25) ─────────────────────────────────────────────────────
async function handleSearch(args) {
  const parsed = parseArgs(args);
  const query = parsed._[0];

  if (!query) {
    process.stderr.write('Error: search query is required\n');
    process.stderr.write('Usage: hoyeon-cli spec search "query" [--specs-dir .dev/specs] [--limit 10] [--json]\n');
    process.exit(1);
  }

  const specsDir = resolve(parsed['specs-dir'] || '.dev/specs');
  const limit = parseInt(parsed.limit || '10', 10);

  if (!existsSync(specsDir)) {
    process.stderr.write(`Error: specs directory not found: ${specsDir}\n`);
    process.exit(1);
  }

  // Collect all documents
  const docs = [];
  const specDirs = readdirSync(specsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const specName of specDirs) {
    const specPath = resolve(specsDir, specName, 'spec.json');
    if (!existsSync(specPath)) continue;

    let specData;
    try {
      specData = JSON.parse(readFileSync(specPath, 'utf8'));
    } catch { continue; }

    // Build task→requirement mapping
    const reqsByTask = {};
    for (const task of (specData.tasks || [])) {
      if (task.acceptance_criteria?.scenarios) {
        const reqs = new Set();
        for (const sid of task.acceptance_criteria.scenarios) {
          reqs.add(sid.replace(/-S\d+$/, ''));
        }
        reqsByTask[task.id] = [...reqs];
      }
    }

    // Index requirements + scenarios
    for (const req of (specData.requirements || [])) {
      let text = req.behavior || '';
      for (const s of (req.scenarios || [])) {
        text += ' ' + [s.given, s.when, s.then].filter(Boolean).join(' ');
      }

      docs.push({
        type: 'requirement',
        spec: specName,
        id: req.id,
        behavior: req.behavior,
        scenarios: (req.scenarios || []).map(s => ({ id: s.id, given: s.given, when: s.when, then: s.then })),
        text,
        tasks: Object.entries(reqsByTask).filter(([, reqs]) => reqs.includes(req.id)).map(([tid]) => tid)
      });
    }

    // Index constraints
    for (const c of (specData.constraints || [])) {
      docs.push({
        type: 'constraint',
        spec: specName,
        id: c.id,
        text: c.rule || '',
        rule: c.rule
      });
    }

    // Index structured learnings (learnings.json)
    const learningsJsonPath = resolve(specsDir, specName, 'context', 'learnings.json');
    if (existsSync(learningsJsonPath)) {
      try {
        const learnings = JSON.parse(readFileSync(learningsJsonPath, 'utf8'));
        for (const l of learnings) {
          docs.push({
            type: 'learning',
            spec: specName,
            id: l.id,
            task: l.task,
            requirements: l.requirements,
            problem: l.problem,
            cause: l.cause,
            rule: l.rule,
            tags: l.tags,
            text: [l.problem, l.cause, l.rule, ...(l.tags || [])].filter(Boolean).join(' ')
          });
        }
      } catch {}
    }

  }

  if (docs.length === 0) {
    process.stdout.write('No specs found to search.\n');
    process.exit(0);
  }

  // BM25 scoring
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    process.stderr.write('Error: query has no searchable terms\n');
    process.exit(1);
  }

  const N = docs.length;
  const df = {};
  for (const doc of docs) {
    const docTokens = new Set(tokenize(doc.text));
    for (const token of queryTokens) {
      if (docTokens.has(token)) {
        df[token] = (df[token] || 0) + 1;
      }
    }
  }

  const k1 = 1.2;
  const b = 0.75;
  const avgDl = docs.reduce((sum, d) => sum + tokenize(d.text).length, 0) / N;

  const results = [];
  for (const doc of docs) {
    const docTokens = tokenize(doc.text);
    const dl = docTokens.length;
    let score = 0;

    for (const term of queryTokens) {
      const termDf = df[term] || 0;
      if (termDf === 0) continue;
      const idf = Math.log((N - termDf + 0.5) / (termDf + 0.5) + 1);
      const tf = docTokens.filter(t => t === term).length;
      const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl / avgDl));
      score += idf * tfNorm;
    }

    if (score > 0) {
      results.push({ ...doc, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  const topResults = results.slice(0, limit);

  if (topResults.length === 0) {
    process.stdout.write('No matches found.\n');
    process.exit(0);
  }

  // Output
  if (parsed.json !== undefined && parsed.json !== false) {
    // Strip text field from JSON output (it's just for scoring)
    const cleaned = topResults.map(({ text, ...rest }) => rest);
    process.stdout.write(JSON.stringify(cleaned, null, 2) + '\n');
  } else {
    process.stdout.write(`Found ${results.length} matches (showing top ${topResults.length}):\n\n`);
    for (const r of topResults) {
      process.stdout.write(`[${r.spec}] ${r.type} ${r.id} (score: ${r.score.toFixed(1)})\n`);
      if (r.type === 'requirement') {
        process.stdout.write(`  behavior: ${r.behavior}\n`);
        for (const s of (r.scenarios || []).slice(0, 3)) {
          process.stdout.write(`  ${s.id}: given "${s.given}" when "${s.when}" then "${s.then}"\n`);
        }
        if (r.scenarios?.length > 3) {
          process.stdout.write(`  ... and ${r.scenarios.length - 3} more scenarios\n`);
        }
      } else if (r.type === 'learning') {
        process.stdout.write(`  problem: ${r.problem}\n`);
        process.stdout.write(`  rule: ${r.rule}\n`);
        if (r.tags?.length) process.stdout.write(`  tags: ${r.tags.join(', ')}\n`);
      } else if (r.type === 'constraint') {
        process.stdout.write(`  rule: ${r.rule}\n`);
      }
      process.stdout.write('\n');
    }
  }

  process.exit(0);
}

export default async function spec(args) {
  const subcommand = args[0];

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    process.stdout.write(SPEC_HELP);
    process.exit(0);
  }

  if (subcommand === 'init') {
    await handleInit(args.slice(1));
  } else if (subcommand === 'merge') {
    await handleMerge(args.slice(1));
  } else if (subcommand === 'validate') {
    await handleValidate(args.slice(1));
  } else if (subcommand === 'plan') {
    await handlePlan(args.slice(1));
  } else if (subcommand === 'task') {
    await handleTask(args.slice(1));
  } else if (subcommand === 'status') {
    await handleStatus(args.slice(1));
  } else if (subcommand === 'meta') {
    await handleMeta(args.slice(1));
  } else if (subcommand === 'coverage') {
    await handleCoverage(args.slice(1));
  } else if (subcommand === 'check') {
    await handleCheck(args.slice(1));
  } else if (subcommand === 'amend') {
    await handleAmend(args.slice(1));
  } else if (subcommand === 'guide') {
    await handleGuide(args.slice(1));
  } else if (subcommand === 'scenario') {
    await handleScenario(args.slice(1));
  } else if (subcommand === 'derive') {
    await handleDerive(args.slice(1));
  } else if (subcommand === 'drift') {
    await handleDrift(args.slice(1));
  } else if (subcommand === 'requirement') {
    await handleRequirement(args.slice(1));
  } else if (subcommand === 'sandbox-tasks') {
    await handleSandboxTasks(args.slice(1));
  } else if (subcommand === 'learning') {
    await handleLearning(args.slice(1));
  } else if (subcommand === 'issue') {
    await handleIssue(args.slice(1));
  } else if (subcommand === 'search') {
    await handleSearch(args.slice(1));
  } else {
    process.stderr.write(`Error: unknown spec subcommand '${subcommand}'\n`);
    process.stderr.write(`Run 'hoyeon-cli spec --help' for usage.\n`);
    process.exit(1);
  }
}
