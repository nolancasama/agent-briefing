'use strict';

/*
 * LEGACY / DISABLED / UNSUPPORTED
 *
 * The former consumer-site delivery implementation is preserved below so the
 * adapter boundary is explicit and its behavior is not hidden in generate.js.
 * Automating the ChatGPT consumer website is disabled: prepare() always refuses
 * before Playwright is loaded, a browser is launched, or data is submitted.
 */

const CHATGPT_URL = 'https://chatgpt.com';
const MIN_DELAY_MS = 5_000;
const MAX_DELAY_MS = 10_000;
const TIMEOUT_MS = 10 * 60 * 1_000;
const SELECTORS = {
  composer: ['#prompt-textarea', 'textarea[placeholder*="Message"]', '[contenteditable="true"][role="textbox"]'],
  generationIndicator: ['[data-testid="stop-button"]', '[aria-label*="generating" i]', '[aria-label*="creating image" i]', 'button[aria-label*="Stop" i]'],
  attachButton: ['button[aria-label*="attach" i]', 'button[aria-label*="upload" i]', 'button[data-testid*="attach" i]'],
  assistantMessage: '[data-message-author-role="assistant"]',
};
const COMPOSER_SELECTOR = SELECTORS.composer.join(', ');
const GENERATION_SELECTOR = SELECTORS.generationIndicator.join(', ');
const ATTACH_SELECTOR = SELECTORS.attachButton.join(', ');
const GENERATION_ERROR_PATTERN = /something went wrong|an error occurred|unable to (?:generate|create)|failed to (?:generate|create)|generation failed/i;

