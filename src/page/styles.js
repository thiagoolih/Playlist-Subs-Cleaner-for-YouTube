// Stylesheet for the window. It lives inside a Shadow DOM, so YouTube's own
// CSS cannot affect it (and it cannot affect YouTube).
(() => {
  const NS = (window.__ylc = window.__ylc || {});

  NS.css = `
:host { all: initial; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }

.backdrop {
  position: fixed; inset: 0; z-index: 2147483647;
  display: flex; align-items: center; justify-content: center; padding: 16px;
  background: rgba(0, 0, 0, .62);
  font: 14px/1.45 Roboto, "Segoe UI", system-ui, -apple-system, sans-serif;
  animation: fade .15s ease-out;
}
.backdrop[data-theme="dark"] {
  --bg: #1c1c1f; --bg2: #26262a; --fg: #f3f3f5; --muted: #a2a2ab;
  --line: #34343a; --hover: #2d2d32; --shadow: 0 24px 70px rgba(0, 0, 0, .65);
}
.backdrop[data-theme="light"] {
  --bg: #ffffff; --bg2: #f4f4f6; --fg: #18181b; --muted: #6b6b75;
  --line: #e5e5ea; --hover: #f0f0f4; --shadow: 0 24px 70px rgba(0, 0, 0, .28);
}

.card {
  --accent: #e5384f;
  display: flex; flex-direction: column;
  width: min(680px, 100%); height: min(760px, 100%);
  background: var(--bg); color: var(--fg);
  border-radius: 22px; box-shadow: var(--shadow); overflow: hidden;
  animation: pop .22s cubic-bezier(.2, .9, .3, 1.1);
  outline: none;
}

/* ---------- header ---------- */
header { display: flex; align-items: center; gap: 14px; padding: 20px 22px 14px; }
.badge {
  display: grid; place-items: center; flex: none; width: 46px; height: 46px; border-radius: 14px;
  background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent);
}
.badge svg { width: 24px; height: 24px; }
.titles { flex: 1; min-width: 0; }
h1 { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -.01em; }
.sub { color: var(--muted); font-size: 13px; }
.x {
  display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: 10px;
  background: none; color: var(--muted); cursor: pointer;
}
.x:hover:not(:disabled) { background: var(--hover); color: var(--fg); }
.x:disabled { opacity: .35; cursor: default; }
.x svg { width: 18px; height: 18px; }

/* ---------- steps ---------- */
.steps { display: flex; gap: 8px; padding: 0 22px 14px; }
.step { flex: 1; min-width: 0; }
.step i { display: block; height: 4px; border-radius: 2px; background: var(--line); transition: background .25s; }
.step span { display: block; margin-top: 5px; color: var(--muted); font-size: 11px; font-weight: 500;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.step.done i, .step.on i { background: var(--accent); }
.step.on span { color: var(--fg); font-weight: 700; }

/* ---------- views ---------- */
.body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.view { display: none; flex: 1; min-height: 0; flex-direction: column; }
.view.on { display: flex; }
.center { align-items: center; justify-content: center; gap: 10px; padding: 28px; text-align: center; }
.big { font-size: 19px; font-weight: 700; letter-spacing: -.01em; }
.muted { color: var(--muted); }
.spinner {
  width: 40px; height: 40px; margin-bottom: 6px; border-radius: 50%;
  border: 3px solid var(--line); border-top-color: var(--accent); animation: spin .8s linear infinite;
}
.round {
  display: grid; place-items: center; width: 68px; height: 68px; margin-bottom: 6px; border-radius: 50%;
  background: color-mix(in srgb, var(--tone, var(--accent)) 16%, transparent); color: var(--tone, var(--accent));
}
.round svg { width: 34px; height: 34px; }
.round.ok { --tone: #2e9e5b; }
.round.warn { --tone: #e8a317; }
.round.bad { --tone: #d93025; }

/* ---------- picker ---------- */
.banner {
  display: flex; align-items: flex-start; gap: 10px; margin: 0 22px 10px; padding: 10px 14px;
  border-radius: 12px; background: var(--bg2); color: var(--fg); font-size: 13px;
}
.banner.ok { background: color-mix(in srgb, #2e9e5b 14%, transparent); }
.banner.warn { background: color-mix(in srgb, #e8a317 18%, transparent); }
.banner svg { flex: none; width: 18px; height: 18px; margin-top: 1px; }
.banner.ok svg { color: #2e9e5b; }
.banner.warn svg { color: #c98a0b; }
.note { margin: 0 22px 10px; color: var(--muted); font-size: 12.5px; }

.toolbar { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 22px 12px; }
.search { position: relative; flex: 1; min-width: 170px; }
.search svg {
  position: absolute; left: 12px; top: 50%; width: 16px; height: 16px; color: var(--muted);
  transform: translateY(-50%); pointer-events: none;
}
.search input {
  width: 100%; height: 40px; padding: 0 12px 0 36px; border: 1px solid var(--line); border-radius: 12px;
  background: var(--bg2); color: var(--fg); font: inherit; outline: none;
  transition: border-color .15s, box-shadow .15s;
}
.search input::placeholder { color: var(--muted); }
.search input:focus {
  border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
}
.chip {
  height: 40px; padding: 0 14px; border: 1px solid var(--line); border-radius: 12px;
  background: var(--bg); color: var(--fg); font: inherit; font-weight: 500; cursor: pointer;
}
.chip:hover { background: var(--hover); }

.list { flex: 1; min-height: 0; overflow-y: auto; padding: 6px 10px; border-top: 1px solid var(--line); }
.list::-webkit-scrollbar { width: 10px; }
.list::-webkit-scrollbar-thumb { border-radius: 5px; background: var(--line); border: 2px solid var(--bg); }
.row {
  display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-radius: 14px; cursor: pointer;
  content-visibility: auto; contain-intrinsic-size: auto 70px; transition: background .12s;
}
.row:hover { background: var(--hover); }
.row.sel { background: color-mix(in srgb, var(--accent) 11%, transparent); }
.row input { flex: none; width: 18px; height: 18px; margin: 0; accent-color: var(--accent); cursor: pointer; }
.thumb { flex: none; width: 104px; height: 58px; border-radius: 9px; object-fit: cover; background: var(--bg2); }
.avatar { flex: none; width: 46px; height: 46px; border-radius: 50%; object-fit: cover; background: var(--bg2); }
.rt { flex: 1; min-width: 0; }
.rt b {
  display: block; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.row.video .rt b {
  display: -webkit-box; white-space: normal; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
}
.rt small { display: block; margin-top: 1px; color: var(--muted); font-size: 12px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty { padding: 36px 16px; text-align: center; color: var(--muted); }

/* ---------- run ---------- */
.progress { width: min(440px, 100%); height: 10px; margin: 8px 0 2px; border-radius: 5px; background: var(--line); overflow: hidden; }
.progress i { display: block; width: 0; height: 100%; border-radius: 5px; background: var(--accent); transition: width .25s ease; }
.pct { font-size: 44px; font-weight: 800; letter-spacing: -.03em; line-height: 1; color: var(--accent); }
.current { max-width: 100%; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stats { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 16px; color: var(--muted); font-size: 13px; }
.stats .bad { color: #d93025; }
.warnline { color: #c98a0b; font-weight: 600; min-height: 20px; }

/* ---------- done ---------- */
details { width: min(460px, 100%); margin-top: 6px; text-align: left; }
summary { cursor: pointer; color: var(--muted); font-size: 13px; }
.faillist { max-height: 150px; margin: 8px 0 0; padding: 8px 12px; overflow: auto; list-style: none;
  border-radius: 10px; background: var(--bg2); font-size: 12.5px; }
.faillist li { padding: 2px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ---------- file ---------- */
.drop {
  display: flex; flex-direction: column; align-items: center; gap: 6px; width: min(460px, 100%);
  padding: 38px 20px; border: 2px dashed var(--line); border-radius: 18px; cursor: pointer; outline: none;
  transition: border-color .15s, background .15s;
}
.drop:hover, .drop:focus-visible, .drop.over {
  border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent);
}
.drop .round { margin-bottom: 4px; }
.err { color: #d93025; font-weight: 600; min-height: 20px; }

/* ---------- footer ---------- */
footer { display: flex; align-items: center; gap: 10px; padding: 14px 22px 16px; border-top: 1px solid var(--line); }
.info { flex: 1; min-width: 0; color: var(--muted); font-size: 13px; }
.actions { display: flex; gap: 8px; }
.btn {
  height: 42px; padding: 0 20px; border: 1px solid var(--line); border-radius: 12px;
  background: var(--bg); color: var(--fg); font: inherit; font-weight: 600; cursor: pointer;
  transition: background .12s, filter .12s, transform .05s;
}
.btn:hover:not(:disabled) { background: var(--hover); }
.btn:active:not(:disabled) { transform: translateY(1px); }
.btn.primary { border-color: transparent; background: var(--accent); color: #fff; }
.btn.danger { border-color: transparent; background: #d93025; color: #fff; }
.btn.primary:hover:not(:disabled), .btn.danger:hover:not(:disabled) { filter: brightness(1.1); }
.btn:disabled { opacity: .4; cursor: default; }
.btn.armed { animation: pulse 1s ease-in-out infinite; }
.btn:focus-visible, .chip:focus-visible, .x:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 2px;
}

@keyframes fade { from { opacity: 0; } }
@keyframes pop { from { opacity: 0; transform: translateY(10px) scale(.98); } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulse { 50% { box-shadow: 0 0 0 5px color-mix(in srgb, #d93025 30%, transparent); } }
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
@media (max-width: 520px) {
  .thumb { width: 84px; height: 48px; }
  .btn { padding: 0 14px; }
}
`;
})();
