// Smoke tests: loads the real page scripts into a simulated YouTube page (jsdom)
// and drives the UI the way a user would. Run with: npm test
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const PAGE_FILES = ["i18n", "styles", "api", "targets", "backup", "ui", "main"].map((f) =>
  fs.readFileSync(path.join(__dirname, "..", "src", "page", `${f}.js`), "utf8")
);
const MODULES_ONLY = PAGE_FILES.slice(0, 5); // everything except ui + main

const vid = (n) => ("v" + String(n).padStart(10, "0")).slice(0, 11);
const UC = (n) => "UC" + String(n).padStart(22, "x");
const VIDEOS = [0, 1, 2].map((i) => ({ id: vid(i), title: `Video ${i}`, channel: `Chan ${i}`, duration: "1:00" }));
const CHANNELS = [1, 2, 3].map((i) => ({ id: UC(i), title: `Channel ${i}`, handle: `@c${i}`, count: `${i}00 subs` }));

let failures = 0;
const assert = (cond, msg) => {
  if (cond) console.log("ok  -", msg);
  else { failures++; console.error("FAIL -", msg); }
};
const real = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await real(10); }
  return !!fn();
}

// Builds a simulated page and (optionally) injects the extension into it.
function makePage({ url, kind = "videos", launch, failWithParams = false, failIds = [], modulesOnly = false }) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url, runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  const doc = w.document;

  if (kind === "videos") {
    const listId = /list=WL/.test(url) ? "WL" : "LL";
    VIDEOS.forEach((v, i) => {
      const n = doc.createElement("ytd-playlist-video-renderer");
      n.data = { title: { runs: [{ text: v.title }] }, shortBylineText: { runs: [{ text: v.channel }] }, lengthText: { simpleText: v.duration } };
      const a = doc.createElement("a");
      a.id = "video-title"; a.title = v.title; a.textContent = v.title;
      a.href = `/watch?v=${v.id}&list=${listId}&index=${i + 1}`;
      n.appendChild(a);
      doc.body.appendChild(n);
    });
  } else if (kind === "channels") {
    CHANNELS.forEach((c) => {
      const n = doc.createElement("ytd-channel-renderer");
      n.data = {
        channelId: c.id, title: { simpleText: c.title }, subscriberCountText: { simpleText: c.handle },
        videoCountText: { simpleText: c.count }, navigationEndpoint: { browseEndpoint: { canonicalBaseUrl: "/" + c.handle } },
        thumbnail: { thumbnails: [{ url: "//yt3.ggpht.com/" + c.id }] },
      };
      doc.body.appendChild(n);
    });
  }

  const calls = [];
  w.setTimeout = (f) => { queueMicrotask(f); return 0; }; // no real waiting
  w.scrollTo = () => {};
  w.ytcfg = { get: (k) => ({ INNERTUBE_CONTEXT: { client: { clientVersion: "2.0" } }, INNERTUBE_API_KEY: "KEY", SESSION_INDEX: 0 }[k]) };
  Object.defineProperty(doc, "cookie", { get: () => "SAPISID=abc123", set() {} });
  Object.defineProperty(w, "crypto", { value: globalThis.crypto });
  w.TextEncoder = TextEncoder;
  w.Uint8Array = Uint8Array;
  w.fetch = async (u, o) => {
    const body = JSON.parse(o.body);
    calls.push({ u, body, auth: o.headers.Authorization });
    if (failWithParams && body.params) return { ok: false, status: 400 };
    const bad = failIds.some((id) => JSON.stringify(body).includes(id));
    return { ok: true, status: 200, json: async () => ({ status: bad ? "STATUS_FAILED" : "STATUS_SUCCEEDED" }) };
  };
  w.URL.createObjectURL = () => "blob:x";
  w.URL.revokeObjectURL = () => {};
  w.__downloads = [];
  w.__blobs = [];
  const RealBlob = w.Blob;
  w.Blob = function (parts, opts) { w.__blobs.push(parts.join("")); return new RealBlob(parts, opts); };
  w.HTMLAnchorElement.prototype.click = function () { if (this.download) w.__downloads.push(this.download); };

  for (const code of modulesOnly ? MODULES_ONLY : PAGE_FILES.slice(0, 6)) w.eval(code);
  if (!modulesOnly) {
    w.__ylcLaunch = launch;
    w.eval(PAGE_FILES[6]);
  }

  const root = () => { const h = doc.getElementById("ylc-host"); return h && h.shadowRoot; };
  const q = (sel) => { const r = root(); return r && r.querySelector(sel); };
  const qa = (sel) => { const r = root(); return r ? [...r.querySelectorAll(sel)] : []; };
  const btn = (re) => qa("button").find((b) => re.test(b.textContent));
  const text = () => (root() ? root().textContent : "");
  return { w, calls, q, qa, btn, text, root };
}

