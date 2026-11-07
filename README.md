# UTLT.ai — standalone web app

Open `index.html` in a browser. The app uses HTML, CSS, and JavaScript with Firebase Authentication and Cloud Firestore for profile preferences.

## Files

- `index.html` loads the app.
- `styles.css` contains the light and dark layouts.
- `data.js` defines demo readings and water summary calculations.
- `app.js` renders screens, handles controls, and syncs profile preferences.
- `firestore.rules` contains the per-user database access rules.

## Firebase setup (required for cloud sync)

This project uses Firebase project `utlt-ai`. In the Firebase console:

1. Open **Authentication → Sign-in method** and enable **Anonymous** sign-in.
2. Open **Firestore Database** and create a database.
3. In Firestore **Rules**, publish the contents of `firestore.rules`.

Each browser signs in anonymously and stores its profile in `profiles/{userId}`. The rules allow that signed-in browser identity to read and write only its own document. Firebase Analytics is not used to store profile data. The email field is saved as profile information; it is not verified and is not used to sign in.

If Firebase setup is unavailable, the app falls back to local browser storage. Cloud sync will begin after the Firebase setup steps are completed.

## Remembered preferences

The app saves the user's name, email address, selected utility, light/dark theme, home name, daily water goal, and chart breakdown preference. New profiles start with a **35-litre daily water goal**. Previously saved goals are retained until the user changes them.

Browser-local data remains on that browser. Firebase cloud data is tied to the anonymous browser identity; clearing browser site data can remove access to that identity.

## Device readings

The dashboard currently uses demo readings, and the pairing screen is a placeholder. A device adapter can pass new readings into the app:

```js
UTLT.setReadings([
  { recordedAt: "2026-11-05T08:00:00+05:30", litres: 12.5, category: "Bath" },
  { recordedAt: "2026-11-05T13:00:00+05:30", litres: 3.2, category: "Food/Drink" }
]);
UTLT.setDevice({ connected: true, lastConnectedAt: new Date().toISOString() });
```

`recordedAt` needs a full ISO timestamp with a timezone offset, and `litres` must be a nonnegative number. `category` can be `Food/Drink`, `Bath`, `Housework`, or `Misc`. Readings without a category appear under Misc. The time view uses the timestamp. A flow sensor alone cannot determine the activity, so a future app needs user labels or another reliable classification method.

`UTLT.setDevice({ connected: false })` updates the disconnected icon while retaining the last known connection time. `UTLT.getState()` returns the current in-memory state for debugging. Real device pairing and cloud storage of sensor readings are not implemented yet.

The pie's static SVG sector design was adapted from [Kokonut UI's Spending Ring](https://kokonutui.com/docs/cards/spending-ring) by Dorian Baffier (MIT). Inline icons use [Tabler Icons](https://tabler.io/icons) (MIT).
