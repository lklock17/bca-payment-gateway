/**
 * BCA Payment Gateway - UI Core Shared Helper Module
 * Provides unified toast, clipboard copy, html escaping, currency & date formatting,
 * modal scroll locking, and authenticated API request handling.
 */
(function(window) {
  'use strict';

  const BcaUI = {};

  /**
   * Escape HTML to prevent Stored & Reflected XSS
   */
  BcaUI.escapeHtml = function(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, function(match) {
      switch (match) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#039;';
        default: return match;
      }
    });
  };

  /**
   * Copy to clipboard with secure context check and fallback for HTTP LAN
   */
  BcaUI.copyToClipboard = async function(text, successMsg = 'Berhasil disalin ke clipboard!') {
    if (!text && text !== 0) return false;
    const str = String(text);

    // Try modern Clipboard API if in secure context
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(str);
        BcaUI.showToast(successMsg, 'success');
        return true;
      } catch (err) {
        console.warn('[BcaUI] Clipboard API failed, falling back:', err);
      }
    }

    // Fallback for non-HTTPS / IP VPS HTTP
    try {
      const textArea = document.createElement('textarea');
      textArea.value = str;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.style.top = '0';
      textArea.setAttribute('readonly', '');
      textArea.setAttribute('aria-hidden', 'true');
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (successful) {
        BcaUI.showToast(successMsg, 'success');
        return true;
      }
    } catch (err) {
      console.error('[BcaUI] Fallback copy failed:', err);
    }

    BcaUI.showToast('Gagal menyalin otomatis. Silakan salin manual.', 'error');
    return false;
  };

  /**
   * Global Toast Notification System
   */
  BcaUI.showToast = function(message, type = 'success') {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
    } else {
      iconSvg = '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    toast.innerHTML = `
      ${iconSvg}
      <div class="toast-message">${BcaUI.escapeHtml(message)}</div>
      <button class="toast-close" aria-label="Tutup notifikasi">&times;</button>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
      removeToast(toast);
    });

    container.appendChild(toast);

    const autoTimer = setTimeout(() => {
      removeToast(toast);
    }, 3500);

    function removeToast(el) {
      clearTimeout(autoTimer);
      el.classList.add('toast-hiding');
      setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 250);
    }
  };

  /**
   * Currency formatter (IDR)
   */
  BcaUI.formatRupiah = function(amount) {
    const num = Number(amount) || 0;
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(num);
  };

  /**
   * Safe Date Formatter to Western Indonesian Time (WIB, UTC+7)
   */
  BcaUI.formatDateWIB = function(dateInput) {
    if (!dateInput) return '-';
    try {
      let d;
      if (typeof dateInput === 'string' && !dateInput.includes('T') && !dateInput.endsWith('Z')) {
        // SQLite format 'YYYY-MM-DD HH:MM:SS' assumed UTC
        d = new Date(dateInput.replace(' ', 'T') + 'Z');
      } else {
        d = new Date(dateInput);
      }
      if (isNaN(d.getTime())) return dateInput;

      return d.toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }) + ' WIB';
    } catch (e) {
      return dateInput;
    }
  };

  /**
   * Body Scroll Locking when Modal or Mobile Drawer is open
   */
  const activeScrollLocks = new Set();
  BcaUI.setBodyScrollLock = function(locked, key = 'modal') {
    if (locked) {
      activeScrollLocks.add(key);
    } else {
      activeScrollLocks.delete(key);
    }
    if (activeScrollLocks.size > 0) {
      document.body.classList.add('body-scroll-locked');
    } else {
      document.body.classList.remove('body-scroll-locked');
    }
  };

  /**
   * Authenticated API Request Wrapper
   */
  BcaUI.apiRequest = async function(url, options = {}) {
    const token = localStorage.getItem('gateway_token');
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      if (response.status === 401) {
        console.warn('[BcaUI] Sesi telah kedaluwarsa atau token tidak valid.');
        localStorage.removeItem('gateway_token');
        localStorage.removeItem('user_email');
        localStorage.removeItem('user_role');
        if (!window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
          window.location.href = '/index.html';
        }
      }

      return response;
    } catch (err) {
      console.error('[BcaUI] Network / fetch error:', err);
      throw err;
    }
  };

  window.BcaUI = BcaUI;
})(window);
