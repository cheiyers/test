/**
 * 实测：模板设计器中改二维码宽高后，DOM 尺寸是否真的变化
 */
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(page) {
  await page.goto('http://127.0.0.1:3789/', { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[name="username"]', { timeout: 10000 });
  await page.click('input[name="username"]', { clickCount: 3 });
  await page.type('input[name="username"]', 'admin');
  await page.click('input[name="password"]', { clickCount: 3 });
  await page.type('input[name="password"]', 'admin123');
  await page.click('#loginForm button');
  await page.waitForFunction(() => document.querySelector('#loginView')?.classList.contains('hidden'), { timeout: 15000 });
  await sleep(400);
}

async function measureCode(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.label-el.code');
    if (!el) return { error: 'no .label-el.code' };
    const body = el.querySelector('.el-body, [data-code-preview]');
    const graphic = el.querySelector('.code-graphic');
    const er = el.getBoundingClientRect();
    const br = body ? body.getBoundingClientRect() : null;
    const gr = graphic ? graphic.getBoundingClientRect() : null;
    return {
      el: { w: Math.round(er.width), h: Math.round(er.height) },
      body: br ? { w: Math.round(br.width), h: Math.round(br.height) } : null,
      graphic: gr ? { w: Math.round(gr.width), h: Math.round(gr.height) } : null,
      elStyle: { w: el.style.width, h: el.style.height },
      graphicStyle: graphic ? { w: graphic.style.width, h: graphic.style.height, maxH: graphic.style.maxHeight } : null,
      draftHint: document.querySelector('#elSizeHint')?.textContent || null,
      inputs: {
        w: document.querySelector('#elW')?.value,
        h: document.querySelector('#elH')?.value
      }
    };
  });
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900']
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  await page.setViewport({ width: 1400, height: 900 });

  try {
    await login(page);
    await page.waitForSelector('[data-page="templates"]', { timeout: 10000 });
    await page.click('[data-page="templates"]');
    await page.waitForSelector('#newMasterTpl', { timeout: 10000 });
    await page.click('#newMasterTpl');
    await page.waitForSelector('#labelCanvas', { timeout: 10000 });
    await page.waitForSelector('.label-el.code', { timeout: 5000 });
    await page.click('.label-el.code');
    await sleep(400);

    const before = await measureCode(page);
    console.log('BEFORE', JSON.stringify(before, null, 2));

    await page.evaluate(() => {
      const w = document.querySelector('#elW');
      const h = document.querySelector('#elH');
      if (!w || !h) throw new Error('missing elW/elH inputs');
      // 只改宽：旧逻辑会因 X=60 裁成 40 且高仍 35，码图不变；新逻辑应变成 50×50 并左移
      w.value = '50';
      h.value = '35';
      document.querySelector('#applyEl')?.click();
    });
    await sleep(600);
    const mid = await measureCode(page);
    console.log('AFTER intend 50 (from 35)', JSON.stringify(mid, null, 2));

    await page.evaluate(() => {
      document.querySelector('#elW').value = '15';
      document.querySelector('#elH').value = '15';
      document.querySelector('#applyEl')?.click();
    });
    await sleep(600);
    const after = await measureCode(page);
    console.log('AFTER 15x15', JSON.stringify(after, null, 2));

    const midSide = Number(mid.inputs?.w);
    const elGrew = mid.el.w >= before.el.w + 40 && midSide >= 49;
    const elShrunk = after.el.w <= 100;
    const gGrew = (mid.graphic?.w || 0) >= (before.graphic?.w || 0) + 40;
    const gShrunk = (after.graphic?.w || 0) <= 100;
    const square = Math.abs((mid.el.w || 0) - (mid.el.h || 0)) <= 2;
    console.log('RESULT', { elGrew, elShrunk, gGrew, gShrunk, square, midSide });

    if (!elGrew || !gGrew || !square) {
      console.error('FAIL: QR did not grow to 50mm square');
      process.exitCode = 2;
    } else if (!elShrunk || !gShrunk) {
      console.error('FAIL: QR did not shrink to 15mm');
      process.exitCode = 3;
    } else {
      console.log('PASS');
    }
  } catch (e) {
    console.error('TEST ERROR', e);
    process.exitCode = 1;
    try {
      console.error('BODY', await page.evaluate(() => document.body.innerText.slice(0, 2000)));
    } catch (_) {}
  } finally {
    await browser.close();
  }
})();
