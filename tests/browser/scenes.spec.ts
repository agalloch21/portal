import { expect, test, type Page } from '@playwright/test';

async function sample(page: Page) {
  return page.evaluate(() => new Promise<number[]>(resolve => requestAnimationFrame(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#world')!;
    const gl = canvas.getContext('webgl2')!, data = new Uint8Array(4 * 32 * 32);
    gl.readPixels(Math.floor(canvas.width / 2) - 16, Math.floor(canvas.height / 2) - 16, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, data);
    resolve(Array.from(data));
  })));
}

async function fingerprint(page: Page) {
  return page.evaluate(() => new Promise<number>(resolve => requestAnimationFrame(() => {
    const c = document.querySelector<HTMLCanvasElement>('#world')!, gl = c.getContext('webgl2')!;
    const data = new Uint8Array(c.width * c.height * 4); gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    let hash = 2166136261; for (const byte of data) hash = Math.imul(hash ^ byte, 16777619); resolve(hash >>> 0);
  })));
}

test('all eight scenes render, switch and have real preview assets on a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-environment', 'dream');
  await page.locator('#browse').click();
  expect(await page.locator('.scene-option').evaluateAll(nodes => nodes.map(n => (n as HTMLElement).dataset.environment))).toEqual(['dream', 'underwater', 'space', 'greenhouse', 'clouds', 'moonforest', 'forest', 'lake']);
  const images = new Set<string>();
  for (const [id, name] of [['dream', '星海浅眠'], ['underwater', '浅蓝之下'], ['space', '星云缓行'], ['greenhouse', '星间花房'], ['clouds', '云端花海'], ['moonforest', '月隐灵森'], ['forest', '林间微光'], ['lake', '清晨湖畔']]) {
    await page.locator('#scenes').click();
    await expect(page.locator('.scene-option')).toHaveCount(8);
    expect(await page.locator('.scene-option img').evaluateAll(imgs => imgs.every(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await page.locator(`button[data-environment="${id}"]`).click();
    await expect(page.locator('#scene-name')).toHaveText(name);
    await expect(page).toHaveURL(new RegExp(`scene=${id}`));
    const pixels = await sample(page);
    expect(pixels.some(v => v !== 0 && v !== 255)).toBe(true);
    images.add(JSON.stringify(pixels));
    await page.screenshot({ path: test.info().outputPath(`${id}.png`) });
    expect(await page.locator('#world').boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  }
  expect(images.size).toBe(8);
  expect(errors).toEqual([]);
});

for (const scene of ['dream', 'underwater', 'space', 'greenhouse', 'clouds', 'moonforest', 'forest', 'lake']) test(`ambient movement can pause in ${scene} while reduced-motion entry remains usable`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?scene=' + scene);
  await expect(page.locator('body')).toHaveAttribute('data-environment', 'dream');
  await page.locator('#browse').click();
  await expect(page.locator('body')).toHaveAttribute('data-environment', scene);
  await page.locator('#view-settings').click();
  await expect(page.locator('#ambient-motion')).toHaveAttribute('aria-pressed', 'false');
  const before = await fingerprint(page); await page.waitForTimeout(180);
  expect(await fingerprint(page)).toEqual(before);
  await page.locator('#ambient-motion').click();
  await expect(page.locator('#ambient-motion')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await fingerprint(page)) !== before).toBe(true);
  await page.locator('#ambient-motion').click();
  const frozen = await fingerprint(page); await page.waitForTimeout(180);
  expect(await fingerprint(page)).toEqual(frozen);
});

test('a late panorama load cannot replace a newer panorama choice', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/star-greenhouse.png', async route => { await gate; await route.continue(); });
  await page.goto('/', { waitUntil: 'domcontentloaded' }); await page.locator('#browse').click();
  await page.locator('#scenes').click(); await page.locator('[data-environment="greenhouse"]').click();
  await page.locator('#scenes').click(); await page.locator('[data-environment="underwater"]').click();
  await expect(page.locator('#scene-name')).toHaveText('浅蓝之下');
  release(); await page.waitForTimeout(600);
  await expect(page.locator('body')).toHaveAttribute('data-environment', 'underwater');
  await expect(page.locator('#scene-name')).toHaveText('浅蓝之下');
});

test('panorama longitude seam does not pick a coarse contrasting mip', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Equal rear edges, contrasting front: the entire rear view must stay red, even at the wrap.
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#993333'; ctx.fillRect(0, 0, 1024, 512);
    ctx.fillStyle = '#333399'; ctx.fillRect(256, 0, 512, 512);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.route('**/lake-8k.jpg', route => route.fulfill({ contentType: 'image/png', body: Buffer.from(png, 'base64') }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?scene=lake'); await page.locator('#browse').click();
  await expect(page.locator('body')).toHaveAttribute('data-environment', 'lake');
  for (let i = 0; i < 63; i++) await page.keyboard.press('ArrowLeft');
  const row = await page.evaluate(() => new Promise<number[]>(resolve => requestAnimationFrame(() => {
    const c = document.querySelector<HTMLCanvasElement>('#world')!, gl = c.getContext('webgl2')!;
    const data = new Uint8Array(c.width * 4);
    gl.readPixels(0, Math.floor(c.height / 2), c.width, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
    resolve(Array.from(data));
  })));
  for (let i = 0; i < row.length; i += 4) {
    expect(row[i]).toBeGreaterThan(145);
    expect(row[i + 2]).toBeLessThan(80);
  }
});
