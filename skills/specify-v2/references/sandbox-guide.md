# Sandbox Capability Check — Reference Guide

This guide is referenced by L3 (Requirements+Scenarios) when `context.sandbox_capability` is not set.
The main agent reads this file and follows the steps inline.

## When to Trigger

- **Primary**: "Sandbox Capability Check (before pingpong)" section in L3 flow — runs before L3-drafter starts
- **Safety net**: L3-reviewer flags `sandbox_capability_unknown` gap (non-blocking) — if before-pingpong check was somehow skipped, orchestrator runs this guide before next pingpong round (does NOT count as a retry round)
- Condition: `context.sandbox_capability` is NOT set in spec.json

## Phase A: Auto-detect Existing Infrastructure

Scan the project for existing sandbox infra. No user prompt needed if found.

### Detection targets

| Signal | Files to check |
|--------|---------------|
| Playwright | `playwright.config.ts`, `playwright.config.js` |
| Cypress | `cypress.config.ts`, `cypress.config.js`, `cypress.json` |
| Vitest Browser | `@vitest/browser` in package.json devDependencies |
| Docker | `docker-compose.yml`, `docker-compose.yaml`, `Dockerfile` |
| Testcontainers | `testcontainers` in package.json or build files |
| Sandbox env | `.env.sandbox`, `.env.test` |
| BDD/Gherkin | `sandbox/features/*.feature`, `features/*.feature`, `*.feature` |
| iOS Simulator | `*.xcodeproj`, `*.xcworkspace`, `Podfile`, `Package.swift` (with iOS target) |
| Android Emulator | `android/`, `build.gradle`, `AndroidManifest.xml` |
| macOS Automator | `macos-automator-mcp` in `.mcp.json` or MCP server config |
| Desktop App | `electron-builder.yml`, `tauri.conf.json`, `*.app`, Electron/Tauri deps |

### If infra detected

Record automatically — no user prompt:

```
capability = {
  "docker": detected.docker OR detected.testcontainers,
  "browser": detected.playwright OR detected.cypress OR detected.vitest_browser,
  "simulator": detected.ios_simulator OR detected.android_emulator,
  "desktop": detected.macos_automator OR detected.desktop_app,
  "tools": [list of detected tool names],
  "confirmed_at": "{today}",
  "detected": true
}
```

Merge into spec.json context, then:
- If 0 sandbox scenarios in current draft → GOTO L3_DRAFT (restart Round 1 of the pingpong with updated capability in prompt)
- If sandbox scenarios already exist → proceed to merge

## Phase B: No Infra Detected — Classify and Recommend

### Project signal detection

Scan `file_scope`, `meta.goal`, and project files to classify:

