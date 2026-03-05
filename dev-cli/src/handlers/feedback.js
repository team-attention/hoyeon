import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';

const FEEDBACK_HELP = `
Usage:
  dev-cli feedback create "<message>" [--dir <path>]

Subcommands:
  create  Create a new feedback file

Options:
  --help, -h    Show this help message
  --dir         Directory to write feedback files (default: ./feedback)

Examples:
  dev-cli feedback create "Missing acceptance criteria for T3"
  dev-cli feedback create "Scope is too broad" --dir ./project/feedback
`;

function parseArgs(args) {
  const result = { _: [] };
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        result[key] = next;
        i += 2;
      } else {
        result[key] = true;
        i += 1;
      }
    } else {
      result._.push(arg);
      i += 1;
    }
  }
  return result;
}

function nextFeedbackId(feedbackDir) {
  if (!existsSync(feedbackDir)) {
    return 'fb-001';
  }

  const files = readdirSync(feedbackDir)
    .filter((f) => /^fb-\d{3}\.json$/.test(f))
    .sort();

  if (files.length === 0) {
    return 'fb-001';
  }

  const last = files[files.length - 1];
  const match = last.match(/^fb-(\d{3})\.json$/);
  if (!match) {
    return 'fb-001';
  }

  const nextNum = parseInt(match[1], 10) + 1;
  return `fb-${String(nextNum).padStart(3, '0')}`;
}

async function handleCreate(args) {
  const parsed = parseArgs(args);

  const message = parsed._[0];
  if (!message) {
    process.stderr.write('Error: <message> is required\n');
    process.stderr.write('Usage: dev-cli feedback create "<message>" [--dir <path>]\n');
    process.exit(1);
  }

  const feedbackDir = parsed.dir ? resolve(parsed.dir) : resolve('feedback');

  try {
    mkdirSync(feedbackDir, { recursive: true });
  } catch (err) {
    process.stderr.write(`Error: could not create feedback directory: ${err.message}\n`);
    process.exit(1);
  }

  const id = nextFeedbackId(feedbackDir);
  const feedbackPath = resolve(feedbackDir, `${id}.json`);

  const feedbackData = {
    id,
    message,
    created_at: new Date().toISOString(),
    status: 'open',
  };

  try {
    writeFileSync(feedbackPath, JSON.stringify(feedbackData, null, 2), 'utf8');
  } catch (err) {
    process.stderr.write(`Error: could not write feedback file: ${err.message}\n`);
    process.exit(1);
  }

  process.stdout.write(`Feedback created: ${feedbackPath}\n`);
  process.stdout.write(`ID: ${id}\n`);
  process.exit(0);
}

export default async function feedback(args) {
  const subcommand = args[0];

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    process.stdout.write(FEEDBACK_HELP);
    process.exit(0);
  }

  if (subcommand === 'create') {
    await handleCreate(args.slice(1));
  } else {
    process.stderr.write(`Error: unknown feedback subcommand '${subcommand}'\n`);
    process.stderr.write(`Run 'dev-cli feedback --help' for usage.\n`);
    process.exit(1);
  }
}