(async () => {
  // ================= backup parser =================
  {
    const { w } = makePage({ url: "https://www.youtube.com/", modulesOnly: true });
    const P = w.__ylc.parseBackup;
    const vids = VIDEOS.map(({ id, title }) => ({ id, title }));
    const chans = CHANNELS.map((c) => ({ id: c.id, title: c.title, subtitle: "", url: "", avatar: "" }));

    let r = P(JSON.stringify(w.__ylc.buildBackup("likes", vids)));
    assert(r.type === "likes" && r.items.length === 3, "parser: new format (likes)");
    r = P(JSON.stringify(w.__ylc.buildBackup("subscriptions", chans)));
    assert(r.type === "subscriptions" && r.items.length === 3, "parser: new format (subscriptions)");
    r = P(JSON.stringify({ format: "youtube-likes-cleaner-backup", videos: vids }));
    assert(r.type === "likes", "parser: legacy likes backup");
    r = P(JSON.stringify({ format: "youtube-watch-later-cleaner-backup", videos: vids }));
    assert(r.type === "watchLater", "parser: legacy Watch later backup");
    r = P(JSON.stringify({ format: "youtube-subscriptions-cleaner-backup", channels: chans }));
    assert(r.type === "subscriptions", "parser: legacy subscriptions backup");
    r = P(JSON.stringify(vids.map((v) => ({ id: v.id, titulo: v.title }))));
    assert(r.type === null && r.candidates.join() === "likes,watchLater" && r.items[0].title === "Video 0", "parser: oldest plain array is ambiguous (accepts 'titulo')");
    r = P(JSON.stringify(chans));
    assert(r.type === "subscriptions", "parser: array of channel ids is recognised as subscriptions");
    r = P(JSON.stringify(w.__ylc.buildBackup("likes", [...vids, { id: "bad", title: "x" }, vids[0]])));
    assert(r.items.length === 3, "parser: drops invalid ids and duplicates");

    for (const [name, content] of [["not json", "nope"], ["empty list", JSON.stringify({ format: "youtube-library-cleaner-backup", type: "likes", items: [] })], ["unknown type", JSON.stringify({ format: "youtube-library-cleaner-backup", type: "nope", items: vids })], ["random object", "{}"]]) {
      let threw = false;
      try { P(content); } catch (e) { threw = true; }
      assert(threw, "parser: rejects " + name);
    }

    const C = w.__ylc.codeOf;
    assert(C({ status: 200, json: { status: "STATUS_SUCCEEDED" } }) === 200 && C({ status: 200 }) === 200, "codeOf: success");
    assert(C({ status: 200, json: { status: "STATUS_FAILED" } }) === -3 && C({ status: 429 }) === 429, "codeOf: failures");
  }

  // ================= liked videos =================
  {
    const p = makePage({ url: "https://www.youtube.com/playlist?list=LL", launch: { mode: "manage", target: "likes" } });
    assert(await until(() => p.qa(".row").length === 3), "likes: lists 3 videos");
    assert(p.w.__downloads.length === 1 && /youtube-likes-backup/.test(p.w.__downloads[0]), "likes: backup downloaded first");
    const saved = JSON.parse(p.w.__blobs[0]);
    assert(saved.format === "youtube-library-cleaner-backup" && saved.type === "likes" && saved.total === 3, "likes: backup has the unified format");
    assert(p.qa(".row input").every((c) => !c.checked), "likes: nothing selected by default");
    assert(p.qa(".thumb")[0].src.includes("i.ytimg.com/vi/" + vid(0)), "likes: thumbnails use the video id");

    const search = p.q(".search input");
    search.value = "video 1";
    search.dispatchEvent(new p.w.Event("input"));
    assert(p.qa(".row").filter((r) => !r.hidden).length === 1, "likes: search filters the list");
    p.qa(".chip")[0].click();                       // select shown
    search.value = ""; search.dispatchEvent(new p.w.Event("input"));
    p.qa(".row input")[2].click();                  // plus Video 2
    assert(/2 of 3|2 de 3/.test(p.text()), "likes: counter shows 2 of 3");

    p.btn(/^(Remove|Remover) 2$/).click();
    assert(p.calls.length === 0 && p.btn(/^(Confirm|Confirmar)/), "likes: first click only asks to confirm");
    p.qa(".row input")[0].click();                  // changing the selection disarms
    assert(!p.btn(/^(Confirm|Confirmar)/), "likes: changing the selection cancels the confirmation");
    p.qa(".row input")[0].click();
    p.btn(/^(Remove|Remover) 2$/).click();
    p.btn(/^(Confirm|Confirmar)/).click();
    assert(await until(() => p.calls.length === 2), "likes: 2 removals sent");
    assert(p.calls.every((c) => c.u.includes("/like/removelike?key=KEY")), "likes: removelike endpoint");
    assert(p.calls.map((c) => c.body.target.videoId).join() === [vid(1), vid(2)].join(), "likes: only the ticked videos, in list order");
    assert(p.calls.every((c) => /^SAPISIDHASH \d+_[0-9a-f]{40}$/.test(c.auth)), "likes: SAPISIDHASH header");
    assert(await until(() => /2 likes removed|2 likes removidos/.test(p.text())), "likes: result summary");
  }

  // ================= Watch later (with a logical failure) =================
  {
    const p = makePage({ url: "https://www.youtube.com/playlist?list=WL", launch: { mode: "manage", target: "watchLater" }, failIds: [vid(1)] });
    assert(await until(() => p.qa(".row").length === 3), "watch later: lists 3 videos");
    p.qa(".chip")[0].click();
    p.btn(/^(Remove|Remover) 3$/).click();
    p.btn(/^(Confirm|Confirmar)/).click();
    assert(await until(() => p.calls.length === 3), "watch later: 3 edits sent");
    assert(p.calls.every((c) => c.u.includes("/browse/edit_playlist") && c.body.playlistId === "WL" && c.body.actions[0].action === "ACTION_REMOVE_VIDEO_BY_VIDEO_ID"), "watch later: remove action on playlist WL");
    assert(await until(() => /1 (failed|falharam)/.test(p.text())), "watch later: STATUS_FAILED counted as a failure");
    assert(/2 videos removed|2 vídeos removidos/.test(p.text()) && /\(-3\)/.test(p.text()), "watch later: summary lists the failed item");
    assert(/failures|falhas/.test(p.text()), "watch later: partial title");
  }

  // ================= subscriptions (+ params fallback) =================
  {
    const p = makePage({ url: "https://www.youtube.com/feed/channels", kind: "channels", launch: { mode: "manage", target: "subscriptions" }, failWithParams: true });
    assert(await until(() => p.qa(".row").length === 3), "subs: lists 3 channels");
    const saved = JSON.parse(p.w.__blobs[0]);
    assert(saved.type === "subscriptions" && saved.items[0].url === "https://www.youtube.com/@c1" && saved.items[0].avatar === "https://yt3.ggpht.com/" + UC(1), "subs: backup keeps url and normalised avatar");
    p.qa(".row input")[0].click();
    p.qa(".row input")[2].click();
    p.btn(/^(Remove|Remover) 2$/).click();
    p.btn(/^(Confirm|Confirmar)/).click();
    assert(await until(() => /2 channels unsubscribed|2 inscrições canceladas/.test(p.text())), "subs: finishes");
    const withParams = p.calls.filter((c) => c.body.params).length;
    const without = p.calls.filter((c) => !c.body.params).length;
    assert(withParams === 1 && without === 2, `subs: tries params once, then drops them (with=${withParams}, without=${without})`);
    assert(p.calls.every((c) => c.u.includes("/subscription/unsubscribe")), "subs: unsubscribe endpoint");
  }

  // ================= wrong page =================
  {
    const p = makePage({ url: "https://www.youtube.com/", kind: "none", launch: { mode: "manage", target: "likes" } });
    assert(await until(() => p.btn(/Open the page|Abrir a página/)), "wrong page: offers to open the right one");
  }

  // ================= restore =================
  {
    const p = makePage({ url: "https://www.youtube.com/", kind: "none", launch: { mode: "restore" } });
    const input = p.q("input[type=file]");
    const give = async (content) => {
      Object.defineProperty(input, "files", { configurable: true, value: [{ text: async () => content }] });
      input.dispatchEvent(new p.w.Event("change"));
    };

    await give("not a backup");
    assert(await until(() => /not a valid backup|não é um backup válido/.test(p.text())), "restore: rejects an invalid file");

    const backup = p.w.__ylc.buildBackup("likes", VIDEOS.map(({ id, title }) => ({ id, title })));
    await give(JSON.stringify(backup));
    assert(await until(() => p.qa(".row").length === 3), "restore: shows the items of the backup");
    assert(p.qa(".row input").every((c) => c.checked), "restore: everything ticked by default");
    p.qa(".row input")[1].click();                  // untick the middle one
    p.btn(/^(Restore|Restaurar) 2$/).click();
    assert(await until(() => p.calls.length === 2), "restore: only the ticked items are sent");
    assert(p.calls.every((c) => c.u.includes("/like/like?")), "restore: like endpoint for likes");
    assert(p.calls.map((c) => c.body.target.videoId).join() === [vid(2), vid(0)].join(), "restore: oldest first (reverse of the page order)");
  }
  {
    // Oldest plain-array backup: asks which kind it is, then restores into Watch later.
    const p = makePage({ url: "https://www.youtube.com/", kind: "none", launch: { mode: "restore" } });
    const input = p.q("input[type=file]");
    Object.defineProperty(input, "files", { configurable: true, value: [{ text: async () => JSON.stringify(VIDEOS.map((v) => ({ id: v.id, titulo: v.title }))) }] });
    input.dispatchEvent(new p.w.Event("change"));
    assert(await until(() => p.btn(/^(Watch later|Ver mais tarde)$/) && p.btn(/^(Liked videos|Vídeos que gostei)$/)), "restore: ambiguous backup asks for the type");
    p.btn(/^(Watch later|Ver mais tarde)$/).click();
    assert(await until(() => p.qa(".row").length === 3), "restore: shows items after choosing the type");
    p.btn(/^(Restore|Restaurar) 3$/).click();
    assert(await until(() => p.calls.length === 3), "restore: 3 adds sent");
    assert(p.calls.every((c) => c.body.playlistId === "WL" && c.body.actions[0].action === "ACTION_ADD_VIDEO"), "restore: ACTION_ADD_VIDEO on WL");
    assert(p.calls.map((c) => c.body.actions[0].addedVideoId).join() === [vid(2), vid(1), vid(0)].join(), "restore: reverse order for playlists too");
  }
  {
    // Subscriptions restore keeps the original order.
    const p = makePage({ url: "https://www.youtube.com/", kind: "none", launch: { mode: "restore" } });
    const input = p.q("input[type=file]");
    const items = CHANNELS.map((c) => ({ id: c.id, title: c.title, subtitle: "", url: "", avatar: "" }));
    Object.defineProperty(input, "files", { configurable: true, value: [{ text: async () => JSON.stringify(p.w.__ylc.buildBackup("subscriptions", items)) }] });
    input.dispatchEvent(new p.w.Event("change"));
    assert(await until(() => p.qa(".row").length === 3), "restore subs: shows channels");
    p.btn(/^(Restore|Restaurar) 3$/).click();
    assert(await until(() => p.calls.length === 3), "restore subs: 3 subscribes sent");
    assert(p.calls.every((c) => c.u.includes("/subscription/subscribe")), "restore subs: subscribe endpoint");
    assert(p.calls.map((c) => c.body.channelIds[0]).join() === CHANNELS.map((c) => c.id).join(), "restore subs: original order");
  }

  // ================= window behaviour =================
  {
    const p = makePage({ url: "https://www.youtube.com/playlist?list=LL", launch: { mode: "manage", target: "likes" } });
    assert(await until(() => p.qa(".row").length === 3), "window: ready");
    let reached = false;
    p.w.document.addEventListener("keydown", () => { reached = true; });
    p.q("input[type=text]").dispatchEvent(new p.w.KeyboardEvent("keydown", { key: "k", bubbles: true, composed: true }));
    assert(!reached, "window: typing does not leak to YouTube's hotkeys");
    p.q(".backdrop").dispatchEvent(new p.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert(!p.root(), "window: Escape closes it when idle");
    assert(p.w.__ylcActive === false, "window: can be reopened after closing");
  }

  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  process.exitCode = failures ? 1 : 0;
})();
