(() => {
  const modes = { leak: "Leak detection", trends: "Water trends", coach: "AI water coach" };
  const week = [248, 276, 263, 302, 319, 347, 365];
  const goal = 350;
  const used = 240;
  const projected = Math.round(used / 6 * 10);
  const average = Math.round(week.reduce((sum, day) => sum + day, 0) / week.length);
  const earlier = Math.round(week.slice(0, 3).reduce((sum, day) => sum + day, 0) / 3);
  const recent = Math.round(week.slice(-3).reduce((sum, day) => sum + day, 0) / 3);

  function content(mode, step) {
    if (mode === "leak") {
      const stages = [
        ["15 min", "Monitoring continuous flow", "The alert threshold is 16 minutes.", "Advance one simulated minute"],
        ["16 min", "Possible leak", "Check taps and the pump. A whole-home meter can detect sustained flow but cannot confirm or locate a leak.", "Simulate flow stopping"],
        ["Stopped", "Flow has stopped", "The warning clears when flow stops. The app never shuts off the supply.", "Replay leak demo"]
      ];
      const [value, title, copy, action] = stages[step];
      return `<div class="demo-metric" data-tone="${step === 1 ? "alert" : "normal"}">${value}</div>
        <h3>${title}</h3><p>${copy}</p><button type="button" class="demo-step" data-demo-step>${action}</button>`;
    }
    if (mode === "trends") {
      return `<div class="demo-metric">${average} L/day</div><h3>Seven-day average</h3>
        <div class="demo-bars" role="img" aria-label="Day one through seven: ${week.join(", ")} litres">
          ${week.map((litres, index) => `<div><span>${litres}</span><i style="--height:${litres / 4}%"></i><small>D${index + 1}</small></div>`).join("")}
        </div><p>${step ? `The last three days averaged ${recent} L versus ${earlier} L for the first three. The last day exceeded the ${goal} L goal by ${week.at(-1) - goal} L.` : `Goal: ${goal} L/day. ${week.filter(day => day <= goal).length} of 7 days stayed within it.`}</p>
        <button type="button" class="demo-step" data-demo-step>${step ? "Hide comparison" : "Explain the trend"}</button>`;
    }
    return `<div class="demo-metric">${projected} L</div><h3>Estimated by 8 pm</h3>
      <p>At 4 pm, ${used} L have been used over six hours. At the same pace, usage may exceed the ${goal} L goal by ${projected - goal} L.</p>
      ${step ? "<p class='demo-advice'><strong>One thing to try:</strong> turn off the tap while soaping or scrubbing. This estimate assumes today’s pace continues. The meter cannot identify the exact activity.</p>" : ""}
      <button type="button" class="demo-step" data-demo-step>${step ? "Hide suggestion" : "What can I do now?"}</button>`;
  }

  function render(mode = "leak", step = 0) {
    return `<section class="utlt-demo-lab" data-demo-lab="${mode}" data-demo-phase="${step}">
      <div class="demo-kicker">UTLT.ai demo · simulated data</div>
      <div class="demo-choices" role="group" aria-label="Demo mode">
        ${Object.entries(modes).map(([id, label]) => `<button type="button" data-demo-mode="${id}" aria-pressed="${id === mode}">${label}</button>`).join("")}
      </div>
      <div class="demo-result">${content(mode, step)}</div>
    </section>`;
  }

  document.addEventListener("click", event => {
    const button = event.target.closest("button[data-demo-mode], button[data-demo-step]");
    const lab = button?.closest("[data-demo-lab]");
    if (!lab) return;
    const mode = button.dataset.demoMode || lab.dataset.demoLab;
    const steps = mode === "leak" ? 3 : 2;
    const phase = button.hasAttribute("data-demo-step") ? (Number(lab.dataset.demoPhase) + 1) % steps : 0;
    lab.outerHTML = render(mode, phase);
    const selector = button.hasAttribute("data-demo-step") ? "[data-demo-step]" : `[data-demo-mode="${mode}"]`;
    document.querySelector(`[data-demo-lab="${mode}"] ${selector}`)?.focus({ preventScroll: true });
  });

  window.UTLTDemo = { render };
})();
