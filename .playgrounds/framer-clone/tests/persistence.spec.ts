import { test, expect } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'framer-clone-project'

interface RectParams {
  id: string
  x?: number
  y?: number
  fill?: string
}

async function addRect(page: import('@playwright/test').Page, params: RectParams) {
  const { id, x = 0, y = 0, fill = '#ff0000' } = params
  await page.evaluate(
    ([elemId, ex, ey, ef]) => {
      window.__editorStore.getState().addElement({
        id: elemId as string,
        kind: 'rectangle',
        x: ex as number,
        y: ey as number,
        width: 100,
        height: 100,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        name: 'Rect',
        parentId: null,
        childIds: [],
        fill: ef as string,
        stroke: 'transparent',
        strokeWidth: 0,
        borderRadius: 0,
      })
    },
    [id, x, y, fill],
  )
}

async function getLocalStorageState(page: import('@playwright/test').Page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  }, STORAGE_KEY)
}

async function clearLocalStorage(page: import('@playwright/test').Page) {
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('auto-save', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => !!window.__editorStore)
    await clearLocalStorage(page)
  })

  test('auto-save: state persisted to LocalStorage after debounce', async ({ page }) => {
    const id = 'auto-save-rect'
    await addRect(page, { id, x: 50, y: 80, fill: '#0000ff' })

    // Wait for debounced save (500ms + buffer)
    await page.waitForTimeout(700)

    const saved = await getLocalStorageState(page)
    expect(saved).not.toBeNull()
    expect(saved.elements).toBeDefined()
    expect(saved.elements[id]).toBeDefined()
    expect(saved.elements[id].x).toBe(50)
    expect(saved.elements[id].y).toBe(80)
    expect(saved.rootIds).toContain(id)
  })
})

test.describe('restore', () => {
  test('restore: project restores with all elements after reload', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => !!window.__editorStore)
    await clearLocalStorage(page)

    const id = 'restore-rect'
    await addRect(page, { id, x: 120, y: 200 })

    // Wait for auto-save debounce
    await page.waitForTimeout(700)

    // Verify saved
    const saved = await getLocalStorageState(page)
    expect(saved?.elements?.[id]).toBeDefined()

    // Reload page
    await page.reload()
    await page.waitForFunction(() => !!window.__editorStore)

    // Check element is restored in store
    const restored = await page.evaluate((elemId) => {
      const state = window.__editorStore.getState()
      return state.elements[elemId]
    }, id)

    expect(restored).not.toBeNull()
    expect(restored.x).toBe(120)
    expect(restored.y).toBe(200)
  })
})

test.describe('export', () => {
  test('export: JSON file downloaded with full state', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => !!window.__editorStore)
    await clearLocalStorage(page)

    const id = 'export-rect'
    await addRect(page, { id, x: 30, y: 40 })

    // Wait for the download triggered by Export button
    const downloadPromise = page.waitForEvent('download')

    await page.click('[data-testid="export-button"]')

    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('project.json')

    // Read download content
    const downloadPath = await download.path()
    expect(downloadPath).not.toBeNull()
    const content = fs.readFileSync(downloadPath!, 'utf-8')
    const parsed = JSON.parse(content)

    expect(parsed.schemaVersion).toBe(1)
    expect(parsed.elements).toBeDefined()
    expect(parsed.elements[id]).toBeDefined()
    expect(parsed.rootIds).toContain(id)
  })
})

test.describe('import', () => {
  test('import: valid JSON file loads and replaces canvas', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => !!window.__editorStore)
    await clearLocalStorage(page)

    // Prepare a valid project JSON
    const projectData = {
      schemaVersion: 1,
      elements: {
        'imported-rect': {
          id: 'imported-rect',
          kind: 'rectangle',
          x: 200,
          y: 300,
          width: 80,
          height: 80,
          rotation: 0,
          opacity: 1,
          visible: true,
          locked: false,
          name: 'Imported',
          parentId: null,
          childIds: [],
          fill: '#00ff00',
          stroke: 'transparent',
          strokeWidth: 0,
          borderRadius: 0,
        },
      },
      rootIds: ['imported-rect'],
      camera: { x: 0, y: 0, zoom: 1 },
    }

    const tmpFile = path.join('/tmp', `import-test-${Date.now()}.json`)
    fs.writeFileSync(tmpFile, JSON.stringify(projectData))

    // Use file input to trigger import
    const fileInput = page.locator('[data-testid="import-file-input"]')
    await fileInput.setInputFiles(tmpFile)

    // Wait for state to update
    await page.waitForFunction(
      (elemId) => {
        const state = window.__editorStore.getState()
        return !!state.elements[elemId]
      },
      'imported-rect',
    )

    const importedElem = await page.evaluate(() => {
      return window.__editorStore.getState().elements['imported-rect']
    })

    expect(importedElem.x).toBe(200)
    expect(importedElem.y).toBe(300)
    expect(importedElem.fill).toBe('#00ff00')

    fs.unlinkSync(tmpFile)
  })
})

