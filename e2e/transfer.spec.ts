import { test, expect, type BrowserContext, type Page } from '@playwright/test';

async function createRoom(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create Room' }).click();
  await page.waitForURL(/\/r\/[A-Z0-9]{6}/, { timeout: 20_000 });
  const code = new URL(page.url()).pathname.split('/')[2];
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  return code!;
}

async function joinRoom(page: Page, code: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Room code').fill(code);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.waitForURL(new RegExp(`/r/${code}`), { timeout: 20_000 });
}

test.describe('Phase 5 Basic Transfer', () => {
  test('transfers file between two peers over WebRTC DataChannels', async ({ browser }) => {
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

      // Wait for WebRTC connection to come up
      await expect(pageA.getByText(/Direct \(local network\)|Connected/)).toBeVisible({ timeout: 30_000 });
      await expect(pageB.getByText(/Direct \(local network\)|Connected/)).toBeVisible({ timeout: 30_000 });

      // Tab A selects a file to send to Tab B
      const fileInput = pageA.locator('input[type="file"]').first();
      await fileInput.setInputFiles({
        name: 'sample_document.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('DropZone P2P Transfer Content '.repeat(4000)), // ~120 KB payload
      });

      // Tab B receives incoming file dialog (FR-11)
      const dialog = pageB.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 15_000 });
      await expect(dialog.getByText('sample_document.txt')).toBeVisible();

      // Tab B clicks Accept (explicit user consent)
      const acceptBtn = dialog.getByRole('button', { name: 'Accept' }).first();
      await acceptBtn.click();

      // Both tabs should show transfer progress reaching completion (FR-15)
      await expect(pageA.getByText('Complete').first()).toBeVisible({ timeout: 30_000 });
      await expect(pageB.getByText('Complete').first()).toBeVisible({ timeout: 30_000 });

      // Receiver tab should show the "Save File" download button
      await expect(pageB.getByRole('link', { name: 'Save File' })).toBeVisible();
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('declining incoming offer stops transfer without data transmission', async ({ browser }) => {
    test.setTimeout(120_000);
    const ctxA: BrowserContext = await browser.newContext();
    const ctxB: BrowserContext = await browser.newContext();
    const pageA: Page = await ctxA.newPage();
    const pageB: Page = await ctxB.newPage();

    try {
      const code = await createRoom(pageA);
      await joinRoom(pageB, code);
      await expect(pageA.getByTestId('peer-card')).toHaveCount(2, { timeout: 15_000 });
      await expect(pageB.getByTestId('peer-card')).toHaveCount(2, { timeout: 15_000 });

      // Wait for WebRTC connection to come up
      await expect(pageA.getByText(/Direct \(local network\)|Connected/)).toBeVisible({ timeout: 30_000 });
      await expect(pageB.getByText(/Direct \(local network\)|Connected/)).toBeVisible({ timeout: 30_000 });

      // Tab A offers a file
      const fileInput = pageA.locator('input[type="file"]').first();
      await fileInput.setInputFiles({
        name: 'unwanted_file.bin',
        mimeType: 'application/octet-stream',
        buffer: Buffer.from('Binary data'),
      });

      // Tab B declines
      const dialog = pageB.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 15_000 });
      await dialog.getByRole('button', { name: 'Decline' }).first().click();

      // Tab A shows declined status
      await expect(pageA.getByText('Declined', { exact: true })).toBeVisible({ timeout: 15_000 });
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
