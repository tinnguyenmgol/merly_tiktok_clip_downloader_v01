const STORE_KEY = 'merlyTikTokVideoUrls';
const MAX_URLS = 1500;

const GOOD_RE = /(mime_type=video_mp4|\.(?:mp4|m4v|mov)(?:[?#&]|$)|video\/tos|\/tos-[^/]*(?:ve|video)[^/]*\/|v\d+[a-z0-9-]*\.(?:tiktokcdn(?:-us)?|tiktokv)\.com|v\d+[a-z0-9-]*-(?:default|webapp)[^/]*\.|video_mp4)/i;
const BAD_RE = /(mon-va|gali-mcs|\/collect(?:\/|\?|$)|\/monitor(?:\/|\?|$)|analytics|video_performance|sentry|abtest|captcha|mime_type=image|\.(?:jpe?g|png|webp|gif|svg)(?:~|\?|$))/i;

function isLikelyVideoUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (BAD_RE.test(url)) return false;
  return GOOD_RE.test(url);
}

function isSafeHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && !BAD_RE.test(url);
  } catch (_) {
    return false;
  }
}

function cleanUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  return rawUrl
    .replace(/\\u0026/gi, '&')
    .replace(/\\u002f/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&')
    .trim()
    .replace(/["'\\),;]+$/g, '');
}

async function getStoredUrls() {
  const data = await chrome.storage.local.get({ [STORE_KEY]: [] });
  const stored = Array.isArray(data[STORE_KEY]) ? data[STORE_KEY] : [];
  const valid = stored.filter(item => item && isSafeHttpUrl(item.url) && (item.confirmedMedia || isLikelyVideoUrl(item.url)));
  if (valid.length !== stored.length) await setStoredUrls(valid);
  return valid;
}

async function setStoredUrls(items) {
  await chrome.storage.local.set({ [STORE_KEY]: items.slice(-MAX_URLS) });
}

async function addUrls(urls, source = 'unknown', options = {}) {
  const confirmedMedia = Boolean(options.confirmedMedia);
  const incoming = (Array.isArray(urls) ? urls : [urls])
    .map(cleanUrl)
    .filter(url => isSafeHttpUrl(url) && (confirmedMedia || isLikelyVideoUrl(url)));

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
      old.confirmedMedia = old.confirmedMedia || confirmedMedia;
      old.contentType = old.contentType || options.contentType || '';
    } else {
      map.set(url, {
        url,
        source,
        confirmedMedia,
        contentType: options.contentType || '',
        firstSeenAt: now,
        lastSeenAt: now
      });
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

function isVideoContentType(contentType) {
  return /^video\//i.test(contentType || '');
}

function isGenericBinaryContentType(contentType) {
  return /^(application|binary)\/octet-stream/i.test(contentType || '');
}

async function inspectVideoUrl(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      redirect: 'follow',
      cache: 'no-store',
      headers: { Range: 'bytes=0-1' },
      signal: controller.signal
    });
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const contentDisposition = response.headers.get('content-disposition') || '';
    const finalUrl = response.url || url;
    if (response.body && response.body.cancel) response.body.cancel().catch(() => {});

    if (!response.ok && response.status !== 206) {
      return { ok: false, reason: `HTTP ${response.status}` };
    }
    if (isVideoContentType(contentType)) {
      return { ok: true, url: finalUrl, contentType };
    }
    if (isGenericBinaryContentType(contentType) && (isLikelyVideoUrl(finalUrl) || /\.mp4/i.test(contentDisposition))) {
      return { ok: true, url: finalUrl, contentType };
    }
    return { ok: false, reason: `Không phải video (${contentType || 'không có Content-Type'})` };
  } catch (err) {
    return { ok: false, reason: err && err.name === 'AbortError' ? 'Hết thời gian kiểm tra URL' : (err && err.message ? err.message : String(err)) };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function downloadAll() {
  const items = await getStoredUrls();
  const inspected = await mapWithConcurrency(items, 4, async item => await inspectVideoUrl(item.url));

  const downloadable = [];
  const errors = [];
  for (let i = 0; i < items.length; i++) {
    if (inspected[i] && inspected[i].ok) {
      downloadable.push({ ...items[i], url: inspected[i].url, confirmedMedia: true, contentType: inspected[i].contentType || items[i].contentType || '' });
    } else {
      errors.push({ url: items[i].url, message: inspected[i] ? inspected[i].reason : 'Không kiểm tra được URL' });
    }
  }

  await setStoredUrls(downloadable);
  let started = 0;

  for (let i = 0; i < downloadable.length; i++) {
    const url = downloadable[i].url;
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

  return { started, total: items.length, valid: downloadable.length, skipped: items.length - downloadable.length, errors };
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

const MEDIA_REQUEST_URLS = [
  'https://*.akamaized.net/*',
  'https://*.byteoversea.com/*',
  'https://*.ibytedtos.com/*',
  'https://*.tiktokcdn.com/*',
  'https://*.tiktokcdn-us.com/*',
  'https://*.tiktokv.com/*',
  'https://seller-vn.tiktok.com/*',
  'https://seller.tiktok.com/*',
  'https://shop.tiktok.com/*'
];

chrome.webRequest.onBeforeRequest.addListener(
  details => {
    if (!details || !details.url) return;
    if (!isLikelyVideoUrl(details.url)) return;
    addUrls([details.url], `webRequest:${details.type}`).catch(() => {});
  },
  { urls: MEDIA_REQUEST_URLS }
);

chrome.webRequest.onHeadersReceived.addListener(
  details => {
    if (!details || !details.url) return;
    const headers = Array.isArray(details.responseHeaders) ? details.responseHeaders : [];
    const contentTypeHeader = headers.find(header => header && String(header.name).toLowerCase() === 'content-type');
    const contentType = contentTypeHeader && contentTypeHeader.value ? contentTypeHeader.value.toLowerCase() : '';
    if (isVideoContentType(contentType)) {
      addUrls([details.url], `responseHeaders:${details.type}`, { confirmedMedia: true, contentType }).catch(() => {});
      return;
    }
    if (isGenericBinaryContentType(contentType) && isLikelyVideoUrl(details.url)) {
      addUrls([details.url], `responseHeaders:${details.type}`, { contentType }).catch(() => {});
    }
  },
  { urls: MEDIA_REQUEST_URLS },
  ['responseHeaders']
);
