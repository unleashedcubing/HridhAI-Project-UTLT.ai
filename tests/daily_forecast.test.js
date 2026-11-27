const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { window: {}, fetch: async () => ({ ok: false }), Intl, Date, Math, Number, Map };
vm.runInNewContext(fs.readFileSync('ai.js', 'utf8'), context);
const forecast = context.window.UTLTAI.dailyForecast;
const reading = (hour, minute, litres, day = '2026-11-13') => ({
  recordedAt: `${day}T${hour}:${minute}:00+05:30`, litres
});
const at = (hour, minute) => new Date(`2026-11-13T${hour}:${minute}:00+05:30`);

assert.equal(forecast([reading('08', '00', 25, '2026-11-12')], 350, at('14', '00')).stage, 'waiting');
const early = forecast([reading('08', '00', 80)], 350, at('08', '20'));
assert.equal(early.stage, 'tracking');
assert.equal(early.projected, undefined);
const history = ["2026-11-10", "2026-11-11", "2026-11-12"].flatMap((day, index) => [
  reading("10", "00", 200 + 10 * index, day),
  reading("15", "00", 140 + 20 * index, day),
  reading("21", "00", 20 + 10 * index, day),
]);
const measured = [reading("08", "00", 80), reading("10", "00", 40)];
const missing = forecast([...measured, ...history.slice(0, 6)], 350, at("11", "00"));
assert.equal(missing.historyDays, 2);
assert.equal(missing.projected, undefined);
const during = forecast([...measured, ...history], 350, at("11", "00"));
assert.equal(during.stage, "tracking");
assert.equal(during.typicalSoFar, 210);
assert.equal(during.typicalRemaining, 160);
assert.equal(during.projected, 280);
assert.equal(during.tone, "within");
const ready = forecast([...measured, ...history], 300, at("14", "00"), 24);
assert.equal(ready.stage, "feedback");
assert.equal(ready.projected, 310);
assert.equal(ready.tone, "over");
assert.equal(forecast([...measured, ...history], 350, at("16", "00")).projected, 120);
const late = forecast([reading('21', '00', 8)], 350, at('22', '00'));
assert.equal(late.byEvening, null);
console.log('Daily forecast boundaries passed');
