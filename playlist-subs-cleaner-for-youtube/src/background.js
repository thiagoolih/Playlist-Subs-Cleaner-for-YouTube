// Service worker: opens the right YouTube page when needed, waits for it to
// load and injects the page scripts into the tab's MAIN world
// (window.ytcfg is only reachable from the page's own JS context).

const ORIGIN = "https://www.youtube.com";

const TARGET_URL = {
  likes: ORIGIN + "/playlist?list=LL",
  watchLater: ORIGIN + "/playlist?list=WL",
  subscriptions: ORIGIN + "/feed/channels",
};

const TARGET_PAGE = {
  likes: /^https:\/\/www\.youtube\.com\/playlist\?(?:.*&)?list=LL(?:&|$)/,
  watchLater: /^https:\/\/www\.youtube\.com\/playlist\?(?:.*&)?list=WL(?:&|$)/,
  subscriptions: /^https:\/\/www\.youtube\.com\/feed\/channels/,
};

// Order matters: each file extends the shared window.__ylc namespace.
const PAGE_FILES = [
  "src/page/i18n.js",
  "src/page/styles.js",
  "src/page/api.js",
  "src/page/targets.js",
  "src/page/backup.js",
  "src/page/ui.js",
  "src/page/main.js",
];

function waitForLoad(tabId, timeoutMs = 25000) {
  return new Promise((resolve) => {
    const isReady = (tab) => tab && tab.status === "complete" && (tab.url || "").startsWith(ORIGIN);
    let timer;
    const finish = () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
      resolve();
    };
    const onUpdated = (id, _info, tab) => { if (id === tabId && isReady(tab)) finish(); };
    chrome.tabs.onUpdated.addListener(onUpdated);
    timer = setTimeout(finish, timeoutMs);
    chrome.tabs.get(tabId).then((tab) => { if (isReady(tab)) finish(); }).catch(() => {});
  });
}

async function inject(tabId, launch) {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (l) => { window.__ylcLaunch = l; },
    args: [launch],
  });
  await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", files: PAGE_FILES });
}

async function handleLaunch({ mode, target, tabId, tabUrl }) {
  const launch = { mode, target: target || null };
  const onYouTube = (tabUrl || "").startsWith(ORIGIN + "/");
  const ready = mode === "restore" ? onYouTube : TARGET_PAGE[target].test(tabUrl || "");

  if (ready) {
    await inject(tabId, launch);
    return;
  }
  const url = mode === "restore" ? ORIGIN + "/" : TARGET_URL[target];
  const tab = await chrome.tabs.create({ url });
  await waitForLoad(tab.id);
  await inject(tab.id, launch);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.kind !== "launch") return false;
  handleLaunch(message).then(
    () => sendResponse({ ok: true }),
    (e) => sendResponse({ ok: false, error: String((e && e.message) || e) })
  );
  return true; // async response
});
