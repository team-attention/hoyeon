/**
 * recipe-loader.test.js — Unit tests for dev-cli/src/core/recipe-loader.js
 * Uses node:test and node:assert (no external test frameworks).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { parseRecipeYaml, loadRecipe, recipesDir } from '../../src/core/recipe-loader.js';

// ---------------------------------------------------------------------------
// Inline YAML fixtures
// ---------------------------------------------------------------------------

const VALID_RECIPE_YAML = `
name: specify-standard-interactive
type: sequential
description: Full planning with user interaction
blocks:
  - id: init
    type: cli
    command: "dev-cli init {name} --standard --interactive"
  - id: classify-intent
    type: llm
    instruction: "Classify user intent for {name}"
    save: "dev-cli draft update {name} --section intent"
  - id: explore-full
    type: subagent
    agents:
      - type: Explore
        promptHint: "Find patterns for {name}"
        output: "findings/explore-1.md"
    parallel: true
    onComplete: "dev-cli draft import {name}"
  - id: interview
    type: llm-loop
    instruction: "Present exploration summary to user"
    save: "dev-cli draft update {name} --section decisions"
    exitCheck: "dev-cli draft validate {name}"
`;

const MISSING_ID_YAML = `
name: bad-recipe
blocks:
  - type: cli
    command: "echo hello"
`;

const MISSING_TYPE_YAML = `
name: bad-recipe
blocks:
  - id: do-something
    command: "echo hello"
`;

const INVALID_TYPE_YAML = `
name: bad-recipe
blocks:
  - id: do-unknown-thing
    type: quantum
    command: "something"
`;

const MISSING_BLOCKS_YAML = `
name: no-blocks-recipe
type: sequential
`;

const MISSING_NAME_YAML = `
type: sequential
blocks:
  - id: init
    type: cli
    command: "echo hello"
`;

const EMPTY_BLOCKS_YAML = `
name: empty-blocks
blocks: []
`;

// ---------------------------------------------------------------------------
// Tests: loadRecipe (via parseRecipeYaml)
// ---------------------------------------------------------------------------

describe('parseRecipeYaml() — valid recipe', () => {
  test('parses a valid recipe YAML string', () => {
    const recipe = parseRecipeYaml(VALID_RECIPE_YAML);

    assert.equal(recipe.name, 'specify-standard-interactive');
    assert.equal(recipe.type, 'sequential');
    assert.ok(Array.isArray(recipe.blocks));
    assert.equal(recipe.blocks.length, 4);
  });

  test('preserves block structure and fields', () => {
    const recipe = parseRecipeYaml(VALID_RECIPE_YAML);
    const [init, classify, explore, interview] = recipe.blocks;

    assert.equal(init.id, 'init');
    assert.equal(init.type, 'cli');
    assert.equal(classify.id, 'classify-intent');
    assert.equal(classify.type, 'llm');
    assert.equal(explore.id, 'explore-full');
    assert.equal(explore.type, 'subagent');
    assert.equal(interview.id, 'interview');
    assert.equal(interview.type, 'llm-loop');
  });

  test('accepts all valid block types', () => {
    const yaml = `
name: all-types
blocks:
  - id: b1
    type: cli
    command: "echo"
  - id: b2
    type: llm
    instruction: "do something"
  - id: b3
    type: llm-loop
    instruction: "loop"
    exitCheck: "check"
  - id: b4
    type: llm+cli
    instruction: "write"
    then: "run"
  - id: b5
    type: subagent
    agents: []
  - id: b6
    type: subagent-loop
    agents: []
    exitWhen: "done"
`;
    const recipe = parseRecipeYaml(yaml);
    assert.equal(recipe.blocks.length, 6);
    assert.equal(recipe.blocks[0].type, 'cli');
    assert.equal(recipe.blocks[1].type, 'llm');
    assert.equal(recipe.blocks[2].type, 'llm-loop');
    assert.equal(recipe.blocks[3].type, 'llm+cli');
    assert.equal(recipe.blocks[4].type, 'subagent');
    assert.equal(recipe.blocks[5].type, 'subagent-loop');
  });
});

describe('parseRecipeYaml() — template variable substitution', () => {
  test('replaces {name} in command fields', () => {
    const recipe = parseRecipeYaml(VALID_RECIPE_YAML, { name: 'add-auth' });
    assert.equal(recipe.blocks[0].command, 'dev-cli init add-auth --standard --interactive');
  });

  test('replaces {name} in instruction fields', () => {
    const recipe = parseRecipeYaml(VALID_RECIPE_YAML, { name: 'add-auth' });
    assert.equal(recipe.blocks[1].instruction, 'Classify user intent for add-auth');
  });

  test('replaces {name} in save fields', () => {
    const recipe = parseRecipeYaml(VALID_RECIPE_YAML, { name: 'add-auth' });
    assert.equal(recipe.blocks[1].save, 'dev-cli draft update add-auth --section intent');
  });

  test('replaces {name} in nested agent fields', () => {
    const recipe = parseRecipeYaml(VALID_RECIPE_YAML, { name: 'my-feature' });
    assert.equal(recipe.blocks[2].agents[0].promptHint, 'Find patterns for my-feature');
  });

  test('replaces {name} in onComplete fields', () => {
    const recipe = parseRecipeYaml(VALID_RECIPE_YAML, { name: 'my-feature' });
    assert.equal(recipe.blocks[2].onComplete, 'dev-cli draft import my-feature');
  });

  test('replaces {name} in exitCheck fields', () => {
    const recipe = parseRecipeYaml(VALID_RECIPE_YAML, { name: 'my-feature' });
    assert.equal(recipe.blocks[3].exitCheck, 'dev-cli draft validate my-feature');
  });

  test('leaves unknown placeholders unchanged', () => {
    const yaml = `
name: test
blocks:
  - id: b1
    type: cli
    command: "run {unknown} {name}"
`;
    const recipe = parseRecipeYaml(yaml, { name: 'foo' });
    assert.equal(recipe.blocks[0].command, 'run {unknown} foo');
  });

  test('works with empty vars (no substitution)', () => {
    const recipe = parseRecipeYaml(VALID_RECIPE_YAML);
    assert.equal(recipe.blocks[0].command, 'dev-cli init {name} --standard --interactive');
  });

  test('supports multiple template variables', () => {
    const yaml = `
name: multi-var
blocks:
  - id: b1
    type: llm
    instruction: "Process {name} with {mode} mode"
`;
    const recipe = parseRecipeYaml(yaml, { name: 'my-session', mode: 'quick' });
    assert.equal(recipe.blocks[0].instruction, 'Process my-session with quick mode');
  });
});

describe('parseRecipeYaml() — validation errors', () => {
  test('throws if block is missing id', () => {
    assert.throws(
      () => parseRecipeYaml(MISSING_ID_YAML),
      /missing required field 'id'/,
    );
  });

  test('throws if block is missing type', () => {
    assert.throws(
      () => parseRecipeYaml(MISSING_TYPE_YAML),
      /missing required field 'type'/,
    );
  });

  test('rejects invalid block type (quantum)', () => {
    assert.throws(
      () => parseRecipeYaml(INVALID_TYPE_YAML),
      /invalid type 'quantum'/,
    );
  });

  test('throws if blocks array is missing', () => {
    assert.throws(
      () => parseRecipeYaml(MISSING_BLOCKS_YAML),
      /missing required field 'blocks'/,
    );
  });

  test('throws if blocks array is empty', () => {
    assert.throws(
      () => parseRecipeYaml(EMPTY_BLOCKS_YAML),
      /must not be empty/,
    );
  });

  test('throws if recipe name is missing', () => {
    assert.throws(
      () => parseRecipeYaml(MISSING_NAME_YAML),
      /missing required field 'name'/,
    );
  });

  test('throws on invalid YAML syntax', () => {
    assert.throws(
      () => parseRecipeYaml('name: [unclosed bracket\nblocks:'),
      /Failed to parse recipe YAML/,
    );
  });

  test('throws on non-object YAML (e.g. plain string)', () => {
    assert.throws(
      () => parseRecipeYaml('"just a string"'),
      /must be a YAML object/,
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: execute recipe format (todo_substeps + finalize)
// ---------------------------------------------------------------------------

const VALID_EXECUTE_YAML = `
name: execute-standard
type: sequential
description: Execute plan with full verification
blocks:
  - id: execute-engine
    type: engine
    mode: standard
todo_substeps:
  - { suffix: Worker, type: dispatch_llm, agent: worker, prompt_type: worker }
  - { suffix: Verify, type: dispatch_llm, agent: worker, prompt_type: verify, read_only: true }
  - { suffix: Wrap-up, type: deterministic, cmd: wrapup+checkpoint }
  - { suffix: Commit, type: dispatch_llm, agent: git-master, prompt_type: commit, conditional: commit_strategy }
finalize:
  - { suffix: Residual Commit, type: dispatch_llm, agent: git-master }
  - { suffix: Code Review, type: dispatch_llm, agent: code-reviewer }
  - { suffix: Final Verify, type: dispatch_llm, agent: worker, read_only: true }
  - { suffix: State Complete, type: deterministic, pr_only: true }
  - { suffix: Report, type: deterministic }
`;

const VALID_EXECUTE_QUICK_YAML = `
name: execute-quick
type: sequential
description: Quick mode
blocks:
  - id: execute-engine
    type: engine
    mode: quick
todo_substeps:
  - { suffix: Worker, type: dispatch_llm, agent: worker, prompt_type: worker }
  - { suffix: Wrap-up, type: deterministic, cmd: wrapup+checkpoint }
  - { suffix: Commit, type: dispatch_llm, agent: git-master, prompt_type: commit }
finalize:
  - { suffix: Residual Commit, type: dispatch_llm, agent: git-master }
  - { suffix: State Complete, type: deterministic, pr_only: true }
  - { suffix: Report, type: deterministic }
`;

describe('parseRecipeYaml() — execute recipe extensions', () => {
  test('parses todo_substeps and finalize', () => {
    const recipe = parseRecipeYaml(VALID_EXECUTE_YAML);

    assert.ok(Array.isArray(recipe.todo_substeps));
    assert.equal(recipe.todo_substeps.length, 4);
    assert.ok(Array.isArray(recipe.finalize));
    assert.equal(recipe.finalize.length, 5);
  });

  test('preserves substep fields', () => {
    const recipe = parseRecipeYaml(VALID_EXECUTE_YAML);
    const worker = recipe.todo_substeps[0];

    assert.equal(worker.suffix, 'Worker');
    assert.equal(worker.type, 'dispatch_llm');
    assert.equal(worker.agent, 'worker');
    assert.equal(worker.prompt_type, 'worker');
  });

  test('quick recipe has no Verify, Code Review, Final Verify', () => {
    const recipe = parseRecipeYaml(VALID_EXECUTE_QUICK_YAML);

    assert.equal(recipe.todo_substeps.length, 3);
    const substepNames = recipe.todo_substeps.map((s) => s.suffix);
    assert.ok(!substepNames.includes('Verify'));

    assert.equal(recipe.finalize.length, 3);
    const finalizeNames = recipe.finalize.map((s) => s.suffix);
    assert.ok(!finalizeNames.includes('Code Review'));
    assert.ok(!finalizeNames.includes('Final Verify'));
  });

  test('specify recipes still work without todo_substeps', () => {
    // Specify recipes don't have todo_substeps — should not break
    const recipe = parseRecipeYaml(VALID_RECIPE_YAML);
    assert.equal(recipe.todo_substeps, undefined);
    assert.equal(recipe.finalize, undefined);
  });
});

describe('parseRecipeYaml() — execute recipe validation errors', () => {
  test('throws if todo_substeps entry missing suffix', () => {
    const yaml = `
name: bad
blocks:
  - id: e
    type: engine
todo_substeps:
  - { type: dispatch_llm, agent: worker }
finalize:
  - { suffix: Report, type: deterministic }
`;
    assert.throws(
      () => parseRecipeYaml(yaml),
      /missing required field 'suffix'/,
    );
  });

  test('throws if substep has invalid type', () => {
    const yaml = `
name: bad
blocks:
  - id: e
    type: engine
todo_substeps:
  - { suffix: Worker, type: quantum, agent: worker }
finalize:
  - { suffix: Report, type: deterministic }
`;
    assert.throws(
      () => parseRecipeYaml(yaml),
      /invalid type 'quantum'/,
    );
  });

  test('throws if dispatch_llm missing agent', () => {
    const yaml = `
name: bad
blocks:
  - id: e
    type: engine
todo_substeps:
  - { suffix: Worker, type: dispatch_llm }
finalize:
  - { suffix: Report, type: deterministic }
`;
    assert.throws(
      () => parseRecipeYaml(yaml),
      /missing 'agent' field/,
    );
  });

  test('throws if todo_substeps present but finalize missing', () => {
    const yaml = `
name: bad
blocks:
  - id: e
    type: engine
todo_substeps:
  - { suffix: Worker, type: dispatch_llm, agent: worker }
`;
    assert.throws(
      () => parseRecipeYaml(yaml),
      /missing 'finalize'/,
    );
  });

  test('throws if finalize present but todo_substeps missing', () => {
    const yaml = `
name: bad
blocks:
  - id: e
    type: engine
finalize:
  - { suffix: Report, type: deterministic }
`;
    assert.throws(
      () => parseRecipeYaml(yaml),
      /missing 'todo_substeps'/,
    );
  });

  test('throws if todo_substeps is empty array', () => {
    const yaml = `
name: bad
blocks:
  - id: e
    type: engine
todo_substeps: []
finalize:
  - { suffix: Report, type: deterministic }
`;
    assert.throws(
      () => parseRecipeYaml(yaml),
      /must not be empty/,
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: loadRecipe() skillName requirement and recipesDir()
// ---------------------------------------------------------------------------

describe('loadRecipe() — skillName parameter enforcement', () => {
  test('loadRecipe without skillName throws', () => {
    assert.throws(
      () => loadRecipe('foo', {}),
      /skillName/,
    );
  });

  test('loadRecipe with undefined skillName throws', () => {
    assert.throws(
      () => loadRecipe('foo', {}, undefined),
      /skillName/,
    );
  });
});

describe('recipesDir() — path resolution', () => {
  test('recipesDir("specify") returns path ending with .claude/skills/specify/recipes', () => {
    const dir = recipesDir('specify');
    assert.ok(
      dir.endsWith('.claude/skills/specify/recipes'),
      `Expected path to end with .claude/skills/specify/recipes, got: ${dir}`,
    );
  });
});
