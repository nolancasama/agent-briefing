/* End-to-end smoke test: plays a full mission with Chromium's fake
   microphone (a test tone), from title screen to the mission report.
   Run from a folder where `playwright` is installed:
       node agent-briefing/test-e2e.js
   Screenshots go to $AB_SHOTS or ./.shots next to this file. */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const OUT = process.env.AB_SHOTS || path.join(__dirname, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const SHOT = name => path.join(OUT, name + '.png');
const PAGE_URL = 'file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/');

(async () => {
  const errors = [];
  const browser = await chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await context.grantPermissions(['microphone']);
  const page = await context.newPage();
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  console.log('open', PAGE_URL);
  await page.goto(PAGE_URL);
  await page.evaluate(() => localStorage.removeItem('agent-briefing-v1'));
  await page.reload();
  await page.click('#btn-start');

  // first run -> Agent ID screen
  await page.waitForSelector('#btn-agent-save');
  await page.fill('#av-name', 'NOVA');
  await page.click('#btn-agent-save');

  // archive
  await page.waitForSelector('.dossier-card');
  await page.screenshot({ path: SHOT('1-archive') });
  await page.click('.dossier-card');

  // dossier (let the folder flip + facts type in)
  await page.waitForSelector('#btn-accept');
  await page.waitForTimeout(2600);
  await page.screenshot({ path: SHOT('2-dossier') });
  await page.click('#btn-accept');

  // speaking mission: 4 record/send rounds
  for (let i = 0; i < 4; i++) {
    console.log('recording clip', i + 1);
    await page.waitForSelector('.mic-btn:not(.recording)', { timeout: 20000 });
    if (i === 0) {
      await page.waitForFunction(() =>
        document.querySelector('#fact-value')?.textContent.trim() &&
        document.querySelector('#prompt-big')?.textContent.trim());
      await page.waitForTimeout(450);
      await page.screenshot({ path: SHOT('3a-mission-idle') });
    }
    await page.click('#btn-mic');
    await page.waitForSelector('.mic-btn.recording', { timeout: 20000 });
    if (i === 0) await page.screenshot({ path: SHOT('3b-mission-recording') });
    await page.waitForTimeout(2200);
    await page.click('#btn-mic');
    await page.waitForSelector('#btn-send:not([disabled])', { timeout: 20000 });
    if (i === 0) await page.screenshot({ path: SHOT('3-mission-review') });
    await page.click('#btn-send');
    await page.waitForTimeout(1300);
  }

  // to headquarters
  await page.waitForSelector('#btn-to-debrief', { timeout: 20000 });
  await page.click('#btn-to-debrief');
  await page.waitForTimeout(3300);
  await page.screenshot({ path: SHOT('4a-debrief-avatar') });
  await page.waitForTimeout(4200);
  await page.screenshot({ path: SHOT('4b-debrief-audience') });

  // wait for the mission report
  await page.waitForSelector('#btn-new-mission', { timeout: 120000 });
  await page.screenshot({ path: SHOT('5-mission-report') });

  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('agent-briefing-v1')));
  console.log('save after mission:', JSON.stringify(save));
  await browser.close();

  if (errors.length) {
    console.error('ERRORS:\n' + errors.join('\n'));
    process.exit(2);
  }
  if (!save || save.points < 120) {
    console.error('unexpected save state');
    process.exit(3);
  }
  console.log('E2E OK — full mission completed, ' + save.points + ' points.');
})().catch(e => {
  console.error('E2E FAILED:', e);
  process.exit(1);
});
