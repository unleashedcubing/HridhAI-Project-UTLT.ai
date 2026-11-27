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
  const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format;
  const dayFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
  // Pixel paths share a grid so each limb can animate independently.
  function avatar(mood = "idle") {
    return `<button type="button" class="niro-avatar" data-action="niro-wave" data-mood="${mood}" aria-label="Wave to Niro" title="Wave to Niro">
      <svg viewBox="0 0 36 39" shape-rendering="crispEdges" aria-hidden="true">
        <ellipse class="niro-shadow" cx="17" cy="36" rx="10" ry="2" fill="#1979bb50"/>
        <g class="niro-body" fill="#0b355d">
          <g class="niro-foot niro-foot-left"><path d="M10 27h5v4h1v3H9v-1H8v-3h2z"/><path fill="#60c6ff" d="M11 29h2v2h2v1h-5v-1h1z"/></g>
          <g class="niro-foot niro-foot-right"><path d="M20 27h5v3h2v3h-1v1h-7v-3h1z"/><path fill="#60c6ff" d="M22 29h2v2h1v1h-5v-1h2z"/></g>
          <g class="niro-arm niro-arm-left"><path d="M8 18h3v5H8v2H3v-2H2v-3h3v1h2v-2h1z"/><path fill="#60c6ff" d="M8 20h1v2H7v1H4v-2h1v1h3z"/></g>
          <g class="niro-arm niro-arm-right"><path d="M23 18h3v1h1v2h2v-1h3v3h-1v2h-5v-2h-3z"/><path fill="#60c6ff" d="M25 20h1v2h3v-1h1v2h-3v-1h-2z"/></g>
          <path d="M15 2h4v3h2v3h2v3h2v3h2v4h2v7h-2v3h-3v2H10v-2H7v-3H5v-7h2v-4h2v-3h2V8h2V5h2z"/>
          <path fill="#60c6ff" d="M16 5h2v3h2v3h2v3h2v4h2v7h-2v2H10v-2H8v-7h2v-4h2v-3h2V8h2z"/>
          <path fill="#188fe6" d="M8 22h3v2h11v-2h4v3h-2v2H10v-2H8z"/>
          <path fill="#c4efff" d="M14 10h2v3h-2v3h-2v-3h2zm-4 7h2v3h-2z"/>
          <path fill="#fb92af" d="M9 21h3v2H9zm14 0h2v2h-2z"/>
          <g fill="#103552">${faces[mood] || faces.idle}</g>
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

  // Niro extends the projection to midnight while Today keeps the shared forecast.
  function facts(state, targetHour = 24, summary = window.UTLTData.summarize(state.readings)) {
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
      label: dayFormat.format(new Date(day.date)),
      value: day.hasData ? day.litres : null,
    })) };
    if (!data.today) return null;
    if (kind === "use" || kind === "time") {
      const byActivity = kind === "use";
      return { title: byActivity ? "Today by activity" : "Today by time", key: byActivity ? "Activity" : "Time",
        rows: (byActivity ? data.byUse : data.byTime).map(({ label, litres }) => ({ label, value: litres })),
        note: byActivity ? "Unconfirmed activity stays in Misc." : "" };
    }
    if (kind === "forecast") {
      const { projected, byEvening } = data.forecast;
      const estimated = Number.isFinite(projected);
      const value = estimated ? projected : byEvening;
      const rows = [{ label: "Measured today", value: data.used }];
      if (Number.isFinite(value)) rows.push({ label: (estimated ? "Estimated by " : "Recorded by ") + data.cutoff, value });
      rows.push({ label: "Daily goal", value: data.goal });
      return { title: "End-of-day outlook", key: "Reading", rows, note: "The projection assumes the pace continues. Gaps can affect it." };
    }
    return null;
  }
  // Summary and chat use the same chart and accessible table.
  function figures(visual, showTable = false) {
    if (!visual) return "";
    const { title, key, rows, note } = visual;
    const heading = esc(title);
    const amount = value => Number.isFinite(value) ? number(value) + " L" : "No reading";
    const tableRows = rows.map(({ label, value }) =>
      `<tr><th scope="row">${esc(label)}</th><td>${amount(value)}</td></tr>`).join("");
    const table = `<table><caption>${heading}</caption><thead><tr><th scope="col">${esc(key)}</th><th scope="col">Volume</th></tr></thead><tbody>${tableRows}</tbody></table>`;
    const max = Math.max(1, ...rows.map(row => row.value || 0));
    const bars = () => rows.map(({ label, value }) => `<li><span>${esc(label)}</span><span class="niro-bar" aria-hidden="true"><i style="--value:${(value || 0) / max * 100}%"></i></span><strong>${amount(value)}</strong></li>`).join("");
    const display = showTable ? table : `<ul class="niro-bars">${bars()}</ul><details><summary>View data table</summary>${table}</details>`;
    return `<figure class="niro-figure"><figcaption>${heading}</figcaption>${display}${note ? `<small>${esc(note)}</small>` : ""}</figure>`;
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
  function summary(state, usage) {
    const data = facts(state, 24, usage), pick = priority(data);
    return `<section class="niro-summary" aria-label="Niro Summary"><div class="niro-summary-head">${avatar(pick.mood)}<div><p>Niro Summary${data.demo ? " · Sample data" : ""}</p><h2>${pick.title}</h2></div></div><p>${pick.text}</p>${figures(visual(data,pick.chart))}<button type="button" class="utlt-primary-button" data-action="niro">Chat with Niro</button></section>`;
  }
  // Use completed calendar days with readings. A missing day is not zero use.
  function historicalAnswer(text, state, firstWeek = false) {
    const today = window.UTLTAI.indiaDate(new Date());
    const firstWeekData = studyForecast(state);
    const totals = new Map();
    for (const { recordedAt, litres } of state.readings) {
      if (!Number.isFinite(litres) || litres < 0 || !Number.isFinite(Date.parse(recordedAt))) continue;
      const day = window.UTLTAI.indiaDate(new Date(recordedAt));
      if (day < today) totals.set(day, (totals.get(day) || 0) + litres);
    }
    const recent = [...totals].sort(([left], [right]) => left.localeCompare(right)).slice(-7);
    const useFirstWeek = firstWeek || (recent.length < 3 && Number.isFinite(firstWeekData?.typical));
    const days = useFirstWeek ? (firstWeekData?.days || []).filter(([day]) => day < today) : recent;
    if (firstWeek && days.length < 3) return { text: "The first-week forecast needs at least three recorded days and opens after your first week." };
    if (!days.length) return { text: "I need at least one previous day with water readings to estimate your usage." };

    const label = /\bnext week\b/.test(text) ? "over seven days"
      : /\btomorrow\b/.test(text) ? "tomorrow" : /\btoday\b/.test(text) ? "today" : "for a typical day";
    const multiplier = label === "over seven days" ? 7 : 1;
    const source = state.demoEnabled ? "sample readings" : "meter readings";
    const period = useFirstWeek ? " in your first week" : "";
    const [low, high] = [Math.min(...days.map(([, value]) => value)), Math.max(...days.map(([, value]) => value))];
    const range = low !== high ? ` Daily readings ranged from ${number(low)} to ${number(high)} L.` : "";
    const uncertainty = days.length < 3 ? " That’s a rough estimate with so few readings." : "";
    return {
      text: `Around ${number(medianDailyTotal(days) * multiplier)} L ${label}, based on ${days.length} previous day${days.length === 1 ? "" : "s"} of ${source}${period}.${range}${uncertainty}`,
      chart: { title: useFirstWeek ? "First-week readings" : "Previous daily readings", key: "Day",
        rows: days.map(([day, value]) => ({ label: dayFormat.format(new Date(day)), value })) },
      table: /\btable\b/.test(text),
    };
  }

  const expectsUsage = /\b(expect\w*|anticipat\w*|likely to use|will (?:i|we) use|how much.*(?:will|[’']ll).*use|think.*use|supposed to use)\b/i;

  function meterExplanation(text) {
    if (/\bpressure\b/.test(text)) return { text: "UTLT’s water sensor measures flow and volume. It has no pressure reading." };
    if (/\b(?:what|how) (?:does|can) (?:the |your |this )?(?:water |flow )?(?:sensor|meter) (?:measure|read)\b/.test(text)) {
      return { text: "The flow sensor measures how much water passes through it. It cannot tell which tap or activity used that water." };
    }
    return null;
  }

  // Check specific intents before the generic chart or table request.
  function answer(question, state) {
    const text = question.toLowerCase();
    const meter = meterExplanation(text);
    if (meter) return meter;
    if (/what.*(spike|peak)|activity.*(spike|peak)|what.*water.*used for/.test(text)) return learnedActivity(state);
    const explicitCutoff = /8\s*p\.?m|evening/i.test(text);
    const priorReadings = /\b(previous|past|historical|earlier)\b.*\b(readings|results|data|usage|days|totals)\b/.test(text);
    if (/\bfirst.week forecast\b/.test(text)) return historicalAnswer(text, state, true);
    if (!explicitCutoff && (expectsUsage.test(text) || /\b(tomorrow|next week|typical day)\b/.test(text) ||
        (priorReadings && (/\b(estimate\w*|forecast\w*|predict\w*|today)\b/.test(text) || /^(?:and )?(?:based on|from|using)\b/.test(text))))) return historicalAnswer(text, state);
    let kind;
    if (/leak|continuous|running water/.test(text)) kind = "leak";
    else if (/forecast|projection|predict|estimate|evening|end of (the )?day|8 ?p\.?m|goal/.test(text)) kind = "forecast";
    else if (/by (time|hour)|time of day|when.*(used|use)|morning|afternoon/.test(text)) kind = "time";
    else if (/split|breakdown|categor|activit|bathing|laundry/.test(text)) kind = "use";
    else if (/trend|week|day.by.day|history|daily totals|last (\d+|seven) days/.test(text)) kind = "trend";
    else if (/\b(chart|graph|table)\b/.test(text)) kind = /today/.test(text) ? "time" : "trend";
    else return null;
    const data = facts(state, /8\s*p\.?m|evening/i.test(question) ? 20 : 24);
    if (kind === "leak") return { mood: data.leak ? "concerned" : "idle", text: data.leak ? priority(data).text :
      data.demo ? "Sample readings cannot tell you whether your home has a leak. Try Leak detection in the demos." :
        state.device.connected ? "There’s no sustained-flow alert right now. The meter cannot rule out a leak." :
          "Connect your meter to check for sustained flow." };
    if (kind === "forecast" && !explicitCutoff && !Number.isFinite(data.forecast.projected)) return historicalAnswer(text, state);
    const chart = visual(data,kind);
    if (!chart || !chart.rows.some(row => Number.isFinite(row.value))) return { text: "There aren’t readings for that view yet." };
    const source = data.demo ? "From the sample readings" : "From your meter readings";
    const f = data.forecast;
    const detail = kind === "forecast"
      ? Number.isFinite(f.projected) ? `: about ${number(f.projected)} L by ${data.cutoff} if the pace continues.`
        : Number.isFinite(f.byEvening) ? `: ${number(f.byEvening)} L recorded by ${data.cutoff}.` : ": there’s no end-of-day estimate yet."
      : kind === "trend" ? ". Days without a reading appear as gaps." : ". Here’s today’s split.";
    return { text: source + detail, chart, table: /\btable\b/.test(text) };
  }
  // Routine allowances are rough planning inputs. A known total takes priority.
  function startingGoal(routine, knownLitres, focus, note) {
    const shower = routine.typicalShowerMinutes * 8;
    const bath = { bucket: 20, shower, mixed: (20 + shower) / 2 }[routine.showerStyle];
    const allowances = {
      bathing: routine.people * bath,
      laundry: routine.laundryDaysPerWeek * (routine.washingMachine ? 55 : 35) / 7,
      kitchen: routine.cookingMealsPerDay * (routine.dishwasher ? 8 : 12),
      outdoors: routine.outdoorDays * 30 / 7,
    };
    const estimated = routine.people * 35 + Object.values(allowances).reduce((sum, litres) => sum + litres, 0);
    const tips = {
      bathing: "Check how much a normal shower or bucket bath uses before adjusting your goal.",
      laundry: "Compare laundry days with other days before adjusting your goal.",
      kitchen: "Try tracking several cooking days before adjusting your goal.",
      outdoors: "Compare watering days with other days before adjusting your goal.",
    };
    // A single explicit activity is stronger evidence than an ambiguous model label.
    const keywords = { bathing: /\b(shower|bath|bathing)\b/i, laundry: /\b(laundry|washing machine)\b/i,
      kitchen: /\b(cooking|dishes|dishwasher)\b/i, outdoors: /\b(garden|watering|hose)\b/i };
    const explicit = Object.keys(keywords).filter(activity => keywords[activity].test(note));
    const selected = explicit.length === 1 ? explicit[0] : focus;
    const largest = Object.keys(allowances).reduce((a,b) => allowances[a] >= allowances[b] ? a : b);
    return {
      goal: knownLitres || Math.max(10, Math.ceil(estimated / 10) * 10),
      reason: knownLitres
        ? "I used the typical daily total you entered."
        : `I estimated ${Math.round(estimated)} L/day from your household size, bathing, laundry, meals and outdoor use. Actual use varies.`,
      tip: Object.hasOwn(tips, selected) ? tips[selected] : tips[largest],
    };
  }

  const dayMs = 86400000;
  const firstWeekDay = (date, start) => (Date.parse(date) - Date.parse(start)) / dayMs;
  const activityPatterns = {
    "Bath": /\b(shower\w*|bath\w*|bathe\w*)\b/i,
    "Food/Drink": /\b([cv]ook\w*|kitchen|drink\w*|food|meals?)\b/i,
    "Housework": /\b(laundry|dishes|dishwasher|wash\w* clothes|clean\w*|mop\w*|garden\w*|water\w* plants)\b/i,
  };
  function activityLabels(answer) {
    if (/^(?:i )?(?:do not|don['’]?t|can['’]?t|cannot) (?:remember|recall|know)\b|^not sure\b/i.test(answer)) return [];
    const labels = Object.keys(activityPatterns).filter(label => activityPatterns[label].test(answer));
    return labels.length ? labels : ["Misc"];
  }

  // Use only finished hours. Gaps stay blank and each day asks about at most one peak.
  function studyQuestion(state, now = new Date(), selectedHour) {
    const day = window.UTLTAI.indiaDate(now);
    const dayIndex = firstWeekDay(day, state.niroStudyStart);
    if (!state.niroStudyStart || !(dayIndex >= 0 && dayIndex < 7)) return null;
    return observedPeak(state, now, selectedHour);
  }

  function observedPeak(state, now, selectedHour) {
    if (state.usingDemo || state.demoEnabled) return null;
    const day = window.UTLTAI.indiaDate(now);
    const start = Date.parse(day + "T00:00:00+05:30");
    const hourMs = 3600000;
    const hours = Array.from({length: 24}, (_, hour) => ({hour, value: null, readings: []}));
    state.readings.forEach(reading => {
      const hour = Math.floor((Date.parse(reading.recordedAt) - start) / hourMs);
      if (!hours[hour] || start + (hour + 1) * hourMs > now.getTime() || !Number.isFinite(reading.litres) || reading.litres <= 0) return;
      hours[hour].value = (hours[hour].value || 0) + reading.litres;
      hours[hour].readings.push(reading);
    });
    const saved = state.niroStudy.answers[day];
    const peak = hours[saved?.hour ?? selectedHour] || hours.reduce((highest, hour) => hour.value > highest.value ? hour : highest, hours[0]);
    if (!peak?.value || (!saved && (peak.value < 3 || peak.readings.every(item => item.verifiedCategory)))) return null;
    return {day, hours, peak, saved};
  }

  // Learn combinations without turning overlapping activities into invented litre splits.
  function learnedActivity(state) {
    const observed = observedPeak(state, new Date());
    if (!observed) return { text: "There isn’t a finished water-use interval to compare yet." };
    if (observed.saved?.labels.length) return { text: "You labeled this interval: " + observed.saved.labels.join(" + ") + "." };
    const { hour, value } = observed.peak;
    const matches = Object.entries(state.niroStudy.answers).filter(([day, sample]) =>
      day !== observed.day && Math.abs(sample.hour - hour) <= 1 && sample.labels.length &&
      !sample.labels.includes("Misc") && Math.abs(sample.litres - value) <= value * 0.5);
    const counts = {};
    matches.forEach(([, sample]) => {
      const labels = sample.labels.join(" + ");
      counts[labels] = (counts[labels] || 0) + 1;
    });
    const winner = Object.entries(counts).sort((a,b) => b[1] - a[1])[0];
    return { text: winner && winner[1] >= 2 && winner[1] > matches.length / 2
      ? `Similar intervals were labeled ${winner[0]}. That’s a possibility for this interval.`
      : "I don’t have enough similar confirmed examples to suggest an activity for this interval." };
  }

  function medianDailyTotal(days) {
    const ordered = days.map(([, value]) => value).sort((a, b) => a - b);
    const middle = Math.floor(ordered.length / 2);
    return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
  }

  function studyForecast(state, now = new Date()) {
    const today = window.UTLTAI.indiaDate(now);
    const dayIndex = firstWeekDay(today, state.niroStudyStart);
    if (!(dayIndex >= 7) || state.demoEnabled) return null;
    const days = Object.entries(state.niroStudy.daily).sort(([a], [b]) => a.localeCompare(b));
    if (days.length < 3) return {days};
    const volumes = days.map(([, value]) => value);
    const counts = {};
    Object.values(state.niroStudy.answers).forEach(({ labels }) => {
      labels.filter(label => label !== "Misc").forEach(label => { counts[label] = (counts[label] || 0) + 1; });
    });
    return { days, typical: medianDailyTotal(days), low: Math.min(...volumes), high: Math.max(...volumes),
      recurring: Object.keys(counts).filter(label => counts[label] >= 2) };
  }

  function studyCard(state) {
    const question = studyQuestion(state);
    if (question) {
      const {day, hours, peak, saved} = question;
      const max = Math.max(...hours.map(hour => hour.value || 0));
      const clock = hour => String(hour).padStart(2, "0") + ":00";
      const interval = clock(peak.hour) + "–" + clock(peak.hour + 1);
      const bars = hours.map(({hour, value}) => `<i class="${hour === peak.hour ? "is-highlighted" : ""}" style="--bar:${(value || 0) / max * 100}%"></i>`).join("");
      const heading = `<h2>What was this water used for?</h2><p><strong>${interval} · ${number(peak.value)} L</strong> recorded today.</p>`;
      return `<section class="niro-study"><p class="utlt-eyebrow">NIRO · FIRST WEEK</p>${heading}
        <div class="niro-study-plot" role="img" aria-label="Hourly water use. Highlighted interval ${interval}, ${number(peak.value)} litres.">${bars}</div>
        <div class="niro-study-axis" aria-hidden="true"><span>00:00</span><span>12:00</span><span>24:00</span></div>
        ${saved ? `<p role="status">${saved.labels.length ? "Saved: " + esc(saved.labels.join(" + ")) : "Skipped. Niro won’t guess the activity."}</p>` :
          `<form id="niro-study-form" data-day="${day}" data-hour="${peak.hour}">
            <label>What were you doing around ${interval}?<input name="activity" type="text" maxlength="160" placeholder="Showering and cooking"></label>
            <div><button type="submit" class="utlt-primary-button" value="answer">Save answer</button>
            <button type="submit" class="utlt-secondary-button" value="unknown" formnovalidate>I don’t remember</button></div>
          </form>`}
      </section>`;
    }
    const forecast = studyForecast(state);
    if (!forecast) return "";
    if (!Number.isFinite(forecast.typical)) return `<section class="niro-study"><h2>First-week forecast</h2><p>I recorded ${forecast.days.length} days during your first week. I need at least three to show a forecast.</p></section>`;
    return `<section class="niro-study"><h2>First-week forecast</h2>
      <p>About <strong>${number(forecast.typical)} L</strong> on a typical day. The ${forecast.days.length} recorded days ranged from ${number(forecast.low)} to ${number(forecast.high)} L.</p>
      ${forecast.recurring.length ? `<p>Activities you confirmed more than once: ${esc(forecast.recurring.join(", "))}.</p>` : ""}
    </section>`;
  }

  // The coach answers from its own 4 pm scenario, separate from the dashboard sample.
  function coachAnswer(question) {
    const { goal, used, projected, hoursMeasured, breakdown } = window.UTLTDemo.coach;
    const text = question.toLowerCase();
    const meter = meterExplanation(text);
    if (meter) return meter;
    const wantsTable = /\btable\b/.test(text);
    const visual = /chart|table|graph/.test(text);
    if (/split|breakdown|bath|food|housework|unknown/.test(text)) return {
      text: breakdown.map(({ label, value }) => `${label}: ${value} L`).join(" · "),
      chart: { title: "Sample use at 4 pm", key: "Activity", rows: breakdown }, table: wantsTable,
    };
    if (expectsUsage.test(text) || /forecast|project|predict|estimate|end of|8\s*p|pace|per hour|rate|why.*400/.test(text) || visual) return {
      text: `The sample home used ${used} L in ${hoursMeasured} hours. At ${used / hoursMeasured} L/hour, four more hours would bring it to ${projected} L by 8 pm, ${projected - goal} L over the goal.`,
      chart: visual ? { title: "Sample outlook", key: "Reading", rows: [
        { label: "Used at 4 pm", value: used }, { label: "Daily goal", value: goal }, { label: "Estimated by 8 pm", value: projected },
      ] } : null, table: wantsTable,
    };
    if (/leak|running|continuous/.test(text)) return { text: "This coach scenario shows a high pace of use. Switch to Leak detection to see the continuous-flow alert." };
    if (/save|reduce|tip|help|what.*\bdo\b|suggest|avoid|stay under/.test(text)) return { text: `At 4 pm the sample home has ${goal - used} L left before its goal. Try turning off the tap while soaping or scrubbing.` };
    if (/goal|limit|left|remain|total|litre|liter|used|usage|how much/.test(text)) return { text: `The coach sample has used ${used} L at 4 pm against a ${goal} L goal. It has ${goal - used} L left before the goal.` };
    if (/^(hey|hi|hello|thanks|thank you)\b/.test(text)) return { text: "I’m Niro. Ask me about the sample’s forecast, water-use split, or what you can do to save water." };
    return null;
  }

  function coachChat(messages, visible) {
    return `<section class="niro-demo-chat" ${visible ? "" : "hidden"} aria-label="AI Water Coach chat">
      <div class="niro-chat-head">${avatar()}<h2>Chat with Niro</h2></div>
      <div class="niro-demo-thread" role="log" aria-label="Coach conversation">
        ${messages.length ? messages.map(({role, text, chart, table}) => `<div class="niro-message is-${role} utlt-user-content"><p>${esc(text)}</p>${figures(chart, table)}</div>`).join("") :
          '<p>Ask about this sample, such as “Why does the forecast reach 400 litres?”</p>'}
      </div>
      <form id="niro-coach-form">
        <label for="niro-coach-question">Message Niro about the demo</label>
        <div><input id="niro-coach-question" name="question" type="text" maxlength="300" required placeholder="Show me the water-use split">
        <button type="submit" class="utlt-primary-button">Send</button></div>
      </form>
      <p class="utlt-ai-note">Sample data · Chats aren’t saved</p>
    </section>`;
  }

  window.UTLTNiro = Object.freeze({ outline, avatar, wave, summary, answer, figures, startingGoal, firstWeekDay, activityLabels, studyQuestion, studyCard, coachAnswer, coachChat });
})();