test.describe('invalid-json', () => {
  test('invalid-json: error shown for invalid JSON file, state preserved', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForFunction(() => !!window.__editorStore)
    await clearLocalStorage(page)

    // Add an element to preserve
    const id = 'preserved-rect'
    await addRect(page, { id, x: 10, y: 20 })

    // Write an invalid JSON file
    const tmpFile = path.join('/tmp', `invalid-${Date.now()}.txt`)
    fs.writeFileSync(tmpFile, 'this is not valid JSON !!!{')

    // Trigger import
    const fileInput = page.locator('[data-testid="import-file-input"]')
    await fileInput.setInputFiles(tmpFile)

    // Toast error should appear
    await page.waitForSelector('[data-testid="toast-error"]', { timeout: 3000 })
    const toast = page.locator('[data-testid="toast-error"]')
    await expect(toast).toBeVisible()

    // Preserved element still in store
    const elemStillExists = await page.evaluate((elemId) => {
      return !!window.__editorStore.getState().elements[elemId]
    }, id)
    expect(elemStillExists).toBe(true)

    fs.unlinkSync(tmpFile)
  })
})

test.describe('quota-exceeded', () => {
  test('quota-exceeded: warning shown when LocalStorage quota exceeded', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForFunction(() => !!window.__editorStore)

    // Override localStorage.setItem to simulate QuotaExceededError
    await page.evaluate(() => {
      const orig = localStorage.setItem.bind(localStorage)
      localStorage.setItem = (key: string, _value: string) => {
        if (key === 'framer-clone-project') {
          const err = new DOMException('QuotaExceededError', 'QuotaExceededError')
          throw err
        }
        return orig(key, _value)
      }
    })

    // Add element to trigger auto-save path via the quota-exceeding setItem
    const id = 'quota-rect'
    await addRect(page, { id, x: 0, y: 0 })

    // Wait for debounce + save attempt
    await page.waitForTimeout(700)

    // Warning toast should appear
    await page.waitForSelector('[data-testid="toast-warning"]', { timeout: 3000 })
    const toast = page.locator('[data-testid="toast-warning"]')
    await expect(toast).toBeVisible()

    // Editor is still functional — can add another element without crash
    const id2 = 'quota-rect-2'
    await addRect(page, { id2: id2, x: 50, y: 50 } as RectParams)
    const toolbar = page.locator('[data-testid="toolbar"]')
    await expect(toolbar).toBeVisible()
  })
})

test.describe('corrupt-json', () => {
  test('corrupt-json: corruption error shown for truncated JSON, state preserved', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForFunction(() => !!window.__editorStore)
    await clearLocalStorage(page)

    // Add an element to preserve
    const id = 'stable-rect'
    await addRect(page, { id, x: 5, y: 15 })

    // Write a truncated JSON (valid JSON but missing required fields)
    const tmpFile = path.join('/tmp', `corrupt-${Date.now()}.json`)
    fs.writeFileSync(tmpFile, '{"incomplete": true}')

    // Trigger import
    const fileInput = page.locator('[data-testid="import-file-input"]')
    await fileInput.setInputFiles(tmpFile)

    // Error toast should appear
    await page.waitForSelector('[data-testid="toast-error"]', { timeout: 3000 })
    const toast = page.locator('[data-testid="toast-error"]')
    await expect(toast).toBeVisible()

    // Preserved element still in store
    const elemStillExists = await page.evaluate((elemId) => {
      return !!window.__editorStore.getState().elements[elemId]
    }, id)
    expect(elemStillExists).toBe(true)

    fs.unlinkSync(tmpFile)
  })
})
