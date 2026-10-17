import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

const UNIQUE = Date.now().toString(36).toUpperCase();

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

test.describe('Phase 3 presence', () => {
  test('two tabs create/join a room and see each other live; rename propagates', async ({ browser }) => {
    const ctxA: BrowserContext = await browser.newContext();
    const ctxB: BrowserContext = await browser.newContext();
    const pageA: Page = await ctxA.newPage();
    const pageB: Page = await ctxB.newPage();

    try {
      const code = await createRoom(pageA);
      await expect(pageA.getByTestId('room-code')).toHaveText(code);

      // Host sees exactly one device (itself) before anyone joins.
      await expect(pageA.getByTestId('peer-card')).toHaveCount(1);

      await joinRoom(pageB, code);

      // Both tabs now show two device cards, live.
      await expect(pageA.getByTestId('peer-card')).toHaveCount(2, { timeout: 15_000 });
      await expect(pageB.getByTestId('peer-card')).toHaveCount(2, { timeout: 15_000 });

      // Rename on B propagates to A.
      const newName = `E2E-${UNIQUE}`;
      await pageB.getByRole('button', { name: 'Rename' }).click();
      await pageB.getByLabel('Device name').fill(newName);
      await pageB.getByRole('button', { name: 'Save' }).click();

      await expect(pageA.getByText(newName)).toBeVisible({ timeout: 15_000 });
      await expect(pageB.getByText(newName)).toBeVisible();
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
