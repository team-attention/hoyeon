/**
 * plan-summary.js — dev-cli plan summary <name>
 *
 * Reads PLAN.md from the session directory, extracts key metadata,
 * and formats as a compact Plan Approval Summary.
 */

import { readFileSync, existsSync } from 'node:fs';
import { planPath as _planPath } from '../core/paths.js';

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

/**
 * Count occurrences of a pattern in text.
 */
function countMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

/**
 * Extract items from a named section between two headings (### or ##).
 * Returns an array of bullet point strings found in that section.
 */
function extractSectionItems(text, sectionHeading) {
  // Match the section from its heading to the next heading of same/higher level
  const headingLevel = sectionHeading.startsWith('###') ? '###' : '##';
  const escapedHeading = sectionHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `${escapedHeading}[\\s\\S]*?(?=\\n${headingLevel}[^#]|$)`,
  );
  const match = text.match(pattern);
  if (!match) return [];

  const sectionText = match[0];
  const lines = sectionText.split('\n');
  const items = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') && trimmed !== '- _None_') {
      items.push(trimmed.slice(2));
    }
  }

  return items;
}

/**
 * Extract the content of a section as plain text (non-bullet, non-heading).
 * Useful for single-value sections like Core Objective.
 */
function extractSectionText(text, sectionHeading) {
  const escapedHeading = sectionHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `${escapedHeading}\\s*\\n([\\s\\S]*?)(?=\\n##[^#]|\\n###[^#]|$)`,
  );
  const match = text.match(pattern);
  if (!match) return '';
  return match[1].trim();
}

// ---------------------------------------------------------------------------
// Plan summary extractor
// ---------------------------------------------------------------------------

/**
 * Extract structured summary data from PLAN.md content.
 *
 * @param {string} planContent - Raw PLAN.md text
 * @returns {{
 *   todoCount: number,
 *   aItemCount: number,
 *   hItemCount: number,
 *   sItemCount: number,
 *   gapCount: number,
 *   aItems: string[],
 *   hItems: string[],
 *   sItems: string[],
 *   gaps: string[],
 *   coreObjective: string,
 *   deliverables: string[],
 *   dod: string[],
 * }}
 */
function extractSummaryData(planContent) {
  // Count TODOs by counting "### [ ] TODO" occurrences
  const todoCount = countMatches(planContent, /### \[ \] TODO \d+:/g);

  // Extract verification summary sections
  const aItems = extractSectionItems(planContent, '### Agent-Verifiable (A-items)');
  const hItems = extractSectionItems(planContent, '### Human-Required (H-items)');
  const sItems = extractSectionItems(planContent, '### Sandbox Agent Testing (S-items)');
  const gaps = extractSectionItems(planContent, '### Verification Gaps');

  // Extract core objective
  const coreObjective = extractSectionText(planContent, '### Core Objective');

  // Extract deliverables and DoD
  const deliverables = extractSectionItems(planContent, '### Concrete Deliverables');
  const dod = extractSectionItems(planContent, '### Definition of Done');

  return {
    todoCount,
    aItemCount: aItems.length,
    hItemCount: hItems.length,
    sItemCount: sItems.length,
    gapCount: gaps.length,
    aItems,
    hItems,
    sItems,
    gaps,
    coreObjective,
    deliverables,
    dod,
  };
}

/**
 * Format the extracted summary as compact text output.
 *
 * @param {string} name - Session name
 * @param {object} summary - Extracted summary data
 * @returns {string} Formatted Plan Approval Summary
 */
function formatSummary(name, summary) {
  const {
    todoCount,
    aItemCount,
    hItemCount,
    sItemCount,
    gapCount,
    aItems,
    hItems,
    sItems,
    gaps,
    coreObjective,
    deliverables,
    dod,
  } = summary;

  const lines = [
    `# Plan Approval Summary: ${name}`,
    '',
    `**TODOs**: ${todoCount}`,
    `**Verification**: A=${aItemCount} / H=${hItemCount} / S=${sItemCount} / Gaps=${gapCount}`,
    '',
  ];

  if (coreObjective) {
    lines.push('## Core Objective');
    lines.push('');
    lines.push(coreObjective);
    lines.push('');
  }

  if (deliverables.length > 0) {
    lines.push('## Deliverables');
    lines.push('');
    deliverables.forEach((d) => lines.push(`- ${d}`));
    lines.push('');
  }

  if (dod.length > 0) {
    lines.push('## Definition of Done');
    lines.push('');
    dod.forEach((d) => lines.push(`- ${d}`));
    lines.push('');
  }

  if (aItems.length > 0) {
    lines.push('## Agent-Verifiable (A-items)');
    lines.push('');
    aItems.forEach((i) => lines.push(`- ${i}`));
    lines.push('');
  }

  if (hItems.length > 0) {
    lines.push('## Human-Required (H-items)');
    lines.push('');
    hItems.forEach((i) => lines.push(`- ${i}`));
    lines.push('');
  }

  if (sItems.length > 0) {
    lines.push('## Sandbox Agent Testing (S-items)');
    lines.push('');
    sItems.forEach((i) => lines.push(`- ${i}`));
    lines.push('');
  }

  if (gaps.length > 0) {
    lines.push('## Verification Gaps');
    lines.push('');
    gaps.forEach((g) => lines.push(`- ${g}`));
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate and return a Plan Approval Summary for the given session.
 *
 * @param {string} name - Session name
 * @returns {{ summary: string, data: object }} Formatted summary text and extracted data
 * @throws {Error} If PLAN.md does not exist
 */
export function planSummary(name) {
  const planPath = _planPath(name);

  if (!existsSync(planPath)) {
    throw new Error(
      `No PLAN.md found for session '${name}' at ${planPath}. Run 'plan generate' first.`,
    );
  }

  const planContent = readFileSync(planPath, 'utf8');
  const data = extractSummaryData(planContent);
  const summary = formatSummary(name, data);

  return { summary, data };
}
