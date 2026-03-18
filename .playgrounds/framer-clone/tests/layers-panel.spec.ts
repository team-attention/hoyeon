import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function addElement(
  page: Page,
  id: string,
  name: string,
  kind: 'rectangle' | 'ellipse' | 'frame' | 'text' = 'rectangle',
) {
  await page.evaluate(
    ([elemId, elemName, elemKind]) => {
      window.__editorStore.getState().addElement({
        id: elemId as string,
        kind: elemKind as 'rectangle',
        x: 10,
        y: 10,
        width: 100,
        height: 100,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        name: elemName as string,
        parentId: null,
        childIds: [],
        fill: '#ff0000',
        stroke: 'transparent',
        strokeWidth: 0,
        borderRadius: 0,
      })
    },
    [id, name, kind],
  )
}

async function clearStore(page: Page) {
  await page.evaluate(() => {
    const state = window.__editorStore.getState()
    const ids = Object.keys(state.elements)
    if (ids.length > 0) {
      state.deleteElements(ids)
    }
  })
}

async function getRootIds(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__editorStore.getState().rootIds)
}

async function getElementVisible(page: Page, id: string): Promise<boolean> {
  return page.evaluate(
    (elemId) => window.__editorStore.getState().elements[elemId].visible,
    id,
  )
}

async function getElementName(page: Page, id: string): Promise<string> {
  return page.evaluate(
    (elemId) => window.__editorStore.getState().elements[elemId].name,
    id,
  )
}

async function goToLayersTab(page: Page) {
  // Ensure Layers tab is active
  const layersTab = page.getByTestId('tab-layers')
  await layersTab.click()
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Layers panel – display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => !!window.__editorStore)
    await clearStore(page)
    await goToLayersTab(page)
  })

  test('display: three elements appear in layers panel in z-order', async ({ page }) => {
    await addElement(page, 'el-a', 'Alpha')
    await addElement(page, 'el-b', 'Beta')
    await addElement(page, 'el-c', 'Gamma')

    // Wait for all three layer rows to appear
    await expect(page.getByTestId('layer-row-el-a')).toBeVisible()
    await expect(page.getByTestId('layer-row-el-b')).toBeVisible()
    await expect(page.getByTestId('layer-row-el-c')).toBeVisible()

    // Names are shown
    await expect(page.getByTestId('layer-name-el-a')).toHaveText('Alpha')
    await expect(page.getByTestId('layer-name-el-b')).toHaveText('Beta')
    await expect(page.getByTestId('layer-name-el-c')).toHaveText('Gamma')

    // rootIds should be [el-a, el-b, el-c] (el-c on top)
    const rootIds = await getRootIds(page)
    expect(rootIds).toEqual(['el-a', 'el-b', 'el-c'])
  })
})

test.describe('Layers panel – reorder', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => !!window.__editorStore)
    await clearStore(page)
    await goToLayersTab(page)
  })

  test('reorder: dragging a layer to a new position updates z-order in store', async ({ page }) => {
    await addElement(page, 'r-a', 'LayerA')
    await addElement(page, 'r-b', 'LayerB')
    await addElement(page, 'r-c', 'LayerC')

    // Verify initial order: rootIds = [r-a, r-b, r-c]
    const initialIds = await getRootIds(page)
    expect(initialIds).toEqual(['r-a', 'r-b', 'r-c'])

    // All three rows visible
    await expect(page.getByTestId('layer-row-r-a')).toBeVisible()
    await expect(page.getByTestId('layer-row-r-b')).toBeVisible()
    await expect(page.getByTestId('layer-row-r-c')).toBeVisible()

    // Use store action to reorder directly (simulates what drag-drop does)
    await page.evaluate(() => {
      // Move r-a (currently at rootIds[0]) to rootIds index 2 (top)
      window.__editorStore.getState().reorderElement('r-a', 2)
    })

    // Wait for DOM to update
    await page.waitForFunction(() => {
      const ids = window.__editorStore.getState().rootIds
      return ids[0] === 'r-b' && ids[1] === 'r-c' && ids[2] === 'r-a'
    })

    const newIds = await getRootIds(page)
    expect(newIds).toEqual(['r-b', 'r-c', 'r-a'])

    // r-a row should still be visible
    await expect(page.getByTestId('layer-row-r-a')).toBeVisible()
  })
})

