# UTLT.ai — standalone web app

Open `index.html` in a browser. No install, server, framework, or build step is needed. The app contains only HTML, CSS, and JavaScript and works in current desktop and mobile browsers.

## Files

- `index.html` loads the app.
- `styles.css` contains the light and dark layouts.
- `data.js` defines demo readings and the water summary calculations.
- `app.js` renders the screens and handles the controls.

## Continue development

The dashboard currently uses demo readings, and the pairing screen is a placeholder. A device adapter can pass new readings into the app:

```js
UTLT.setReadings([
  { recordedAt: "2026-11-05T08:00:00+05:30", litres: 12.5, category: "Bath" },
  { recordedAt: "2026-11-05T13:00:00+05:30", litres: 3.2, category: "Food/Drink" }
]);
UTLT.setDevice({ connected: true, lastConnectedAt: new Date().toISOString() });
```

`recordedAt` needs a full ISO timestamp with a timezone offset, and `litres` must be a nonnegative number. `category` can be `Food/Drink`, `Bath`, `Housework`, or `Misc`. Readings without a category appear under Misc. The time view uses the timestamp. A flow sensor alone cannot determine the activity, so a future app needs user labels or another reliable classification method.

`UTLT.setDevice({ connected: false })` updates the disconnected icon while retaining the last known connection time. `UTLT.getState()` returns the current in-memory state for debugging. Nothing is sent to a server. Profile edits and readings are not persisted across reloads yet.

The pie's static SVG sector design was adapted from [Kokonut UI's Spending Ring](https://kokonutui.com/docs/cards/spending-ring) by Dorian Baffier (MIT). Inline icons use [Tabler Icons](https://tabler.io/icons) (MIT). This export contains no animation or external library.
