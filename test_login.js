const puppeteer = require('puppeteer');

(async () => {
  console.log('Starting browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1025 }); // Set height taller to fit button
  
  console.log('Navigating to KlikBCA Merchant...');
  await page.goto('https://qr.klikbca.com/', { waitUntil: 'networkidle2' });

  console.log('Waiting for selectors...');
  await page.waitForSelector('input[type="email"]');
  
  console.log('Typing email...');
  await page.focus('input[type="email"]');
  await page.type('input[type="email"]', 'kimmo.laau@gmail.com', { delay: 10 });
  await page.evaluate(() => {
    const el = document.querySelector('input[type="email"]');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

  console.log('Typing password...');
  await page.focus('input[type="password"]');
  await page.type('input[type="password"]', 'GanTeng188', { delay: 10 });
  await page.evaluate(() => {
    const el = document.querySelector('input[type="password"]');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // Try to close cookie banner if it exists
  console.log('Checking for cookie banner close button...');
  await page.evaluate(() => {
    const closeBtn = document.querySelector('.cookies-banner .close, button.close, [class*="cookies"] .close, [class*="cookie"] button');
    if (closeBtn) closeBtn.click();
    // Also try to find a button with 'x' or 'Tutup' or 'Setuju'
    const btns = Array.from(document.querySelectorAll('button, span, i'));
    const xBtn = btns.find(b => b.textContent.trim() === 'x' || b.className.includes('close') || b.className.includes('glyphicon-remove'));
    if (xBtn) xBtn.click();
  }).catch(() => {});

  console.log('Taking pre-click screenshot...');
  await page.screenshot({ path: 'public/test-pre-click.png' });

  console.log('Clicking submit button via JS evaluate (bypasses overlays)...');
  await page.evaluate(() => {
    const btn = document.querySelector('button[type="submit"]');
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  
  console.log('Waiting 10 seconds for login reaction...');
  await new Promise(r => setTimeout(r, 10000));
  
  console.log('Taking post-click screenshot...');
  await page.screenshot({ path: 'public/test-post-click.png' });
  
  const text = await page.evaluate(() => document.body.innerText);
  console.log('Page body text excerpt (first 500 chars):');
  console.log(text.slice(0, 500));
  
  console.log('Closing browser...');
  await browser.close();
  console.log('Done.');
})().catch(err => {
  console.error('Error occurred:', err);
});
