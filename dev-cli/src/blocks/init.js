/**
 * init.js — dev-cli init <name> [flags]
 *
 * Creates a new specify session directory with DRAFT.md, state.json,
 * active-spec pointer, findings/ and analysis/ subdirectories.
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createState } from '../core/state.js';
import { specDir as _specDir, draftPath as _draftPath, findingsDir as _findingsDir, analysisDir as _analysisDir } from '../core/paths.js';

// ---------------------------------------------------------------------------
// DRAFT.md template
// ---------------------------------------------------------------------------

/**
 * Build the initial DRAFT.md content for a new session.
 *
 * @param {string} name - Session name
 * @returns {string} DRAFT.md content
 */
function buildDraftTemplate(name) {
  return `# Draft: ${name}

## Meta

<!-- BEGIN:meta -->
- **Session**: ${name}
- **Created**: ${new Date().toISOString()}
- **Status**: draft
<!-- END:meta -->

## Intent Classification

<!-- BEGIN:intent -->
_Not yet classified._
<!-- END:intent -->

## What & Why

<!-- BEGIN:what-why -->
_Not yet filled in._
<!-- END:what-why -->

## Boundaries

<!-- BEGIN:boundaries -->
_Not yet defined._
<!-- END:boundaries -->

## Success Criteria

<!-- BEGIN:criteria -->
_Not yet defined._
<!-- END:criteria -->

## User Decisions

<!-- BEGIN:decisions -->
_No decisions recorded yet._
<!-- END:decisions -->

## Agent Findings

<!-- BEGIN:findings -->
_No findings imported yet._
<!-- END:findings -->

## Open Questions

<!-- BEGIN:questions -->
_No questions recorded._
<!-- END:questions -->

## Direction

<!-- BEGIN:direction -->
_Direction not yet set._
<!-- END:direction -->

## Assumptions

<!-- BEGIN:assumptions -->
_No assumptions recorded._
<!-- END:assumptions -->
`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize a new specify session.
 *
 * Creates:
 *   <sessionDir>/state.json
 *   <sessionDir>/DRAFT.md
 *   <sessionDir>/findings/
 *   <sessionDir>/analysis/
 *   .dev/active-spec  (pointer file)
 *
 * @param {string} name - Session name
 * @param {{ depth?: string, interaction?: string }} options
 * @returns {{ specDir: string, state: object }} Created spec directory and state
 */
export function initSpec(name, options = {}) {
  const depth = options.depth ?? 'standard';
  const interaction = options.interaction ?? 'interactive';

  const specDirPath = _specDir(name);
  const devDir = join(process.cwd(), '.dev');

  // Create directory structure
  mkdirSync(specDirPath, { recursive: true });
  mkdirSync(_findingsDir(name), { recursive: true });
  mkdirSync(_analysisDir(name), { recursive: true });

  // Create state.json
  const state = createState(name, { depth, interaction, recipe: options.recipe, skill: options.skill });

  // Create DRAFT.md
  const draftPathVal = _draftPath(name);
  writeFileSync(draftPathVal, buildDraftTemplate(name), 'utf8');

  // Write active-spec pointer
  const activeSpecPath = join(devDir, 'active-spec');
  if (!existsSync(devDir)) mkdirSync(devDir, { recursive: true });
  writeFileSync(activeSpecPath, name, 'utf8');

  return { specDir: specDirPath, state };
}
