/**
 * variable-sub.js — Variable substitution for TODO input refs
 *
 * Supports the pattern: ${todo-N.outputs.field}
 * Values are resolved from the accumulated outputs object produced by
 * context-manager.js writeOutput() calls.
 */

// ---------------------------------------------------------------------------
// substituteVariables
// ---------------------------------------------------------------------------

/**
 * Replace ${todo-N.outputs.field} placeholders in `text` using `outputs`.
 * Unknown references (no matching entry in outputs) are left as-is.
 *
 * @param {string} text    - Text containing zero or more variable references
 * @param {Object} outputs - Outputs map: { [todoId]: { [field]: value } }
 * @returns {string} Text with known placeholders substituted
 */
export function substituteVariables(text, outputs) {
  const pattern = /\$\{(todo-[^.]+)\.outputs\.([^}]+)\}/g;
  return text.replace(pattern, (match, todoId, field) => {
    if (outputs[todoId] !== undefined && outputs[todoId][field] !== undefined) {
      return outputs[todoId][field];
    }
    // Preserve original placeholder when value is not found
    return match;
  });
}

// ---------------------------------------------------------------------------
// resolveInputs
// ---------------------------------------------------------------------------

/**
 * Resolve variable references in each input's `ref` field.
 * Returns a new inputs array — the original is not mutated.
 *
 * @param {{ inputs: Array<{ ref: string, [key: string]: any }> }} todo
 * @param {Object} outputs - Outputs map: { [todoId]: { [field]: value } }
 * @returns {Array} New inputs array with resolved refs
 */
export function resolveInputs(todo, outputs) {
  return todo.inputs.map((input) => ({
    ...input,
    ref: substituteVariables(input.ref, outputs),
  }));
}
