// Low-level helpers: timing and authenticated calls to YouTube's internal API.
(() => {
  const NS = (window.__ylc = window.__ylc || {});

  NS.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Polls until fn() returns something truthy (or the attempts run out).
  NS.waitFor = async (fn, timeoutMs = 10000, stepMs = 250) => {
    const attempts = Math.ceil(timeoutMs / stepMs);
    for (let i = 0; i < attempts; i++) {
      const v = fn();
      if (v) return v;
      await NS.sleep(stepMs);
    }
    return fn();
  };

  // POST to /youtubei/v1/<path>, authenticated with the SAPISIDHASH header
  // derived from the user's own session cookie. Never throws.
  // Resolves to { status, json } where status is the HTTP status or a negative
  // code: -1 network error, -2 YouTube config missing.
  NS.post = async (path, body) => {
    const cfg = window.ytcfg;
    if (!cfg || !cfg.get) return { status: -2 };

    const context = cfg.get("INNERTUBE_CONTEXT");
    const apiKey = cfg.get("INNERTUBE_API_KEY");
    const cookie = document.cookie.match(/(?:^|;\s*)(?:SAPISID|__Secure-3PAPISID)=([^;]+)/);
    if (!cookie) return { status: 401 };

    const ts = Math.floor(Date.now() / 1000);
    const origin = "https://www.youtube.com";
    const digest = await crypto.subtle.digest(
      "SHA-1",
      new TextEncoder().encode(`${ts} ${cookie[1]} ${origin}`)
    );
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");

    const headers = {
      "Content-Type": "application/json",
      Authorization: `SAPISIDHASH ${ts}_${hash}`,
      "X-Goog-AuthUser": String(cfg.get("SESSION_INDEX") ?? 0),
      "X-Origin": origin,
      "X-Youtube-Client-Name": "1",
      "X-Youtube-Client-Version": context.client.clientVersion,
    };
    const pageId = cfg.get("DELEGATED_SESSION_ID"); // brand accounts
    if (pageId) headers["X-Goog-PageId"] = pageId;

    try {
      const res = await fetch(`/youtubei/v1/${path}?key=${apiKey}&prettyPrint=false`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ context, ...body }),
      });
      let json = null;
      if (res.ok) {
        try { json = await res.json(); } catch (e) { /* empty body */ }
      }
      return { status: res.status, json };
    } catch (e) {
      return { status: -1 };
    }
  };

  // Collapses a response into one number: 200 = success, anything else = failure code.
  // Playlist edits answer 200 with a status field, which must say STATUS_SUCCEEDED.
  NS.codeOf = (r) => {
    if (r.status !== 200) return r.status;
    if (r.json && r.json.status && r.json.status !== "STATUS_SUCCEEDED") return -3;
    return 200;
  };
})();
