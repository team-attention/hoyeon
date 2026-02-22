/**
 * sequencer.js — Core ping-pong orchestration driver for dev-cli sessions
 *
 * Implements next() / stepComplete() / stepInvalidate() for session block sequencing.
 */

import {
  loadState,
  updateState,
  acknowledgePendingAction,
  hasPendingAction,
  appendEvent,
} from '../core/state.js';
import { loadRecipe } from '../core/recipe-loader.js';
import { findingsDir, analysisDir } from './paths.js';
import { engineNext as _engineNext, engineStepComplete as _engineStepComplete } from '../engine/engine.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Load and return the recipe blocks for the given session state.
 * Priority:
 *   1. Load from recipe file (if state.recipe is set and file exists)
 *   2. Fall back to recipeBlocks embedded in state (state.recipeBlocks)
 *   3. Return null if neither is available
 *
 * @param {object} state - Session state object
 * @param {string} name - Session name (for template vars)
 * @returns {object[]|null}
 */
function getRecipeBlocks(state, name) {
  if (state.recipe) {
    const vars = { name };
    try {
      const recipe = loadRecipe(state.recipe, vars);
      return recipe.blocks;
    } catch {
      // If recipe file doesn't exist yet, fall back to recipeBlocks stored in state
    }
  }
  // Fall back to recipeBlocks embedded in state
  return state.recipeBlocks ?? null;
}

/**
 * Build a pending response for an already-issued, unacknowledged action.
 * Idempotent: returns the same instruction JSON.
 *
 * @param {object} pendingAction - The state.pendingAction object
 * @returns {object}
 */
function buildPendingResponse(pendingAction) {
  return {
    action: 'pending',
    block: pendingAction.block,
    instruction: pendingAction.instruction,
    message: `Previous instruction not yet acknowledged. Block: '${pendingAction.block}', action: '${pendingAction.action}'.`,
  };
}

/**
 * Build the response JSON for a given block type.
 *
 * @param {object} block - The current recipe block
 * @param {string} name - Session name
 * @returns {object} The response JSON to return to the caller
 */
