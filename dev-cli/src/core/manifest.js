/**
 * manifest.js — Generate compact human-readable recovery summary for a session
 *
 * Reads state.json, DRAFT.md, and PLAN.md to produce a one-line recovery summary
 * showing current step, mode, missing fields, decisions, agent status, and next action.
 */

import { readFileSync, existsSync } from 'node:fs';
import { statePath } from '../core/state.js';
import { draftPath as _draftPath, planPath as _planPath } from './paths.js';

// ---------------------------------------------------------------------------
// DRAFT.md parsing
// ---------------------------------------------------------------------------

/**
 * Count filled and total sections in a DRAFT.md file.
 * A section header is identified by lines starting with "##".
 * A section is "filled" if it has non-empty, non-placeholder content below it
 * (i.e. at least one non-empty line that isn't "<!-- TODO -->" or "TBD").
 *
 * @param {string} content - Raw DRAFT.md content
 * @returns {{ filled: number, total: number, missing: string[] }}
 */
function parseDraftSections(content) {
  const lines = content.split('\n');
  const sections = [];
  let currentSection = null;
  let currentLines = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentSection !== null) {
        sections.push({ name: currentSection, lines: currentLines });
      }
      currentSection = line.replace(/^##\s+/, '').trim();
      currentLines = [];
    } else if (currentSection !== null) {
      currentLines.push(line);
    }
  }

  // Push last section
  if (currentSection !== null) {
    sections.push({ name: currentSection, lines: currentLines });
  }

  const missing = [];
  let filled = 0;

  for (const section of sections) {
    const hasContent = section.lines.some((l) => {
      const trimmed = l.trim();
      return (
        trimmed.length > 0 &&
        trimmed !== '<!-- TODO -->' &&
        trimmed !== 'TBD' &&
        trimmed !== 'N/A' &&
        !trimmed.startsWith('<!-- ')
      );
    });
    if (hasContent) {
      filled += 1;
    } else {
      missing.push(section.name);
    }
  }

  return { filled, total: sections.length, missing };
}

// ---------------------------------------------------------------------------
// PLAN.md parsing
// ---------------------------------------------------------------------------

/**
 * Count TODO items in a PLAN.md file.
 * Looks for Markdown checkbox patterns: "- [ ]" (open) and "- [x]" (done).
 *
 * @param {string} content - Raw PLAN.md content
 * @returns {{ done: number, total: number }}
 */
function parsePlanTodos(content) {
  const openPattern = /^[\s]*-\s+\[\s+\]/m;
  const donePattern = /^[\s]*-\s+\[[xX]\]/m;

  const openMatches = content.match(/^[\s]*-\s+\[\s+\]/gm) ?? [];
  const doneMatches = content.match(/^[\s]*-\s+\[[xX]\]/gm) ?? [];

  void openPattern;
  void donePattern;

  const total = openMatches.length + doneMatches.length;
  return { done: doneMatches.length, total };
}

// ---------------------------------------------------------------------------
// Decisions extraction
// ---------------------------------------------------------------------------

/**
 * Extract a short list of decisions from state.
 * Looks for events of type 'decision.*' or steps with decision data.
 *
 * @param {object} state - Session state
 * @returns {string[]}
 */
function extractDecisions(state) {
  const decisions = [];

  if (Array.isArray(state.events)) {
    for (const event of state.events) {
      if (event.type && event.type.startsWith('decision.') && event.data) {
        const d = event.data;
        if (d.key && d.value) {
          decisions.push(`${d.key}=${d.value}`);
        } else if (typeof d === 'string') {
          decisions.push(d);
        }
      }
    }
  }

  // Also check state.decisions if present
  if (state.decisions && typeof state.decisions === 'object') {
    for (const [k, v] of Object.entries(state.decisions)) {
      if (!decisions.some((d) => d.startsWith(`${k}=`))) {
        decisions.push(`${k}=${v}`);
      }
    }
  }

  return decisions;
}

// ---------------------------------------------------------------------------
// Agent status extraction
// ---------------------------------------------------------------------------

/**
 * Build a compact agent status string from state.agents.
 *
 * @param {object} agents - state.agents object
 * @returns {string|null}
 */