async function isVisible(locator) { return locator.isVisible().catch(() => false); }
async function waitForNoGeneration(page, timeout = TIMEOUT_MS) {
  const indicator = page.locator(GENERATION_SELECTOR).first();
  const deadline = Date.now() + timeout;
  while (await isVisible(indicator)) {
    if (Date.now() >= deadline) throw new Error('ChatGPT was still generating when the timeout expired.');
    await page.waitForTimeout(250);
  }
}
async function getAssistantState(page) {
  return page.locator(SELECTORS.assistantMessage).evaluateAll((messages) => {
    const last = messages.at(-1);
    if (!last) return { count: 0, signature: '', text: '' };
    return { count: messages.length, signature: `${last.innerText}|images:${last.querySelectorAll('img').length}`, text: last.innerText };
  });
}
async function beginGenerationObservation(page) {
  const initialAssistantState = await getAssistantState(page);
  await page.evaluate(() => {
    window.__agentArtRunner = { lastChangeAt: Date.now() };
    window.__agentArtRunnerObserver?.disconnect();
    window.__agentArtRunnerObserver = new MutationObserver(() => { window.__agentArtRunner.lastChangeAt = Date.now(); });
    window.__agentArtRunnerObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  return initialAssistantState;
}
async function waitForChatReady(page, timeout = TIMEOUT_MS) {
  const composer = page.locator(COMPOSER_SELECTOR).first();
  await composer.waitFor({ state: 'visible', timeout });
  await waitForNoGeneration(page, timeout);
  return composer;
}
async function waitForGenerationComplete(page, initial, timeout = TIMEOUT_MS) {
  const indicator = page.locator(GENERATION_SELECTOR).first();
  const deadline = Date.now() + timeout;
  let generationWasVisible = false;
  let assistantResponded = false;
  try {
    while (Date.now() < deadline) {
      const generating = await isVisible(indicator);
      generationWasVisible ||= generating;
      const current = await getAssistantState(page);
      assistantResponded ||= current.count > initial.count || current.signature !== initial.signature;
      if (assistantResponded && GENERATION_ERROR_PATTERN.test(current.text)) {
        throw new Error(`ChatGPT reported a generation error: ${current.text.slice(0, 200)}`);
      }
      const observed = await page.evaluate(() => window.__agentArtRunner);
      const stable = observed && Date.now() - observed.lastChangeAt >= 5_000;
      if ((generationWasVisible && !generating) || (!generating && assistantResponded && stable)) return;
      await page.waitForTimeout(250);
    }
    throw new Error(`Generation did not complete within ${Math.round(timeout / 60_000)} minutes.`);
  } finally {
    await page.evaluate(() => window.__agentArtRunnerObserver?.disconnect()).catch(() => {});
  }
}
async function attachReference(page, absolutePath) {
  let input = page.locator('input[type="file"]').last();
  if (await input.count() === 0) {
    const button = page.locator(ATTACH_SELECTOR).first();
    if (!await isVisible(button)) throw new Error('Could not find ChatGPT image attachment control.');
    await button.click();
    input = page.locator('input[type="file"]').last();
    await input.waitFor({ state: 'attached', timeout: 10_000 });
  }
  await input.setInputFiles(absolutePath);
  await page.waitForTimeout(1_500);
}
async function submitPrompt(page, prompt, referencePath = null) {
  const composer = await waitForChatReady(page);
  if (referencePath) await attachReference(page, referencePath);
  const initial = await beginGenerationObservation(page);
  await composer.click();
  await composer.press('Control+A');
  await page.keyboard.insertText(prompt);
  await page.keyboard.press('Enter');
  await waitForGenerationComplete(page, initial);
}
async function downloadLatestImage(page) {
  const message = page.locator(SELECTORS.assistantMessage).last();
  const images = message.locator('img');
  const candidates = [];
  for (let index = 0; index < await images.count(); index += 1) {
    const image = images.nth(index);
    const info = await image.evaluate((element) => ({
      src: element.currentSrc || element.src, width: element.naturalWidth, height: element.naturalHeight, alt: element.alt,
    })).catch(() => null);
    if (info?.src && info.width >= 256 && info.height >= 256) candidates.push({ image, info });
  }
  if (!candidates.length) throw new Error('ChatGPT response completed but no generated image was found.');
  const selected = candidates.at(-1);
  const fetched = await page.evaluate(async (src) => {
    try {
      const response = await fetch(src);
      if (!response.ok) return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      return btoa(binary);
    } catch { return null; }
  }, selected.info.src);
  if (fetched) {
    const bytes = Buffer.from(fetched, 'base64');
    if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return bytes;
  }
  const canvasPng = await selected.image.evaluate(async (element) => {
    try {
      if (!element.complete) await new Promise((resolve) => element.addEventListener('load', resolve, { once: true }));
      const canvas = document.createElement('canvas');
      canvas.width = element.naturalWidth; canvas.height = element.naturalHeight;
      canvas.getContext('2d').drawImage(element, 0, 0);
      return canvas.toDataURL('image/png').split(',')[1];
    } catch { return null; }
  });
  if (canvasPng) return Buffer.from(canvasPng, 'base64');
  return selected.image.screenshot({ type: 'png', omitBackground: true });
}
async function randomDelay(page) {
  await page.waitForTimeout(MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)));
}

// Frozen legacy orchestration retained for reference; deliberately unreachable.
async function legacyGenerateCandidate({ profileDirectory, prompt, referencePath }) {
  const { chromium } = require('playwright');
  const context = await chromium.launchPersistentContext(profileDirectory, {
    channel: 'chrome', headless: false, viewport: { width: 1440, height: 1000 },
  });
  try {
    const page = context.pages()[0] || await context.newPage();
    await page.goto(CHATGPT_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await randomDelay(page);
    await submitPrompt(page, prompt, referencePath);
    return downloadLatestImage(page);
  } finally {
    await context.close();
  }
}

async function prepare(_context, config = {}) {
  if (config.generator !== 'playwright') {
    throw new Error('Refusing to run the legacy Playwright adapter because art/config.json does not explicitly select "playwright".');
  }
  throw new Error(
    'The legacy Playwright ChatGPT adapter is disabled and unsupported because consumer-site automation is not an allowed art workflow. Use generator "manual".',
  );
}

module.exports = { prepare };
