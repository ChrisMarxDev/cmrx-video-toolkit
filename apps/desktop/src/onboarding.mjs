import { mountDitherArt } from "/dither-art.mjs";
const $ = (s) => document.querySelector(s),
  steps = ["folder", "account", "video"];
export function setupOnboarding({ call, onError }) {
  const screen = document.createElement("section");
  screen.id = "start-screen";
  screen.hidden = true;
  screen.setAttribute("aria-label", "Set up your editing room");
  screen.innerHTML = `<div class="setup-page"><header class="setup-heading"><span class="start-kicker">Get started</span><button id="setup-dismiss" class="text-button" aria-label="Close setup">×</button></header><nav class="setup-steps" aria-label="Setup steps"><button type="button" data-step="account"><span class="step-bar" aria-hidden="true"></span>Account</button><button type="button" data-step="video"><span class="step-bar" aria-hidden="true"></span>Video</button></nav><div class="setup-body"><div class="setup-panels"><section id="start-folder" aria-labelledby="setup-project-title"><h1 id="setup-project-title">Open a project.</h1><button id="choose-project" class="primary">Choose folder</button><div id="recent-projects"></div><button id="project-next" class="primary" hidden>Continue</button></section><section id="start-account" hidden aria-labelledby="setup-account-title"><h1 id="setup-account-title">Connect your account.</h1><div id="start-providers"></div><div class="setup-actions"><button id="skip-provider" class="text-button">Set up later</button><button id="account-next" class="primary" hidden>Continue</button></div></section><section id="start-video" hidden aria-labelledby="setup-start-title"><h1 id="setup-start-title">Start your video.</h1><div class="setup-choices"><button id="first-video" class="primary">Upload a video</button><button id="start-blank">Open empty project</button></div><button id="cancel-first-video" class="text-button" hidden>Cancel import</button><p id="first-video-progress" role="status"></p></section></div></div><footer class="setup-footer"><button id="setup-back" class="text-button">← Back</button><span id="step-count" aria-live="polite"></span></footer><p id="start-error" role="alert"></p></div>`;
  document.body.append(screen);
  mountDitherArt();
  const cards = $("#provider-cards"),
    settings = cards.parentNode;
  const replay = document.createElement("button");
  replay.id = "replay-setup";
  replay.className = "text-button";
  replay.type = "button";
  replay.textContent = "Run setup again";
  $("#settings-dialog").append(replay);
  let state,
    step = null,
    active = false,
    working = false,
    finishing = false,
    animation = null,
    sizeAnimation = null,
    focusChat = false;
  function report(e) {
    $("#start-error").textContent = e.message;
    onError(e);
  }
  const run = async (fn) => {
    try {
      $("#start-error").textContent = "";
      await fn();
    } catch (e) {
      report(e);
    }
  };
  function navigate(next, { persist = true } = {}) {
    if (!steps.includes(next)) return;
    if (next !== "folder" && !state?.projectInfo?.selected) return;
    if (next === "video" && !state.connected && !state.onboarding?.skipProvider)
      return;
    const old = step;
    const oldHeight = $(".setup-body").getBoundingClientRect().height;
    step = next;
    for (const name of steps) $("#start-" + name).hidden = name !== step;
    if (step === "account" && !$("#settings-dialog").open)
      $("#start-providers").append(cards);
    else restoreCards();
    screen.querySelectorAll("[data-step]").forEach((b) => {
      const name = b.dataset.step;
      b.setAttribute("aria-current", name === step ? "step" : "false");
      b.classList.toggle("complete", name === "account" && step === "video");
      b.disabled =
        !state.projectInfo?.selected ||
        (name === "video" &&
          !state.connected &&
          !state.onboarding?.skipProvider);
    });
    $("#setup-back").hidden = step !== "video";
    $("#step-count").textContent = step === "video" ? "2 of 2" : "1 of 2";
    if (old !== step) {
      $(".setup-body").scrollTop = 0;
      if (persist) {
        const heading = $("#start-" + step).querySelector("h1");
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }
    if (
      old !== step &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      animation?.cancel();
      sizeAnimation?.cancel();
      if (old)
        sizeAnimation = $(".setup-body").animate(
          [
            { height: oldHeight + "px", overflow: "hidden" },
            {
              height: $(".setup-body").getBoundingClientRect().height + "px",
              overflow: "hidden",
            },
          ],
          { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" },
        );
      animation = $("#start-" + step).animate(
        [
          {
            opacity: 0,
            transform: `translateY(${steps.indexOf(step) > steps.indexOf(old) ? 12 : -12}px)`,
          },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" },
      );
    }
    if (persist && old !== step) call("onboarding", { step }).catch(report);
  }
  function restoreCards() {
    if (cards.parentNode !== settings)
      settings.insertBefore(
        cards,
        settings.querySelector(".model-preferences"),
      );
  }
  $("#settings-dialog").addEventListener("toggle", () => {
    if (active && step) navigate(step, { persist: false });
  });
  async function openProject(recentId) {
    if (working) return;
    working = true;
    await run(async () => {
      const result = await call("project", { recentId });
      if (result.url) location.assign(result.url);
    });
    working = false;
  }
  const finish = async () => {
    if (finishing) return;
    finishing = true;
    focusChat = true;
    try {
      await call("onboarding", { complete: true, withoutVideo: true });
    } catch (e) {
      report(e);
    } finally {
      finishing = false;
    }
  };
  $("#choose-project").onclick = () => openProject();
  $("#project-open").onclick = () => openProject();
  $("#project-next").onclick = () => navigate("account");
  $("#account-next").onclick = () => navigate("video");
  $("#setup-back").onclick = () =>
    navigate(steps[Math.max(0, steps.indexOf(step) - 1)]);
  screen
    .querySelectorAll("[data-step]")
    .forEach((b) => (b.onclick = () => navigate(b.dataset.step)));
  $("#skip-provider").onclick = () =>
    run(async () => {
      await call("onboarding", { skipProvider: true, step: "video" });
      state.onboarding.skipProvider = true;
      navigate("video");
    });
  $("#start-blank").onclick = finish;
  $("#setup-dismiss").onclick = () =>
    run(async () => {
      await call("onboarding", {
        skipProvider: true,
        complete: true,
        withoutVideo: true,
      });
    });
  replay.onclick = () =>
    run(async () => {
      await call("onboarding", { restart: true });
      $("#settings-dialog").close();
    });
  $("#cancel-first-video").onclick = () => run(() => call("stop"));
  $("#first-video").onclick = () =>
    run(async () => {
      const result = await call("import");
      if (result.assetId) await finish();
    });
  $("#add-note").onclick = () =>
    $("#editor")
      .contentDocument?.querySelector('[aria-label="Comment here"]')
      ?.click();
  function update(next) {
    state = next;
    replay.hidden = !state.projectInfo?.selected;
    replay.disabled = !!state.locked;
    $("#project-open").textContent = state.projectName || "Choose project";
    $("#project-open").title = state.projectInfo?.folder || "Change project";
    $("#project-open").hidden = !!state.desktopTabs;
    const show =
      !state.onboarding?.complete &&
      !(state.desktopTabs && !state.projectInfo?.selected);
    screen.hidden = !show;
    document.querySelector("main").inert = show;
    document.querySelector("main").setAttribute("aria-hidden", String(show));
    if (!show) {
      restoreCards();
      active = false;
      if (focusChat) {
        focusChat = false;
        requestAnimationFrame(() => $("#prompt").focus());
      }
      return;
    }
    $("#setup-dismiss").hidden = !state.projectInfo?.selected;
    $("#choose-project").hidden =
      !!state.desktopTabs && !!state.projectInfo?.selected;
    $("#project-next").hidden = !state.projectInfo?.selected;
    $("#account-next").hidden = !state.connected;
    $("#skip-provider").hidden = !!state.connected;
    $("#first-video").disabled = !!state.locked;
    $("#start-blank").disabled = !!state.locked;
    $("#cancel-first-video").hidden = !state.importing;
    $("#first-video-progress").textContent = state.activity || "";
    $("#start-blank").textContent = state.clipCount
      ? "Open project"
      : "Open empty project";
    $("#setup-back").disabled = !!state.importing;
    $("#setup-dismiss").disabled = !!state.locked;
    if (!active) {
      active = true;
      step = null;
      const saved = state.onboarding?.step;
      const initial = !state.projectInfo?.selected
        ? "folder"
        : saved === "folder"
          ? "account"
          : !state.connected && !state.onboarding?.skipProvider
            ? "account"
            : saved || "video";
      navigate(initial, { persist: false });
    } else
      navigate(
        step === "video" && !state.connected && !state.onboarding?.skipProvider
          ? "account"
          : step,
        { persist: false },
      );
    const recent = $("#recent-projects"),
      signature = JSON.stringify(state.recentProjects || []);
    if (recent.dataset.signature !== signature) {
      recent.dataset.signature = signature;
      recent.replaceChildren();
      for (const p of state.recentProjects || []) {
        const b = document.createElement("button");
        b.className = "recent-project";
        b.textContent = p.name;
        b.onclick = () => openProject(p.id);
        recent.append(b);
      }
    }
  }
  return { update };
}
