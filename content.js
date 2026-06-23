(() => {
  const PANEL_ID = 'merly-tt-clip-panel';
  const GOOD_RE = /(mime_type=video_mp4|\.mp4(?:\?|$)|video\/tos|v16m-default|akamaized|video_mp4|download=true)/i;
  const BAD_RE = /(mon-va|gali-mcs|collect|monitor|analytics|video_performance|sentry|log|abtest|captcha)/i;

  function isTargetPage() {
    return /seller(-vn)?\.tiktok\.com/i.test(location.hostname) && /live-selling\/teasers/i.test(location.pathname);
  }

  function isLikelyVideoUrl(url) {
    return typeof url === 'string' && GOOD_RE.test(url) && !BAD_RE.test(url);
  }

  function runtimeSend(message) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(message, response => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(response || { ok: false, error: 'No response' });
          }
        });
      } catch (err) {
        resolve({ ok: false, error: err && err.message ? err.message : String(err) });
      }
    });
  }

  function extractUrlsFromPerformance() {
    try {
      return [...new Set(
        performance.getEntriesByType('resource')
          .map(entry => entry && entry.name)
          .filter(isLikelyVideoUrl)
      )];
    } catch (_) {
      return [];
    }
  }

  async function addUrls(urls, source) {
    if (!urls || !urls.length) return await runtimeSend({ type: 'GET_URLS' });
    return await runtimeSend({ type: 'ADD_URLS', urls, source });
  }

  function injectMainWorldScanner() {
    if (document.documentElement.dataset.merlyScannerInjected === '1') return;
    document.documentElement.dataset.merlyScannerInjected = '1';

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }

  window.addEventListener('message', event => {
    if (event.source !== window) return;
    const data = event.data || {};
    if (data.source !== 'MERLY_TT_INJECTED' || data.type !== 'VIDEO_URLS_FOUND') return;
    addUrls(data.urls || [], 'injected').then(updateCount);
  });

  function createButton(text, onClick, options = {}) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.type = 'button';
    btn.style.cssText = [
      'border:0',
      'border-radius:8px',
      'padding:8px 10px',
      'font-weight:700',
      'cursor:pointer',
      'font-size:12px',
      'background:' + (options.secondary ? '#f3f4f6' : '#0f766e'),
      'color:' + (options.secondary ? '#111827' : '#fff')
    ].join(';');
    btn.addEventListener('click', onClick);
    return btn;
  }

  function setStatus(text, tone = '') {
    const el = document.querySelector(`#${PANEL_ID} .merly-status`);
    if (!el) return;
    el.textContent = text;
    el.style.color = tone === 'error' ? '#b91c1c' : tone === 'success' ? '#047857' : '#374151';
  }

  async function updateCount() {
    const res = await runtimeSend({ type: 'GET_URLS' });
    const count = res && res.ok ? res.total : 0;
    const countEl = document.querySelector(`#${PANEL_ID} .merly-count`);
    if (countEl) countEl.textContent = String(count);
    return count;
  }

  async function scanNow() {
    const urls = extractUrlsFromPerformance();
    const res = await addUrls(urls, 'performance');
    await updateCount();
    if (!urls.length && (!res || !res.total)) {
      setStatus('Chưa thấy link. Bấm play vài clip rồi quét lại.', 'error');
    } else {
      setStatus(`Đã quét: +${res && typeof res.added === 'number' ? res.added : 0} link mới.`, 'success');
    }
  }

  async function copyLinks() {
    await scanNow();
    const res = await runtimeSend({ type: 'GET_URLS' });
    const urls = (res.items || []).map(item => item.url).filter(Boolean);
    const text = urls.join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setStatus(`Đã copy ${urls.length} link vào clipboard.`, 'success');
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      ta.remove();
      setStatus(`Đã copy ${urls.length} link.`, 'success');
    }
  }

  async function downloadAll() {
    await scanNow();
    const count = await updateCount();
    if (!count) {
      setStatus('Chưa có clip để tải. Bấm play clip trước.', 'error');
      return;
    }

    setStatus('Đang bắt đầu tải, chờ Chrome xử lý...', 'success');
    const res = await runtimeSend({ type: 'DOWNLOAD_ALL' });
    if (!res || !res.ok) {
      setStatus(`Lỗi tải: ${res && res.error ? res.error : 'không rõ'}`, 'error');
      return;
    }
    setStatus(`Đã gửi ${res.started}/${res.total} clip vào Downloads.`, 'success');
  }

  async function clearList() {
    await runtimeSend({ type: 'CLEAR_URLS' });
    await updateCount();
    setStatus('Đã xóa danh sách link.', 'success');
  }

  function createPanel() {
    if (!isTargetPage()) return;
    if (document.getElementById(PANEL_ID)) return;

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = [
      'position:fixed',
      'right:18px',
      'bottom:18px',
      'z-index:2147483647',
      'width:270px',
      'background:#ffffff',
      'border:1px solid #d1d5db',
      'box-shadow:0 10px 30px rgba(0,0,0,.18)',
      'border-radius:14px',
      'font-family:Arial, Helvetica, sans-serif',
      'color:#111827',
      'overflow:hidden'
    ].join(';');

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;background:#111827;color:#fff;padding:10px 12px;font-weight:800;font-size:13px;';
    header.innerHTML = '<span>Merly TikTok Clips</span><span style="background:#0f766e;padding:2px 8px;border-radius:999px"><span class="merly-count">0</span> clip</span>';

    const body = document.createElement('div');
    body.style.cssText = 'padding:12px;display:flex;flex-direction:column;gap:8px;font-size:12px;';

    const hint = document.createElement('div');
    hint.textContent = 'Cuộn trang, bấm play clip cần lấy, rồi bấm Quét/Tải.';
    hint.style.cssText = 'line-height:1.35;color:#4b5563;';

    const row1 = document.createElement('div');
    row1.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;';
    row1.appendChild(createButton('Quét trang', scanNow));
    row1.appendChild(createButton('Tải tất cả', downloadAll));

    const row2 = document.createElement('div');
    row2.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;';
    row2.appendChild(createButton('Copy link', copyLinks, { secondary: true }));
    row2.appendChild(createButton('Xóa DS', clearList, { secondary: true }));

    const status = document.createElement('div');
    status.className = 'merly-status';
    status.textContent = 'Đang chờ link video...';
    status.style.cssText = 'min-height:18px;line-height:1.35;color:#374151;';

    const close = document.createElement('button');
    close.textContent = 'Ẩn bảng';
    close.type = 'button';
    close.style.cssText = 'background:transparent;border:0;color:#6b7280;text-decoration:underline;cursor:pointer;font-size:12px;padding:0;text-align:left;';
    close.addEventListener('click', () => { panel.style.display = 'none'; });

    body.appendChild(hint);
    body.appendChild(row1);
    body.appendChild(row2);
    body.appendChild(status);
    body.appendChild(close);
    panel.appendChild(header);
    panel.appendChild(body);
    document.documentElement.appendChild(panel);

    updateCount();
  }

  function boot() {
    if (!isTargetPage()) return;
    injectMainWorldScanner();
    createPanel();
    setInterval(async () => {
      if (!isTargetPage()) return;
      const urls = extractUrlsFromPerformance();
      if (urls.length) {
        await addUrls(urls, 'performance:auto');
        await updateCount();
      }
    }, 2500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(boot, 600);
    }
  }, 1000);
})();
