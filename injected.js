(() => {
  if (window.__MERLY_TT_INJECTED__) return;
  window.__MERLY_TT_INJECTED__ = true;

  const GOOD_RE = /(mime_type=video_mp4|\.mp4(?:\?|$)|video\/tos|v16m-default|akamaized|video_mp4|download=true)/i;
  const BAD_RE = /(mon-va|gali-mcs|collect|monitor|analytics|video_performance|sentry|log|abtest|captcha)/i;
  const found = new Set();

  function normalize(raw) {
    if (!raw || typeof raw !== 'string') return '';
    let url = raw.replaceAll('\\/', '/').replaceAll('\\u0026', '&').trim();
    try { url = decodeURIComponent(url); } catch (_) {}
    return url;
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
    const matches = text.match(/https?:\\?\/\\?\/[^"'<>\s]+/g) || [];
    emit(matches);
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
          if (/json|text|javascript/i.test(contentType) || typeof this.responseText === 'string') {
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
