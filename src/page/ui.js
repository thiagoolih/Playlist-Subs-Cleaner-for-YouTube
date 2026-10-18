// The window shown on top of YouTube. Built with createElement only (YouTube
// enforces Trusted Types, so innerHTML is off limits) inside a Shadow DOM.
(() => {
  const NS = (window.__ylc = window.__ylc || {});
  const SVG_NS = "http://www.w3.org/2000/svg";

  // ----------------------------------------------------------------- icons
  const ICONS = {
    close: { stroke: "M6 6l12 12M18 6L6 18" },
    search: { stroke: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.35-4.35" },
    check: { stroke: "M5 12.5l4.5 4.5L19 7.5" },
    thumb: { fill: "M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" },
    clock: { fill: "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" },
    users: { fill: "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" },
    restore: { fill: "M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" },
    alert: { fill: "M12 2L1 21h22L12 2zm1 15h-2v-2h2v2zm0-4h-2V9h2v4z" },
    upload: { fill: "M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z" },
    file: { fill: "M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z" },
  };

  function icon(name) {
    const def = ICONS[name] || ICONS.file;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(SVG_NS, "path");
    if (def.fill) {
      path.setAttribute("d", def.fill);
      path.setAttribute("fill", "currentColor");
    } else {
      path.setAttribute("d", def.stroke);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "2.2");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
    }
    svg.appendChild(path);
    return svg;
  }
  NS.icon = icon;

  // Tiny element factory: h("div", { class, text, onclick, ...props }, ...children)
  function h(tag, props = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (/^on[a-z]+$/.test(k)) e.addEventListener(k.slice(2), v);
      else if (k in e) e[k] = v;
      else e.setAttribute(k, v);
    }
    kids.flat().forEach((c) => { if (c != null) e.append(c); });
    return e;
  }

  const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  function fmtTime(sec) {
    if (sec < 60) return `${Math.max(1, Math.round(sec))} s`;
    const m = Math.round(sec / 60);
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
  }

  // ------------------------------------------------------------------ UI
  NS.createUI = function createUI({ onClose } = {}) {
    const { t } = NS;
    let busy = false;
    let closed = false;
    let fileHandler = null;

    // ---- skeleton
    const badge = h("div", { class: "badge" });
    const titleEl = h("h1");
    const subEl = h("div", { class: "sub" });
    const closeBtn = h("button", { class: "x", type: "button", "aria-label": t("btn_close"), onclick: () => api.close() }, icon("close"));
    const steps = h("div", { class: "steps" });

    // views
    const loadTitle = h("div", { class: "big" });
    const loadCount = h("div", { class: "muted" });
    const loadHint = h("div", { class: "muted" });
    const vLoading = h("section", { class: "view center" }, h("div", { class: "spinner" }), loadTitle, loadCount, loadHint);

    const msgRound = h("div", { class: "round" });
    const msgTitle = h("div", { class: "big" });
    const msgText = h("div", { class: "muted" });
    const vMessage = h("section", { class: "view center" }, msgRound, msgTitle, msgText);

    const bannerBox = h("div", { class: "banner" });
    const noteEl = h("p", { class: "note" });
    const toolbar = h("div", { class: "toolbar" });
    const emptyEl = h("div", { class: "empty", text: t("no_matches"), hidden: true });
    const listEl = h("div", { class: "list" });
    const vPicker = h("section", { class: "view" }, bannerBox, noteEl, toolbar, listEl);

    const runTitle = h("div", { class: "big" });
    const runPct = h("div", { class: "pct", text: "0%" });
    const runCurrent = h("div", { class: "current" });
    const runFill = h("i");
    const runBar = h("div", { class: "progress" }, runFill);
    const runStats = h("div", { class: "stats" });
    const runWarn = h("div", { class: "warnline" });
    const runHint = h("div", { class: "muted", text: t("run_hint") });
    const vRun = h("section", { class: "view center" }, runPct, runTitle, runCurrent, runBar, runStats, runWarn, runHint);

    const doneRound = h("div", { class: "round" });
    const doneTitle = h("div", { class: "big" });
    const doneResult = h("div", { class: "stats" });
    const doneDetails = h("div");
    const doneHint = h("div", { class: "muted" });
    const vDone = h("section", { class: "view center" }, doneRound, doneTitle, doneResult, doneDetails, doneHint);

    const fileInput = h("input", { type: "file", accept: ".json,application/json", hidden: true });
    const fileErr = h("div", { class: "err" });
    const drop = h(
      "div",
      { class: "drop", tabindex: "0", role: "button" },
      h("div", { class: "round" }, icon("upload")),
      h("div", { class: "big", text: t("file_title") }),
      h("div", { class: "muted", text: t("file_text") })
    );
    const vFile = h("section", { class: "view center" }, drop, fileErr, fileInput);

    const views = { loading: vLoading, message: vMessage, picker: vPicker, run: vRun, done: vDone, file: vFile };
    const body = h("div", { class: "body" }, ...Object.values(views));

    const footerInfo = h("div", { class: "info" });
    const footerActions = h("div", { class: "actions" });
    const footer = h("footer", {}, footerInfo, footerActions);

    const card = h(
      "div",
      { class: "card", role: "dialog", "aria-modal": "true", tabindex: "-1" },
      h("header", {}, badge, h("div", { class: "titles" }, titleEl, subEl), closeBtn),
      steps,
      body,
      footer
    );
    const backdrop = h("div", { class: "backdrop", "data-theme": document.documentElement.hasAttribute("dark") ? "dark" : "light" }, card);

    // YouTube listens for hotkeys on the document; keep our typing to ourselves.
    for (const type of ["keydown", "keyup", "keypress"]) {
      backdrop.addEventListener(type, (e) => {
        e.stopPropagation();
        if (type === "keydown" && e.key === "Escape" && !busy) api.close();
      });
    }

    const host = h("div", { id: "ylc-host" });
    const root = host.attachShadow({ mode: "open" });
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(NS.css);
      root.adoptedStyleSheets = [sheet];
    } catch (e) {
      root.append(h("style", { text: NS.css }));
    }
    root.append(backdrop);
    document.body.appendChild(host);
    try { card.focus(); } catch (e) { /* ignore */ }

    // ---- file drop zone (wired once)
    const pickFile = () => fileInput.click();
    drop.addEventListener("click", pickFile);
    drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickFile(); } });
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("over");
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && fileHandler) fileHandler(f);
    });
    fileInput.addEventListener("change", () => {
      const f = fileInput.files && fileInput.files[0];
      fileInput.value = "";
      if (f && fileHandler) fileHandler(f);
    });

    // ---- helpers
    const show = (name) => {
      for (const [k, v] of Object.entries(views)) v.classList.toggle("on", k === name);
    };

    // buttons: [{ label, kind: "primary"|"danger"|"", onClick, disabled }]
    const setFooter = (buttons, info = "") => {
      footerInfo.textContent = info;
      const els = buttons.map((b) =>
        h("button", { class: "btn " + (b.kind || ""), type: "button", text: b.label, disabled: !!b.disabled, onclick: b.onClick })
      );
      footerActions.replaceChildren(...els);
      return els;
    };

    const setBusy = (value) => {
      busy = value;
      closeBtn.disabled = value;
    };

    const toneClass = (tone) => (tone === "ok" || tone === "warn" || tone === "bad" ? " " + tone : "");

    // ------------------------------------------------------------------ API
    const api = {
      host,
      shadow: root,

      setTarget({ accent, iconName, title, subtitle }) {
        card.style.setProperty("--accent", accent);
        badge.replaceChildren(icon(iconName));
        titleEl.textContent = title;
        subEl.textContent = subtitle || "";
      },

      setSteps(labels, active) {
        steps.replaceChildren(
          ...labels.map((label, i) =>
            h("div", { class: "step" + (i < active ? " done" : i === active ? " on" : "") }, h("i"), h("span", { text: label }))
          )
        );
      },

      loading({ title, count, hint }) {
        loadTitle.textContent = title;
        loadCount.textContent = count;
        loadHint.textContent = hint || "";
        if (!vLoading.classList.contains("on")) {
          show("loading");
          setFooter([{ label: t("btn_cancel"), onClick: () => api.close() }]);
        }
      },

      message({ tone = "", iconName = "alert", title, text = "", buttons = [] }) {
        setBusy(false);
        show("message");
        msgRound.className = "round" + toneClass(tone);
        msgRound.replaceChildren(icon(iconName));
        msgTitle.textContent = title;
        msgText.textContent = text;
        setFooter(buttons);
      },

      // Checklist of items. cfg: { items, kind, preselect, danger, banner, note,
      //   actionKey, confirmKey, onSubmit(selectedItems), onCancel }
      picker(cfg) {
        const { items, kind, preselect = false, danger = false, banner, note, actionKey, confirmKey, onSubmit } = cfg;
        setBusy(false);
        show("picker");

        const selected = new Set(preselect ? items.map((i) => i.id) : []);
        let armed = false;

        if (banner) {
          bannerBox.hidden = false;
          bannerBox.className = "banner " + (banner.tone || "");
          bannerBox.replaceChildren(icon(banner.tone === "warn" ? "alert" : "check"), h("span", { text: banner.text }));
        } else {
          bannerBox.hidden = true;
        }
        noteEl.hidden = !note;
        noteEl.textContent = note || "";

        // rows
        const rows = items.map((item) => {
          const cb = h("input", { type: "checkbox", checked: selected.has(item.id) });
          let media;
          if (kind === "video") {
            media = h("img", { class: "thumb", src: `https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`, loading: "lazy", alt: "" });
          } else {
            media = item.avatar ? h("img", { class: "avatar", src: item.avatar, loading: "lazy", alt: "" }) : h("div", { class: "avatar" });
          }
          media.addEventListener("error", () => { media.style.visibility = "hidden"; });

          const sub = kind === "video" ? [item.channel, item.duration].filter(Boolean).join(" \u00b7 ") : item.subtitle;
          const row = h(
            "label",
            { class: "row" + (kind === "video" ? " video" : "") + (selected.has(item.id) ? " sel" : "") },
            cb,
            media,
            h("div", { class: "rt" }, h("b", { text: item.title || item.id }), h("small", { text: sub || "" }))
          );
          return { item, cb, row, hay: norm(`${item.title} ${item.channel || ""} ${item.subtitle || ""}`) };
        });
        listEl.replaceChildren(...rows.map((r) => r.row), emptyEl);
        emptyEl.hidden = true;
        listEl.scrollTop = 0;

        // footer
        const cancel = { label: t("btn_cancel"), onClick: () => (cfg.onCancel ? cfg.onCancel() : api.close()) };
        const submit = () => {
          if (!selected.size) return;
          if (danger && !armed) { armed = true; refresh(); return; }
          onSubmit(items.filter((i) => selected.has(i.id)));
        };
        const [, go] = setFooter([cancel, { label: "", kind: danger ? "danger" : "primary", onClick: submit }]);

        const refresh = () => {
          const n = selected.size;
          footerInfo.textContent = t("counter", { n, total: items.length });
          go.textContent = t(armed ? confirmKey : actionKey, { n });
          go.disabled = n === 0;
          go.classList.toggle("armed", armed);
        };
        const changed = () => { armed = false; refresh(); };

        rows.forEach((r) => {
          r.cb.addEventListener("change", () => {
            if (r.cb.checked) selected.add(r.item.id); else selected.delete(r.item.id);
            r.row.classList.toggle("sel", r.cb.checked);
            changed();
          });
        });

        // toolbar: search + bulk actions
        const search = h("input", { type: "text", placeholder: t("filter_placeholder"), "aria-label": t("filter_placeholder") });
        search.addEventListener("input", () => {
          const q = norm(search.value.trim());
          let visible = 0;
          rows.forEach((r) => {
            const match = !q || r.hay.includes(q);
            r.row.hidden = !match;
            if (match) visible++;
          });
          emptyEl.hidden = visible > 0;
        });
        const setShown = (checked) => {
          rows.forEach((r) => {
            if (r.row.hidden) return;
            r.cb.checked = checked;
            r.row.classList.toggle("sel", checked);
            if (checked) selected.add(r.item.id); else selected.delete(r.item.id);
          });
          changed();
        };
        toolbar.replaceChildren(
          h("div", { class: "search" }, icon("search"), search),
          h("button", { class: "chip", type: "button", text: t("select_shown"), onclick: () => setShown(true) }),
          h("button", { class: "chip", type: "button", text: t("clear"), onclick: () => { rows.forEach((r) => { r.cb.checked = false; r.row.classList.remove("sel"); }); selected.clear(); changed(); } })
        );

        refresh();
        try { search.focus(); } catch (e) { /* ignore */ }
      },

      // Progress screen. Returns { update, throttled }.
      run({ title, onStop }) {
        setBusy(true);
        show("run");
        runTitle.textContent = title;
        runCurrent.textContent = "";
        runPct.textContent = "0%";
        runFill.style.width = "0";
        runStats.replaceChildren();
        runWarn.textContent = "";
        const [stopBtn] = setFooter([{ label: t("btn_stop"), onClick: () => { stopBtn.disabled = true; onStop(); } }]);
        return {
          update({ done, total, ok, fail, current, etaSec }) {
            runWarn.textContent = "";
            runCurrent.textContent = current || "";
            const pct = total ? (done / total) * 100 : 0;
            runFill.style.width = pct + "%";
            runPct.textContent = Math.floor(pct) + "%";
            const parts = [
              h("span", { text: t("run_progress", { done, total }) }),
              h("span", { text: t("run_ok", { n: ok }) }),
            ];
            if (fail) parts.push(h("span", { class: "bad", text: t("run_fail", { n: fail }) }));
            if (etaSec != null && done < total) parts.push(h("span", { text: t("run_eta", { time: fmtTime(etaSec) }) }));
            runStats.replaceChildren(...parts);
          },
          throttled(s) {
            runWarn.textContent = t("throttled", { s });
          },
        };
      },

      // Final screen. cfg: { tone, title, result, failed: [titles], hint }
      done({ tone = "ok", title, result, failed = [], hint }) {
        setBusy(false);
        show("done");
        doneRound.className = "round" + toneClass(tone);
        doneRound.replaceChildren(icon(tone === "ok" ? "check" : "alert"));
        doneTitle.textContent = title;
        doneResult.replaceChildren(h("span", { text: result }));
        if (failed.length) {
          doneResult.append(h("span", { class: "bad", text: t("failed_count", { n: failed.length }) }));
          doneDetails.replaceChildren(
            h("details", {}, h("summary", { text: t("failed_list") }), h("ul", { class: "faillist" }, ...failed.slice(0, 200).map((f) => h("li", { text: f }))))
          );
        } else {
          doneDetails.replaceChildren();
        }
        doneHint.textContent = hint || "";
        setFooter([
          { label: t("btn_reload"), kind: "primary", onClick: () => location.reload() },
          { label: t("btn_close"), onClick: () => api.close() },
        ]);
      },

      // File picker screen. onFile(File) is called when the user picks or drops a file.
      file({ onFile, error = "" }) {
        setBusy(false);
        fileHandler = onFile;
        fileErr.textContent = error;
        show("file");
        setFooter([{ label: t("btn_cancel"), onClick: () => api.close() }]);
        try { drop.focus(); } catch (e) { /* ignore */ }
      },

      fileError(text) {
        fileErr.textContent = text;
      },

      close() {
        if (closed) return;
        closed = true;
        host.remove();
        if (onClose) onClose();
      },
    };

    return api;
  };
})();