function buildBlockResponse(block, name) {
  switch (block.type) {
    case 'llm': {
      return {
        action: 'llm',
        block: block.id,
        instruction: block.instruction ?? null,
        saveWith: block.save ?? null,
      };
    }

    case 'llm-loop': {
      return {
        action: 'llm-loop',
        block: block.id,
        instruction: block.instruction ?? null,
        saveWith: block.save ?? null,
        exitCheck: block.exitCheck ?? null,
      };
    }

    case 'llm+cli': {
      const cliCommand = block.then ?? block.command ?? null;
      return {
        action: 'llm+cli',
        block: block.id,
        instruction: block.instruction ?? null,
        then: cliCommand,
      };
    }

    case 'subagent': {
      // Resolve output paths via session-aware helpers.
      // findingsDir(name) and analysisDir(name) resolve to session dir when session.ref exists.
      // Recipe agents use output: "findings/foo.md" or "analysis/bar.md" — strip the prefix
      // and join with the resolved directory.
      const resolvedFindingsDir = findingsDir(name);
      const resolvedAnalysisDir = analysisDir(name);
      return {
        action: 'dispatch-subagents',
        block: block.id,
        agents: (block.agents ?? []).map(a => {
          if (!a.output) return { ...a, outputPath: null };
          if (a.output.startsWith('analysis/')) {
            return { ...a, outputPath: `${resolvedAnalysisDir}/${a.output.slice('analysis/'.length)}` };
          }
          const file = a.output.startsWith('findings/') ? a.output.slice('findings/'.length) : a.output;
          return { ...a, outputPath: `${resolvedFindingsDir}/${file}` };
        }),
        parallel: block.parallel ?? false,
        onComplete: block.onComplete ?? null,
        fileInstruction: 'Each agent MUST write full results (Markdown with YAML frontmatter) to its outputPath using the Write tool. Return only a 1-2 line summary.',
      };
    }

    case 'subagent-loop': {
      const resolvedFindingsDirLoop = findingsDir(name);
      const resolvedAnalysisDirLoop = analysisDir(name);
      return {
        action: 'dispatch-subagents-loop',
        block: block.id,
        agents: (block.agents ?? []).map(a => {
          if (!a.output) return { ...a, outputPath: null };
          if (a.output.startsWith('analysis/')) {
            return { ...a, outputPath: `${resolvedAnalysisDirLoop}/${a.output.slice('analysis/'.length)}` };
          }
          const file = a.output.startsWith('findings/') ? a.output.slice('findings/'.length) : a.output;
          return { ...a, outputPath: `${resolvedFindingsDirLoop}/${file}` };
        }),
        maxRounds: block.maxRounds ?? null,
        exitWhen: block.exitWhen ?? null,
        fileInstruction: 'Each agent MUST write full results (Markdown with YAML frontmatter) to its outputPath using the Write tool. Return only a 1-2 line summary.',
      };
    }

    case 'engine': {
      // Delegate entirely to the engine module
      return _engineNext(name);
    }

    default:
      // Should not reach here — validated on load
      throw new Error(`Unknown block type '${block.type}' for block '${block.id}'`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * The core ping-pong driver.
 *
 * Returns the next action JSON for the session:
 * - If there is an unacknowledged pendingAction → returns same instruction (idempotent)
 * - For `cli` blocks → auto-executes (advances blockIndex), chains next cli blocks
 * - For LLM/subagent blocks → sets pendingAction, returns instruction JSON
 * - If all blocks exhausted → returns { done: true }
 *
 * @param {string} name - Session name
 * @returns {object} Action JSON
 */
export async function next(name) {
  const state = loadState(name);

  // Guard: if session was aborted, return done immediately
  if (state.phase === 'aborted') {
    return { done: true, aborted: true, reason: state.abortReason ?? 'session was aborted' };
  }

  // Idempotency: return same instruction if pendingAction is unacknowledged
  if (state.pendingAction && !state.pendingAction.acknowledged) {
    return buildPendingResponse(state.pendingAction);
  }

  const blocks = getRecipeBlocks(state, name);

  // No recipe → done
  if (!blocks) {
    return { done: true };
  }

  let blockIndex = state.blockIndex ?? 0;

  // Collect results for cli-chain auto-execution
  const cliResults = {};
  let chainedCli = false;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // All blocks done
    if (blockIndex >= blocks.length) {
      if (chainedCli) {
        return { action: 'cli-chain', results: cliResults, done: true };
      }
      return { done: true };
    }

    const block = blocks[blockIndex];

    if (block.type === 'cli') {
      // Auto-advance: execute the cli block internally
      chainedCli = true;
      cliResults[block.id] = {
        block: block.id,
        command: block.command ?? null,
        status: 'executed',
      };

      // Advance blockIndex
      blockIndex += 1;
      updateState(name, { blockIndex, currentBlock: blocks[blockIndex]?.id ?? null });
      appendEvent(name, 'block.cli.auto', { block: block.id });

      // Continue the loop to chain the next block if it's also cli
      continue;
    }

    // Engine blocks manage their own pending state
    if (block.type === 'engine') {
      updateState(name, { currentBlock: block.id, blockIndex });
      const response = buildBlockResponse(block, name);
      if (chainedCli) {
        return { ...response, cliChain: cliResults };
      }
      return response;
    }

    // Non-cli block: set pendingAction, currentBlock, and blockIndex atomically
    const response = buildBlockResponse(block, name);

    const now = new Date().toISOString();
    const pendingAction = {
      block: block.id,
      action: response.action,
      instruction: response.instruction ?? JSON.stringify(response),
      issuedAt: now,
      acknowledged: false,
    };
    updateState(name, { pendingAction, currentBlock: block.id, blockIndex });
    appendEvent(name, 'pendingAction.set', { action: response.action, block: block.id });

    if (chainedCli) {
      // Prepend cli-chain results to the response
      return {
        ...response,
        cliChain: cliResults,
      };
    }

    return response;
  }
}

/**
 * Acknowledge a completed step and advance to the next block.
 *
 * @param {string} name - Session name
 * @param {string} step - The block id that completed
 * @param {unknown} [result] - Optional result data to store
 * @returns {object} Updated state object
 */
export function stepComplete(name, step, result = null) {
  // Delegate to engine when engine state exists
  const state = loadState(name);
  if (state.engine?.initialized) {
    return _engineStepComplete(name, step, result);
  }

  // Resolve step: default to pendingAction.block or currentBlock if not provided
  const resolvedStep = step ?? state.pendingAction?.block ?? state.currentBlock;

  if (!resolvedStep) {
    throw new Error(
      'stepComplete: no block to complete. Provide --step <blockId> or ensure a pending action exists.'
    );
  }

  // Acknowledge the pending action (if one exists)
  if (hasPendingAction(name)) {
    acknowledgePendingAction(name);
  }

  // Advance blockIndex
  const freshState = loadState(name);
  const newIndex = (freshState.blockIndex ?? 0) + 1;

  // Update steps record
  const steps = { ...(freshState.steps ?? {}) };
  steps[resolvedStep] = {
    status: 'done',
    at: new Date().toISOString(),
    result,
  };

  const updated = updateState(name, {
    blockIndex: newIndex,
    steps,
  });

  appendEvent(name, 'block.complete', { block: resolvedStep, result });

  return updated;
}

/**
 * Invalidate a step and all downstream steps (mark as "stale").
 * This is used when a step's output needs to be regenerated.
 *
 * @param {string} name - Session name
 * @param {string} step - The block id to invalidate (and all downstream)
 * @returns {object} Updated state object
 */
export function stepInvalidate(name, step) {
  const state = loadState(name);

  // Get all blocks to determine downstream order
  const blocks = getRecipeBlocks(state, name) ?? [];
  const stepIndex = blocks.findIndex((b) => b.id === step);

  const steps = { ...(state.steps ?? {}) };

  if (stepIndex !== -1) {
    // Mark this step and all downstream steps as stale
    for (let i = stepIndex; i < blocks.length; i++) {
      const blockId = blocks[i].id;
      if (steps[blockId]) {
        steps[blockId] = { ...steps[blockId], status: 'stale' };
      } else {
        steps[blockId] = { status: 'stale' };
      }
    }
  } else {
    // Block not found in recipe — just mark the given step
    if (steps[step]) {
      steps[step] = { ...steps[step], status: 'stale' };
    } else {
      steps[step] = { status: 'stale' };
    }
  }

  const updated = updateState(name, { steps });
  appendEvent(name, 'block.invalidate', { block: step, downstream: stepIndex !== -1 });

  return updated;
}
