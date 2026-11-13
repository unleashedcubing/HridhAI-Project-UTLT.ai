/* Standalone UTLT.ai UI with Firebase Authentication and Cloud Firestore profile sync.
   Icon paths: Tabler Icons v3.44.0, MIT. */
(function () {
  "use strict";

  // Remove only legacy UTLT app data. Firebase's own auth persistence is kept.
  function clearLegacyAppData() {
    try {
      for (const key of Object.keys(localStorage)) if (key.startsWith("utlt-") || key.startsWith("UTLT")) localStorage.removeItem(key);
      for (const key of Object.keys(sessionStorage)) if (key.startsWith("utlt-") || key.startsWith("UTLT")) sessionStorage.removeItem(key);
    } catch (error) { console.warn("Could not clear all legacy UTLT browser data.", error); }
  }
  clearLegacyAppData();
  const standaloneDevice = location.hostname === "192.168.4.1";
  const pagesPreview = location.hostname.endsWith(".github.io");
  const bleServiceUuid = "930a7d60-8489-4b31-9cc6-64ee5e809100";
  const bleReadingUuid = "930a7d60-8489-4b31-9cc6-64ee5e809101";
  const bleControlUuid = "930a7d60-8489-4b31-9cc6-64ee5e809102";
  const bleHistoryUuid = "930a7d60-8489-4b31-9cc6-64ee5e809103";
  const pairingKey = "waterMeterPairingV1";
  const calibrationKey = "waterMeterCalibrationV1";
  const grantedDeviceKey = "waterMeterGrantedBluetoothV1";
  const demoKey = "waterMeterDemoEnabledV1";
  const surveyKey = "waterSurveyV1";
  const reviewKey = "waterReviewedDaysV1";
  const labelsKey = "waterConfirmedLabelsV1";
  const correctionsKey = "waterModelCorrectionsV1";
  const lastConnectedKey = "waterLastConnectedV1";
  let savedPairing = "";
  try { savedPairing = localStorage.getItem(pairingKey) || ""; } catch (_error) { /* Pairing still works in this tab. */ }
  // Fixed demo conversion from the measured 160 mL timing range.
  const pulsesPerLitre = 4075;
  let demoEnabled = false;
  let savedSurvey = null, reviewedDays = [], confirmedLabels = {}, corrections = [], lastConnected = null;
  try {
    const stored = Number(localStorage.getItem(calibrationKey));
    if (stored !== pulsesPerLitre) {
      localStorage.removeItem("waterMeterReadingsV1");
    }
    localStorage.setItem(calibrationKey, String(pulsesPerLitre));
    demoEnabled = localStorage.getItem(demoKey) === "true";
    savedSurvey = JSON.parse(localStorage.getItem(surveyKey) || "null");
    reviewedDays = JSON.parse(localStorage.getItem(reviewKey) || "[]");
    confirmedLabels = JSON.parse(localStorage.getItem(labelsKey) || "{}");
    corrections = JSON.parse(localStorage.getItem(correctionsKey) || "[]");
    const savedConnection = JSON.parse(localStorage.getItem(lastConnectedKey) || "null");
    if (savedConnection?.qrId === savedPairing) lastConnected = savedConnection.at;
  } catch (_error) { /* The fixed conversion remains available. */ }
  const state = {
    screen: "home",
    utility: "Water",
    breakdown: "use",
    dark: true,
    name: "",
    email: "",
    homeName: "My home",
    goal: 350,
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
    pulsesPerLitre,
    currentMeterSession: "",
    bridgeAvailable: false,
    readings: demoEnabled ? window.UTLTData.demoReadings : [],
    usingDemo: true,
    demoEnabled,
    survey: savedSurvey,
    reviewedDays,
    confirmedLabels,
    corrections,
    historyStatus: "",
    unknownPulses: 0,
    llmReady: false, llmBusy: false, llmStatus: "", llmQuestion: "", llmAnswer: "", llmAnswerType: "checked", assistantMode: "recent",
    syncStatus: "starting",
    syncError: "",
    uid: "", friendCode: "", friends: [], friendRequests: [], friendStats: [],
    leaderboardVisible: false, communitySharing: false,
    communityPercentile: null, communityParticipants: 0, communityStatus: "off", friendMessage: "", friendBusy: false,
    family: null, familyInviteUrl: "", familyRequests: [], familyMessage: "", familyBusy: false, pendingFamilyInvite: "",
    authProvider: "signed-out", authBusy: false, authMessage: "", pendingAuthScreen: ""
  };

  // Firebase initializes in the background; the dashboard is available without signing in.
  const firebaseReady = (async () => {
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
  let saveQueue = Promise.resolve();
  function profileSnapshot() {
    return {
      name: state.name, email: state.email, utility: state.utility,
      dark: state.dark, homeName: state.homeName, goal: state.goal,
      breakdown: state.breakdown, leaderboardVisible: state.leaderboardVisible, communitySharing: state.communitySharing
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
      // Guest mode keeps settings in memory; Google sign-in is only needed for cloud features.
      state.syncStatus = "guest";
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
    state.leaderboardVisible = profile.leaderboardVisible === true;
    state.communitySharing = profile.communitySharing === true;
  }
  function renderAuthGate(errorMessage = "") {
    state.screen = "auth";
    const destination = state.pendingAuthScreen || "this feature";
    const featureName = destination === "family" ? "Family Connect" : destination === "account" ? "your account" : "device setup";
    const message = errorMessage || state.authMessage || `Sign in with Google to use ${featureName}. Your dashboard remains available without signing in.`;
    root.innerHTML = `<div class="utlt-app ${state.dark ? "utlt-dark" : ""}"><main class="utlt-auth-screen">
      <section class="utlt-auth-card">
        <div class="utlt-auth-top"><strong>UTLT.ai</strong><button type="button" data-action="auth-theme" aria-label="Switch to ${state.dark ? "light" : "dark"} mode">${icon(state.dark ? "sun" : "moon", 22)}</button></div>
        <div class="utlt-auth-mark" aria-hidden="true">${icon("droplet", 31)}</div>
        <p class="utlt-eyebrow">UTLT.AI · SMART WATER</p>
        <h1>Welcome to UTLT.ai</h1>
        <p class="utlt-auth-intro">Your water, clearly understood.</p>
        <div class="utlt-auth-feature">${icon("shield", 20)}<span>Sign in to save your family profile and settings.</span></div>
        <button class="utlt-primary-button utlt-auth-google" type="button" data-action="login-google" ${state.authBusy ? "disabled" : ""}>${state.authBusy ? "Connecting…" : "Continue with Google"}</button>
        <button class="utlt-auth-secondary" type="button" data-action="auth-cancel">Continue without an account</button>
        <p class="utlt-auth-message" role="status">${escapeHtml(message)}</p>
        <p class="utlt-auth-note">Google is needed for Family and cloud account features. Your water dashboard and local device work as a guest.</p>
      </section></main></div>`;
  }

  async function completeGoogleLogin(user) {
    firebaseStore = createFirebaseStore(user, firebaseContext);
    state.uid = firebaseStore.uid;
    state.authProvider = "google";
    state.email = user.email || "";
    state.name = user.displayName || "";
    const remoteProfile = await firebaseStore.loadProfile();
    if (remoteProfile) applySavedProfile(remoteProfile);
    if (user.email) state.email = user.email;
    if (!state.name && user.displayName) state.name = user.displayName;
    if (!remoteProfile) await firebaseStore.saveProfile(profileSnapshot());
    state.pendingFamilyInvite = new URLSearchParams(location.search).get("familyInvite") || state.pendingFamilyInvite || "";
    const destination = state.pendingAuthScreen || (state.screen === "auth" ? "home" : state.screen);
    state.pendingAuthScreen = "";
    state.screen = destination;
    if (destination === "family") {
      state.family = await firebaseStore.loadFamily();
      await refreshFamilyData();
      await syncFamilyUsage();
    }
    await syncCommunityInsight();
    state.syncStatus = "cloud";
    state.syncError = "";
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
    if (state.authBusy) return;
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
      state.authBusy = false;
      await completeGoogleLogin(user);
    } catch (error) {
      state.authMessage = error?.message || "Google sign-in could not be completed.";
      state.authBusy = false; renderAuthGate(state.authMessage); return;
    }
    state.authBusy = false;
  }

  async function initializePersistence() {
    // Show the device-ready dashboard immediately. Firebase is only needed for protected features.
    render();
    try {
      firebaseContext = await firebaseReady;
      const user = firebaseContext.auth.currentUser;
      if (user && user.providerData?.some(item => item.providerId === "google.com")) await completeGoogleLogin(user);
      else {
        state.pendingFamilyInvite = new URLSearchParams(location.search).get("familyInvite") || "";
        if (state.screen !== "auth") render();
      }
    } catch (error) {
      state.syncStatus = "guest";
      state.syncError = "";
      console.error("UTLT Firebase is unavailable; guest dashboard remains usable.", error);
      if (state.screen !== "auth") render();
    }
  }

  async function signOutOfApp() {
    if (!firebaseContext) return;
    await firebaseContext.authSdk.signOut(firebaseContext.auth);
    firebaseStore = null; state.uid = ""; state.name = ""; state.email = ""; state.friendCode = "";
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
    flame: '<path d="M12 12c2 -2.96 0 -7 -1 -8c0 3.038 -1.773 4.741 -3 6c-1.226 1.26 -2 3.24 -2 5a6 6 0 1 0 12 0c0 -1.532 -1.056 -3.94 -2 -5c-1.786 3 -2.791 3 -4 2z"/>',
    bolt: '<path d="M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11"/>',
    droplet: '<path d="M7.502 19.423c2.602 2.105 6.395 2.105 8.996 0c2.602 -2.105 3.262 -5.708 1.566 -8.546l-4.89 -7.26c-.42 -.625 -1.287 -.803 -1.936 -.397a1.376 1.376 0 0 0 -.41 .397l-4.893 7.26c-1.695 2.838 -1.035 6.441 1.567 8.546z"/>',
    trendDown: '<path d="M3 7l6 6l4 -4l8 8"/><path d="M21 10l0 7l-7 0"/>',
    trendUp: '<path d="M3 17l6 -6l4 4l8 -8"/><path d="M14 7l7 0l0 7"/>'
  };
  function icon(name, size = 24) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
  }

  function header() {
    const title = state.screen === "account" ? "Account" : state.screen === "family" ? "Family" : state.screen === "pair" ? "Pair Your Device" : state.screen === "device" ? "Device Settings" : state.screen === "survey" ? "Your Household" : state.screen === "review" ? "Review Water Use" : state.screen === "assistant" ? "UTLT.ai" : state.name.trim() ? `${state.name.trim().split(" ")[0]}’s UTLT` : "UTLT.ai";
    const connection = state.screen === "home" ? `<span class="utlt-connection-icon ${state.device.connected ? "is-connected" : "is-disconnected"}" role="img" aria-label="Device ${state.device.connected ? "connected" : "disconnected"}">${icon(state.device.connected ? "bluetooth" : "bluetoothOff", 16)}</span>` : "";
    const last = state.screen === "home" && !state.device.connected && state.device.lastConnectedAt ? `<span class="utlt-header-last">Last connected ${escapeHtml(new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(state.device.lastConnectedAt)))}</span>` : "";
    let actions = "";
    if (state.screen === "home") actions = `<div class="utlt-header-actions"><button class="utlt-icon-button" data-action="device" aria-label="Device settings">${icon("settings")}</button><button class="utlt-icon-button" data-action="theme" aria-label="Switch to ${state.dark ? "light" : "dark"} mode">${icon(state.dark ? "sun" : "moon")}</button></div>`;
    if (state.screen === "friends") actions = `<button class="utlt-icon-button" data-action="home" aria-label="Back to home">${icon("home")}</button>`;
    if (["account", "device", "survey", "review", "assistant"].includes(state.screen)) actions = `<button class="utlt-icon-button" data-action="home" aria-label="Back to home">${icon("home")}</button>`;
    return `<header class="utlt-header"><div class="utlt-title"><span>${escapeHtml(title)}</span>${connection}</div>${last}${actions}</header>`;
  }

  function utilityTabs() {
    const utilities = [["Water", "#1688f8"], ["Gas", "#528c00"], ["Electricity", "#baa500"]];
    return `<div class="utlt-pills" role="tablist" aria-label="Utility type">${utilities.map(([name, color]) => `<button class="utlt-pill ${state.utility === name ? "is-active" : ""}" role="tab" aria-selected="${state.utility === name}" data-action="utility" data-value="${name}" style="--utility-color:${color}">${name}</button>`).join("")}</div>`;
  }

  function usage(summary) {
    const goal = Math.max(1, Number(state.goal) || 350);
    const hasToday = summary.daily.at(-1)?.hasData;
    const percent = Math.round(summary.used / goal * 100);
    const dash = Math.min(summary.used / goal, 1) * circumference;
    return `<section class="utlt-usage"><div class="utlt-donut${summary.used > goal ? " is-over" : summary.used / goal >= 0.8 ? " is-warn" : ""}"><svg viewBox="0 0 193 193" role="img" aria-label="${hasToday ? percent + " percent of daily water goal used" : "No water reading today"}"><defs><linearGradient id="utlt-water-gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="var(--utlt-ring-start)"/><stop offset="100%" stop-color="var(--utlt-ring-end)"/></linearGradient></defs><circle class="utlt-donut-track" cx="96.5" cy="96.5" r="84"/><circle class="utlt-donut-value" cx="96.5" cy="96.5" r="84" style="stroke-dasharray:${dash} ${circumference}"/></svg><div class="utlt-donut-label"><strong>${hasToday ? percent + "%" : "—"}</strong><span>${hasToday ? "Used" : "No reading"}</span></div></div><div class="utlt-usage-summary"><strong>${hasToday ? number(summary.used) : "—"}</strong><span>/ ${goal} Litres</span></div></section>`;
  }

  function status(summary) {
    if (!summary.daily.at(-1)?.hasData) return `<section class="utlt-status-card" aria-live="polite"><span class="utlt-status-check">${icon("droplet", 22)}</span><div><strong>Waiting for today’s first reading</strong><p>Your water goal is ready. UTLT will show today’s use when the meter detects flow.</p></div></section>`;
    const goal = Math.max(1, Number(state.goal) || 350);
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
    const hour = new Date().getHours();
    const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const first = (state.name || "").trim().split(" ")[0];
    const today = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
    return `<div class="utlt-hero"><strong>${part}${first ? ", " + escapeHtml(first) : ""} 👋</strong><span>${today}</span></div>`;
  }

  function quickStats(summary) {
    const goal = Math.max(1, Number(state.goal) || 350);
    const left = Math.max(0, goal - summary.used);
    const pace = window.UTLTAI.paceInsight(state.readings);
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
    const goal = Math.max(1, Number(state.goal) || 350);
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
    if (!state.survey) return `<section class="utlt-learning-card"><p class="utlt-eyebrow">PERSONALIZE UTLT</p><h2>Tell us about your home</h2><p>A short survey helps suggest likely water uses. Your flow meter cannot identify activities by itself.</p><button class="utlt-primary-button" data-action="survey">Start household survey</button></section>`;
    const insight = window.UTLTAI.numericInsight(state.readings, state.survey);
    const review = !state.reviewedDays.includes(window.UTLTAI.indiaDate(new Date())) && reviewSessions().length;
    return `${review ? `<section class="utlt-learning-card"><p class="utlt-eyebrow">END-OF-DAY CHECK</p><h2>Help identify ${review} uncertain water period${review === 1 ? "" : "s"}</h2><p>Confirm only today's unclear readings. This check appears during your first seven days and on the first three days of each month.</p><button class="utlt-primary-button" data-action="review">Review today's use</button></section>` : ""}${insight?.average !== undefined ? `<section class="utlt-learning-card"><p class="utlt-eyebrow">YOUR SEVEN-DAY PATTERN</p><h2>${insight.average} L per day on average</h2><p>About ${insight.perPerson} L per person. A gentle goal based on your own week is ${insight.suggestedGoal} L/day. These are estimates from your meter, not a diagnosis of specific activities.</p></section>` : `<section class="utlt-learning-card"><p class="utlt-eyebrow">LEARNING YOUR ROUTINE</p><h2>${insight?.trackedDays || 0} of 7 days measured</h2><p>After seven days, UTLT will show your own average and suggest a daily goal.</p></section>`}`;
  }

  function patternCard() {
    const insight = window.UTLTAI.paceInsight(state.readings);
    const source = state.demoEnabled ? "Sample readings" : "Your meter";
    if (!insight.ready) return `<section class="utlt-pattern-card"><div class="utlt-pattern-top"><p class="utlt-eyebrow">WATER INTELLIGENCE</p><span class="utlt-pattern-source">${source}</span></div><h2>Finding your rhythm</h2><p>${insight.reason === "today" ? "Waiting for today's first water reading before comparing with earlier days." : `Compare today with the same time on three earlier measured days. ${insight.measuredDays} of 3 days ready.`}</p><div class="utlt-pattern-foot"><span>Based only on measured water flow</span><button type="button" data-action="assistant">Ask UTLT ${icon("chevron", 16)}</button></div></section>`;
    const headline = insight.tone === "higher" ? "Using more than usual" : insight.tone === "lower" ? "Using less than usual" : "Close to your usual pace";
    const message = insight.tone === "usual" ? "Your water use is near your recent pattern at this time of day." : `${number(Math.abs(insight.difference))} L ${insight.tone === "higher" ? "above" : "below"} your recent same-time pattern. Check your routine before drawing conclusions.`;
    const max = Math.max(insight.today, insight.baseline, 1);
    return `<section class="utlt-pattern-card is-${insight.tone}"><div class="utlt-pattern-top"><p class="utlt-eyebrow">WATER INTELLIGENCE</p><span class="utlt-pattern-source">${source}</span></div><h2>${headline}</h2><p>${message}</p><div class="utlt-pattern-scale" role="img" aria-label="Today ${number(insight.today)} litres; recent same-time median ${number(insight.baseline)} litres"><div><span>Today so far</span><strong>${number(insight.today)} L</strong><i style="width:${Math.max(2, insight.today / max * 100)}%"></i></div><div><span>Usual by now</span><strong>${number(insight.baseline)} L</strong><i style="width:${Math.max(2, insight.baseline / max * 100)}%"></i></div></div><div class="utlt-pattern-foot"><span>Median of ${insight.measuredDays} measured days · ${insight.clock}</span><button type="button" data-action="assistant">Ask UTLT ${icon("chevron", 16)}</button></div></section>`;
  }

  function runningWaterCard() {
    if (!state.device.connected || state.flowRunningMinutes < 16) return "";
    return `<section class="utlt-running-card" role="status"><span class="utlt-running-mark">${icon("droplet", 22)}</span><div><p class="utlt-eyebrow">CHECK YOUR WATER</p><h2>Water is still flowing</h2><p>The meter has seen continuous flow for about ${Math.floor(state.flowRunningMinutes)} minutes. Check taps and the pump. This could be normal use; the sensor cannot identify a leak.</p></div></section>`;
  }

  function recentUseCard() {
    const days = window.UTLTData.summarize(state.readings).daily.slice(0, -1).filter(day => day.hasData);
    if (days.length < 3) return `<div class="utlt-recent-card"><p class="utlt-eyebrow">YOUR RECENT WATER</p><h2>Learning from your measured days</h2><p>There are ${days.length} of 3 completed days with readings. Keep the monitor powered and reconnect to download its history.</p><small>Days without readings are not assumed to use zero water.</small></div>`;
    const average = days.reduce((sum, day) => sum + day.litres, 0) / days.length;
    const within = days.filter(day => day.litres <= state.goal).length;
    const first = days.slice(0, 3).reduce((sum, day) => sum + day.litres, 0) / 3;
    const last = days.slice(-3).reduce((sum, day) => sum + day.litres, 0) / 3;
    const trend = days.length >= 6 ? `The latest three measured days averaged ${number(last)} L, ${number(Math.abs(last - first))} L ${last >= first ? "above" : "below"} the first three.` : "A six-day trend will appear after more measured days.";
    return `<div class="utlt-recent-card"><p class="utlt-eyebrow">YOUR RECENT WATER</p><h2>${number(average)} L on a measured day</h2><p>Across ${days.length} completed days, ${within} stayed within your ${state.goal} L daily goal. ${trend}</p><div class="utlt-recent-stats"><div><strong>${days.length}</strong><span>days compared</span></div><div><strong>${within}/${days.length}</strong><span>within goal</span></div></div><small>${state.demoEnabled ? "Sample data · not measured in your home" : "Based on stored readings; disconnected hours may be missing"}</small></div>`;
  }

  function assistantPage() {
    const available = window.UTLTLocalLLM.supported();
    const insight = window.UTLTAI.paceInsight(state.readings);
    const evidence = insight.ready ? `Today is ${insight.tone === "usual" ? "near" : insight.tone} your usual pace by ${insight.clock}.` : insight.reason === "today" ? "Waiting for today's first water reading." : `${insight.measuredDays} of 3 earlier measured days available for a same-time comparison.`;
    const modes = `<div class="utlt-assistant-modes" role="tablist" aria-label="AI view"><button role="tab" aria-selected="${state.assistantMode === "recent"}" class="${state.assistantMode === "recent" ? "is-selected" : ""}" data-action="assistant-mode" data-mode="recent">Recent use</button><button role="tab" aria-selected="${state.assistantMode === "ask"}" class="${state.assistantMode === "ask" ? "is-selected" : ""}" data-action="assistant-mode" data-mode="ask">Ask UTLT.ai</button></div>`;
    if (state.assistantMode === "recent") return `<section class="utlt-assistant-page"><p class="utlt-eyebrow">WATER INTELLIGENCE</p><h1>Your water story</h1><p>A clear look at recent measured days, with gaps shown honestly.</p>${modes}${recentUseCard()}<div class="utlt-assistant-evidence"><span>TODAY BY THIS TIME</span><strong>${escapeHtml(evidence)}</strong><small>${state.demoEnabled ? "Sample readings · not a real household" : "Based on readings stored on this phone"}</small></div><p class="utlt-ai-note">UTLT is AI. It can make mistakes.</p></section>`;
    return `<section class="utlt-assistant-page">
      <p class="utlt-eyebrow">YOUR WATER, EXPLAINED</p><h1>Ask UTLT.ai</h1>
      <p>Start with your meter facts, then explore your routine. Water-use labels are suggestions until you confirm them.</p>
      ${modes}
      <div class="utlt-assistant-evidence"><span>WHAT THE DATA CAN SAY</span><strong>${escapeHtml(evidence)}</strong><small>${state.demoEnabled ? "Sample readings · not a real household" : "Based on readings stored on this phone"}</small></div>
      <div class="utlt-question-prompts" aria-label="Example questions"><button type="button" data-action="assistant-prompt" data-question="How does today's water use compare with my usual pace?">Compare today</button><button type="button" data-action="assistant-prompt" data-question="What can I do to save water today?">Find one action</button><button type="button" data-action="assistant-prompt" data-question="What do you know and what are you unsure about?">Check certainty</button></div>
      <form id="utlt-assistant-form" class="utlt-assistant-form"><label for="utlt-assistant-question">Your question</label><textarea id="utlt-assistant-question" name="question" rows="3" maxlength="300" placeholder="What changed in my water use this week?" required>${escapeHtml(state.llmQuestion)}</textarea><button class="utlt-primary-button" type="submit" ${state.llmBusy ? "disabled" : ""}>${state.llmBusy ? "Thinking on your phone…" : "Ask UTLT.ai"}</button></form>
      ${state.llmAnswer ? `<div class="utlt-learning-card utlt-assistant-answer"><strong>${state.llmAnswerType === "checked" ? "Checked from your readings" : "UTLT.ai"}</strong><p>${escapeHtml(state.llmAnswer)}</p></div>` : ""}
      <div class="utlt-learning-card"><strong>${state.llmReady ? "On-phone model ready" : available ? "For more open-ended questions" : "On-phone model unavailable here"}</strong><p>${state.llmReady ? "Your questions and meter facts stay in this browser during generation." : available ? "Download the optional 580 MB model on Wi-Fi. Checked answers above work without it." : "This browser does not expose WebGPU. Checked answers and pattern checks still work."}</p>${available && !state.llmReady ? `<button class="utlt-primary-button" data-action="load-local-llm" ${state.llmBusy ? "disabled" : ""}>${state.llmBusy ? "Loading model…" : "Download on-phone AI"}</button>` : ""}</div>
      ${state.llmStatus ? `<p class="utlt-device-help" role="status">${escapeHtml(state.llmStatus)}</p>` : ""}<p class="utlt-ai-note">UTLT is AI. It can make mistakes.</p>
    </section>`;
  }

  function checkedWaterAnswer(question) {
    if (!state.readings.length) return "No water measurements are stored on this phone yet. Connect the ESP32 or enable clearly labeled demo data in Device Settings.";
    const q = question.toLowerCase();
    const source = state.demoEnabled ? "The sample readings show" : "Your meter shows";
    const summary = window.UTLTData.summarize(state.readings);
    const pace = window.UTLTAI.paceInsight(state.readings);
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
    if (/(how much|total|used|usage).*(today)|(today).*(how much|total|used|usage)/.test(q)) return summary.daily.at(-1)?.hasData ? `${source} ${number(summary.used)} L used today against your ${state.goal} L goal.` : "There is no water reading from today yet.";
    return null;
  }

  function assistantFacts() {
    if (!state.readings.length) return "No actual water measurements are stored on this phone. No survey or activity can be inferred from the meter yet.";
    const summary = window.UTLTData.summarize(state.readings);
    const mainUse = [...summary.byUse].filter(item => item.label !== "Misc").sort((a, b) => b.litres - a.litres)[0];
    const allowedAction = !state.demoEnabled && (!mainUse || mainUse.litres < summary.used * 0.25) ? "Turn off running water while soaping or scrubbing." : mainUse?.label === "Bath" ? "Use a bucket bath or a shorter shower." : mainUse?.label === "Housework" ? "Run full laundry loads and reuse rinse water where safe." : "Use a bowl instead of a running tap when washing food.";
    const days = summary.daily.map(item => `${item.date}: ${item.hasData ? item.litres.toFixed(2) + " L measured" : "no measurement recorded"}`).join("; ");
    const insight = window.UTLTAI.numericInsight(state.readings, state.survey);
    const pace = window.UTLTAI.paceInsight(state.readings);
    const uncertain = state.survey ? window.UTLTAI.sessions(state.readings, state.survey, window.UTLTAI.indiaDate(new Date()), state.corrections).slice(0, 4).map(item => `${item.recordedAt}: ${item.litres.toFixed(2)} L, possible ${item.suggestion.category} (${Math.round(item.suggestion.confidence * 100)}% model confidence, unverified)`).join("; ") : "survey not completed";
    return [`Source: ${state.demoEnabled ? "SIMULATED DEMO READINGS, not a real device" : "ESP32 flow meter readings"}.`, `Household: ${state.survey ? state.survey.people + " people; usual shower around " + state.survey.usualShowerHour + ":00; " + state.survey.showerStyle + " bathing" : "survey not completed"}.`, `Daily goal: ${state.goal} L. Today measured: ${summary.daily.at(-1)?.hasData ? summary.used.toFixed(2) + " L" : "no reading yet"}.`, `Same-time recent median: ${pace.ready ? pace.baseline.toFixed(2) + " L by " + pace.clock + " from " + pace.measuredDays + " prior measured days; today by then " + pace.today.toFixed(2) + " L; pace " + pace.tone : pace.reason === "today" ? "not available; no reading today yet" : "not available; only " + pace.measuredDays + " of 3 prior measured days"}.`, `Continuous flow: ${state.device.connected && state.flowRunningMinutes >= 16 ? Math.floor(state.flowRunningMinutes) + " minutes detected; inspect taps, cause unknown" : "no sustained-flow alert"}.`, `Last seven dates: ${days}.`, `Seven-day measured-day average: ${insight?.average === undefined ? "not yet available" : insight.average + " L/day"}.`, `Per-person measured-day average: ${insight?.perPerson === undefined ? "not yet available" : insight.perPerson + " L/day"}.`, `Today's water by time: ${summary.byTime.map(item => item.label + " " + item.litres.toFixed(2) + " L").join("; ")}.`, `Today's categories: ${summary.byUse.map(item => item.label + " " + item.litres.toFixed(2) + " L").join("; ")}. Unconfirmed activity is Misc. A whole-home meter cannot identify the activity.`, `Numerical model suggestions from 200 simulated households: ${uncertain || "none"}. These are not verified activities.`, `Allowed water-saving action: ${allowedAction}`].join("\n");
  }

  function surveyPage() {
    const survey = state.survey || {};
    const options = (values, selected) => values.map(([value, label]) => `<option value="${value}" ${String(selected) === String(value) ? "selected" : ""}>${label}</option>`).join("");
    return `<section class="utlt-survey-page"><p class="utlt-eyebrow">HOUSEHOLD SURVEY</p><h1>Help UTLT learn your routine</h1><p>These answers guide activity suggestions. Your meter still measures only total flow.</p><form id="utlt-survey-form" class="utlt-survey-form"><label>People at home<input name="people" type="number" min="1" max="12" required value="${survey.people ?? 3}"></label><label>Usual shower time<select name="usualShowerHour">${options(Array.from({ length: 24 }, (_, hour) => [hour, `${String(hour).padStart(2, "0")}:00`]), survey.usualShowerHour ?? 7)}</select></label><label>Bathing style<select name="showerStyle">${options([["bucket", "Bucket"], ["shower", "Shower"], ["mixed", "Both"]], survey.showerStyle || "mixed")}</select></label><label>Typical shower minutes<input name="typicalShowerMinutes" type="number" min="1" max="60" value="${survey.typicalShowerMinutes ?? 8}" required></label><label>Laundry days per week<input name="laundryDaysPerWeek" type="number" min="0" max="7" value="${survey.laundryDaysPerWeek ?? 2}" required></label><label>Meals cooked per day<input name="cookingMealsPerDay" type="number" min="0" max="3" value="${survey.cookingMealsPerDay ?? 2}" required></label><label>Usual bedtime<select name="usualBedtimeHour">${options(Array.from({ length: 24 }, (_, hour) => [hour, `${String(hour).padStart(2, "0")}:00`]), survey.usualBedtimeHour ?? 22)}</select></label><label class="utlt-check-row"><input name="dishwasher" type="checkbox" ${survey.dishwasher ? "checked" : ""}>We use a dishwasher</label><button class="utlt-primary-button" type="submit">Save household routine</button></form><p class="utlt-device-help">Your survey stays on this phone. The first seven-day observation begins when you save it.</p></section>`;
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
      return `<div class="utlt-dashboard">${greetingMarkup()}<section class="utlt-empty-dashboard"><span class="utlt-empty-mark">${icon("droplet", 32)}</span><p class="utlt-eyebrow">WATER MONITOR</p><h2>Your water data starts here</h2><p>Connect your UTLT device to see today's usage, the breakdown, and your daily trend.</p><button type="button" class="utlt-primary-button" data-action="pair">Connect device</button><button type="button" class="utlt-secondary-button" data-action="assistant">Ask on-phone AI</button><span>Want to explore first? Enable demo data in Device Settings.</span></section><p class="utlt-ai-note">UTLT is AI. It can make mistakes.</p></div>`;
    }
    const summary = window.UTLTData.summarize(state.readings);
    return `<div class="utlt-dashboard">${greetingMarkup()}${state.demoEnabled ? '<p class="utlt-demo-banner">DEMO DATA · SAMPLE READINGS</p>' : ''}${state.flowWarning ? `<p class="utlt-flow-warning" role="alert">${escapeHtml(state.flowWarning)}</p>` : ""}${usage(summary)}${runningWaterCard()}${status(summary)}${patternCard()}${quickStats(summary)}${learningCards()}${tipCard(summary)}${breakdown(summary)}${weekly(summary)}<p class="utlt-ai-note">UTLT is AI. It can make mistakes.</p><p class="utlt-data-source">${state.demoEnabled ? "Demo readings · Connect a device for live data" : "Device readings"}</p></div>`;
  }

  function devicePage() {
    const connected = state.device.connected;
    const last = state.device.lastConnectedAt && !Number.isNaN(Date.parse(state.device.lastConnectedAt))
      ? new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(new Date(state.device.lastConnectedAt)) : "";
    return `<section class="utlt-device-settings"><p class="utlt-eyebrow">YOUR WATER MONITOR</p><div class="utlt-device-card"><span class="utlt-device-icon ${connected ? "" : "is-off"}">${icon(connected ? "bluetooth" : "bluetoothOff", 27)}</span><div><strong>${connected ? "Device connected" : state.pairedDeviceId ? "Device disconnected" : "No device connected"}</strong>${last ? `<span class="utlt-last-connected">Last connected at ${escapeHtml(last)}</span>` : ""}<p>${connected ? "Live water readings are updating your dashboard." : state.pairedDeviceId ? "Your device is remembered. Reconnect it to receive live readings." : "Scan the QR on your device to connect over Bluetooth."}</p></div></div><button class="utlt-primary-button" data-action="pair">${connected ? "View connection" : state.pairedDeviceId ? "Reconnect device" : "Pair a device"}</button><button class="utlt-secondary-button" data-action="survey">${state.survey ? "Edit household survey" : "Start household survey"}</button>${connected && controlCharacteristic ? `<button class="utlt-secondary-button" data-action="download-history" ${historyLoading ? "disabled" : ""}>${historyLoading ? "Downloading history…" : "Download seven-day history"}</button>` : ""}${state.historyStatus ? `<p class="utlt-device-help" role="status">${escapeHtml(state.historyStatus)}</p>` : ""}${state.unknownPulses ? `<p class="utlt-device-help">${number(state.unknownPulses / pulsesPerLitre)} L was recorded without a known time after a power reset, so it cannot be placed on a day chart.</p>` : ""}${!connected ? `<div class="utlt-demo-setting"><div><strong>Explore with demo data</strong><p>${state.demoEnabled ? "Sample water readings are visible on Home." : "Home stays blank until a device connects."}</p></div><button type="button" data-action="toggle-demo" role="switch" aria-checked="${state.demoEnabled}" aria-label="${state.demoEnabled ? "Disable" : "Enable"} demo data" class="utlt-demo-switch ${state.demoEnabled ? "is-on" : ""}"><span></span></button></div>` : ""}<p class="utlt-device-help">Live readings come from your ESP32 flow sensor. Sample readings stay separate from device data.</p></section>`;
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
      ${state.device.connected && !state.survey ? '<button class="utlt-secondary-button" type="button" data-action="survey">Set up your household (optional)</button>' : ''}
      <button class="utlt-primary-button ${ready ? "utlt-scan-again" : ""}" type="button" data-action="${state.qrScanning ? "stop-qr" : "scan-qr"}">${state.qrScanning ? "Stop scanning" : ready ? "Scan another device QR" : "Scan device QR"}</button>
      ${!ready || state.qrScanning ? '<label class="utlt-qr-photo">Or use a camera photo<input type="file" id="utlt-qr-photo" accept="image/*" capture="environment" aria-label="Take a photo of the device QR code"></label>' : ''}
      <div class="utlt-meter-diagnostics"><strong>Water conversion</strong><span>4,075 pulses = 1 litre</span>${state.rawPulseCount !== null ? `<span>Total pulses: ${state.rawPulseCount.toLocaleString("en-IN")}</span><span>Pulse speed: ${state.pulseRateHz === null ? "waiting for next packet" : `${state.pulseRateHz.toFixed(1)} per second`}</span>` : ""}<small>Based on your 160 mL timing test; this is an estimate.</small></div>
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
    return `<section class="utlt-account"><div class="utlt-profile-card"><div class="utlt-avatar">${icon("user", 38)}</div><div><strong>${escapeHtml(state.name || "Your account")}</strong><span>Google account connected</span></div><span class="utlt-connected"><i></i> Active</span></div><section class="utlt-google-auth"><p class="utlt-data-source" role="status">✓ Signed in with Google. Your profile is stored in Firebase.</p><button class="utlt-settings-row" type="button" data-action="sign-out"><span>Sign out</span>${icon("chevron",18)}</button></section><form class="utlt-account-form" id="utlt-account-form"><div class="utlt-section-heading"><div><h2>Personal details</h2><p>Manage your profile and home settings.</p></div></div><label class="utlt-field">Full name<input name="name" value="${escapeHtml(state.name)}" autocomplete="name"></label><label class="utlt-field">Email address<input name="email" type="email" value="${escapeHtml(state.email)}" autocomplete="email"></label><label class="utlt-field">Home name<input name="homeName" value="${escapeHtml(state.homeName)}"></label><label class="utlt-field">Daily water goal <span class="utlt-input-wrap"><input name="goal" type="number" min="1" value="${escapeHtml(state.goal)}"><span>litres</span></span></label><button class="utlt-primary-button utlt-save-button" type="submit">${state.saved ? icon("check", 18) + " Saved" : "Save changes"}</button></form><button class="utlt-settings-row" data-action="theme"><span class="utlt-settings-icon">${icon(state.dark ? "sun" : "moon", 19)}</span><span><strong>Appearance</strong><small>${state.dark ? "Dark mode" : "Light mode"}</small></span>${icon("chevron", 18)}</button><button class="utlt-settings-row" data-action="device"><span class="utlt-settings-icon">${icon(state.device.connected ? "bluetooth" : "bluetoothOff", 19)}</span><span><strong>Connected devices</strong><small>Manage your utility monitor</small></span>${icon("chevron", 18)}</button></section>`;
  }

  function nav() {
    return `<nav class="utlt-tabbar" aria-label="Main navigation"><button class="${state.screen === "home" ? "is-current" : ""}" data-action="home" aria-current="${state.screen === "home" ? "page" : "false"}"><span class="utlt-nav-icon">${icon("home", 24)}</span><span>Home</span></button><button class="${state.screen === "family" ? "is-current" : ""}" data-action="family" aria-current="${state.screen === "family" ? "page" : "false"}"><span class="utlt-nav-icon">${icon("users", 24)}</span><span>Family</span></button><button class="${["pair", "device"].includes(state.screen) ? "is-current" : ""}" data-action="device" aria-current="${["pair", "device"].includes(state.screen) ? "page" : "false"}"><span class="utlt-nav-icon">${icon("plus", 24)}</span><span>Devices</span></button><button class="${state.screen === "account" ? "is-current" : ""}" data-action="account" aria-current="${state.screen === "account" ? "page" : "false"}"><span class="utlt-tab-avatar">${icon("user", 18)}</span><span>Account</span></button></nav>`;
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
    if(!state.family)return '<section class="utlt-family-page"><h1>Family Connect</h1><p>Loading…</p></section>';
    let rows=[]; try{rows=await firebaseStore.loadFamilyUsage(state.family.id,todayKey());}catch(e){state.familyMessage=e.message||"Could not load family usage.";}
    const total=rows.reduce((s,x)=>s+(Number(x.litres)||0),0);
    const qr=state.familyInviteUrl?'<img class="utlt-family-qr" alt="Family invitation QR code" src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=12&data='+encodeURIComponent(state.familyInviteUrl)+'">':"";
    let out='<section class="utlt-family-page"><p class="utlt-eyebrow">YOUR HOUSEHOLD</p><h1>Family Connect</h1><p class="utlt-family-muted">Share daily water readings and see one household total.</p><div class="utlt-family-total"><span>FAMILY TOTAL · TODAY</span><strong>'+(state.usingDemo?'—':number(total)+' L')+'</strong><small>'+(state.usingDemo?'Demo readings are not shared. Real meter readings are required.':'Combined readings from '+rows.length+' member(s)')+'</small></div>';
    if(state.pendingFamilyInvite)out+='<section class="utlt-family-card"><h2>Invitation received</h2><p>Request to join? Approved members can see each other’s daily water usage and the combined total.</p><button class="utlt-primary-button" data-action="family-join">Request to join</button></section>';
    if(state.family.ownerUid===state.uid) out+='<section class="utlt-family-card"><h2>Invite a family member</h2><p>Create a temporary QR code. The other person scans it with their phone camera. It expires in 10 minutes; you approve every request.</p><button class="utlt-primary-button" data-action="family-invite">Create QR invitation</button>'+qr+(state.familyInviteUrl?'<button class="utlt-family-secondary" data-action="family-copy">Copy invite link</button>':'')+'</section>';
    out+='<button class="utlt-family-secondary" data-action="family-refresh">Refresh family status</button><section class="utlt-family-card"><h2>Family members ('+state.family.memberUids.length+')</h2>';
    state.family.memberUids.forEach(id=>{const row=rows.find(x=>x.uid===id);out+='<div class="utlt-family-member"><span>'+escapeHtml(state.family.displayNames?.[id]||"Family member")+(id===state.uid?' (You)':'')+'</span><strong>'+(state.usingDemo?'Demo not shared':row?number(row.litres)+' L':'No reading yet')+'</strong></div>';});
    out+='</section>';
    if(state.family.ownerUid===state.uid){out+='<section class="utlt-family-card"><h2>Join requests ('+state.familyRequests.length+')</h2>';if(!state.familyRequests.length)out+='<p class="utlt-family-muted">No pending requests.</p>';state.familyRequests.forEach(q=>{out+='<div class="utlt-family-member"><span>'+escapeHtml(q.requesterName||"Family member")+'</span><span><button data-action="family-approve" data-request-id="'+escapeHtml(q.id)+'">Approve</button> <button data-action="family-decline" data-request-id="'+escapeHtml(q.id)+'">Decline</button></span></div>';});out+='</section>';}
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

  let lastMotionView = "";
  async function render(preserveScroll = false) {
    const previousScroll = preserveScroll ? root.querySelector(".utlt-content")?.scrollTop || 0 : 0;
    const motionView = `${state.screen}:${state.utility}:${state.breakdown}`;
    const enterMotion = motionView !== lastMotionView;
    lastMotionView = motionView;
    const compact = state.screen === "home" && state.utility !== "Water";
    const content = state.screen === "home"
      ? utilityTabs() + (state.utility === "Water" ? dashboard() : `<section class="utlt-unavailable-card"><div class="utlt-unavailable-icon">${icon(state.utility === "Gas" ? "flame" : "bolt", 30)}</div><h2>${state.utility} tracking is coming soon</h2><p>This preview currently tracks water only. When ${state.utility.toLowerCase()} monitoring arrives, you will see:</p><ul class="utlt-coming-list"><li>Your daily ${state.utility.toLowerCase()} usage and goal</li><li>A clear “too much” or “still fine” message</li><li>Records of your previous days</li></ul><button class="utlt-primary-button" data-action="utility" data-value="Water">View water dashboard</button></section>`)
      : state.screen === "device" ? devicePage()
      : state.screen === "account" ? accountPage()
      : state.screen === "survey" ? surveyPage()
      : state.screen === "review" ? reviewPage()
      : state.screen === "assistant" ? assistantPage()
      : state.screen === "family" ? await familyPage()
      : pairPage();
    root.innerHTML = `<div class="utlt-app ${state.dark ? "utlt-dark" : ""} ${enterMotion ? "utlt-enter" : ""}"><div class="utlt-phone ${state.screen === "pair" ? "utlt-pair" : compact ? "utlt-compact" : ""}">${header()}<main class="utlt-content">${content}</main>${nav()}</div></div>`;
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute("content", state.dark ? "#212121" : "#ffffff"));
    const scroller = root.querySelector(".utlt-content");
    if (scroller) scroller.scrollTop = previousScroll;
    if (enterMotion) setupChartScrollAnimations(scroller);
  }

  function renderMeterUpdate() {
    // Replacing an active form every two seconds discards unfinished typing.
    if (["survey", "review", "account", "assistant"].includes(state.screen)) return;
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
    try { localStorage.setItem(pairingKey, state.pairedDeviceId); } catch (_error) { /* Session pairing still works. */ }
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
        } catch (_error) { /* Ignore a frame that was not ready. */ }
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
      try { localStorage.setItem(lastConnectedKey, JSON.stringify({ qrId: state.pairedDeviceId, at: state.device.lastConnectedAt })); } catch (_error) { /* The current connection still works. */ }
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
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem("waterMeterReadingsV1") || "{}"); } catch (_error) { /* Continue with device history. */ }
    if (!complete) {
      saved.session = latest.session;
      saved.lastPulses = latest.total;
      saved.lastObservedAt = Date.now();
      try { localStorage.setItem("waterMeterReadingsV1", JSON.stringify(saved)); } catch (_error) { /* Keep live meter. */ }
      state.historyStatus = "History transfer did not finish. Reconnect or tap Download history to retry.";
      render(true);
      return;
    }
    const cutoff = Date.now() - 7 * 86400000;
    const recovered = [...historyRows.entries()]
      .filter(([epoch, count]) => epoch * 1000 >= cutoff && count > 0 && count <= 6 * 5 * 4075)
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
    try { localStorage.setItem("waterMeterReadingsV1", JSON.stringify({ session: latest.session, lastPulses: Math.max(latest.total, historySnapshot || 0), lastObservedAt: Date.now(), readings })); } catch (_error) { /* Readings remain in this tab. */ }
    state.readings = readings;
    state.usingDemo = false;
    state.demoEnabled = false;
    try { localStorage.setItem(demoKey, "false"); } catch (_error) { /* Device readings still take precedence. */ }
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
      try { localStorage.setItem(grantedDeviceKey, JSON.stringify({ qrId: state.pairedDeviceId, bluetoothId: device.id })); } catch (_error) { /* Reconnection can still match by name. */ }
      device.ongattserverdisconnected = () => {
        if (bleDevice !== device) return;
        try { localStorage.setItem(lastConnectedKey, JSON.stringify({ qrId: state.pairedDeviceId, at: state.device.lastConnectedAt })); } catch (_error) { /* The tag still shows in this tab. */ }
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
      try { remembered = JSON.parse(localStorage.getItem(grantedDeviceKey) || "{}"); } catch (_error) { /* Fall back to advertised name. */ }
      if (remembered.qrId === state.pairedDeviceId) {
        const match = granted.find(device => device.id === remembered.bluetoothId);
        if (match) { await connectSelectedBluetoothDevice(match); return; }
      }
      const suffix = state.pairedDeviceId.slice(-4).toUpperCase();
      const matches = granted.filter(device => device.name === `UTLT-${suffix}`);
      if (matches.length === 1) await connectSelectedBluetoothDevice(matches[0]);
    } catch (_error) { /* The manual chooser remains available. */ }
  }

  function connectBluetooth() {
    if (!state.pairedDeviceId) return;
    if (!navigator.bluetooth?.requestDevice) {
      state.pairStatus = "Bluetooth needs Chrome on Android or Bluefy on iPhone. iPhone Chrome cannot connect to BLE devices.";
      render(true);
      return;
    }
    // The chooser must open directly from this button tap; camera decoding is
    // asynchronous and cannot carry the browser's required user activation.
    const expectedName = `UTLT-${state.pairedDeviceId.slice(-4).toUpperCase()}`;
    navigator.bluetooth.requestDevice({ filters: [{ name: expectedName }], optionalServices: [bleServiceUuid] })
      .then(connectSelectedBluetoothDevice)
      .catch(error => {
        state.pairStatus = error.name === "NotFoundError" ? `No ${expectedName} selected. Make sure the ESP32 is powered, nearby, and advertising that name.` : `Bluetooth connection failed: ${error.message || error.name}`;
        render(true);
      });
  }

  root.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "scan-qr") { startQrScanner(); return; }
    if (action === "stop-qr") { stopQrScanner(); state.pairStatus = "Scan stopped."; render(true); return; }
    if (action === "connect-ble") { connectBluetooth(); return; }
    if (action === "download-history") { requestHistory(); return; }
    if (action === "assistant-mode") { state.assistantMode = button.dataset.mode === "ask" ? "ask" : "recent"; render(true); return; }
    if (action === "assistant-prompt") {
      const field = root.querySelector("#utlt-assistant-question");
      if (field) { field.value = button.dataset.question || ""; field.focus(); }
      return;
    }
    if (action === "load-local-llm") {
      if (state.llmBusy) return;
      state.llmBusy = true; state.llmStatus = "Downloading and starting the on-phone model…"; render(true);
      window.UTLTLocalLLM.load(percent => { state.llmStatus = `Downloading model: ${percent}%`; if (state.screen === "assistant") render(true); })
        .then(() => { state.llmReady = true; state.llmStatus = "Ready. Generation runs on this phone."; })
        .catch(error => { state.llmStatus = `Could not start on-phone AI: ${error.message}`; })
        .finally(() => { state.llmBusy = false; render(true); });
      return;
    }
    if (action === "toggle-demo") {
      if (state.device.connected) return;
      state.demoEnabled = !state.demoEnabled;
      if (state.demoEnabled) {
        state.readings = window.UTLTData.demoReadings;
        state.usingDemo = true;
      } else {
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem("waterMeterReadingsV1") || "{}"); } catch (_error) { /* Empty dashboard is still available. */ }
        state.readings = Array.isArray(saved.readings) ? saved.readings : [];
        state.usingDemo = state.readings.length === 0;
      }
      try { localStorage.setItem(demoKey, String(state.demoEnabled)); } catch (_error) { /* Session toggle still works. */ }
      render(true);
      return;
    }
    if (action === "reset-meter-readings") {
      try { localStorage.removeItem("waterMeterReadingsV1"); } catch (_error) { /* This tab can still reset. */ }
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
    if (action === "auth-theme") { state.dark = !state.dark; renderAuthGate(); return; }
    if (action === "login-google") { signInWithGoogle(); return; }
    else if (action === "auth-cancel") { state.pendingAuthScreen = ""; state.screen = "home"; render(); return; }
    else if (action === "sign-out") { signOutOfApp().catch(error => renderAuthGate(error.message)); return; }
    else if (action === "theme") { state.dark = !state.dark; persistProfile(); }
    else if (action === "refresh-device") { refreshWaterBridge(); return; }
    else if (action === "utility") { state.utility = button.dataset.value; persistProfile(); }
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
    } else if (["home", "pair", "account", "device", "family", "survey", "review", "assistant"].includes(action)) {
      if (action !== "pair" && state.qrScanning) stopQrScanner();
      if (["account", "family"].includes(action) && !firebaseStore) {
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
  root.addEventListener("submit", async (event) => {
    if (event.target.id === "utlt-assistant-form") {
      event.preventDefault();
      if (state.llmBusy) return;
      const question = String(new FormData(event.target).get("question") || "").trim().slice(0, 300);
      if (!question) return;
      state.llmQuestion = question;
      const checked = checkedWaterAnswer(question);
      if (checked || !state.llmReady) {
        state.llmAnswer = checked || "This question needs the optional on-phone model. Download it below, then ask again.";
        state.llmAnswerType = checked ? "checked" : "system";
        state.llmStatus = "";
        render(true);
        return;
      }
      state.llmAnswer = ""; state.llmAnswerType = "model"; state.llmBusy = true; state.llmStatus = "Generating on your phone…"; render(true);
      window.UTLTLocalLLM.ask(question, assistantFacts())
        .then(result => { state.llmAnswer = result.answer; state.llmStatus = ""; })
        .catch(error => { state.llmStatus = `Could not answer: ${error.message}`; })
        .finally(() => { state.llmBusy = false; render(true); });
      return;
    }
    if (event.target.id === "utlt-survey-form") {
      event.preventDefault();
      const form = new FormData(event.target);
      state.survey = {
        startedAt: state.survey?.startedAt || window.UTLTAI.indiaDate(new Date()),
        people: Math.max(1, Math.min(12, Number(form.get("people")) || 1)),
        usualShowerHour: Number(form.get("usualShowerHour")) || 0,
        showerStyle: String(form.get("showerStyle") || "mixed"),
        typicalShowerMinutes: Math.max(1, Math.min(60, Number(form.get("typicalShowerMinutes")) || 8)),
        laundryDaysPerWeek: Math.max(0, Math.min(7, Number(form.get("laundryDaysPerWeek")) || 0)),
        cookingMealsPerDay: Math.max(0, Math.min(3, Number(form.get("cookingMealsPerDay")) || 0)),
        usualBedtimeHour: Number(form.get("usualBedtimeHour")) || 0,
        dishwasher: form.has("dishwasher")
      };
      try { localStorage.setItem(surveyKey, JSON.stringify(state.survey)); } catch (_error) { /* This tab still uses the survey. */ }
      state.screen = "home";
      render();
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
        const saved = JSON.parse(localStorage.getItem("waterMeterReadingsV1") || "{}");
        saved.readings = state.readings;
        localStorage.setItem("waterMeterReadingsV1", JSON.stringify(saved));
      } catch (_error) { /* Confirmations remain for this session. */ }
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

  // Integration surface for the future device bridge. Call these from your
  // Bluetooth/Wi-Fi adapter after receiving readings or connection updates.
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
  const directReadingsKey = "waterMeterReadingsV1";
  function applyStandaloneReading(payload) {
    const total = Number(payload.totalPulses);
    if (!Number.isSafeInteger(total) || total < 0 || typeof payload.session !== "string") throw new Error("Invalid meter reading");
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(directReadingsKey) || "{}"); } catch (_error) { /* Private browsing may block storage. */ }
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
    state.flowWarning = impossibleFlow ? `Sensor signal is too fast (${rateLpm.toFixed(1)} L/min). This sensor is rated to 5 L/min, so these pulses were not added. Check wiring and try separate pump power.` : "";
    const readings = Array.isArray(saved.readings) ? saved.readings.filter(item => item && typeof item.recordedAt === "string" && Date.parse(item.recordedAt) >= Date.now() - 7 * 86400000) : [];
    const delta = impossibleFlow ? 0 : rawDelta;
    if (delta > 0) {
      const indiaTime = new Date(Date.now() + 330 * 60000).toISOString().replace("Z", "+05:30");
      readings.push({ recordedAt: indiaTime, litres: delta / pulsesPerLitre, category: "Misc" });
    }
    try { localStorage.setItem(directReadingsKey, JSON.stringify({ session: payload.session, lastPulses: total, lastObservedAt: now, readings })); } catch (_error) { /* Live values still work without storage. */ }
    const changed = delta > 0 || state.usingDemo || !state.device.connected || previousWarning !== state.flowWarning || hadFlowAlert !== (state.flowRunningMinutes >= 16);
    state.readings = readings;
    state.usingDemo = false;
    if (state.demoEnabled) {
      state.demoEnabled = false;
      try { localStorage.setItem(demoKey, "false"); } catch (_error) { /* Live readings still take precedence. */ }
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
        const readingsSignature = JSON.stringify(payload.readings);
        state.readings = payload.readings;
        state.usingDemo = false;
        if (state.demoEnabled) {
          state.demoEnabled = false;
          try { localStorage.setItem(demoKey, "false"); } catch (_error) { /* Live data still takes precedence. */ }
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
    navigator.serviceWorker.register("./sw.js").catch(() => { /* The dashboard still works in the browser. */ });
  }
  tryAutoConnectBluetooth();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tryAutoConnectBluetooth();
  });
  setInterval(() => {
    if (document.visibilityState === "visible") tryAutoConnectBluetooth();
  }, 15000);
  refreshWaterBridge();
  setInterval(refreshWaterBridge, 5000);
})();