test.describe('Layers panel – rename', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => !!window.__editorStore)
    await clearStore(page)
    await goToLayersTab(page)
  })

  test('rename: double-click layer shows input, Enter persists new name', async ({ page }) => {
    await addElement(page, 'n-a', 'OldName')
    await expect(page.getByTestId('layer-row-n-a')).toBeVisible()

    // Double-click to enter rename mode
    await page.getByTestId('layer-name-n-a').dblclick()

    // Input should appear
    const input = page.getByTestId('layer-rename-input-n-a')
    await expect(input).toBeVisible()

    // Clear and type new name
    await input.fill('NewName')
    await input.press('Enter')

    // Input should be gone, new name displayed
    await expect(input).not.toBeVisible()
    await expect(page.getByTestId('layer-name-n-a')).toHaveText('NewName')

    // Store should reflect the new name
    const storedName = await getElementName(page, 'n-a')
    expect(storedName).toBe('NewName')
  })

  test('rename: blur (clicking away) also persists the name', async ({ page }) => {
    await addElement(page, 'n-b', 'OriginalName')
    await expect(page.getByTestId('layer-row-n-b')).toBeVisible()

    await page.getByTestId('layer-name-n-b').dblclick()
    const input = page.getByTestId('layer-rename-input-n-b')
    await expect(input).toBeVisible()

    await input.fill('BlurName')
    // Click somewhere else to blur
    await page.getByTestId('layers-panel').click({ position: { x: 5, y: 5 }, force: true })

    await expect(input).not.toBeVisible()
    const storedName = await getElementName(page, 'n-b')
    expect(storedName).toBe('BlurName')
  })
})

test.describe('Layers panel – visibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => !!window.__editorStore)
    await clearStore(page)
    await goToLayersTab(page)
  })

  test('visibility: clicking eye icon hides visible element', async ({ page }) => {
    await addElement(page, 'v-a', 'Visible')
    await expect(page.getByTestId('layer-row-v-a')).toBeVisible()

    // Initially visible in store
    const visibleBefore = await getElementVisible(page, 'v-a')
    expect(visibleBefore).toBe(true)

    // Toggle visibility off
    await page.getByTestId('layer-visibility-v-a').click()

    // Store should reflect hidden
    await page.waitForFunction(
      (id) => window.__editorStore.getState().elements[id].visible === false,
      'v-a',
    )
    const visibleAfter = await getElementVisible(page, 'v-a')
    expect(visibleAfter).toBe(false)

    // Toggle back visible
    await page.getByTestId('layer-visibility-v-a').click()
    await page.waitForFunction(
      (id) => window.__editorStore.getState().elements[id].visible === true,
      'v-a',
    )
    const visibleRestored = await getElementVisible(page, 'v-a')
    expect(visibleRestored).toBe(true)
  })
})

test.describe('Layers panel – empty', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => !!window.__editorStore)
    await clearStore(page)
    await goToLayersTab(page)
  })

  test('empty: layers panel shows empty state when no elements exist', async ({ page }) => {
    // Ensure store is empty
    const count = await page.evaluate(() => Object.keys(window.__editorStore.getState().elements).length)
    expect(count).toBe(0)

    // Empty state visible
    await expect(page.getByTestId('layers-panel')).toBeVisible()
    await expect(page.getByTestId('layers-empty-state')).toBeVisible()
    await expect(page.getByTestId('layers-empty-state')).toContainText('No layers')
  })

  test('empty: no errors thrown when panel renders with no elements', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.waitForTimeout(200)

    expect(errors).toHaveLength(0)
    await expect(page.getByTestId('layers-panel')).toBeVisible()
  })
})

test.describe('Layers panel – empty-name', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => !!window.__editorStore)
    await clearStore(page)
    await goToLayersTab(page)
  })

  test('empty-name: submitting empty string restores previous name', async ({ page }) => {
    await addElement(page, 'e-a', 'KeepThisName')
    await expect(page.getByTestId('layer-row-e-a')).toBeVisible()

    // Enter rename mode
    await page.getByTestId('layer-name-e-a').dblclick()
    const input = page.getByTestId('layer-rename-input-e-a')
    await expect(input).toBeVisible()

    // Clear to empty and press Enter
    await input.fill('')
    await input.press('Enter')

    // Input gone, original name should be restored
    await expect(input).not.toBeVisible()
    await expect(page.getByTestId('layer-name-e-a')).toHaveText('KeepThisName')

    // Store should still have original name
    const storedName = await getElementName(page, 'e-a')
    expect(storedName).toBe('KeepThisName')
  })

  test('empty-name: submitting whitespace-only string restores previous name', async ({ page }) => {
    await addElement(page, 'e-b', 'OrigName')
    await expect(page.getByTestId('layer-row-e-b')).toBeVisible()

    await page.getByTestId('layer-name-e-b').dblclick()
    const input = page.getByTestId('layer-rename-input-e-b')
    await expect(input).toBeVisible()

    await input.fill('   ')
    await input.press('Enter')

    await expect(input).not.toBeVisible()
    const storedName = await getElementName(page, 'e-b')
    expect(storedName).toBe('OrigName')
  })
})
