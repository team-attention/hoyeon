/**
 * init.js — dev-cli init <name> [flags]
 *
 * Creates a new specify session:
 *   - Spec dir: .dev/specs/<name>/ (PLAN.md deliverables will go here)
 *   - Session dir: .dev/.sessions/<sessionId>/ (state.json, DRAFT.md, findings/, analysis/)
 *   - session.ref: .dev/specs/<name>/session.ref (pointer to sessionId)
 *   - active-spec: .dev/active-spec (pointer file)
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createState } from '../core/state.js';
import { createSession, linkToSpec } from '../core/session.js';
import {
  specDir as _specDir,
  draftPath as _draftPath,
  findingsDir as _findingsDir,
  analysisDir as _analysisDir,
  sessionDir as _sessionDir,
} from '../core/paths.js';

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
 *   .dev/specs/<name>/               (spec dir for deliverables)
 *   .dev/specs/<name>/session.ref    (pointer to sessionId)
 *   .dev/.sessions/<sessionId>/      (session work dir)
 *   .dev/.sessions/<sessionId>/state.json
 *   .dev/.sessions/<sessionId>/DRAFT.md
 *   .dev/.sessions/<sessionId>/findings/
 *   .dev/.sessions/<sessionId>/analysis/
 *   .dev/active-spec                 (pointer file)
 *
 * @param {string} name - Session name
 * @param {{ depth?: string, interaction?: string, recipe?: string, skill?: string }} options
 * @returns {{ specDir: string, state: object }} Created spec directory and state
 */
export function initSpec(name, options = {}) {
  const depth = options.depth ?? 'standard';
  const interaction = options.interaction ?? 'interactive';

  const specDirPath = _specDir(name);
  const devDir = join(process.cwd(), '.dev');

  // Create spec directory (for deliverables)
  mkdirSync(specDirPath, { recursive: true });

  // Create session directory with findings/ and analysis/ subdirs
  const sessionId = createSession(name);

  // Write session.ref in spec dir
  linkToSpec(name, sessionId);

  // Now that session.ref exists, paths.js dual-path resolution will route
  // state.json, DRAFT.md, findings/, analysis/ to the session dir.

  // Create state.json in session dir (via dual-path resolution)
  const state = createState(name, {
    depth,
    interaction,
    recipe: options.recipe,
    skill: options.skill,
    sessionId,
  });

  // Create DRAFT.md in session dir (via dual-path resolution)
  // Execute sessions don't need DRAFT.md (a specify artifact)
  if (options.skill !== 'execute') {
    const draftPathVal = _draftPath(name);
    writeFileSync(draftPathVal, buildDraftTemplate(name), 'utf8');
  }

  // Write active-spec pointer
  if (!existsSync(devDir)) mkdirSync(devDir, { recursive: true });
  writeFileSync(join(devDir, 'active-spec'), name, 'utf8');

  return { specDir: specDirPath, state };
}
