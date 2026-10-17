import { test, expect, type BrowserContext, type Page } from '@playwright/test';

async function createRoom(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create Room' }).click();
  await page.waitForURL(/\/r\/[A-Z0-9]{6}/, { timeout: 20_000 });
  const code = new URL(page.url()).pathname.split('/')[2];
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  return code;
}

async function joinRoom(page: Page, code: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Room code').fill(code);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.waitForURL(new RegExp(`/r/${code}`), { timeout: 20_000 });
}

test.describe('Phase 4 connection', () => {
  test('two tabs connect over WebRTC, show a direct badge, and complete a text round trip', async ({ browser }) => {
    test.setTimeout(120_000);
    const ctxA: BrowserContext = await browser.newContext();
    const ctxB: BrowserContext = await browser.newContext();
    const pageA: Page = await ctxA.newPage();
    const pageB: Page = await ctxB.newPage();

    try {
      const code = await createRoom(pageA);
      await expect(pageA.getByTestId('room-code')).toHaveText(code);

      await joinRoom(pageB, code);
      await expect(pageA.getByTestId('peer-card')).toHaveCount(2, { timeout: 15_000 });
      await expect(pageB.getByTestId('peer-card')).toHaveCount(2, { timeout: 15_000 });

      // WebRTC comes up: both peers classify the pair (FR-30: local network).
      await expect(pageA.getByText('Direct (local network)')).toBeVisible({ timeout: 30_000 });
      await expect(pageB.getByText('Direct (local network)')).toBeVisible({ timeout: 30_000 });

      // Control-channel text round trip: A pings B and B echoes back (FR-05).
      await pageA.getByRole('button', { name: 'Ping' }).click();
      await expect(pageA.getByTestId('round-trip')).toContainText(/echoed in \d+ ms/, { timeout: 30_000 });
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
