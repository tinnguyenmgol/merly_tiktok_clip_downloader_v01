(() => {
  if (window.__MERLY_TT_INJECTED__) return;
  window.__MERLY_TT_INJECTED__ = true;

  const GOOD_RE = /(mime_type=video_mp4|\.(?:mp4|m4v|mov)(?:[?#&]|$)|video\/tos|\/tos-[^/]*(?:ve|video)[^/]*\/|v\d+[a-z0-9-]*\.(?:tiktokcdn(?:-us)?|tiktokv)\.com|v\d+[a-z0-9-]*-(?:default|webapp)[^/]*\.|video_mp4)/i;
  const BAD_RE = /(mon-va|gali-mcs|\/collect(?:\/|\?|$)|\/monitor(?:\/|\?|$)|analytics|video_performance|sentry|abtest|captcha|mime_type=image|\.(?:jpe?g|png|webp|gif|svg)(?:~|\?|$))/i;
  const found = new Set();

  function normalize(raw) {
    if (!raw || typeof raw !== 'string') return '';
    return raw
      .replace(/\\u0026/gi, '&')
      .replace(/\\u002f/gi, '/')
      .replace(/\\\//g, '/')
      .replace(/&amp;/gi, '&')
      .trim()
      .replace(/["'\\),;]+$/g, '');
  }

  function isLikely(url) {
    return typeof url === 'string' && GOOD_RE.test(url) && !BAD_RE.test(url);
  }

  function emit(urls) {
    const clean = [...new Set((urls || []).map(normalize).filter(isLikely))];
    const fresh = [];
    for (const url of clean) {
      if (!found.has(url)) {
        found.add(url);
        fresh.push(url);
      }
    }
    if (!fresh.length) return;
    window.postMessage({
      source: 'MERLY_TT_INJECTED',
      type: 'VIDEO_URLS_FOUND',
      urls: fresh
    }, '*');
  }

  function scanText(text) {
    if (!text || typeof text !== 'string') return;
    const normalized = text
      .replace(/\\u0026/gi, '&')
      .replace(/\\u002f/gi, '/')
      .replace(/\\\//g, '/')
      .replace(/&amp;/gi, '&');
    const matches = normalized.match(/https?:\/\/[^\s"'<>\\]+/g) || [];
    emit(matches);
  }

  function scanObject(value, seen = new WeakSet()) {
    if (typeof value === 'string') {
      scanText(value);
      return;
    }
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    for (const child of Object.values(value)) scanObject(child, seen);
  }

  function scanPerformance() {
    try {
      const urls = performance.getEntriesByType('resource').map(entry => entry && entry.name);
      emit(urls);
    } catch (_) {}
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = async function(...args) {
      const response = await originalFetch.apply(this, args);
      try {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
        emit([url]);
        const contentType = response.headers && response.headers.get ? (response.headers.get('content-type') || '') : '';
        if (/json|text|javascript/i.test(contentType)) {
          response.clone().text().then(scanText).catch(() => {});
        }
      } catch (_) {}
      return response;
    };
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this.__merlyUrl = url;
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function() {
    try {
      emit([this.__merlyUrl]);
      this.addEventListener('load', function() {
        try {
          const contentType = this.getResponseHeader && (this.getResponseHeader('content-type') || '');
          if (this.responseType === 'json') {
            scanObject(this.response);
          } else if (/json|text|javascript/i.test(contentType) || typeof this.responseText === 'string') {
            scanText(this.responseText || '');
          }
        } catch (_) {}
      });
    } catch (_) {}
    return originalSend.apply(this, arguments);
  };

  scanPerformance();
  setInterval(scanPerformance, 2000);
  console.log('[Merly TikTok Clips] Scanner ready. Bam play clip, sau do dung bang tai o goc duoi phai.');
})();
