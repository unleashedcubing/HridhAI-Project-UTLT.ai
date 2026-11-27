const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const now = new Date("2026-11-27T08:00:00+05:30");
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now.getTime()])); }
  static now() { return now.getTime(); }
}

const context = { window: {}, Date: FixedDate, Intl, fetch: async () => ({ ok: false }) };
for (const file of ["ai.js", "data.js", "niro.js"]) {
  vm.runInNewContext(fs.readFileSync(file, "utf8"), context);
}
const { answer } = context.window.UTLTNiro;
const question = "How much water do you expect me to use today?";
const sample = { demoEnabled: false, device: { connected: false }, niroStudyStart: "", readings: [
  { recordedAt: "2026-11-24T07:30:00+05:30", litres: 230 },
  { recordedAt: "2026-11-25T07:30:00+05:30", litres: 280 },
  { recordedAt: "2026-11-26T07:30:00+05:30", litres: 320 },
] };
const forecast = answer(question, sample);
assert.match(answer("How much do you think I’ll use today?", sample).text, /Around 280 L today/);
assert.match(forecast.text, /Around 280 L today, based on 3 previous days of meter readings/);
assert.equal(forecast.chart.rows.length, 3);
const withToday = { ...sample, readings: [...sample.readings, { recordedAt: "2026-11-27T07:30:00+05:30", litres: 40 }] };
assert.match(answer(question, withToday).text, /about 40 L by midnight/);
assert.match(answer(question, withToday).text, /added today’s 40 L/);
assert.match(answer(question, {...sample, demoEnabled: true}).text, /sample readings/);
assert.match(answer(question, {...sample, readings: sample.readings.slice(0, 1)}).text, /rough estimate/);
assert.match(answer(question, {...sample, readings: []}).text, /at least one previous day/);
assert.match(answer("Based on previous results?", sample).text, /Around 280 L for a typical day/);
assert.match(answer("Predict my usage tomorrow", sample).text, /Around 280 L tomorrow/);
assert.equal(answer("How much water have I used today?", sample), null);
assert.match(answer("What does the flow sensor measure?", sample).text, /how much water passes through/);
assert.match(answer("Does the meter measure pressure?", sample).text, /no pressure reading/);
console.log("Historical Niro forecasts and sensor explanations passed");
