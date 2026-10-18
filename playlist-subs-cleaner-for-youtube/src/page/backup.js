// Backup files: one format for all three targets, plus readers for the files
// created by the three earlier single-purpose extensions.
(() => {
  const NS = (window.__ylc = window.__ylc || {});

  NS.BACKUP_FORMAT = "youtube-library-cleaner-backup";
  NS.BACKUP_VERSION = 1;

  const VIDEO_ID_RE = /^[\w-]{11}$/;
  const CHANNEL_ID_RE = /^UC[\w-]{22}$/;

  // Files from the standalone extensions -> the target they belong to.
  const LEGACY_FORMATS = {
    "youtube-likes-cleaner-backup": "likes",
    "youtube-watch-later-cleaner-backup": "watchLater",
    "youtube-subscriptions-cleaner-backup": "subscriptions",
  };

  NS.buildBackup = (type, items) => ({
    format: NS.BACKUP_FORMAT,
    version: NS.BACKUP_VERSION,
    type,
    exportedAt: new Date().toISOString(),
    total: items.length,
    items,
  });

  // Triggers a browser download. Returns true if it could be started.
  NS.downloadBackup = (backup) => {
    try {
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `youtube-${backup.type}-backup_${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      return true;
    } catch (e) {
      console.warn("[YLC] backup download failed:", e);
      return false;
    }
  };

  const normVideos = (raw) => {
    const seen = new Set();
    const out = [];
    for (const v of raw) {
      const id = v && typeof v.id === "string" ? v.id : "";
      if (!VIDEO_ID_RE.test(id) || seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        title: String(v.title ?? v.titulo ?? ""),
        channel: String(v.channel ?? ""),
        duration: String(v.duration ?? ""),
      });
    }
    return out;
  };

  const normChannels = (raw) => {
    const seen = new Set();
    const out = [];
    for (const c of raw) {
      const id = c && typeof c.id === "string" ? c.id : "";
      if (!CHANNEL_ID_RE.test(id) || seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        title: String(c.title || ""),
        subtitle: String(c.subtitle || ""),
        url: String(c.url || ""),
        avatar: typeof c.avatar === "string" && /^https:\/\//.test(c.avatar) ? c.avatar : "",
      });
    }
    return out;
  };

  // Returns { type, items } or { type: null, candidates, items } when an old
  // file does not say whether it came from Liked videos or Watch later.
  // Throws on anything that is not a usable backup.
  NS.parseBackup = (text) => {
    const data = JSON.parse(text);

    let type = null;
    let raw = null;

    if (Array.isArray(data)) {
      raw = data;
    } else if (data && typeof data === "object") {
      if (data.format === NS.BACKUP_FORMAT) {
        if (!NS.targets[data.type]) throw new Error("unknown type");
        type = data.type;
        raw = data.items;
      } else if (LEGACY_FORMATS[data.format]) {
        type = LEGACY_FORMATS[data.format];
        raw = type === "subscriptions" ? data.channels : data.videos;
      } else if (Array.isArray(data.videos)) {
        raw = data.videos; // old file without a format field
      }
    }
    if (!Array.isArray(raw)) throw new Error("not a backup");

    if (type === "subscriptions") {
      const items = normChannels(raw);
      if (!items.length) throw new Error("empty");
      return { type, items };
    }

    const channels = normChannels(raw);
    if (!type && channels.length && channels.length >= raw.length / 2) {
      return { type: "subscriptions", items: channels };
    }

    const items = normVideos(raw);
    if (!items.length) throw new Error("empty");
    return type ? { type, items } : { type: null, candidates: ["likes", "watchLater"], items };
  };
})();
