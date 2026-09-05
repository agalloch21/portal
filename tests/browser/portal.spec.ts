import { expect, test } from '@playwright/test';

test('welcome, manual exploration, scenes and auto-hidden controls', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/scene-ready/);
  await expect(page.getByRole('heading', { name: 'Portal.' })).toBeVisible();
  await page.getByRole('button', { name: '先随便看看' }).click();
  await expect(page.locator('#toolbar')).toBeVisible();
  await page.getByRole('button', { name: '切换环境' }).click();
  await page.locator('[data-environment="lake"]').click();
  await expect(page.locator('#scene-name')).toHaveText('清晨湖畔');
  await expect(page.locator('body')).not.toHaveClass(/controls-visible/, { timeout: 6000 });
  await page.locator('#world').click({ position: { x: 100, y: 200 } });
  await expect(page.locator('body')).toHaveClass(/controls-visible/);
  await page.getByRole('button', { name: '退出沉浸' }).click();
  await expect(page.locator('#welcome')).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile calibration is optional, persists and stays on-screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '先随便看看' }).click();
  await page.getByRole('button', { name: '校准', exact: true }).click();
  await page.locator('#screen-width').fill('68');
  await page.locator('#eye-distance').fill('420');
  await page.getByRole('button', { name: '保存尺度并采样' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '先随便看看' }).click();
  await page.getByRole('button', { name: '校准', exact: true }).click();
  await expect(page.locator('#screen-width')).toHaveValue('68');
  await expect(page.locator('#eye-distance')).toHaveValue('420');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const dialog = await page.locator('#calibration-dialog').boundingBox();
  expect(dialog!.x).toBeGreaterThanOrEqual(0);
  expect(dialog!.y).toBeGreaterThanOrEqual(0);
  await page.getByRole('button', { name: '恢复默认尺度' }).click();
  await expect(page.locator('#screen-width')).toHaveValue('64');
});

test('camera rejection leaves an operable panorama and does not request audio', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async (constraints: MediaStreamConstraints) => {
      if (constraints.audio !== false) throw new Error('Unexpected audio request');
      throw new DOMException('Permission denied', 'NotAllowedError');
    } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '打开这扇窗' }).click();
  await expect(page.locator('#toast')).toContainText('摄像头未开启');
  await expect(page.locator('#tracking')).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: '切换环境' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('real local model pipeline can start on a synthetic stream and releases it on exit', async ({ page }) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4173') && !request.url().startsWith('blob:') && !request.url().startsWith('data:')) external.push(request.url()); });
  await page.addInitScript(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 240;
    const ctx = canvas.getContext('2d')!;
    setInterval(() => { ctx.fillStyle = '#b8a3c9'; ctx.fillRect(0, 0, 320, 240); ctx.fillStyle = '#ddd'; ctx.fillRect(Date.now() % 280, 50, 30, 30); }, 80);
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      const stream = canvas.captureStream(15);
      (window as unknown as { testStream: MediaStream }).testStream = stream;
      return stream;
    } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '打开这扇窗' }).click();
  await expect(page.locator('#tracking-status')).toContainText('等待你回到镜头前', { timeout: 35000 });
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await expect(page.locator('#resume-overlay')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { testStream: MediaStream }).testStream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
  await page.getByRole('button', { name: '轻触继续' }).click();
  await expect(page.locator('#tracking-status')).toContainText('等待你回到镜头前', { timeout: 35000 });
  if (!(await page.locator('body').getAttribute('class'))?.includes('controls-visible')) await page.locator('#world').click({ position: { x: 100, y: 200 } });
  await page.getByRole('button', { name: '退出沉浸' }).click();
  expect(await page.evaluate(() => (window as unknown as { testStream: MediaStream }).testStream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('model failure downgrades cleanly and stops camera', async ({ page }) => {
  await page.addInitScript(() => {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
    setInterval(() => canvas.getContext('2d')!.fillRect(0, 0, 10, 10), 80);
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      const stream = canvas.captureStream(10);
      (window as unknown as { testStream: MediaStream }).testStream = stream;
      return stream;
    } });
  });
  await page.route('**/face_landmarker.task', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('/');
  await page.getByRole('button', { name: '打开这扇窗' }).click();
  await expect(page.locator('#tracking')).toHaveAttribute('aria-pressed', 'false', { timeout: 35000 });
  await expect(page.locator('#toast')).toContainText('暂不可用');
  expect(await page.evaluate(() => (window as unknown as { testStream: MediaStream }).testStream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
});

test('backgrounding releases media and requires explicit resume', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '先随便看看' }).click();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await expect(page.locator('#resume-overlay')).toBeVisible();
  await page.getByRole('button', { name: '轻触继续' }).click();
  await expect(page.locator('#resume-overlay')).not.toBeVisible();
  await expect(page.locator('#immersive')).toBeVisible();
});

test('a late camera permission result is released after the user exits', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
      const stream = canvas.captureStream(10);
      (window as unknown as { testStream: MediaStream }).testStream = stream;
      await new Promise(resolve => setTimeout(resolve, 1800));
      return stream;
    } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '打开这扇窗' }).click();
  await page.getByRole('button', { name: '退出沉浸' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { testStream: MediaStream }).testStream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
  await expect(page.locator('#welcome')).toBeVisible();
});
