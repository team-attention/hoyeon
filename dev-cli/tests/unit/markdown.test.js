/**
 * markdown.test.js — Unit tests for dev-cli/src/utils/markdown.js
 * Uses node:test and node:assert (no external test frameworks).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { parseSection, updateSection, listSections } from '../../src/utils/markdown.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const SIMPLE_CONTENT = `# Draft: test

## Intent

<!-- BEGIN:intent -->
_Not yet classified._
<!-- END:intent -->

## What & Why

<!-- BEGIN:what-why -->
_Not yet filled in._
<!-- END:what-why -->

## Findings

<!-- BEGIN:findings -->
_No findings yet._
<!-- END:findings -->
`;

const MULTI_SECTION_CONTENT = `# Test

<!-- BEGIN:alpha -->
Alpha content here
<!-- END:alpha -->

<!-- BEGIN:beta -->
Beta content here
<!-- END:beta -->

<!-- BEGIN:gamma -->
Gamma content here
<!-- END:gamma -->
`;

const EMPTY_SECTION_CONTENT = `# Empty Test

<!-- BEGIN:empty -->
<!-- END:empty -->
`;

// ---------------------------------------------------------------------------
// parseSection tests
// ---------------------------------------------------------------------------

describe('parseSection()', () => {
  test('extracts content between markers', () => {
    const result = parseSection(SIMPLE_CONTENT, 'intent');
    assert.ok(result !== null, 'Expected non-null result');
    assert.ok(result.includes('_Not yet classified._'));
  });

  test('returns null for missing section', () => {
    const result = parseSection(SIMPLE_CONTENT, 'nonexistent-section');
    assert.equal(result, null);
  });

  test('extracts what-why section content', () => {
    const result = parseSection(SIMPLE_CONTENT, 'what-why');
    assert.ok(result !== null);
    assert.ok(result.includes('_Not yet filled in._'));
  });

  test('extracts findings section content', () => {
    const result = parseSection(SIMPLE_CONTENT, 'findings');
    assert.ok(result !== null);
    assert.ok(result.includes('_No findings yet._'));
  });

  test('extracts correct section from multi-section content', () => {
    const alpha = parseSection(MULTI_SECTION_CONTENT, 'alpha');
    const beta = parseSection(MULTI_SECTION_CONTENT, 'beta');
    const gamma = parseSection(MULTI_SECTION_CONTENT, 'gamma');

    assert.ok(alpha.includes('Alpha content here'));
    assert.ok(beta.includes('Beta content here'));
    assert.ok(gamma.includes('Gamma content here'));
  });

  test('alpha content does not include beta content', () => {
    const alpha = parseSection(MULTI_SECTION_CONTENT, 'alpha');
    assert.ok(!alpha.includes('Beta content here'));
    assert.ok(!alpha.includes('Gamma content here'));
  });

  test('handles empty section', () => {
    const result = parseSection(EMPTY_SECTION_CONTENT, 'empty');
    assert.ok(result !== null);
    assert.equal(result.trim(), '');
  });

  test('handles content with newlines', () => {
    const content = `<!-- BEGIN:multi-line -->
Line 1
Line 2
Line 3
<!-- END:multi-line -->`;
    const result = parseSection(content, 'multi-line');
    assert.ok(result.includes('Line 1'));
    assert.ok(result.includes('Line 2'));
    assert.ok(result.includes('Line 3'));
  });

  test('handles section name with hyphens', () => {
    const content = `<!-- BEGIN:my-section-name -->
Content here
<!-- END:my-section-name -->`;
    const result = parseSection(content, 'my-section-name');
    assert.ok(result !== null);
    assert.ok(result.includes('Content here'));
  });
});

// ---------------------------------------------------------------------------
// updateSection tests
// ---------------------------------------------------------------------------

describe('updateSection()', () => {
  test('replaces content in a section', () => {
    const updated = updateSection(SIMPLE_CONTENT, 'intent', 'New intent content');

    assert.ok(updated.includes('New intent content'));
    assert.ok(!updated.includes('_Not yet classified._'));
  });

  test('preserves BEGIN and END markers', () => {
    const updated = updateSection(SIMPLE_CONTENT, 'intent', 'Updated content');

    assert.ok(updated.includes('<!-- BEGIN:intent -->'));
    assert.ok(updated.includes('<!-- END:intent -->'));
  });

  test('preserves other sections unchanged', () => {
    const updated = updateSection(SIMPLE_CONTENT, 'intent', 'Updated intent');

    // what-why should be unchanged
    assert.ok(updated.includes('_Not yet filled in._'));
    // findings should be unchanged
    assert.ok(updated.includes('_No findings yet._'));
  });

  test('returns full updated markdown', () => {
    const updated = updateSection(SIMPLE_CONTENT, 'intent', 'New content');

    // Should still contain the full document
    assert.ok(updated.includes('# Draft: test'));
    assert.ok(updated.includes('## Intent'));
    assert.ok(updated.includes('## What & Why'));
  });

  test('throws for non-existent section', () => {
    assert.throws(
      () => updateSection(SIMPLE_CONTENT, 'does-not-exist', 'content'),
      /not found/i,
    );
  });

  test('handles empty new content', () => {
    const updated = updateSection(SIMPLE_CONTENT, 'intent', '');
    assert.ok(updated.includes('<!-- BEGIN:intent -->'));
    assert.ok(updated.includes('<!-- END:intent -->'));
    // Original content should be gone
    assert.ok(!updated.includes('_Not yet classified._'));
  });

  test('handles multiline new content', () => {
    const newContent = 'Line 1\nLine 2\nLine 3';
    const updated = updateSection(SIMPLE_CONTENT, 'intent', newContent);

    assert.ok(updated.includes('Line 1'));
    assert.ok(updated.includes('Line 2'));
    assert.ok(updated.includes('Line 3'));
  });

  test('can update multiple sections sequentially', () => {
    let updated = updateSection(SIMPLE_CONTENT, 'intent', 'Updated intent');
    updated = updateSection(updated, 'what-why', 'Updated what-why');
    updated = updateSection(updated, 'findings', 'Updated findings');

    assert.ok(updated.includes('Updated intent'));
    assert.ok(updated.includes('Updated what-why'));
    assert.ok(updated.includes('Updated findings'));
  });

  test('updated section is parseable by parseSection', () => {
    const updated = updateSection(SIMPLE_CONTENT, 'intent', 'Parsed back correctly');
    const parsed = parseSection(updated, 'intent');

    assert.ok(parsed !== null);
    assert.ok(parsed.includes('Parsed back correctly'));
  });
});

// ---------------------------------------------------------------------------
// listSections tests
// ---------------------------------------------------------------------------

describe('listSections()', () => {
  test('returns all section names in order', () => {
    const sections = listSections(SIMPLE_CONTENT);

    assert.ok(Array.isArray(sections));
    assert.ok(sections.includes('intent'));
    assert.ok(sections.includes('what-why'));
    assert.ok(sections.includes('findings'));
  });

  test('returns sections in document order', () => {
    const sections = listSections(MULTI_SECTION_CONTENT);

    assert.equal(sections[0], 'alpha');
    assert.equal(sections[1], 'beta');
    assert.equal(sections[2], 'gamma');
  });

  test('returns empty array for content with no sections', () => {
    const sections = listSections('# Just a title\n\nSome content.');
    assert.deepEqual(sections, []);
  });

  test('returns empty array for empty string', () => {
    const sections = listSections('');
    assert.deepEqual(sections, []);
  });

  test('handles section names with hyphens', () => {
    const content = `<!-- BEGIN:what-why -->
Content
<!-- END:what-why -->`;
    const sections = listSections(content);
    assert.ok(sections.includes('what-why'));
  });

  test('returns correct count of sections', () => {
    const sections = listSections(MULTI_SECTION_CONTENT);
    assert.equal(sections.length, 3);
  });

  test('counts section in empty document correctly', () => {
    const sections = listSections(EMPTY_SECTION_CONTENT);
    assert.equal(sections.length, 1);
    assert.equal(sections[0], 'empty');
  });

  test('works with full DRAFT.md template sections', () => {
    const fullTemplate = `# Draft: test

<!-- BEGIN:meta -->content<!-- END:meta -->
<!-- BEGIN:intent -->content<!-- END:intent -->
<!-- BEGIN:what-why -->content<!-- END:what-why -->
<!-- BEGIN:boundaries -->content<!-- END:boundaries -->
<!-- BEGIN:criteria -->content<!-- END:criteria -->
<!-- BEGIN:decisions -->content<!-- END:decisions -->
<!-- BEGIN:findings -->content<!-- END:findings -->
<!-- BEGIN:questions -->content<!-- END:questions -->
<!-- BEGIN:direction -->content<!-- END:direction -->
<!-- BEGIN:assumptions -->content<!-- END:assumptions -->
`;
    const sections = listSections(fullTemplate);

    const expected = [
      'meta', 'intent', 'what-why', 'boundaries', 'criteria',
      'decisions', 'findings', 'questions', 'direction', 'assumptions',
    ];

    assert.equal(sections.length, expected.length);
    for (const name of expected) {
      assert.ok(sections.includes(name), `Expected '${name}' in sections`);
    }
  });
});

// ---------------------------------------------------------------------------
// Edge case tests
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  test('parseSection: handles content with only markers and no content', () => {
    const content = '<!-- BEGIN:empty --><!-- END:empty -->';
    const result = parseSection(content, 'empty');
    assert.ok(result !== null);
    assert.equal(result, '');
  });

  test('updateSection: handles content with special characters', () => {
    const content = `<!-- BEGIN:test -->
old
<!-- END:test -->`;
    const newContent = 'Content with **bold** and _italic_ and `code`';
    const updated = updateSection(content, 'test', newContent);
    assert.ok(updated.includes('**bold**'));
    assert.ok(updated.includes('_italic_'));
    assert.ok(updated.includes('`code`'));
  });

  test('parseSection: section names are case-sensitive', () => {
    const content = `<!-- BEGIN:Intent -->
Content
<!-- END:Intent -->`;
    // Lowercase should not match uppercase
    const lowerResult = parseSection(content, 'intent');
    assert.equal(lowerResult, null);

    // Exact case should match
    const upperResult = parseSection(content, 'Intent');
    assert.ok(upperResult !== null);
  });
});
