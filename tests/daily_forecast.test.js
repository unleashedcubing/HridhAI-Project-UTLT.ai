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
const during = forecast([reading('08', '00', 80), reading('10', '00', 40)], 350, at('11', '00'));
assert.equal(during.stage, 'tracking');
assert.equal(during.projected, 480);
assert.equal(during.tone, 'over');
const ready = forecast([reading('08', '00', 80), reading('10', '00', 40)], 350, at('14', '00'));
assert.equal(ready.stage, 'feedback');
assert.equal(ready.projected, 240);
assert.equal(ready.tone, 'within');
const late = forecast([reading('21', '00', 8)], 350, at('22', '00'));
assert.equal(late.byEvening, null);
console.log('Daily forecast boundaries passed');