function buildAgentStatus(agents) {
  if (!agents || typeof agents !== 'object') return null;

  const entries = Object.entries(agents);
  if (entries.length === 0) return null;

  const byType = {};
  for (const [, agentData] of entries) {
    if (agentData && typeof agentData === 'object') {
      const type = agentData.type ?? 'unknown';
      if (!byType[type]) byType[type] = { total: 0, done: 0 };
      byType[type].total += 1;
      if (agentData.status === 'done' || agentData.status === 'complete') {
        byType[type].done += 1;
      }
    }
  }

  return Object.entries(byType)
    .map(([type, counts]) => `${counts.done}/${counts.total} ${type} done`)
    .join(', ');
}

// ---------------------------------------------------------------------------
// Next action determination
// ---------------------------------------------------------------------------

/**
 * Determine the next action string from state.
 *
 * @param {object} state - Session state
 * @param {string[]} missingFields - Missing DRAFT.md sections
 * @returns {string}
 */
function buildNextAction(state, missingFields) {
  if (state.pendingAction && !state.pendingAction.acknowledged) {
    return `Resume pending action: ${state.pendingAction.action} on block '${state.pendingAction.block}'`;
  }

  if (missingFields.length > 0) {
    return `Continue interview — ask about ${missingFields.slice(0, 3).join(', ')}`;
  }

  const phase = state.phase ?? 'unknown';
  const block = state.currentBlock ?? 'unknown';

  if (phase === 'init') {
    return 'Start the session — run init block';
  }
  if (phase === 'done') {
    return 'Session complete';
  }

  return `Continue at block '${block}' (phase: ${phase})`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a compact recovery summary for the given session.
 *
 * @param {string} name - Session name
 * @returns {string} Human-readable summary string
 */
export function manifest(name) {
  // Load state
  const p = statePath(name);
  if (!existsSync(p)) {
    return `Session '${name}': no state found.`;
  }

  const raw = readFileSync(p, 'utf8');
  const state = JSON.parse(raw);

  // Parse DRAFT.md if it exists
  let draftSummary = null;
  let missingFields = [];
  const draftPath = _draftPath(name);
  if (existsSync(draftPath)) {
    const draftContent = readFileSync(draftPath, 'utf8');
    const { filled, total, missing } = parseDraftSections(draftContent);
    draftSummary = `${filled}/${total} filled`;
    missingFields = missing;
  }

  // Parse PLAN.md if it exists
  let planSummary = null;
  const planPath = _planPath(name);
  if (existsSync(planPath)) {
    const planContent = readFileSync(planPath, 'utf8');
    const { done, total } = parsePlanTodos(planContent);
    if (total > 0) {
      planSummary = `PLAN: ${done}/${total} TODOs done`;
    }
  }

  // Mode
  const depth = state.mode?.depth ?? 'standard';
  const interaction = state.mode?.interaction ?? 'interactive';
  const mode = `${depth}/${interaction}`;

  // Current step
  const currentBlock = state.currentBlock ?? state.phase ?? 'init';

  // Decisions
  const decisions = extractDecisions(state);

  // Agent status
  const agentStatus = buildAgentStatus(state.agents);

  // Next action
  const nextAction = buildNextAction(state, missingFields);

  // Assemble summary
  const parts = [];

  // Line 1: step, mode, draft
  let line1 = `Step: ${currentBlock} | Mode: ${mode}`;
  if (draftSummary) {
    line1 += ` | DRAFT: ${draftSummary}`;
  }
  if (planSummary) {
    line1 += ` | ${planSummary}`;
  }
  parts.push(line1);

  // Line 2: missing fields and agents
  const line2Parts = [];
  if (missingFields.length > 0) {
    line2Parts.push(`(missing: ${missingFields.join(', ')})`);
  }
  if (agentStatus) {
    line2Parts.push(`Agents: ${agentStatus}`);
  }
  if (line2Parts.length > 0) {
    parts.push(line2Parts.join(' | '));
  }

  // Line 3: next action
  parts.push(`Next: ${nextAction}`);

  // Line 4: decisions (if any)
  if (decisions.length > 0) {
    parts.push(`Decisions so far: ${decisions.join(', ')}`);
  }

  return parts.join('\n');
}
