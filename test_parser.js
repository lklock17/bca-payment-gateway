const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1025 });
  await page.goto('https://qr.klikbca.com/', { waitUntil: 'networkidle2' });

  await page.waitForSelector('input[type="email"]');
  
  await page.type('input[type="email"]', 'kimmo.laau@gmail.com');
  await page.type('input[type="password"]', 'GanTeng188');

  await page.evaluate(() => {
    const btn = document.querySelector('button[type="submit"]');
    if (btn) btn.click();
  });
  
  await new Promise(r => setTimeout(r, 6000));
  
  const elements = await page.evaluate(() => {
    // Let's find all divs that contain RRN: and see their inner structure
    const all = Array.from(document.querySelectorAll('*'));
    return all
      .filter(el => el.innerText && el.innerText.includes('RRN:') && el.innerText.includes('Rp') && el.children.length > 0)
      .map(el => ({
        tag: el.tagName,
        className: el.className,
        id: el.id,
        childrenCount: el.children.length,
        html: el.outerHTML.slice(0, 300)
      }));
  });
  
  console.log('Detected elements count:', elements.length);
  console.log('Sample elements:');
  console.log(JSON.stringify(elements.slice(0, 10), null, 2));

  await browser.close();
})().catch(err => console.error(err));
