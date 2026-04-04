import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import specSchemaV1 from '../../schemas/dev-spec-v1.schema.json' with { type: 'json' };

import { writeState } from '../lib/state-io.js';

const SPEC_HELP = `
Usage:
  hoyeon-cli spec init <name> --goal "..." <path>   Create a minimal valid spec.json
  hoyeon-cli spec merge <path> --json '{...}'       Deep-merge a JSON fragment into spec.json
  hoyeon-cli spec merge <path> --stdin              Read JSON from stdin (heredoc-friendly)
                                                    --append: concatenate arrays
                                                    --patch:  ID-based merge (match by id, update in place)
  hoyeon-cli spec validate <path> [--layer decisions|requirements|tasks] [--json]  Schema validation + coverage checks
  hoyeon-cli spec plan <path> [--format text|mermaid|json]  Show execution plan with parallel groups
  hoyeon-cli spec task <task-id> --status <status> [--summary "..."] <path>  Update task status
  hoyeon-cli spec task <task-id> --get <path>                               Get task details as JSON
  hoyeon-cli spec status <path>                     Show task completion status (exit 0=done, 1=incomplete)
  hoyeon-cli spec meta <path>                       Show spec meta (name, goal, non_goals, mode, etc.)
  hoyeon-cli spec check <path>                      Check internal consistency
  hoyeon-cli spec amend --reason <feedback-id> --spec <path>  Amend spec.json based on feedback
  hoyeon-cli spec guide [section]                             Show schema guide for a section
  hoyeon-cli spec sub <sub-req-id> --get <path>                    Get sub-requirement details as JSON
  hoyeon-cli spec derive-tasks <path>                Generate task stubs from requirements (fulfills auto-linked)
  hoyeon-cli spec learning --task <id> --json '{...}' <path>  Add structured learning to context/learnings.json
  hoyeon-cli spec issue --task <id> --json '{...}' <path>    Add structured issue to context/issues.json
  hoyeon-cli spec search "query" [--specs-dir .hoyeon/specs] [--limit 10] [--json]  BM25 search across all specs

Options:
  --help, -h    Show this help message

Examples:
  hoyeon-cli spec init api-auth --goal "Add JWT auth" .hoyeon/specs/api-auth/spec.json
  hoyeon-cli spec merge .hoyeon/specs/api-auth/spec.json --json '{"context":{"request":"Add auth"}}'
  hoyeon-cli spec validate ./spec.json
  hoyeon-cli spec validate ./spec.json --layer decisions --json
  hoyeon-cli spec plan ./spec.json
  hoyeon-cli spec task T1 --status done --summary "implemented" ./spec.json
  hoyeon-cli spec task T1 --get ./spec.json
  hoyeon-cli spec status ./spec.json
  hoyeon-cli spec meta ./spec.json
  hoyeon-cli spec check ./spec.json
  hoyeon-cli spec amend --reason fb-001 --spec ./spec.json
`;

function loadSchema() {
  return specSchemaV1;
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
    },
    tasks: [
      { id: 'T1', action: 'TODO', type: 'work' },
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

  // Add optional schema version (v1 only)
  if (parsed.schema) {
    if (parsed.schema !== 'v1') {
      process.stderr.write(`Error: invalid --schema '${parsed.schema}'. Only 'v1' is supported.\n`);
      process.exit(1);
    }
    specData.meta.schema_version = parsed.schema;
  }

  validateSpec(specData);
  writeState(specPath, specData);
  appendHistory(specPath, { ts: now, type: 'spec_created' });

  process.stdout.write(`Spec created: ${specPath}\n`);
  process.stdout.write(`  name: ${name}\n`);
  process.stdout.write(`  goal: ${parsed.goal}\n`);
  process.exit(0);
}

