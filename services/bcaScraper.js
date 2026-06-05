let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  console.warn('[Scraper] Puppeteer is not installed. Automated BCA checks will run in simulation mode. Run "npm install puppeteer" in your workspace to enable.');
}

/**
 * Class to manage a persistent browser session for a BCA Merchant account.
 */
class BcaSession {
  constructor(email, password) {
    this.email = email;
    this.password = password;
    this.browser = null;
    this.page = null;
    this.isLoggedIn = false;
  }

  async launch() {
    if (!puppeteer) return;
    console.log(`[Scraper] Launching new persistent browser for ${this.email}...`);
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote'
      ]
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1280, height: 1025 });
  }

  async login() {
    console.log(`[Scraper] Navigating to https://qr.klikbca.com/ ...`);
    await this.page.goto('https://qr.klikbca.com/', { waitUntil: 'networkidle2', timeout: 30000 });

    const usernameSelector = 'input[type="email"], input[type="text"], input[formcontrolname="username"], input[name="username"]';
    const passwordSelector = 'input[type="password"], input[formcontrolname="password"], input[name="password"]';
    
    await this.page.waitForSelector(usernameSelector, { timeout: 15000 });
    await this.page.waitForSelector(passwordSelector, { timeout: 15000 });

    // Type credentials
    console.log('[Scraper] Entering credentials...');
    await this.page.focus(usernameSelector);
    await this.page.type(usernameSelector, this.email, { delay: 10 });
    await this.page.evaluate((sel, val) => {
      const el = document.querySelector(sel);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, usernameSelector, this.email);

    await this.page.focus(passwordSelector);
    await this.page.type(passwordSelector, this.password, { delay: 10 });
    await this.page.evaluate((sel, val) => {
      const el = document.querySelector(sel);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, passwordSelector, this.password);

    // Dismiss cookie banner
    await this.page.evaluate(() => {
      const closeBtn = document.querySelector('.cookies-banner .close, button.close, [class*="cookies"] .close, [class*="cookie"] button');
      if (closeBtn) closeBtn.click();
    }).catch(() => {});

    try {
      await this.page.screenshot({ path: 'public/screenshot-1-login.png' });
    } catch(e) {}

    // Click submit via evaluate
    console.log('[Scraper] Submitting Login form...');
    const clickedSubmit = await this.page.evaluate(() => {
      const btn = document.querySelector('button[type="submit"]');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    if (!clickedSubmit) {
      throw new Error('Submit button not found on login page.');
    }

    // Wait 7 seconds for login reaction/navigation
    await new Promise(r => setTimeout(r, 7000));

    // Check if login failed
    const pageText = await this.page.evaluate(() => document.body.innerText);
    if (pageText.includes('salah') || pageText.includes('incorrect') || pageText.includes('Gagal')) {
      throw new Error('Login failed: Kredensial salah atau diblokir.');
    }

    this.isLoggedIn = true;
    console.log('[Scraper] Login successful.');
  }

  async simulateHumanActivity() {
    if (!this.page) return;
    try {
      console.log(`[Scraper] Simulating human activity for ${this.email}...`);
      
      // 1. Move mouse randomly to simulate user behavior
      const x = Math.floor(Math.random() * 500) + 100;
      const y = Math.floor(Math.random() * 500) + 100;
      await this.page.mouse.move(x, y);

      // 2. Click a neutral spot on the screen (safe coordinates where it won't trigger any navigation)
      await this.page.mouse.click(10, 10);

      // 3. Scroll down and up slightly
      await this.page.evaluate(() => {
        window.scrollBy(0, 50);
        setTimeout(() => {
          window.scrollBy(0, -50);
        }, 500);
      });
      
      console.log('[Scraper] Human activity simulated successfully.');
    } catch (err) {
      console.warn('[Scraper] Failed to simulate human activity:', err.message);
    }
  }

  async refreshAndFetch() {
    // 1. Check current URL and page content to determine session state
    const sessionCheck = await this.page.evaluate(() => {
      // Is there an email/login input?
      if (document.querySelector('input[type="email"], input[formcontrolname="username"]')) {
        return 'login_page';
      }
      
      // Check for logout/expired indicators in body text
      const bodyText = document.body.innerText;
      if (bodyText.includes('Sesi Anda telah berakhir') || 
          bodyText.includes('Session has expired') || 
          bodyText.includes('silakan login') ||
          bodyText.includes('session timeout') ||
          bodyText.includes('Sesi berakhir')) {
        return 'expired';
      }
      
      return 'active';
    });

    console.log(`[Scraper] Session check for ${this.email}: ${sessionCheck} (isLoggedIn: ${this.isLoggedIn})`);

    // 2. Re-login if not logged in or in an inactive/expired state
    if (!this.isLoggedIn || sessionCheck === 'login_page' || sessionCheck === 'expired') {
      console.log(`[Scraper] Session is inactive or expired (check: ${sessionCheck}). Re-authenticating...`);
      this.isLoggedIn = false;
      
      // Navigate to home page to get a clean login form
      await this.page.goto('https://qr.klikbca.com/', { waitUntil: 'networkidle2', timeout: 30000 });
      await this.login();
    }

    // 3. Wait up to 10 seconds for the dashboard search/filter button to load if not already visible
    try {
      await this.page.waitForFunction(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.some(btn => {
          const txt = btn.textContent.trim();
          return txt.includes('Cari') || txt.includes('Tampilkan') || txt.includes('Filter');
        });
      }, { timeout: 10000 });
    } catch (err) {
      console.warn('[Scraper] Dashboard search/filter button did not load within 10s. Forcing page refresh...');
      // If the page is stuck, try a quick reload to recover
      await this.page.reload({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
    }

    // 4. Simulate human activity (move mouse, click neutral spot, scroll)
    await this.simulateHumanActivity();

    // 5. Refresh transaction list by clicking "Cari" or "Filter"
    console.log('[Scraper] Refreshing transaction table...');
    await this.page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const searchBtn = buttons.find(btn => {
        const txt = btn.textContent.trim();
        return txt.includes('Cari') || txt.includes('Tampilkan') || txt.includes('Filter');
      });
      if (searchBtn) {
        searchBtn.click();
      }
    }).catch(() => {});

    // Wait for data load
    await new Promise(r => setTimeout(r, 2000));

    try {
      await this.page.screenshot({ path: 'public/screenshot-3-final.png' });
    } catch(e) {}

    // 5. Extract table rows
    const transactions = await this.page.evaluate(() => {
      const result = [];
      const rows = document.querySelectorAll('table tr, tr.table-active, tbody tr');
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          result.push([cells[0].textContent.trim(), cells[1].textContent.trim()]);
        }
      });
      return result;
    });

    return transactions;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.isLoggedIn = false;
      console.log(`[Scraper] Closed browser session for ${this.email}.`);
    }
  }
}

