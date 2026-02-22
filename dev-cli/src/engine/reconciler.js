/**
 * reconciler.js — Deterministic triage of verify results
 *
 * All rules are deterministic: no judgment calls, no LLM interaction.
 * Priority: halt > adapt > retry
 */

// ---------------------------------------------------------------------------
// Destructive scope patterns (always halt if adaptation touches these)
// ---------------------------------------------------------------------------

const DESTRUCTIVE_PATTERNS = [
  /db\s*schema/i,
  /database\s*migrat/i,
  /api\s*break/i,
  /breaking\s*change/i,
  /auth(entication|orization)\s*(change|modif|remov)/i,
  /security\s*(config|setting|policy)/i,
  /external\s*config/i,
  /ci\s*\/?\s*cd\s*pipeline/i,
];

// ---------------------------------------------------------------------------
// Scope check
// ---------------------------------------------------------------------------

/**
 * Check if a suggested adaptation is safe or destructive/out-of-scope.
 *
 * @param {{ reason: string, newTodo: { title: string, steps: string[] } }} adaptation
 * @returns {'safe' | 'destructive_out_of_scope'}
 */
export function scopeCheck(adaptation) {
  if (!adaptation) return 'safe';

  const text = [
    adaptation.reason ?? '',
    adaptation.newTodo?.title ?? '',
    ...(adaptation.newTodo?.steps ?? []),
  ].join(' ');

  for (const pattern of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(text)) {
      return 'destructive_out_of_scope';
    }
  }

  return 'safe';
}

// ---------------------------------------------------------------------------
// Retry / adapt guards
// ---------------------------------------------------------------------------

/**
 * Check if a TODO can be retried (retries < 3).
 *
 * @param {{ retries: number }} todoState
 * @returns {boolean}
 */
export function canRetry(todoState) {
  return (todoState.retries ?? 0) < 3;
}

/**
 * Check if a TODO can spawn an adaptation (depth < 1, dynamicTodos < 3).
 *
 * @param {{ dynamicTodos?: number }} todoState
 * @param {number} depth - Current adaptation depth
 * @returns {boolean}
 */
export function canAdapt(todoState, depth) {
  if (depth >= 1) return false;
  if ((todoState.dynamicTodos ?? 0) >= 3) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Triage
// ---------------------------------------------------------------------------

/**
 * Triage a verify result into a disposition.
 *
 * Priority: halt > adapt > retry
 *
 * @param {object} verifyResult - Parsed JSON from verify worker
 * @param {'work' | 'verification'} todoType
 * @param {{ retries: number, dynamicTodos?: number }} todoState
 * @param {number} [depth=0] - Adaptation depth
 * @returns {{ disposition: 'pass' | 'retry' | 'adapt' | 'halt', reason: string, details: object }}
 */
export function triage(verifyResult, todoType, todoState, depth = 0) {
  // VERIFIED → pass
  if (verifyResult.status === 'VERIFIED') {
    return { disposition: 'pass', reason: 'All criteria verified', details: {} };
  }

  // Check for critical must-not-do violations → halt
  const criticalViolations = (verifyResult.mustNotDoViolations ?? []).filter(
    (v) => v.violated === true,
  );
  if (criticalViolations.length > 0) {
    const criticalSideEffects = (verifyResult.sideEffects ?? []).filter(
      (s) => s.severity === 'critical',
    );
    return {
      disposition: 'halt',
      reason: 'Critical must-not-do violation',
      details: { violations: criticalViolations, sideEffects: criticalSideEffects },
    };
  }

  // Check for env_error in side effects → halt
  const envErrors = (verifyResult.sideEffects ?? []).filter(
    (s) => s.severity === 'critical' || s.description?.includes('env_error'),
  );
  if (envErrors.length > 0) {
    return {
      disposition: 'halt',
      reason: 'Environment error detected',
      details: { envErrors },
    };
  }

  // Check for suggested adaptation
  if (verifyResult.suggestedAdaptation) {
    const scope = scopeCheck(verifyResult.suggestedAdaptation);

    // Destructive out-of-scope adaptation → halt
    if (scope === 'destructive_out_of_scope') {
      return {
        disposition: 'halt',
        reason: 'Suggested adaptation is destructive/out-of-scope',
        details: { adaptation: verifyResult.suggestedAdaptation },
      };
    }

    // Safe adaptation + can adapt → adapt
    if (canAdapt(todoState, depth)) {
      return {
        disposition: 'adapt',
        reason: 'Safe adaptation available',
        details: { adaptation: verifyResult.suggestedAdaptation },
      };
    }

    // Can't adapt (depth or count limit) → halt
    return {
      disposition: 'halt',
      reason: 'Adaptation limit reached (max depth or max dynamic TODOs)',
      details: { adaptation: verifyResult.suggestedAdaptation, depth, dynamicTodos: todoState.dynamicTodos ?? 0 },
    };
  }

  // Verification TODO with failures → adapt (if possible) or halt
  if (todoType === 'verification') {
    const failedCriteria = (verifyResult.criteria ?? []).filter((c) => c.pass === false);
    if (failedCriteria.length > 0) {
      if (canAdapt(todoState, depth)) {
        return {
          disposition: 'adapt',
          reason: 'Verification TODO has failures requiring adaptation',
          details: { failedCriteria },
        };
      }
      return {
        disposition: 'halt',
        reason: 'Verification TODO failures, adaptation limit reached',
        details: { failedCriteria },
      };
    }
  }

  // Work TODO: acceptance criteria fail → retry
  const failedCriteria = (verifyResult.criteria ?? []).filter((c) => c.pass === false);
  if (failedCriteria.length > 0 && todoType === 'work') {
    if (canRetry(todoState)) {
      return {
        disposition: 'retry',
        reason: 'Acceptance criteria failed',
        details: { failedCriteria },
      };
    }
    return {
      disposition: 'halt',
      reason: 'Retry exhausted (max 3 retries)',
      details: { failedCriteria, retries: todoState.retries },
    };
  }

  // Suspicious pass or unhandled case → retry for work, halt for verification
  if (todoType === 'work' && canRetry(todoState)) {
    return {
      disposition: 'retry',
      reason: 'Suspicious or unhandled failure',
      details: { verifyResult },
    };
  }

  return {
    disposition: 'halt',
    reason: 'Unresolvable failure',
    details: { verifyResult },
  };
}

// ---------------------------------------------------------------------------
// Audit entry builder
// ---------------------------------------------------------------------------

/**
 * Build a structured markdown audit entry.
 *
 * @param {'triage' | 'retry' | 'adapt' | 'halt'} type
 * @param {string} todoId
 * @param {object} details
 * @returns {string} Markdown-formatted audit entry
 */
export function buildAuditEntry(type, todoId, details) {
  const timestamp = new Date().toISOString();
  const detailsJson = JSON.stringify(details, null, 2);

  return `### ${type.toUpperCase()} — ${todoId}

**Timestamp**: ${timestamp}
**TODO**: ${todoId}
**Type**: ${type}

\`\`\`json
${detailsJson}
\`\`\``;
}
