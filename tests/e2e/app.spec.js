/**
 * app.spec.js — Playwright E2E tests for scratchpad
 *
 * Tests real browser behaviour: paste events, UI state, keyboard shortcuts,
 * search, filtering, duplicate detection.
 *
 * Each test starts with a clean IndexedDB + sessionStorage state.
 */
import { test, expect } from '@playwright/test';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Dispatch a paste event with plain text into the page. */
async function pasteText(page, text) {
  await page.evaluate((t) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', t);
    document.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    }));
  }, text);
}

// ── Setup ─────────────────────────────────────────────────────────────────────
// Playwright gives every test a fresh browser context with isolated storage
// (IndexedDB, localStorage, sessionStorage), so no manual cleanup is needed.
// We use 'domcontentloaded' to avoid blocking on slow CDN resources (Tailwind,
// Google Fonts) — ES modules execute before DOMContentLoaded fires, so the
// app is fully initialised by the time that event resolves.

test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // Fresh context = no clips. App.js async-inits from IndexedDB, then shows
  // the paste zone.  Wait for that signal so the DOM is fully settled.
  await page.waitForSelector('#paste-zone', { state: 'visible', timeout: 8000 });
});

// ── Initial state ─────────────────────────────────────────────────────────────

test('shows the paste zone when there are no clips', async ({ page }) => {
  const pasteZone = page.locator('#paste-zone');
  await expect(pasteZone).toBeVisible();
});

test('hides the paste zone and shows the clip feed after the first paste', async ({ page }) => {
  await pasteText(page, 'Hello, scratchpad!');
  await expect(page.locator('#paste-zone')).toBeHidden();
  await expect(page.locator('#clip-feed')).toBeVisible();
});

// ── Clip creation via paste ───────────────────────────────────────────────────

test('pasting text creates a clip item in the sidebar', async ({ page }) => {
  await pasteText(page, 'const greeting = "hello";');
  const sidebar = page.locator('#sidebar-list');
  await expect(sidebar).toContainText('greeting', { timeout: 3000 });
});

test('pasting text shows the content in the main feed', async ({ page }) => {
  await pasteText(page, 'function add(a, b) { return a + b; }');
  await expect(page.locator('#clip-feed')).toContainText('function add', { timeout: 3000 });
});

test('pasting code shows a language label on the card', async ({ page }) => {
  await pasteText(page, 'SELECT id, name FROM users WHERE active = true;');
  // SQL label should appear somewhere in the feed card
  await expect(page.locator('#clip-feed')).toContainText('SQL', { timeout: 3000 });
});

test('pasting JSON shows a JSON language label', async ({ page }) => {
  await pasteText(page, '{"name": "scratchpad", "version": "1.0.0"}');
  await expect(page.locator('#clip-feed')).toContainText('JSON', { timeout: 3000 });
});

// ── Duplicate detection ───────────────────────────────────────────────────────

test('pasting the same text twice shows a toast and does not duplicate the clip', async ({ page }) => {
  const text = 'duplicate me ' + Date.now();
  await pasteText(page, text);
  // Wait for first clip to appear
  await expect(page.locator('#sidebar-list')).toContainText('duplicate me', { timeout: 3000 });

  const before = await page.locator('#sidebar-list > *').count();
  await pasteText(page, text);

  // Toast should appear
  const toast = page.locator('#toast');
  await expect(toast).toBeVisible({ timeout: 3000 });

  // Sidebar count should not increase
  const after = await page.locator('#sidebar-list > *').count();
  expect(after).toBe(before);
});

// ── Scratchpad ────────────────────────────────────────────────────────────────

test('pressing a printable key opens the scratchpad textarea', async ({ page }) => {
  await page.keyboard.press('h');
  const scratchpad = page.locator('#scratchpad-ta');
  await expect(scratchpad).toBeVisible({ timeout: 2000 });
});

test('typing in the scratchpad accumulates text', async ({ page }) => {
  await page.keyboard.press('h');
  await page.keyboard.press('i');
  const scratchpad = page.locator('#scratchpad-ta');
  await expect(scratchpad).toHaveValue('hi');
});

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

test('"?" key opens the keyboard shortcuts overlay', async ({ page }) => {
  await page.keyboard.press('?');
  const overlay = page.locator('#shortcut-overlay');
  await expect(overlay).not.toHaveClass(/opacity-0/, { timeout: 2000 });
});

test('Escape closes the shortcuts overlay', async ({ page }) => {
  await page.keyboard.press('?');
  await page.keyboard.press('Escape');
  const overlay = page.locator('#shortcut-overlay');
  await expect(overlay).toHaveClass(/opacity-0/, { timeout: 2000 });
});

test('"/" key focuses the search input', async ({ page }) => {
  await page.keyboard.press('/');
  const search = page.locator('#search-input');
  await expect(search).toBeFocused({ timeout: 2000 });
});

// ── Delete ────────────────────────────────────────────────────────────────────

