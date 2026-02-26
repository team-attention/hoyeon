#!/usr/bin/env node
/**
 * dev-cli — Development workflow CLI entry point
 * Subcommand routing without external CLI framework dependencies.
 */

const SUBCOMMANDS = {
  init: 'Initialize a new dev session with a recipe',
  manifest: 'Show or update the session manifest',
  draft: 'Draft output for the current block',
  plan: 'Show the plan / recipe blocks for the session',
  findings: 'Aggregate findings and analysis files as structured JSON',
  abort: 'Abort a session early with a reason',
  cleanup: 'Clean up session state and artifacts',
  'plan-to-tasks': 'Convert plan into TaskCreate-compatible JSON',
  'build-prompt': 'Build a prompt for a specific TODO and type',
  wrapup: 'Write execution context (outputs, learnings, issues)',
  checkpoint: 'Mark a TODO as checked in PLAN.md',
  triage: 'Triage a verify result into a disposition',
  finalize: 'Mark engine finalize as done (signals stop hook)',
  'persist-result': 'Persist worker result for compact recovery',
  'step-done': 'Record step completion in state.json (idempotent)',
  'chain-init': 'Initialize a new action chain from !keyword',
  'chain-persist': 'Persist chain step result (stdin JSON)',
  'chain-complete': 'Mark chain as completed or abandoned',
  'chain-status': 'Show active chain status for a session',
  'chain-gc': 'Garbage collect old completed chains',
};

function printHelp() {
  console.log('Usage: dev-cli <subcommand> [options]');
  console.log('');
  console.log('Subcommands:');
  const maxLen = Math.max(...Object.keys(SUBCOMMANDS).map((k) => k.length));
  for (const [cmd, desc] of Object.entries(SUBCOMMANDS)) {
    console.log(`  ${cmd.padEnd(maxLen + 2)}${desc}`);
  }
  console.log('');
  console.log('Options:');
  console.log('  --help    Show this help message and exit');
  console.log('');
  console.log('Examples:');
  console.log('  dev-cli init my-feature --quick --autopilot');
  console.log('  dev-cli plan-to-tasks my-feature --mode standard');
  console.log('  dev-cli build-prompt my-feature --todo todo-1 --type worker');
  console.log('  dev-cli wrapup my-feature --todo todo-1');
  console.log('  dev-cli checkpoint my-feature --todo todo-1');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const subcommand = args[0];

  if (!SUBCOMMANDS[subcommand]) {
    console.error(`Error: Unknown subcommand '${subcommand}'`);
    console.error('');
    console.error('Run "dev-cli --help" to see available subcommands.');
    process.exit(1);
  }

  // Dynamically import the handler for the subcommand.
  // Handlers live in src/handlers/<subcommand>.js (implemented in later TODOs).
  try {
    const handlerPath = new URL(`../src/handlers/${subcommand}.js`, import.meta.url);
    const { default: handler } = await import(handlerPath);
    await handler(args.slice(1));
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND') {
      console.error(`Error: Handler for '${subcommand}' is not yet implemented.`);
      process.exit(2);
    }
    console.error(`Error: ${err.message}`);
    if (process.env.DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main();
