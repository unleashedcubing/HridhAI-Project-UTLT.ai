/* Local, free numerical model. Suggestions are never treated as verified uses. */
(function () {
  "use strict";
  let model = null;
  const categories = ["Bath", "Food/Drink", "Housework", "Misc"];
  const indiaDate = (date) => new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(date);
  const indiaHour = (date) => Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", hour: "2-digit", hourCycle: "h23"
  }).format(date));

  function features(session, survey) {
    const date = new Date(session.recordedAt);
    const hour = Number(new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata", hour: "2-digit", hourCycle: "h23"
    }).format(date));
    const minute = Number(new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata", minute: "2-digit"
    }).format(date));
    const clock = hour + minute / 60;
    const shower = Number(survey.usualShowerHour ?? 7);
    const weekday = new Date(`${indiaDate(date)}T12:00:00+05:30`).getDay();
    return [
      Math.log1p(session.litres), Math.log1p(session.durationMinutes),
      Math.sin(clock * Math.PI / 12), Math.cos(clock * Math.PI / 12),
      Number(survey.people) || 1, Math.sin(shower * Math.PI / 12), Math.cos(shower * Math.PI / 12),
      Number(survey.typicalShowerMinutes) || 8,
      { bucket: 0, mixed: 1, shower: 2 }[survey.showerStyle] ?? 1,
      Number(survey.laundryDaysPerWeek ?? 2), survey.dishwasher ? 1 : 0,
      Number(survey.cookingMealsPerDay ?? 2), weekday === 0 || weekday === 6 ? 1 : 0
    ];
  }

  function predict(session, survey, corrections = []) {
    if (!model || !survey) return { category: "Misc", confidence: 0, ready: false };
    const x = features(session, survey);
    const scores = new Array(model.classes.length).fill(0);
    for (const tree of model.trees) {
      let node = 0;
      while (tree.feature[node] >= 0) node = x[tree.feature[node]] <= tree.threshold[node] ? tree.left[node] : tree.right[node];
      tree.probability[node].forEach((value, index) => { scores[index] += value / model.trees.length; });
    }
    // Recent household confirmations gently personalize the pretrained model.
    for (const correction of corrections.slice(-40)) {
      if (!categories.includes(correction.category) || !Array.isArray(correction.features)) continue;
      const distance = Math.sqrt(x.reduce((sum, value, index) => {
        const scale = [2, 2, 1, 1, 3, 1, 1, 10, 2, 5, 1, 3, 1][index];
        return sum + ((value - correction.features[index]) / scale) ** 2;
      }, 0));
      if (distance < 0.42) scores[model.classes.indexOf(correction.category)] += 0.55 * (1 - distance / 0.42);
    }
    const total = scores.reduce((sum, value) => sum + value, 0);
    const ranking = scores.map((score, index) => ({ category: model.classes[index], confidence: score / total }))
      .sort((a, b) => b.confidence - a.confidence);
    return { ...ranking[0], ready: true, alternative: ranking[1].category };
  }

  function sessions(readings, survey, day, corrections = []) {
    const items = readings.filter(item => item.recordedAt?.startsWith(day) && item.litres > 0 && !item.verifiedCategory)
      .sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
    const groups = [];
    for (const item of items) {
      const epoch = Date.parse(item.recordedAt);
      const previous = groups.at(-1);
      if (!previous || epoch - previous.lastEpoch > 5.5 * 60000) {
        groups.push({ recordedAt: item.recordedAt, lastEpoch: epoch, litres: item.litres,
          durationMinutes: 0, keys: [String(item.bucketEpoch || item.recordedAt)] });
      } else {
        previous.lastEpoch = epoch;
        previous.litres += item.litres;
        previous.durationMinutes = (epoch - Date.parse(previous.recordedAt)) / 60000;
        previous.keys.push(String(item.bucketEpoch || item.recordedAt));
      }
    }
    return groups.filter(group => group.durationMinutes >= 16)
      .map(group => ({ ...group, suggestion: predict(group, survey, corrections) }))
      .filter(group => group.suggestion.confidence < 0.82 || indiaHour(new Date(group.recordedAt)) < 5);
  }

  function reviewEligible(survey, now = new Date()) {
    if (!survey?.startedAt || indiaHour(now) < 21) return false;
    const today = indiaDate(now);
    const start = new Date(`${survey.startedAt}T12:00:00+05:30`);
    const current = new Date(`${today}T12:00:00+05:30`);
    const days = Math.round((current - start) / 86400000);
    return (days >= 0 && days < 7) || Number(today.slice(8)) <= 3;
  }

  function numericInsight(readings, survey) {
    if (!survey) return null;
    const totals = new Map();
    for (const item of readings) {
      if (!item.recordedAt || !Number.isFinite(item.litres)) continue;
      const day = item.recordedAt.slice(0, 10);
      totals.set(day, (totals.get(day) || 0) + item.litres);
    }
    if (totals.size < 7) return { trackedDays: totals.size, neededDays: 7 };
    const latest = [...totals.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-7);
    const average = latest.reduce((sum, item) => sum + item[1], 0) / latest.length;
    return { trackedDays: 7, neededDays: 7, average: Math.round(average),
      perPerson: Math.round(average / Math.max(1, Number(survey.people))),
      suggestedGoal: Math.max(25, Math.round(average * 0.9 / 5) * 5) };
  }

  // Compare like with like: today's use so far against previous measured days
  // at this same local time. A median prevents one unusually high day from
  // dominating the reference. Missing days are never treated as zero usage.
  function paceInsight(readings, now = new Date()) {
    const today = indiaDate(now);
    const clock = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).format(now);
    const days = new Map();
    for (const item of readings) {
      if (!item?.recordedAt || !Number.isFinite(item.litres) || item.litres < 0) continue;
      const day = item.recordedAt.slice(0, 10);
      if (day > today || day < indiaDate(new Date(now.getTime() - 7 * 86400000))) continue;
      const entry = days.get(day) || { total: 0, soFar: 0, samples: 0 };
      entry.total += item.litres;
      if (item.recordedAt.slice(11, 16) <= clock) entry.soFar += item.litres;
      entry.samples += 1;
      days.set(day, entry);
    }
    const current = days.get(today);
    const previous = [...days.entries()].filter(([day, entry]) => day < today && entry.samples).map(([, entry]) => entry.soFar).sort((a, b) => a - b);
    if (!current || previous.length < 3) return { ready: false, measuredDays: previous.length, neededDays: 3 };
    const middle = Math.floor(previous.length / 2);
    const baseline = previous.length % 2 ? previous[middle] : (previous[middle - 1] + previous[middle]) / 2;
    const difference = current.soFar - baseline;
    const percent = baseline > 0 ? Math.round(Math.abs(difference) / baseline * 100) : null;
    const tone = Math.abs(difference) < 5 || percent === null || percent < 15 ? "usual" : difference > 0 ? "higher" : "lower";
    return { ready: true, today: current.soFar, baseline, difference, percent, tone, measuredDays: previous.length, clock };
  }

  const ready = fetch("./model.json").then(response => {
    if (!response.ok) throw new Error("Activity model unavailable");
    return response.json();
  }).then(value => { model = value; return value; }).catch(() => null);
  window.UTLTAI = Object.freeze({ ready, features, predict, sessions, reviewEligible, numericInsight, paceInsight, indiaDate });
})();
