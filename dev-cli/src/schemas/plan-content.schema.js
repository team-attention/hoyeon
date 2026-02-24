/**
 * plan-content.schema.js — Hand-written validator for plan-content.json
 *
 * NO external schema libraries (no ajv). Pure Node.js ESM.
 *
 * Returns: { valid: boolean, errors: [{ path, message, expected }] }
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function typeOf(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function pushError(errors, path, message, expected) {
  errors.push({ path, message, expected });
}

/**
 * Validate that a field is present and is the expected type.
 * @param {object} obj - Parent object
 * @param {string} key - Field name
 * @param {string} expectedType - 'string'|'array'|'object'
 * @param {string} basePath - Dot-notation path prefix
 * @param {Array} errors - Error accumulator
 * @param {boolean} required - Whether the field is required
 * @returns {boolean} true if field is present and valid type
 */
function requireField(obj, key, expectedType, basePath, errors, required = true) {
  const path = basePath ? `${basePath}.${key}` : key;

  if (obj == null || !Object.prototype.hasOwnProperty.call(obj, key) || obj[key] === undefined) {
    if (required) {
      pushError(errors, path, `Missing required field '${path}'`, expectedType);
    }
    return false;
  }

  const actual = typeOf(obj[key]);
  if (actual !== expectedType) {
    pushError(errors, path, `Field '${path}' must be ${expectedType}, got ${actual}`, expectedType);
    return false;
  }

  return true;
}

/**
 * Validate an array element's field.
 */
function requireArrayField(obj, key, expectedType, basePath, errors, required = true) {
  return requireField(obj, key, expectedType, basePath, errors, required);
}

// ---------------------------------------------------------------------------
// Section validators
// ---------------------------------------------------------------------------

function validateContext(data, errors) {
  if (!requireField(data, 'context', 'object', '', errors)) return;

  const ctx = data.context;
  requireField(ctx, 'originalRequest', 'string', 'context', errors);
  requireField(ctx, 'interviewSummary', 'string', 'context', errors);
  requireField(ctx, 'researchFindings', 'string', 'context', errors);
  // assumptions is optional
  if (Object.prototype.hasOwnProperty.call(ctx, 'assumptions')) {
    requireField(ctx, 'assumptions', 'string', 'context', errors, false);
  }
}

function validateObjectives(data, errors) {
  if (!requireField(data, 'objectives', 'object', '', errors)) return;

  const obj = data.objectives;
  requireField(obj, 'core', 'string', 'objectives', errors);
  requireField(obj, 'deliverables', 'array', 'objectives', errors);
  requireField(obj, 'dod', 'array', 'objectives', errors);
  requireField(obj, 'mustNotDo', 'array', 'objectives', errors);
}

function validateTodoInput(input, path, errors) {
  requireField(input, 'name', 'string', path, errors);
  requireField(input, 'type', 'string', path, errors);
  requireField(input, 'ref', 'string', path, errors);
}

function validateTodoOutput(output, path, errors) {
  requireField(output, 'name', 'string', path, errors);
  requireField(output, 'type', 'string', path, errors);
  requireField(output, 'value', 'string', path, errors);
  requireField(output, 'description', 'string', path, errors);
}

function validateAcceptanceCriteria(ac, path, errors) {
  if (!ac || typeOf(ac) !== 'object') {
    pushError(errors, path, `'${path}' must be an object`, 'object');
    return;
  }
  requireField(ac, 'functional', 'array', path, errors);
  requireField(ac, 'static', 'array', path, errors);
  requireField(ac, 'runtime', 'array', path, errors);
  // cleanup is optional
  if (Object.prototype.hasOwnProperty.call(ac, 'cleanup')) {
    requireField(ac, 'cleanup', 'array', path, errors, false);
  }
}

const VALID_TODO_TYPES = ['work', 'verification'];
const VALID_RISK_VALUES = ['LOW', 'MEDIUM', 'HIGH'];

