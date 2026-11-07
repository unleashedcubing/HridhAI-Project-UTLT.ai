/* Standalone UTLT.ai UI with Firebase Authentication and Cloud Firestore profile sync.
   Icon paths: Tabler Icons v3.44.0, MIT. */
(function () {
  "use strict";

  const PROFILE_STORAGE_KEY = "utlt-profile-v1";
  function readSavedProfile() {
    try {
      const saved = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || "{}");
      if (!saved.name) saved.name = localStorage.getItem("utlt-user-name") || "";
      return saved;
    } catch (error) { return { name: "" }; }
  }
  function saveLocalProfile(profile) {
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
      if (profile.name) localStorage.setItem("utlt-user-name", profile.name);
    } catch (error) { /* Local storage may be unavailable. */ }
  }
  const savedProfile = readSavedProfile();
  const state = {
    screen: "home",
    utility: savedProfile.utility || "Water",
    breakdown: savedProfile.breakdown || "use",
    dark: typeof savedProfile.dark === "boolean" ? savedProfile.dark : true,
    name: savedProfile.name || "",
    email: savedProfile.email || "",
    homeName: savedProfile.homeName || "My home",
    goal: Number(savedProfile.goal) > 0 ? Number(savedProfile.goal) : 350,
    saved: false,
    device: { connected: false, lastConnectedAt: null },
    readings: window.UTLTData.demoReadings,
    usingDemo: true,
    onboarding: savedProfile.name ? "" : "profile",
    tutorialStep: 0,
    syncStatus: "starting",
    syncError: "",
    uid: "", friendCode: "", friends: [], friendRequests: [], friendStats: [],
    leaderboardVisible: savedProfile.leaderboardVisible === true, friendMessage: "", friendBusy: false
  };

  // Each browser receives a private anonymous Firebase identity.
  const firebaseReady = (async () => {
    const version = "13.2.0";
    const [appSdk, authSdk, firestoreSdk] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/" + version + "/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/" + version + "/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/" + version + "/firebase-firestore.js")
    ]);
    const firebaseConfig = {
      apiKey: "AIzaSyAXqm-gHRYSKBmqqgVW4wvhBdXgFLWC9g",
      authDomain: "utlt-ai.firebaseapp.com",
      projectId: "utlt-ai",
      storageBucket: "utlt-ai.firebasestorage.app",
      messagingSenderId: "190773473724",
      appId: "1:190773473724:web:6cbccf7c9d62a681be3bb9",
      measurementId: "G-X0EEKYQCTG"
    };
    const firebaseApp = appSdk.initializeApp(firebaseConfig);
    const auth = authSdk.getAuth(firebaseApp);
    await authSdk.setPersistence(auth, authSdk.browserLocalPersistence);
    const credential = await authSdk.signInAnonymously(auth);
    const db = firestoreSdk.getFirestore(firebaseApp);
    const uid = credential.user.uid;
    const profileRef = firestoreSdk.doc(db, "profiles", uid);
    return {

      uid,
      async ensureFriendCode(displayName) {
        const snap = await firestoreSdk.getDoc(profileRef);
        const existing = snap.exists() ? snap.data().friendCode : "";
        if (existing) {
          await firestoreSdk.setDoc(firestoreSdk.doc(db, "friendCodes", existing), { uid, displayName: displayName || "UTLT user" }, { merge: true });
          return existing;
        }
        const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        for (let attempt = 0; attempt < 8; attempt++) {
          const bytes = new Uint8Array(7);
          crypto.getRandomValues(bytes);
          const code = "UTLT-" + Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("");
          const codeRef = firestoreSdk.doc(db, "friendCodes", code);
          const claimed = await firestoreSdk.runTransaction(db, async transaction => {
            const codeSnap = await transaction.get(codeRef);
            if (codeSnap.exists()) return false;
            transaction.set(codeRef, { uid, displayName: displayName || "UTLT user" });
            transaction.set(profileRef, { friendCode: code }, { merge: true });
            return true;
          });
          if (claimed) return code;
        }
        throw new Error("Could not create a friend code. Please try again.");
      },
      async updateFriendName(code, displayName) {
        await firestoreSdk.setDoc(firestoreSdk.doc(db, "friendCodes", code), { uid, displayName: displayName || "UTLT user" }, { merge: true });
      },
      async lookupFriendCode(code) {
        const snap = await firestoreSdk.getDoc(firestoreSdk.doc(db, "friendCodes", code));
        return snap.exists() ? snap.data() : null;
      },
      async sendFriendRequest(recipientUid, recipientName, senderName) {
        const requestId = uid + "_" + recipientUid;
        const requestRef = firestoreSdk.doc(db, "friendRequests", requestId);
        const existing = await firestoreSdk.getDoc(requestRef);
        if (existing.exists()) {
          const data = existing.data();
          if (data.status === "pending") throw new Error("A friend request is already pending.");
          if (data.status === "accepted") throw new Error("You are already friends.");
          await firestoreSdk.deleteDoc(requestRef);
        }
        const reverseId = recipientUid + "_" + uid;
        const reverse = await firestoreSdk.getDoc(firestoreSdk.doc(db, "friendRequests", reverseId));
        if (reverse.exists() && reverse.data().status === "pending") throw new Error("This person has already sent you a request. Check incoming requests.");
        await firestoreSdk.setDoc(requestRef, {
          senderUid: uid, recipientUid, senderName: senderName || "UTLT user",
          recipientName: recipientName || "UTLT user", status: "pending", createdAt: new Date().toISOString()
        });
      },
      async loadFriendRequests() {
        const ref = firestoreSdk.collection(db, "friendRequests");
        const [incoming, outgoing] = await Promise.all([
          firestoreSdk.getDocs(firestoreSdk.query(ref, firestoreSdk.where("recipientUid", "==", uid), firestoreSdk.where("status", "==", "pending"))),
          firestoreSdk.getDocs(firestoreSdk.query(ref, firestoreSdk.where("senderUid", "==", uid), firestoreSdk.where("status", "==", "pending")))
        ]);
        return {
          incoming: incoming.docs.map(s => ({ id: s.id, ...s.data() })),
          outgoing: outgoing.docs.map(s => ({ id: s.id, ...s.data() }))
        };
      },
      async loadFriends() {
        const snap = await firestoreSdk.getDocs(firestoreSdk.query(
          firestoreSdk.collection(db, "friendships"), firestoreSdk.where("memberUids", "array-contains", uid)
        ));
        return snap.docs.map(s => ({ id: s.id, ...s.data() }));
      },
      async answerFriendRequest(requestId, accept) {
        const requestRef = firestoreSdk.doc(db, "friendRequests", requestId);
        const snap = await firestoreSdk.getDoc(requestRef);
        if (!snap.exists()) throw new Error("That request no longer exists.");
        const data = snap.data();
        if (data.recipientUid !== uid || data.status !== "pending") throw new Error("This request can no longer be changed.");
        await firestoreSdk.updateDoc(requestRef, { status: accept ? "accepted" : "declined", updatedAt: new Date().toISOString() });
        if (accept) {
          const friendUid = data.senderUid;
          const memberUids = [uid, friendUid];
          const displayNames = { [uid]: state.name || "UTLT user", [friendUid]: data.senderName || "UTLT user" };
          const batch = firestoreSdk.writeBatch(db);
          for (const [owner, other] of [[uid, friendUid], [friendUid, uid]]) {
            batch.set(firestoreSdk.doc(db, "friendships", owner + "_" + other), {
              memberUids, displayNames, requestId, createdAt: new Date().toISOString()
            });
          }
          await batch.commit();
        }
      },
      async removeFriend(friendUid) {
        const batch = firestoreSdk.writeBatch(db);
        batch.delete(firestoreSdk.doc(db, "friendships", uid + "_" + friendUid));
        batch.delete(firestoreSdk.doc(db, "friendships", friendUid + "_" + uid));
        await batch.commit();
      },
      async loadFriendStats(friendUid) {
        const snap = await firestoreSdk.getDoc(firestoreSdk.doc(db, "friendStats", friendUid));
        return snap.exists() ? snap.data() : null;
      },
      async publishStats(stats) {
        await firestoreSdk.setDoc(firestoreSdk.doc(db, "friendStats", uid), stats, { merge: true });
      },

      async loadProfile() {
        const snapshot = await firestoreSdk.getDoc(profileRef);
        return snapshot.exists() ? snapshot.data() : null;
      },
      async saveProfile(profile) {
        await firestoreSdk.setDoc(profileRef, {
          ...profile, updatedAt: new Date().toISOString()
        }, { merge: true });
      }
    };
  })();

  let firebaseStore = null;
  let saveQueue = Promise.resolve();
  let profileChangedBeforeCloud = false;
  function profileSnapshot() {
    return {
      name: state.name, email: state.email, utility: state.utility,
      dark: state.dark, homeName: state.homeName, goal: state.goal,
      breakdown: state.breakdown, leaderboardVisible: state.leaderboardVisible
    };
  }
  function persistProfile() {
    const profile = profileSnapshot();
    saveLocalProfile(profile);
    if (firebaseStore) {
      saveQueue = saveQueue.then(() => firebaseStore.saveProfile(profile))
        .then(() => { state.syncStatus = "cloud"; state.syncError = ""; })
        .catch((error) => {
          state.syncStatus = "error";
          state.syncError = error?.message || "Cloud save failed";
          console.error("UTLT cloud save failed; local copy is retained.", error);
          render(true);
        });
    } else {
      profileChangedBeforeCloud = true;
    }
  }
  function applySavedProfile(profile) {
    if (!profile || typeof profile !== "object") return;
    if (typeof profile.name === "string") state.name = profile.name;
    if (typeof profile.email === "string") state.email = profile.email;
    if (["Water", "Gas", "Electricity"].includes(profile.utility)) state.utility = profile.utility;
    if (typeof profile.dark === "boolean") state.dark = profile.dark;
    if (typeof profile.homeName === "string") state.homeName = profile.homeName;
    if (Number(profile.goal) > 0) state.goal = Number(profile.goal);
    if (["use", "time"].includes(profile.breakdown)) state.breakdown = profile.breakdown;
    state.leaderboardVisible = profile.leaderboardVisible === true;
  }
  async function initializePersistence() {
    try {
      firebaseStore = await firebaseReady;
      state.uid = firebaseStore.uid;
      const remoteProfile = await firebaseStore.loadProfile();
      if (profileChangedBeforeCloud) {
        await firebaseStore.saveProfile(profileSnapshot());
      } else if (remoteProfile) {
        applySavedProfile(remoteProfile);
      } else if (state.name || state.email) {
        await firebaseStore.saveProfile(profileSnapshot());
      }
      state.friendCode = await firebaseStore.ensureFriendCode(state.name || "UTLT user");
      await refreshFriendData();
      state.syncStatus = "cloud";
      state.syncError = "";
      saveLocalProfile(profileSnapshot());
    } catch (error) {
      state.syncStatus = "local";
      state.syncError = error?.message || "Firebase setup is incomplete";
      console.error("UTLT cloud storage unavailable; using browser storage.", error);
    }
    state.onboarding = state.name ? "" : "profile";
    render();
  }

  const root = document.getElementById("app");
  const circumference = 2 * Math.PI * 84;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }
  function number(value) { return Number(value.toFixed(1)); }

  const paths = {
    home: '<path d="M5 12l-2 0l9 -9l9 9l-2 0"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7"/><path d="M10 12h4v4h-4l0 -4"/>',
    plus: '<path d="M9 12h6"/><path d="M12 9v6"/><path d="M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14"/>',
    user: '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/><path d="M9 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M6.168 18.849a4 4 0 0 1 3.832 -2.849h4a4 4 0 0 1 3.834 2.855"/>',
    settings: '<path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/>',
    moon: '<path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454l0 .008"/>',
    sun: '<path d="M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/><path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7"/>',
    bluetooth: '<path d="M7 8l10 8l-5 4l0 -16l5 4l-10 8"/>',
    bluetoothOff: '<path d="M3 3l18 18"/><path d="M16.438 16.45l-4.438 3.55v-8m0 -4v-4l5 4l-2.776 2.22m-2.222 1.779l-5 4"/>',
    check: '<path d="M5 12l5 5l10 -10"/>',
    chevron: '<path d="M9 6l6 6l-6 6"/>'
  };
  function icon(name, size = 24) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
  }

  function header() {
    const title = state.screen === "account" ? "Account" : state.screen === "pair" ? "Pair Your Device" : state.screen === "device" ? "Device Settings" : `${state.name.split(" ")[0] || "Your"}’s UTLT`;
    const connection = state.screen === "home" ? `<span class="utlt-connection-icon ${state.device.connected ? "is-connected" : "is-disconnected"}" role="img" aria-label="Device ${state.device.connected ? "connected" : "disconnected"}">${icon(state.device.connected ? "bluetooth" : "bluetoothOff", 16)}</span>` : "";
    let actions = "";
    if (state.screen === "home") actions = `<div class="utlt-header-actions"><button class="utlt-icon-button" data-action="device" aria-label="Device settings">${icon("settings")}</button><button class="utlt-icon-button" data-action="theme" aria-label="Switch to ${state.dark ? "light" : "dark"} mode">${icon(state.dark ? "sun" : "moon")}</button></div>`;
    if (state.screen === "account" || state.screen === "device") actions = `<button class="utlt-icon-button" data-action="home" aria-label="Back to home">${icon("home")}</button>`;
    return `<header class="utlt-header"><div class="utlt-title"><span>${escapeHtml(title)}</span>${connection}</div>${actions}</header>`;
  }

  function utilityTabs() {
    const utilities = [["Water", "#1688f8"], ["Gas", "#528c00"], ["Electricity", "#baa500"]];
    return `<div class="utlt-pills" role="tablist" aria-label="Utility type">${utilities.map(([name, color]) => `<button class="utlt-pill ${state.utility === name ? "is-active" : ""}" role="tab" aria-selected="${state.utility === name}" data-action="utility" data-value="${name}" style="--utility-color:${color}">${name}</button>`).join("")}</div>`;
  }

  function usage(summary) {
    const goal = Math.max(1, Number(state.goal) || 350);
    const percent = Math.round(summary.used / goal * 100);
    const dash = Math.min(summary.used / goal, 1) * circumference;
    return `<section class="utlt-usage"><div class="utlt-donut"><svg viewBox="0 0 193 193" role="img" aria-label="${percent} percent of daily water goal used"><defs><linearGradient id="utlt-water-gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="var(--utlt-ring-start)"/><stop offset="100%" stop-color="var(--utlt-ring-end)"/></linearGradient></defs><circle class="utlt-donut-track" cx="96.5" cy="96.5" r="84"/><circle class="utlt-donut-value" cx="96.5" cy="96.5" r="84" style="stroke-dasharray:${dash} ${circumference}"/></svg><div class="utlt-donut-label"><strong>${percent}%</strong><span>Used</span></div></div><div class="utlt-usage-summary"><strong>${number(summary.used)}</strong><span>/ ${goal} Litres</span></div></section>`;
  }

  function status(summary) {
    const over = summary.used > Math.max(1, Number(state.goal) || 350);
    return `<section class="utlt-status-card is-${over ? "over-goal" : "on-track"}" aria-live="polite"><div><strong>${over ? "Above today’s goal" : "You’re on track for today!"}</strong><p>${over ? "You’ve used more than your chosen daily goal." : "Keep your usual routine. No action needed right now."}</p></div></section>`;
  }

  function polar(angle) {
    const radians = angle * Math.PI / 180;
    return [88 + 82 * Math.sin(radians), 88 - 82 * Math.cos(radians)];
  }
  function sector(from, to) {
    const [x1, y1] = polar(from);
    const [x2, y2] = polar(to);
    return `M 88 88 L ${x1} ${y1} A 82 82 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2} Z`;
  }
  function breakdown(summary) {
    const slices = state.breakdown === "use" ? summary.byUse : summary.byTime;
    const total = slices.reduce((sum, slice) => sum + slice.litres, 0);
    let angle = 0;
    const sectors = slices.map((slice) => {
      const sweep = total ? slice.litres / total * 360 : 0;
      const from = angle;
      angle += sweep;
      return sweep > 0 ? `<path d="${sector(from, angle)}" fill="${slice.color}" stroke="${slice.color}" stroke-width="0.6"/>` : "";
    }).join("");
    return `<section class="utlt-glance"><h2>A Glance at Your Day</h2><div class="utlt-breakdown-switch" role="tablist" aria-label="Water breakdown"><button type="button" role="tab" aria-selected="${state.breakdown === "use"}" class="${state.breakdown === "use" ? "is-selected" : ""}" data-action="breakdown" data-value="use">By use</button><button type="button" role="tab" aria-selected="${state.breakdown === "time"}" class="${state.breakdown === "time" ? "is-selected" : ""}" data-action="breakdown" data-value="time">By time</button></div><div class="utlt-kokonut-card"><div class="utlt-kokonut-card-head"><span>WATER BY ${state.breakdown.toUpperCase()}</span><strong>${number(total)} <small>L total</small></strong></div><svg class="utlt-kokonut-pie" viewBox="0 0 176 176" role="img" aria-label="Water usage by ${state.breakdown === "use" ? "activity" : "time of day"}, ${number(total)} litres total"><circle cx="88" cy="88" r="82" fill="var(--utlt-panel)"/>${sectors}</svg><ul class="utlt-kokonut-legend">${slices.map((slice) => `<li><span class="utlt-kokonut-swatch" style="background-color:${slice.color}"></span><span class="utlt-kokonut-legend-copy"><span>${escapeHtml(slice.label)}</span><strong>${number(slice.litres)} L</strong></span></li>`).join("")}</ul></div><p class="utlt-ai-note">UTLT is AI. It can make mistakes.</p></section>`;
  }

  function weekly(summary) {
    const goal = Math.max(1, Number(state.goal) || 350);
    const scale = Math.max(goal, ...summary.daily.map((day) => day.litres), 1) * 1.08;
    const baseline = 144;
    const goalY = baseline - goal / scale * 112;
    const average = summary.daily.length ? summary.daily.reduce((sum, day) => sum + day.litres, 0) / summary.daily.length : 0;
    const bars = summary.daily.map((item, index) => {
      const [year, month, day] = item.date.split("-").map(Number);
      const label = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(year, month - 1, day));
      const x = 14 + index * 46;
      const height = Math.max(2, item.litres / scale * 112);
      const y = baseline - height;
      const latest = index === summary.daily.length - 1 ? " is-latest" : "";
      return `<g><rect class="utlt-trend-bar${latest}" x="${x}" y="${y}" width="31" height="${height}" rx="5"/><text class="utlt-trend-value${latest}" x="${x + 15.5}" y="${Math.max(14, y - 7)}" text-anchor="middle">${Math.round(item.litres)}</text><text class="utlt-trend-date" x="${x + 15.5}" y="164" text-anchor="middle">${label}</text></g>`;
    }).join("");
    return `<section class="utlt-week"><h2>See Across Days</h2><div class="utlt-trend-card"><div class="utlt-trend-head"><span>LAST ${summary.daily.length} DAYS</span><strong>Goal ${goal} L</strong></div><svg class="utlt-trend-plot" viewBox="0 0 300 175" role="img" aria-label="Water usage over the last ${summary.daily.length} days, daily goal ${goal} litres"><line class="utlt-trend-goal" x1="8" x2="292" y1="${goalY}" y2="${goalY}"/><line class="utlt-trend-baseline" x1="8" x2="292" y1="${baseline}" y2="${baseline}"/>${bars}</svg><div class="utlt-trend-footer"><span>Daily average</span><strong>${Math.round(average)} L</strong></div></div></section>`;
  }

  function dashboard() {
    const summary = window.UTLTData.summarize(state.readings);
    const syncLabel = state.syncStatus === "cloud" ? "☁️ Profile synced to Firebase" : state.syncStatus === "starting" ? "Connecting to Firebase…" : state.syncStatus === "error" ? "⚠️ Firebase save failed — saved on this device only" : "⚠️ Firebase unavailable — saved on this device only";
    return `<div class="utlt-dashboard">${usage(summary)}${status(summary)}${breakdown(summary)}${weekly(summary)}<p class="utlt-data-source">${state.usingDemo ? "Demo readings · Connect a device for live data" : "Device readings"}</p><p class="utlt-data-source" role="status">${syncLabel}</p></div>`;
  }

  function devicePage() {
    const connected = state.device.connected;
    const last = state.device.lastConnectedAt && !Number.isNaN(Date.parse(state.device.lastConnectedAt))
      ? new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(new Date(state.device.lastConnectedAt)) : "—";
    return `<section class="utlt-device-settings"><div class="utlt-device-card"><span class="utlt-device-icon ${connected ? "" : "is-off"}">${icon(connected ? "bluetooth" : "bluetoothOff", 27)}</span><div><strong>${connected ? "Device connected" : "No device paired"}</strong><span class="utlt-last-connected">Last connected at ${escapeHtml(last)}</span><p>${connected ? "Your water monitor is ready to send readings." : "The dashboard is showing demo readings. Pair a water monitor to show measurements from your home."}</p></div></div><button class="utlt-primary-button" data-action="pair">${connected ? "Manage your device" : "Pair your device"}</button><p class="utlt-device-help">Your monitor sends flow readings to UTLT over Wi-Fi. The ring and six-day chart use those readings. The daily breakdown uses readings labeled by activity; unlabeled water appears under Misc.</p></section>`;
  }

  function pairPage() {
    return "<section class=\"utlt-pair-page\">" +
      "<div class=\"utlt-pair-illustration\">" + icon("bluetooth", 34) + "</div>" +
      "<p class=\"utlt-eyebrow\">DEVICE SETUP</p>" +
      "<h1>Connect your water monitor</h1>" +
      "<p class=\"utlt-pair-intro\">When device connection is enabled, your monitor will send water readings to this dashboard.</p>" +
      "<div class=\"utlt-pair-notice\" role=\"status\"><strong>Device pairing is not available in this preview yet.</strong><span>You can still explore the dashboard using sample readings.</span></div>" +
      "<h2>What you’ll need</h2>" +
      "<ol class=\"utlt-pair-steps\">" +
      "<li><span>1</span><div><strong>A compatible water monitor</strong><small>Use a monitor designed to measure your home’s water flow.</small></div></li>" +
      "<li><span>2</span><div><strong>Your home Wi-Fi details</strong><small>The setup flow will guide you when device pairing is supported.</small></div></li>" +
      "<li><span>3</span><div><strong>A few minutes</strong><small>We’ll show the connection status here once pairing is available.</small></div></li></ol>" +
      "<button class=\"utlt-primary-button\" data-action=\"home\">Back to dashboard</button></section>";
  }

  function accountPage() {
    return `<section class="utlt-account"><div class="utlt-profile-card"><div class="utlt-avatar">${icon("user", 38)}</div><div><strong>${escapeHtml(state.name || "Your account")}</strong><span>UTLT account</span></div><span class="utlt-connected"><i></i> Active</span></div><form class="utlt-account-form" id="utlt-account-form"><div class="utlt-section-heading"><div><h2>Personal details</h2><p>Manage your profile and home settings.</p></div></div><label class="utlt-field">Full name<input name="name" value="${escapeHtml(state.name)}" autocomplete="name"></label><label class="utlt-field">Email address<input name="email" type="email" value="${escapeHtml(state.email)}" autocomplete="email"></label><label class="utlt-field">Home name<input name="homeName" value="${escapeHtml(state.homeName)}"></label><label class="utlt-field">Daily water goal <span class="utlt-input-wrap"><input name="goal" type="number" min="1" value="${escapeHtml(state.goal)}"><span>litres</span></span></label><button class="utlt-primary-button utlt-save-button" type="submit">${state.saved ? icon("check", 18) + " Saved" : "Save changes"}</button></form><p class="utlt-data-source" role="status">${state.syncStatus === "cloud" ? "☁️ Profile synced to Firebase" : state.syncStatus === "starting" ? "Connecting to Firebase…" : "⚠️ Firebase sync unavailable: " + escapeHtml(state.syncError || "Check Firebase setup")}</p><button class="utlt-settings-row" data-action="theme"><span class="utlt-settings-icon">${icon(state.dark ? "sun" : "moon", 19)}</span><span><strong>Appearance</strong><small>${state.dark ? "Dark mode" : "Light mode"}</small></span>${icon("chevron", 18)}</button><button class="utlt-settings-row" data-action="device"><span class="utlt-settings-icon">${icon(state.device.connected ? "bluetooth" : "bluetoothOff", 19)}</span><span><strong>Connected devices</strong><small>Manage your utility monitor</small></span>${icon("chevron", 18)}</button></section>`;
  }

  function nav() {
    return `<nav class="utlt-tabbar" aria-label="Main navigation"><button class="${state.screen === "home" ? "is-current" : ""}" data-action="home" aria-current="${state.screen === "home" ? "page" : "false"}"><span class="utlt-nav-icon">${icon("home", 24)}</span><span>Home</span></button><button class="${state.screen === "pair" ? "is-current" : ""}" data-action="pair" aria-current="${state.screen === "pair" ? "page" : "false"}"><span class="utlt-nav-icon">${icon("plus", 24)}</span><span>Devices</span></button><button class="${state.screen === "account" ? "is-current" : ""}" data-action="account" aria-current="${state.screen === "account" ? "page" : "false"}"><span class="utlt-tab-avatar">${icon("user", 18)}</span><span>Account</span></button></nav>`;
  }


  const tutorialSlides = [
    {
      title: "Your dashboard at a glance",
      body: "Your dashboard is where your usage summary and daily goal appear. In this preview, the working charts and sample readings are available for water only.",
      tip: "You can change your daily water goal in Account. Gas and electricity tracking are planned for a later version."
    },
    {
      title: "Understand your usage",
      body: "Use “By use” to see where water went, or “By time” to see when it was used. Scroll down to compare your recent days.",
      tip: "These charts currently use sample readings until a real monitor is connected."
    },
    {
      title: "Your controls are here",
      body: "Use Home for your dashboard, Devices to learn about connecting a monitor, and Account to edit your details or change appearance.",
      tip: "Gas and electricity tracking are not available in this preview yet."
    }
  ];

  function onboardingMarkup() {
    const overlayStyle = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(10,18,30,.62);";
    const panelStyle = "width:min(100%,420px);max-height:90dvh;overflow:auto;padding:26px;border-radius:22px;background:#fff;color:#17202b;box-shadow:0 20px 70px rgba(0,0,0,.28);font-family:Arial,sans-serif;";
    const labelStyle = "display:block;margin:18px 0 7px;font-size:13px;font-weight:700;";
    const inputStyle = "width:100%;height:46px;padding:0 13px;border:1px solid #cbd5e1;border-radius:11px;font:inherit;font-size:15px;box-sizing:border-box;";
    const primaryStyle = "width:100%;min-height:48px;margin-top:18px;border:0;border-radius:12px;background:#1688f8;color:#fff;font:inherit;font-weight:700;cursor:pointer;";
    const secondaryStyle = "width:100%;min-height:42px;margin-top:9px;border:0;background:transparent;color:#64748b;font:inherit;font-weight:600;cursor:pointer;";
    if (state.onboarding === "profile") {
      return `<div style="${overlayStyle}" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="utlt-welcome-title" style="${panelStyle}">
        <p style="margin:0 0 8px;color:#1688f8;font-size:11px;font-weight:800;letter-spacing:.13em;">WELCOME TO UTLT.AI</p>
        <h2 id="utlt-welcome-title" style="margin:0;font-size:27px;line-height:1.15;">Let’s set things up</h2>
        <p style="margin:9px 0 0;color:#64748b;font-size:14px;line-height:1.5;">A couple of quick details will help us personalise your dashboard.</p>
        <form id="utlt-welcome-form">
          <label for="utlt-welcome-name" style="${labelStyle}">What is your name?</label>
          <input id="utlt-welcome-name" name="name" type="text" maxlength="60" autocomplete="given-name" placeholder="Enter your name" required style="${inputStyle}">
          <fieldset style="margin:20px 0 0;padding:0;border:0;">
            <legend style="font-size:14px;font-weight:700;">What do you plan to save?</legend>
            <p style="margin:5px 0 10px;color:#64748b;font-size:12px;">Choose the utility you want to focus on first.</p>
            ${["Water","Gas","Electricity"].map((item,index) => `<label style="display:flex;align-items:center;gap:10px;margin:9px 0;padding:12px;border:1px solid #dbe3ec;border-radius:12px;font-size:14px;cursor:pointer;"><input type="radio" name="utility" value="${item}" ${index === 0 ? "checked" : ""} style="accent-color:#1688f8;width:17px;height:17px;">${item}</label>`).join("")}
          </fieldset>
          <button type="submit" style="${primaryStyle}">Continue</button>
        </form>
      </section></div>`;
    }
    if (state.onboarding === "tutorial") {
      const slide = tutorialSlides[state.tutorialStep];
      const final = state.tutorialStep === tutorialSlides.length - 1;
      return `<div style="${overlayStyle}" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="utlt-tutorial-title" style="${panelStyle}">
        <p style="margin:0 0 8px;color:#1688f8;font-size:11px;font-weight:800;letter-spacing:.13em;">QUICK TOUR · ${state.tutorialStep + 1} OF ${tutorialSlides.length}</p>
        <div aria-hidden="true" style="display:flex;gap:6px;margin:0 0 20px;">${tutorialSlides.map((_,i)=>`<span style="height:5px;flex:1;border-radius:99px;background:${i <= state.tutorialStep ? "#1688f8" : "#e2e8f0"}"></span>`).join("")}</div>
        <h2 id="utlt-tutorial-title" style="margin:0;font-size:25px;line-height:1.2;">${slide.title}</h2>
        <p style="margin:12px 0;color:#475569;font-size:15px;line-height:1.6;">${slide.body}</p>
        <p style="margin:16px 0 0;padding:12px;border-radius:11px;background:#eff6ff;color:#24527a;font-size:13px;line-height:1.5;">💡 ${slide.tip}</p>
        <button type="button" data-action="${final ? "onboarding-done" : "tutorial-next"}" style="${primaryStyle}">${final ? "Go to my dashboard" : "Next"}</button>
        <button type="button" data-action="tutorial-skip" style="${secondaryStyle}">Skip tutorial</button>
      </section></div>`;
    }
    return "";
  }

  function render(preserveScroll = false) {
    const previousScroll = preserveScroll ? root.querySelector(".utlt-content")?.scrollTop || 0 : 0;
    const compact = state.screen === "home" && state.utility !== "Water";
    const content = state.screen === "home"
      ? utilityTabs() + (state.utility === "Water" ? dashboard() : `<section class="utlt-unavailable-card"><div class="utlt-unavailable-icon">${icon("settings", 28)}</div><h2>${state.utility} tracking is coming later</h2><p>This preview currently includes water usage only. Your water dashboard is ready to explore.</p><button class="utlt-primary-button" data-action="utility" data-value="Water">View water dashboard</button></section>`)
      : state.screen === "device" ? devicePage()
      : state.screen === "account" ? accountPage()
      : pairPage();
    root.innerHTML = `<div class="utlt-app ${state.dark ? "utlt-dark" : ""}"><div class="utlt-phone ${state.screen === "pair" ? "utlt-pair" : compact ? "utlt-compact" : ""}">${header()}<main class="utlt-content">${content}</main>${nav()}</div></div>${onboardingMarkup()}`;
    const scroller = root.querySelector(".utlt-content");
    if (scroller) scroller.scrollTop = previousScroll;
  }

  root.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "tutorial-next") { state.tutorialStep = Math.min(state.tutorialStep + 1, tutorialSlides.length - 1); }
    else if (action === "tutorial-skip" || action === "onboarding-done") { state.onboarding = ""; }
    else if (action === "theme") { state.dark = !state.dark; persistProfile(); }
    else if (action === "utility") { state.utility = button.dataset.value; persistProfile(); }
    else if (action === "breakdown") { state.breakdown = button.dataset.value; persistProfile(); }
    else if (["home", "pair", "account", "device"].includes(action)) { state.screen = action; state.saved = false; }
    render(action === "theme" || action === "utility" || action === "breakdown");
  });
  root.addEventListener("submit", (event) => {
    if (event.target.id === "utlt-welcome-form") {
      event.preventDefault();
      const form = new FormData(event.target);
      state.name = String(form.get("name") || "").trim();
      state.utility = String(form.get("utility") || "Water");
      persistProfile();
      state.tutorialStep = 0;
      state.onboarding = "tutorial";
      render();
      return;
    }
    if (event.target.id !== "utlt-account-form") return;
    event.preventDefault();
    const form = new FormData(event.target);
    state.name = String(form.get("name") || "").trim();
    state.email = String(form.get("email") || "").trim();
    state.homeName = String(form.get("homeName") || "").trim();
    state.goal = Math.max(1, Number(form.get("goal")) || 350);
    persistProfile();
    state.saved = true;
    render(true);
  });

  // Integration surface for the future device bridge. Call these from your
  // Bluetooth/Wi-Fi adapter after receiving readings or connection updates.
  window.UTLT = Object.freeze({
    setReadings(readings) {
      if (!Array.isArray(readings)) throw new TypeError("Readings must be an array");
      state.readings = readings;
      state.usingDemo = false;
      render(true);
    },
    setDevice(device) {
      state.device = {
        connected: Boolean(device?.connected),
        lastConnectedAt: device?.lastConnectedAt || state.device.lastConnectedAt
      };
      render(true);
    },
    getState() {
      return { ...state, device: { ...state.device }, readings: [...state.readings] };
    }
  });
  initializePersistence();
})();