// Active session storage map (email -> BcaSession instance)
const activeSessions = {};

async function fetchBcaTransactions(email, password) {
  if (!puppeteer) return [];

  let session = activeSessions[email];
  if (!session) {
    session = new BcaSession(email, password);
    activeSessions[email] = session;
  }

  try {
    // Open browser and log in if not already active
    if (!session.browser) {
      await session.launch();
      await session.login();
    } else {
      // If browser exists but login is false, trigger a login before proceeding
      if (!session.isLoggedIn) {
        console.log(`[Scraper] Browser exists but session isLoggedIn is false. Performing login...`);
        await session.login();
      }
    }

    // Refresh dashboard and parse list
    const rawList = await session.refreshAndFetch();
    
    const parsedList = [];
    for (const [col1, col2] of rawList) {
      const cleanAmtStr = col2.replace(/[^\d,]/g, '').replace(/,/g, '.');
      const amount = parseFloat(cleanAmtStr);

      if (isNaN(amount) || amount <= 0) {
        continue;
      }

      const isCredit = col2.includes('+');

      if (isCredit) {
        // Parse RRN reference
        const rrnMatch = col1.match(/RRN:\s*(\d+)/i);
        const rrn = rrnMatch ? rrnMatch[1] : null;

        // Parse exact time (e.g. 22.38 WIB)
        const timeMatch = col1.match(/(\d{2})[\.:](\d{2})\s*WIB/i);
        let txDate = new Date(); // Today
        if (timeMatch) {
          txDate.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), 0, 0);
        }

        parsedList.push({
          amount: amount,
          date: txDate.toISOString(),
          ref: rrn || `TXT-${amount}-${txDate.getTime()}`,
          details: col1
        });
      }
    }
    return parsedList;

  } catch (err) {
    console.error(`[Scraper] Session error for ${email}:`, err.message);
    
    // Check if the browser is still alive and responsive
    const isBrowserAlive = session.browser && typeof session.browser.connected === 'boolean' ? session.browser.connected : false;
    
    if (isBrowserAlive) {
      console.log(`[Scraper] Browser is still alive. Keeping browser open but marking loggedIn = false for retry.`);
      session.isLoggedIn = false;
      
      // Try to navigate to home page in background so it starts fresh next time
      try {
        if (session.page) {
          await session.page.goto('https://qr.klikbca.com/', { waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
        }
      } catch (e) {
        console.warn(`[Scraper] Could not return page to home URL:`, e.message);
      }
    } else {
      console.log(`[Scraper] Browser is dead or unresponsive. Closing session completely.`);
      await session.close();
      delete activeSessions[email];
    }
    return [];
  }
}

async function closeSession(email) {
  const session = activeSessions[email];
  if (session) {
    await session.close();
    delete activeSessions[email];
  }
}

async function closeAllSessions() {
  for (const email in activeSessions) {
    await closeSession(email);
  }
}

module.exports = {
  fetchBcaTransactions,
  closeSession,
  closeAllSessions
};
