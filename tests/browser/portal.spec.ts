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


async function mockMotion(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    Object.defineProperty(DeviceOrientationEvent, 'requestPermission', { value: async () => 'granted' });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
      throw new DOMException('Denied', 'NotAllowedError');
    } });
  });
}
async function pose(page: import('@playwright/test').Page, beta: number) {
  await page.evaluate(beta => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 120, beta, gamma: 0 })), beta);
}
async function pixels(page: import('@playwright/test').Page) {
  return page.evaluate(() => new Promise<number[]>(resolve => requestAnimationFrame(() => {
    const c = document.querySelector<HTMLCanvasElement>('#world')!;
    const gl = c.getContext('webgl2')!;
    const result: number[] = [];
    for (const x of [.2, .5, .8]) for (const y of [.2, .5, .8]) {
      const p = new Uint8Array(4);
      gl.readPixels(Math.floor(c.width*x), Math.floor(c.height*y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
      result.push(...p);
    }
    resolve(result);
  })));
}
async function syntheticCamera(page: import('@playwright/test').Page, mainThread = false) {
  await page.addInitScript(mainThread => {
    Object.defineProperty(DeviceOrientationEvent, 'requestPermission', { value: async () => 'granted' });
    if (mainThread) {
      Object.defineProperty(window, 'Worker', { value: undefined });
      Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', { value: undefined });
    }
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 240;
    const ctx = canvas.getContext('2d')!;
    setInterval(() => {
      ctx.fillStyle = '#b8a3c9'; ctx.fillRect(0, 0, 320, 240);
      ctx.fillStyle = '#ddd'; ctx.fillRect(Date.now() % 280, 50, 30, 30);
    }, 80);
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async (constraints: MediaStreamConstraints) => {
      if (constraints.audio !== false) throw new Error('Audio must remain disabled');
      const stream = canvas.captureStream(15);
      (window as unknown as { testStream: MediaStream }).testStream = stream;
      return stream;
    } });
  }, mainThread);
}
async function stopped(page: import('@playwright/test').Page) {
  return page.evaluate(() => (window as unknown as { testStream: MediaStream }).testStream.getTracks().every(t => t.readyState === 'ended'));
}

test('fixed projection ignores old preferences and mobile settings stay usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem('portal-fov', '95');
    localStorage.setItem('portal-calibration', JSON.stringify({ shortEdgeMm: 64, distanceMm: 900, distanceScale: 4 }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: '先随便看看' }).click();
  await page.getByRole('button', { name: '打开体验设置' }).click();
  await expect(page.locator('input[type=range]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '开启眼位追踪', exact: true })).toBeVisible();
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('#world').boundingBox()).toEqual({ x: 0, y: 0, ...viewport });
    const panel = await page.locator('#view-dialog').boundingBox();
    expect(panel!.y).toBeGreaterThanOrEqual(0);
    expect(panel!.height).toBeLessThanOrEqual(viewport.height);
  }
});

test('manual entry does not request camera or inference resources', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', r => { if (/face_landmarker|vision_bundle|vision_wasm/.test(r.url())) requests.push(r.url()); });
  await page.addInitScript(() => {
    (window as unknown as { calls: number }).calls = 0;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      (window as unknown as { calls: number }).calls++;
      throw new Error('Unexpected camera');
    } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '先随便看看' }).click();
  expect(await page.evaluate(() => (window as unknown as { calls: number }).calls)).toBe(0);
  expect(requests).toEqual([]);
});

test('flat opening then lifting returns to the upright horizon', async ({ page }) => {
  await mockMotion(page);
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/scene-ready/);
  await page.getByRole('button', { name: '打开这扇窗' }).click();
  const upright = await pixels(page);
  expect(upright.some(v => v !== 0 && v !== 255)).toBe(true);
  await pose(page, 0);
  await expect(page.locator('#tracking-status')).toContainText('随手机轻轻转动');
  await expect.poll(async () => JSON.stringify(await pixels(page)) !== JSON.stringify(upright)).toBe(true);
  // A sustained new pose is accepted after isolated-spike protection.
  for (let i = 0; i < 8; i++) { await pose(page, 90); await page.waitForTimeout(70); }
  await expect.poll(() => pixels(page)).toEqual(upright);
  await page.getByRole('button', { name: '方向回正' }).click();
  expect(await pixels(page)).toEqual(upright);
});

