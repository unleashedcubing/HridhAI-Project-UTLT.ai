(() => {
  const modes = { leak: "Leak detection", trends: "Water trends", coach: "AI water coach" };
  const week = [248, 276, 263, 302, 319, 347, 365];
  const goal = 350;
  const trendBreakdown = [174, 64, 87, 40];
  const categories = ["Bath", "Food/Drink", "Housework", "Misc"];
  const used = 240;
  const coachHistory = [[190, 140, 20], [200, 160, 30], [210, 180, 40]];
  const typicalSoFar = coachHistory[1][0];
  const typicalRemaining = coachHistory[1][1];
  const projected = used + typicalRemaining;
  const coachBreakdown = [120, 40, 54, 26];
  const mean = values => Math.round(values.reduce((sum, day) => sum + day, 0) / values.length);
  const uses = ["Bath", "Food and drink", "Housework", "Unknown"];
  const colours = ["#7ce5c1", "#60bbf3", "#a8a5ff", "#627c7c"];
  const leakStages = [
    ["15 min", "Monitoring continuous flow", "The sample flow is 3 L/min. The demo alert triggers at 16 minutes.", "Advance one simulated minute", [76, 25, 32, 27]],
    ["16 min", "Possible leak", "Check taps and the pump. A whole-home meter can flag sustained flow, but it cannot locate a leak.", "Simulate flow stopping", [76, 25, 32, 30]],
    ["Stopped", "Flow has stopped", "The warning clears. The water already recorded stays in the daily total.", "Replay leak demo", [76, 25, 32, 30]]
  ];

  function breakup(values, title) {
    const total = values.reduce((sum, value) => sum + value, 0);
    let cursor = 0;
    const slices = values.map((value, i) => {
      const start = cursor;
      cursor += value / total * 100;
      return `${colours[i]} ${start}% ${cursor}%`;
    });
    return `<figure class="demo-breakdown">
      <figcaption>${title}</figcaption>
      <div class="demo-breakdown-row">
        <div class="demo-ring" style="--demo-slices:${slices.join(",")}" role="img" aria-label="${total} litres total. ${uses.map((label, i) => `${label}: ${values[i]} litres`).join(". ")}">
          <div aria-hidden="true"><b>${total}</b><span>litres</span></div>
        </div>
        <ul>${uses.map((label, i) => `<li><i aria-hidden="true" style="--demo-colour:${colours[i]}"></i><span>${label}</span><b>${values[i]} L</b></li>`).join("")}</ul>
      </div>
      <p>Example categories from the demo data</p>
    </figure>`;
  }

  function runway() {
    const scale = Math.max(goal, projected);
    return `<div class="demo-runway" role="img" aria-label="240 litres used, 400 litres projected, 350 litre goal">
      <div class="demo-track" aria-hidden="true">
        <i style="width:${projected / scale * 100}%"></i><b style="width:${used / scale * 100}%"></b><span style="left:${goal / scale * 100}%"></span>
      </div>
      <div class="demo-scale" aria-hidden="true"><span><b>${used} L</b> used</span><span><b>${goal} L</b> goal</span><span><b>${projected} L</b> forecast</span></div>
    </div>`;
  }

  function scenario(mode, phase) {
    if (mode === "leak") {
      const [metric, title, copy, action, uses] = leakStages[phase];
      return {
        metric, title, copy, action, uses, chartTitle: "Today’s sample water use",
        tone: phase === 1 ? "alert" : "normal"
      };
    }
    if (mode === "trends") {
      return {
        metric: `${mean(week)} L/day`, title: "Seven-day average",
        copy: phase ? `The last three days averaged ${mean(week.slice(-3))} L, versus ${mean(week.slice(0, 3))} L for the first three. The last day was 15 L over goal.` : `Six of seven days stayed within the ${goal} L goal.`,
        action: phase ? "Hide comparison" : "Explain the trend",
        uses: trendBreakdown, chartTitle: "Day 7 sample water use",
        graph: `<div class="demo-bars" role="img" aria-label="Day one through seven: ${week.join(", ")} litres">
          ${week.map((litres, i) => `<div><span>${litres}</span><i data-over="${litres > goal}" style="--height:${litres / 4}%"></i><small>D${i + 1}</small></div>`).join("")}
        </div>`
      };
    }
    return {
      metric: `${projected} L`, title: "Estimated by 8 pm",
      copy: `At 4 pm, the sample home has used ${used} L over six hours. At that pace, it would finish ${projected - goal} L above its goal.`,
      detail: phase ? "Try turning off the tap while soaping or scrubbing. The forecast assumes the same pace continues." : "",
      action: phase ? "Hide suggestion" : "What can I do now?",
      uses: coachBreakdown, chartTitle: "Today’s sample use at 4 pm", graph: runway()
    };
  }

  // Build the same readings the regular dashboard takes from the meter.
  function dashboardData(mode, phase, day) {
    const volumes = mode === "coach" ? coachBreakdown : mode === "trends" ? trendBreakdown : leakStages[phase][4];
    const times = mode === "coach" ? ["10:00", "12:00", "14:00", "16:00"]
      : mode === "trends" ? ["08:00", "13:00", "18:00", "21:00"] : ["08:00", "12:00", "14:00", phase ? "16:01" : "16:00"];
    const today = volumes.map((litres, i) => ({
      recordedAt: `${day}T${times[i]}:00+05:30`, litres, category: categories[i],
    }));
    const previous = mode === "coach" ? coachHistory.flatMap((volumes, index) => {
      const date = new Date(Date.parse(day) - (coachHistory.length - index) * 86400000).toISOString().slice(0, 10);
      return volumes.map((litres, part) => ({
        recordedAt: `${date}T${["16:00", "19:30", "22:00"][part]}:00+05:30`, litres, category: "Misc",
      }));
    }) : mode === "trends" ? week.slice(0, -1).map((litres, index) => {
      const date = new Date(Date.parse(day) - (6 - index) * 86400000).toISOString().slice(0, 10);
      return { recordedAt: `${date}T16:00:00+05:30`, litres, category: "Misc" };
    }) : [];
    return { readings: [...previous, ...today], goal, now: new Date(`${day}T${times.at(-1)}:00+05:30`),
      leak: mode === "leak" && phase === 1 };
  }

  function render(mode = "leak", phase = 0, integrated = false) {
    if (integrated && mode === "sample") {
      return `<section class="utlt-demo-lab" data-demo-lab="sample" data-demo-phase="0" data-demo-integrated>
        ${demoChoices(mode, integrated)}<p>Showing the regular sample dashboard. Pick a scenario to apply it to the app.</p>
      </section>`;
    }
    if (!Object.hasOwn(modes, mode)) mode = "leak";
    const steps = mode === "leak" ? leakStages.length : 2;
    if (!Number.isInteger(phase) || phase < 0 || phase >= steps) phase = 0;
    const d = scenario(mode, phase);
    return `<section class="utlt-demo-lab" data-demo-lab="${mode}" data-demo-phase="${phase}" data-tone="${d.tone || "normal"}" ${integrated ? "data-demo-integrated" : ""}>
      ${demoChoices(mode, integrated)}
      <div class="demo-layout${integrated ? " is-integrated" : ""}">
        <div class="demo-result">
          <div class="demo-metric">${d.metric}</div>
          <h3>${d.title}</h3><p>${integrated && mode === "coach"
            ? `At 4 pm the sample home has used ${used} L. Past days typically added ${typicalRemaining} L between 4 and 8 pm.`
            : d.copy}</p>
          ${integrated ? "" : d.graph || ""}${d.detail ? `<p class="demo-advice">${integrated && mode === "coach" ? "Try turning off the tap while soaping or scrubbing. The estimate uses previous days." : d.detail}</p>` : ""}
          <button type="button" class="demo-step" data-demo-step>${d.action}</button>
        </div>
        ${integrated ? "" : breakup(d.uses, d.chartTitle)}
      </div>
    </section>`;
  }

  function demoChoices(mode, integrated) {
    const choices = integrated ? { sample: "Sample data", ...modes } : modes;
    return `<div class="demo-kicker">Interactive demo · simulated data</div>
      <div class="demo-choices" role="group" aria-label="Demo mode">
        ${Object.entries(choices).map(([id, label]) =>
          `<button type="button" data-demo-mode="${id}" aria-pressed="${id === mode}">${label}</button>`).join("")}
      </div>`;
  }

  document.addEventListener("click", event => {
    const button = event.target.closest("button[data-demo-mode], button[data-demo-step]");
    const lab = button?.closest("[data-demo-lab]");
    if (!lab) return;
    const mode = button.dataset.demoMode || lab.dataset.demoLab;
    const advance = button.hasAttribute("data-demo-step");
    const steps = mode === "leak" ? leakStages.length : 2;
    const phase = advance ? (Number(lab.dataset.demoPhase) + 1) % steps : 0;
    const wrapper = document.createElement("template");
    wrapper.innerHTML = render(mode, phase, lab.hasAttribute("data-demo-integrated"));
    const replacement = wrapper.content.firstElementChild;
    lab.replaceWith(replacement);
    const selector = advance ? "[data-demo-step]" : `[data-demo-mode="${mode}"]`;
    replacement.querySelector(selector)?.focus({ preventScroll: true });
    replacement.dispatchEvent(new CustomEvent("utlt-demo-change", { bubbles: true, detail: { selector } }));
  });

  window.UTLTDemo = { render, dashboardData, coach: { goal, used, projected, typicalSoFar, typicalRemaining,
    breakdown: uses.map((label, index) => ({ label, value: coachBreakdown[index] })) } };
})();
