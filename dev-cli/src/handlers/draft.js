/**
 * handlers/draft.js — dev-cli draft <name> update|import|validate [options]
 *
 * Wraps draft operations from ../blocks/.
 *
 * For 'update': reads JSON from stdin. Expected format: { "section": "<id>", "data": <value> }
 */

import { draftUpdate } from '../blocks/draft-update.js';
import { draftImport } from '../blocks/draft-import.js';
import { draftValidate } from '../blocks/draft-validate.js';

export default async function handler(args) {
  const name = args[0];
  const action = args[1]; // 'update', 'import', 'validate'
  if (!name || !action) {
    console.error('Usage: dev-cli draft <name> update|import|validate [options]');
    process.exit(1);
  }

  let result;
  if (action === 'update') {
    // Reads JSON from stdin for section data.
    // Expected format: { "section": "<sectionId>", "data": <value> }
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const parsed = JSON.parse(Buffer.concat(chunks).toString());
    const section = parsed.section;
    const data = parsed.data;
    if (!section) {
      console.error('Error: stdin JSON must include a "section" field.');
      process.exit(1);
    }
    result = await draftUpdate(name, section, data);
  } else if (action === 'import') {
    result = await draftImport(name);
  } else if (action === 'validate') {
    result = await draftValidate(name);
  } else {
    console.error(`Unknown draft action: ${action}. Use 'update', 'import', or 'validate'.`);
    process.exit(1);
  }
  console.log(JSON.stringify(result, null, 2));
}
