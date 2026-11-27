(() => {
  const modes = { leak: "Leak detection", trends: "Water trends", coach: "AI water coach" };
  const week = [248, 276, 263, 302, 319, 347, 365];
  const goal = 350;
  const used = 240;
  const hoursMeasured = 6;
  const projected = Math.round(used / hoursMeasured * 10);
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
        uses: [174, 64, 87, 40], chartTitle: "Day 7 sample water use",
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

  function render(mode = "leak", phase = 0) {
    if (!Object.hasOwn(modes, mode)) mode = "leak";
    const steps = mode === "leak" ? leakStages.length : 2;
    if (!Number.isInteger(phase) || phase < 0 || phase >= steps) phase = 0;
    const d = scenario(mode, phase);
    return `<section class="utlt-demo-lab" data-demo-lab="${mode}" data-demo-phase="${phase}" data-tone="${d.tone || "normal"}">
      <div class="demo-kicker">Interactive demo · simulated data</div>
      <div class="demo-choices" role="group" aria-label="Demo mode">
        ${Object.entries(modes).map(([id, label]) => `<button type="button" data-demo-mode="${id}" aria-pressed="${id === mode}">${label}</button>`).join("")}
      </div>
      <div class="demo-layout">
        <div class="demo-result">
          <div class="demo-metric">${d.metric}</div>
          <h3>${d.title}</h3><p>${d.copy}</p>
          ${d.graph || ""}${d.detail ? `<p class="demo-advice">${d.detail}</p>` : ""}
          <button type="button" class="demo-step" data-demo-step>${d.action}</button>
        </div>
        ${breakup(d.uses, d.chartTitle)}
      </div>
    </section>`;
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
    wrapper.innerHTML = render(mode, phase);
    const replacement = wrapper.content.firstElementChild;
    lab.replaceWith(replacement);
    const selector = advance ? "[data-demo-step]" : `[data-demo-mode="${mode}"]`;
    replacement.querySelector(selector)?.focus({ preventScroll: true });
    replacement.dispatchEvent(new CustomEvent("utlt-demo-change", { bubbles: true }));
  });

  window.UTLTDemo = { render, coach: { goal, used, projected, hoursMeasured,
    breakdown: uses.map((label, index) => ({ label, value: coachBreakdown[index] })) } };
})();
