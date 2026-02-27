/**
 * handlers/stop-evaluate.js — dev-cli stop-evaluate --session <id> [--cwd <path>]
 *
 * Unified stop-hook evaluator. Checks chain, rv loop, and rph loop in order,
 * returning the first block decision. Always runs specify-cleanup unconditionally
 * (fire-and-forget, never blocks).
 *
 * stdout: JSON { decision: "block"|"allow", reason? }
 *
 * Called by the unified stop-router.sh stop hook.
 */

import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { findActiveChain, completeChain } from '../core/chain-state.js';
import { findActiveLoop, tick } from '../core/loop-state.js';

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function parseArgs(args) {
  const sessionIdx = args.indexOf('--session');
  const sessionId = sessionIdx >= 0 ? args[sessionIdx + 1] : undefined;

  const cwdIdx = args.indexOf('--cwd');
  const cwd = cwdIdx >= 0 ? args[cwdIdx + 1] : process.cwd();

  const transcriptIdx = args.indexOf('--transcript');
  const transcript = transcriptIdx >= 0 ? args[transcriptIdx + 1] : undefined;

  return { sessionId, cwd, transcript };
}

// ---------------------------------------------------------------------------
// evaluateChain — mirrors chain-stop-hook.sh logic
// ---------------------------------------------------------------------------

function evaluateChain(sessionId) {
  const chain = findActiveChain(sessionId);
  if (!chain) return null;

  if (chain.status !== 'running') return null;

  const remaining = chain.steps.filter(s => s.status === 'pending' || s.status === 'running');

  // All steps completed → auto chain-complete → allow
  if (remaining.length === 0) {
    try { completeChain(chain.chainId); } catch {}
    return null;
  }

  // Next step pending → block + inject instruction
  const nextStep = remaining[0];
  const total = chain.steps.length;
  const completed = total - remaining.length;
  const stepNum = completed + 1;

  // Rebuild execution plan entry for the next step (mirrors chain-status.js logic)
  const executionPlanEntry = {
    stepId: nextStep.id,
    stepNumber: stepNum,
    totalSteps: total,
    action: nextStep.action,
    type: nextStep.type,
    chainId: chain.chainId,
  };

  if (nextStep.type === 'agent') {
    executionPlanEntry.agentType = nextStep.agentType;
    executionPlanEntry.instruction = `Call Task(subagent_type="${nextStep.agentType}"). After completion, persist result.`;
  } else if (nextStep.type === 'builtin') {
    executionPlanEntry.builtinCmd = nextStep.builtinCmd;
    executionPlanEntry.instruction = `Execute ${nextStep.builtinCmd} directly. After completion, persist result.`;
  } else if (nextStep.type === 'skill') {
    executionPlanEntry.skillName = nextStep.skillName;
    executionPlanEntry.instruction = `Call Skill("${nextStep.skillName}"). After completion, persist result.`;
  }

  const stepJson = JSON.stringify(executionPlanEntry);
  const src = chain.source ?? '';
  const reason =
    `ACTION CHAIN (${src}): Step ${completed}/${total} completed. ${remaining.length} remaining.\n\n` +
    `Execute ONLY this next step:\n${stepJson}\n\n` +
    `Step type instructions:\n` +
    `- agent: Call Task(subagent_type=agentType) with the original user prompt as context\n` +
    `- builtin: Execute the command directly (commit = git commit, push = git push)\n` +
    `- skill: Call Skill(skillName)\n\n` +
    `After completion, persist the result:\n` +
    `  echo '{"result": "brief summary"}' | node dev-cli/bin/dev-cli.js chain-persist ${chain.chainId} ${nextStep.id}\n\n` +
    `Then STOP. The system will give you the next step (or finish the chain).`;

  return { decision: 'block', reason };
}

// ---------------------------------------------------------------------------
// evaluateRv — mirrors rv-validator.sh logic
// ---------------------------------------------------------------------------

function evaluateRv(sessionId) {
  const loop = findActiveLoop(sessionId);
  if (!loop) return null;
  if (loop.type !== 'rv') return null;

  const result = tick(loop.loopId);
  if (result.decision === 'block') {
    return { decision: 'block', reason: result.reason ?? 'Re-validate required' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// evaluateRph — mirrors rph-loop.sh logic
// ---------------------------------------------------------------------------

function evaluateRph(sessionId) {
  const loop = findActiveLoop(sessionId);
  if (!loop) return null;
  if (loop.type !== 'rph') return null;

  const result = tick(loop.loopId);
  if (result.decision === 'block') {
    return { decision: 'block', reason: result.reason ?? 'DoD items remaining' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// specifyCleanup — ports dev-specify-stop-hook.sh logic
// ---------------------------------------------------------------------------

function specifyCleanup(sessionId, cwd) {
  try {
    const stateFile = join(cwd, '.dev', 'state.local.json');

    if (!existsSync(stateFile)) return;

    let state;
    try {
      state = JSON.parse(readFileSync(stateFile, 'utf8'));
    } catch {
      return;
    }

    // Clean up stale sessions older than 24 hours
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let changed = false;
    for (const sid of Object.keys(state)) {
      const entry = state[sid];
      if (entry && entry.created_at && entry.created_at <= cutoff) {
        delete state[sid];
        changed = true;
      }
    }

    // Check if this session exists in state
    const sessionData = state[sessionId];
    if (!sessionData) {
      if (changed) {
        atomicWriteState(stateFile, state);
      }
      return;
    }

    // Check if this is specify mode (no execute field)
    const hasExecute = sessionData.execute != null;
    if (hasExecute) {
      // Has execute field — let execute-stop-hook handle it
      if (changed) {
        atomicWriteState(stateFile, state);
      }
      return;
    }

    // Specify mode — remove session
    delete state[sessionId];
    atomicWriteState(stateFile, state);
  } catch {
    // Fire-and-forget: never let specify-cleanup errors propagate
  }
}

function atomicWriteState(targetPath, data) {
  const tmpPath = `${targetPath}.tmp.${process.pid}`;
  try {
    writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    renameSync(tmpPath, targetPath);
  } catch {
    try { if (existsSync(tmpPath)) { /* best effort */ } } catch {}
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export default async function handler(args) {
  const { sessionId, cwd } = parseArgs(args);

  if (!sessionId) {
    console.error('Usage: dev-cli stop-evaluate --session <id> [--cwd <path>]');
    process.exit(1);
  }

  // Evaluate subsystems in order: chain → rv → rph
  // Return the first block decision
  let decision = null;

  decision = evaluateChain(sessionId);
  if (!decision) {
    decision = evaluateRv(sessionId);
  }
  if (!decision) {
    decision = evaluateRph(sessionId);
  }

  // Always run specify-cleanup unconditionally (fire-and-forget, never blocks)
  specifyCleanup(sessionId, cwd);

  // Output decision
  if (decision && decision.decision === 'block') {
    console.log(JSON.stringify({ decision: 'block', reason: decision.reason }));
  } else {
    console.log(JSON.stringify({ decision: 'allow' }));
  }
}
