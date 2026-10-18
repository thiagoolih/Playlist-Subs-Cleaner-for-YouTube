// Entry point. Reads window.__ylcLaunch ({ mode: "manage" | "restore", target })
// set by the background worker and drives the two flows.
(async () => {
  "use strict";

  const NS = window.__ylc;
  if (window.__ylcActive) return;
  window.__ylcActive = true;

  const { t } = NS;
  const launch = window.__ylcLaunch || {};
  const THROTTLE_WAIT_S = 60;

  const state = { cancelled: false, stop: false };
  const ui = NS.createUI({
    onClose: () => {
      state.cancelled = true;
      state.stop = true;
      window.__ylcActive = false;
    },
  });

  const stepsFor = (verbKey) => [t("step_load"), t("step_choose"), t(verbKey), t("step_done")];
  const manageSteps = () => stepsFor("step_clean");
  const restoreSteps = () => [t("step_file"), t("step_choose"), t("step_restore"), t("step_done")];

  const describe = (targetId, mode) => {
    const target = NS.targets[targetId];
    return {
      target,
      name: t("target_" + targetId),
      accent: target.accent,
      iconName: target.icon,
      mode,
    };
  };

  // ---------------------------------------------------------------- runner
  async function runBatch(targetId, items, mode, steps) {
    const target = NS.targets[targetId];
    ui.setSteps(steps, 2);
    state.stop = false;

    const ctl = ui.run({
      title: t(`run_${mode}_${targetId}`),
      onStop: () => { state.stop = true; },
    });

    let ok = 0;
    let fail = 0;
    let error = "";
    const failed = [];
    const startedAt = Date.now();

    for (let i = 0; i < items.length && !state.stop; i++) {
      const item = items[i];
      let code = NS.codeOf(await target.act(mode, item));

      if (code === 429) {
        for (let s = THROTTLE_WAIT_S; s > 0 && !state.stop; s--) {
          ctl.throttled(s);
          await NS.sleep(1000);
        }
        if (state.stop) break;
        code = NS.codeOf(await target.act(mode, item));
      }
      if (code === 401 || code === 403) {
        error = t("no_perm", { st: code });
        break;
      }

      if (code === 200) {
        ok++;
      } else {
        fail++;
        failed.push(`${item.title || item.id} (${code})`);
        console.warn("[YLC] request failed:", item, "status", code);
      }

      const done = ok + fail;
      const etaSec = done ? Math.round((((Date.now() - startedAt) / done) * (items.length - done)) / 1000) : null;
      ctl.update({ done, total: items.length, ok, fail, current: item.title || item.id, etaSec });
      await NS.sleep(target.delayMs + Math.random() * 400);
    }

    ui.setSteps(steps, 3);
    const stopped = state.stop && !state.cancelled && !error && ok + fail < items.length;
    ui.done({
      tone: error ? "bad" : fail || stopped ? "warn" : "ok",
      title: error ? t("done_error") : stopped ? t("done_stopped") : fail ? t("done_partial") : t("done_title"),
      result: t(`result_${mode}_${targetId}`, { n: ok }),
      failed,
      hint: error || t("done_hint"),
    });
  }

  // ---------------------------------------------------------------- manage
  async function manage(targetId) {
    const { target, name, accent, iconName } = describe(targetId, "manage");
    const steps = manageSteps();
    ui.setTarget({ accent, iconName, title: t("title_manage", { target: name }), subtitle: t("subtitle_manage") });
    ui.setSteps(steps, 0);

    if (!target.onPage(location)) {
      ui.message({
        iconName: "alert",
        tone: "warn",
        title: t("need_page_title"),
        text: t("need_page", { target: name }),
        buttons: [
          { label: t("btn_open_page"), kind: "primary", onClick: () => { location.href = target.url; } },
          { label: t("btn_close"), onClick: () => ui.close() },
        ],
      });
      return;
    }

    ui.loading({ title: t("loading_title"), count: t("loading_count", { n: 0 }), hint: t("loading_hint") });
    const items = await target.collect(
      (n) => ui.loading({ title: t("loading_title"), count: t("loading_count", { n }), hint: t("loading_hint") }),
      () => state.cancelled
    );
    if (state.cancelled) return;

    if (!items.length) {
      ui.message({
        iconName: "alert",
        tone: "warn",
        title: t("none_title"),
        text: t("none_text"),
        buttons: [{ label: t("btn_close"), kind: "primary", onClick: () => ui.close() }],
      });
      return;
    }

    // Backup of everything found, before any choice is made.
    const backupOk = NS.downloadBackup(NS.buildBackup(targetId, items));

    ui.setSteps(steps, 1);
    ui.picker({
      items,
      kind: target.kind,
      danger: true,
      banner: backupOk
        ? { tone: "ok", text: t("banner_backup_ok", { n: items.length }) }
        : { tone: "warn", text: t("banner_backup_fail") },
      actionKey: "btn_remove",
      confirmKey: "btn_confirm",
      onSubmit: (selected) => runBatch(targetId, selected, "remove", steps),
    });
  }

  // --------------------------------------------------------------- restore
  function pickItems(targetId, items) {
    const { target, accent, iconName } = describe(targetId, "restore");
    const steps = restoreSteps();
    ui.setTarget({ accent, iconName, title: t("title_restore"), subtitle: t("target_" + targetId) });
    ui.setSteps(steps, 1);
    ui.picker({
      items,
      kind: target.kind,
      preselect: true,
      danger: false,
      banner: { tone: "", text: t("banner_restore", { n: items.length }) },
      note: t("note_restore_" + targetId),
      actionKey: "btn_restore",
      confirmKey: "btn_restore",
      onSubmit: (selected) => {
        // The page lists newest first: restore from the end so the order is recreated.
        const ordered = target.restoreReverse ? selected.slice().reverse() : selected;
        runBatch(targetId, ordered, "restore", steps);
      },
    });
  }

  function restore() {
    ui.setTarget({
      accent: "#6c5ce7",
      iconName: "restore",
      title: t("title_restore"),
      subtitle: t("subtitle_restore"),
    });
    ui.setSteps(restoreSteps(), 0);

    ui.file({
      onFile: async (file) => {
        let parsed;
        try {
          parsed = NS.parseBackup(await file.text());
        } catch (e) {
          ui.fileError(t("invalid_backup"));
          return;
        }

        if (parsed.type) {
          pickItems(parsed.type, parsed.items);
          return;
        }

        // Older backups that do not say what they are: let the user decide.
        ui.message({
          iconName: "file",
          title: t("ambiguous_title"),
          text: t("ambiguous_text"),
          buttons: [
            ...parsed.candidates.map((id) => ({
              label: t("target_" + id),
              kind: "primary",
              onClick: () => pickItems(id, parsed.items),
            })),
            { label: t("btn_cancel"), onClick: () => ui.close() },
          ],
        });
      },
    });
  }

  // ------------------------------------------------------------------ start
  try {
    if (launch.mode === "restore") restore();
    else await manage(NS.targets[launch.target] ? launch.target : "likes");
  } catch (e) {
    console.error("[YLC]", e);
    ui.message({
      iconName: "alert",
      tone: "bad",
      title: t("error_title"),
      text: t("error_text", { m: e && e.message ? e.message : String(e) }),
      buttons: [{ label: t("btn_close"), kind: "primary", onClick: () => ui.close() }],
    });
  }
})();
