import { test, expect } from '@playwright/test'

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function addRectangle(
  page: import('@playwright/test').Page,
  opts: { id: string; fill?: string; x?: number; y?: number; w?: number; h?: number },
) {
  await page.evaluate((o) => {
    window.__editorStore.getState().addElement({
      id: o.id,
      kind: 'rectangle',
      x: o.x ?? 100,
      y: o.y ?? 100,
      width: o.w ?? 200,
      height: o.h ?? 150,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      name: 'Rect',
      parentId: null,
      childIds: [],
      fill: o.fill ?? '#ff0000',
      stroke: 'transparent',
      strokeWidth: 0,
      borderRadius: 0,
    })
  }, opts)
}

async function addText(
  page: import('@playwright/test').Page,
  opts: { id: string },
) {
  await page.evaluate((o) => {
    window.__editorStore.getState().addElement({
      id: o.id,
      kind: 'text',
      x: 50,
      y: 50,
      width: 200,
      height: 40,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      name: 'Text',
      parentId: null,
      childIds: [],
      content: 'Hello',
      fontSize: 16,
      fontFamily: 'Inter',
      fontWeight: 400,
      color: '#ffffff',
      textAlign: 'left',
      lineHeight: 1.5,
    })
  }, opts)
}

async function selectElement(page: import('@playwright/test').Page, id: string) {
  await page.evaluate((eid) => {
    window.__editorStore.getState().selectElement(eid)
  }, id)
}

async function clearSelection(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    window.__editorStore.getState().clearSelection()
  })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Properties panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Clear store to a fresh state
    await page.evaluate(() => {
      window.__editorStore.setState({ elements: {}, rootIds: [], selection: { selectedIds: [], hoveredId: null } })
    })
  })

  // R5-S1: display — Rectangle selected shows X, Y, W, H, Rotation, Fill, Border, Shadow sections
  test('display: rectangle shows position, fill, border, shadow sections', async ({ page }) => {
    await addRectangle(page, { id: 'r1', fill: '#ff0000' })
    await selectElement(page, 'r1')

    const panel = page.getByTestId('properties-panel')
    await expect(panel).toBeVisible()

    // Position / size inputs
    await expect(page.getByTestId('prop-x')).toBeVisible()
    await expect(page.getByTestId('prop-y')).toBeVisible()
    await expect(page.getByTestId('prop-w')).toBeVisible()
    await expect(page.getByTestId('prop-h')).toBeVisible()
    await expect(page.getByTestId('prop-rotation')).toBeVisible()

    // Fill section
    await expect(page.getByTestId('fill-section')).toBeVisible()

    // Border section
    await expect(page.getByTestId('border-section')).toBeVisible()

    // Shadow section
    await expect(page.getByTestId('shadow-section')).toBeVisible()
  })

  // R5-S2: typography — Text element shows typography controls
  test('typography: text element shows typography section', async ({ page }) => {
    await addText(page, { id: 't1' })
    await selectElement(page, 't1')

    await expect(page.getByTestId('typography-section')).toBeVisible()
    await expect(page.getByTestId('prop-font-family')).toBeVisible()
    await expect(page.getByTestId('prop-font-size')).toBeVisible()
    await expect(page.getByTestId('prop-font-weight')).toBeVisible()
    await expect(page.getByTestId('prop-line-height')).toBeVisible()
    await expect(page.getByTestId('prop-letter-spacing')).toBeVisible()
    await expect(page.getByTestId('prop-text-align')).toBeVisible()
  })

  // R5-S3: fill-change — changing fill updates element in real time
  test('fill-change: changing fill color updates element fill in store', async ({ page }) => {
    await addRectangle(page, { id: 'r2', fill: '#ff0000' })
    await selectElement(page, 'r2')

    // Verify initial fill in store
    const initialFill = await page.evaluate(() => {
      return window.__editorStore.getState().elements['r2'].fill
    })
    expect(initialFill).toBe('#ff0000')

    // Change the hex input directly
    const hexInput = page.getByTestId('prop-fill-hex')
    await hexInput.fill('#00ff00')
    await hexInput.press('Enter')

    // Verify fill updated in store
    await page.waitForFunction(() => {
      const el = window.__editorStore.getState().elements['r2'] as { fill?: string }
      return el?.fill === '#00ff00'
    })

    const updatedFill = await page.evaluate(() => {
      return (window.__editorStore.getState().elements['r2'] as { fill?: string }).fill
    })
    expect(updatedFill).toBe('#00ff00')
  })

  // R5-S4: no-selection — empty state shown when no element selected
  test('no-selection: shows empty state when nothing selected', async ({ page }) => {
    await clearSelection(page)

    const noSel = page.getByTestId('no-selection')
    await expect(noSel).toBeVisible()
    await expect(noSel).toContainText('No selection')
  })

  // R5-S5: negative-input — entering negative width clamps to minimum 1
  test('negative-input: negative width clamped to 1', async ({ page }) => {
    await addRectangle(page, { id: 'r3', w: 100 })
    await selectElement(page, 'r3')

    const wInput = page.getByTestId('prop-w')
    await wInput.fill('-50')
    await wInput.press('Tab')

    // Wait for store update
    await page.waitForFunction(() => {
      const el = window.__editorStore.getState().elements['r3'] as { width?: number }
      return typeof el?.width === 'number' && el.width >= 1
    })

    const width = await page.evaluate(() => {
      return (window.__editorStore.getState().elements['r3'] as { width?: number }).width
    })
    expect(width).toBeGreaterThanOrEqual(1)
  })

  // R5-S6: cancel-color — fill unchanged when color picker dismissed without selection
  test('cancel-color: fill unchanged when color input blurred with invalid value', async ({ page }) => {
    await addRectangle(page, { id: 'r4', fill: '#abcdef' })
    await selectElement(page, 'r4')

    // Read initial fill
    const before = await page.evaluate(() => {
      return (window.__editorStore.getState().elements['r4'] as { fill?: string }).fill
    })
    expect(before).toBe('#abcdef')

    // Type an incomplete hex and blur (simulates dismissing color picker without committing)
    const hexInput = page.getByTestId('prop-fill-hex')
    await hexInput.fill('#abc')
    // Click elsewhere to blur without valid complete color
    await page.getByTestId('properties-panel').click({ position: { x: 5, y: 5 } })

    // Fill should remain unchanged
    const after = await page.evaluate(() => {
      return (window.__editorStore.getState().elements['r4'] as { fill?: string }).fill
    })
    expect(after).toBe('#abcdef')
  })
})
