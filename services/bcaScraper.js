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
    this.consecutiveFailedLogins = 0;
    this.lastLoginAttemptTime = 0;
    this.lastLoginError = null;
    this.isProcessing = false;
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
    // Emulate Jakarta Timezone
    await this.page.emulateTimezone('Asia/Jakarta').catch(e => {
      console.warn('[Scraper] Failed to set timezone to Asia/Jakarta:', e.message);
    });
  }

  async login() {
    const now = Date.now();
    // Cooldown check: if failed 3+ times, only retry once every 5 minutes (300,000 ms)
    if (this.consecutiveFailedLogins >= 3 && (now - this.lastLoginAttemptTime) < 300000) {
      const remainingSecs = Math.ceil((300000 - (now - this.lastLoginAttemptTime)) / 1000);
      throw new Error(`Login suspended due to 3+ consecutive failures. Retrying in ${remainingSecs} seconds.`);
    }

    this.lastLoginAttemptTime = now;
    console.log(`[Scraper] Navigating to https://qr.klikbca.com/ ...`);
    await this.page.goto('https://qr.klikbca.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });

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

    // Check if login failed (either by error text or because we are still on the login page)
    const loginFormExists = await this.page.evaluate(() => {
      return !!document.querySelector('input[type="email"], input[formcontrolname="username"], input[name="username"]');
    });

    if (loginFormExists) {
      this.consecutiveFailedLogins++;
      // Extract any visible error message on the page
      const errorMsg = await this.page.evaluate(() => {
        const errorElements = document.querySelectorAll('.alert, .text-danger, .error-message, [class*="error"], [class*="alert"]');
        for (const el of errorElements) {
          const text = el.innerText.trim();
          if (text) return text;
        }
        const bodyText = document.body.innerText;
        const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        for (const line of lines) {
          if (line.includes('salah') || line.includes('incorrect') || line.includes('gagal') || line.includes('tidak valid') || line.includes('captcha') || line.includes('wajib')) {
            return line;
          }
        }
        return 'Still on login page (possibly invalid credentials, captcha required, or blocked)';
      });

      this.lastLoginError = errorMsg;
      throw new Error(`Login failed: ${errorMsg}`);
    }

    this.isLoggedIn = true;
    this.consecutiveFailedLogins = 0; // Reset on success
    this.lastLoginError = null;
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
      // Is there an email/login/password input?
      if (document.querySelector('input[type="email"], input[type="password"], input[formcontrolname="username"], input[name="username"]')) {
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
      await this.page.goto('https://qr.klikbca.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.login();
    }

    // 3. Wait up to 10 seconds for the dashboard day/highlight buttons to load if not already visible
    try {
      await this.page.waitForSelector('.weekdays button, button.highlight', { timeout: 10000 });
    } catch (err) {
      console.warn('[Scraper] Dashboard day buttons did not load within 10s. Forcing page refresh...');
      // If the page is stuck, try a quick reload to recover
      await this.page.reload({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
    }

    // 4. Simulate human activity (move mouse, click neutral spot, scroll)
    await this.simulateHumanActivity();

    // 5. Refresh transaction list by clicking the active day button to query new data
    console.log('[Scraper] Refreshing transaction table...');
    await this.page.evaluate(() => {
      const highlightBtn = document.querySelector('.weekdays button.highlight, button.highlight');
      if (highlightBtn) {
        highlightBtn.click();
      } else {
        const dayButtons = document.querySelectorAll('.weekdays button');
        if (dayButtons.length > 0) {
          dayButtons[dayButtons.length - 1].click(); // Click last button (Today)
        }
      }
    }).catch(() => {});

    // Wait for data load
    await new Promise(r => setTimeout(r, 3000));

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
  } else {
    // If password changed, update it and reset failed login count so they can try again immediately
    if (session.password !== password) {
      console.log(`[Scraper] Credentials updated for ${email}. Resetting session status...`);
      session.password = password;
      session.consecutiveFailedLogins = 0;
      session.lastLoginAttemptTime = 0;
      session.isLoggedIn = false;
    }
  }

  if (session.isProcessing) {
    console.log(`[Scraper] Fetch already in progress for ${email}. Skipping concurrent call.`);
    return [];
  }

  session.isProcessing = true;

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

        // Parse exact time (e.g. 22.38 WIB) in Jakarta timezone (UTC+7)
        const timeMatch = col1.match(/(\d{2})[\.:](\d{2})\s*WIB/i);
        let txDate = new Date();
        if (timeMatch) {
          try {
            // Get current date components in Asia/Jakarta timezone
            const jktString = new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
            const jktDate = new Date(jktString);
            
            // Set hours and minutes based on parsed WIB time
            jktDate.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), 0, 0);
            
            const year = jktDate.getFullYear();
            const month = String(jktDate.getMonth() + 1).padStart(2, '0');
            const day = String(jktDate.getDate()).padStart(2, '0');
            const hours = String(jktDate.getHours()).padStart(2, '0');
            const minutes = String(jktDate.getMinutes()).padStart(2, '0');
            
            // Construct UTC date correctly using the '+07:00' WIB offset
            txDate = new Date(`${year}-${month}-${day}T${hours}:${minutes}:00+07:00`);
          } catch (e) {
            console.warn('[Scraper] Error parsing WIB time:', e.message);
            // Fallback to local time set
            txDate.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), 0, 0);
          }
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
    if (session) {
      session.lastLoginError = err.message;
    }
    
    // Check if the browser is still alive and responsive
    const isBrowserAlive = session.browser && typeof session.browser.connected === 'boolean' ? session.browser.connected : false;
    
    if (isBrowserAlive) {
      console.log(`[Scraper] Browser is still alive. Keeping browser open but marking loggedIn = false for retry.`);
      session.isLoggedIn = false;
      
      // Try to navigate to home page in background so it starts fresh next time
      try {
        if (session.page) {
          await session.page.goto('https://qr.klikbca.com/', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
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
  } finally {
    if (session) {
      session.isProcessing = false;
    }
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

function getSessionStatus(email) {
  const session = activeSessions[email];
  if (!session) return { status: 'disconnected', error: null };
  if (!session.browser) return { status: 'disconnected', error: 'Browser belum dimulai' };
  
  const now = Date.now();
  if (session.consecutiveFailedLogins >= 3 && (now - session.lastLoginAttemptTime) < 300000) {
    const remainingSecs = Math.ceil((300000 - (now - session.lastLoginAttemptTime)) / 1000);
    return { status: 'cooldown', error: `Login ditangguhkan (${remainingSecs}s). ${session.lastLoginError || ''}`.trim() };
  }
  
  return { 
    status: session.isLoggedIn ? 'connected' : 'disconnected', 
    error: session.isLoggedIn ? null : (session.lastLoginError || 'Belum login/kredensial salah')
  };
}

module.exports = {
  fetchBcaTransactions,
  closeSession,
  closeAllSessions,
  getSessionStatus
};
