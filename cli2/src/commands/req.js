import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { parseArgs } from '../lib/args.js';
import { specPaths } from '../lib/json-io.js';

const HELP = `
Usage:
  hoyeon-cli2 req <command> [options]

Commands:
  init <spec_dir> --type <greenfield|feature|refactor|bugfix> [--goal "<text>"]
      Create spec_dir + requirements.md template for /specify2 to fill in.

Options:
  --help, -h   This help.

Note:
  cli2 does not parse requirements.md. Reading and understanding that file is
  the LLM's job (inside /specify2 and /blueprint). cli2 only manages plan.json.
`;

function template(type, goal) {
  return `---
type: ${type}
goal: "${goal || '<WRITE YOUR GOAL HERE>'}"
non_goals: []
---

# Requirements

<!-- /specify2 fills this in. Parent reqs use '## R-X<num>:' and sub-reqs use '#### R-X.Y:' with given/when/then fields. -->
`;
}

async function cmdInit(args) {
  const { _: [specDir], type, goal } = parseArgs(args);
  if (!specDir) die('Error: <spec_dir> required');
  if (!type) die('Error: --type required (greenfield|feature|refactor|bugfix)');
  const valid = ['greenfield', 'feature', 'refactor', 'bugfix'];
  if (!valid.includes(type)) die(`Error: --type must be one of ${valid.join('|')}`);

  const dir = resolve(specDir);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const mdPath = specPaths(dir).requirements;
  if (existsSync(mdPath)) die(`Error: ${mdPath} already exists`);

  writeFileSync(mdPath, template(type, goal === true ? undefined : goal), 'utf8');
  process.stdout.write(`Wrote ${mdPath}\n`);
}

function die(msg) { process.stderr.write(msg + '\n'); process.exit(1); }

const COMMANDS = { init: cmdInit };

export default async function req(args) {
  const sub = args[0];
  if (!sub || sub === '--help' || sub === '-h') {
    process.stdout.write(HELP);
    return;
  }
  const fn = COMMANDS[sub];
  if (!fn) die(`Error: unknown req command '${sub}'. Run 'hoyeon-cli2 req --help'.`);
  await fn(args.slice(1));
}
