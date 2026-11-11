let puppeteer = null;
let puppeteerLoadError = null;

async function getPuppeteer() {
  if (puppeteer) return puppeteer;
  try {
    puppeteer = require('puppeteer');
    return puppeteer;
  } catch (e) {
    if (e && e.code === 'ERR_REQUIRE_ESM') {
      try {
        const mod = await import('puppeteer');
        puppeteer = mod.default || mod;
        return puppeteer;
      } catch (esmErr) {
        puppeteerLoadError = esmErr;
        console.warn('[Scraper] Failed to load Puppeteer via dynamic import:', esmErr.message);
        return null;
      }
    }
    puppeteerLoadError = e;
    console.warn('[Scraper] Puppeteer is not installed. Automated BCA checks will run in simulation mode. Run "npm install puppeteer" in your workspace to enable.');
    return null;
  }
}

let jsQR = null;
try {
  jsQR = require('jsqr');
} catch (e) {
  console.warn('[Scraper] jsQR is not installed. Auto-fetch QRIS decoding requires "jsqr".');
}

const qrisUtil = require('../utils/qris');

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
    const pup = await getPuppeteer();
    if (!pup) return;
    console.log(`[Scraper] Launching new persistent browser for ${this.email}...`);
    this.browser = await pup.launch({
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
    await this.page.evaluate((selUser, valUser, selPass, valPass) => {
      const elUser = document.querySelector(selUser);
      const elPass = document.querySelector(selPass);
      if (elUser) {
        elUser.value = valUser;
        elUser.dispatchEvent(new Event('input', { bubbles: true }));
        elUser.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (elPass) {
        elPass.value = valPass;
        elPass.dispatchEvent(new Event('input', { bubbles: true }));
        elPass.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, usernameSelector, this.email, passwordSelector, this.password);

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
      const bodyText = document.body.innerText.toLowerCase();
      if (bodyText.includes('sesi anda telah berakhir') || 
          bodyText.includes('sesi anda telah habis') || 
          bodyText.includes('session has expired') || 
          bodyText.includes('silakan login') ||
          bodyText.includes('silahkan login') ||
          bodyText.includes('session timeout') ||
          bodyText.includes('sesi berakhir') ||
          bodyText.includes('koneksi ke qr merchant service bca terputus')) {
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
      await this.page.waitForSelector('button.btn-datepicker, .weekdays button, button.highlight', { timeout: 10000 });
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
      const highlightBtn = document.querySelector('button.btn-datepicker.highlight, .weekdays button.highlight, button.highlight');
      if (highlightBtn) {
        highlightBtn.click();
      } else {
        const dayButtons = document.querySelectorAll('button.btn-datepicker, .weekdays button');
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

    // 5. Extract transaction rows (Modern Angular .transaction-details + fallback table layout)
    const transactions = await this.page.evaluate(() => {
      const result = [];
      const detailCards = document.querySelectorAll('.transaction-container .transaction-details, .transaction-details');
      if (detailCards.length > 0) {
        detailCards.forEach(card => {
          const leftEl = card.querySelector('.left');
          const rightEl = card.querySelector('.right');
          if (leftEl && rightEl) {
            result.push([
              leftEl.textContent.replace(/\s+/g, ' ').trim(),
              rightEl.textContent.replace(/\s+/g, ' ').trim()
            ]);
          }
        });
      }
      if (result.length === 0) {
        const rows = document.querySelectorAll('table tr, tr.table-active, tbody tr');
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            result.push([cells[0].textContent.trim(), cells[1].textContent.trim()]);
          }
        });
      }
      return result;
    });

    return transactions;
  }

  async extractStaticQris() {
    if (!jsQR) {
      throw new Error('Package jsqr belum terpasang di server.');
    }
    if (!this.page) {
      throw new Error('Halaman browser belum diinisialisasi.');
    }

    // 1. Check current URL and page content to determine session state
    const sessionCheck = await this.page.evaluate(() => {
      if (document.querySelector('input[type="email"], input[type="password"], input[formcontrolname="username"], input[name="username"]')) {
        return 'login_page';
      }
      const bodyText = document.body.innerText.toLowerCase();
      if (
        bodyText.includes('sesi anda telah berakhir') ||
        bodyText.includes('sesi anda telah habis') ||
        bodyText.includes('session has expired') ||
        bodyText.includes('silakan login') ||
        bodyText.includes('silahkan login') ||
        bodyText.includes('session timeout') ||
        bodyText.includes('sesi berakhir') ||
        bodyText.includes('koneksi ke qr merchant service bca terputus')
      ) {
        return 'expired';
      }
      return 'active';
    });

    if (!this.isLoggedIn || sessionCheck === 'login_page' || sessionCheck === 'expired') {
      console.log(`[Scraper] Session inactive during QRIS fetch (${sessionCheck}). Re-authenticating...`);
      this.isLoggedIn = false;
      await this.page.goto('https://qr.klikbca.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.login();
    }

    // 2. Navigate to /show-qr (prefer clicking a[href="/show-qr"] if present, fallback to direct goto)
    console.log('[Scraper] Navigating to https://qr.klikbca.com/show-qr ...');
    const clickedLink = await this.page.evaluate(() => {
      const link = document.querySelector('a[href="/show-qr"], a[href*="/show-qr"]');
      if (link) {
        link.click();
        return true;
      }
      return false;
    }).catch(() => false);

    if (clickedLink) {
      try {
        await this.page.waitForSelector('img.image-qr', { timeout: 8000 });
      } catch (e) {
        await this.page.goto('https://qr.klikbca.com/show-qr', { waitUntil: 'networkidle2', timeout: 30000 });
      }
    } else {
      await this.page.goto('https://qr.klikbca.com/show-qr', { waitUntil: 'networkidle2', timeout: 30000 });
    }

    // 3. Wait for img.image-qr and ensure image has finished loading
    await this.page.waitForSelector('img.image-qr', { timeout: 15000 });
    await this.page.waitForFunction(() => {
      const img = document.querySelector('img.image-qr');
      return Boolean(img && img.complete && img.naturalWidth > 0 && img.src);
    }, { timeout: 15000 });

    // 4. Extract canvas pixels from img.image-qr
    let pixelData = null;
    try {
      pixelData = await this.page.evaluate(() => {
        const img = document.querySelector('img.image-qr');
        if (!img) return null;
        const w = img.naturalWidth || img.width || 400;
        const h = img.naturalHeight || img.height || 400;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);
        return {
          width: w,
          height: h,
          data: Array.from(imgData.data)
        };
      });
    } catch (canvasErr) {
      console.warn('[Scraper] Direct canvas getImageData failed, falling back to element screenshot:', canvasErr.message);
    }

    let decoded = null;
    if (pixelData && pixelData.data && pixelData.data.length > 0) {
      const rgba = new Uint8ClampedArray(pixelData.data);
      decoded = jsQR(rgba, pixelData.width, pixelData.height, {
        inversionAttempts: 'attemptBoth'
      });
    }

    // Fallback: screenshot the QR image element and decode via clean data URL canvas
    if (!decoded || !decoded.data) {
      const imgEl = await this.page.$('img.image-qr');
      if (imgEl) {
        const b64 = await imgEl.screenshot({ encoding: 'base64' });
        const fallbackPixels = await this.page.evaluate(async (base64Png) => {
          return await new Promise((resolve, reject) => {
            const tempImg = new Image();
            tempImg.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = tempImg.width;
              canvas.height = tempImg.height;
              const ctx = canvas.getContext('2d');
              ctx.fillStyle = '#FFFFFF';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(tempImg, 0, 0);
              const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              resolve({
                width: canvas.width,
                height: canvas.height,
                data: Array.from(imgData.data)
              });
            };
            tempImg.onerror = () => reject(new Error('Gagal memuat screenshot QR ke canvas'));
            tempImg.src = `data:image/png;base64,${base64Png}`;
          });
        }, b64);

        if (fallbackPixels && fallbackPixels.data && fallbackPixels.data.length > 0) {
          const rgba = new Uint8ClampedArray(fallbackPixels.data);
          decoded = jsQR(rgba, fallbackPixels.width, fallbackPixels.height, {
            inversionAttempts: 'attemptBoth'
          });
        }
      }
    }

    // Navigate back to main dashboard so background polling stays on mutasi view
    await this.page.goto('https://qr.klikbca.com/home', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});

    if (!decoded || !decoded.data) {
      throw new Error('Gagal men-decode string QRIS dari elemen img.image-qr.');
    }

    const qrisString = decoded.data.trim();
    if (!qrisUtil.validateQRIS(qrisString)) {
      throw new Error('String QRIS hasil decode gagal validasi checksum EMVCo CRC16.');
    }
    console.log(`[Scraper] Static QRIS decoded & validated successfully (length: ${qrisString.length}).`);
    return qrisString;
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
  const pup = await getPuppeteer();
  if (!pup) return [];

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
        // Parse RRN reference (supports "RRN: 123" and "RRN : 123")
        const rrnMatch = col1.match(/RRN\s*:\s*([a-zA-Z0-9]+)/i);
        const rrn = rrnMatch ? rrnMatch[1] : null;

        // Parse exact time (supports "12:43:24 WIB" and "22.38 WIB") in Jakarta timezone (UTC+7)
        const timeMatch = col1.match(/(\d{2})[\.:](\d{2})(?:[\.:](\d{2}))?\s*WIB/i);
        let txDate = new Date();
        if (timeMatch) {
          try {
            // Get current date components in Asia/Jakarta timezone
            const jktString = new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
            const jktDate = new Date(jktString);
            
            const hNum = parseInt(timeMatch[1], 10);
            const mNum = parseInt(timeMatch[2], 10);
            const sNum = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
            // Set hours, minutes, seconds based on parsed WIB time
            jktDate.setHours(hNum, mNum, sNum, 0);
            
            const year = jktDate.getFullYear();
            const month = String(jktDate.getMonth() + 1).padStart(2, '0');
            const day = String(jktDate.getDate()).padStart(2, '0');
            const hours = String(jktDate.getHours()).padStart(2, '0');
            const minutes = String(jktDate.getMinutes()).padStart(2, '0');
            const seconds = String(jktDate.getSeconds()).padStart(2, '0');
            
            // Construct UTC date correctly using the '+07:00' WIB offset
            txDate = new Date(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}+07:00`);
          } catch (e) {
            console.warn('[Scraper] Error parsing WIB time:', e.message);
            // Fallback to local time set
            txDate.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), timeMatch[3] ? parseInt(timeMatch[3], 10) : 0, 0);
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

async function fetchStaticQris(email, password) {
  const pup = await getPuppeteer();
  if (!pup) {
    throw new Error('Puppeteer tidak tersedia di server untuk auto-fetch QRIS.');
  }
  if (!jsQR) {
    throw new Error('Package jsqr tidak tersedia di server untuk decode QRIS.');
  }

  let session = activeSessions[email];
  if (!session) {
    session = new BcaSession(email, password);
    activeSessions[email] = session;
  } else if (session.password !== password) {
    console.log(`[Scraper] Credentials updated for ${email}. Resetting session status...`);
    session.password = password;
    session.consecutiveFailedLogins = 0;
    session.lastLoginAttemptTime = 0;
    session.isLoggedIn = false;
  }

  // Wait if background polling is currently using this session (up to 25s)
  let waitAttempts = 0;
  while (session.isProcessing && waitAttempts < 50) {
    await new Promise((r) => setTimeout(r, 500));
    waitAttempts++;
  }
  if (session.isProcessing) {
    throw new Error('Sesi scraper sedang sibuk memproses pengecekan transaksi. Coba lagi sebentar lagi.');
  }

  session.isProcessing = true;
  try {
    if (!session.browser) {
      await session.launch();
      await session.login();
    } else if (!session.isLoggedIn) {
      await session.login();
    }

    const qrisString = await session.extractStaticQris();
    return qrisString;
  } catch (err) {
    console.error(`[Scraper] Static QRIS fetch error for ${email}:`, err.message);
    if (session) {
      session.lastLoginError = err.message;
    }
    const isBrowserAlive =
      session.browser && typeof session.browser.connected === 'boolean'
        ? session.browser.connected
        : false;

    if (isBrowserAlive) {
      session.isLoggedIn = false;
      try {
        if (session.page) {
          await session.page.goto('https://qr.klikbca.com/', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        }
      } catch (e) {}
    } else {
      await session.close();
      delete activeSessions[email];
    }
    throw err;
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
  BcaSession,
  fetchBcaTransactions,
  fetchStaticQris,
  closeSession,
  closeAllSessions,
  getSessionStatus
};