| Signal | Heuristics |
|--------|-----------|
| `has_ui` | `*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `**/components/**`, `**/pages/**`, or goal keywords (canvas, editor, drag, responsive, UI, dashboard) |
| `has_api` | `**/routes/**`, `**/api/**`, `**/controllers/**`, `**/handlers/**`, `*.go`, `**/server.*`, or goal keywords (API, backend, endpoint, REST, GraphQL) |
| `has_db` | `**/migrations/**`, `**/models/**`, `**/schema/**`, `prisma/schema.prisma`, or ORM deps (prisma, typeorm, sequelize, knex, drizzle) |
| `has_cli` | `**/bin/**`, `**/cli/**`, package.json `bin` field |
| `has_native_app` | `*.xcodeproj`, `*.xcworkspace`, `Podfile`, `build.gradle`, `AndroidManifest.xml`, React Native/Flutter project files |
| `has_desktop_app` | `electron-builder.yml`, `tauri.conf.json`, Electron/Tauri deps, macOS `.app` target |

### Dynamic options based on signals

Build AskUserQuestion options dynamically:

- `has_ui` → offer **Browser (Playwright)** and/or **Browser + Vitest Browser Mode**
- `has_api` or `has_db` → offer **Docker (containers)**
- `has_ui` AND (`has_api` or `has_db`) → offer **Docker + Browser (full stack)**
- `has_native_app` → offer **Simulator (iOS Simulator / Android Emulator)**
  - iOS: `xcrun simctl boot` + `xcrun simctl install` + accessibility via XCUITest or macos-automator-mcp
  - Android: `emulator @device` + `adb install` + UI Automator
- `has_desktop_app` → offer **Desktop Automation (macos-automator-mcp)**
  - AppleScript/JXA for app control, `accessibility_query` for UI element assertion
  - Requires: macOS Automation + Accessibility permissions granted
- `has_cli` → offer **Terminal (PTY-based I/O testing)**
  - Spawn CLI process, send input, assert stdout/stderr patterns
- Always include → **No sandbox needed**

### User prompt template

```
"No sandbox test infrastructure detected.
Project signals: [detected signals]
Sandbox tests catch issues that unit tests miss (real DB queries, browser rendering, E2E flows).
Which sandbox environment should we set up?"
```

### If "No sandbox needed"

Record `{ "docker": false, "browser": false, "confirmed_at": "{today}" }` and proceed.

## Phase C: Scaffold Tasks (user approved sandbox)

**Only after user selects a sandbox option in Phase B.**

### Browser scaffold task (T-sandbox-browser)

```json
{
  "id": "T-sandbox-browser",
  "action": "Set up Playwright E2E testing infrastructure",
  "type": "work",
  "origin": "auto:sandbox-scaffold",
  "risk": "low",
  "status": "pending",
  "steps": [
    "Install playwright: npm init playwright@latest",
    "Configure playwright.config.ts with webServer (dev server command + port)",
    "Add package.json scripts: test:e2e, test:e2e:ui",
    "Create e2e/smoke.spec.ts — verify app loads",
    "npx playwright install chromium",
    "Verify: npm run test:e2e passes"
  ],
  "depends_on": ["T1"]
}
```

If Vitest Browser Mode also selected, add extra steps:
- Install `@vitest/browser`
- Add vitest workspace config with browser project (provider: playwright)
- Add `test:browser` script

### Docker scaffold task (T-sandbox-docker)

```json
{
  "id": "T-sandbox-docker",
  "action": "Set up Docker-based sandbox for integration testing",
  "type": "work",
  "origin": "auto:sandbox-scaffold",
  "risk": "low",
  "status": "pending",
  "steps": [
    "Create docker-compose.yml with required services (DB, cache, etc.)",
    "Create .env.sandbox with test environment variables",
    "Add package.json scripts: sandbox:up, sandbox:down, test:integration",
    "Create seed data / migration scripts for test DB",
    "Verify: docker compose up -d && npm run test:integration passes"
  ],
  "depends_on": ["T1"]
}
```

### Simulator scaffold task (T-sandbox-simulator)

```json
{
  "id": "T-sandbox-simulator",
  "action": "Set up iOS Simulator / Android Emulator testing infrastructure",
  "type": "work",
  "origin": "auto:sandbox-scaffold",
  "risk": "low",
  "status": "pending",
  "steps": [
    "iOS: Verify Xcode + xcrun simctl available, boot target simulator",
    "iOS: Build app for simulator target, install via xcrun simctl install",
    "Android: Verify Android SDK + emulator available, create/boot AVD",
    "Android: Build debug APK, install via adb install",
    "Set up macos-automator-mcp for accessibility-based UI assertions (if macOS)",
    "Create smoke test: app launches, main screen renders"
  ],
  "depends_on": ["T1"]
}
```

### Desktop automation scaffold task (T-sandbox-desktop)

```json
{
  "id": "T-sandbox-desktop",
  "action": "Set up desktop app automation via macos-automator-mcp",
  "type": "work",
  "origin": "auto:sandbox-scaffold",
  "risk": "low",
  "status": "pending",
  "steps": [
    "Verify macos-automator-mcp is installed and configured in .mcp.json",
    "Grant Automation + Accessibility permissions in System Settings",
    "Create smoke test: launch app via AppleScript, verify main window opens",
    "Test accessibility_query: enumerate key UI elements (buttons, fields, labels)",
    "Create assertion helper: query element → verify property (e.g., value, enabled)"
  ],
  "depends_on": ["T1"]
}
```

> **Natural language scenarios for simulator/desktop**: Since these sandbox types don't have standardized test frameworks like Playwright, scenarios should describe verification in natural language. The L3-drafter writes `verify.checks` as human-readable assertions (e.g., "Main screen shows 3 tab items", "Settings button is tappable"), and the worker uses the appropriate tool (xcrun simctl, macos-automator-mcp accessibility_query) to implement them.

### After scaffold tasks added

- Record capability with `"scaffold_required": true`
- All tasks with `execution_env: "sandbox"` scenarios depend on `T-sandbox-*`
- Re-run L3 draft to generate sandbox scenarios: `GOTO L3_DRAFT`
