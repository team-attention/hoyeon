/**
 * loop-state.js — Loop state CRUD for !rph and !rv iterative loops
 *
 * Loop state files live at: <cwd>/.dev/.loops/<loopId>/loop.json
 * DoD files (rph only) live at: <cwd>/.dev/.loops/<loopId>/dod.md
 *
 * Follows the same pattern as chain-state.js.
 */

import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync, readdirSync, rmSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/** Base directory for all loops: <cwd>/.dev/.loops/ */
export function loopsBaseDir() {
  return join(process.cwd(), '.dev', '.loops');
}

/** Directory for a specific loop */
export function loopDir(loopId) {
  return join(loopsBaseDir(), loopId);
}

/** Path to loop.json */
export function loopJsonPath(loopId) {
  return join(loopDir(loopId), 'loop.json');
}

/** Path to DoD file (rph only) */
export function dodPath(loopId) {
  return join(loopDir(loopId), 'dod.md');
}

// ---------------------------------------------------------------------------
// Atomic write (same pattern as chain-state.js)
// ---------------------------------------------------------------------------

function atomicWriteJSON(targetPath, data) {
  const dir = dirname(targetPath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = `${targetPath}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    renameSync(tmpPath, targetPath);
  } catch (err) {
    try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch {}
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Loop ID generator
// ---------------------------------------------------------------------------

export function generateLoopId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = randomBytes(3).toString('hex');
  return `lp-${date}-${rand}`;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function createLoop(loopId, { sessionId, type, prompt, config }) {
  const now = new Date().toISOString();
  const loop = {
    schemaVersion: 1,
    loopId,
    sessionId,
    type,
    createdAt: now,
    updatedAt: now,
    status: 'running',
    iteration: 0,
    maxIterations: 10,
    phase: 'work',
    prompt: prompt ?? '',
    config: config ?? {},
    events: [
      { type: 'loop.created', at: now, data: { loopType: type } },
    ],
  };
  atomicWriteJSON(loopJsonPath(loopId), loop);
  return loop;
}

export function loadLoop(loopId) {
  const p = loopJsonPath(loopId);
  if (!existsSync(p)) throw new Error(`No loop found: ${loopId}`);
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (err) {
    throw new Error(`Corrupted loop file at ${p}: ${err.message}`);
  }
}

export function updateLoop(loopId, patch) {
  const current = loadLoop(loopId);
  const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
  atomicWriteJSON(loopJsonPath(loopId), updated);
  return updated;
}

export function appendLoopEvent(loopId, type, data = {}) {
  const current = loadLoop(loopId);
  const event = { type, at: new Date().toISOString(), data };
  return updateLoop(loopId, { events: [...current.events, event] });
}

// ---------------------------------------------------------------------------
// DoD helpers (rph)
// ---------------------------------------------------------------------------

/** Count checked/unchecked items in DoD file */
export function countDodItems(loopId) {
  const p = dodPath(loopId);
  if (!existsSync(p)) return { exists: false, checked: 0, unchecked: 0, total: 0, remaining: [] };
  const content = readFileSync(p, 'utf8');
  const lines = content.split('\n');
  const uncheckedLines = lines.filter(l => /^[\s]*[-*] \[ \]/.test(l));
  const checkedLines = lines.filter(l => /^[\s]*[-*] \[[xX]\]/.test(l));
  const remaining = uncheckedLines.map(l => l.replace(/^[\s]*[-*] \[ \] /, '').trim());
  return {
    exists: true,
    checked: checkedLines.length,
    unchecked: uncheckedLines.length,
    total: checkedLines.length + uncheckedLines.length,
    remaining,
  };
}

// ---------------------------------------------------------------------------
// Tick — increment iteration + evaluate termination condition
// ---------------------------------------------------------------------------

export function tick(loopId) {
  const loop = loadLoop(loopId);
  const iteration = loop.iteration + 1;

  // Safety: max iterations exceeded
  if (iteration > loop.maxIterations) {
    appendLoopEvent(loopId, 'loop.max_iterations', { iteration });
    updateLoop(loopId, { iteration, status: 'completed' });
    return {
      decision: 'allow',
      reason: `Max iterations (${loop.maxIterations}) exceeded. Force-stopping.`,
      cleanup: true,
      iteration,
    };
  }

  if (loop.type === 'rv') {
    const remaining = (loop.config.remaining ?? 1) - 1;
    const config = { ...loop.config, remaining };

    if (remaining <= 0) {
      appendLoopEvent(loopId, 'loop.completed', { iteration });
      updateLoop(loopId, { iteration, config, status: 'completed' });
      return { decision: 'allow', cleanup: true, iteration, remaining: 0 };
    }

    appendLoopEvent(loopId, 'loop.tick', { iteration, remaining });
    updateLoop(loopId, { iteration, config });
    return {
      decision: 'block',
      reason: `WAIT! You are lying or hallucinating! Go back and verify EVERYTHING you just said. Check the actual code, re-read the files, and make sure you're not making things up. I don't trust you yet! (Re-validation remaining: ${remaining})`,
      iteration,
      remaining,
    };
  }

  if (loop.type === 'rph') {
    const dod = countDodItems(loopId);
    const dodFile = dodPath(loopId);

    if (!dod.exists) {
      updateLoop(loopId, { iteration });
      return {
        decision: 'block',
        reason: `RALPH LOOP (iteration ${iteration}/${loop.maxIterations}): DoD file not found! You must create the Definition of Done checklist first. Ask the user for DoD criteria using AskUserQuestion, then write them as a markdown checklist (- [ ] items) to: ${dodFile}`,
        iteration,
      };
    }

    if (dod.total === 0) {
      updateLoop(loopId, { iteration });
      return {
        decision: 'block',
        reason: `RALPH LOOP (iteration ${iteration}/${loop.maxIterations}): DoD file exists but contains no checklist items (- [ ] or - [x]). Write proper DoD criteria as a markdown checklist.`,
        iteration,
      };
    }

    if (dod.unchecked > 0) {
      appendLoopEvent(loopId, 'loop.tick', { iteration, unchecked: dod.unchecked, total: dod.total });
      updateLoop(loopId, { iteration, phase: 'verify' });
      const remaining = dod.remaining.map(r => `  - ${r}`).join('\n');
      return {
        decision: 'block',
        reason: `RALPH LOOP (iteration ${iteration}/${loop.maxIterations}): STOP! ${dod.unchecked} of ${dod.total} DoD items are NOT verified. Go back and INDEPENDENTLY VERIFY each item below. Read the actual files, run the code, check the real state. Do NOT just assume they are done. For each verified item, change '- [ ]' to '- [x]' in ${dodFile}.\n\nRemaining items:\n${remaining}`,
        iteration,
        unchecked: dod.unchecked,
        total: dod.total,
      };
    }

    // All items checked
    appendLoopEvent(loopId, 'loop.completed', { iteration });
    updateLoop(loopId, { iteration, status: 'completed' });
    return { decision: 'allow', cleanup: true, iteration };
  }

  // Unknown type — allow stop
  return { decision: 'allow', reason: `Unknown loop type: ${loop.type}`, cleanup: true };
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/** List all loops, optionally filtered by status */
export function listLoops(statusFilter = null) {
  const base = loopsBaseDir();
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .filter(d => d.startsWith('lp-'))
    .map(d => { try { return loadLoop(d); } catch { return null; } })
    .filter(l => l && (!statusFilter || l.status === statusFilter));
}

/** Find active loop for a session */
export function findActiveLoop(sessionId) {
  return listLoops('running').find(l => l.sessionId === sessionId) ?? null;
}

// ---------------------------------------------------------------------------
// Complete + GC
// ---------------------------------------------------------------------------

export function completeLoop(loopId) {
  appendLoopEvent(loopId, 'loop.completed', {});
  return updateLoop(loopId, { status: 'completed' });
}

/** Remove loops older than maxAgeMs (default: 24h) */
export function gcLoops(maxAgeMs = 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - maxAgeMs;
  const base = loopsBaseDir();
  if (!existsSync(base)) return 0;
  let removed = 0;
  for (const d of readdirSync(base).filter(d => d.startsWith('lp-'))) {
    try {
      const loop = loadLoop(d);
      if (['completed', 'abandoned'].includes(loop.status) &&
          new Date(loop.updatedAt).getTime() < cutoff) {
        rmSync(join(base, d), { recursive: true });
        removed++;
      }
      // GC stale running loops (orphans)
      if (loop.status === 'running' && new Date(loop.updatedAt).getTime() < cutoff) {
        updateLoop(d, { status: 'abandoned' });
        rmSync(join(base, d), { recursive: true });
        removed++;
      }
    } catch {}
  }
  return removed;
}
