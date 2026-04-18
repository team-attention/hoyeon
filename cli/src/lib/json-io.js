import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs';
import { resolve, join } from 'path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import planSchema from '../../schemas/plan.schema.json' with { type: 'json' };

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

let _planValidator = null;

export function validatePlan(obj) {
  if (!_planValidator) _planValidator = ajv.compile(planSchema);
  const ok = _planValidator(obj);
  return { ok, errors: ok ? [] : formatAjvErrors(_planValidator.errors) };
}

function formatAjvErrors(errs) {
  return (errs || []).map((e) => `${e.instancePath || '/'} ${e.message}${e.params ? ' (' + JSON.stringify(e.params) + ')' : ''}`);
}

// ---- File IO ----

export function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`${path} parse failed: ${err.message}`);
  }
}

export function writeJsonAtomic(path, data) {
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  renameSync(tmp, path);
}

// ---- Merge helpers ----

export function mergePlan(existing, payload, mode) {
  const base = existing ? structuredClone(existing) : {};
  if (mode === 'append') return appendMerge(base, payload);
  if (mode === 'patch') return patchMerge(base, payload);
  return replaceMerge(base, payload);
}

function replaceMerge(base, payload) {
  return { ...base, ...payload };
}

function appendMerge(base, payload) {
  const out = { ...base };
  for (const [k, v] of Object.entries(payload)) {
    if (Array.isArray(v) && Array.isArray(out[k])) out[k] = [...out[k], ...v];
    else out[k] = v;
  }
  return out;
}

function patchMerge(base, payload) {
  const out = { ...base };
  for (const [k, v] of Object.entries(payload)) {
    if (Array.isArray(v) && Array.isArray(out[k])) {
      out[k] = mergeArrayById(out[k], v);
    } else if (v && typeof v === 'object' && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = patchMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function mergeArrayById(existing, incoming) {
  const hasId = (x) => x && typeof x === 'object' && typeof x.id === 'string';
  if (!incoming.every(hasId) || !existing.every(hasId)) return incoming;
  const map = new Map(existing.map((x) => [x.id, x]));
  for (const item of incoming) {
    const prev = map.get(item.id);
    map.set(item.id, prev ? { ...prev, ...item } : item);
  }
  return [...map.values()];
}

// ---- Spec dir helpers ----

export function specPaths(specDir) {
  const dir = resolve(specDir);
  return {
    dir,
    requirements: join(dir, 'requirements.md'),
    plan: join(dir, 'plan.json'),
  };
}

export function readPlanIfExists(specDir) {
  return readJsonIfExists(specPaths(specDir).plan);
}
