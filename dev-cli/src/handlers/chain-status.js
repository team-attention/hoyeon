/**
 * handlers/chain-status.js — dev-cli chain-status --session <id>
 *
 * Shows chain status for a session. Returns the active (running) chain.
 * If no active chain, exits with code 1.
 *
 * stdout: JSON { chainId, status, steps, remainingSteps, executionPlan }
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { findActiveChain } from '../core/chain-state.js';

export default async function handler(args) {
  const sessionIdx = args.indexOf('--session');
  const sessionId = sessionIdx >= 0 ? args[sessionIdx + 1] : undefined;

  if (!sessionId) {
    console.error('Usage: dev-cli chain-status --session <id>');
    process.exit(1);
  }

  const chain = findActiveChain(sessionId);
  if (!chain) {
    // No active chain — exit 1 so callers can detect
    process.exit(1);
  }

  const remaining = chain.steps.filter(s => s.status === 'pending' || s.status === 'running');

  // Rebuild execution plan for remaining steps
  let registry = null;
  const registryPath = join(process.cwd(), '.claude', 'actions.json');
  if (existsSync(registryPath)) {
    registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  }

  const executionPlan = chain.steps
    .filter(s => s.status === 'pending' || s.status === 'running')
    .map((step, i) => {
      const base = {
        stepId: step.id,
        stepNumber: i + 1,
        totalSteps: remaining.length,
        action: step.action,
        type: step.type,
        chainId: chain.chainId,
      };

      if (step.type === 'agent') {
        const agentDef = registry?.agents?.[step.action];
        return {
          ...base,
          agentType: step.agentType,
          defaultPrompt: agentDef?.default_prompt ?? null,
          instruction: `Call Task(subagent_type="${step.agentType}"). After completion, persist result.`,
        };
      }
      if (step.type === 'builtin') {
        return {
          ...base,
          builtinCmd: step.builtinCmd,
          instruction: `Execute ${step.builtinCmd} directly. After completion, persist result.`,
        };
      }
      if (step.type === 'skill') {
        return {
          ...base,
          skillName: step.skillName,
          instruction: `Call Skill("${step.skillName}"). After completion, persist result.`,
        };
      }
      return base;
    });

  console.log(JSON.stringify({
    chainId: chain.chainId,
    status: chain.status,
    source: chain.source,
    steps: chain.steps.map(s => ({ id: s.id, action: s.action, status: s.status })),
    remainingSteps: remaining.length,
    executionPlan,
  }, null, 2));
}
