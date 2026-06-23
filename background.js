const STORE_KEY = 'merlyTikTokVideoUrls';
const MAX_URLS = 1500;

const GOOD_RE = /(mime_type=video_mp4|\.mp4(?:\?|$)|video\/tos|v16m-default|akamaized|video_mp4|download=true)/i;
const BAD_RE = /(mon-va|gali-mcs|collect|monitor|analytics|video_performance|sentry|log|abtest|captcha)/i;

function isLikelyVideoUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (BAD_RE.test(url)) return false;
  return GOOD_RE.test(url);
}

function cleanUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let url = rawUrl.trim();
  try { url = decodeURIComponent(url); } catch (_) {}
  return url;
}

async function getStoredUrls() {
  const data = await chrome.storage.local.get({ [STORE_KEY]: [] });
  return Array.isArray(data[STORE_KEY]) ? data[STORE_KEY] : [];
}

async function setStoredUrls(items) {
  await chrome.storage.local.set({ [STORE_KEY]: items.slice(-MAX_URLS) });
}

async function addUrls(urls, source = 'unknown') {
  const incoming = (Array.isArray(urls) ? urls : [urls])
    .map(cleanUrl)
    .filter(isLikelyVideoUrl);

  if (!incoming.length) {
    const items = await getStoredUrls();
    return { added: 0, total: items.length, items };
  }

  const now = new Date().toISOString();
  const items = await getStoredUrls();
  const map = new Map(items.map(item => [item.url, item]));
  let added = 0;

  for (const url of incoming) {
    if (map.has(url)) {
      const old = map.get(url);
      old.lastSeenAt = now;
      old.source = old.source || source;
    } else {
      map.set(url, { url, source, firstSeenAt: now, lastSeenAt: now });
      added += 1;
    }
  }

  const merged = [...map.values()].slice(-MAX_URLS);
  await setStoredUrls(merged);
  return { added, total: merged.length, items: merged };
}

function buildFilename(index, url) {
  const num = String(index + 1).padStart(3, '0');
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  let original = '';

  try {
    const u = new URL(url);
    original = u.searchParams.get('filename') || '';
  } catch (_) {}

  const safeOriginal = original
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);

  const suffix = safeOriginal && safeOriginal.toLowerCase().endsWith('.mp4')
    ? safeOriginal
    : `clip_${num}.mp4`;

  return `Merly_TikTok_Live_${yyyy}-${mm}-${dd}/merly_live_clip_${num}_${suffix}`;
}

async function downloadAll() {
  const items = await getStoredUrls();
  const urls = items.map(item => item.url).filter(isLikelyVideoUrl);
  let started = 0;
  const errors = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      await chrome.downloads.download({
        url,
        filename: buildFilename(i, url),
        conflictAction: 'uniquify',
        saveAs: false
      });
      started += 1;
      await new Promise(resolve => setTimeout(resolve, 250));
    } catch (err) {
      errors.push({ url, message: err && err.message ? err.message : String(err) });
    }
  }

  return { started, total: urls.length, errors };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (!message || !message.type) {
        sendResponse({ ok: false, error: 'Missing message type' });
        return;
      }

      if (message.type === 'ADD_URLS') {
        const result = await addUrls(message.urls || [], message.source || 'content');
        sendResponse({ ok: true, ...result });
        return;
      }

      if (message.type === 'GET_URLS') {
        const items = await getStoredUrls();
        sendResponse({ ok: true, total: items.length, items });
        return;
      }

      if (message.type === 'CLEAR_URLS') {
        await setStoredUrls([]);
        sendResponse({ ok: true, total: 0, items: [] });
        return;
      }

      if (message.type === 'DOWNLOAD_ALL') {
        const result = await downloadAll();
        sendResponse({ ok: true, ...result });
        return;
      }

      sendResponse({ ok: false, error: `Unknown message type: ${message.type}` });
    } catch (err) {
      sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
    }
  })();

  return true;
});

chrome.webRequest.onBeforeRequest.addListener(
  details => {
    if (!details || !details.url) return;
    if (!isLikelyVideoUrl(details.url)) return;
    addUrls([details.url], `webRequest:${details.type}`).catch(() => {});
  },
  {
    urls: [
      'https://*.akamaized.net/*',
      'https://*.byteoversea.com/*',
      'https://*.tiktokcdn.com/*',
      'https://seller-vn.tiktok.com/*',
      'https://seller.tiktok.com/*'
    ]
  }
);
