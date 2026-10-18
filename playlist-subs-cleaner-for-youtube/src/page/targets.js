// The three things this extension can clean. Each target knows how to find its
// page, collect its items, and add/remove one item through YouTube's internal API.
//
//   act(mode, item)  mode: "remove" | "restore"   ->  resolves to { status, json }
(() => {
  const NS = (window.__ylc = window.__ylc || {});
  const ORIGIN = "https://www.youtube.com";
  const CHANNEL_ID_RE = /^UC[\w-]{22}$/;
  const VIDEO_ID_RE = /[?&]v=([\w-]{11})/;

  const text = (x) => (x ? x.simpleText || (x.runs || []).map((r) => r.text).join("") : "");

  // ------------------------------------------------------------ collection
  // Scrolls to the bottom until no new items show up for a few rounds.
  async function scrollLoad(read, size, onProgress, shouldStop) {
    let previous = -1;
    let stable = 0;
    while (stable < 5 && !shouldStop()) {
      read();
      onProgress(size());
      window.scrollTo(0, document.documentElement.scrollHeight);
      await NS.sleep(1200);
      read();
      stable = size() === previous ? stable + 1 : 0;
      previous = size();
    }
    window.scrollTo(0, 0);
  }

  function readVideo(node) {
    const a = node.querySelector("a#video-title") || node.querySelector('a[href*="/watch?v="]');
    const m = a && a.href && a.href.match(VIDEO_ID_RE);
    if (!m) return null;
    const d = node.data || {};
    const title = ((a.id === "video-title" && (a.getAttribute("title") || a.textContent)) || text(d.title) || "").trim();
    const channelEl = node.querySelector("ytd-channel-name a, #channel-name a, #byline a");
    const channel = (text(d.shortBylineText) || (channelEl && channelEl.textContent) || "").trim();
    const duration = text(d.lengthText).trim();
    return { id: m[1], title, channel, duration };
  }

  async function collectVideos(listId, onProgress, shouldStop) {
    const found = new Map();
    const fallbackSel = `a[href*="/watch?v="][href*="list=${listId}"]`;
    await NS.waitFor(() => document.querySelector("ytd-playlist-video-renderer") || document.querySelector(fallbackSel), 12000);

    const read = () => {
      const nodes = document.querySelectorAll("ytd-playlist-video-renderer");
      if (nodes.length) {
        nodes.forEach((n) => {
          const v = readVideo(n);
          if (v && !found.has(v.id)) found.set(v.id, v);
        });
      } else {
        document.querySelectorAll(fallbackSel).forEach((a) => {
          const m = a.href.match(VIDEO_ID_RE);
          if (m && !found.has(m[1])) {
            found.set(m[1], { id: m[1], title: (a.getAttribute("title") || "").trim(), channel: "", duration: "" });
          }
        });
      }
    };
    await scrollLoad(read, () => found.size, onProgress, shouldStop);
    return [...found.values()];
  }

  function readChannel(node) {
    const d = node.data || {};
    const btn = d.subscribeButton && d.subscribeButton.subscribeButtonRenderer;
    let id = d.channelId || (btn && btn.channelId) || "";
    if (!CHANNEL_ID_RE.test(id)) {
      const a = node.querySelector('a[href*="/channel/"]');
      const m = a && a.href.match(/\/channel\/(UC[\w-]{22})/);
      id = m ? m[1] : "";
    }
    if (!CHANNEL_ID_RE.test(id)) return null;

    const nameEl = node.querySelector("#text, #channel-title");
    const title = (text(d.title) || (nameEl && nameEl.textContent) || "").trim();
    // On this page the handle and the subscriber count live in these two fields.
    const subtitle = [text(d.subscriberCountText), text(d.videoCountText)]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" \u00b7 ");
    const base = d.navigationEndpoint && d.navigationEndpoint.browseEndpoint &&
      d.navigationEndpoint.browseEndpoint.canonicalBaseUrl;
    const url = base ? ORIGIN + base : ORIGIN + "/channel/" + id;

    const thumbs = d.thumbnail && d.thumbnail.thumbnails;
    const img = node.querySelector("img");
    let avatar = (thumbs && thumbs[0] && thumbs[0].url) || (img && img.getAttribute("src")) || "";
    if (avatar.startsWith("//")) avatar = "https:" + avatar;
    if (!/^https:\/\//.test(avatar)) avatar = "";

    return { id, title, subtitle, url, avatar };
  }

  async function collectChannels(onProgress, shouldStop) {
    const found = new Map();
    await NS.waitFor(() => document.querySelector("ytd-channel-renderer"), 12000);
    const read = () => {
      document.querySelectorAll("ytd-channel-renderer").forEach((n) => {
        const c = readChannel(n);
        if (c && !found.has(c.id)) found.set(c.id, c);
      });
    };
    await scrollLoad(read, () => found.size, onProgress, shouldStop);
    return [...found.values()];
  }

  // ----------------------------------------------------------- subscribe API
  // The optional "params" is what the web client sends; if YouTube rejects it
  // (HTTP 400) we retry without it and keep doing so.
  let useParams = true;
  const SUB_PARAMS = { remove: "CgIIAhgA", restore: "EgIIAhgA" };

  async function changeSubscription(mode, item) {
    const path = "subscription/" + (mode === "remove" ? "unsubscribe" : "subscribe");
    const body = { channelIds: [item.id] };
    if (!useParams) return NS.post(path, body);

    let r = await NS.post(path, { ...body, params: SUB_PARAMS[mode] });
    if (r.status === 400) {
      const retry = await NS.post(path, body);
      if (retry.status === 200) useParams = false;
      r = retry;
    }
    return r;
  }

  const playlistEdit = (listId, mode, item) =>
    NS.post("browse/edit_playlist", {
      playlistId: listId,
      actions: [
        mode === "remove"
          ? { action: "ACTION_REMOVE_VIDEO_BY_VIDEO_ID", removedVideoId: item.id }
          : { action: "ACTION_ADD_VIDEO", addedVideoId: item.id },
      ],
    });

  // ---------------------------------------------------------------- targets
  NS.targetOrder = ["likes", "watchLater", "subscriptions"];

  NS.targets = {
    likes: {
      id: "likes",
      kind: "video",
      accent: "#e5384f",
      icon: "thumb",
      url: ORIGIN + "/playlist?list=LL",
      delayMs: 700,
      restoreReverse: true, // newest like first on the page -> like oldest first
      onPage: (loc) => loc.pathname === "/playlist" && /[?&]list=LL\b/.test(loc.search),
      collect: (onProgress, shouldStop) => collectVideos("LL", onProgress, shouldStop),
      act: (mode, item) =>
        NS.post("like/" + (mode === "remove" ? "removelike" : "like"), { target: { videoId: item.id } }),
    },

    watchLater: {
      id: "watchLater",
      kind: "video",
      accent: "#2f7de1",
      icon: "clock",
      url: ORIGIN + "/playlist?list=WL",
      delayMs: 700,
      restoreReverse: true,
      onPage: (loc) => loc.pathname === "/playlist" && /[?&]list=WL\b/.test(loc.search),
      collect: (onProgress, shouldStop) => collectVideos("WL", onProgress, shouldStop),
      act: (mode, item) => playlistEdit("WL", mode, item),
    },

    subscriptions: {
      id: "subscriptions",
      kind: "channel",
      accent: "#8e4ec6",
      icon: "users",
      url: ORIGIN + "/feed/channels",
      delayMs: 800,
      restoreReverse: false,
      onPage: (loc) => /^\/feed\/channels\b/.test(loc.pathname),
      collect: collectChannels,
      act: changeSubscription,
    },
  };
})();
