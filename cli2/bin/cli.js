import reqHandler from '../src/commands/req.js';
import planHandler from '../src/commands/plan.js';

const USAGE = `
hoyeon-cli2 — CLI for specify2 + blueprint workflow

Usage:
  hoyeon-cli2 <group> <command> [options]

Groups:
  req     requirements.md scaffolding (init only — cli2 does not parse .md)
  plan    plan.json operations (init, merge, get, list, task, validate)

Options:
  --help, -h    Show this help message
  --version     Show version

Examples:
  hoyeon-cli2 req init .hoyeon/specs/my-spec --type greenfield
  hoyeon-cli2 plan init .hoyeon/specs/my-spec --type greenfield
  hoyeon-cli2 plan merge .hoyeon/specs/my-spec --json '{"tasks":[...]}'
  hoyeon-cli2 plan task .hoyeon/specs/my-spec --status T1=running
  hoyeon-cli2 plan validate .hoyeon/specs/my-spec
`;

const GROUPS = {
  req: reqHandler,
  plan: planHandler,
};

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  if (args[0] === '--version') {
    const version = typeof __CLI_VERSION__ !== 'undefined' ? __CLI_VERSION__ : 'dev';
    process.stdout.write(`hoyeon-cli2 v${version}\n`);
    process.exit(0);
  }

  const group = args[0];

  if (!Object.prototype.hasOwnProperty.call(GROUPS, group)) {
    process.stderr.write(`Error: unknown group '${group}'\n`);
    process.stderr.write(`Run 'hoyeon-cli2 --help' for usage.\n`);
    process.exit(1);
  }

  await GROUPS[group](args.slice(1));
}

main().catch((err) => {
  process.stderr.write(`Unexpected error: ${err.message}\n`);
  process.exit(1);
});
