(function () {
  "use strict";

  const outline = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5c-1.8 3.8-7 7.4-7 12.2a7 7 0 0 0 14 0C19 9.9 13.8 6.3 12 2.5Z"/><path d="M9 15h.1m5.8 0h.1m-4 2.7q1 1 2 0"/></svg>';
  const faces = {
    idle: '<path class="niro-eyes" d="M11 16h3v4h-3zm8 0h3v4h-3z"/><path fill="#fff" d="M12 16h1v1h-1zm8 0h1v1h-1z"/><path d="M14 21h1v1h3v-1h1v2h-1v1h-3v-1h-1z"/>',
    curious: '<path d="M10 15h4v1h-4zm1 2h3v3h-3zm8-1h3v4h-3zm-4 6h3v2h-3z"/><path fill="#fff" d="M12 17h1v1h-1zm8-1h1v1h-1z"/>',
    happy: '<path d="M10 18h1v-2h3v2h1v1h-2v-1h-1v1h-2zm8 0h1v-2h3v2h1v1h-2v-1h-1v1h-2zm-5 3h7v2h-1v1h-5v-1h-1z"/><path fill="#ff9bb6" d="M15 23h3v1h-3z"/>',
    concerned: '<path d="M10 15h2v1h-2zm2-1h2v1h-2zm7 0h2v1h-2zm2 1h2v1h-2zm-10 2h3v3h-3zm8 0h3v3h-3zm-5 6h1v-1h3v1h1v1h-2v-1h-1v1h-2z"/>'
  };
  const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const number = value => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(value);
  function avatar(mood = "idle") {
    return `<button type="button" class="niro-avatar" data-action="niro-wave" data-mood="${mood}" aria-label="Wave to Niro" title="Wave to Niro">
      <svg viewBox="0 0 36 39" shape-rendering="crispEdges" aria-hidden="true">
        <ellipse class="niro-shadow" cx="17" cy="36" rx="10" ry="2" fill="#087d9150"/>
        <g class="niro-body">
          <g class="niro-foot niro-foot-left"><path fill="#0b3650" d="M10 27h5v4h1v3H9v-1H8v-3h2z"/><path fill="#50d5df" d="M11 29h2v2h2v1h-5v-1h1z"/></g>
          <g class="niro-foot niro-foot-right"><path fill="#0b3650" d="M20 27h5v3h2v3h-1v1h-7v-3h1z"/><path fill="#50d5df" d="M22 29h2v2h1v1h-5v-1h2z"/></g>
          <g class="niro-arm niro-arm-left"><path fill="#0b3650" d="M8 18h3v5H8v2H3v-2H2v-3h3v1h2v-2h1z"/><path fill="#50d5df" d="M8 20h1v2H7v1H4v-2h1v1h3z"/></g>
          <g class="niro-arm niro-arm-right"><path fill="#0b3650" d="M23 18h3v1h1v2h2v-1h3v3h-1v2h-5v-2h-3z"/><path fill="#50d5df" d="M25 20h1v2h3v-1h1v2h-3v-1h-2z"/></g>
          <path fill="#0b3650" d="M15 2h4v3h2v3h2v3h2v3h2v4h2v7h-2v3h-3v2H10v-2H7v-3H5v-7h2v-4h2v-3h2V8h2V5h2z"/>
          <path fill="#50d5df" d="M16 5h2v3h2v3h2v3h2v4h2v7h-2v2H10v-2H8v-7h2v-4h2v-3h2V8h2z"/>
          <path fill="#0ca7c0" d="M8 22h3v2h11v-2h4v3h-2v2H10v-2H8z"/>
          <path fill="#c4fbf8" d="M14 10h2v3h-2v3h-2v-3h2zm-4 7h2v3h-2z"/>
          <path fill="#fb92af" d="M9 21h3v2H9zm14 0h2v2h-2z"/>
          <g fill="#103549">${faces[mood] || faces.idle}</g>
        </g>
        <path class="niro-spark" fill="#f5b750" d="M30 5h2v7h-2zM27 8h8v2h-8z"/>
      </svg></button>`;
  }
  const waveTimers = new WeakMap();
  function wave(button) {
    window.clearTimeout(waveTimers.get(button));
    button.classList.remove("is-waving");
    void button.offsetWidth;
    button.classList.add("is-waving");
    waveTimers.set(button, window.setTimeout(() => button.classList.remove("is-waving"), 1000));
  }

  function facts(state, targetHour = 24) {
    const summary = window.UTLTData.summarize(state.readings);
    const now = new Date();
    const forecast = window.UTLTAI.dailyForecast(state.readings, state.goal, now);
    if (targetHour === 24 && forecast.elapsedHours >= 0.5) {
      const midnight = Date.parse(window.UTLTAI.indiaDate(now) + "T00:00:00+05:30") + 86400000;
      forecast.projected = forecast.measured * (1 + Math.max(0, midnight - now.getTime()) / 3600000 / forecast.elapsedHours);
      forecast.tone = forecast.projected > forecast.goal ? "over" : "within";
      delete forecast.byEvening;
    }
    return { ...summary, today: Boolean(summary.daily.at(-1)?.hasData),
      forecast,
      cutoff: targetHour === 20 ? "8 pm" : "midnight",
      goal: Math.max(1, Number(state.goal) || 350),
      pace: window.UTLTAI.paceInsight(state.readings),
      leak: !state.demoEnabled && state.device.connected && state.flowRunningMinutes >= 16,
      demo: state.demoEnabled };
  }
  function visual(data, kind) {
    if (kind === "trend") return { title: "Daily water use", key: "Day", rows: data.daily.map(day => ({
      label: new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(day.date)),
      value: day.hasData ? day.litres : null,
    })) };
    if (kind === "use" || kind === "time") return data.today ? { title: kind === "use" ? "Today by activity" : "Today by time", key: kind === "use" ? "Activity" : "Time",
      rows: data[kind === "use" ? "byUse" : "byTime"].map(row => ({ label: row.label, value: row.litres })),
      note: kind === "use" ? "Unconfirmed activity stays in Misc." : "" } : null;
    if (kind === "forecast") {
      const f = data.forecast;
      if (!data.today) return null;
      return { title: "End-of-day outlook", key: "Reading", note: "The projection assumes the pace continues. Gaps can affect it.",
        rows: [{label:"Measured today",value:data.used},
          ...(Number.isFinite(f.projected) ? [{label:"Estimated by " + data.cutoff,value:f.projected}] :
            Number.isFinite(f.byEvening) ? [{label:"Recorded by " + data.cutoff,value:f.byEvening}] : []),
          {label:"Daily goal",value:data.goal}] };
    }
    return null;
  }
  function figures(visual, showTable = false) {
    if (!visual) return "";
    const {title, key, rows, note} = visual;
    const max = Math.max(1, ...rows.map(row => row.value || 0));
    const amount = row => Number.isFinite(row.value) ? number(row.value) + " L" : "No reading";
    const bars = rows.map(row => `<li><span>${esc(row.label)}</span><span class="niro-bar" aria-hidden="true"><i style="--value:${(row.value || 0) / max * 100}%"></i></span><strong>${amount(row)}</strong></li>`).join("");
    const table = `<table><caption>${esc(title)}</caption><thead><tr><th scope="col">${esc(key)}</th><th scope="col">Volume</th></tr></thead><tbody>${rows.map(row => `<tr><th scope="row">${esc(row.label)}</th><td>${amount(row)}</td></tr>`).join("")}</tbody></table>`;
    return `<figure class="niro-figure"><figcaption>${esc(title)}</figcaption>${showTable ? table : `<ul class="niro-bars">${bars}</ul><details><summary>View data table</summary>${table}</details>`}${note ? `<small>${esc(note)}</small>` : ""}</figure>`;
  }
  function priority(data) {
    const f = data.forecast;
    if (data.leak) return { title:"Possible leak", text:"Flow has continued for at least 16 minutes. Check taps and the pump. The meter can detect flow but cannot locate a leak.", mood:"concerned" };
    if (!data.today) {
      if (data.daily.some(day => day.hasData)) return { title:"Recent water use", text:"Today’s first reading is still missing. Here’s what your meter recorded on previous days.", chart:"trend" };
      return { title:"Ready for your first reading", text:"Connect your monitor or try sample readings to see what Niro can explain." };
    }
    if (f.projected !== undefined && (f.tone === "over" || !data.pace.ready)) {
      return { title:f.tone === "over" ? "You may go over your goal" : "End-of-day outlook", text:`At this pace, you could use about ${number(f.projected)} L by midnight.`, chart:"forecast", mood:f.tone === "over" ? "curious" : "happy" };
    }
    if (data.pace.ready && data.pace.tone !== "usual") return { title:"Today’s pace has changed", text:`You’ve used ${number(data.pace.today)} L by ${data.pace.clock}, compared with your usual ${number(data.pace.baseline)} L by then.`, chart:"trend", mood:"curious" };
    return { title:"When you used water today", text:"See which part of the day used the most water.", chart:"time", mood:"happy" };
  }
  function summary(state) {
    const data = facts(state), pick = priority(data);
    return `<section class="niro-summary" aria-label="Niro Summary"><div class="niro-summary-head">${avatar(pick.mood)}<div><p>Niro Summary${data.demo ? " · Sample data" : ""}</p><h2>${pick.title}</h2></div></div><p>${pick.text}</p>${figures(visual(data,pick.chart))}<button type="button" class="utlt-primary-button" data-action="niro">Chat with Niro</button></section>`;
  }
  function query(question) {
    const text = question.toLowerCase();
    const table = /\btable\b/.test(text);
    let kind = "";
    if (/leak|continuous|running water/.test(text)) return { kind:"leak", table };
    if (/forecast|projection|predict|evening|end of (the )?day|8 ?p\.?m|goal/.test(text)) kind = "forecast";
    else if (/by (time|hour)|time of day|when.*(used|use)|morning|afternoon/.test(text)) kind = "time";
    else if (/split|breakdown|categor|activit|bathing|laundry/.test(text)) kind = "use";
    else if (/trend|week|day.by.day|history|daily totals|last (\d+|seven) days/.test(text)) kind = "trend";
    else if (/\b(chart|graph|table)\b/.test(text)) kind = /today/.test(text) ? "time" : "trend";
    return { kind, table };
  }
  function answer(question,state) {
    const { kind, table } = query(question);
    if (!kind) return null;
    const data = facts(state, /8\s*p\.?m|evening/i.test(question) ? 20 : 24);
    if (kind === "leak") return { mood: data.leak ? "concerned" : "idle", text: data.leak ? priority(data).text :
      data.demo ? "Sample readings cannot tell you whether your home has a leak. Try Leak detection in the demos." :
        state.device.connected ? "There’s no sustained-flow alert right now. The meter cannot rule out a leak." :
          "Connect your meter to check for sustained flow." };
    const chart = visual(data,kind);
    if (!chart || !chart.rows.some(row => Number.isFinite(row.value))) return { text: "There aren’t readings for that view yet." };
    const source = data.demo ? "From the sample readings" : "From your meter readings";
    const f = data.forecast;
    const detail = kind === "forecast"
      ? Number.isFinite(f.projected) ? `: about ${number(f.projected)} L by ${data.cutoff} if the pace continues.`
        : Number.isFinite(f.byEvening) ? `: ${number(f.byEvening)} L recorded by ${data.cutoff}.` : ": there’s no end-of-day estimate yet."
      : kind === "trend" ? ". Days without a reading appear as gaps." : ". Here’s today’s split.";
    return { text:source + detail, chart, table };
  }
  window.UTLTNiro = Object.freeze({ outline, avatar, wave, summary, answer, figures });
})();
