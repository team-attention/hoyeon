/**
 * chain-state.js — Chain state CRUD for composable actions
 *
 * Chain state files live at: <cwd>/.dev/.chains/<chainId>/chain.json
 * Results live at: <cwd>/.dev/.chains/<chainId>/results/<stepId>.json
 *
 * Reuses atomicWriteJSON pattern from state.js.
 * Does NOT import or modify state.js.
 */

import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync, readdirSync, rmSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/** Base directory for all chains: <cwd>/.dev/.chains/ */
export function chainsBaseDir() {
  return join(process.cwd(), '.dev', '.chains');
}

/** Directory for a specific chain */
export function chainDir(chainId) {
  return join(chainsBaseDir(), chainId);
}

/** Path to chain.json */
export function chainJsonPath(chainId) {
  return join(chainDir(chainId), 'chain.json');
}

/** Path to results directory */
export function chainResultsDir(chainId) {
  return join(chainDir(chainId), 'results');
}

// ---------------------------------------------------------------------------
// Atomic write (same pattern as state.js)
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
// Chain ID generator
// ---------------------------------------------------------------------------

export function generateChainId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = randomBytes(3).toString('hex');
  return `ch-${date}-${rand}`;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function createChain(chainId, { sessionId, source, steps }) {
  const now = new Date().toISOString();
  const chain = {
    schemaVersion: 1,
    chainId,
    sessionId,
    createdAt: now,
    updatedAt: now,
    status: 'running',
    source,
    steps: steps.map((s, i) => ({
      id: `step-${i + 1}`,
      action: s.action,
      type: s.type,
      ...(s.type === 'agent' ? { agentType: s.agentType } : {}),
      ...(s.type === 'builtin' ? { builtinCmd: s.builtinCmd } : {}),
      ...(s.type === 'skill' ? { skillName: s.skillName } : {}),
      status: 'pending',
      resultFile: null,
      startedAt: null,
      completedAt: null,
      error: null,
    })),
    events: [
      { type: 'chain.created', at: now, data: { source } },
    ],
  };
  atomicWriteJSON(chainJsonPath(chainId), chain);
  return chain;
}

export function loadChain(chainId) {
  const p = chainJsonPath(chainId);
  if (!existsSync(p)) throw new Error(`No chain found: ${chainId}`);
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (err) {
    throw new Error(`Corrupted chain file at ${p}: ${err.message}`);
  }
}

export function updateChain(chainId, patch) {
  const current = loadChain(chainId);
  const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
  atomicWriteJSON(chainJsonPath(chainId), updated);
  return updated;
}

export function appendChainEvent(chainId, type, data = {}) {
  const current = loadChain(chainId);
  const event = { type, at: new Date().toISOString(), data };
  return updateChain(chainId, { events: [...current.events, event] });
}

// ---------------------------------------------------------------------------
// Step operations
// ---------------------------------------------------------------------------

export function startStep(chainId, stepId) {
  const chain = loadChain(chainId);
  const steps = chain.steps.map(s =>
    s.id === stepId ? { ...s, status: 'running', startedAt: new Date().toISOString() } : s
  );
  appendChainEvent(chainId, 'step.started', { stepId });
  return updateChain(chainId, { steps });
}

export function completeStep(chainId, stepId, resultFile = null) {
  const chain = loadChain(chainId);
  const steps = chain.steps.map(s =>
    s.id === stepId ? { ...s, status: 'completed', completedAt: new Date().toISOString(), resultFile } : s
  );
  appendChainEvent(chainId, 'step.completed', { stepId });
  return updateChain(chainId, { steps });
}

export function failStep(chainId, stepId, error) {
  const chain = loadChain(chainId);
  const steps = chain.steps.map(s => {
    if (s.id === stepId) return { ...s, status: 'failed', completedAt: new Date().toISOString(), error };
    if (s.status === 'pending') return { ...s, status: 'skipped' };
    return s;
  });
  appendChainEvent(chainId, 'step.failed', { stepId, error });
  return updateChain(chainId, { steps, status: 'failed' });
}

// ---------------------------------------------------------------------------
// Chain lifecycle
// ---------------------------------------------------------------------------

export function completeChain(chainId) {
  appendChainEvent(chainId, 'chain.completed', {});
  return updateChain(chainId, { status: 'completed' });
}

export function abandonChain(chainId, reason) {
  appendChainEvent(chainId, 'chain.abandoned', { reason });
  return updateChain(chainId, { status: 'abandoned' });
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/** List all chains, optionally filtered by status */
export function listChains(statusFilter = null) {
  const base = chainsBaseDir();
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .filter(d => d.startsWith('ch-'))
    .map(d => { try { return loadChain(d); } catch { return null; } })
    .filter(c => c && (!statusFilter || c.status === statusFilter));
}

/** Find active chain for a session */
export function findActiveChain(sessionId) {
  return listChains('running').find(c => c.sessionId === sessionId) ?? null;
}

// ---------------------------------------------------------------------------
// GC
// ---------------------------------------------------------------------------

/** Remove chains older than maxAgeMs (default: 24h) */
export function gcChains(maxAgeMs = 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - maxAgeMs;
  const base = chainsBaseDir();
  if (!existsSync(base)) return 0;
  let removed = 0;
  for (const d of readdirSync(base).filter(d => d.startsWith('ch-'))) {
    try {
      const chain = loadChain(d);
      // GC completed/failed/abandoned chains past cutoff
      if (['completed', 'failed', 'abandoned'].includes(chain.status) &&
          new Date(chain.updatedAt).getTime() < cutoff) {
        rmSync(join(base, d), { recursive: true });
        removed++;
      }
      // GC stale running chains (orphans) past cutoff
      if (chain.status === 'running' && new Date(chain.updatedAt).getTime() < cutoff) {
        abandonChain(chain.chainId, 'gc: stale running chain');
        rmSync(join(base, d), { recursive: true });
        removed++;
      }
    } catch {}
  }
  return removed;
}
