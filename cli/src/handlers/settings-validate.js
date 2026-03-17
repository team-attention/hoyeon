import { readFileSync, existsSync, accessSync, constants } from 'fs';
import { resolve, dirname, join } from 'path';

const SETTINGS_HELP = `
Usage:
  hoyeon-cli settings validate   Validate .claude/settings.json hook configuration

Options:
  --help, -h    Show this help message

Examples:
  hoyeon-cli settings validate
`;

const VALID_EVENT_TYPES = new Set([
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Stop',
]);

function findSettingsJson(startDir) {
  let dir = startDir;

  while (true) {
    const candidate = join(dir, '.claude', 'settings.json');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  return null;
}

function collectHookCommands(hooks) {
  // Returns array of { eventType, matcher, command }
  const entries = [];
  for (const [eventType, matchers] of Object.entries(hooks)) {
    if (!Array.isArray(matchers)) continue;
    for (const matcherObj of matchers) {
      const matcher = matcherObj.matcher ?? '';
      const hookList = matcherObj.hooks ?? [];
      for (const hook of hookList) {
        if (hook.type === 'command' && typeof hook.command === 'string') {
          entries.push({ eventType, matcher, command: hook.command });
        }
      }
    }
  }
  return entries;
}

async function handleValidate() {
  const startDir = process.cwd();
  const settingsPath = findSettingsJson(startDir);

  if (!settingsPath) {
    process.stderr.write('Error: .claude/settings.json not found (searched from cwd upward)\n');
    process.exit(1);
  }

  const projectRoot = dirname(dirname(settingsPath)); // settings.json is in .claude/

  let settings;
  try {
    settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  } catch (err) {
    process.stderr.write(`Error: failed to parse settings.json: ${err.message}\n`);
    process.exit(1);
  }

  const hooks = settings.hooks ?? {};
  const hookEntries = collectHookCommands(hooks);

  process.stdout.write(`Settings: ${settingsPath}\n`);
  process.stdout.write(`Project root: ${projectRoot}\n\n`);

  let hasFailure = false;

  // Check 1: Path existence
  process.stdout.write('Check 1: Hook script path existence\n');
  const missingPaths = [];
  for (const { eventType, matcher, command } of hookEntries) {
    const absPath = resolve(projectRoot, command);
    if (!existsSync(absPath)) {
      missingPaths.push({ eventType, matcher, command, absPath });
    }
  }
  if (missingPaths.length === 0) {
    process.stdout.write('  PASS: All hook script paths exist\n');
  } else {
    hasFailure = true;
    process.stdout.write(`  FAIL: ${missingPaths.length} missing path(s)\n`);
    for (const { eventType, command, absPath } of missingPaths) {
      process.stdout.write(`    [${eventType}] ${command}\n`);
      process.stdout.write(`      -> ${absPath} (not found)\n`);
    }
  }

  // Check 2: Executable bit
  process.stdout.write('\nCheck 2: Hook script executable bit\n');
  const nonExecutable = [];
  for (const { eventType, matcher, command } of hookEntries) {
    const absPath = resolve(projectRoot, command);
    if (!existsSync(absPath)) continue; // already reported in Check 1
    try {
      accessSync(absPath, constants.X_OK);
    } catch {
      nonExecutable.push({ eventType, command, absPath });
    }
  }
  if (nonExecutable.length === 0) {
    process.stdout.write('  PASS: All hook scripts are executable\n');
  } else {
    hasFailure = true;
    process.stdout.write(`  FAIL: ${nonExecutable.length} non-executable script(s)\n`);
    for (const { eventType, command } of nonExecutable) {
      process.stdout.write(`    [${eventType}] ${command} (not executable)\n`);
    }
  }

  // Check 3: Valid event types
  process.stdout.write('\nCheck 3: Valid event types\n');
  const invalidEventTypes = [];
  for (const eventType of Object.keys(hooks)) {
    if (!VALID_EVENT_TYPES.has(eventType)) {
      invalidEventTypes.push(eventType);
    }
  }
  if (invalidEventTypes.length === 0) {
    process.stdout.write('  PASS: All event types are valid\n');
  } else {
    hasFailure = true;
    process.stdout.write(`  FAIL: ${invalidEventTypes.length} invalid event type(s)\n`);
    for (const et of invalidEventTypes) {
      process.stdout.write(`    '${et}' is not a valid event type\n`);
    }
    process.stdout.write(`  Valid event types: ${[...VALID_EVENT_TYPES].join(', ')}\n`);
  }

  // Check 4: Duplicate scripts in same event+matcher
  process.stdout.write('\nCheck 4: Duplicate scripts in same event+matcher\n');
  const seen = new Map();
  const duplicates = [];
  for (const { eventType, matcher, command } of hookEntries) {
    const key = `${eventType}::${matcher}`;
    if (!seen.has(key)) {
      seen.set(key, new Set());
    }
    const commandSet = seen.get(key);
    if (commandSet.has(command)) {
      duplicates.push({ eventType, matcher, command });
    } else {
      commandSet.add(command);
    }
  }
  if (duplicates.length === 0) {
    process.stdout.write('  PASS: No duplicate scripts in same event+matcher\n');
  } else {
    hasFailure = true;
    process.stdout.write(`  FAIL: ${duplicates.length} duplicate(s) found\n`);
    for (const { eventType, matcher, command } of duplicates) {
      const matcherLabel = matcher ? `matcher="${matcher}"` : 'matcher=""';
      process.stdout.write(`    [${eventType}][${matcherLabel}] ${command}\n`);
    }
  }

  process.stdout.write('\n');
  if (hasFailure) {
    process.stdout.write('Result: FAIL\n');
    process.exit(1);
  } else {
    process.stdout.write('Result: PASS\n');
    process.exit(0);
  }
}

export default async function settings(args) {
  const subcommand = args[0];

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    process.stdout.write(SETTINGS_HELP);
    process.exit(0);
  }

  if (subcommand === 'validate') {
    await handleValidate();
  } else {
    process.stderr.write(`Error: unknown settings subcommand '${subcommand}'\n`);
    process.stderr.write(`Run 'hoyeon-cli settings --help' for usage.\n`);
    process.exit(1);
  }
}
