/**
 * handlers/chain-init.js — dev-cli chain-init <keyword> --session <id>
 *
 * Parses !keyword (e.g. "cr>c>p"), resolves actions from .claude/actions.json,
 * creates a chain, and outputs { chainId, executionPlan }.
 *
 * stdout: JSON { chainId, executionPlan }
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createChain, generateChainId } from '../core/chain-state.js';

export default async function handler(args) {
  const keyword = args.find(a => !a.startsWith('--'));
  if (!keyword) {
    console.error('Usage: dev-cli chain-init <keyword> --session <id>');
    process.exit(1);
  }

  const sessionIdx = args.indexOf('--session');
  const sessionId = sessionIdx >= 0 ? args[sessionIdx + 1] : undefined;
  if (!sessionId) {
    console.error('Error: --session <id> is required');
    process.exit(1);
  }

  // Load actions registry
  const registryPath = join(process.cwd(), '.claude', 'actions.json');
  if (!existsSync(registryPath)) {
    throw new Error(`Registry not found: ${registryPath}`);
  }
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));

  // Parse keyword into action sequence (split by >)
  const actionNames = keyword.split('>');

  // Resolve each action
  const steps = actionNames.map(name => resolveAction(registry, name));

  // Create chain
  const chainId = generateChainId();
  const chain = createChain(chainId, { sessionId, source: `!${keyword}`, steps });

  // Build structured execution plan
  const executionPlan = buildExecutionPlan(chainId, chain.steps, registry);

  console.log(JSON.stringify({ chainId, executionPlan }, null, 2));
}

function resolveAction(registry, name) {
  if (registry.agents?.[name]) {
    return { action: name, type: 'agent', agentType: registry.agents[name].agent_type };
  }
  if (registry.builtins?.[name]) {
    return { action: name, type: 'builtin', builtinCmd: registry.builtins[name].cmd };
  }
  if (registry.skills?.[name]) {
    return { action: name, type: 'skill', skillName: registry.skills[name].skill };
  }
  throw new Error(`Unknown action: "${name}". Not found in agents, builtins, or skills.`);
}

function buildExecutionPlan(chainId, steps, registry) {
  return steps.map((step, i) => {
    const base = {
      stepId: step.id,
      stepNumber: i + 1,
      totalSteps: steps.length,
      action: step.action,
      type: step.type,
      chainId,
    };

    if (step.type === 'agent') {
      const agentDef = registry.agents[step.action];
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
}