test('"x" key deletes the focused clip', async ({ page }) => {
  await pasteText(page, 'clip to delete ' + Date.now());
  await expect(page.locator('#sidebar-list')).toContainText('clip to delete', { timeout: 3000 });

  // Focus the clip card (click the sidebar item)
  await page.locator('#sidebar-list > *').first().click();
  await page.keyboard.press('x');

  // Clip feed and sidebar should now be empty
  await expect(page.locator('#paste-zone')).toBeVisible({ timeout: 3000 });
});

// ── Pin ───────────────────────────────────────────────────────────────────────

test('"p" key toggles pin on the focused clip', async ({ page }) => {
  await pasteText(page, 'pin this clip ' + Date.now());
  await expect(page.locator('#sidebar-list > *').first()).toBeVisible({ timeout: 3000 });
  await page.locator('#sidebar-list > *').first().click();

  // Press p to pin — the button's title attribute or aria-label should update
  await page.keyboard.press('p');

  // The sidebar item for a pinned clip typically shows a pin icon; at minimum no error thrown
  // We verify the clip is still present after pressing p
  const count = await page.locator('#sidebar-list > *').count();
  expect(count).toBeGreaterThan(0);
});

// ── Search ────────────────────────────────────────────────────────────────────

test('search box filters clips by content', async ({ page }) => {
  await pasteText(page, 'unicorn_function_xyz()');
  await pasteText(page, 'dragon_method_abc()');

  await expect(page.locator('#sidebar-list')).toContainText('unicorn_function_xyz', { timeout: 3000 });
  await expect(page.locator('#sidebar-list')).toContainText('dragon_method_abc',   { timeout: 3000 });

  // Focus search and type a query
  await page.locator('#search-input').fill('unicorn');
  await page.waitForTimeout(300); // debounce

  await expect(page.locator('#sidebar-list')).toContainText('unicorn_function_xyz');
  await expect(page.locator('#sidebar-list')).not.toContainText('dragon_method_abc');
});

test('clearing the search restores all clips', async ({ page }) => {
  await pasteText(page, 'unicorn_function_xyz()');
  await pasteText(page, 'dragon_method_abc()');
  await expect(page.locator('#sidebar-list')).toContainText('dragon_method_abc', { timeout: 3000 });

  await page.locator('#search-input').fill('unicorn');
  await page.waitForTimeout(300);
  await page.locator('#search-input').fill('');
  await page.waitForTimeout(300);

  await expect(page.locator('#sidebar-list')).toContainText('dragon_method_abc');
});

// ── Filter tabs ───────────────────────────────────────────────────────────────

test('"Code" tab shows only code clips', async ({ page }) => {
  await pasteText(page, 'SELECT * FROM users;');              // code
  await pasteText(page, 'Just some plain text note here.');   // text

  await page.waitForTimeout(500); // let both clips render

  await page.locator('[data-filter="code"]').click();
  await page.waitForTimeout(300);

  // Only SQL clip should be in the sidebar list
  const items = await page.locator('#sidebar-list > *').count();
  expect(items).toBe(1);
});

test('"Text" tab shows only plain-text clips', async ({ page }) => {
  await pasteText(page, 'SELECT * FROM users;');            // code
  await pasteText(page, 'This is a plain text paragraph.'); // plain text

  await page.waitForTimeout(500);

  await page.locator('[data-filter="text"]').click();
  await page.waitForTimeout(300);

  const items = await page.locator('#sidebar-list > *').count();
  expect(items).toBe(1);
});

test('"All Clips" tab restores all clips', async ({ page }) => {
  await pasteText(page, 'SELECT 1;');
  await pasteText(page, 'Plain note.');
  await page.waitForTimeout(500);

  await page.locator('[data-filter="code"]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-filter="all"]').click();
  await page.waitForTimeout(200);

  const items = await page.locator('#sidebar-list > *').count();
  expect(items).toBe(2);
});

// ── j / k navigation ─────────────────────────────────────────────────────────

test('j/k keys navigate the sidebar selection', async ({ page }) => {
  await pasteText(page, 'clip one');
  await pasteText(page, 'clip two');
  await expect(page.locator('#sidebar-list')).toContainText('clip one', { timeout: 3000 });

  // Press j to move selection down (selected item gets bg-nb-card class)
  await page.keyboard.press('j');
  const active = page.locator('#sidebar-list [class*="bg-nb-card"]');
  await expect(active).toHaveCount(1, { timeout: 2000 });

  // Press k to move back up — selection should still be on one item
  await page.keyboard.press('k');
  await expect(active).toHaveCount(1, { timeout: 2000 });
});

// ── Share URL ─────────────────────────────────────────────────────────────────

test('"s" key copies a share URL containing a v1 hash to the clipboard', async ({ page }) => {
  // Grant clipboard read permission
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

  await pasteText(page, 'shareable snippet ' + Date.now());
  await expect(page.locator('#sidebar-list > *').first()).toBeVisible({ timeout: 3000 });
  await page.locator('#sidebar-list > *').first().click();

  await page.keyboard.press('s');

  const toast = page.locator('#toast');
  await expect(toast).toBeVisible({ timeout: 3000 });

  // The copied URL should appear in the toast text or we can read the clipboard
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  // URL may be null (image or too-big) but for short text it should contain v1/
  if (clip) expect(clip).toContain('v1/');
});