async function handleMerge(args) {
  const parsed = parseArgs(args);
  const filePath = parsed._[0];

  if (!filePath) {
    process.stderr.write('Error: <path> is required\n');
    process.stderr.write('Usage: hoyeon-cli spec merge <path> --json \'{...}\' [--append]\n');
    process.stderr.write('       hoyeon-cli spec merge <path> --stdin [--append]  (read JSON from stdin)\n');
    process.exit(1);
  }

  const useStdin = parsed.stdin === true;

  let jsonStr;
  if (useStdin) {
    // Read JSON from stdin (supports heredoc piping)
    const { readFileSync: readSync } = await import('fs');
    try {
      jsonStr = readSync(0, 'utf8');
    } catch (err) {
      process.stderr.write(`Error: failed to read stdin: ${err.message}\n`);
      process.exit(1);
    }
  } else if (parsed.json) {
    jsonStr = parsed.json;
  } else {
    process.stderr.write('Error: --json \'{...}\' or --stdin is required\n');
    process.stderr.write('Usage: hoyeon-cli spec merge <path> --json \'{...}\' [--append] [--patch]\n');
    process.stderr.write('       hoyeon-cli spec merge <path> --stdin [--append] [--patch]\n');
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

  const specPath = resolve(filePath);
  const specData = loadSpec(specPath);

  const append = parsed.append === true;
  const patch = parsed.patch === true;
  if (append && patch) {
    process.stderr.write('Error: --append and --patch are mutually exclusive\n');
    process.exit(1);
  }

  // Warn when replacing non-empty arrays without --append or --patch
  if (!append && !patch) {
    for (const key of Object.keys(fragment)) {
      const src = fragment[key];
      const tgt = specData[key];
      // Direct array replacement (e.g. requirements, tasks, constraints)
      if (Array.isArray(src) && Array.isArray(tgt) && tgt.length > 0) {
        process.stderr.write(`⚠️  Warning: replacing ${key}[] (${tgt.length} items → ${src.length} items) without --append or --patch\n`);
        process.stderr.write(`   Use --append to add items, --patch to update by id, or no flag to replace entirely.\n`);
      }
      // Nested array replacement (e.g. context.decisions)
      if (src && typeof src === 'object' && !Array.isArray(src) && tgt && typeof tgt === 'object') {
        for (const nested of Object.keys(src)) {
          if (Array.isArray(src[nested]) && Array.isArray(tgt[nested]) && tgt[nested].length > 0) {
            process.stderr.write(`⚠️  Warning: replacing ${key}.${nested}[] (${tgt[nested].length} items → ${src[nested].length} items) without --append or --patch\n`);
            process.stderr.write(`   Use --append to add items, --patch to update by id, or no flag to replace entirely.\n`);
          }
        }
      }
    }
  }

  deepMerge(specData, fragment, append, patch);

  // Auto-add history entry for merge
  const now = new Date().toISOString();
  const mergedKeys = Object.keys(fragment).join(', ');

  validateSpec(specData);

  // --strict: run coverage checks after schema validation, fail before writing
  const strict = parsed.strict === true;
  if (strict) {
    const gaps = runCoverageChecks(specData);
    if (gaps.length > 0) {
      process.stderr.write('Strict merge failed — coverage gaps found (spec NOT written):\n');
      for (const g of gaps) {
        process.stderr.write(`  [${g.layer}/${g.check}] ${g.message}\n`);
      }
      process.exit(1);
    }
  }

  writeState(specPath, specData);
  appendHistory(specPath, { ts: now, type: 'spec_updated', detail: `merged: ${mergedKeys}` });

  process.stdout.write(`Spec merged: ${specPath}\n`);
  process.stdout.write(`  merged keys: ${mergedKeys}\n`);
  if (append) process.stdout.write('  mode: append (arrays concatenated)\n');
  if (patch) process.stdout.write('  mode: patch (ID-based merge)\n');
  if (strict) process.stdout.write('  mode: strict (coverage verified)\n');
  process.exit(0);
}

async function handleValidate(args) {
  const parsed = parseArgs(args);
  const filePath = parsed._[0];

  if (!filePath) {
    process.stderr.write('Error: missing <path> argument\n');
    process.stderr.write('Usage: hoyeon-cli spec validate <path> [--layer decisions|requirements|tasks] [--json]\n');
    process.exit(1);
  }

  const layer = parsed.layer;
  if (layer !== undefined && !VALID_COVERAGE_LAYERS.includes(layer)) {
    process.stderr.write(`Error: invalid --layer '${layer}'. Valid values: ${VALID_COVERAGE_LAYERS.join(', ')}\n`);
    process.exit(1);
  }

  const useJson = parsed.json === true;

  let data;
  try {
    const raw = readFileSync(resolve(filePath), 'utf8');
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

  // --- Phase 1: Schema validation ---
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

  if (!valid) {
    const errors = validate.errors.map((e) => ({
      instancePath: e.instancePath,
      schemaPath: e.schemaPath,
      keyword: e.keyword,
      message: e.message,
      params: e.params,
    }));

    if (useJson) {
      process.stdout.write(JSON.stringify({ valid: false, errors, coverage: null, gaps: [] }) + '\n');
    } else {
      process.stdout.write(JSON.stringify({ valid: false, errors }) + '\n');
    }
    process.stderr.write('Validation failed:\n');
    for (const e of validate.errors) {
      const path = e.instancePath || '(root)';
      process.stderr.write(`  ${path}: ${e.message}\n`);
    }
    printGuideHints(validate.errors);
    process.exit(1);
  }

  // --- Phase 2: Coverage checks (only if schema is valid) ---
  const gaps = runCoverageChecks(data, layer);

  if (useJson) {
    const result = {
      valid: true,
      errors: [],
      coverage: gaps.length === 0 ? 'pass' : 'fail',
      gaps,
    };
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(gaps.length === 0 ? 0 : 1);
  }

  if (gaps.length > 0) {
    process.stderr.write('Schema valid. Coverage gaps found:\n');
    for (const gap of gaps) {
      process.stderr.write(`  [${gap.layer}/${gap.check}] ${gap.message}\n`);
    }
    process.exit(1);
  }

  process.stdout.write('Schema valid. Coverage passed.\n');
  process.exit(0);
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
      const deps = (t.depends_on || []).length > 0 ? ` ← ${t.depends_on.join(', ')}` : '';
      const cp = criticalPath.includes(id) ? ' *' : '';
      lines.push(`  ${id}: ${t.action} (${type})${deps}${cp}`);
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
          type: t.type || 'work',
          status: t.status || 'pending',
          depends_on: t.depends_on || [],
          fulfills: t.fulfills || [],
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
        return {
          id: t.id,
          action: t.action,
          type: t.type || 'work',
          status: t.status || 'pending',
          depends_on: t.depends_on || [],
          fulfills: t.fulfills || [],
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

  if (!specData.meta) {
    specData.meta = {};
  }

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

  const result = {
    name: specData.meta?.name || 'unknown',
    done: done.length,
    in_progress: inProgress.length,
    pending: pending.length,
    total: tasks.length,
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
 * Collect all requirement IDs defined, and the set referenced by at least one task via fulfills[].
 *
 * @param {object} specData - parsed spec JSON
 * @returns {{ allReqIds: Set<string>, referencedReqIds: Set<string> }}
 */
function collectRequirementSets(specData) {
  const allReqIds = new Set();
  for (const req of (specData.requirements || [])) {
    if (req.id) allReqIds.add(req.id);
  }

  const referencedReqIds = new Set();
  for (const task of (specData.tasks || [])) {
    for (const reqRef of (task.fulfills || [])) {
      if (reqRef) referencedReqIds.add(reqRef);
    }
  }

  return { allReqIds, referencedReqIds };
}

const VALID_COVERAGE_LAYERS = ['decisions', 'requirements', 'tasks'];

/**
 * Run coverage checks on parsed spec data.
 * Returns array of gap objects. Pure function (no I/O, no process.exit).
 *
 * @param {object} specData - parsed spec JSON
 * @param {string|undefined} layer - optional layer filter
 * @returns {Array<{layer: string, check: string, message: string}>}
 */
function runCoverageChecks(specData, layer) {
  const gaps = [];

  const decisions = specData.context?.decisions || [];
  const requirements = specData.requirements || [];
  const decisionIds = new Set(decisions.map(d => d.id).filter(Boolean));

  const runRequirements = !layer || layer === 'requirements';
  const runTasks = !layer || layer === 'tasks';

  // --- Check 1: sub-requirement coverage (requirements layer) ---
  if (runRequirements) {
    for (const req of requirements) {
      const subs = req.sub || [];
      if (subs.length < 1) {
        gaps.push({
          layer: 'requirements',
          check: 'sub-requirement-coverage',
          message: `requirement '${req.id}' has no sub-requirements (sub[] must have at least 1 entry)`,
        });
      }
    }
  }

  // --- Check 4: orphan detection (requirements layer) ---
  if (runRequirements && runTasks) {
    const { allReqIds, referencedReqIds } = collectRequirementSets(specData);
    const tasksWithFulfills = (specData.tasks || []).filter(t => t.fulfills && t.fulfills.length > 0);
    if (allReqIds.size > 0 && tasksWithFulfills.length > 0) {
      for (const id of allReqIds) {
        if (!referencedReqIds.has(id)) {
          gaps.push({
            layer: 'requirements',
            check: 'orphan-requirement',
            message: `'${id}' is defined but not referenced by any task fulfills[]`,
          });
        }
      }
    }
  }

  return gaps;
}

/**
 * Legacy alias: `spec coverage` now delegates to `spec validate`.
 * Kept for backward compatibility — runs coverage checks only (no schema validation).
 */
async function handleCoverage(args) {
  const parsed = parseArgs(args);
  const filePath = parsed._[0];

  if (!filePath) {
    process.stderr.write('Error: missing <path> argument\n');
    process.stderr.write('Usage: hoyeon-cli spec validate <path> [--layer decisions|requirements|tasks] [--json]\n');
    process.stderr.write('Note: "spec coverage" is deprecated — use "spec validate" instead.\n');
    process.exit(1);
  }

  const layer = parsed.layer;
  if (layer !== undefined && !VALID_COVERAGE_LAYERS.includes(layer)) {
    process.stderr.write(`Error: invalid --layer '${layer}'. Valid values: ${VALID_COVERAGE_LAYERS.join(', ')}\n`);
    process.exit(1);
  }

  const useJson = parsed.json === true;
  const specData = loadSpec(resolve(filePath));
  const gaps = runCoverageChecks(specData, layer);

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

  // Referential integrity: fulfills[] must reference valid requirement IDs
  const reqIds = new Set((specData.requirements || []).map(r => r.id).filter(Boolean));
  for (const task of specData.tasks) {
    for (const reqRef of (task.fulfills || [])) {
      if (!reqIds.has(reqRef)) {
        issues.push(`task '${task.id}' fulfills[] references unknown requirement '${reqRef}'`);
      }
    }
  }

  // Orphan detection: requirement not referenced by any task.fulfills[]
  {
    const tasksWithRefs = (specData.tasks || []).filter(t => t.fulfills && t.fulfills.length > 0);
    if (reqIds.size > 0 && tasksWithRefs.length > 0) {
      for (const id of reqIds) {
        const referenced = tasksWithRefs.some(t => t.fulfills.includes(id));
        if (!referenced) {
          issues.push(`requirement '${id}' is defined but not referenced by any task fulfills[]`);
        }
      }
    }
  }

  if (issues.length > 0) {
    process.stderr.write('Spec check failed:\n');
    for (const issue of issues) {
      process.stderr.write(`  - ${issue}\n`);
    }
    process.exit(1);
  }

  process.stdout.write('Spec check passed: internal consistency OK\n');
  process.exit(0);
}

/**
 * Generate compact, LLM-friendly guide from the JSON Schema.
 * Resolves $ref, shows required/optional fields, types, enums, and minimal examples.
 */
function generateGuide(section, schemaVersion) {
  const schema = loadSchema(schemaVersion);
  const defs = schema.$defs || {};

  const SECTIONS = {
    meta: { ref: 'meta', desc: 'Spec metadata (name, goal, type, schema_version, mode with dispatch/work/verify)' },
    context: { ref: 'context', desc: 'Confirmed goal, research, decisions, known gaps' },
    tasks: { ref: 'task', desc: 'Task DAG (work items + verification)', isArray: true },
    requirements: { ref: 'requirement', desc: 'Requirements with sub-requirements (sub[] = behavioral acceptance criteria)', isArray: true },
    constraints: { ref: 'constraint', desc: 'Must-not-do / preserve constraints', isArray: true },
    external: { ref: 'externalDependencies', desc: 'Human-only pre/post-work dependencies' },
    sub: { ref: 'subRequirement', desc: 'Sub-requirement (behavior required; optional given/when/then for GWT format)' },
    merge: { ref: null, desc: 'Merge modes: replace (default), --append, --patch', custom: 'merge' },
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

  if (info.custom === 'merge') {
    return formatMergeGuide();
  }

  const def = defs[info.ref];
  if (!def) {
    return `Error: schema definition '${info.ref}' not found.`;
  }

  return formatDef(section, def, defs, info.isArray);
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


async function handleGuide(args) {
  const parsed = parseArgs(args);
  const section = parsed._[0];
  const schemaVersion = parsed.schema || undefined;
  const output = generateGuide(section, schemaVersion);
  process.stdout.write(output + '\n');
  process.exit(0);
}


async function handleDeriveTasks(args) {
  const filePath = args[0];
  if (!filePath) {
    process.stderr.write('Error: <path> is required\n');
    process.stderr.write('Usage: hoyeon-cli spec derive-tasks <path>\n');
    process.exit(1);
  }

  const specPath = resolve(filePath);
  const specData = loadSpec(specPath);

  const requirements = specData.requirements || [];
  if (requirements.length === 0) {
    process.stderr.write('Error: no requirements found. Run derive-requirements first.\n');
    process.exit(1);
  }

  // Generate task stubs: one per requirement (no TF — Final Verify handles holistic verification)
  const tasks = [];

  for (let i = 0; i < requirements.length; i++) {
    const r = requirements[i];
    const taskId = `T${i + 1}`;
    tasks.push({
      id: taskId,
      action: `TODO — implement ${r.id}: ${r.behavior.slice(0, 60)}`,
      depends_on: [],
      fulfills: [r.id],
    });
  }

  specData.tasks = tasks;

  const now = new Date().toISOString();
  validateSpec(specData);
  writeState(specPath, specData);
  appendHistory(specPath, { ts: now, type: 'tasks_changed', detail: `derive-tasks: ${tasks.length} stubs` });

  process.stdout.write(`Derived ${tasks.length} tasks from ${requirements.length} requirements\n`);
  for (const t of tasks) {
    process.stdout.write(`  ${t.id}: fulfills=[${(t.fulfills || []).join(',')}] "${t.action.slice(0, 60)}"\n`);
  }
  process.exit(0);
}

async function handleSub(args) {
  const subId = args[0];

  if (!subId || subId.startsWith('--')) {
    process.stderr.write('Error: <sub-id> is required\n');
    process.stderr.write('Usage: hoyeon-cli spec sub <sub-id> --get <path>\n');
    process.exit(1);
  }

  const parsed = parseArgs(args.slice(1));

  if (parsed.get === undefined) {
    process.stderr.write('Error: --get <path> is required\n');
    process.stderr.write('Usage: hoyeon-cli spec sub <sub-id> --get <path>\n');
    process.exit(1);
  }

  if (typeof parsed.get !== 'string') {
    process.stderr.write('Error: --get requires <path> argument\n');
    process.stderr.write('Usage: hoyeon-cli spec sub <sub-id> --get <path>\n');
    process.exit(1);
  }

  const filePath = parsed.get;
  const specData = loadSpec(resolve(filePath));

  let found = null;
  for (const req of (specData.requirements || [])) {
    for (const sr of (req.sub || [])) {
      if (sr.id === subId) {
        found = sr;
        break;
      }
    }
    if (found) break;
  }

  if (!found) {
    process.stderr.write(`Error: sub-requirement '${subId}' not found in spec\n`);
    process.exit(1);
  }

  process.stdout.write(JSON.stringify(found, null, 2) + '\n');
  process.exit(0);
}

/**
 * Helper to find a sub-requirement by ID across all requirements.
 * Returns { sub, requirement } or null.
 */
function findSubById(specData, subId) {
  for (const req of (specData.requirements || [])) {
    for (const sr of (req.sub || [])) {
      if (sr.id === subId) {
        return { sub: sr, requirement: req };
      }
    }
  }
  return null;
}

async function handleRequirement(args) {
  const parsed = parseArgs(args);

  // Determine mode:
  // A) --status (flag without id) → full status view  (args[0] === '--status' or no positional id but --status flag)
  // B) <id> --get <path>         → individual sub-requirement lookup
  // C) <id> --status <val> --task <task_id> <path> → update sub-requirement status

  // Check if first positional looks like a flag (or absent)
  const firstPositional = parsed._[0];
  const isStatusFlag = parsed.status === true; // --status without value

  // Mode A: spec requirement --status <path>
  // Detection: no sub id positional AND --status is boolean true
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

  // If we have a positional (sub id):
  const subId = firstPositional;

  if (!subId) {
    process.stderr.write('Error: <sub-id> or --status flag is required\n');
    process.stderr.write('Usage: hoyeon-cli spec requirement --status <path>\n');
    process.stderr.write('       hoyeon-cli spec requirement <id> --get <path>\n');
    process.exit(1);
  }

  // Mode B: spec requirement <id> --get <path>
  if (parsed.get !== undefined) {
    if (typeof parsed.get !== 'string') {
      process.stderr.write('Error: --get requires <path> argument\n');
      process.exit(1);
    }
    const specData = loadSpec(resolve(parsed.get));
    const found = findSubById(specData, subId);
    if (!found) {
      process.stderr.write(`Error: sub-requirement '${subId}' not found in spec\n`);
      process.exit(1);
    }
    process.stdout.write(JSON.stringify(found.sub, null, 2) + '\n');
    process.exit(0);
  }

  // Fallback: unknown usage
  process.stderr.write('Error: could not determine mode. Use --status <path> or <id> --get <path>\n');
  process.exit(1);
}

function handleRequirementStatusView(specData, useJson) {
  const requirements = specData.requirements || [];
  const requirementRows = requirements.map(req => {
    const subs = (req.sub || []).map(sc => {
      const entry = { id: sc.id, behavior: sc.behavior };
      if (sc.given) entry.given = sc.given;
      if (sc.when) entry.when = sc.when;
      if (sc.then) entry.then = sc.then;
      return entry;
    });
    return { id: req.id, behavior: req.behavior, subs };
  });

  if (useJson) {
    process.stdout.write(JSON.stringify({ requirements: requirementRows }, null, 2) + '\n');
    process.exit(0);
  }

  // Text format
  const lines = [];
  for (const req of requirementRows) {
    const scCount = req.subs.length;
    lines.push(`${req.id}: ${req.behavior} (${scCount} sub${scCount !== 1 ? 's' : ''})`);
    for (const sc of req.subs) {
      lines.push(`  ${sc.id}: ${sc.behavior}`);
      if (sc.given || sc.when || sc.then) {
        if (sc.given) lines.push(`    Given: ${sc.given}`);
        if (sc.when) lines.push(`    When: ${sc.when}`);
        if (sc.then) lines.push(`    Then: ${sc.then}`);
      }
    }
    lines.push('');
  }

  process.stdout.write(lines.join('\n') + '\n');
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
      jsonStr = readFileSync(0, 'utf8').trim();
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

  // Extract requirement IDs from fulfills[]
  const requirementIds = [...new Set(task.fulfills || [])];

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
      jsonStr = readFileSync(0, 'utf8').trim();
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
    process.stderr.write('Usage: hoyeon-cli spec search "query" [--specs-dir .hoyeon/specs] [--limit 10] [--json]\n');
    process.exit(1);
  }

  const specsDir = resolve(parsed['specs-dir'] || '.hoyeon/specs');
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
      const fulfills = task.fulfills || [];
      if (fulfills.length > 0) {
        reqsByTask[task.id] = [...fulfills];
      }
    }

    // Index requirements + sub-requirements
    for (const req of (specData.requirements || [])) {
      let text = req.behavior || '';
      for (const sr of (req.sub || [])) {
        text += ' ' + (sr.behavior || '');
        if (sr.given) text += ' ' + sr.given;
        if (sr.when) text += ' ' + sr.when;
        if (sr.then) text += ' ' + sr.then;
      }

      docs.push({
        type: 'requirement',
        spec: specName,
        id: req.id,
        behavior: req.behavior,
        subs: (req.sub || []).map(sr => {
          const entry = { id: sr.id, behavior: sr.behavior };
          if (sr.given) entry.given = sr.given;
          if (sr.when) entry.when = sr.when;
          if (sr.then) entry.then = sr.then;
          return entry;
        }),
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
        for (const s of (r.subs || []).slice(0, 3)) {
          process.stdout.write(`  ${s.id}: ${s.behavior}\n`);
          if (s.given || s.when || s.then) {
            if (s.given) process.stdout.write(`    Given: ${s.given}\n`);
            if (s.when) process.stdout.write(`    When: ${s.when}\n`);
            if (s.then) process.stdout.write(`    Then: ${s.then}\n`);
          }
        }
        if (r.subs?.length > 3) {
          process.stdout.write(`  ... and ${r.subs.length - 3} more sub-requirements\n`);
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
  } else if (subcommand === 'sub') {
    await handleSub(args.slice(1));
  } else if (subcommand === 'requirement') {
    await handleRequirement(args.slice(1));
  } else if (subcommand === 'learning') {
    await handleLearning(args.slice(1));
  } else if (subcommand === 'issue') {
    await handleIssue(args.slice(1));
  } else if (subcommand === 'search') {
    await handleSearch(args.slice(1));
  } else if (subcommand === 'derive-tasks') {
    await handleDeriveTasks(args.slice(1));
  } else {
    process.stderr.write(`Error: unknown spec subcommand '${subcommand}'\n`);
    process.stderr.write(`Run 'hoyeon-cli spec --help' for usage.\n`);
    process.exit(1);
  }
}