test('camera refusal preserves phone motion and manual exploration', async ({ page }) => {
  await mockMotion(page);
  await page.goto('/');
  await page.getByRole('button', { name: '打开这扇窗' }).click();
  await expect(page.locator('#toast')).toContainText('摄像头未开启');
  await expect(page.locator('#eyes')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#motion')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '切换环境' }).click();
  await page.locator('[data-environment="lake"]').click();
  await expect(page.locator('#scene-name')).toHaveText('清晨湖畔');
});

for (const mainThread of [false, true]) test(`local model pipeline, media release and resume (${mainThread ? 'main thread fallback' : 'worker preferred'})`, async ({ page }) => {
  test.setTimeout(90000);
  await syntheticCamera(page, mainThread);
  const errors: string[] = [], external: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (!/^(http:\/\/127\.0\.0\.1:4173|blob:|data:)/.test(r.url())) external.push(r.url()); });
  await page.goto('/');
  await page.getByRole('button', { name: '打开这扇窗' }).click();
  await page.getByRole('button', { name: '打开体验设置' }).click();
  await expect(page.locator('#eye-status')).toContainText('等待眼睛进入画面', { timeout: 35000 });
  await page.locator('#performance-details summary').click();
  await expect(page.locator('#performance-data')).toContainText('ms');
  await expect(page.locator('#performance-data')).toContainText(mainThread ? 'Main thread' : 'Worker');
  await expect(page.locator('#performance-data')).not.toContainText('追踪 0.0');
  await page.getByRole('button', { name: '关闭眼位追踪', exact: true }).click();
  expect(await stopped(page)).toBe(true);
  await expect(page.locator('#motion')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '开启眼位追踪', exact: true }).click();
  await expect(page.locator('#eye-status')).toContainText('等待眼睛进入画面', { timeout: 35000 });
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await expect(page.locator('#resume-overlay')).toBeVisible();
  expect(await stopped(page)).toBe(true);
  await page.getByRole('button', { name: '轻触继续' }).click();
  await expect(page.locator('#eye-status')).toContainText('等待眼睛进入画面', { timeout: 35000 });
  if (!(await page.locator('body').getAttribute('class'))?.includes('controls-visible')) await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '退出沉浸' }).click();
  expect(await stopped(page)).toBe(true);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('model failure stops camera and keeps browsing usable', async ({ page }) => {
  await syntheticCamera(page, true);
  await page.route('**/face_landmarker.task', r => r.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('/');
  await page.getByRole('button', { name: '打开这扇窗' }).click();
  await expect(page.locator('#toast')).toContainText('眼位暂时无法使用', { timeout: 35000 });
  expect(await stopped(page)).toBe(true);
  await expect(page.locator('#eyes')).toHaveAttribute('aria-pressed', 'false');
});

test('late camera permission after exit cannot reactivate media', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
      const stream = canvas.captureStream(10);
      (window as unknown as { testStream: MediaStream }).testStream = stream;
      await new Promise(r => setTimeout(r, 1800));
      return stream;
    } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '打开这扇窗' }).click();
  await page.getByRole('button', { name: '退出沉浸' }).click();
  await expect.poll(() => stopped(page)).toBe(true);
  await expect(page.locator('#welcome')).toBeVisible();
});

test('scene chrome and standalone resources remain valid', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '先随便看看' }).click();
  await page.getByRole('button', { name: '切换环境' }).click();
  await page.locator('[data-environment="lake"]').click();
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#8a9087');
  expect((await (await request.get('/manifest.webmanifest')).json()).display).toBe('standalone');
  const icon = await request.get('/portal-icon.png');
  expect(icon.headers()['content-type']).toContain('image/png');
});

test('phone follow blocks drag and arrow turns but keeps taps and manual fallback', async ({ page }) => {
  await mockMotion(page);
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/scene-ready/);
  await page.getByRole('button', { name: '打开这扇窗' }).click();
  await pose(page, 90);
  await expect(page.locator('#tracking-status')).toContainText('随手机轻轻转动');
  const before = await pixels(page);
  expect(before.some(v => v !== 0 && v !== 255)).toBe(true);
  const drag = async () => {
    await page.mouse.move(100, 240);
    await page.mouse.down();
    await page.mouse.move(240, 280, { steps: 8 });
    await page.mouse.up();
  };
  await drag();
  await page.keyboard.press('ArrowRight');
  expect(await pixels(page)).toEqual(before);
  await page.locator('#world').click({ position: { x: 80, y: 200 } });
  await expect(page.locator('body')).not.toHaveClass(/controls-visible/);
  await page.locator('#world').click({ position: { x: 80, y: 200 } });
  await expect(page.locator('body')).toHaveClass(/controls-visible/);
  await page.getByRole('button', { name: '关闭手机跟随' }).click();
  await drag();
  expect(await pixels(page)).not.toEqual(before);
});

test('standalone uses neutral system background and a full-height canvas', async ({ page, request }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-standalone', 'true');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(11, 13, 16)');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(11, 13, 16)');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0b0d10');
  await page.getByRole('button', { name: '先随便看看' }).click();
  await page.getByRole('button', { name: '切换环境' }).click();
  await page.locator('[data-environment="lake"]').click();
  await expect(page.locator('#scene-name')).toHaveText('清晨湖畔');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0b0d10');
  for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    const canvas = await page.locator('#world').boundingBox();
    expect(canvas).toEqual({ x: 0, y: 0, ...size });
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  }
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.background_color).toBe('#0b0d10');
  expect(manifest.theme_color).toBe('#0b0d10');
});

test('text selection, context menus and native dragging are disabled without blocking controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#title')).toHaveCSS('user-select', 'none');
  for (const type of ['selectstart', 'contextmenu', 'dragstart']) {
    expect(await page.locator('#title').evaluate((element, type) => {
      return element.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    }, type)).toBe(false);
  }
  await page.getByRole('button', { name: '先随便看看' }).click();
  await page.getByRole('button', { name: '打开体验设置' }).click();
  await expect(page.locator('#view-title')).toHaveCSS('user-select', 'none');
  await page.locator('#performance-details summary').click();
  await expect(page.locator('#viewport-data')).toContainText('画布顶部');
  await expect(page.locator('#viewport-data')).toContainText('可见高度');
  await page.getByRole('button', { name: '关闭体验设置' }).click();
  await expect(page.locator('#view-dialog')).not.toBeVisible();
});
