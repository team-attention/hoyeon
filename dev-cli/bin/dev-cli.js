#!/usr/bin/env node
/**
 * dev-cli — Development workflow CLI entry point
 * Subcommand routing without external CLI framework dependencies.
 */

const SUBCOMMANDS = {
  init: 'Initialize a new dev session with a recipe',
  next: 'Get next pending action for the current block',
  manifest: 'Show or update the session manifest',
  draft: 'Draft output for the current block',
  plan: 'Show the plan / recipe blocks for the session',
  step: 'Mark a step as complete or report step result',
  abort: 'Abort a session early with a reason',
  cleanup: 'Clean up session state and artifacts',
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
  console.log('  dev-cli next my-feature');
  console.log('  dev-cli step my-feature complete');
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
