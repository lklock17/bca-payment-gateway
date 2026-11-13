const puppeteer = require('puppeteer');
const { loadDotEnv } = require('./backend/config/env');

loadDotEnv();

const bcaUser = process.env.BCA_USER;
const bcaPass = process.env.BCA_PASS;

if (!bcaUser || !bcaPass) {
  console.error('[Error] Set BCA_USER and BCA_PASS in .env or environment variables.');
  process.exit(1);
}

(async () => {
  console.log('Starting browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1025 });

  console.log('Navigating to KlikBCA Merchant...');
  await page.goto('https://qr.klikbca.com/', { waitUntil: 'networkidle2' });

  console.log('Waiting for selectors...');
  await page.waitForSelector('input[type="email"]');

  console.log('Typing email...');
  await page.focus('input[type="email"]');
  await page.type('input[type="email"]', bcaUser, { delay: 10 });
  await page.evaluate(() => {
    const el = document.querySelector('input[type="email"]');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

  console.log('Typing password...');
  await page.focus('input[type="password"]');
  await page.type('input[type="password"]', bcaPass, { delay: 10 });
  await page.evaluate(() => {
    const el = document.querySelector('input[type="password"]');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await page.evaluate(() => {
    const closeBtn = document.querySelector('.cookies-banner .close, button.close, [class*="cookies"] .close, [class*="cookie"] button');
    if (closeBtn) closeBtn.click();
  }).catch(() => {});

  console.log('Clicking submit button...');
  await page.evaluate(() => {
    const btn = document.querySelector('button[type="submit"]');
    if (btn) btn.click();
  });

  console.log('Waiting 10 seconds for login reaction...');
  await new Promise((r) => setTimeout(r, 10000));

  const text = await page.evaluate(() => document.body.innerText);
  console.log('Page body text excerpt (first 500 chars):');
  console.log(text.slice(0, 500));

  await browser.close();
  console.log('Done.');
})().catch((err) => {
  console.error('Error occurred:', err);
});
