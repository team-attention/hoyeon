import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SPEC_HELP = `
Usage:
  dev-cli spec validate <path>             Validate a spec.json file against the schema
  dev-cli spec amend --reason <feedback-id> --spec <path>  Amend spec.json based on feedback

Options:
  --help, -h    Show this help message

Examples:
  dev-cli spec validate ./spec.json
  dev-cli spec validate /path/to/spec.json
  dev-cli spec amend --reason fb-001 --spec ./spec.json
`;

function loadSchema() {
  const schemaPath = resolve(__dirname, '../../schemas/dev-spec-v4.schema.json');
  const raw = readFileSync(schemaPath, 'utf8');
  return JSON.parse(raw);
}

async function handleValidate(args) {
  const filePath = args[0];

  if (!filePath) {
    process.stderr.write('Error: missing <path> argument\n');
    process.stderr.write('Usage: dev-cli spec validate <path>\n');
    process.exit(1);
  }

  let data;
  try {
    const raw = readFileSync(filePath, 'utf8');
    data = JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      process.stderr.write(`Error: file not found: ${filePath}\n`);
    } else if (err instanceof SyntaxError) {
      process.stderr.write(`Error: invalid JSON in ${filePath}: ${err.message}\n`);
    } else {
      process.stderr.write(`Error: could not read file: ${err.message}\n`);
    }
    process.exit(1);
  }

  let schema;
  try {
    schema = loadSchema();
  } catch (err) {
    process.stderr.write(`Error: could not load schema: ${err.message}\n`);
    process.exit(1);
  }

  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);

  const validate = ajv.compile(schema);
  const valid = validate(data);

  if (valid) {
    process.stdout.write(JSON.stringify({ valid: true, errors: [] }) + '\n');
    process.exit(0);
  } else {
    const errors = validate.errors.map((e) => ({
      instancePath: e.instancePath,
      schemaPath: e.schemaPath,
      keyword: e.keyword,
      message: e.message,
      params: e.params,
    }));

    process.stdout.write(JSON.stringify({ valid: false, errors }) + '\n');
    process.stderr.write('Validation failed:\n');
    for (const e of validate.errors) {
      const path = e.instancePath || '(root)';
      process.stderr.write(`  ${path}: ${e.message}\n`);
    }
    process.exit(1);
  }
}

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

async function handleAmend(args) {
  const parsed = parseArgs(args);

  if (!parsed.reason) {
    process.stderr.write('Error: --reason <feedback-id> is required\n');
    process.stderr.write('Usage: dev-cli spec amend --reason <feedback-id> --spec <path>\n');
    process.exit(1);
  }

  if (!parsed.spec) {
    process.stderr.write('Error: --spec <path> is required\n');
    process.stderr.write('Usage: dev-cli spec amend --reason <feedback-id> --spec <path>\n');
    process.exit(1);
  }

  const specPath = resolve(parsed.spec);
  const feedbackId = parsed.reason;

  // Derive feedback file path relative to spec directory
  const specDir = dirname(specPath);
  const feedbackPath = resolve(specDir, 'feedback', `${feedbackId}.json`);

  let feedbackData;
  try {
    const raw = readFileSync(feedbackPath, 'utf8');
    feedbackData = JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      process.stderr.write(`Error: feedback file not found: ${feedbackPath}\n`);
    } else if (err instanceof SyntaxError) {
      process.stderr.write(`Error: invalid JSON in feedback file: ${err.message}\n`);
    } else {
      process.stderr.write(`Error: could not read feedback file: ${err.message}\n`);
    }
    process.exit(1);
  }

  let specData;
  try {
    const raw = readFileSync(specPath, 'utf8');
    specData = JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      process.stderr.write(`Error: spec file not found: ${specPath}\n`);
    } else if (err instanceof SyntaxError) {
      process.stderr.write(`Error: invalid JSON in spec file: ${err.message}\n`);
    } else {
      process.stderr.write(`Error: could not read spec file: ${err.message}\n`);
    }
    process.exit(1);
  }

  // Display the feedback message
  process.stdout.write(`Feedback (${feedbackId}): ${feedbackData.message}\n`);

  // Phase 1: update meta.updated_at as a placeholder for future amendment logic
  if (!specData.meta) {
    specData.meta = {};
  }
  specData.meta.updated_at = new Date().toISOString();

  try {
    writeFileSync(specPath, JSON.stringify(specData, null, 2), 'utf8');
  } catch (err) {
    process.stderr.write(`Error: could not write spec file: ${err.message}\n`);
    process.exit(1);
  }

  process.stdout.write(`Spec amended: ${specPath}\n`);
  process.stdout.write(`Note: actual spec modification logic will be added in later phases\n`);
  process.exit(0);
}

export default async function spec(args) {
  const subcommand = args[0];

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    process.stdout.write(SPEC_HELP);
    process.exit(0);
  }

  if (subcommand === 'validate') {
    await handleValidate(args.slice(1));
  } else if (subcommand === 'amend') {
    await handleAmend(args.slice(1));
  } else {
    process.stderr.write(`Error: unknown spec subcommand '${subcommand}'\n`);
    process.stderr.write(`Run 'dev-cli spec --help' for usage.\n`);
    process.exit(1);
  }
}