function validateTodo(todo, index, errors) {
  const path = `todos[${index}]`;

  if (!todo || typeOf(todo) !== 'object') {
    pushError(errors, path, `'${path}' must be an object`, 'object');
    return;
  }

  requireArrayField(todo, 'id', 'string', path, errors);
  requireArrayField(todo, 'title', 'string', path, errors);

  // type: "work"|"verification"
  if (requireArrayField(todo, 'type', 'string', path, errors)) {
    if (!VALID_TODO_TYPES.includes(todo.type)) {
      pushError(
        errors,
        `${path}.type`,
        `'${path}.type' must be one of: ${VALID_TODO_TYPES.join(', ')}, got '${todo.type}'`,
        VALID_TODO_TYPES.join('|'),
      );
    }
  }

  // inputs array
  if (requireArrayField(todo, 'inputs', 'array', path, errors)) {
    todo.inputs.forEach((input, i) => {
      validateTodoInput(input, `${path}.inputs[${i}]`, errors);
    });
  }

  // outputs array
  if (requireArrayField(todo, 'outputs', 'array', path, errors)) {
    todo.outputs.forEach((output, i) => {
      validateTodoOutput(output, `${path}.outputs[${i}]`, errors);
    });
  }

  requireArrayField(todo, 'steps', 'array', path, errors);
  requireArrayField(todo, 'mustNotDo', 'array', path, errors);
  requireArrayField(todo, 'references', 'array', path, errors);

  // acceptanceCriteria
  if (requireArrayField(todo, 'acceptanceCriteria', 'object', path, errors)) {
    validateAcceptanceCriteria(todo.acceptanceCriteria, `${path}.acceptanceCriteria`, errors);
  }

  // risk: "LOW"|"MEDIUM"|"HIGH"
  if (requireArrayField(todo, 'risk', 'string', path, errors)) {
    if (!VALID_RISK_VALUES.includes(todo.risk)) {
      pushError(
        errors,
        `${path}.risk`,
        `'${path}.risk' must be one of: ${VALID_RISK_VALUES.join(', ')}, got '${todo.risk}'`,
        VALID_RISK_VALUES.join('|'),
      );
    }
  }
}

function validateTodos(data, errors) {
  if (!requireField(data, 'todos', 'array', '', errors)) return;

  data.todos.forEach((todo, i) => {
    validateTodo(todo, i, errors);
  });
}

function validateDependencyGraph(data, errors) {
  if (!requireField(data, 'dependencyGraph', 'array', '', errors)) return;

  data.dependencyGraph.forEach((entry, i) => {
    const path = `dependencyGraph[${i}]`;
    if (!entry || typeOf(entry) !== 'object') {
      pushError(errors, path, `'${path}' must be an object`, 'object');
      return;
    }
    requireField(entry, 'todo', 'string', path, errors);
    requireField(entry, 'requires', 'array', path, errors);
    requireField(entry, 'produces', 'array', path, errors);
  });
}

function validateCommitStrategy(data, errors) {
  if (!requireField(data, 'commitStrategy', 'array', '', errors)) return;

  data.commitStrategy.forEach((entry, i) => {
    const path = `commitStrategy[${i}]`;
    if (!entry || typeOf(entry) !== 'object') {
      pushError(errors, path, `'${path}' must be an object`, 'object');
      return;
    }
    requireField(entry, 'afterTodo', 'string', path, errors);
    requireField(entry, 'message', 'string', path, errors);
    requireField(entry, 'files', 'array', path, errors);
    requireField(entry, 'condition', 'string', path, errors);
  });
}

function validateVerificationSummary(data, errors) {
  if (!requireField(data, 'verificationSummary', 'object', '', errors)) return;

  const vs = data.verificationSummary;
  requireField(vs, 'aItems', 'array', 'verificationSummary', errors);
  requireField(vs, 'hItems', 'array', 'verificationSummary', errors);
  requireField(vs, 'sItems', 'array', 'verificationSummary', errors);
  requireField(vs, 'gaps', 'array', 'verificationSummary', errors);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a plan-content.json data object.
 *
 * @param {unknown} data - The parsed JSON object to validate
 * @returns {{ valid: boolean, errors: Array<{ path: string, message: string, expected: string }> }}
 */
export function validatePlanContent(data) {
  const errors = [];

  if (!data || typeOf(data) !== 'object') {
    pushError(errors, '', 'Root must be an object', 'object');
    return { valid: false, errors };
  }

  validateContext(data, errors);
  validateObjectives(data, errors);
  validateTodos(data, errors);

  requireField(data, 'taskFlow', 'string', '', errors);

  validateDependencyGraph(data, errors);
  validateCommitStrategy(data, errors);
  validateVerificationSummary(data, errors);

  return {
    valid: errors.length === 0,
    errors,
  };
}
