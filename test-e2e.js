/* End-to-end smoke test: plays a full mission with Chromium's fake
   microphone (a test tone), from title screen to the mission report.
   Run from a folder where `playwright` is installed:
       node agent-briefing/test-e2e.js
   Screenshots go to $AB_SHOTS or ./.shots next to this file. */
'use strict';

const path = require('path');
const fs = require('fs');
const assert = require('assert/strict');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, path.join(__dirname, '..', 'recipe-tester')] }));

const OUT = process.env.AB_SHOTS || path.join(__dirname, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const SHOT = name => path.join(OUT, name + '.png');
const PAGE_URL = 'file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/') + '?debug';

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
  await page.click('.agent-gender-choice[data-gender="f"]');
  await page.click('[data-key="outfit"][data-val="coat"]');
  await page.click('#btn-agent-save');

  // archive
  await page.waitForSelector('.dossier-card');
  await page.click('[data-mode="briefing"]');
  await page.screenshot({ path: SHOT('1-archive') });
  await page.click('.dossier-card');

  // dossier (let the folder flip + facts type in)
  await page.waitForSelector('#btn-accept');
  await page.waitForTimeout(2600);
  await page.screenshot({ path: SHOT('2-dossier') });
  await page.click('#btn-accept');

  // Speaking remains the real recording path, including review and playback.
  async function recordFour(prefix = '') {
   for (let i = 0; i < 4; i++) {
    console.log('recording clip', i + 1);
    await page.waitForSelector('.mic-btn:not(.recording)', { timeout: 20000 });
    if (i === 0) {
      await page.waitForFunction(() =>
        document.querySelector('#fact-value')?.textContent.trim() &&
        document.querySelector('#prompt-big')?.textContent.trim());
      await page.waitForTimeout(450);
      await page.screenshot({ path: SHOT(prefix + '3a-mission-idle') });
    }
    await page.click('#btn-mic');
    await page.waitForSelector('.mic-btn.recording', { timeout: 20000 });
    if (i === 0) await page.screenshot({ path: SHOT(prefix + '3b-mission-recording') });
    await page.waitForTimeout(2200);
    await page.click('#btn-mic');
    await page.waitForSelector('#btn-send:not([disabled])', { timeout: 20000 });
    if (i === 0) await page.screenshot({ path: SHOT(prefix + '3-mission-review') });
    await page.click('#btn-send');
    await page.waitForTimeout(1300);
  }
  }
  await recordFour();

  // to headquarters
  await page.waitForSelector('#btn-to-debrief', { timeout: 20000 });
  await page.click('#btn-to-debrief');
  await page.waitForTimeout(3300);
  const avatarModel = await page.locator('#agent-slot svg.agent-svg').getAttribute('aria-label');
  if (avatarModel !== 'Female agent wearing coat') throw new Error('Player model did not retain customization: ' + avatarModel);
  if (await page.locator('#cmdr-slot, .table-edge, .conf-table').count()) throw new Error('Legacy commander or fake table still rendered');
  if (await page.locator('#stage-a .npcback-slot').count() !== 4) throw new Error('Four seated HQ listeners must remain visible');
  const audienceBottom = await page.locator('#stage-a .npc-backs').evaluate(el => getComputedStyle(el).bottom);
  if (parseFloat(audienceBottom) <= 0) throw new Error('HQ seated audience position invalid');
  if (await page.locator('#lead-official').count() !== 1) throw new Error('Seated HQ lead analyst missing');
  await page.screenshot({ path: SHOT('4a-debrief-avatar') });
  await page.waitForTimeout(4200);
  await page.screenshot({ path: SHOT('4b-debrief-audience') });

  // wait for the mission report
  await page.waitForSelector('#btn-new-mission', { timeout: 120000 });
  await page.screenshot({ path: SHOT('5-mission-report') });

  const briefingSave = await page.evaluate(() => JSON.parse(localStorage.getItem('agent-briefing-v1')));
  assert.equal(briefingSave.points,120);
  assert.equal(briefingSave.ops.completed,0);
  await page.click('#btn-again');
  await page.click('#btn-skip');
  await page.waitForSelector('#btn-new-mission', {timeout:30000});
  assert.equal(await page.evaluate(() => App.save.points),120,'briefing replay cannot re-award the bonus');

  async function capture(name) {
    for (const [width,height] of [[1366,768],[1280,800],[1024,600]]) {
      await page.setViewportSize({width,height});
      // Let finite entrance animations (pop-in overshoot) settle before measuring layout.
      await page.evaluate(() => Promise.race([new Promise(r => setTimeout(r, 1500)), Promise.all(document.getAnimations()
        .filter(a => isFinite(a.effect && a.effect.getComputedTiming().endTime)).map(a => a.finished.catch(() => {})))]));
      const overflow = await page.evaluate(() => ({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,
        offenders:Array.from(document.querySelectorAll('body *')).filter(e => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5; }).slice(0,4).map(e => e.tagName + '.' + e.className)}));
      assert.ok(overflow.width <= width && overflow.height <= height,`${name} overflows ${width}x${height}: ${JSON.stringify(overflow)}`);
      for (const button of await page.locator('#app button:visible').all()) {
        const rect = await button.boundingBox();
        assert.ok(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width + 1 && rect.y + rect.height <= height + 1, `${name}: control outside viewport`);
      }
      await page.screenshot({path:SHOT(`${name}-${width}x${height}`)});
    }
    await page.setViewportSize({width:1366,height:768});
  }
  async function fullOperation(number, firstReveal) {
    await page.click('#btn-new-mission');
    await page.click('[data-mode="full"]');
    await page.selectOption('#ops-intel','photo');
    await page.selectOption('#ops-intercept','cctv');
    await page.check('#ops-relaxed');
    await capture(`ops${number}-archive`);
    await page.click('.dossier-card[data-id="ben"]');
    assert.match(await page.locator('#assignment-card').innerText(),firstReveal ? /Locate the subject/ : /New training challenge: find Agent FOX CUB/);
    await capture(`ops${number}-assignment`);
    await page.click('#btn-assignment');
    await capture(`ops${number}-intel-intro`);
    await page.click('#btn-mg-start');
    await page.waitForSelector('.mg-photo');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForSelector('.mg-pause');
    await capture(`ops${number}-paused`);
    await page.getByRole('button',{name:'RESUME',exact:true}).click();
    // Play the real photo game: try frames 1-4 until each round confirms.
    for (let round = 0; round < 3; round++) {
      for (const key of ['1','2','3','4']) {
        await page.keyboard.press(key);
        await page.waitForTimeout(120);
        if ((await page.locator('#mgp-status').innerText()).startsWith('MATCH')) break;
      }
      await page.waitForTimeout(2000);
    }
    await page.waitForSelector('#btn-open-file', {timeout:10000});
    await capture(`ops${number}-intel-result`);
    await page.click('#btn-open-file');
    await page.waitForFunction(() => document.querySelectorAll('.new-intel').length === 3);
    await capture(`ops${number}-new-intel`);
    await page.click('#btn-accept');
    await recordFour(`ops${number}-`);
    await page.click('#btn-to-debrief');
    await page.click('#btn-skip');
    await page.waitForSelector('#btn-intercept',{timeout:30000});
    await capture(`ops${number}-subject-spotted`);
    const beforeReplay = await page.evaluate(() => App.save.points);
    await page.click('#btn-watch-debrief');
    await page.click('#btn-skip');
    await page.waitForSelector('#btn-intercept',{timeout:30000});
    assert.equal(await page.evaluate(() => App.save.points),beforeReplay);
    await page.click('#btn-intercept');
    await capture(`ops${number}-intercept-intro`);
    await page.click('#btn-mg-start');
    const initialSeed = await page.evaluate(() => (App.operation.seed + 0x9e3779b9 + App.operation.attempt) >>> 0);
    if (firstReveal) {
      await page.waitForSelector('.mg-cctv');
      await page.evaluate(() => __mgDone({ success: false, outcome: 'escaped', score: 30, wrongPicks: 0, markHides: 1, stats: {} }));
      await capture('ops-escape');
      const clipsBefore = await page.evaluate(() => App.clips.map(c => c.text));
      assert.equal(await page.evaluate(() => App.save.ops.badges.ESCAPE_SPECIALIST),1);
      await page.click('#btn-retry-intercept');
      await page.click('#btn-mg-start');
      assert.notEqual(await page.evaluate(() => (App.operation.seed + 0x9e3779b9 + App.operation.attempt) >>> 0),initialSeed);
      assert.deepEqual(await page.evaluate(() => App.clips.map(c => c.text)),clipsBefore);
    }
    await page.waitForSelector('.mg-cctv');
    await page.evaluate(() => __mgDone({ success: true, outcome: 'caught', score: 100, wrongPicks: 0, markHides: 2, stats: {} }));
    await capture(`ops${number}-caught`);
    await page.click('#btn-ending');
    await page.waitForSelector('#operation-ending');
    assert.equal(await page.locator('#operation-ending').getAttribute('data-reveal'),String(firstReveal));
    if (firstReveal) {
      await page.waitForTimeout(2300);
      await capture('ops-first-reveal');
      await page.click('#btn-skip-ending');
    } else {
      assert.match(await page.locator('#operation-ending').innerText(),/TRAINING CASE CLOSED/);
      await page.screenshot({path:SHOT('ops-short-ending')});
      await page.click('#btn-skip-ending');
    }
    await page.waitForSelector('#badge-ceremony');
    await capture(`ops${number}-ceremony`);
    for (let i = 0; i < 14 && await page.locator('#btn-next-badge').count(); i++) await page.click('#btn-next-badge');
    await page.waitForSelector('#btn-new-mission');
    await capture(`ops${number}-report`);
    assert.equal(await page.evaluate(() => App.save.ops.revealSeen),true);
    assert.equal(await page.evaluate(() => App.save.ops.completed),number);
    assert.equal(await page.evaluate(() => App.save.ops.intercepts),number);
    assert.equal(await page.evaluate(() => App.save.ops.badges.INTEL_AGENT),number);
    const afterReport = await page.evaluate(() => JSON.stringify(App.save));
    await page.click('#btn-again');
    await page.click('#btn-skip');
    await page.waitForSelector('#btn-new-mission',{timeout:30000});
    assert.equal(await page.evaluate(() => JSON.stringify(App.save)),afterReport,'operation rewatch cannot repeat rewards');
  }
  await fullOperation(1,true);
  await fullOperation(2,false);
  await page.click('#btn-new-mission');
  await page.click('#btn-badges');
  await capture('ops-badge-collection');
  await page.click('#btn-badges-back');
  await page.click('#btn-back-title');
  await page.click('#btn-badges');
  await page.waitForSelector('.badge-collection');

  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('agent-briefing-v1')));
  assert.equal(save.points,420);
  assert.equal(save.ops.byMark.ben,2);
  assert.ok(save.ops.best.photo >= 40 && save.ops.best.photo <= 100); assert.equal(save.ops.best.cctv,100);
  await browser.close();

  if (errors.length) {
    console.error('ERRORS:\n' + errors.join('\n'));
    process.exit(2);
  }
  if (!save || save.points < 120 || save.avatar.gender !== 'f' || save.avatar.outfit !== 'coat') {
    console.error('unexpected save state or agent customization');
    process.exit(3);
  }
  console.log('E2E OK — briefing, escape/retry, first reveal, short ending, badges and replay guards; ' + save.points + ' points.');
})().catch(e => {
  console.error('E2E FAILED:', e);
  process.exit(1);
});
