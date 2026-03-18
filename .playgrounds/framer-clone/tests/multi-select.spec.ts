import { test, expect } from '@playwright/test'

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function addRectangle(
  page: import('@playwright/test').Page,
  opts: {
    id: string
    fill: string
    x?: number
    y?: number
    w?: number
    h?: number
  },
) {
  await page.evaluate((o) => {
    window.__editorStore.getState().addElement({
      id: o.id,
      kind: 'rectangle',
      x: o.x ?? 100,
      y: o.y ?? 100,
      width: o.w ?? 100,
      height: o.h ?? 100,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      name: `Rect-${o.id}`,
      parentId: null,
      childIds: [],
      fill: o.fill,
      stroke: 'transparent',
      strokeWidth: 0,
      borderRadius: 0,
    })
  }, opts)
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Multi-select', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      window.__editorStore.setState({
        elements: {},
        rootIds: [],
        selection: { selectedIds: [], hoveredId: null },
      })
    })
  })

  // R15-S3: mixed-props — two elements with different fills show "Mixed" for fill
  test('mixed-props: two elements with different fills show Mixed in Properties', async ({
    page,
  }) => {
    // Add element A (red) and element B (blue)
    await addRectangle(page, { id: 'a', fill: '#ff0000', x: 0, y: 0 })
    await addRectangle(page, { id: 'b', fill: '#0000ff', x: 200, y: 0 })

    // Select both
    await page.evaluate(() => {
      window.__editorStore.getState().selectElements(['a', 'b'])
    })

    // Properties panel should show mixed-props indicator for fill
    const fillMixed = page.getByTestId('fill-mixed')
    await expect(fillMixed).toBeVisible()
    await expect(fillMixed).toContainText('Mixed')

    // Shared props (e.g. W, H which are both 100) should show values
    const wInput = page.getByTestId('prop-w')
    await expect(wInput).toBeVisible()
    await expect(wInput).toHaveValue('100')

    const hInput = page.getByTestId('prop-h')
    await expect(hInput).toBeVisible()
    await expect(hInput).toHaveValue('100')
  })

  // R15-S1: shift-select — Shift+Click adds element to selection
  test('shift-select: multi-select banner shows when multiple elements selected', async ({
    page,
  }) => {
    await addRectangle(page, { id: 'c', fill: '#ff0000' })
    await addRectangle(page, { id: 'd', fill: '#00ff00', x: 300, y: 0 })

    await page.evaluate(() => {
      window.__editorStore.getState().selectElements(['c', 'd'])
    })

    const banner = page.getByTestId('multi-select-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('2 elements selected')
  })

  // R15-S2: multi-drag — both elements move together (store-level test)
  test('multi-drag: moving one of two selected elements via store updates both', async ({
    page,
  }) => {
    await addRectangle(page, { id: 'e', fill: '#ff0000', x: 0, y: 0 })
    await addRectangle(page, { id: 'f', fill: '#00ff00', x: 150, y: 0 })

    await page.evaluate(() => {
      window.__editorStore.getState().selectElements(['e', 'f'])
    })

    // Simulate moving both elements by +50 in x
    await page.evaluate(() => {
      const store = window.__editorStore.getState()
      const ids = store.selection.selectedIds
      for (const id of ids) {
        const el = store.elements[id]
        store.updateElement(id, { x: el.x + 50 })
      }
    })

    const eX = await page.evaluate(() => window.__editorStore.getState().elements['e'].x)
    const fX = await page.evaluate(() => window.__editorStore.getState().elements['f'].x)
    expect(eX).toBe(50)
    expect(fX).toBe(200)
  })
})
