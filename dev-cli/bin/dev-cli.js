#!/usr/bin/env node

const USAGE = `
dev-cli — Developer workflow CLI

Usage:
  dev-cli <subcommand> [options]

Subcommands:
  spec      Manage spec/plan state
  state     Read or update workflow state
  feedback  Manage feedback files

Options:
  --help, -h    Show this help message
  --version     Show version

Examples:
  dev-cli spec --help
  dev-cli state --help
  dev-cli feedback --help
`;

const SUBCOMMANDS = {
  spec: () => import('../src/handlers/spec.js'),
  state: () => import('../src/handlers/state.js'),
  feedback: () => import('../src/handlers/feedback.js'),
};

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  if (args[0] === '--version') {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const pkg = require('../package.json');
    process.stdout.write(`dev-cli v${pkg.version}\n`);
    process.exit(0);
  }

  const subcommand = args[0];

  if (!Object.prototype.hasOwnProperty.call(SUBCOMMANDS, subcommand)) {
    process.stderr.write(`Error: unknown subcommand '${subcommand}'\n`);
    process.stderr.write(`Run 'dev-cli --help' for usage.\n`);
    process.exit(1);
  }

  const mod = await SUBCOMMANDS[subcommand]();
  await mod.default(args.slice(1));
}

main().catch((err) => {
  process.stderr.write(`Unexpected error: ${err.message}\n`);
  process.exit(1);
});
