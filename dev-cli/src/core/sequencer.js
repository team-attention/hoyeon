/**
 * sequencer.js — Core ping-pong orchestration driver for dev-cli sessions
 *
 * Implements next() / stepComplete() / stepInvalidate() for session block sequencing.
 */

import {
  loadState,
  updateState,
  setPendingAction,
  acknowledgePendingAction,
  hasPendingAction,
  appendEvent,
} from '../core/state.js';
import { loadRecipe } from '../core/recipe-loader.js';

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
      return {
        action: 'llm+cli',
        block: block.id,
        instruction: block.instruction ?? null,
        then: block.then ?? null,
      };
    }

    case 'subagent': {
      return {
        action: 'dispatch-subagents',
        block: block.id,
        agents: block.agents ?? [],
        parallel: block.parallel ?? false,
        onComplete: block.onComplete ?? null,
      };
    }

    case 'subagent-loop': {
      return {
        action: 'dispatch-subagents-loop',
        block: block.id,
        agents: block.agents ?? [],
        maxRounds: block.maxRounds ?? null,
        exitWhen: block.exitWhen ?? null,
      };
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

    // Non-cli block: set pendingAction and return
    const response = buildBlockResponse(block, name);

    setPendingAction(name, {
      block: block.id,
      action: response.action,
      instruction: response.instruction ?? JSON.stringify(response),
    });

    // Update currentBlock in state
    updateState(name, { currentBlock: block.id, blockIndex });

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
  // Acknowledge the pending action
  acknowledgePendingAction(name);

  // Advance blockIndex
  const state = loadState(name);
  const newIndex = (state.blockIndex ?? 0) + 1;

  // Update steps record
  const steps = { ...(state.steps ?? {}) };
  steps[step] = {
    status: 'done',
    at: new Date().toISOString(),
    result,
  };

  const updated = updateState(name, {
    blockIndex: newIndex,
    steps,
  });

  appendEvent(name, 'block.complete', { block: step, result });

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
