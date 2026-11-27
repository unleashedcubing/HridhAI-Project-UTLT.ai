/* Team app code with AI-assisted development and debugging. */

(function () {
  "use strict";
  function clearLegacyAppData() {
    try {
      for (const key of Object.keys(localStorage)) if (key.startsWith("utlt-") || key.startsWith("UTLT")) localStorage.removeItem(key);
      for (const key of Object.keys(sessionStorage)) if (key.startsWith("utlt-") || key.startsWith("UTLT")) sessionStorage.removeItem(key);
    } catch (error) { console.warn("Could not clear all legacy UTLT browser data.", error); }
  }
  clearLegacyAppData();
  const standaloneDevice = location.hostname === "192.168.4.1";
  const pagesPreview = location.hostname.endsWith(".github.io");
  const bluefyPhone = /iPhone|iPad|iPod/i.test(navigator.userAgent) && Boolean(navigator.bluetooth?.requestDevice);
  const bleServiceUuid = "930a7d60-8489-4b31-9cc6-64ee5e809100";
  const bleReadingUuid = "930a7d60-8489-4b31-9cc6-64ee5e809101";
  const bleControlUuid = "930a7d60-8489-4b31-9cc6-64ee5e809102";
  const bleHistoryUuid = "930a7d60-8489-4b31-9cc6-64ee5e809103";
  const pairingKey = "waterMeterPairingV1";
  const legacyCalibrationKey = "waterMeterCalibrationV1";
  const calibrationKey = "waterMeterBenchCalibrationV1";
  const directReadingsKey = "waterMeterReadingsV1";
  const languageKey = "waterAppLanguageV1";
  const calibrationVolumeLitres = 0.160;
  const calibrationDurationSeconds = 40;
  const defaultPulseRate = 12;
  const grantedDeviceKey = "waterMeterGrantedBluetoothV1";
  const demoKey = "waterMeterDemoEnabledV1";
  const surveyKey = "waterSurveyV1";
  const niroStudyKey = "niroWaterStudyV1";
  const niroSetupKey = "niroWaterSetupV1";
  const reviewKey = "waterReviewedDaysV1";
  const labelsKey = "waterConfirmedLabelsV1";
  const correctionsKey = "waterModelCorrectionsV1";
  const lastConnectedKey = "waterLastConnectedV1";
  const localProfileKey = "waterLocalProfileV1";
  let savedPairing = "";
  try { savedPairing = localStorage.getItem(pairingKey) || ""; } catch (_error) {  }
  function calibrationFactor(pulseRate) {
    const factor = pulseRate * calibrationDurationSeconds / calibrationVolumeLitres;
    return pulseRate >= 0.01 && factor <= 100000 ? factor : null;
  }
  let calibrationPulseRate = defaultPulseRate;
  let hasCustomCalibration = false;
  let legacyPulsesPerLitre = calibrationFactor(defaultPulseRate);
  try {
    const stored = Number(localStorage.getItem(legacyCalibrationKey));
    if (stored > 0 && Number.isFinite(stored)) legacyPulsesPerLitre = stored;
    const pulseRate = Number(JSON.parse(localStorage.getItem(calibrationKey) || "null")?.pulseRate);
    if (calibrationFactor(pulseRate)) {
      calibrationPulseRate = pulseRate;
      hasCustomCalibration = true;
    }
  } catch (_error) { }
  function convertReadings(readings, originalFactor, currentFactor) {
    if (!Array.isArray(readings)) return [];
    if (originalFactor === currentFactor) return readings;
    return readings.map(item => Number.isFinite(item?.litres)
      ? { ...item, litres: item.litres * originalFactor / currentFactor } : item);
  }
  function savedMeterReadings() {
    const factor = state.pulsesPerLitre;
    try {
      const saved = JSON.parse(localStorage.getItem(directReadingsKey) || "{}") || {};
      const originalFactor = Number(saved.pulsesPerLitre) || legacyPulsesPerLitre;
      return { ...saved, readings: convertReadings(saved.readings, originalFactor, factor), pulsesPerLitre: factor };
    } catch (_error) {
      return { readings: [], pulsesPerLitre: factor };
    }
  }
  let demoEnabled = false, savedNiroSetup = null, savedNiroStudy = null;
  let savedSurvey = null, reviewedDays = [], confirmedLabels = {}, corrections = [], lastConnected = null, savedLocalProfile = null;
  try {
    demoEnabled = localStorage.getItem(demoKey) === "true";
    savedNiroSetup = JSON.parse(localStorage.getItem(niroSetupKey) || "null");
    savedNiroStudy = JSON.parse(localStorage.getItem(niroStudyKey) || "null");
    savedSurvey = JSON.parse(localStorage.getItem(surveyKey) || "null");
    reviewedDays = JSON.parse(localStorage.getItem(reviewKey) || "[]");
    confirmedLabels = JSON.parse(localStorage.getItem(labelsKey) || "{}");
    corrections = JSON.parse(localStorage.getItem(correctionsKey) || "[]");
    const savedConnection = JSON.parse(localStorage.getItem(lastConnectedKey) || "null");
    if (savedConnection?.qrId === savedPairing) lastConnected = savedConnection.at;
    savedLocalProfile = JSON.parse(localStorage.getItem(localProfileKey) || "null");
  } catch (_error) {  }
  function localAppearance() {
    try { return localStorage.getItem("waterAppearanceV1") === "dark"; }
    catch (_error) { return false; }
  }
  function saveAppearance(dark) {
    state.dark = dark;
    try { localStorage.setItem("waterAppearanceV1", dark ? "dark" : "light"); } catch (_error) { }
    persistProfile();
  }
  const state = {
    screen: "home",
    niroStudy: { daily: savedNiroStudy?.daily || {}, answers: savedNiroStudy?.answers || {} },
    niroStudyStart: savedNiroSetup?.startedAt || "",
    niroSetupDone: savedNiroSetup?.done === true,
    niroGoalDraft: null, niroSetupBusy: false,
    niroMessages: [], // Session only. Keep chat out of storage and cloud sync.
    tourStep: 0,
    utility: "Water",
    breakdown: "use",
    dark: localAppearance(),
    name: typeof savedLocalProfile?.name === "string" ? savedLocalProfile.name : "",
    email: "",
    homeName: typeof savedLocalProfile?.homeName === "string" ? savedLocalProfile.homeName : "My home",
    goal: Number(savedLocalProfile?.goal) > 0 ? Number(savedLocalProfile.goal) : Number(savedNiroSetup?.goal) || 350,
    saved: false,
    device: { connected: false, lastConnectedAt: lastConnected },
    pairedDeviceId: /^[0-9a-f]{12}$/.test(savedPairing) ? savedPairing : "",
    pairStatus: "",
    qrScanning: false,
    flowRateLpm: null,
    flowWarning: "",
    flowStartedAt: null,
    flowRunningMinutes: 0,
    rawPulseCount: null,
    pulseRateHz: null,
    pulsesPerLitre: calibrationFactor(calibrationPulseRate),
    calibrationStatus: "",
    currentMeterSession: "",
    bridgeAvailable: false,
    readings: demoEnabled ? window.UTLTData.demoReadings : [],
    usingDemo: true,
    demoEnabled,
    demoMode: "sample",
    demoScenario: null,
    demoPhase: 0,
    demoMessages: [],
    survey: savedSurvey,
    reviewedDays,
    confirmedLabels,
    corrections,
    historyStatus: "",
    unknownPulses: 0,
    llmReady: false, llmBusy: false, llmStatus: "", llmQuestion: "", assistantMode: "today",
    syncStatus: savedLocalProfile ? "local" : "starting",
    syncError: "",
    uid: "", friendCode: "", friends: [], friendRequests: [], friendStats: [],
    leaderboardVisible: false, communitySharing: false,
    communityPercentile: null, communityParticipants: 0, communityStatus: "off", friendMessage: "", friendBusy: false,
    family: null, familyInviteUrl: "", familyRequests: [], familyMessage: "", familyBusy: false, pendingFamilyInvite: "", language: "en", languageMenuOpen: false,
    authProvider: savedLocalProfile ? "local" : "signed-out", authBusy: false, authMessage: "", pendingAuthScreen: ""
  };
  const firebaseReady = (async () => {
    if (bluefyPhone) return null;
    if (standaloneDevice) throw new Error("Cloud account features need internet; water tracking works offline.");
    const version = "13.2.0";
    const [appSdk, authSdk, firestoreSdk] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/" + version + "/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/" + version + "/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/" + version + "/firebase-firestore.js")
    ]);
    const firebaseConfig = {
    apiKey: "AIzaSyAvYOPq7VmZzy2aReQaF8OE0ezQn_LEMwM",
    authDomain: "utlt-ai1.firebaseapp.com",
    projectId: "utlt-ai1",
    storageBucket: "utlt-ai1.firebasestorage.app",
    messagingSenderId: "824195452987",
    appId: "1:824195452987:web:184170a778e9edec1d0c1e",
    measurementId: "G-H5HNX08WJJ"
  };
    const firebaseApp = appSdk.initializeApp(firebaseConfig);
    const auth = authSdk.getAuth(firebaseApp);
    try {
      await authSdk.setPersistence(auth, authSdk.browserLocalPersistence);
    } catch (storageError) {
      console.warn("Local auth persistence is unavailable; trying a shorter-lived session.", storageError);
      try { await authSdk.setPersistence(auth, authSdk.browserSessionPersistence); }
      catch (sessionError) {
        console.warn("Session persistence is unavailable; using in-memory sign-in for this tab.", sessionError);
        await authSdk.setPersistence(auth, authSdk.inMemoryPersistence);
      }
    }
    await auth.authStateReady();
    const db = firestoreSdk.getFirestore(firebaseApp);
    return { auth, authSdk, firestoreSdk, db };
  })();

  function createFirebaseStore(user, context) {
    const { auth, authSdk, firestoreSdk, db } = context;
    const uid = user.uid;
    const profileRef = firestoreSdk.doc(db, "profiles", uid);
    return {
      uid,
      get authProvider() { return "google"; },
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
      async sendFriendRequest(recipientUid, recipientName, senderName, recipientCode) {
        const requestId = uid + "_" + recipientUid;
        const requestRef = firestoreSdk.doc(db, "friendRequests", requestId);
        const existing = await firestoreSdk.getDoc(requestRef);
        if (existing.exists()) {
          const data = existing.data();
          if (data.status === "pending") throw new Error("A friend request is already pending.");
          if (data.status === "accepted") throw new Error("You are already friends.");
          await firestoreSdk.updateDoc(requestRef, { status: "pending", createdAt: new Date().toISOString() });
          return;
        }
        const reverseId = recipientUid + "_" + uid;
        const reverse = await firestoreSdk.getDoc(firestoreSdk.doc(db, "friendRequests", reverseId));
        if (reverse.exists() && reverse.data().status === "pending") throw new Error("This person has already sent you a request. Check incoming requests.");
        await firestoreSdk.setDoc(requestRef, {
          senderUid: uid, recipientUid, recipientCode, senderName: senderName || "UTLT user",
          recipientName: recipientName || "UTLT user", status: "pending", createdAt: new Date().toISOString()
        });
      },
      async loadFriendRequests() {
        const ref = firestoreSdk.collection(db, "friendRequests");
        const [incoming, outgoing] = await Promise.all([
          firestoreSdk.getDocs(firestoreSdk.query(ref, firestoreSdk.where("recipientUid", "==", uid))),
          firestoreSdk.getDocs(firestoreSdk.query(ref, firestoreSdk.where("senderUid", "==", uid)))
        ]);
        return {
          incoming: incoming.docs.filter(s => s.data().status === "pending").map(s => ({ id: s.id, ...s.data() })),
          outgoing: outgoing.docs.filter(s => s.data().status === "pending").map(s => ({ id: s.id, ...s.data() }))
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
        const ownEdge = await firestoreSdk.getDoc(firestoreSdk.doc(db, "friendships", uid + "_" + friendUid));
        const requestId = ownEdge.exists() ? ownEdge.data().requestId : "";
        const batch = firestoreSdk.writeBatch(db);
        batch.delete(firestoreSdk.doc(db, "friendships", uid + "_" + friendUid));
        batch.delete(firestoreSdk.doc(db, "friendships", friendUid + "_" + uid));
        await batch.commit();
        if (requestId) await firestoreSdk.deleteDoc(firestoreSdk.doc(db, "friendRequests", requestId));
      },
      async loadFriendStats(friendUid) {
        const snap = await firestoreSdk.getDoc(firestoreSdk.doc(db, "friendStats", friendUid));
        return snap.exists() ? snap.data() : null;
      },
      async publishStats(stats) {
        await firestoreSdk.setDoc(firestoreSdk.doc(db, "friendStats", uid), stats, { merge: true });
      },
      async hideStats() {
        await firestoreSdk.deleteDoc(firestoreSdk.doc(db, "friendStats", uid));
      },
      async publishCommunityUsage(date, bucketIndex) {
        const aggregateRef = firestoreSdk.doc(db, "communityDaily", date);
        return firestoreSdk.runTransaction(db, async transaction => {
          const [profileSnap, aggregateSnap] = await Promise.all([
            transaction.get(profileRef), transaction.get(aggregateRef)
          ]);
          const profile = profileSnap.exists() ? profileSnap.data() : {};
          const previousDate = profile.communityShareDate || "";
          const previousBucket = Number.isInteger(profile.communityShareBucket) ? profile.communityShareBucket : -1;
          const bucketCounts = aggregateSnap.exists() && aggregateSnap.data().bucketCounts
            ? { ...aggregateSnap.data().bucketCounts } : {};
          for (let i = 0; i < 11; i++) bucketCounts["b" + i] = Math.max(0, Number(bucketCounts["b" + i]) || 0);
          if (previousDate === date && previousBucket === bucketIndex) return bucketCounts;
          if (previousDate === date && previousBucket >= 0 && previousBucket < 11) {
            bucketCounts["b" + previousBucket] = Math.max(0, bucketCounts["b" + previousBucket] - 1);
          }
          bucketCounts["b" + bucketIndex] += 1;
          transaction.set(aggregateRef, { date, bucketCounts, updatedAt: new Date().toISOString() });
          transaction.set(profileRef, {
            communitySharing: true, communityShareDate: date, communityShareBucket: bucketIndex
          }, { merge: true });
          return bucketCounts;
        });
      },
      async withdrawCommunityUsage(date) {
        const aggregateRef = firestoreSdk.doc(db, "communityDaily", date);
        return firestoreSdk.runTransaction(db, async transaction => {
          const [profileSnap, aggregateSnap] = await Promise.all([
            transaction.get(profileRef), transaction.get(aggregateRef)
          ]);
          const profile = profileSnap.exists() ? profileSnap.data() : {};
          const bucketCounts = aggregateSnap.exists() && aggregateSnap.data().bucketCounts
            ? { ...aggregateSnap.data().bucketCounts } : {};
          for (let i = 0; i < 11; i++) bucketCounts["b" + i] = Math.max(0, Number(bucketCounts["b" + i]) || 0);
          const previousBucket = Number.isInteger(profile.communityShareBucket) ? profile.communityShareBucket : -1;
          if (profile.communityShareDate === date && previousBucket >= 0 && previousBucket < 11) {
            bucketCounts["b" + previousBucket] = Math.max(0, bucketCounts["b" + previousBucket] - 1);
            transaction.set(aggregateRef, { date, bucketCounts, updatedAt: new Date().toISOString() });
          }
          transaction.set(profileRef, {
            communitySharing: false, communityShareDate: "", communityShareBucket: -1
          }, { merge: true });
          return bucketCounts;
        });
      },
      async loadCommunityUsage(date) {
        const snap = await firestoreSdk.getDoc(firestoreSdk.doc(db, "communityDaily", date));
        return snap.exists() ? snap.data() : null;
      },

      async loadFamily() {
        const accepted = firestoreSdk.query(firestoreSdk.collection(db, "familyJoinRequests"),
          firestoreSdk.where("requesterUid", "==", uid));
        const joined = await firestoreSdk.getDocs(accepted);
        const acceptedRequests = joined.docs.filter(d => d.data().status === "accepted");
        if (acceptedRequests.length) {
          const familyId = acceptedRequests[acceptedRequests.length - 1].data().familyId;
          const joinedRef = firestoreSdk.doc(db, "families", familyId);
          const joinedSnap = await firestoreSdk.getDoc(joinedRef);
          if (joinedSnap.exists() && joinedSnap.data().memberUids.includes(uid)) return { id: joinedSnap.id, ...joinedSnap.data() };
        }
        const ref = firestoreSdk.doc(db, "families", uid), snap = await firestoreSdk.getDoc(ref);
        if (snap.exists()) return { id: snap.id, ...snap.data() };
        const data = { ownerUid: uid, familyName: state.homeName || "My family", memberUids: [uid], displayNames: { [uid]: state.name || "Family owner" }, createdAt: new Date().toISOString() };
        await firestoreSdk.setDoc(ref, data); return { id: uid, ...data };
      },
      async createFamilyInvite() {
        const bytes = new Uint8Array(18); crypto.getRandomValues(bytes);
        const token = Array.from(bytes, b => b.toString(16).padStart(2,"0")).join("");
        await firestoreSdk.setDoc(firestoreSdk.doc(db,"familyInvites",token), { familyId: state.family.id, ownerUid: uid, ownerName: state.name || "Family owner", expiresAt: Date.now()+600000, createdAt: new Date().toISOString() });
        return { token, url: location.origin + location.pathname + "?familyInvite=" + token };
      },
      async getFamilyInvite(token) { const s=await firestoreSdk.getDoc(firestoreSdk.doc(db,"familyInvites",token)); return s.exists() && s.data().expiresAt >= Date.now() ? s.data() : null; },
      async requestFamilyJoin(token, invite) {
        await firestoreSdk.setDoc(firestoreSdk.doc(db,"familyJoinRequests",token+"_"+uid), { familyId:invite.familyId, inviteToken:token, ownerUid:invite.ownerUid, requesterUid:uid, requesterName:state.name||"UTLT member", status:"pending", createdAt:new Date().toISOString() });
      },
      async loadFamilyRequests(id) {
        const q=firestoreSdk.query(firestoreSdk.collection(db,"familyJoinRequests"),firestoreSdk.where("familyId","==",id));
        const s=await firestoreSdk.getDocs(q); return s.docs.filter(d=>d.data().status==="pending").map(d=>({id:d.id,...d.data()}));
      },
      async decideFamilyRequest(req, accept) {
        const fr=firestoreSdk.doc(db,"families",req.familyId), rr=firestoreSdk.doc(db,"familyJoinRequests",req.id);
        await firestoreSdk.runTransaction(db,async tx=>{const [fs,rs]=await Promise.all([tx.get(fr),tx.get(rr)]); if(!fs.exists()||!rs.exists()||fs.data().ownerUid!==uid||rs.data().status!=="pending") throw new Error("Request is no longer available."); if(accept&&!fs.data().memberUids.includes(req.requesterUid)) tx.update(fr,{memberUids:[...fs.data().memberUids,req.requesterUid],displayNames:{...(fs.data().displayNames||{}),[req.requesterUid]:req.requesterName||"Family member"},updatedAt:new Date().toISOString()}); tx.update(rr,{status:accept?"accepted":"declined",updatedAt:new Date().toISOString()});});
      },
      async publishFamilyUsage(familyId,date,litres) {
        if(state.usingDemo)return;
        await firestoreSdk.setDoc(firestoreSdk.doc(db,"familyUsage",familyId+"_"+uid+"_"+date),{familyId,uid,displayName:state.name||"Family member",date,litres:Number(litres.toFixed(1)),updatedAt:new Date().toISOString()});
      },
      async loadFamilyUsage(familyId,date) {
        const q=firestoreSdk.query(firestoreSdk.collection(db,"familyUsage"),firestoreSdk.where("familyId","==",familyId));
        const s=await firestoreSdk.getDocs(q); return s.docs.filter(d=>d.data().date===date).map(d=>({id:d.id,...d.data()}));
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
  }

  let firebaseStore = null;
  let firebaseContext = null;
  let authAttempt = 0;
  let saveQueue = Promise.resolve();
  function profileSnapshot() {
    return {
      name: state.name, email: state.email, utility: state.utility,
      dark: state.dark, homeName: state.homeName, goal: state.goal,
      breakdown: state.breakdown, leaderboardVisible: state.leaderboardVisible, communitySharing: state.communitySharing, language: state.language
    };
  }
  function persistProfile() {
    const profile = profileSnapshot();
    if (firebaseStore) {
      saveQueue = saveQueue.then(() => firebaseStore.saveProfile(profile))
        .then(() => { state.syncStatus = "cloud"; state.syncError = ""; })
        .catch((error) => {
          state.syncStatus = "error";
          state.syncError = error?.message || "Cloud save failed";
          console.error("UTLT Firebase save failed.", error);
          render(true);
        });
    } else {
      if (state.authProvider === "local") {
        try { localStorage.setItem(localProfileKey, JSON.stringify({ name: state.name, homeName: state.homeName, goal: state.goal })); }
        catch (error) { console.warn("Could not save this phone's profile.", error); }
      }
      state.syncStatus = state.authProvider === "local" ? "local" : "guest";
      state.syncError = "";
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
    if (isAppLanguage(profile.language)) state.language = profile.language;
    state.leaderboardVisible = profile.leaderboardVisible === true;
    state.communitySharing = profile.communitySharing === true;
  }
  // Sign-in follows device pairing.
  function renderAuthGate(errorMessage = "") {
    state.screen = "auth";
    const localAvailable = bluefyPhone && Boolean(state.pairedDeviceId);
    const destination = state.pendingAuthScreen || "this feature";
    const featureName = destination === "family" ? "Family Connect" : destination === "account" ? "your account" : "device setup";
    const message = errorMessage || state.authMessage || (bluefyPhone ? "Pair your device to start setup on this iPhone." : `Sign in with Google to continue ${featureName}.`);
    root.innerHTML = `<div class="utlt-app ${state.dark ? "utlt-dark" : ""}"><main class="utlt-auth-screen">
      <section class="utlt-auth-card">
        <div class="utlt-auth-top"><strong>UTLT.ai</strong><button type="button" data-action="auth-theme" aria-label="Switch to ${state.dark ? "light" : "dark"} mode">${icon(state.dark ? "sun" : "moon", 22)}</button></div>
        <div class="utlt-auth-mark" aria-hidden="true">${icon("droplet", 31)}</div>
        <p class="utlt-eyebrow">UTLT.AI · SMART WATER</p>
        <h1>Welcome to UTLT.ai</h1>
        <p class="utlt-auth-intro">Your water, clearly understood.</p>
        <div class="utlt-auth-feature">${icon("shield", 20)}<span>${bluefyPhone ? "Your water readings stay in Bluefy on this iPhone." : "Sign in to save your household readings."}</span></div>
        ${bluefyPhone ? `<button class="utlt-primary-button utlt-auth-google" type="button" data-action="${localAvailable ? "continue-local" : "pair"}">${localAvailable ? "Continue on this phone" : "Pair your device"}</button><p class="utlt-auth-note">No Google sign-in or cloud account is needed in Bluefy. Family sharing is unavailable in this mode.</p>` : `<button class="utlt-primary-button utlt-auth-google" type="button" data-action="login-google" ${state.authBusy ? "disabled" : ""}>${state.authBusy ? "Connecting…" : "Continue with Google"}</button>`}
        <p class="utlt-auth-message" role="status">${escapeHtml(message)}</p>
        <button class="utlt-secondary-button" type="button" data-action="${state.pairedDeviceId ? "pair" : "home"}">${state.pairedDeviceId ? "Back to pairing" : "Back to Home"}</button>
      </section></main></div>`;
  }

  function continueLocally() {
    authAttempt += 1;
    if (firebaseContext?.auth.currentUser) firebaseContext.authSdk.signOut(firebaseContext.auth).catch(error => console.warn("Could not close the Google session.", error));
    firebaseStore = null;
    state.uid = "";
    state.authProvider = "local";
    state.authBusy = false;
    state.name = state.name || "My household";
    state.email = "";
    state.pendingAuthScreen = "";
    state.screen = "home";
    persistProfile();
    render();
  }

  async function completeGoogleLogin(user) {
    const attempt = authAttempt;
    firebaseStore = createFirebaseStore(user, firebaseContext);
    state.uid = firebaseStore.uid;
    state.authProvider = "google";
    state.email = user.email || "";
    state.name = user.displayName || "";
    let remoteProfile = null;
    let profileSynced = true;
    try {
      remoteProfile = await Promise.race([
        firebaseStore.loadProfile(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Cloud profile timed out")), 8000))
      ]);
      if (attempt !== authAttempt) return;
      if (remoteProfile) applySavedProfile(remoteProfile);
      else firebaseStore.saveProfile(profileSnapshot()).catch(error => console.warn("Could not save the new cloud profile yet.", error));
    } catch (error) {
      profileSynced = false;
      console.warn("Google signed in, but the cloud profile is unavailable.", error);
    }
    if (attempt !== authAttempt) return;
    if (user.email) state.email = user.email;
    if (!state.name && user.displayName) state.name = user.displayName;
    try { localStorage.removeItem(localProfileKey); } catch (_error) {  }
    state.pendingFamilyInvite = new URLSearchParams(location.search).get("familyInvite") || state.pendingFamilyInvite || "";
    const destination = state.pendingAuthScreen || (state.screen === "auth" ? "home" : state.screen);
    state.pendingAuthScreen = "";
    state.screen = destination;
    if (destination === "family") {
      state.family = await firebaseStore.loadFamily();
      await refreshFamilyData();
      await syncFamilyUsage();
    }
    syncCommunityInsight().catch(error => console.warn("Community sync is unavailable.", error));
    state.syncStatus = profileSynced ? "cloud" : "error";
    state.syncError = profileSynced ? "" : "Google is connected; cloud profile sync can be retried later.";
    render();
  }

  async function refreshFamilyData() {
    if(!firebaseStore||!state.family||state.family.ownerUid!==state.uid)return;
    try{state.familyRequests=await firebaseStore.loadFamilyRequests(state.family.id);}catch(e){state.familyMessage=e.message||"Could not load family requests.";}
  }
  async function syncFamilyUsage() {
    if(!firebaseStore||!state.family||state.usingDemo)return;
    const date=todayKey(), used=state.readings.filter(x=>typeof x.recordedAt==="string"&&x.recordedAt.startsWith(date)&&Number.isFinite(x.litres)&&x.litres>=0).reduce((s,x)=>s+x.litres,0);
    try{await firebaseStore.publishFamilyUsage(state.family.id,date,used);}catch(e){console.warn("Family usage sync failed.",e);}
  }
  async function signInWithGoogle() {
    if (bluefyPhone) { continueLocally(); return; }
    if (state.authBusy) return;
    const attempt = ++authAttempt;
    state.authBusy = true; state.authMessage = "Connecting to Google…"; renderAuthGate();
    try {
      firebaseContext = firebaseContext || await firebaseReady;
      const { auth, authSdk } = firebaseContext;
      const provider = new authSdk.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      let user;
      const currentUser = auth.currentUser;
      if (currentUser && currentUser.providerData?.some(item => item.providerId === "google.com")) user = currentUser;
      else if (currentUser?.isAnonymous) {
        try { user = (await authSdk.linkWithPopup(currentUser, provider)).user; }
        catch (error) {
          if (error.code !== "auth/credential-already-in-use") throw error;
          await authSdk.signOut(auth);
          user = (await authSdk.signInWithPopup(auth, provider)).user;
        }
      } else user = (await authSdk.signInWithPopup(auth, provider)).user;
      if (attempt !== authAttempt) return;
      state.authBusy = false;
      await completeGoogleLogin(user);
    } catch (error) {
      if (attempt !== authAttempt) return;
      state.authMessage = error?.message || "Google sign-in could not be completed.";
      state.authBusy = false; renderAuthGate(state.authMessage); return;
    }
    state.authBusy = false;
  }

  async function initializePersistence() {
    render();
    if (bluefyPhone) return;
    try {
      firebaseContext = await firebaseReady;
      const user = firebaseContext.auth.currentUser;
      if (!bluefyPhone && state.authProvider !== "local" && user && user.providerData?.some(item => item.providerId === "google.com")) await completeGoogleLogin(user);
      else {
        state.pendingFamilyInvite = new URLSearchParams(location.search).get("familyInvite") || "";
        if (state.screen !== "auth") render();
      }
    } catch (error) {
      state.syncStatus = state.authProvider === "local" ? "local" : "guest";
      state.syncError = "";
      console.error("UTLT Firebase is unavailable; guest dashboard remains usable.", error);
      if (state.screen !== "auth") render();
    }
  }

  async function signOutOfApp() {
    if (state.authProvider === "local") {
      try { localStorage.removeItem(localProfileKey); } catch (_error) {  }
    } else if (firebaseContext) {
      await firebaseContext.authSdk.signOut(firebaseContext.auth);
    }
    firebaseStore = null; state.uid = ""; state.name = ""; state.email = ""; state.friendCode = "";
    state.niroMessages = [];
    state.family = null; state.familyRequests = []; state.familyInviteUrl = ""; state.pendingAuthScreen = "";
    state.friends = []; state.friendRequests = []; state.friendStats = []; state.authProvider = "signed-out";
    state.screen = "home"; state.syncStatus = "guest"; render();
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
    chevron: '<path d="M9 6l6 6l-6 6"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    trophy: '<path d="M8 21h8m-4-4v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v2a4 4 0 0 0 4 4m9-6h3v2a4 4 0 0 1-4 4"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
    alert: '<path d="M12 9v4"/><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0"/><path d="M12 16h.01"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><ellipse cx="12" cy="12" rx="4" ry="9"/>',
    graph: '<path d="M3 4v16h18M7 15l4-5 4 2 5-6"/>',
    flame: '<path d="M12 12c2 -2.96 0 -7 -1 -8c0 3.038 -1.773 4.741 -3 6c-1.226 1.26 -2 3.24 -2 5a6 6 0 1 0 12 0c0 -1.532 -1.056 -3.94 -2 -5c-1.786 3 -2.791 3 -4 2z"/>',
    bolt: '<path d="M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11"/>',
    droplet: '<path d="M7.502 19.423c2.602 2.105 6.395 2.105 8.996 0c2.602 -2.105 3.262 -5.708 1.566 -8.546l-4.89 -7.26c-.42 -.625 -1.287 -.803 -1.936 -.397a1.376 1.376 0 0 0 -.41 .397l-4.893 7.26c-1.695 2.838 -1.035 6.441 1.567 8.546z"/>',
    trendDown: '<path d="M3 7l6 6l4 -4l8 8"/><path d="M21 10l0 7l-7 0"/>',
    trendUp: '<path d="M3 17l6 -6l4 4l8 -8"/><path d="M14 7l7 0l0 7"/>'
  };
  function icon(name, size = 24) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
  }

  const indianLanguages = [
    { code: "as", label: "অসমীয়া · Assamese" },
    { code: "bn", label: "বাংলা · Bengali" },
    { code: "brx", label: "बड़ो · Bodo" },
    { code: "doi", label: "डोगरी · Dogri" },
    { code: "gu", label: "ગુજરાતી · Gujarati" },
    { code: "hi", label: "हिन्दी · Hindi" },
    { code: "kn", label: "ಕನ್ನಡ · Kannada" },
    { code: "ks", label: "कॉशुर · Kashmiri" },
    { code: "kok", label: "कोंकणी · Konkani" },
    { code: "mai", label: "मैथिली · Maithili" },
    { code: "ml", label: "മലയാളം · Malayalam" },
    { code: "mni", label: "মৈতৈলোন্ · Manipuri" },
    { code: "mr", label: "मराठी · Marathi" },
    { code: "ne", label: "नेपाली · Nepali" },
    { code: "or", label: "ଓଡ଼ିଆ · Odia" },
    { code: "pa", label: "ਪੰਜਾਬੀ · Punjabi" },
    { code: "sa", label: "संस्कृतम् · Sanskrit" },
    { code: "sat", label: "ᱥᱟᱱᱛᱟᱲᱤ · Santali" },
    { code: "sd", label: "سنڌي · Sindhi" },
    { code: "ta", label: "தமிழ் · Tamil" },
    { code: "te", label: "తెలుగు · Telugu" },
    { code: "ur", label: "اردو · Urdu" }
  ];
  function isAppLanguage(code) {
    return code === "en" || indianLanguages.some(item => item.code === code);
  }
  try {
    const savedLanguage = localStorage.getItem(languageKey);
    if (isAppLanguage(savedLanguage)) state.language = savedLanguage;
  } catch (_error) { }

  function languageSelector() {
    const selected = state.language === "en" ? { label: "English", code: "en" } : indianLanguages.find(item => item.code === state.language) || { label: "English", code: "en" };
    const options = [{ code: "en", label: "English" }, ...indianLanguages];
    return `<div class="utlt-language-picker">
      <button class="utlt-settings-row utlt-language-trigger" type="button" data-action="language-menu" aria-expanded="${state.languageMenuOpen === true}" aria-haspopup="menu">
        <span class="utlt-settings-icon">${icon("globe", 19)}</span>
        <span><strong>App Language</strong><small class="utlt-language-current">${selected.label}</small></span>
        ${icon(state.languageMenuOpen ? "chevronUp" : "chevronDown", 18)}
      </button>
      ${state.languageMenuOpen ? `<div class="utlt-language-popup" role="menu" aria-label="Choose app language">
        <div class="utlt-language-popup-heading"><strong>Choose a language</strong><span>23 languages</span></div>
        <div class="utlt-language-options">${options.map(item => `<button type="button" role="menuitemradio" aria-checked="${state.language === item.code}" class="utlt-language-option ${state.language === item.code ? "is-selected" : ""}" data-action="select-language" data-value="${item.code}"><span>${item.label}</span><span class="utlt-language-option-check">${state.language === item.code ? "✓" : ""}</span></button>`).join("")}</div>
      </div>` : ""}
    </div>`;
  }

  function header() {
    const title = state.screen === "account" ? "Account" : state.screen === "family" ? "Family" : state.screen === "pair" ? "Pair Your Device" : state.screen === "device" ? "Device Settings" : state.screen === "review" ? "Review Water Use" : state.screen === "assistant" ? "Niro" : state.screen === "help" ? "Help" : state.screen === "reports" ? state.utility + " reports" : state.name.trim() ? `${state.name.trim().split(" ")[0]}’s UTLT` : "UTLT.ai";
    const connection = state.screen === "home" ? `<span class="utlt-connection-icon ${state.device.connected ? "is-connected" : "is-disconnected"}" role="img" aria-label="Device ${state.device.connected ? "connected" : "disconnected"}">${icon(state.device.connected ? "bluetooth" : "bluetoothOff", 16)}</span>` : "";
    const last = state.screen === "home" && !state.device.connected && state.device.lastConnectedAt ? `<span class="utlt-header-last">Last connected ${escapeHtml(new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(state.device.lastConnectedAt)))}</span>` : "";
    let actions = "";
    if (state.screen === "home") actions = `<div class="utlt-header-actions"><button class="utlt-icon-button" data-action="device" aria-label="Device settings">${icon("settings")}</button></div>`;
    if (state.screen === "friends") actions = `<button class="utlt-icon-button" data-action="home" aria-label="Back to home">${icon("home")}</button>`;
    if (["account", "device", "review", "assistant", "help", "reports"].includes(state.screen)) actions = `<button class="utlt-icon-button" data-action="home" aria-label="Back to home">${icon("home")}</button>`;
    return `<header class="utlt-header"><div class="utlt-header-top"><div class="utlt-title"><span>${escapeHtml(title)}</span>${connection}</div>${last}${actions}</div></header>`;
  }

  function utilityTabs() {
    const utilities = ["Water", "Gas", "Electricity"];
    return `<div class="utlt-pills" role="tablist" aria-label="Utility type">${utilities.map(name => `<button class="utlt-pill ${state.utility === name ? "is-active" : ""}" role="tab" aria-selected="${state.utility === name}" data-action="utility" data-value="${name}">${name}</button>`).join("")}</div>`;
  }

  function utilityNotice() {
    return `${window.UTLTNiro.avatar()}<h2>${state.utility} monitoring isn’t enabled yet</h2>
      <p>When a ${state.utility.toLowerCase()} monitor is available, I’ll help you understand its readings.</p>`;
  }

  function utilityPreview() {
    return `<div class="utlt-dashboard"><section class="utlt-usage">${usageRing(state.utility)}</section></div>
      <section class="utlt-unavailable-card niro-utility"><p class="utlt-eyebrow">NIRO</p>${utilityNotice()}
      <button type="button" class="utlt-primary-button" data-action="niro">Open Niro</button></section>`;
  }

  // Clamp the ring and water level at the goal while leaving the measured total visible.
  function usageRing(utility, ratio = null) {
    const progress = Math.min(1, Math.max(0, ratio ?? 0));
    const percent = Math.round((ratio ?? 0) * 100);
    const warning = Math.max(0, (progress - 0.5) * 2) * 100;
    const label = ratio === null ? `No ${utility.toLowerCase()} reading today` : `${percent} percent of daily ${utility.toLowerCase()} goal used`;
    return `<div class="utlt-donut" style="--ring-warning:${warning}%">
      <svg viewBox="0 0 193 193" role="img" aria-label="${label}">
        <defs><linearGradient id="utlt-water-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"/><stop offset="100%"/>
        </linearGradient></defs>
        <circle class="utlt-donut-track" cx="96.5" cy="96.5" r="84"/>
        <circle class="utlt-donut-value" cx="96.5" cy="96.5" r="84" visibility="${progress ? "visible" : "hidden"}" style="stroke-dasharray:${progress * circumference} ${circumference}"/>
      </svg>
      <div class="utlt-donut-label"><strong>${ratio === null ? "—" : percent + "%"}</strong><span>${ratio === null ? "No reading" : "Used"}</span></div>
    </div>`;
  }

  function waterGoal() {
    return state.demoScenario?.goal ?? Math.max(1, Number(state.goal) || 350);
  }

  function waterClock() {
    return state.demoScenario?.now ?? new Date();
  }

  function usage(summary) {
    const goal = waterGoal();
    const hasToday = summary.daily.at(-1)?.hasData;
    const ratio = hasToday ? summary.used / goal : null;
    const level = Math.min(1, Math.max(0, ratio ?? 0));
    return `<section class="utlt-usage">${level ? `<div class="utlt-water-fill" style="transform:translateY(${(1 - level) * 100}%)" aria-hidden="true"></div>` : ""}
      ${usageRing("Water", ratio)}
      <div class="utlt-usage-summary"><strong>${hasToday ? number(summary.used) : "—"}</strong><span>/ ${goal} Litres</span></div>
    </section>`;
  }

  function status(summary) {
    if (!summary.daily.at(-1)?.hasData) return `<section class="utlt-status-card" aria-live="polite"><span class="utlt-status-check">${icon("droplet", 22)}</span><div><strong>Waiting for today’s first reading</strong><p>Your water goal is ready. UTLT will show today’s use when the meter detects flow.</p></div></section>`;
    const goal = waterGoal();
    const used = summary.used;
    const left = Math.max(0, goal - used);
    let tone = "on-track", iconName = "check", title = "You’re on track for today!";
    let text = `You still have ${number(left)} L available today. Keep up your usual routine.`;
    if (used > goal) {
      tone = "over-goal"; iconName = "alert"; title = "Above today’s goal";
      text = `${number(used - goal)} L above the goal you chose. Check what changed today; your water supply is never limited by UTLT.`;
    } else if (used / goal >= 0.8) {
      tone = "warning"; iconName = "alert"; title = "Close to your daily goal";
      text = `${number(left)} L remain against the goal you chose. UTLT will keep measuring as usual.`;
    }
    return `<section class="utlt-status-card is-${tone}" aria-live="polite"><span class="utlt-status-check">${icon(iconName, 22)}</span><div><strong>${title}</strong><p>${text}</p></div></section>`;
  }

  function greetingMarkup() {
    if (!state.device.connected) return "";
    const hour = new Date().getHours();
    const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const first = (state.name || "").trim().split(" ")[0];
    const today = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
    return `<div class="utlt-hero"><strong>${part}${first ? ", " + escapeHtml(first) : ""} 👋</strong><span>${today}</span></div>`;
  }

  function quickStats(summary) {
    const goal = waterGoal();
    const left = Math.max(0, goal - summary.used);
    const pace = window.UTLTAI.paceInsight(state.readings, waterClock());
    const comparison = pace.ready ? `<strong>${pace.tone === "usual" ? "≈" : pace.tone === "higher" ? "+" : "−"}${pace.tone === "usual" ? "usual" : number(Math.abs(pace.difference)) + " L"}</strong>` : "<strong>—</strong>";
    const trackedDays = summary.daily.slice(0, -1).filter(day => day.hasData);
    const within = trackedDays.filter(day => day.litres <= goal).length;
    const withinClass = trackedDays.length && within >= trackedDays.length / 2 ? " is-good" : "";
    return `<section class="utlt-quickstats" aria-label="Today at a glance"><div class="utlt-stat${summary.used > goal ? " is-bad" : ""}"><span class="utlt-stat-label">Left today</span><strong>${summary.daily.at(-1)?.hasData ? number(left) + " L" : "—"}</strong></div><div class="utlt-stat"><span class="utlt-stat-label">vs usual by now</span>${comparison}</div><div class="utlt-stat${withinClass}"><span class="utlt-stat-label">Prior days on goal</span><strong>${within}/${trackedDays.length}</strong></div></section>`;
  }

  function tipCard(summary) {
    const total = summary.byUse.reduce((sum, item) => sum + item.litres, 0);
    if (!total) return "";
    const top = summary.byUse.reduce((best, item) => item.litres > best.litres ? item : best, summary.byUse[0]);
    if (top.label === "Misc" && !state.demoEnabled) return `<section class="utlt-tip-card"><span class="utlt-tip-icon" aria-hidden="true">${icon("droplet", 20)}</span><div><strong>The activity is still unknown</strong><p>Your meter knows how much water passed through, but not which tap used it. If flow seems unexpected, check taps and the pump.</p></div></section>`;
    const tips = window.UTLTData.tips || {};
    const tip = tips[top.label] || tips.default;
    if (!tip) return "";
    const share = Math.round(top.litres / total * 100);
    return `<section class="utlt-tip-card"><span class="utlt-tip-icon" aria-hidden="true">${tip.emoji}</span><div><strong>${escapeHtml(top.label)} is ${share}% of today’s water</strong><p>${escapeHtml(tip.text)}</p></div></section>`;
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
      if (sweep <= 0) return "";
      if (sweep >= 359.999) return `<circle cx="88" cy="88" r="82" fill="${slice.color}"/>`;
      return `<path d="${sector(from, angle)}" fill="${slice.color}"/>`;
    }).join("");
    return `<section class="utlt-glance"><h2>A Glance at Your Day</h2><div class="utlt-breakdown-switch" role="tablist" aria-label="Water breakdown"><button type="button" role="tab" aria-selected="${state.breakdown === "use"}" class="${state.breakdown === "use" ? "is-selected" : ""}" data-action="breakdown" data-value="use">By use</button><button type="button" role="tab" aria-selected="${state.breakdown === "time"}" class="${state.breakdown === "time" ? "is-selected" : ""}" data-action="breakdown" data-value="time">By time</button></div><div class="utlt-kokonut-card utlt-scroll-reveal"><div class="utlt-kokonut-card-head"><span>WATER BY ${state.breakdown.toUpperCase()}</span><strong>${number(total)} <small>L total</small></strong></div><svg class="utlt-kokonut-pie" viewBox="0 0 176 176" role="img" aria-label="Water usage by ${state.breakdown === "use" ? "activity" : "time of day"}, ${number(total)} litres total"><circle cx="88" cy="88" r="82" fill="var(--utlt-panel)"/>${sectors}<circle class="utlt-pie-hole" cx="88" cy="88" r="52"/><text class="utlt-pie-total" x="88" y="91">${number(total)}</text><text class="utlt-pie-caption" x="88" y="107">LITRES</text></svg><ul class="utlt-kokonut-legend">${slices.map((slice) => `<li><span class="utlt-kokonut-swatch" style="background-color:${slice.color}"></span><span class="utlt-kokonut-legend-copy"><span>${escapeHtml(slice.label)} · ${total ? Math.round(slice.litres / total * 100) : 0}%</span><strong>${number(slice.litres)} L</strong></span></li>`).join("")}</ul></div><p class="utlt-ai-note">UTLT is AI. It can make mistakes.</p></section>`;
  }

  function weekly(summary) {
    const goal = waterGoal();
    const scale = Math.max(goal, ...summary.daily.map((day) => day.litres), 1) * 1.08;
    const baseline = 144;
    const goalY = baseline - goal / scale * 112;
    const trackedDays = summary.daily.filter(day => day.hasData);
    const average = trackedDays.length ? trackedDays.reduce((sum, day) => sum + day.litres, 0) / trackedDays.length : 0;
    const withinGoal = trackedDays.filter((day) => day.litres <= goal).length;
    const bars = summary.daily.map((item, index) => {
      const [year, month, day] = item.date.split("-").map(Number);
      const label = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(year, month - 1, day));
      const x = 10 + index * 41;
      const height = Math.max(2, item.litres / scale * 112);
      const y = baseline - height;
      const latest = index === summary.daily.length - 1 ? " is-latest" : "";
      return `<g><rect class="utlt-trend-bar${latest}${item.litres > goal ? " is-over" : ""}" x="${x}" y="${y}" width="29" height="${height}" rx="5"/><text class="utlt-trend-value${latest}" x="${x + 14.5}" y="${Math.max(14, y - 7)}" text-anchor="middle">${number(item.litres)}</text><text class="utlt-trend-date" x="${x + 14.5}" y="164" text-anchor="middle">${label}</text></g>`;
    }).join("");
    return `<section class="utlt-week utlt-scroll-reveal"><h2>See Across Days</h2><div class="utlt-trend-card"><div class="utlt-trend-head"><span>LAST ${summary.daily.length} DAYS</span><strong>Goal ${goal} L</strong></div><svg class="utlt-trend-plot" viewBox="0 0 300 175" role="img" aria-label="Water usage over the last ${summary.daily.length} days, daily goal ${goal} litres"><line class="utlt-trend-goal" x1="8" x2="292" y1="${goalY}" y2="${goalY}"/><line class="utlt-trend-baseline" x1="8" x2="292" y1="${baseline}" y2="${baseline}"/>${bars}</svg><div class="utlt-trend-footer"><span>Daily average</span><strong>${number(average)} L</strong></div><div class="utlt-trend-footer"><span>Days within goal</span><strong>${withinGoal} of ${trackedDays.length} measured</strong></div></div></section>`;
  }

  function reviewSessions() {
    if (!state.survey || !window.UTLTAI.reviewEligible(state.survey)) return [];
    return window.UTLTAI.sessions(state.readings, state.survey, window.UTLTAI.indiaDate(new Date()), state.corrections);
  }

  function learningCards() {
    if (state.usingDemo || !state.pairedDeviceId) return "";
    if (!state.survey) return "";
    const insight = window.UTLTAI.numericInsight(state.readings, state.survey);
    const dayIndex = window.UTLTNiro.firstWeekDay(window.UTLTAI.indiaDate(new Date()), state.niroStudyStart);
    const review = !(dayIndex >= 0 && dayIndex < 7) && !state.reviewedDays.includes(window.UTLTAI.indiaDate(new Date())) && reviewSessions().length;
    return `${review ? `<section class="utlt-learning-card"><p class="utlt-eyebrow">END-OF-DAY CHECK</p><h2>Help identify ${review} uncertain water period${review === 1 ? "" : "s"}</h2><p>Confirm only today's unclear readings. This check appears during your first seven days and on the first three days of each month.</p><button class="utlt-primary-button" data-action="review">Review today's use</button></section>` : ""}${insight?.average !== undefined ? `<section class="utlt-learning-card"><p class="utlt-eyebrow">YOUR SEVEN-DAY PATTERN</p><h2>${insight.average} L per day on average</h2><p>About ${insight.perPerson} L per person. A gentle goal based on your own week is ${insight.suggestedGoal} L/day. These are estimates from your meter, not a diagnosis of specific activities.</p></section>` : `<section class="utlt-learning-card"><p class="utlt-eyebrow">LEARNING YOUR ROUTINE</p><h2>${insight?.trackedDays || 0} of 7 days measured</h2><p>After seven days, UTLT will show your own average and suggest a daily goal.</p></section>`}`;
  }

  function runningWaterCard() {
    if (state.demoEnabled) {
      return state.demoScenario?.leak ? '<section class="utlt-running-card" role="status"><div><h2>Possible leak · demo</h2><p>The sample flow has continued for 16 minutes. Check taps and the pump in a real home.</p></div></section>' : "";
    }
    if (!state.device.connected || state.flowRunningMinutes < 16) return "";
    return `<section class="utlt-running-card" role="status"><span class="utlt-running-mark">${icon("droplet", 22)}</span><div><p class="utlt-eyebrow">CHECK YOUR WATER</p><h2>Water is still flowing</h2><p>The meter has seen continuous flow for about ${Math.floor(state.flowRunningMinutes)} minutes. Check taps and the pump. This could be normal use; the sensor cannot identify a leak.</p></div></section>`;
  }

  function recentUseCard() {
    const days = window.UTLTData.summarize(state.readings).daily.slice(0, -1).filter(day => day.hasData);
    if (days.length < 3) return `<div class="utlt-recent-card"><p class="utlt-eyebrow">YOUR RECENT WATER</p><h2>Learning from your measured days</h2><p>There are ${days.length} of 3 completed days with readings. Keep the monitor powered and reconnect to download its history.</p><small>Days without readings are not assumed to use zero water.</small></div>`;
    const average = days.reduce((sum, day) => sum + day.litres, 0) / days.length;
    const within = days.filter(day => day.litres <= waterGoal()).length;
    const first = days.slice(0, 3).reduce((sum, day) => sum + day.litres, 0) / 3;
    const last = days.slice(-3).reduce((sum, day) => sum + day.litres, 0) / 3;
    const trend = days.length >= 6 ? `The latest three measured days averaged ${number(last)} L, ${number(Math.abs(last - first))} L ${last >= first ? "above" : "below"} the first three.` : "A six-day trend will appear after more measured days.";
    return `<div class="utlt-recent-card"><p class="utlt-eyebrow">YOUR RECENT WATER</p><h2>${number(average)} L on a measured day</h2><p>Across ${days.length} completed days, ${within} stayed within your ${state.goal} L daily goal. ${trend}</p><div class="utlt-recent-stats"><div><strong>${days.length}</strong><span>days compared</span></div><div><strong>${within}/${days.length}</strong><span>within goal</span></div></div><small>${state.demoEnabled ? "Sample data · not measured in your home" : "Based on stored readings; disconnected hours may be missing"}</small></div>`;
  }

  function dailyFeedbackCard() {
    const forecast = window.UTLTAI.dailyForecast(state.readings, waterGoal(), waterClock());
    const source = state.demoEnabled ? "Sample data · not your household" : "Stored meter readings · disconnected hours may be missing";
    if (forecast.stage === "waiting") return `<div class="utlt-daily-feedback"><p class="utlt-eyebrow">TODAY'S OUTLOOK</p><h2>Waiting for the first use</h2><p>UTLT starts tracking when the meter records water flow. Your daily feedback appears six hours after that first reading.</p><small>${source}</small></div>`;
    const feedbackTime = forecast.feedbackAt.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
    const sixHours = forecast.stage === "feedback";
    let outlook = "Give the meter at least 30 minutes of readings before showing an evening estimate.";
    if (forecast.eveningPassed && forecast.byEvening === null) outlook = "The first water reading came after 8 pm, so there is no evening forecast for today.";
    else if (forecast.eveningPassed) outlook = forecast.byEvening > forecast.goal
      ? `By 8 pm, ${number(forecast.byEvening)} L was recorded, above your ${forecast.goal} L goal.`
      : `By 8 pm, ${number(forecast.byEvening)} L was recorded against your ${forecast.goal} L goal.`;
    else if (forecast.projected !== undefined) outlook = `At today's measured pace, about ${number(forecast.projected)} L could be used by 8 pm. That ${forecast.tone === "over" ? "could exceed" : "could stay within"} your ${forecast.goal} L goal.`;
    const heading = sixHours ? forecast.projected !== undefined && forecast.tone === "over" ? "Your pace may pass the goal" : "Your daily water check-in" : "Watching today's water pace";
    const lead = sixHours ? `Six hours have passed since the first flow. ${number(forecast.measured)} L is recorded so far.` : `${number(forecast.measured)} L recorded so far. Your full daily check-in starts at ${feedbackTime}.`;
    return `<div class="utlt-daily-feedback"><p class="utlt-eyebrow">${sixHours ? "SIX-HOUR CHECK-IN" : "TODAY'S OUTLOOK"}</p><h2>${heading}</h2><p>${lead}</p><div class="utlt-daily-projection"><span>${forecast.eveningPassed ? "Recorded by 8 pm" : "Estimated by 8 pm"}</span><strong>${forecast.eveningPassed ? forecast.byEvening === null ? "No reading" : number(forecast.byEvening) + " L" : forecast.projected === undefined ? "Gathering data" : number(forecast.projected) + " L"}</strong></div><p>${outlook}</p><small>${source}. Forecasts are rough and never limit your supply.</small><button type="button" data-action="forecast-follow-up">Ask about this ${icon("chevron", 16)}</button></div>`;
  }

  function assistantPage() {
    if (state.utility !== "Water") return utilityTabs() +
      `<section class="utlt-unavailable-card niro-utility"><h1>Niro</h1>${utilityNotice()}</section>`;
    if (state.assistantMode === "ask") {
      if (!state.llmReady) return niroDownloadPage();
      if (!state.niroSetupDone) return niroOnboardingPage();
    }
    const insight = window.UTLTAI.paceInsight(state.readings, waterClock());
    const evidence = insight.ready ? `Today is ${insight.tone === "usual" ? "near" : insight.tone} your usual pace by ${insight.clock}.` : insight.reason === "today" ? "Waiting for today's first water reading." : `${insight.measuredDays} of 3 earlier measured days available for a same-time comparison.`;
    const modes = `<div class="utlt-assistant-modes" role="tablist" aria-label="AI view"><button role="tab" aria-selected="${state.assistantMode === "today"}" class="${state.assistantMode === "today" ? "is-selected" : ""}" data-action="assistant-mode" data-mode="today">Today</button><button role="tab" aria-selected="${state.assistantMode === "recent"}" class="${state.assistantMode === "recent" ? "is-selected" : ""}" data-action="assistant-mode" data-mode="recent">Recent use</button><button role="tab" aria-selected="${state.assistantMode === "ask"}" class="${state.assistantMode === "ask" ? "is-selected" : ""}" data-action="assistant-mode" data-mode="ask">Ask</button></div>`;
    if (state.assistantMode === "today") return `<section class="utlt-assistant-page"><h1>Today's water</h1><p>A live outlook from the first recorded flow, with a fuller check-in after six hours.</p>${modes}${window.UTLTNiro.studyCard(state)}${dailyFeedbackCard()}<p class="utlt-ai-note">UTLT is AI. It can make mistakes.</p></section>`;
    if (state.assistantMode === "recent") return `<section class="utlt-assistant-page"><h1>Your water story</h1><p>A clear look at recent measured days, with gaps shown honestly.</p>${modes}${recentUseCard()}<div class="utlt-assistant-evidence"><span>TODAY BY THIS TIME</span><strong>${escapeHtml(evidence)}</strong><small>${state.demoEnabled ? "Sample readings · not a real household" : "Based on readings stored on this phone"}</small></div><p class="utlt-ai-note">UTLT is AI. It can make mistakes.</p></section>`;
    const messageMarkup = state.niroMessages.map(({ role, text, chart, table }) =>
      `<div class="niro-message is-${role} utlt-user-content"><p>${escapeHtml(text)}</p>${window.UTLTNiro.figures(chart, table)}</div>`).join("");
    const lastAnswer = state.niroMessages.at(-1);
    const mood = state.llmBusy ? "curious" : lastAnswer?.mood || (lastAnswer?.chart ? "happy" : "idle");
    const promptButtons = [
      ["Possible leaks", "Is there a possible leak?"],
      ["End-of-day outlook", "Show my end-of-day forecast"],
      ["Today's split", "Chart today's water split by activity"],
      ["Weekly table", "Show my weekly water use as a table"],
    ].map(([label,question]) => `<button type="button" data-action="assistant-prompt" data-question="${escapeHtml(question)}">${escapeHtml(label)}</button>`).join("");
    return `<section class="utlt-assistant-page niro-chat">
      <header class="niro-chat-head">${window.UTLTNiro.avatar(mood)}<div><h1>Chat with Niro</h1><p>${state.demoEnabled ? "Sample readings" : "Water assistant"}</p></div><button type="button" class="niro-new" data-action="niro-new">New chat</button></header>
      ${modes}
      <div class="niro-thread" role="log" aria-label="Conversation with Niro">
        ${window.UTLTNiro.studyCard(state)}
        ${messageMarkup || '<div class="niro-welcome"><h2>What would you like to know?</h2><p>Ask about your water use or request a chart or table.</p></div>'}
      </div>
      <div class="niro-compose">
        <div class="utlt-question-prompts" aria-label="Example questions">${promptButtons}</div>
        <form id="utlt-assistant-form" class="utlt-assistant-form">
          <textarea id="utlt-assistant-question" name="question" aria-label="Message Niro" rows="1" maxlength="300" placeholder="Message Niro" required>${escapeHtml(state.llmQuestion)}</textarea>
          <button class="utlt-primary-button" type="submit" aria-label="Send message" ${state.llmBusy ? "disabled" : ""}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6"/></svg></button>
        </form>
        <div class="niro-compose-meta">
          <p class="utlt-ai-note">Chats aren’t saved.</p>
        </div>
        ${state.llmStatus ? `<p class="utlt-device-help" role="status">${escapeHtml(state.llmStatus)}</p>` : ""}
      </div>
    </section>`;
  }

  function niroDownloadPage() {
    const supported = window.UTLTLocalLLM.supported();
    return `<section class="niro-download" aria-label="Set up Niro">
      ${window.UTLTNiro.avatar(state.llmBusy ? "curious" : "idle")}
      <h1>Niro</h1>
      <button type="button" class="utlt-primary-button" data-action="load-local-llm" ${state.llmBusy || !supported ? "disabled" : ""}>Download to use</button>
      <p>Niro is AI and can make mistakes.</p>
      <p>SmolLM2 135M · 137 MB model download</p>
      ${state.llmStatus || !supported ? `<p role="status">${escapeHtml(state.llmStatus || "This browser can’t run the local model.")}</p>` : ""}
    </section>`;
  }

  function checkedWaterAnswer(question) {
    const q = question.toLowerCase();
    const source = state.demoEnabled ? "The sample readings show" : "Your meter shows";
    const summary = window.UTLTData.summarize(state.readings);
    const pace = window.UTLTAI.paceInsight(state.readings, waterClock());
    if (/forecast|predict|projection|by evening|8 ?pm|goal|target/.test(q)) {
      const forecast = window.UTLTAI.dailyForecast(state.readings, waterGoal(), waterClock());
      if (forecast.stage === "waiting") return "There is no positive water reading today yet. The evening estimate begins after the first use.";
      if (forecast.eveningPassed) return forecast.byEvening === null ? "The first water reading came after 8 pm, so there is no evening forecast for today." : `By 8 pm, ${number(forecast.byEvening)} L was recorded against your ${forecast.goal} L goal. Missing device readings could change that picture.`;
      if (forecast.projected === undefined) return `Today's meter has recorded ${number(forecast.measured)} L. Wait for at least 30 minutes after first use before estimating 8 pm.`;
      return `At the measured pace so far, about ${number(forecast.projected)} L could be used by 8 pm, ${forecast.tone === "over" ? "above" : "within"} your ${forecast.goal} L goal. ${forecast.stage === "feedback" ? "Your six-hour check-in is ready." : "The fuller check-in appears six hours after the first use."} This is a rough estimate; disconnected hours may be missing and UTLT never limits supply.`;
    }
    if (/compar|usual|normal|pace|pattern/.test(q)) {
      if (!pace.ready) return pace.reason === "today" ? "There is no water reading from today yet. A same-time comparison starts after the first reading." : `A same-time comparison needs three earlier measured days. This phone has ${pace.measuredDays} so far; missing days are not counted as zero water use.`;
      return `${source} ${number(pace.today)} L by ${pace.clock}, versus a ${number(pace.baseline)} L median at the same time on ${pace.measuredDays} earlier measured days. That is ${number(Math.abs(pace.difference))} L ${pace.difference >= 0 ? "above" : "below"} your recent pattern. This comparison cannot identify the activity or prove a leak.`;
    }
    if (/leak|running|flowing/.test(q)) return state.flowRunningMinutes >= 16 ? `The meter has detected about ${Math.floor(state.flowRunningMinutes)} minutes of continuous flow. Check taps and the pump; this alone cannot prove a leak.` : "There is no sustained-flow alert right now. The meter measures flow but cannot locate or prove a leak.";
    if (/uncertain|sure|confidence|what do you know/.test(q)) return `${source.toLowerCase()} total flow, not which tap or activity used it. Unconfirmed use stays in Misc; activity labels are suggestions until you verify them.`;
    if (/per.person|per person/.test(q)) {
      const insight = window.UTLTAI.numericInsight(state.readings, state.survey);
      return insight?.perPerson !== undefined ? `${source} about ${insight.perPerson} L per person per measured day, based on your household survey and seven measured days.` : "Add your household size and collect seven measured days before calculating a per-person average.";
    }
    if (/average|seven.day|7.day/.test(q)) {
      const days = summary.daily.filter(day => day.hasData);
      return days.length ? `${source} ${number(days.reduce((sum, day) => sum + day.litres, 0) / days.length)} L per measured day across ${days.length} day${days.length === 1 ? "" : "s"}. Days with no reading are excluded.` : "No measured-day average is available yet.";
    }
    if (/save|one action|what should i do/.test(q)) return "Turn off running water while soaping or scrubbing. Your flow meter cannot tell which activity used the water, so check what is happening at home first.";
    if (/(how much|total|used|usage).*(today)|(today).*(how much|total|used|usage)|how much water have i used/.test(q)) return summary.daily.at(-1)?.hasData ? `${source} ${number(summary.used)} L used today against your ${waterGoal()} L goal.` : "There is no water reading from today yet.";
    return null;
  }

  function assistantFacts() {
    const summary = window.UTLTData.summarize(state.readings);
    return [
      state.demoEnabled ? "Source: sample data." : "Source: household water meter.",
      summary.daily.at(-1)?.hasData ? `Today’s reading is ${number(summary.used)} L.` : "No reading for today.",
      "The meter measures flow and cannot identify activities.",
      "Allowed action: switch off the tap while scrubbing.",
    ].join(" ");
  }

  function niroOnboardingPage() {
    const draft = state.niroGoalDraft;
    const routine = draft?.routine || state.survey || {};
    const options = (choices, selected) => choices.map(([value, label]) =>
      `<option value="${value}" ${String(selected) === String(value) ? "selected" : ""}>${label}</option>`).join("");
    const field = (name, label, min, max, value, required = true) =>
      `<label>${label}<input name="${name}" type="number" min="${min}" max="${max}" inputmode="numeric" value="${escapeHtml(value)}" ${required ? "required" : ""}></label>`;
    if (draft?.goal && !draft.editing) {
      return `<section class="utlt-survey-page niro-onboarding">
        ${window.UTLTNiro.avatar("happy")}<h1>Your starting water goal</h1>
        <p class="utlt-user-content">${escapeHtml(draft.reason)}</p>
        <p>Use it as a starting point and revisit after a week of measured use.</p>
        <form id="niro-goal-form" class="utlt-survey-form">
          ${field("goal", "Daily household goal (litres)", 1, 100000, draft.goal)}
          <p class="utlt-device-help utlt-user-content">${escapeHtml(draft.tip)}</p>
          <button class="utlt-primary-button" type="submit">Use this goal</button>
          <button class="utlt-secondary-button" type="button" data-action="niro-setup-edit">Edit answers</button>
          <button class="utlt-secondary-button" type="button" data-action="niro-setup-skip">Keep my current goal</button>
        </form>
      </section>`;
    }
    return `<section class="utlt-survey-page niro-onboarding">
      ${window.UTLTNiro.avatar()}<h1>Set a water goal with Niro</h1>
      <p>Tell Niro about a typical day for the whole household. Your answers stay on this device. Gas and Electricity goals will be available when their meters are enabled.</p>
      <form id="niro-onboarding-form" class="utlt-survey-form">
        ${field("people", "How many people live at home?", 1, 30, routine.people ?? "")}
        <label>How do people usually bathe?<select name="showerStyle">${options([["bucket", "Mostly bucket baths"], ["shower", "Mostly showers"], ["mixed", "A mix of both"]], routine.showerStyle ?? "mixed")}</select></label>
        ${field("typicalShowerMinutes", "Typical minutes per shower (skip for bucket baths)", 1, 60, routine.typicalShowerMinutes ?? "", false)}
        ${field("laundryDaysPerWeek", "How many days a week do you wash clothes?", 0, 7, routine.laundryDaysPerWeek ?? 2)}
        <label class="utlt-check-row"><input name="washingMachine" type="checkbox" ${routine.washingMachine ? "checked" : ""}>We use a washing machine</label>
        ${field("cookingMealsPerDay", "How many meals are cooked at home each day?", 0, 6, routine.cookingMealsPerDay ?? 2)}
        ${field("outdoorDays", "Days per week you water plants or wash outside", 0, 7, routine.outdoorDays ?? 0)}
        <label>How do you usually wash dishes?<select name="dishwashing">${options([["hand", "By hand"], ["machine", "Dishwasher"], ["mixed", "Both"]], routine.dishwashing ?? (routine.dishwasher ? "machine" : "hand"))}</select></label>
        ${field("knownLitres", "Known daily household use in litres (optional)", 1, 100000, draft?.knownLitres ?? "", false)}
        <label>Anything else about your routine? (optional)<textarea name="note" maxlength="240" rows="2" placeholder="We run several loads on weekends.">${escapeHtml(draft?.note || "")}</textarea></label>
        <button class="utlt-primary-button" type="submit" ${state.niroSetupBusy ? "disabled" : ""}>Suggest a starting goal</button>
        ${state.niroSetupBusy ? '<p role="status">Niro is reviewing your answers…</p>' : ""}
        <button class="utlt-secondary-button" type="button" data-action="niro-setup-skip">Skip setup</button>
      </form>
    </section>`;
  }

  function finishNiroSetup(goal) {
    if (goal !== undefined && !state.niroGoalDraft?.editing && state.niroGoalDraft?.routine) {
      const { routine } = state.niroGoalDraft;
      state.survey = { ...state.survey, ...routine,
        startedAt: state.survey?.startedAt || window.UTLTAI.indiaDate(new Date()) };
      state.goal = goal;
      try { localStorage.setItem(surveyKey, JSON.stringify(state.survey)); } catch { }
      persistProfile();
    }
    state.niroSetupDone = true;
    state.niroStudyStart = window.UTLTAI.indiaDate(new Date());
    captureNiroWeek();
    state.niroGoalDraft = null;
    state.niroSetupBusy = false;
    try { localStorage.setItem(niroSetupKey, JSON.stringify({ done: true, goal: state.goal, startedAt: state.niroStudyStart })); } catch { }
    render();
  }

  function reviewPage() {
    const day = window.UTLTAI.indiaDate(new Date());
    const eligible = window.UTLTAI.reviewEligible(state.survey);
    const groups = eligible && !state.reviewedDays.includes(day) ? reviewSessions() : [];
    return `<section class="utlt-survey-page"><p class="utlt-eyebrow">DAILY WATER REVIEW</p><h1>Today's uncertain periods</h1><p>${eligible ? "The meter measured water, and UTLT suggests a likely activity. Confirm only what you recognize." : "Reviews open after 9 PM during the first seven survey days and the first three days of each month."}</p>${groups.length ? `<form id="utlt-review-form" class="utlt-review-form">${groups.map((group, index) => `<label class="utlt-review-row"><strong>${escapeHtml(new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(group.recordedAt)))} · ${number(group.litres)} L</strong><small>Possible ${escapeHtml(group.suggestion.category)} · ${Math.round(group.suggestion.confidence * 100)}% model confidence</small><select name="label-${index}"><option value="">I'm not sure</option>${window.UTLTData.categories.map(item => `<option value="${escapeHtml(item.label)}">${escapeHtml(item.label)}</option>`).join("")}</select></label>`).join("")}<button class="utlt-primary-button" type="submit">Save today's review</button></form>` : `<div class="utlt-learning-card"><strong>${state.reviewedDays.includes(day) ? "Today's review is complete" : eligible ? "Nothing unclear today" : "Review opens at day end"}</strong></div>`}<p class="utlt-ai-note">UTLT is AI. It can make mistakes.</p></section>`;
  }

  function communityBucket(litres) {
    const limits = [50, 100, 150, 200, 250, 300, 400, 500, 750, 1000];
    const index = limits.findIndex(limit => litres < limit);
    return index < 0 ? 10 : index;
  }
  async function syncCommunityInsight() {
    if (!firebaseStore || !state.uid) return;
    if (!state.communitySharing) {
      try { await firebaseStore.withdrawCommunityUsage(todayKey()); } catch (error) { console.warn("Could not withdraw community stats.", error); }
      state.communityPercentile = null;
      state.communityParticipants = 0;
      state.communityStatus = "off";
      return;
    }
    const own = currentCompetitionStats();
    if (!own) {
      state.communityPercentile = null;
      state.communityParticipants = 0;
      state.communityStatus = "waiting";
      return;
    }
    state.communityStatus = "loading";
    try {
      const bucket = communityBucket(own.dailyUsed);
      const bucketCounts = await firebaseStore.publishCommunityUsage(own.date, bucket);
      const total = Array.from({ length: 11 }, (_, i) => Number(bucketCounts["b" + i]) || 0).reduce((a,b) => a+b, 0);
      const others = Math.max(0, total - 1);
      state.communityParticipants = others;
      if (others < 5) {
        state.communityPercentile = null;
        state.communityStatus = "gathering";
        return;
      }
      const sameBucketOthers = Math.max(0, (Number(bucketCounts["b" + bucket]) || 0) - 1);
      const higher = Array.from({ length: 11 }, (_, i) => i > bucket ? Number(bucketCounts["b" + i]) || 0 : 0).reduce((a,b) => a+b, 0);
      const approximate = Math.round((higher + sameBucketOthers * 0.5) / others * 100);
      state.communityPercentile = Math.max(0, Math.min(100, approximate));
      state.communityStatus = "ready";
    } catch (error) {
      state.communityPercentile = null;
      state.communityStatus = "error";
      console.warn("UTLT community insight unavailable.", error);
    }
  }
  function dashboard() {
    if (!state.device.connected && !state.demoEnabled && state.readings.length === 0) {
      return `<div class="utlt-dashboard"><section class="utlt-empty-dashboard"><span class="utlt-empty-mark">${icon("droplet", 32)}</span><p class="utlt-eyebrow">HOME WATER</p><h2>See what flows<br>through your home.</h2><p>Connect your water monitor to see today’s usage and spot changes.</p><button type="button" class="utlt-primary-button" data-action="pair">Connect device</button></section>${window.UTLTNiro.summary(state)}</div>`;
    }
    const summary = window.UTLTData.summarize(state.readings);
    const demos = state.demoEnabled ? window.UTLTDemo.render(state.demoMode, state.demoPhase, true) : "";
    const coach = state.demoEnabled && state.demoMode === "coach" ? window.UTLTNiro.coachChat(state.demoMessages) : "";
    return `<div class="utlt-dashboard">${greetingMarkup()}${state.demoEnabled ? '<p class="utlt-demo-banner">SAMPLE READINGS</p>' : ""}${state.flowWarning ? `<p class="utlt-flow-warning" role="alert">${escapeHtml(state.flowWarning)}</p>` : ""}${demos}${runningWaterCard()}${usage(summary)}${window.UTLTNiro.summary(state, summary)}${coach}${status(summary)}${quickStats(summary)}${learningCards()}${tipCard(summary)}${breakdown(summary)}${weekly(summary)}</div>`;
  }

  const helpTour = [
    ["Connect your monitor", "Pair your ESP32 in Devices to see the readings it sends over Bluetooth."],
    ["Give your water use a goal", "Set a daily litre goal in Account, then check how today’s use compares on Home."],
    ["Ask Niro what changed", "The dashboard shows a relevant insight. Ask Niro for the chart or table behind it."],
  ];

  function helpPage() {
    const items = [
      ["How do I pair my meter?", "Open Devices, scan your monitor’s QR code, then allow Bluetooth for the matching device."],
      ["What does a flow alert mean?", "It means the meter detected sustained flow. Check taps and the pump. The reading cannot identify the source."],
      ["Why are some activities listed as Misc?", "Your meter measures flow. An activity label stays in Misc until there is enough evidence or you confirm it."],
      ["Does Niro use a cloud API?", "Niro uses calculations from the app and can run a downloaded model in this browser. Sign-in and translation have separate online services."],
    ];
    const step = helpTour[state.tourStep - 1];
    return `<section class="utlt-assistant-page"><h1>Help &amp; support</h1>
      ${step ? `<section class="niro-summary"><p>Quick tour · ${state.tourStep} of ${helpTour.length}</p><h2>${step[0]}</h2><p>${step[1]}</p><button class="utlt-primary-button" data-action="tour">${state.tourStep === helpTour.length ? "Done" : "Next"}</button></section>` : `<button class="utlt-secondary-button" data-action="tour">Take the quick tour</button>`}
      ${items.map(([q,a]) => `<details class="utlt-help-row"><summary>${q}</summary><p>${a}</p></details>`).join("")}
      <a class="utlt-page-link" href="./screens.html">App page map</a>
    </section>`;
  }

  function reportsPage() {
    if (state.utility !== "Water") return utilityTabs() +
      `<section class="utlt-unavailable-card niro-utility"><h1>${state.utility} reports</h1>${utilityNotice()}</section>`;
    const summary = window.UTLTData.summarize(state.readings);
    return utilityTabs() + `<section class="utlt-assistant-page"><h1>Water reports</h1><p>${state.demoEnabled ? "Sample readings" : "Measured days and today’s breakdown."}</p>${weekly(summary)}${breakdown(summary)}</section>`;
  }

  function calibrationForm() {
    return `<form id="utlt-calibration-form" class="utlt-meter-diagnostics" aria-labelledby="utlt-calibration-title">
      <strong id="utlt-calibration-title">Water meter calibration</strong>
      <small>The conversion uses 160 mL over ${calibrationDurationSeconds} seconds. Enter the average pulses per second from your test. Saving also updates saved meter totals.</small>
      <div class="utlt-calibration-fields">
        <label class="utlt-field" for="utlt-pulse-rate">Pulses per second
          <input id="utlt-pulse-rate" name="pulseRate" type="number" step="any" min="0.01" max="400" inputmode="decimal" value="${calibrationPulseRate}" required>
        </label>
        <label class="utlt-field" for="utlt-fill-seconds">Seconds for 160 mL
          <input id="utlt-fill-seconds" type="number" value="${calibrationDurationSeconds}" readonly>
        </label>
      </div>
      <p>Current conversion: ${formatCalibration(state.pulsesPerLitre)} pulses per litre</p>
      <button class="utlt-secondary-button" type="submit">Save calibration</button>
      ${state.calibrationStatus ? `<p class="utlt-calibration-status" role="status">${escapeHtml(state.calibrationStatus)}</p>` : ""}
    </form>`;
  }

  function formatCalibration(factor) {
    return factor.toLocaleString("en-IN", { maximumFractionDigits: 1 });
  }

  function devicePage() {
    const connected = state.device.connected;
    const last = state.device.lastConnectedAt && !Number.isNaN(Date.parse(state.device.lastConnectedAt))
      ? new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(new Date(state.device.lastConnectedAt)) : "";
    return `<section class="utlt-device-settings"><p class="utlt-eyebrow">YOUR WATER MONITOR</p><div class="utlt-device-card"><span class="utlt-device-icon ${connected ? "" : "is-off"}">${icon(connected ? "bluetooth" : "bluetoothOff", 27)}</span><div><strong>${connected ? "Device connected" : state.pairedDeviceId ? "Device disconnected" : "No device connected"}</strong>${last ? `<span class="utlt-last-connected">Last connected at ${escapeHtml(last)}</span>` : ""}<p>${connected ? "Live water readings are updating your dashboard." : state.pairedDeviceId ? "Your device is remembered. Reconnect it to receive live readings." : "Scan the QR on your device to connect over Bluetooth."}</p></div></div><button class="utlt-primary-button" data-action="pair">${connected ? "View connection" : state.pairedDeviceId ? "Reconnect device" : "Pair a device"}</button>${connected && controlCharacteristic ? `<button class="utlt-secondary-button" data-action="download-history" ${historyLoading ? "disabled" : ""}>${historyLoading ? "Downloading history…" : "Download seven-day history"}</button>` : ""}${state.historyStatus ? `<p class="utlt-device-help" role="status">${escapeHtml(state.historyStatus)}</p>` : ""}${state.unknownPulses ? `<p class="utlt-device-help">${number(state.unknownPulses / state.pulsesPerLitre)} L was recorded without a known time after a power reset, so it cannot be placed on a day chart.</p>` : ""}${!connected ? `<div class="utlt-demo-setting"><div><strong>Explore with demo data</strong><p>${state.demoEnabled ? "Home shows sample readings and all three interactive demos." : "Turn on sample readings and interactive demos on Home."}</p></div><button type="button" data-action="toggle-demo" role="switch" aria-checked="${state.demoEnabled}" aria-label="${state.demoEnabled ? "Disable" : "Enable"} demo data" class="utlt-demo-switch ${state.demoEnabled ? "is-on" : ""}"><span></span></button></div>` : ""}<p class="utlt-device-help">Live readings come from your ESP32 flow sensor. Sample readings stay separate from device data.</p>${calibrationForm()}</section>`;
  }
  function pairPage() {
    const ready = Boolean(state.pairedDeviceId);
    const noticeTitle = state.device.connected ? "Water monitor connected" : ready ? "Device recognized" : "Scan your device";
    const noticeBody = state.device.connected ? state.rawPulseCount === 0 ? "Bluetooth is connected. No sensor pulses yet; if water is flowing, check the GPIO27 signal wiring." : "Live flow readings are updating your dashboard." : ready ? `UTLT-${state.pairedDeviceId.slice(-4).toUpperCase()} recognized. If this phone has connected before, it will reconnect automatically. Otherwise, tap Allow Bluetooth and select the matching device in Chrome's system chooser.` : "Point your camera at the QR sticker on your ESP32 enclosure.";
    return `<section class="utlt-pair-page">
      <div class="utlt-pair-illustration">${icon("bluetooth", 34)}</div>
      <p class="utlt-eyebrow">DEVICE SETUP</p>
      <h1>Connect your water monitor</h1>
      <p class="utlt-pair-intro">Scan your device sticker once, then see live water use over Bluetooth. Use Chrome on Android or Bluefy on iPhone.</p>
      ${/iPhone|iPad|iPod/i.test(navigator.userAgent) && !navigator.bluetooth?.requestDevice ? '<p class="utlt-flow-warning">iPhone Chrome cannot connect to Bluetooth devices. Open this same website in <a href="https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055">Bluefy</a> to pair.</p>' : ''}
      <div class="utlt-pair-notice ${state.device.connected ? "is-ready" : ready ? "is-scanned" : ""}" role="status"><strong>${noticeTitle}</strong><span>${noticeBody}</span></div>
      ${state.qrScanning ? '<video class="utlt-qr-preview" id="utlt-qr-preview" autoplay playsinline muted aria-label="Camera view for device QR code"></video>' : ''}
      ${ready && !state.device.connected ? '<button class="utlt-primary-button utlt-connect-button" type="button" data-action="connect-ble">Allow Bluetooth for UTLT-' + state.pairedDeviceId.slice(-4).toUpperCase() + '</button>' : ''}
      <button class="utlt-primary-button ${ready ? "utlt-scan-again" : ""}" type="button" data-action="${state.qrScanning ? "stop-qr" : "scan-qr"}">${state.qrScanning ? "Stop scanning" : ready ? "Scan another device QR" : "Scan device QR"}</button>
      ${!ready || state.qrScanning ? '<label class="utlt-qr-photo">Or use a camera photo<input type="file" id="utlt-qr-photo" accept="image/*" capture="environment" aria-label="Take a photo of the device QR code"></label>' : ''}
      <div class="utlt-meter-diagnostics"><strong>Water conversion</strong><span>${formatCalibration(state.pulsesPerLitre)} pulses ≈ 1 litre</span>${state.rawPulseCount !== null ? `<span>Total pulses: ${state.rawPulseCount.toLocaleString("en-IN")}</span><span>Pulse speed: ${state.pulseRateHz === null ? "waiting for next packet" : `${state.pulseRateHz.toFixed(1)} per second`}</span>` : ""}<small>Adjust the provisional 160 mL conversion in Device Settings.</small></div>
      ${state.flowWarning ? `<p class="utlt-flow-warning" role="alert">${escapeHtml(state.flowWarning)}</p>` : state.flowRateLpm !== null ? `<p class="utlt-pair-feedback">Measured flow: ${state.flowRateLpm.toFixed(2)} L/min</p>` : ''}
      ${state.pairStatus && !state.pairStatus.startsWith("QR verified") ? `<p class="utlt-pair-feedback" role="status">${escapeHtml(state.pairStatus)}</p>` : ''}
      <button class="utlt-reset-readings" type="button" data-action="reset-meter-readings">Clear saved water readings</button>
      <h2>Three steps</h2>
      <ol class="utlt-pair-steps">
        <li><span>1</span><div><strong>Power your monitor</strong><small>Connect the ESP32 to a USB power bank. If readings look too fast, test the pump on a separate charger.</small></div></li>
        <li><span>2</span><div><strong>Scan the sticker in this app</strong><small>Allow camera access, then point it at the device QR code.</small></div></li>
        <li><span>3</span><div><strong>Allow Bluetooth once</strong><small>Tap Connect and choose your UTLT device. This browser can reconnect automatically after that first permission.</small></div></li>
      </ol>
      <p class="utlt-device-help">The flow sensor measures water passing through it. In a recirculating demo, the same water is counted each lap; this is simulated household usage, not consumption.</p>
    </section>`;
  }

  function accountPage() {
    const local = state.authProvider === "local";
    const profile = local || firebaseStore ? `<div class="utlt-profile-card"><div class="utlt-avatar">${icon("user", 38)}</div><div><strong class="utlt-user-content">${escapeHtml(state.name || "Your account")}</strong><span>${local ? "This phone only" : "Google account connected"}</span></div><span class="utlt-connected"><i></i> Active</span></div><section class="utlt-google-auth"><p class="utlt-data-source" role="status">${local ? "Setup is saved in Bluefy on this phone. There is no cloud sync or family sharing." : "✓ Signed in with Google. Your profile is stored in Firebase."}</p>${local ? "" : `<button class="utlt-settings-row" type="button" data-action="sign-out"><span>Sign out</span>${icon("chevron",18)}</button>`}</section><form class="utlt-account-form" id="utlt-account-form"><div class="utlt-section-heading"><div><h2>Personal details</h2><p>Manage your profile and home settings.</p></div></div><label class="utlt-field">Full name<input name="name" value="${escapeHtml(state.name)}" autocomplete="name"></label>${local ? "" : `<label class="utlt-field">Email address<input name="email" type="email" value="${escapeHtml(state.email)}" autocomplete="email"></label>`}<label class="utlt-field">Home name<input name="homeName" value="${escapeHtml(state.homeName)}"></label><label class="utlt-field">Daily water goal <span class="utlt-input-wrap"><input name="goal" type="number" min="1" value="${escapeHtml(state.goal)}"><span>litres</span></span></label><button class="utlt-primary-button utlt-save-button" type="submit">${state.saved ? icon("check", 18) + " Saved" : "Save changes"}</button></form>` : `<button class="utlt-primary-button" type="button" data-action="account-sign-in">${bluefyPhone ? "Set up on this phone" : "Sign in"}</button>`;
    return `<section class="utlt-account">
      ${profile}
      <section class="utlt-account-settings" aria-labelledby="utlt-settings-title">
        <h2 id="utlt-settings-title">Settings</h2>
        <button class="utlt-settings-row" data-action="theme"><span class="utlt-settings-icon">${icon(state.dark ? "sun" : "moon", 19)}</span><span><strong>Appearance</strong><small>${state.dark ? "Dark mode" : "Light mode"}</small></span>${icon("chevron", 18)}</button>
        <button class="utlt-settings-row" data-action="device"><span class="utlt-settings-icon">${icon(state.device.connected ? "bluetooth" : "bluetoothOff", 19)}</span><span><strong>Connected devices</strong><small>Manage your utility monitor</small></span>${icon("chevron", 18)}</button>
        ${languageSelector()}
        <button class="utlt-settings-row" type="button" data-action="help"><span class="utlt-settings-icon">${icon("settings",19)}</span><span><strong>Help &amp; support</strong></span>${icon("chevron",18)}</button>
        <button class="utlt-settings-row" type="button" data-action="family"><span class="utlt-settings-icon">${icon("users",19)}</span><span><strong>Family Connect</strong></span>${icon("chevron",18)}</button>
      </section>
    </section>`;
  }

  function nav() {
    const tabs = [
      ["home","Home",icon("home",22)], ["reports","Reports",icon("graph",22)],
      ["niro","Niro",window.UTLTNiro.outline], ["device","Devices",icon("bluetooth",22)],
      ["account","Account",icon("user",22)],
    ];
    return `<nav class="utlt-tabbar" aria-label="Main navigation">${tabs.map(([action,label,symbol]) => {
      const current = ({pair:"device",assistant:"niro",family:"account",help:"account"})[state.screen] || state.screen;
      return `<button class="${current === action ? "is-current" : ""}" data-action="${action}" ${current === action ? 'aria-current="page"' : ""}><span class="utlt-nav-icon">${symbol}</span><span>${label}</span></button>`;
    }).join("")}</nav>`;
  }

  function todayKey() {
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }
  function currentCompetitionStats() {
    if (state.usingDemo) return null;
    const today = todayKey();
    const used = state.readings.filter(item => typeof item.recordedAt === "string" && item.recordedAt.startsWith(today) && Number.isFinite(item.litres) && item.litres >= 0)
      .reduce((sum, item) => sum + item.litres, 0);
    const goal = Math.max(1, Number(state.goal) || 350);
    return { displayName: state.name || "UTLT user", date: today, dailyUsed: Number(used.toFixed(1)), dailyGoal: goal,
      litresSaved: Number(Math.max(0, goal - used).toFixed(1)), leaderboardVisible: state.leaderboardVisible };
  }
  async function refreshFriendData() {
    if (!firebaseStore || !state.uid) return;
    try {
      const results = await Promise.all([firebaseStore.loadFriendRequests(), firebaseStore.loadFriends()]);
      state.friendRequests = results[0].incoming.map(item => Object.assign({direction:"incoming"}, item))
        .concat(results[0].outgoing.map(item => Object.assign({direction:"outgoing"}, item)));
      state.friends = results[1].map(item => {
        const friendUid = item.memberUids.find(id => id !== state.uid);
        return { uid: friendUid, name: item.displayNames && item.displayNames[friendUid] || "UTLT friend" };
      });
      const stats = [];
      for (const friend of state.friends) {
        try {
          const data = await firebaseStore.loadFriendStats(friend.uid);
          stats.push(Object.assign({uid:friend.uid,name:friend.name,hasStats:Boolean(data)}, data || {}));
        } catch (error) {
          stats.push({uid:friend.uid,name:friend.name,hasStats:false});
        }
      }
      state.friendStats = stats;
    } catch (error) {
      state.friendMessage = error.message || "Could not load friends right now.";
    }
  }
  async function syncCompetitionStats() {
    if (!firebaseStore || !state.uid) return;
    const stats = currentCompetitionStats();
    try {
      if (stats && state.leaderboardVisible) await firebaseStore.publishStats(stats);
      else await firebaseStore.hideStats();
    } catch (error) { state.friendMessage = error.message || "Could not update leaderboard privacy."; }
  }
  function leaderboardRows(metric) {
    const own = currentCompetitionStats();
    const entries = [];
    if (own) entries.push(Object.assign({uid:state.uid,name:state.name || "You",isYou:true,hasStats:true},own));
    for (const friend of state.friendStats) {
      if (friend.hasStats && friend.leaderboardVisible === true && friend.date === todayKey()) entries.push(Object.assign({isYou:false},friend));
    }
    entries.sort((a,b) => metric === "saved" ? b.litresSaved - a.litresSaved : a.dailyUsed - b.dailyUsed);
    return entries;
  }
  function leaderboardCard(title, metric) {
    const rows = leaderboardRows(metric);
    let html = '<section class="utlt-leaderboard-card"><h3>' + title + '</h3>';
    if (!rows.length) html += '<p class="utlt-friend-muted">No eligible stats yet. Friends must opt in and share real readings.</p>';
    else rows.forEach((row,index) => {
      const value = metric === "saved" ? row.litresSaved : row.dailyUsed;
      html += '<div class="utlt-rank-row"><span class="utlt-rank-number">' + (index+1) + '</span><span class="utlt-rank-name">' +
        escapeHtml(row.name) + (row.isYou ? ' (You)' : '') + '</span><strong>' + number(value) + ' L</strong></div>';
    });
    return html + '</section>';
  }
  async function familyPage() {
    if (!firebaseStore) return '<section class="utlt-family-page"><h1>Family Connect</h1><p>Family sharing needs a cloud account. Water tracking and your household setup work on this iPhone without one.</p></section>';
    if(!state.family)return '<section class="utlt-family-page"><h1>Family Connect</h1><p>Loading…</p></section>';
    let rows=[]; try{rows=await firebaseStore.loadFamilyUsage(state.family.id,todayKey());}catch(e){state.familyMessage=e.message||"Could not load family usage.";}
    const total=rows.reduce((s,x)=>s+(Number(x.litres)||0),0);
    const qr=state.familyInviteUrl?'<img class="utlt-family-qr" alt="Family invitation QR code" src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=12&data='+encodeURIComponent(state.familyInviteUrl)+'">':"";
    let out='<section class="utlt-family-page"><p class="utlt-eyebrow">YOUR HOUSEHOLD</p><h1>Family Connect</h1><p class="utlt-family-muted">Share daily water readings and see one household total.</p><div class="utlt-family-total"><span>FAMILY TOTAL · TODAY</span><strong>'+(state.usingDemo?'—':number(total)+' L')+'</strong><small>'+(state.usingDemo?'Demo readings are not shared. Real meter readings are required.':'Combined readings from '+rows.length+' member(s)')+'</small></div>';
    if(state.pendingFamilyInvite)out+='<section class="utlt-family-card"><h2>Invitation received</h2><p>Request to join? Approved members can see each other’s daily water usage and the combined total.</p><button class="utlt-primary-button" data-action="family-join">Request to join</button></section>';
    if(state.family.ownerUid===state.uid) out+='<section class="utlt-family-card"><h2>Invite a family member</h2><p>Create a temporary QR code. The other person scans it with their phone camera. It expires in 10 minutes; you approve every request.</p><button class="utlt-primary-button" data-action="family-invite">Create QR invitation</button>'+qr+(state.familyInviteUrl?'<button class="utlt-family-secondary" data-action="family-copy">Copy invite link</button>':'')+'</section>';
    out+='<button class="utlt-family-secondary" data-action="family-refresh">Refresh family status</button><section class="utlt-family-card"><h2>Family members ('+state.family.memberUids.length+')</h2>';
    state.family.memberUids.forEach(id=>{const row=rows.find(x=>x.uid===id);out+='<div class="utlt-family-member"><span class="utlt-user-content">'+escapeHtml(state.family.displayNames?.[id]||"Family member")+(id===state.uid?' (You)':'')+'</span><strong>'+(state.usingDemo?'Demo not shared':row?number(row.litres)+' L':'No reading yet')+'</strong></div>';});
    out+='</section>';
    if(state.family.ownerUid===state.uid){out+='<section class="utlt-family-card"><h2>Join requests ('+state.familyRequests.length+')</h2>';if(!state.familyRequests.length)out+='<p class="utlt-family-muted">No pending requests.</p>';state.familyRequests.forEach(q=>{out+='<div class="utlt-family-member"><span class="utlt-user-content">'+escapeHtml(q.requesterName||"Family member")+'</span><span><button data-action="family-approve" data-request-id="'+escapeHtml(q.id)+'">Approve</button> <button data-action="family-decline" data-request-id="'+escapeHtml(q.id)+'">Decline</button></span></div>';});out+='</section>';}
    if(state.familyMessage)out+='<p class="utlt-family-message" role="status">'+escapeHtml(state.familyMessage)+'</p>';
    return out+'<p class="utlt-family-muted">Demo readings are never shared. QR images are generated by an external QR service using the temporary invite link.</p></section>';
  }

  function friendsPage() {
    let html = '<section class="utlt-friends-page">' +
      '<div class="utlt-friends-hero"><div><p class="utlt-eyebrow">YOUR COMMUNITY</p><h1>Friends &amp; Competition</h1><p>Challenge friends to save water together.</p></div><span>' + icon("trophy",34) + '</span></div>' +
      '<section class="utlt-friend-code-card"><div><span class="utlt-friend-label">YOUR FRIEND CODE</span><strong>' + escapeHtml(state.friendCode || "Creating code…") + '</strong><small>Share this code. Your email is never shown.</small></div><button class="utlt-copy-code" data-action="copy-code" ' + (state.friendCode ? '' : 'disabled') + '>' + icon("copy",17) + ' Copy</button></section>' +
      '<form id="utlt-friend-add-form" class="utlt-add-friend"><label for="utlt-friend-code-input">Add a friend by code</label><div><input id="utlt-friend-code-input" name="friendCode" maxlength="12" placeholder="UTLT-ABC234" required><button class="utlt-primary-button" type="submit" ' + (state.friendBusy ? 'disabled' : '') + '>Send request</button></div></form>';
    if (state.friendMessage) html += '<p class="utlt-friend-message" role="status">' + escapeHtml(state.friendMessage) + '</p>';
    html += '<section class="utlt-friend-section"><h2>Friend requests <span>' + state.friendRequests.length + '</span></h2>';
    if (!state.friendRequests.length) html += '<p class="utlt-friend-muted">No pending requests.</p>';
    state.friendRequests.forEach(request => {
      if (request.direction === "incoming") {
        html += '<div class="utlt-friend-row"><div><strong>' + escapeHtml(request.senderName || "UTLT user") + '</strong><small>Wants to be your friend</small></div><div class="utlt-friend-actions"><button data-action="accept-request" data-request-id="' + escapeHtml(request.id) + '">Accept</button><button data-action="decline-request" data-request-id="' + escapeHtml(request.id) + '">Decline</button></div></div>';
      } else {
        html += '<div class="utlt-friend-row"><div><strong>' + escapeHtml(request.recipientName || "UTLT user") + '</strong><small>Request sent · Waiting for response</small></div><span class="utlt-pending-tag">Pending</span></div>';
      }
    });
    html += '</section><section class="utlt-friend-section"><h2>Your friends <span>' + state.friends.length + '</span></h2>';
    if (!state.friends.length) html += '<p class="utlt-friend-muted">Add a friend using their UTLT code to get started.</p>';
    state.friends.forEach(friend => {
      html += '<div class="utlt-friend-row"><div><strong>' + escapeHtml(friend.name) + '</strong><small>UTLT friend</small></div><button class="utlt-remove-friend" data-action="remove-friend" data-friend-uid="' + escapeHtml(friend.uid) + '">Remove</button></div>';
    });
    html += '</section><section class="utlt-privacy-card"><div class="utlt-privacy-icon">' + icon("shield",20) + '</div><div><strong>Leaderboard privacy</strong><p>When enabled, accepted friends can see your daily water use and how far below your daily goal you are. Your email is never shared.</p></div><label class="utlt-switch"><input type="checkbox" data-action="leaderboard-privacy" ' + (state.leaderboardVisible ? 'checked' : '') + '><span></span></label></section>';
    html += '<section class="utlt-community-optin"><div><strong>Anonymous community comparison</strong><p>Share only a broad daily-usage range in a shared counter. Other users cannot see your name, email, exact litres, or individual record. Off by default.</p><small>Prototype notice: browser-based contributions are not verified and may be manipulated.</small></div><label class="utlt-switch"><input type="checkbox" data-action="community-sharing" ' + (state.communitySharing ? 'checked' : '') + '><span></span></label></section>';
    if (!state.leaderboardVisible) html += '<p class="utlt-friend-muted">Your stats are private until you turn on leaderboard sharing.</p>';
    else if (!currentCompetitionStats()) html += '<p class="utlt-friend-muted">Connect a real monitor and send readings to join the leaderboards. Demo data never counts.</p>';
    html += '<h2 class="utlt-leaderboard-heading">Today’s leaderboards</h2>' +
      leaderboardCard("💧 Goal Buffer · Most under goal", "saved") +
      leaderboardCard("📉 Lowest Usage · Least used", "used") +
      '<p class="utlt-friend-muted">Savings are measured against each person’s own daily goal. Leaderboards reset each day (India time).</p></section>';
    return html;
  }

  const translationCache = new Map();
  const translationFailures = new Set();

  // Reviewed Hindi strings for Family Connect: keep these exact phrases reliable
  // even if the public translation endpoint skips a batch or mishandles punctuation.
  const reviewedTranslations = {
    hi: {
      "Create a temporary QR code. The other person scans it with their phone camera. It expires in 10 minutes; you approve every request.":
        "अस्थायी QR कोड बनाएँ। दूसरा व्यक्ति अपने फ़ोन के कैमरे से इसे स्कैन करेगा। यह 10 मिनट में समाप्त हो जाएगा; हर अनुरोध को आपको मंज़ूरी देनी होगी।",
      "Demo readings are not shared. Real meter readings are required.":
        "डेमो रीडिंग साझा नहीं की जातीं। इसके लिए वास्तविक मीटर रीडिंग आवश्यक हैं।",
      "Demo readings are never shared. QR images are generated by an external QR service using the temporary invite link.":
        "डेमो रीडिंग कभी साझा नहीं की जातीं। QR चित्र अस्थायी आमंत्रण लिंक का उपयोग करके बाहरी QR सेवा द्वारा बनाए जाते हैं।"
    }
  };
  async function translateRenderedUi(renderId) {
    const language = state.language;
    if (!language || language === "en") return;
    // Translate all app-authored interface copy, including hero cards and form hints.
    // Keep editable user content, identity fields, and language names untouched.
    const ignored = "svg,script,style,textarea,input,select,.utlt-title,.utlt-user-content,.utlt-friend-row,.utlt-friend-code-card,.utlt-rank-name,.utlt-language-options,.utlt-language-current";
    const targets = [];
    const walker = document.createTreeWalker(root, 4);
    let node;
    while ((node = walker.nextNode())) {
      const value = node.nodeValue || "";
      if (!value.trim() || !/[A-Za-z]/.test(value) || node.parentElement?.closest(ignored)) continue;
      const textNode = node;
      targets.push({ value, set: translated => { textNode.nodeValue = translated; } });
    }
    root.querySelectorAll("[aria-label],[placeholder],[title]").forEach(element => {
      // Translate accessible labels and hints on controls too, but never user-entered values.
      if (element.closest("svg,script,style,textarea,.utlt-title,.utlt-user-content,.utlt-friend-row,.utlt-friend-code-card,.utlt-rank-name,.utlt-language-options,.utlt-language-current")) return;
      ["aria-label", "placeholder", "title"].forEach(attribute => {
        const value = element.getAttribute(attribute);
        if (value && /[A-Za-z]/.test(value)) targets.push({ value, set: translated => element.setAttribute(attribute, translated) });
      });
    });
    const pending = [];
    const reviewed = reviewedTranslations[language] || {};
    targets.forEach(target => {
      if (Object.prototype.hasOwnProperty.call(reviewed, target.value)) {
        const translated = reviewed[target.value];
        translationCache.set(language + "|" + target.value, translated);
        target.set(translated);
        return;
      }
      const key = language + "|" + target.value;
      if (translationCache.has(key)) target.set(translationCache.get(key));
      else pending.push({ ...target, key });
    });
    for (let offset = 0; offset < pending.length; offset += 14) {
      if (renderId !== renderToken) return;
      const batch = pending.slice(offset, offset + 14);
      const marker = index => "UTLTSEG" + String(index).padStart(4, "0") + "X";
      const payload = batch.map((item, index) => marker(index) + item.value + marker(index)).join(" ");
      try {
        const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=" +
          encodeURIComponent(language) + "&dt=t&q=" + encodeURIComponent(payload);
        const response = await fetch(url);
        if (!response.ok) throw new Error("Translation service returned " + response.status);
        const data = await response.json();
        const translated = Array.isArray(data?.[0]) ? data[0].map(part => part?.[0] || "").join("") : "";
        if (!translated) throw new Error("No translated text was returned");
        for (let index = 0; index < batch.length; index++) {
          const token = marker(index).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const match = translated.match(new RegExp(token + "([\\s\\S]*?)" + token));
          if (!match) continue;
          const original = batch[index].value;
          const leading = original.match(/^\s*/)?.[0] || "";
          const trailing = original.match(/\s*$/)?.[0] || "";
          const result = match[1].trim();
          if (!result) continue;
          translationCache.set(batch[index].key, result);
          batch[index].set(leading + result + trailing);
        }
      } catch (error) {
        console.warn("UTLT translation unavailable for " + language + ".", error);
        if (renderId === renderToken && !translationFailures.has(language)) {
          translationFailures.add(language);
          const notice = document.createElement("p");
          notice.className = "utlt-flow-warning";
          notice.setAttribute("role", "status");
          notice.textContent = "Translation is unavailable right now. The app is still usable in English.";
          root.querySelector(".utlt-content")?.prepend(notice);
        }
        return;
      }
    }
  }


  let renderToken = 0;

  // When a meter update redraws the card, continue from the last visible fill and color.
  function animateUsage(previousLevel, previousColors) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const water = root.querySelector(".utlt-water-fill");
    if (!water?.animate) return;
    const from = previousLevel || "translateY(100%)";
    if (from !== getComputedStyle(water).transform) {
      water.animate([{ transform: from }, { transform: water.style.transform }], { duration: 700, easing: "ease-out" });
    }
    root.querySelectorAll("#utlt-water-gradient stop").forEach((stop, index) => {
      const start = previousColors[index];
      const end = getComputedStyle(stop).stopColor;
      if (start && start !== end) stop.animate([{ stopColor: start }, { stopColor: end }], { duration: 700, easing: "ease-out" });
    });
  }

  let lastMotionView = "";
  async function render(preserveScroll = false) {
    const translationRenderId = ++renderToken;
    if (bluefyPhone && state.pairedDeviceId && state.device.connected && !firebaseStore && state.authProvider !== "local") { continueLocally(); return; }
    if (state.pairedDeviceId && !firebaseStore && state.authProvider !== "local" && state.screen !== "pair") { renderAuthGate(); return; }
    const previousScroll = preserveScroll ? root.querySelector(".utlt-content")?.scrollTop || 0 : 0;
    const motionView = `${state.screen}:${state.utility}:${state.breakdown}`;
    const enterMotion = motionView !== lastMotionView;
    lastMotionView = motionView;
    const compact = state.screen === "home" && state.utility !== "Water";
    const chat = state.screen === "assistant" && state.utility === "Water" && state.assistantMode === "ask" && state.llmReady && state.niroSetupDone;
    const content = state.screen === "home"
      ? utilityTabs() + (state.utility === "Water" ? dashboard() : utilityPreview())
      : state.screen === "help" ? helpPage()
      : state.screen === "reports" ? reportsPage()
      : state.screen === "device" ? devicePage()
      : state.screen === "account" ? accountPage()
      : state.screen === "review" ? reviewPage()
      : state.screen === "assistant" ? assistantPage()
      : state.screen === "family" ? await familyPage()
      : pairPage();
    if (translationRenderId !== renderToken) return;
    const previousWater = root.querySelector(".utlt-water-fill");
    const previousLevel = previousWater && getComputedStyle(previousWater).transform;
    const previousColors = Array.from(root.querySelectorAll(".utlt-water-fill ~ .utlt-donut stop"),
      stop => getComputedStyle(stop).stopColor);
    root.innerHTML = `<div class="utlt-app ${state.dark ? "utlt-dark" : ""} ${enterMotion ? "utlt-enter" : ""}" data-utility="${state.utility}"><div class="utlt-phone ${state.screen === "pair" ? "utlt-pair" : compact ? "utlt-compact" : ""}${chat ? " niro-chat-phone" : ""}">${header()}<main class="utlt-content${chat ? " is-niro-chat" : ""}">${content}</main>${nav()}</div></div>`;
    animateUsage(previousLevel, previousColors);
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute("content", state.dark ? "#212121" : "#ffffff"));
    const scroller = root.querySelector(".utlt-content");
    if (scroller) scroller.scrollTop = previousScroll;
    if (enterMotion) setupChartScrollAnimations(scroller);
    translateRenderedUi(translationRenderId);
  }

  // Keep seven daily totals locally even after the meter's rolling history expires.
  function captureNiroWeek() {
    if (!state.niroStudyStart || state.demoEnabled || state.usingDemo) return;
    let changed = false;
    for (const day of window.UTLTData.summarize(state.readings).daily) {
      const index = window.UTLTNiro.firstWeekDay(day.date, state.niroStudyStart);
      if (!day.hasData || !(index >= 0 && index < 7) || state.niroStudy.daily[day.date] === day.litres) continue;
      state.niroStudy.daily[day.date] = day.litres;
      changed = true;
    }
    if (changed) saveNiroStudy();
  }

  function saveNiroStudy() {
    try { localStorage.setItem(niroStudyKey, JSON.stringify(state.niroStudy)); } catch { }
  }

  function renderMeterUpdate() {
    captureNiroWeek();
    if (state.screen === "device" && (state.languageMenuOpen || root.querySelector("#utlt-calibration-form:focus-within"))) return;
    if (["review", "account", "assistant"].includes(state.screen)) return;
    if (!root.querySelector(".utlt-auth-screen")) render(true);
  }

  function setupChartScrollAnimations(scroller) {
    const targets = root.querySelectorAll(".utlt-scroll-reveal");
    if (!targets.length) return;
    if (!("IntersectionObserver" in window)) {
      targets.forEach(element => element.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver((entries, currentObserver) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        currentObserver.unobserve(entry.target);
      });
    }, { root: scroller || null, threshold: 0.16, rootMargin: "0px 0px -5% 0px" });
    targets.forEach(element => observer.observe(element));
  }

  let qrStream = null;
  let qrTimer = null;
  let bleDevice = null;
  let bleCharacteristic = null;
  let historyCharacteristic = null;
  let controlCharacteristic = null;
  let bleConnecting = false;
  let reconnectTimer = null;
  let historyLoading = false;
  let historyTimer = null;
  let historyRows = new Map();
  let historySnapshot = null;
  let latestBlePacket = null;
  let lastConnectionPersisted = 0;

  function stopQrScanner() {
    if (qrTimer) clearTimeout(qrTimer);
    qrTimer = null;
    if (qrStream) qrStream.getTracks().forEach(track => track.stop());
    qrStream = null;
    state.qrScanning = false;
  }

  function acceptDeviceQr(rawValue) {
    const match = /^UTLT:BLE:1:([0-9a-f]{12})$/i.exec(String(rawValue || "").trim());
    if (!match) {
      state.pairStatus = "That is not a UTLT Bluetooth sticker.";
      return false;
    }
    const scannedId = match[1].toLowerCase();
    if (state.pairedDeviceId && state.pairedDeviceId !== scannedId && bleDevice?.gatt?.connected) {
      bleDevice.gatt.disconnect();
      bleDevice = null;
      bleCharacteristic = null;
      historyCharacteristic = null;
      controlCharacteristic = null;
      state.device.connected = false;
      state.device.lastConnectedAt = null;
    }
    state.pairedDeviceId = scannedId;
    try { localStorage.setItem(pairingKey, state.pairedDeviceId); } catch (_error) {  }
    state.pairStatus = `QR verified for UTLT-${state.pairedDeviceId.slice(-4).toUpperCase()}. Reconnecting if already allowed; otherwise tap Allow Bluetooth.`;
    stopQrScanner();
    render(true);
    tryAutoConnectBluetooth();
    return true;
  }

  async function startQrScanner() {
    if (!navigator.mediaDevices?.getUserMedia) {
      state.pairStatus = "Live camera access is unavailable here. Use a camera photo below instead.";
      render(true);
      return;
    }
    try {
      let detector = null;
      if (typeof window.BarcodeDetector?.getSupportedFormats === "function") {
        const formats = await BarcodeDetector.getSupportedFormats();
        if (formats.includes("qr_code")) detector = new BarcodeDetector({ formats: ["qr_code"] });
      }
      if (!detector && !window.jsQR) throw new Error("QR decoder unavailable. Reload this page and try again.");
      state.qrScanning = true;
      state.pairStatus = "Point the camera at your UTLT device sticker.";
      render(true);
      const video = root.querySelector("#utlt-qr-preview");
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      if (!state.qrScanning || !video?.isConnected) { stopQrScanner(); return; }
      video.srcObject = qrStream;
      await video.play();
      const scanFrame = async () => {
        if (!state.qrScanning || !video.isConnected) { stopQrScanner(); return; }
        try {
          let codes = [];
          if (detector) codes = await detector.detect(video);
          else if (video.videoWidth && context) {
            const scale = Math.min(1, 640 / video.videoWidth);
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const frame = context.getImageData(0, 0, canvas.width, canvas.height);
            const result = window.jsQR(frame.data, frame.width, frame.height);
            if (result) codes = [{ rawValue: result.data }];
          }
          for (const code of codes) if (acceptDeviceQr(code.rawValue)) return;
        } catch (_error) {  }
        qrTimer = setTimeout(scanFrame, 220);
      };
      scanFrame();
    } catch (error) {
      stopQrScanner();
      state.pairStatus = error.message || "Camera access failed. Allow the camera in this browser or use a camera photo below.";
      render(true);
    }
  }

  async function scanQrPhoto(file) {
    if (state.qrScanning) stopQrScanner();
    if (!file || !window.jsQR) {
      state.pairStatus = "QR decoder unavailable. Reload the app and try again.";
      render(true);
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const scale = Math.min(1, 1200 / image.naturalWidth);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.naturalWidth * scale);
        canvas.height = Math.round(image.naturalHeight * scale);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const frame = context.getImageData(0, 0, canvas.width, canvas.height);
        const result = window.jsQR(frame.data, frame.width, frame.height);
        if (!result) { state.pairStatus = "No QR found in that photo. Move closer and try again."; render(true); }
        else if (!acceptDeviceQr(result.data)) render(true);
      } catch (error) { state.pairStatus = error.message || "Could not read that photo."; render(true); }
      URL.revokeObjectURL(url);
    };
    image.onerror = () => { URL.revokeObjectURL(url); state.pairStatus = "Could not open that photo."; render(true); };
    image.src = url;
  }

  function rememberConnected() {
    const now = Date.now();
    state.device = { connected: true, lastConnectedAt: new Date(now).toISOString() };
    if (now - lastConnectionPersisted >= 60000) {
      lastConnectionPersisted = now;
      try { localStorage.setItem(lastConnectedKey, JSON.stringify({ qrId: state.pairedDeviceId, at: state.device.lastConnectedAt })); } catch (_error) {  }
    }
  }

  function indiaIso(epochSeconds) {
    return new Date(epochSeconds * 1000 + 330 * 60000).toISOString().replace("Z", "+05:30");
  }

  function finishHistory(complete) {
    clearTimeout(historyTimer);
    historyTimer = null;
    historyLoading = false;
    const latest = latestBlePacket;
    if (!latest) return;
    const pulsesPerLitre = state.pulsesPerLitre;
    const saved = savedMeterReadings();
    if (!complete) {
      saved.session = latest.session;
      saved.lastPulses = latest.total;
      saved.lastObservedAt = Date.now();
      try { localStorage.setItem(directReadingsKey, JSON.stringify(saved)); } catch (_error) {  }
      state.historyStatus = "History transfer did not finish. Reconnect or tap Download history to retry.";
      render(true);
      return;
    }
    const cutoff = Date.now() - 7 * 86400000;
    const recovered = [...historyRows.entries()]
      .filter(([epoch, count]) => epoch * 1000 >= cutoff && count > 0 && count <= 6 * 5 * pulsesPerLitre)
      .sort((a, b) => a[0] - b[0])
      .map(([epoch, count]) => {
        const category = state.confirmedLabels[String(epoch)];
        return { recordedAt: indiaIso(epoch), litres: count / pulsesPerLitre,
          category: category || "Misc", bucketEpoch: epoch, verifiedCategory: Boolean(category) };
      });
    const firstEpoch = recovered[0]?.bucketEpoch;
    const earlier = firstEpoch && Array.isArray(saved.readings) ? saved.readings.filter(item =>
      Date.parse(item.recordedAt) >= cutoff && Date.parse(item.recordedAt) < firstEpoch * 1000 && !item.bucketEpoch
    ) : [];
    const afterSnapshot = historySnapshot !== null && latest.total >= historySnapshot ? latest.total - historySnapshot : 0;
    if (afterSnapshot) recovered.push({ recordedAt: indiaIso(Math.floor(Date.now() / 1000)), litres: afterSnapshot / pulsesPerLitre, category: "Misc" });
    const readings = recovered.length ? [...earlier, ...recovered] : Array.isArray(saved.readings) ? saved.readings : [];
    try { localStorage.setItem(directReadingsKey, JSON.stringify({ session: latest.session, lastPulses: Math.max(latest.total, historySnapshot || 0), lastObservedAt: Date.now(), readings, pulsesPerLitre })); } catch (_error) {  }
    state.readings = readings;
    state.usingDemo = false;
    state.demoEnabled = false;
    state.demoScenario = null;
    try { localStorage.setItem(demoKey, "false"); } catch (_error) {  }
    state.historyStatus = `Recovered ${historyRows.size} five-minute water period${historyRows.size === 1 ? "" : "s"} from the ESP32.`;
    rememberConnected();
    syncFamilyUsage();
    syncCommunityInsight();
    syncCompetitionStats();
    renderMeterUpdate();
  }

  function onHistoryPacket(event) {
    const value = event.target.value;
    if (!value || !value.byteLength) return;
    const type = String.fromCharCode(value.getUint8(0));
    if (type === "U" && value.byteLength === 5) {
      state.unknownPulses = value.getUint32(1, true);
      renderMeterUpdate();
      return;
    }
    if (!historyLoading) return;
    clearTimeout(historyTimer);
    historyTimer = setTimeout(() => finishHistory(false), 150000);
    if (type === "S" && value.byteLength === 5) {
      historySnapshot = value.getUint32(1, true);
      historyRows = new Map();
      state.historyStatus = "Downloading seven days of water history…";
      renderMeterUpdate();
    } else if (type === "R" && value.byteLength === 9) {
      const epoch = value.getUint32(1, true);
      const count = value.getUint32(5, true);
      historyRows.set(epoch, (historyRows.get(epoch) || 0) + count);
    } else if (type === "E" && value.byteLength === 5 && value.getUint32(1, true) === historySnapshot) {
      finishHistory(true);
    }
  }

  async function requestHistory() {
    if (!controlCharacteristic || !historyCharacteristic || historyLoading) return;
    historyLoading = true;
    historyRows = new Map();
    historySnapshot = null;
    state.historyStatus = "Requesting seven days of water history…";
    render(true);
    historyTimer = setTimeout(() => finishHistory(false), 150000);
    try {
      const clock = new Uint8Array(5);
      clock[0] = 84;
      new DataView(clock.buffer).setUint32(1, Math.floor(Date.now() / 1000), true);
      const write = data => controlCharacteristic.writeValueWithResponse ? controlCharacteristic.writeValueWithResponse(data) : controlCharacteristic.writeValue(data);
      await write(clock);
      await write(new Uint8Array([72]));
    } catch (error) {
      finishHistory(false);
      state.historyStatus = `History request failed: ${error.message || error.name}`;
      render(true);
    }
  }

  function onBlePacket(event) {
    const value = event.target.value;
    if (!value || value.byteLength !== 16) return;
    const session = Array.from({ length: 8 }, (_, index) => value.getUint8(index).toString(16).padStart(2, "0")).join("");
    if (session.slice(0, 8) !== state.pairedDeviceId.slice(0, 8)) {
      state.pairStatus = "This Bluetooth device does not match the scanned sticker.";
      bleDevice?.gatt?.disconnect();
      bleDevice = null;
      render(true);
      return;
    }
    state.currentMeterSession = session;
    latestBlePacket = { session, total: value.getUint32(12, true) };
    if (historyLoading) {
      state.rawPulseCount = latestBlePacket.total;
      rememberConnected();
      return;
    }
    applyStandaloneReading({ mode: "standalone", session, totalPulses: latestBlePacket.total, pulsesPerLitre: state.pulsesPerLitre });
    state.pairStatus = latestBlePacket.total === 0 ? "Bluetooth connected. Waiting for sensor pulses; check GPIO27 if water is flowing." : "Bluetooth connected. Live readings are updating.";
    renderMeterUpdate();
  }

  // Live readings come from Bluetooth.
  async function connectSelectedBluetoothDevice(device) {
    if (bleConnecting || bleDevice?.gatt?.connected) return;
    bleConnecting = true;
    clearTimeout(reconnectTimer);
    state.pairStatus = "Connecting to your water monitor…";
    render(true);
    try {
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(bleServiceUuid);
      const characteristic = await service.getCharacteristic(bleReadingUuid);
      const firstValue = await characteristic.readValue();
      const identity = Array.from({ length: 4 }, (_, index) => firstValue.getUint8(index).toString(16).padStart(2, "0")).join("");
      if (firstValue.byteLength !== 16 || identity !== state.pairedDeviceId.slice(0, 8)) {
        device.gatt.disconnect();
        throw new Error("This device does not match the scanned QR sticker.");
      }
      bleDevice = device;
      bleCharacteristic = characteristic;
      try { localStorage.setItem(grantedDeviceKey, JSON.stringify({ qrId: state.pairedDeviceId, bluetoothId: device.id })); } catch (_error) {  }
      device.ongattserverdisconnected = () => {
        if (bleDevice !== device) return;
        try { localStorage.setItem(lastConnectedKey, JSON.stringify({ qrId: state.pairedDeviceId, at: state.device.lastConnectedAt })); } catch (_error) {  }
        bleCharacteristic = null;
        historyCharacteristic = null;
        controlCharacteristic = null;
        historyLoading = false;
        clearTimeout(historyTimer);
        state.device.connected = false;
        state.pairStatus = "Device disconnected. Reconnecting when it is nearby…";
        render(true);
        if (document.visibilityState === "visible") reconnectTimer = setTimeout(tryAutoConnectBluetooth, 3000);
      };
      await characteristic.startNotifications();
      characteristic.addEventListener("characteristicvaluechanged", onBlePacket);
      let hasHistory = false;
      try {
        controlCharacteristic = await service.getCharacteristic(bleControlUuid);
        historyCharacteristic = await service.getCharacteristic(bleHistoryUuid);
        await historyCharacteristic.startNotifications();
        historyCharacteristic.addEventListener("characteristicvaluechanged", onHistoryPacket);
        hasHistory = true;
      } catch (_error) {
        controlCharacteristic = null;
        historyCharacteristic = null;
        state.historyStatus = "Live meter connected. Upload the new ESP32 firmware to enable seven-day history.";
      }
      if (hasHistory) historyLoading = true;
      onBlePacket({ target: { value: await characteristic.readValue() } });
      if (hasHistory) { historyLoading = false; await requestHistory(); }
      if (bluefyPhone && state.pairedDeviceId && !firebaseStore && state.authProvider !== "local") {
        continueLocally();
      } else if (state.pairedDeviceId && !firebaseStore && state.authProvider !== "local") {
        state.pendingAuthScreen = "home";
        renderAuthGate();
      }
    } catch (error) {
      if (device.gatt?.connected) device.gatt.disconnect();
      state.pairStatus = `Bluetooth connection failed: ${error.message || error.name}`;
      render(true);
    } finally {
      bleConnecting = false;
    }
  }

  async function tryAutoConnectBluetooth() {
    if (!state.pairedDeviceId || bleConnecting || bleDevice?.gatt?.connected || !navigator.bluetooth?.getDevices) return;
    try {
      const granted = await navigator.bluetooth.getDevices();
      let remembered = {};
      try { remembered = JSON.parse(localStorage.getItem(grantedDeviceKey) || "{}"); } catch (_error) {  }
      if (remembered.qrId === state.pairedDeviceId) {
        const match = granted.find(device => device.id === remembered.bluetoothId);
        if (match) { await connectSelectedBluetoothDevice(match); return; }
      }
      const suffix = state.pairedDeviceId.slice(-4).toUpperCase();
      const matches = granted.filter(device => device.name === `UTLT-${suffix}`);
      if (matches.length === 1) await connectSelectedBluetoothDevice(matches[0]);
    } catch (_error) {  }
  }

  function connectBluetooth() {
    if (!state.pairedDeviceId) return;
    if (!navigator.bluetooth?.requestDevice) {
      state.pairStatus = "Bluetooth needs Chrome on Android or Bluefy on iPhone. iPhone Chrome cannot connect to BLE devices.";
      render(true);
      return;
    }
    const expectedName = `UTLT-${state.pairedDeviceId.slice(-4).toUpperCase()}`;
    navigator.bluetooth.requestDevice({ filters: [{ name: expectedName }], optionalServices: [bleServiceUuid] })
      .then(connectSelectedBluetoothDevice)
      .catch(error => {
        state.pairStatus = error.name === "NotFoundError" ? `No ${expectedName} selected. Make sure the ESP32 is powered, nearby, and advertising that name.` : `Bluetooth connection failed: ${error.message || error.name}`;
        render(true);
      });
  }

  root.addEventListener("utlt-demo-change", async event => {
    if (state.screen !== "home" || state.utility !== "Water" || !state.demoEnabled) return;
    state.demoMode = event.target.dataset.demoLab;
    state.demoPhase = Number(event.target.dataset.demoPhase);
    state.demoScenario = state.demoMode === "sample" ? null :
      window.UTLTDemo.dashboardData(state.demoMode, state.demoPhase, window.UTLTAI.indiaDate(new Date()));
    state.readings = state.demoScenario?.readings ?? window.UTLTData.demoReadings;
    await render(true);
    root.querySelector(event.detail.selector)?.focus({ preventScroll: true });
  });

  // The model can be cached across visits. Chat messages stay in memory.
  const niroModelKey = "niroSmolLM2Q8Ready";
  function previouslyDownloadedNiro() {
    try { return localStorage.getItem(niroModelKey) === "true"; }
    catch { return false; }
  }

  async function loadNiroModel() {
    if (state.llmBusy || state.llmReady || !window.UTLTLocalLLM.supported()) return;
    state.llmBusy = true;
    state.llmStatus = "Preparing Niro…";
    render(true);
    try {
      await window.UTLTLocalLLM.load(percent => {
        state.llmStatus = `Downloading model: ${percent}%`;
        const status = root.querySelector(".niro-download [role=status]");
        if (status) status.textContent = state.llmStatus;
      });
      state.llmReady = true;
      state.llmStatus = "";
      try { localStorage.setItem(niroModelKey, "true"); } catch { }
    } catch (error) {
      state.llmStatus = `Could not start Niro: ${error.message}`;
      try { localStorage.removeItem(niroModelKey); } catch { }
    } finally {
      state.llmBusy = false;
      if (state.screen === "assistant") render(true);
    }
  }

  // The visible height can shrink independently when an iPhone keyboard opens.
  const visibleViewport = window.visualViewport;
  if (visibleViewport) {
    const resizeChat = () => {
      if (visibleViewport.scale !== 1) return;
      root.style.setProperty("--chat-viewport", `${visibleViewport.height}px`);
      root.classList.toggle("niro-compact-viewport", visibleViewport.height <= 460);
    };
    visibleViewport.addEventListener("resize", resizeChat);
    resizeChat();
  }

  root.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "language-menu") { state.languageMenuOpen = !state.languageMenuOpen; render(true); return; }
    if (action === "select-language") {
      state.language = isAppLanguage(button.dataset.value) ? button.dataset.value : "en";
      try { localStorage.setItem(languageKey, state.language); } catch (_error) { }
      state.languageMenuOpen = false;
      persistProfile();
      render(true);
      return;
    }
    if (action === "niro-setup-skip") { finishNiroSetup(); return; }
    if (action === "niro-setup-edit" && state.niroGoalDraft) {
      state.niroGoalDraft.editing = true;
      render();
      return;
    }
    if (action === "niro-new") {
      state.niroMessages = [];
      state.llmQuestion = "";
      render(true);
      root.querySelector("#utlt-assistant-question")?.focus();
      return;
    }
    if (action === "niro-wave") { window.UTLTNiro.wave(button); return; }
    if (action === "tour") { state.tourStep = (state.tourStep + 1) % (helpTour.length + 1); render(true); return; }
    if (action === "niro") {
      state.assistantMode = "ask";
      state.languageMenuOpen = false;
      if (state.qrScanning) stopQrScanner();
      state.screen = "assistant";
      render();
      if (state.utility === "Water" && previouslyDownloadedNiro()) loadNiroModel();
      return;
    }
    if (action === "scan-qr") { startQrScanner(); return; }
    if (action === "stop-qr") { stopQrScanner(); state.pairStatus = "Scan stopped."; render(true); return; }
    if (action === "connect-ble") { connectBluetooth(); return; }
    if (action === "download-history") { requestHistory(); return; }
    if (action === "assistant-mode") { state.assistantMode = ["today", "recent", "ask"].includes(button.dataset.mode) ? button.dataset.mode : "today"; render(true); return; }
    if (action === "forecast-follow-up") { state.assistantMode = "ask"; state.llmQuestion = "Will I stay within my water goal by 8 pm?"; render(true); root.querySelector("#utlt-assistant-question")?.focus(); return; }
    if (action === "assistant-prompt") { askNiro(button.dataset.question || ""); return; }
    if (action === "load-local-llm") { loadNiroModel(); return; }
    if (action === "toggle-demo") {
      if (state.device.connected) return;
      state.demoEnabled = !state.demoEnabled;
      state.demoMessages = [];
      state.demoScenario = null;
      if (state.demoEnabled) {
        state.readings = window.UTLTData.demoReadings;
        state.usingDemo = true;
        state.demoMode = "sample";
        state.demoPhase = 0;
      } else {
        state.readings = savedMeterReadings().readings;
        state.usingDemo = state.readings.length === 0;
      }
      try { localStorage.setItem(demoKey, String(state.demoEnabled)); } catch (_error) {  }
      render(true);
      return;
    }
    if (action === "reset-meter-readings") {
      try { localStorage.removeItem(directReadingsKey); } catch (_error) {  }
      state.readings = [];
      state.usingDemo = false;
      state.flowWarning = "";
      state.flowRateLpm = null;
      state.rawPulseCount = null;
      state.pulseRateHz = null;
      state.pairStatus = "Readings cleared. The next packet sets a fresh baseline.";
      render(true);
      return;
    }
    if (action === "account-sign-in") { state.pendingAuthScreen = "account"; renderAuthGate(); return; }
    if (action === "auth-theme") { state.dark = !state.dark; renderAuthGate(); return; }
    if (action === "login-google") { signInWithGoogle(); return; }
    if (action === "continue-local") { continueLocally(); return; }
    else if (action === "sign-out") { signOutOfApp().catch(error => renderAuthGate(error.message)); return; }
    else if (action === "theme") { saveAppearance(!state.dark); }
    else if (action === "refresh-device") { refreshWaterBridge(); return; }
    else if (action === "utility") {
      state.utility = button.dataset.value;
      persistProfile();
      if (state.screen === "assistant" && state.utility === "Water" && previouslyDownloadedNiro()) loadNiroModel();
    }
    else if (action === "breakdown") { state.breakdown = button.dataset.value; persistProfile(); }
    else if (action === "copy-code") {
      if (state.friendCode && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(state.friendCode).then(() => { state.friendMessage = "Friend code copied!"; render(true); }).catch(() => { state.friendMessage = "Copy failed. Select the code and copy it manually."; render(true); });
      }
      return;
    } else if (action === "leaderboard-privacy") {
      state.leaderboardVisible = button.checked === true;
      persistProfile();
      syncCompetitionStats().then(() => { state.friendMessage = "Leaderboard privacy updated."; render(true); });
    } else if (action === "accept-request" || action === "decline-request") {
      state.friendBusy = true; state.friendMessage = "Updating request…"; render(true);
      firebaseStore.answerFriendRequest(button.dataset.requestId, action === "accept-request")
        .then(async () => { await refreshFriendData(); state.friendMessage = action === "accept-request" ? "Friend added!" : "Request declined."; })
        .catch(error => { state.friendMessage = error.message || "Could not update request."; })
        .finally(() => { state.friendBusy = false; render(true); });
      return;
    } else if (action === "remove-friend") {
      if (!confirm("Remove this friend?")) return;
      firebaseStore.removeFriend(button.dataset.friendUid).then(async () => { await refreshFriendData(); state.friendMessage = "Friend removed."; })
        .catch(error => { state.friendMessage = error.message || "Could not remove friend."; }).finally(() => render(true));
      return;
    } else if (action === "family-invite") {
      state.familyBusy=true; firebaseStore.createFamilyInvite().then(v=>{state.familyInviteUrl=v.url;state.familyMessage="QR invitation created.";}).catch(e=>{state.familyMessage=e.message||"Could not create invite.";}).finally(()=>{state.familyBusy=false;render(true);}); return;
    } else if (action === "family-refresh") { firebaseStore.loadFamily().then(async family=>{state.family=family;await refreshFamilyData();state.familyMessage="Family status refreshed.";}).catch(e=>{state.familyMessage=e.message||"Could not refresh family.";}).finally(()=>render(true)); return;
    } else if (action === "family-copy") { navigator.clipboard?.writeText(state.familyInviteUrl).then(()=>{state.familyMessage="Invite link copied.";render(true);}); return;
    } else if (action === "family-join") {
      state.familyBusy=true; firebaseStore.getFamilyInvite(state.pendingFamilyInvite).then(async inv=>{if(!inv)throw new Error("This invite expired. Ask for a new QR code.");if(inv.ownerUid===state.uid)throw new Error("You cannot join your own family.");await firebaseStore.requestFamilyJoin(state.pendingFamilyInvite,inv);state.pendingFamilyInvite="";history.replaceState({},"",location.pathname);state.familyMessage="Request sent. The owner must approve you.";}).catch(e=>{state.familyMessage=e.message||"Could not send request.";}).finally(()=>{state.familyBusy=false;render(true);}); return;
    } else if (action === "family-approve" || action === "family-decline") {
      const req=state.familyRequests.find(x=>x.id===button.dataset.requestId);if(!req)return;firebaseStore.decideFamilyRequest(req,action==="family-approve").then(async()=>{state.familyMessage=action==="family-approve"?"Member approved.":"Request declined.";await refreshFamilyData();}).catch(e=>{state.familyMessage=e.message||"Could not update request.";}).finally(()=>render(true));return;
    } else if (["home", "pair", "account", "device", "family", "review", "assistant", "help", "reports"].includes(action)) {
      state.languageMenuOpen = false;
      if (action !== "pair" && state.qrScanning) stopQrScanner();
      if (action === "family" && !firebaseStore && !bluefyPhone) {
        state.pendingAuthScreen = action;
        state.authMessage = "";
        renderAuthGate();
        return;
      }
      state.screen=action;state.saved=false;
      if(action==="family" && firebaseStore) {
        firebaseStore.loadFamily().then(async family=>{state.family=family;await refreshFamilyData();}).catch(e=>{state.familyMessage=e.message||"Could not load family.";}).finally(()=>render(true));
      }
    }
    render(action === "theme" || action === "utility" || action === "breakdown");
  });

  root.addEventListener("input", (event) => {
    if (event.target.form?.id === "niro-study-form") event.target.setCustomValidity("");
    if (event.target.form?.id === "utlt-calibration-form") event.target.form.elements.pulseRate.setCustomValidity("");
  });

  root.addEventListener("change", (event) => {
    if (event.target.id === "utlt-qr-photo") { scanQrPhoto(event.target.files?.[0]); return; }
    if (event.target.matches('input[data-action="community-sharing"]')) {
      state.communitySharing = event.target.checked === true;
      state.communityPercentile = null;
      state.communityStatus = state.communitySharing ? "loading" : "off";
      persistProfile();
      syncCommunityInsight().then(() => {
        state.friendMessage = state.communitySharing ? "Anonymous community sharing updated." : "Community sharing turned off.";
        render(true);
      });
      return;
    }
    if (event.target.matches('input[data-action="leaderboard-privacy"]')) {
      state.leaderboardVisible = event.target.checked;
      persistProfile();
      syncCompetitionStats().then(() => {
        state.friendMessage = "Leaderboard privacy updated.";
        render(true);
      });
    }
  });
  async function askNiro(message) {
    const question = message.trim().slice(0, 300);
    if (!question || state.llmBusy || !state.llmReady || !state.niroSetupDone || state.utility !== "Water") return;
    state.llmQuestion = "";
    const thread = state.niroMessages = [...state.niroMessages.slice(-18), { role: "user", text: question }];
    // Use checked meter answers before asking the optional local model.
    const checked = window.UTLTNiro.answer(question, state);
    let text = checked?.text || checkedWaterAnswer(question);
    if (!text) {
      state.llmBusy = true;
      state.llmStatus = "Thinking…";
      render(true);
      try {
        text = (await window.UTLTLocalLLM.ask(question, assistantFacts())).answer;
      } catch (_error) {
        text = "I couldn’t verify an explanation. Try asking for the chart or table behind the numbers.";
      } finally { state.llmBusy = false; }
    }
    thread.push({ role: "bot", ...checked,
      text: text || "Try asking for a daily total, chart or table, or download the local model for general explanations." });
    state.llmStatus = "";
    if (state.screen === "assistant") {
      await render(true);
      root.querySelector(".niro-thread")?.lastElementChild?.scrollIntoView({ block:"nearest" });
    }
  }

  root.addEventListener("keydown", event => {
    if (event.target.id !== "utlt-assistant-question" || event.key !== "Enter" ||
        event.shiftKey || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    if (!state.llmBusy) event.target.form.requestSubmit();
  });

  root.addEventListener("submit", async (event) => {
    if (event.target.id === "utlt-calibration-form") {
      event.preventDefault();
      const form = new FormData(event.target);
      const pulseRate = Number(form.get("pulseRate"));
      const factor = calibrationFactor(pulseRate);
      if (!factor) {
        const field = event.target.elements.pulseRate;
        field.setCustomValidity("Enter a pulse rate from 0.01 to 400 pulses per second.");
        field.reportValidity();
        return;
      }
      try {
        localStorage.setItem(calibrationKey, JSON.stringify({ pulseRate, seconds: calibrationDurationSeconds }));
      } catch (_error) {
        state.calibrationStatus = "Calibration could not be saved on this browser.";
        render(true);
        return;
      }
      const previousFactor = state.pulsesPerLitre;
      calibrationPulseRate = pulseRate;
      hasCustomCalibration = true;
      state.pulsesPerLitre = factor;
      state.calibrationStatus = "Calibration saved on this browser.";
      if (bridgeSignature) {
        bridgeSignature = "";
        refreshWaterBridge();
      } else if (!state.usingDemo) {
        state.readings = convertReadings(state.readings, previousFactor, factor);
        if (state.pulseRateHz !== null) state.flowRateLpm = state.pulseRateHz * 60 / factor;
        syncFamilyUsage();
        syncCommunityInsight();
        syncCompetitionStats();
      }
      render(true);
      return;
    }
    if (event.target.id === "niro-coach-form") {
      event.preventDefault();
      if (!state.demoEnabled || state.demoMode !== "coach" || state.screen !== "home" || state.utility !== "Water") return;
      const question = String(new FormData(event.target).get("question") || "").trim().slice(0, 300);
      if (!question) return;
      if (state.llmBusy) return;
      const conversation = [...state.demoMessages.slice(-10), { role: "user", text: question }];
      state.demoMessages = conversation;
      let answer = window.UTLTNiro.coachAnswer(question);
      if (!answer && state.llmReady) {
        state.llmBusy = true;
        const send = event.target.querySelector("button");
        send.disabled = true;
        send.textContent = "Thinking…";
        try {
          const facts = "Source: sample data. The meter measures flow and cannot identify activities. Allowed action: switch off the tap while scrubbing.";
          answer = { text: (await window.UTLTLocalLLM.ask(question, facts)).answer };
        } catch { }
        finally { state.llmBusy = false; }
      }
      if (state.demoMessages !== conversation) return;
      conversation.push({ role: "bot", ...(answer ||
        { text: "Try asking about this sample’s 8 pm forecast, daily goal, activity split, or ways to use less water." }) });
      const panel = root.querySelector(".niro-demo-chat");
      if (!panel) return;
      panel.outerHTML = window.UTLTNiro.coachChat(conversation);
      const updated = root.querySelector(".niro-demo-chat");
      const thread = updated.querySelector(".niro-demo-thread");
      thread.scrollTop = thread.scrollHeight;
      updated.querySelector("input").focus({ preventScroll: true });
      translateRenderedUi(++renderToken);
      return;
    }
    if (event.target.id === "utlt-assistant-form") {
      event.preventDefault();
      askNiro(String(new FormData(event.target).get("question") || ""));
      return;
    }
    if (event.target.id === "niro-study-form") {
      event.preventDefault();
      const study = window.UTLTNiro.studyQuestion(state, new Date(), Number(event.target.dataset.hour));
      if (!study || study.saved || study.day !== event.target.dataset.day ||
          study.peak.hour !== Number(event.target.dataset.hour)) return;
      const input = event.target.elements.activity;
      const unknown = event.submitter?.value === "unknown";
      const answer = input.value.trim();
      if (!unknown && !answer) {
        input.setCustomValidity("Enter a short answer or choose I don’t remember.");
        input.reportValidity();
        return;
      }
      const labels = unknown ? [] : window.UTLTNiro.activityLabels(answer);
      state.niroStudy.answers[study.day] = { hour: study.peak.hour, litres: study.peak.value, labels };
      saveNiroStudy();
      // The existing activity classifier learns only examples with one confirmed category.
      if (labels.length === 1 && labels[0] !== "Misc" && state.survey) {
        const times = study.peak.readings.map(item => Date.parse(item.recordedAt));
        const recordedAt = study.peak.readings.find(item => Date.parse(item.recordedAt) === Math.min(...times)).recordedAt;
        const session = { recordedAt, litres: study.peak.value, durationMinutes: (Math.max(...times) - Math.min(...times)) / 60000 };
        state.corrections = [...state.corrections, { features: window.UTLTAI.features(session, state.survey), category: labels[0] }].slice(-40);
        try { localStorage.setItem(correctionsKey, JSON.stringify(state.corrections)); } catch { }
      }
      render(true);
      return;
    }
    if (event.target.id === "niro-onboarding-form") {
      event.preventDefault();
      if (state.niroSetupBusy || state.niroSetupDone) return;
      const form = new FormData(event.target);
      const routine = {
        people: Number(form.get("people")),
        showerStyle: String(form.get("showerStyle")),
        typicalShowerMinutes: Number(form.get("typicalShowerMinutes")) || 8,
        laundryDaysPerWeek: Number(form.get("laundryDaysPerWeek")),
        washingMachine: form.has("washingMachine"),
        cookingMealsPerDay: Number(form.get("cookingMealsPerDay")),
        outdoorDays: Number(form.get("outdoorDays")),
        dishwashing: String(form.get("dishwashing")),
        dishwasher: form.get("dishwashing") !== "hand",
        garden: Number(form.get("outdoorDays")) > 0,
      };
      const draft = { routine, knownLitres: Number(form.get("knownLitres")) || null,
        note: String(form.get("note") || "").trim().slice(0, 240) };
      state.niroGoalDraft = draft;
      state.niroSetupBusy = true;
      if (event.submitter) event.submitter.disabled = true;
      let focus;
      if (draft.note) {
        render(true);
        try { focus = (await window.UTLTLocalLLM.routineFocus(draft.note)).focus; } catch { }
      }
      if (state.niroGoalDraft !== draft) return;
      Object.assign(draft, window.UTLTNiro.startingGoal(routine, draft.knownLitres, focus, draft.note));
      state.niroSetupBusy = false;
      if (state.screen === "assistant") render();
      return;
    }
    if (event.target.id === "niro-goal-form") {
      event.preventDefault();
      const goal = Number(new FormData(event.target).get("goal"));
      if (Number.isInteger(goal) && goal >= 1 && goal <= 100000) finishNiroSetup(goal);
      return;
    }
    if (event.target.id === "utlt-review-form") {
      event.preventDefault();
      const day = window.UTLTAI.indiaDate(new Date());
      if (!window.UTLTAI.reviewEligible(state.survey) || state.reviewedDays.includes(day)) return;
      const groups = reviewSessions();
      const form = new FormData(event.target);
      const allowed = new Set(window.UTLTData.categories.map(item => item.label));
      groups.forEach((group, index) => {
        const label = String(form.get(`label-${index}`) || "");
        if (!allowed.has(label)) return;
        group.keys.forEach(key => { state.confirmedLabels[key] = label; });
        state.corrections.push({ features: window.UTLTAI.features(group, state.survey), category: label });
      });
      state.corrections = state.corrections.slice(-40);
      state.readings = state.readings.map(item => {
        const category = state.confirmedLabels[String(item.bucketEpoch || item.recordedAt)];
        return category ? { ...item, category, verifiedCategory: true } : item;
      });
      state.reviewedDays.push(day);
      try {
        localStorage.setItem(reviewKey, JSON.stringify(state.reviewedDays));
        localStorage.setItem(labelsKey, JSON.stringify(state.confirmedLabels));
        localStorage.setItem(correctionsKey, JSON.stringify(state.corrections));
        const saved = savedMeterReadings();
        saved.readings = state.readings;
        localStorage.setItem(directReadingsKey, JSON.stringify(saved));
      } catch (_error) {  }
      state.screen = "home";
      render();
      return;
    }
    if (event.target.id === "utlt-friend-add-form") {
      event.preventDefault();
      if (!firebaseStore) { state.friendMessage = "Firebase is not connected yet. Check Firebase setup first."; render(true); return; }
      const code = String(new FormData(event.target).get("friendCode") || "").trim().toUpperCase();
      state.friendBusy = true; state.friendMessage = "Looking up friend code…"; render(true);
      try {
        const target = await firebaseStore.lookupFriendCode(code);
        if (!target) throw new Error("That friend code was not found.");
        if (target.uid === state.uid) throw new Error("That is your own friend code.");
        await firebaseStore.sendFriendRequest(target.uid, target.displayName, state.name, code);
        state.friendMessage = "Friend request sent!";
        await refreshFriendData();
      } catch (error) { state.friendMessage = error.message || "Could not send friend request."; }
      state.friendBusy = false; render(true); return;
    }
    if (event.target.id !== "utlt-account-form") return;
    event.preventDefault();
    const form = new FormData(event.target);
    state.name = String(form.get("name") || "").trim();
    state.email = String(form.get("email") || "").trim();
    state.homeName = String(form.get("homeName") || "").trim();
    state.goal = Math.max(1, Number(form.get("goal")) || 350);
    persistProfile();
    if (firebaseStore && state.friendCode) firebaseStore.updateFriendName(state.friendCode, state.name).catch(error => console.warn("Could not update friend code display name.", error));
    syncCompetitionStats();
    state.saved = true;
    render(true);
  });
  window.UTLT = Object.freeze({
    setReadings(readings) {
      if (!Array.isArray(readings)) throw new TypeError("Readings must be an array");
      state.readings = readings;
      state.usingDemo = false;
      syncFamilyUsage();
      syncCommunityInsight().then(() => { if (state.screen === "home" || state.screen === "family") renderMeterUpdate(); });
      renderMeterUpdate();
    },
    setDevice(device) {
      state.device = {
        connected: Boolean(device?.connected),
        lastConnectedAt: device?.lastConnectedAt || state.device.lastConnectedAt
      };
      renderMeterUpdate();
    },
    getState() {
      return { ...state, device: { ...state.device }, readings: [...state.readings] };
    }
  });
  let bridgeSignature = "";
  let bridgeReadingsSignature = "";
  function excessiveFlowWarning(rateLpm) {
    return rateLpm > 6
      ? `Sensor signal is too fast (${rateLpm.toFixed(1)} L/min). This sensor is rated to 5 L/min, so these pulses were not added. Check wiring and try separate pump power.` : "";
  }
  function applyStandaloneReading(payload) {
    const total = Number(payload.totalPulses);
    if (!Number.isSafeInteger(total) || total < 0 || typeof payload.session !== "string") throw new Error("Invalid meter reading");
    const pulsesPerLitre = state.pulsesPerLitre;
    const saved = savedMeterReadings();
    const now = Date.now();
    const sameSession = saved.session === payload.session && Number.isSafeInteger(saved.lastPulses) && saved.lastPulses <= total;
    const previous = sameSession ? saved.lastPulses : total;
    const elapsedMs = sameSession && Number.isFinite(saved.lastObservedAt) ? now - saved.lastObservedAt : 0;
    const rawDelta = total - previous;
    const rateLpm = elapsedMs >= 500 ? rawDelta * 60000 / (pulsesPerLitre * elapsedMs) : 0;
    const impossibleFlow = elapsedMs >= 500 && rateLpm > 6; // Sensor is rated to 5 L/min.
    const hadFlowAlert = state.flowRunningMinutes >= 16;
    if (sameSession && elapsedMs >= 500 && elapsedMs <= 10000 && rawDelta > 0 && !impossibleFlow) {
      state.flowStartedAt = state.flowStartedAt || now;
      state.flowRunningMinutes = (now - state.flowStartedAt) / 60000;
    } else {
      state.flowStartedAt = null;
      state.flowRunningMinutes = 0;
    }
    const previousWarning = state.flowWarning;
    state.flowRateLpm = rateLpm;
    state.rawPulseCount = total;
    state.pulseRateHz = elapsedMs >= 500 ? rawDelta * 1000 / elapsedMs : null;
    state.flowWarning = excessiveFlowWarning(rateLpm);
    const readings = Array.isArray(saved.readings) ? saved.readings.filter(item => item && typeof item.recordedAt === "string" && Date.parse(item.recordedAt) >= Date.now() - 7 * 86400000) : [];
    const delta = impossibleFlow ? 0 : rawDelta;
    if (delta > 0) {
      const indiaTime = new Date(Date.now() + 330 * 60000).toISOString().replace("Z", "+05:30");
      readings.push({ recordedAt: indiaTime, litres: delta / pulsesPerLitre, category: "Misc" });
    }
    try { localStorage.setItem(directReadingsKey, JSON.stringify({ session: payload.session, lastPulses: total, lastObservedAt: now, readings, pulsesPerLitre })); } catch (_error) {  }
    const changed = delta > 0 || state.usingDemo || !state.device.connected || previousWarning !== state.flowWarning || hadFlowAlert !== (state.flowRunningMinutes >= 16);
    state.readings = readings;
    state.usingDemo = false;
    if (state.demoEnabled) {
      state.demoEnabled = false;
      state.demoScenario = null;
      try { localStorage.setItem(demoKey, "false"); } catch (_error) {  }
    }
    state.bridgeAvailable = true;
    rememberConnected();
    if (delta > 0) { syncFamilyUsage(); syncCommunityInsight(); syncCompetitionStats(); }
    return changed;
  }
  async function refreshWaterBridge() {
    if (pagesPreview || bleDevice?.gatt?.connected) return;
    try {
      const response = await fetch("/api/water", { cache: "no-store" });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Bridge unavailable");
      const payload = await response.json();
      if (payload.mode === "standalone") {
        if (applyStandaloneReading(payload)) renderMeterUpdate();
        return;
      }
      if (!Array.isArray(payload.readings) || !payload.device) throw new Error("Invalid bridge response");
      state.bridgeAvailable = true;
      const signature = JSON.stringify(payload);
      if (signature === bridgeSignature) return;
      bridgeSignature = signature;
      state.device = { connected: Boolean(payload.device.connected), lastConnectedAt: payload.device.lastConnectedAt || null };
      if (payload.device.lastConnectedAt || payload.readings.length) {
        const bridgeFactor = Number(payload.pulsesPerLitre);
        state.readings = hasCustomCalibration && bridgeFactor > 0 && Number.isFinite(bridgeFactor)
          ? convertReadings(payload.readings, bridgeFactor, state.pulsesPerLitre) : payload.readings;
        const readingsSignature = JSON.stringify(state.readings);
        state.usingDemo = false;
        if (state.demoEnabled) {
          state.demoEnabled = false;
          state.demoScenario = null;
          try { localStorage.setItem(demoKey, "false"); } catch (_error) {  }
        }
        if (readingsSignature !== bridgeReadingsSignature) {
          bridgeReadingsSignature = readingsSignature;
          syncFamilyUsage();
          syncCommunityInsight();
          syncCompetitionStats();
        }
      }
      renderMeterUpdate();
    } catch (_error) {
      bridgeSignature = "";
      if (state.bridgeAvailable) {
        state.bridgeAvailable = false;
        state.device.connected = false;
        renderMeterUpdate();
      }
    }
  }
  initializePersistence();
  window.UTLTAI.ready.then(() => { if (["home", "review"].includes(state.screen)) render(true); });
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("./sw.js").catch(() => {  });
  }
  tryAutoConnectBluetooth();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      tryAutoConnectBluetooth();
      if (state.screen === "assistant" && state.assistantMode === "today" && !root.querySelector("#niro-study-form:focus-within")) render(true);
    }
  });
  setInterval(() => {
    if (document.visibilityState === "visible") tryAutoConnectBluetooth();
  }, 15000);
  setInterval(() => {
    if (document.visibilityState === "visible" && state.screen === "assistant" && state.assistantMode === "today" && !root.querySelector("#niro-study-form:focus-within")) render(true);
  }, 60000);
  refreshWaterBridge();
  setInterval(refreshWaterBridge, 5000);
})();
