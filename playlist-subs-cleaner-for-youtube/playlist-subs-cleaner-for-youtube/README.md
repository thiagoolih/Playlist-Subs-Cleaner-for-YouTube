# Playlist & Subs Cleaner for YouTube

[Português](README.pt-BR.md)

A browser extension (Microsoft Edge, Google Chrome and other Chromium browsers) to clean up your YouTube library in a few clicks:

- **Liked videos**: remove the like from the videos you picked (or all of them).
- **Watch later**: remove videos from your Watch later playlist.
- **Subscriptions**: choose, one by one, which channels to unsubscribe from.

Before anything is removed, a **backup** of the whole list is saved to your computer, and you can **restore** it later with one click.

It runs entirely in your browser, using the session you are already logged into. No API keys, no Google Cloud project, no external servers.

<p align="center">
  <img src="docs/popup.png" alt="The popup with the three cleanup options" width="300">
  &nbsp;
  <img src="docs/picker.png" alt="Choosing which videos to remove" width="520">
</p>

> Screenshots use simulated data.

## Features

- **One extension, three cleanups**, with the same simple flow: load, choose, clean, done.
- **You choose what goes.** Every list is a checklist with thumbnails or avatars. Nothing is selected by default. Search by name (accent and case insensitive), *Select shown* and *Clear* make long lists manageable.
- **Confirmation step** before removing, cancelled automatically if you change the selection.
- **Automatic backup** of *everything* found (not only what you ticked), downloaded as a `.json` file before the cleanup starts.
- **Smart restore**: one entry point for all backups. The extension recognises what the file contains, and also reads the backups made by the earlier single-purpose versions of this project.
- **Progress** with percentage, time left, a Stop button, automatic slow-down when YouTube rate-limits, and a list of the items that failed.
- **Light and dark** themes (follows YouTube's), **English and Portuguese (BR)**.

## Install (unpacked)

1. Download or clone this repository.
2. Open `edge://extensions` (Edge) or `chrome://extensions` (Chrome).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the project folder (the one that contains `manifest.json`).
5. Pin the extension to the toolbar.

Requires a Chromium-based browser, version 111 or newer.

## Usage

### Clean something

1. Click the extension icon and choose **Liked videos**, **Watch later** or **Subscriptions**. The right YouTube page opens in a new tab if you are not already on it, and the cleaner starts by itself.
2. The extension scrolls through the whole list and downloads the backup.
3. Tick what you want to remove. Use the search box to narrow the list.
4. Click **Remove N**, then click again to confirm.
5. When it finishes, reload the page to see the result.

Tip: try it with two or three items first.

### Restore from a backup

1. Click the extension icon and choose **Restore from a backup**.
2. Choose (or drop) the `.json` file. Everything is ticked; untick what you do not want back.
3. Click **Restore N**.

What restoring does and does not bring back:

| Backup of | Result |
| --- | --- |
| Liked videos | Videos are liked again, oldest first, so the list order is recreated. The original like dates are not recovered. |
| Watch later | Videos are added back, from the last to the first, to try to keep the order. Where they land depends on the playlist's sort setting. |
| Subscriptions | You are subscribed again. The notification bell, the original date and any grouping are not restored. |

### Backup format

```json
{
  "format": "youtube-library-cleaner-backup",
  "version": 1,
  "type": "likes",
  "exportedAt": "2026-10-09T12:00:00.000Z",
  "total": 1,
  "items": [
    { "id": "dQw4w9WgXcQ", "title": "Video title", "channel": "Channel", "duration": "3:33" }
  ]
}
```

The `format` identifier keeps the project's original name so that existing backups keep working. `type` is `likes`, `watchLater` or `subscriptions` (subscription items have `id`, `title`, `subtitle`, `url` and `avatar`). Files from the earlier standalone extensions are also accepted, including the very first format (a plain array of `{ "id", "titulo" }`), in which case the extension asks you whether it is a Liked videos or a Watch later backup.

## How it works

The popup asks a background service worker to open the right page and inject the scripts in `src/page/` into the tab, in the page's own JavaScript context (needed to read `window.ytcfg`). The window you see is drawn inside a Shadow DOM, so YouTube's styles cannot affect it.

The actions use the same internal endpoints the YouTube web client uses, authenticated with the standard `SAPISIDHASH` header computed from your own session cookie:

| Target | Endpoint | Action |
| --- | --- | --- |
| Liked videos | `like/removelike` and `like/like` | per video |
| Watch later | `browse/edit_playlist` | `ACTION_REMOVE_VIDEO_BY_VIDEO_ID`, `ACTION_ADD_VIDEO` on playlist `WL` |
| Subscriptions | `subscription/unsubscribe` and `subscription/subscribe` | per channel |

The official YouTube Data API is not a good fit: it needs OAuth credentials and a Google Cloud project, each call spends quota, and it no longer lets applications modify Watch later.

## Privacy

- Nothing is sent anywhere except to `youtube.com`, from your own browser.
- No analytics, no telemetry, no remote code.
- The only permissions are `scripting` and access to `https://www.youtube.com/*`.
- Backups are saved only to your computer's downloads folder.

## Limitations and disclaimer

- This project is **unofficial** and not affiliated with YouTube or Google.
- It reads lists from YouTube's pages and uses **internal, undocumented endpoints**. Either may change at any time and break the extension. The automated tests use a simulated page and cannot catch that.
- Automating actions on your account may go against YouTube's Terms of Service. **Use at your own risk.** Requests are paced on purpose (about one per second).
- **Keep the tab open and visible** while it runs. Browsers slow down background tabs heavily, which can make long cleanups very slow.
- **Large lists take time.** At about one item per second, 5,000 items take well over an hour. If anything is left, run it again.
- **Counters can lag.** After a cleanup, the number in a playlist header or elsewhere may stay the same for a few hours (YouTube-side caching). Hard-reload with `Ctrl+Shift+R` or look again later.
- **Unavailable items** (deleted or private videos, terminated channels) may be hidden from the list, cannot be removed by this extension, and cannot be restored.
- Removing is only reversible through the restore feature or by hand. Keep the backup file.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| Nothing found | Make sure you are logged into the right account and on the right page. |
| Failures with status `400` or `-3` | The internal API may have changed. Open an issue with the console output (`F12`). |
| Status `401` / `403` | Your session is not valid. Reload YouTube and log in again. |
| Status `429` | YouTube is rate-limiting. The extension waits 60 s and retries on its own. |
| Nothing happens after clicking | Reload the YouTube tab and try again. |
| Several Google accounts | The extension acts on the account active in the tab. Check it before confirming. |

## Development

```bash
npm install
npm test
```

The tests load the real page scripts into a simulated YouTube page (jsdom) and drive the window like a user would. They cover the backup parser, the three cleanups, the restore flow and the window behaviour.

```
manifest.json            Manifest V3
src/background.js        Opens the right page and injects the scripts
src/popup/               Toolbar popup
src/page/i18n.js         Texts of the window (en / pt)
src/page/styles.js       Window stylesheet (Shadow DOM)
src/page/api.js          Authenticated calls to YouTube's internal API
src/page/targets.js      Likes, Watch later and Subscriptions: collect and act
src/page/backup.js       Backup format, parser and legacy formats
src/page/ui.js           The window (no innerHTML: YouTube enforces Trusted Types)
src/page/main.js         Clean and restore flows
_locales/                Popup and manifest translations
tests/smoke.test.js      Simulated-page tests
```

To add a language, add an entry in `src/page/i18n.js` and a folder under `_locales/`.

## Contributing

Issues and pull requests are welcome, especially reports of YouTube changes that break a cleanup.

## License

[MIT](LICENSE)
