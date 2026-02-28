/**
 * handlers/draft.js — dev-cli draft <name> update|import|validate [options]
 *
 * Wraps draft operations from ../blocks/.
 *
 * For 'update':
 *   Option A (flags):  dev-cli draft <name> update --section <id> --data '<json>'
 *   Option B (stdin):  echo '{"section":"<id>","data":<value>}' | dev-cli draft <name> update
 */

import { draftUpdate } from '../blocks/draft-update.js';
import { draftImport } from '../blocks/draft-import.js';
import { draftValidate } from '../blocks/draft-validate.js';
import { draftShow } from '../blocks/draft-show.js';

function showUpdateUsage() {
  console.error(`Usage: dev-cli draft <name> update --section <id> --data '<json>'`);
  console.error(`   or: echo '{"section":"<id>","data":<value>}' | dev-cli draft <name> update`);
}

export default async function handler(args) {
  const name = args[0];
  const action = args[1]; // 'update', 'import', 'validate'
  if (!name || !action) {
    console.error('Usage: dev-cli draft <name> update|import|validate|show [options]');
    console.error('');
    console.error('Actions:');
    console.error('  update    Update a draft section (via --section/--data flags or stdin JSON)');
    console.error('  import    Import subagent findings into the draft');
    console.error('  validate  Validate draft completeness');
    console.error('  show      Show draft as structured JSON with fill status');
    process.exit(1);
  }

  let result;
  if (action === 'update') {
    let section;
    let data;

    // Try flags first: --section <id> --data '<json>'
    const sectionIdx = args.indexOf('--section');
    const dataIdx = args.indexOf('--data');

    if (sectionIdx >= 0 && args[sectionIdx + 1]) {
      section = args[sectionIdx + 1];
      if (dataIdx >= 0 && args[dataIdx + 1]) {
        try {
          data = JSON.parse(args[dataIdx + 1]);
        } catch (err) {
          console.error(`Error: --data value is not valid JSON: ${err.message}`);
          showUpdateUsage();
          process.exit(1);
        }
      }
      // --section without --data: data is optional (section can be a string value)
    } else if (sectionIdx >= 0) {
      console.error('Error: --section requires a value.');
      showUpdateUsage();
      process.exit(1);
    } else {
      // Fallback: read JSON from stdin
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString().trim();
      if (!raw) {
        console.error('Error: No input provided. Use --section/--data flags or pipe JSON to stdin.');
        showUpdateUsage();
        process.exit(1);
      }
      try {
        const parsed = JSON.parse(raw);
        section = parsed.section;
        data = parsed.data;
      } catch (err) {
        console.error(`Error: Invalid JSON from stdin: ${err.message}`);
        showUpdateUsage();
        process.exit(1);
      }
    }

    if (!section) {
      console.error('Error: "section" is required (via --section flag or stdin JSON "section" field).');
      showUpdateUsage();
      process.exit(1);
    }
    result = await draftUpdate(name, section, data);
  } else if (action === 'import') {
    result = await draftImport(name);
    // Display warnings to stderr; keep them in JSON result for programmatic access
    if (result.warnings && result.warnings.length > 0) {
      for (const w of result.warnings) console.warn(`Warning: ${w}`);
    }
  } else if (action === 'validate') {
    result = await draftValidate(name);
  } else if (action === 'show') {
    result = draftShow(name);
  } else {
    console.error(`Unknown draft action: '${action}'. Use 'update', 'import', 'validate', or 'show'.`);
    console.error('');
    console.error('Usage: dev-cli draft <name> update|import|validate|show [options]');
    process.exit(1);
  }
  console.log(JSON.stringify(result, null, 2));
}
