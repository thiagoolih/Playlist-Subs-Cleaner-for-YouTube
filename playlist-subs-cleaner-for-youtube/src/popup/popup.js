// Popup: hands the choice to the background worker, which opens the right
// YouTube page if needed and injects the cleaner into it.

const $ = (id) => document.getElementById(id);
const msg = (key) => chrome.i18n.getMessage(key);

document.querySelectorAll("[data-i18n]").forEach((el) => {
  el.textContent = msg(el.dataset.i18n);
});
$("version").textContent = "v" + chrome.runtime.getManifest().version;

let launching = false;

async function launch(mode, target) {
  if (launching) return;
  launching = true;
  $("status").textContent = msg("statusOpening");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const res = await chrome.runtime.sendMessage({
      kind: "launch",
      mode,
      target,
      tabId: tab && tab.id,
      tabUrl: (tab && tab.url) || "",
    });
    if (res && res.ok) {
      window.close();
      return;
    }
    $("status").textContent = msg("errorPrefix") + ((res && res.error) || "?");
  } catch (e) {
    $("status").textContent = msg("errorPrefix") + e.message;
  }
  launching = false;
}

document.querySelectorAll("[data-target]").forEach((btn) => {
  btn.addEventListener("click", () => launch("manage", btn.dataset.target));
});
$("restore").addEventListener("click", () => launch("restore"));
