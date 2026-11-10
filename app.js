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
  const state = {
    screen: "home",
    utility: "Water",
    breakdown: "use",
    dark: window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)").matches : true,
    name: "",
    email: "",
    homeName: "My home",
    goal: 350,
    saved: false,
    device: { connected: false, lastConnectedAt: null },
    readings: window.UTLTData.demoReadings,
    usingDemo: true,
    onboarding: "profile",
    tutorialStep: 0,
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
  let goalSaveTimer = 0;
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
    const destination = state.pendingAuthScreen || "this feature";
    const featureName = destination === "family" ? "Family Connect" : destination === "account" ? "your account" : "device setup";
    const message = errorMessage || state.authMessage || `Sign in with Google to use ${featureName}. Your dashboard remains available without signing in.`;
    root.innerHTML = `<main style="min-height:100dvh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 15% 0%,#1d4f7a 0%,transparent 55%),radial-gradient(circle at 95% 100%,#0b5e7a 0%,transparent 50%),#0d151d;color:#f5f8fc;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;">
      <section style="width:min(100%,420px);padding:34px 30px;border:1px solid rgba(255,255,255,.1);border-radius:28px;background:linear-gradient(180deg,rgba(35,52,71,.94),rgba(24,37,52,.94));box-shadow:0 30px 80px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.08);text-align:center;">
        <div style="width:64px;height:64px;margin:0 auto 16px;display:grid;place-items:center;border-radius:20px;background:linear-gradient(135deg,#2a9bff,#00c3d0);font-size:30px;box-shadow:0 12px 28px -8px rgba(22,136,248,.7);">💧</div><p style="margin:0 0 8px;color:#83bfff;font-size:11px;font-weight:800;letter-spacing:.16em;">UTLT.AI</p>
        <h1 style="margin:0;font-size:30px;line-height:1.15;letter-spacing:-.8px;">One quick sign-in</h1><p style="margin:12px 0 24px;color:#b9c7d6;font-size:15px;line-height:1.6;">Google sign-in protects your family data, device connections and saved account settings. You can still use the water dashboard as a guest.</p>
        <button type="button" data-action="login-google" ${state.authBusy ? "disabled" : ""} style="width:100%;min-height:52px;border:0;border-radius:14px;background:#fff;color:#182536;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 8px 20px -8px rgba(0,0,0,.5);">${state.authBusy ? "Connecting…" : "Continue with Google"}</button>
        <button type="button" data-action="auth-cancel" style="width:100%;min-height:46px;margin-top:10px;border:1px solid #526579;border-radius:14px;background:transparent;color:#dce7f2;font-size:14px;font-weight:650;cursor:pointer;">Back to dashboard</button>
        <p role="status" style="min-height:36px;margin:16px 0 0;color:#c4d3e3;font-size:13px;line-height:1.5;">${escapeHtml(message)}</p>
        <p style="margin:12px 0 0;color:#8aa0b6;font-size:11px;line-height:1.5;">You only need Google for protected features and cloud sync.</p>
      </section></main>`;
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
    state.onboarding = state.name ? "" : "profile";
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
    // Show the demo dashboard immediately. Firebase is only needed for protected features.
    render();
    try {
      firebaseContext = await firebaseReady;
      const user = firebaseContext.auth.currentUser;
      if (user && user.providerData?.some(item => item.providerId === "google.com")) await completeGoogleLogin(user);
      else {
        state.pendingFamilyInvite = new URLSearchParams(location.search).get("familyInvite") || "";
        render();
      }
    } catch (error) {
      state.syncStatus = "guest";
      state.syncError = "";
      console.error("UTLT Firebase is unavailable; guest dashboard remains usable.", error);
      render();
    }
  }

  async function signOutOfApp() {
    if (!firebaseContext) return;
    await firebaseContext.authSdk.signOut(firebaseContext.auth);
    firebaseStore = null; state.uid = ""; state.name = ""; state.email = ""; state.friendCode = "";
    state.family = null; state.familyRequests = []; state.familyInviteUrl = ""; state.pendingAuthScreen = "";
    state.friends = []; state.friendRequests = []; state.friendStats = []; state.authProvider = "signed-out";
    state.screen = "home"; state.onboarding = "profile"; state.syncStatus = "guest"; render();
  }

  const root = document.getElementById("app");
  const circumference = 2 * Math.PI * 84;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }
  function number(value) { return Number(Number(value).toFixed(1)).toLocaleString("en-IN"); }

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
    trendUp: '<path d="M3 17l6 -6l4 4l8 -8"/><path d="M14 7l7 0l0 7"/>',
    share: '<path d="M3 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M15 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M8.7 10.7l6.6 -3.4"/><path d="M8.7 13.3l6.6 3.4"/>'
  };
  function icon(name, size = 24) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
  }

  function header() {
    const title = state.screen === "account" ? "Account" : state.screen === "family" ? "Family" : state.screen === "pair" ? "Pair Your Device" : state.screen === "device" ? "Device Settings" : (state.name.trim() ? `${state.name.trim().split(" ")[0]}’s UTLT` : "Your UTLT");
    const connection = state.screen === "home" ? `<span class="utlt-connection-icon ${state.device.connected ? "is-connected" : "is-disconnected"}" role="img" aria-label="Device ${state.device.connected ? "connected" : "disconnected"}">${icon(state.device.connected ? "bluetooth" : "bluetoothOff", 16)}</span>` : "";
    let actions = "";
    if (state.screen === "home") actions = `<div class="utlt-header-actions"><button class="utlt-icon-button" data-action="device" aria-label="Device settings">${icon("settings")}</button><button class="utlt-icon-button" data-action="theme" aria-label="Switch to ${state.dark ? "light" : "dark"} mode">${icon(state.dark ? "sun" : "moon")}</button></div>`;
    if (state.screen === "friends") actions = `<button class="utlt-icon-button" data-action="home" aria-label="Back to home">${icon("home")}</button>`;
    if (state.screen === "account" || state.screen === "device") actions = `<button class="utlt-icon-button" data-action="home" aria-label="Back to home">${icon("home")}</button>`;
    return `<header class="utlt-header"><div class="utlt-title"><span>${escapeHtml(title)}</span>${connection}</div>${actions}</header>`;
  }

  function utilityTabs() {
    const utilities = [["Water", "#1688f8"], ["Gas", "#528c00"], ["Electricity", "#baa500"]];
    return `<div class="utlt-pills" role="group" aria-label="Utility type">${utilities.map(([name, color]) => `<button class="utlt-pill ${state.utility === name ? "is-active" : ""}" aria-pressed="${state.utility === name}" data-action="utility" data-value="${name}" style="--utility-color:${color}">${name}</button>`).join("")}</div>`;
  }

  function usage(summary) {
    const goal = Math.max(1, Number(state.goal) || 350);
    const percent = Math.round(summary.used / goal * 100);
    const dash = Math.min(summary.used / goal, 1) * circumference;
    return `<section class="utlt-usage"><div class="utlt-donut${summary.used > goal ? " is-over" : summary.used / goal >= 0.8 ? " is-warn" : ""}${summary.used <= 0 ? " is-empty" : ""}${percent > 999 ? " is-huge" : ""}"><svg viewBox="0 0 193 193" role="img" aria-label="${percent} percent of daily water goal used"><defs><linearGradient id="utlt-water-gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="var(--utlt-ring-start)"/><stop offset="100%" stop-color="var(--utlt-ring-end)"/></linearGradient></defs><circle class="utlt-donut-track" cx="96.5" cy="96.5" r="84"/><circle class="utlt-donut-value" cx="96.5" cy="96.5" r="84" style="stroke-dasharray:${dash} ${circumference}"/></svg><div class="utlt-donut-label"><strong>${percent > 999 ? "999+" : percent}%</strong><span>Used</span></div></div><div class="utlt-usage-summary"><strong>${number(summary.used)}</strong><span>/ ${number(goal)} Litres</span></div><div class="utlt-goal-stepper"><button type="button" data-action="goal-down" aria-label="Lower daily goal by 10 litres">−</button><span>Daily goal<strong>${number(goal)} L</strong></span><button type="button" data-action="goal-up" aria-label="Raise daily goal by 10 litres">+</button></div></section>`;
  }

  function status(summary) {
    const goal = Math.max(1, Number(state.goal) || 350);
    const used = summary.used;
    const left = Math.max(0, goal - used);
    let tone = "on-track", iconName = "check", title = "You’re on track for today!";
    let text = `You still have ${number(left)} L available today. Keep up your usual routine.`;
    if (used > goal) {
      tone = "over-goal"; iconName = "alert"; title = "Above today’s goal";
      text = `You’ve used ${number(used - goal)} L more than your daily goal. Try to avoid extra water use for the rest of the day.`;
    } else if (used / goal >= 0.8) {
      tone = "warning"; iconName = "alert"; title = "Almost at today’s limit";
      text = `Only ${number(left)} L left today. Please use water carefully for the rest of the day.`;
    }
    return `<section class="utlt-status-card is-${tone}" aria-live="polite"><span class="utlt-status-check">${icon(iconName, 22)}</span><div><strong>${title}</strong><p>${text}</p></div></section>`;
  }

  function greetingMarkup(summary) {
    const hour = new Date().getHours();
    const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const first = (state.name || "").trim().split(" ")[0];
    const today = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
    const goal = Math.max(1, Number(state.goal) || 350);
    let streak = 0;
    const days = summary ? summary.daily : [];
    for (let i = days.length - 1; i >= 0 && days[i].litres <= goal; i--) streak++;
    const streakChip = streak >= 2 ? `<span class="utlt-streak">🔥 ${streak} days in a row within goal</span>` : "";
    return `<div class="utlt-hero"><strong>${part}${first ? ", " + escapeHtml(first) : ""} 👋</strong><span>${today}</span>${streakChip}</div>`;
  }

  function quickStats(summary) {
    const goal = Math.max(1, Number(state.goal) || 350);
    const left = Math.max(0, goal - summary.used);
    const days = summary.daily;
    const previous = days.length > 1 ? days[days.length - 2].litres : 0;
    let trend = "<strong>—</strong>", trendClass = "";
    if (previous > 0) {
      const change = Math.round((summary.used - previous) / previous * 100);
      const down = change <= 0;
      trend = `<strong>${icon(down ? "trendDown" : "trendUp", 16)}${Math.abs(change)}%</strong>`;
      trendClass = down ? " is-good" : " is-bad";
    }
    const within = days.filter(day => day.litres <= goal).length;
    const withinClass = days.length && within >= days.length / 2 ? " is-good" : "";
    return `<section class="utlt-quickstats" aria-label="Today at a glance"><div class="utlt-stat${summary.used > goal ? " is-bad" : ""}"><span class="utlt-stat-label">Left today</span><strong>${number(left)} L</strong></div><div class="utlt-stat${trendClass}"><span class="utlt-stat-label">vs previous day</span>${trend}</div><div class="utlt-stat${withinClass}"><span class="utlt-stat-label">Days within goal</span><strong>${within}/${days.length}</strong></div></section>`;
  }

  function tipCard(summary) {
    const total = summary.byUse.reduce((sum, item) => sum + item.litres, 0);
    if (!total) return "";
    const top = summary.byUse.reduce((best, item) => item.litres > best.litres ? item : best, summary.byUse[0]);
    const tips = window.UTLTData.tips || {};
    const tip = tips[top.label] || tips.default;
    if (!tip) return "";
    const share = Math.round(top.litres / total * 100);
    const choices = Array.isArray(tip.texts) && tip.texts.length ? tip.texts : [tip.text || ""];
    const tipText = choices[Math.floor(Date.now() / 86400000) % choices.length];
    return `<section class="utlt-tip-card"><span class="utlt-tip-icon" aria-hidden="true">${tip.emoji}</span><div><strong>${escapeHtml(top.label)} is ${share}% of today’s water</strong><p>${escapeHtml(tipText)}</p></div></section>`;
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
      return sweep > 0 ? `<path d="${sector(from, angle)}" fill="${slice.color}" stroke="var(--utlt-card)" stroke-width="2" stroke-linejoin="round"/>` : "";
    }).join("");
    const topSlice = slices.reduce((best, slice) => slice.litres > best.litres ? slice : best, slices[0]);
    const peakLine = total ? `<p class="utlt-peak">${state.breakdown === "use" ? "Most water went to" : "Busiest time of day:"} <strong>${escapeHtml(topSlice.label)}</strong> (${Math.round(topSlice.litres / total * 100)}%)</p>` : "";
    return `<section class="utlt-glance"><h2>A Glance at Your Day</h2><div class="utlt-breakdown-switch" role="group" aria-label="Water breakdown"><button type="button" aria-pressed="${state.breakdown === "use"}" class="${state.breakdown === "use" ? "is-selected" : ""}" data-action="breakdown" data-value="use">By use</button><button type="button" aria-pressed="${state.breakdown === "time"}" class="${state.breakdown === "time" ? "is-selected" : ""}" data-action="breakdown" data-value="time">By time</button></div><div class="utlt-kokonut-card utlt-scroll-reveal"><div class="utlt-kokonut-card-head"><span>WATER BY ${state.breakdown.toUpperCase()}</span><strong>${number(total)} <small>L total</small></strong></div><svg class="utlt-kokonut-pie" viewBox="0 0 176 176" role="img" aria-label="Water usage by ${state.breakdown === "use" ? "activity" : "time of day"}, ${number(total)} litres total"><circle cx="88" cy="88" r="82" fill="var(--utlt-panel)"/>${sectors}<circle class="utlt-pie-hole" cx="88" cy="88" r="52"/><text class="utlt-pie-total" x="88" y="91">${number(total)}</text><text class="utlt-pie-caption" x="88" y="107">LITRES</text></svg><ul class="utlt-kokonut-legend">${slices.map((slice) => `<li><span class="utlt-kokonut-swatch" style="background-color:${slice.color}"></span><span class="utlt-kokonut-legend-copy"><span>${escapeHtml(slice.label)} · ${total ? Math.round(slice.litres / total * 100) : 0}%</span><strong>${number(slice.litres)} L</strong></span></li>`).join("")}</ul>${peakLine}</div><p class="utlt-ai-note">UTLT is AI. It can make mistakes.</p></section>`;
  }

  function weekly(summary) {
    const goal = Math.max(1, Number(state.goal) || 350);
    const scale = Math.max(goal, ...summary.daily.map((day) => day.litres), 1) * 1.08;
    const baseline = 144;
    const goalY = baseline - goal / scale * 112;
    const average = summary.daily.length ? summary.daily.reduce((sum, day) => sum + day.litres, 0) / summary.daily.length : 0;
    const withinGoal = summary.daily.filter((day) => day.litres <= goal).length;
    const weekTotal = summary.daily.reduce((sum, day) => sum + day.litres, 0);
    const lowest = summary.daily.reduce((best, day) => day.litres < best.litres ? day : best, summary.daily[0] || { date: "", litres: 0 });
    const lowestLabel = lowest.date ? (() => { const [y, m, d] = lowest.date.split("-").map(Number); return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(y, m - 1, d)); })() : "—";
    const bars = summary.daily.map((item, index) => {
      const [year, month, day] = item.date.split("-").map(Number);
      const label = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(year, month - 1, day));
      const x = 14 + index * 46;
      const height = Math.max(2, item.litres / scale * 112);
      const y = baseline - height;
      const latest = index === summary.daily.length - 1 ? " is-latest" : "";
      return `<g><rect class="utlt-trend-bar${latest}${item.litres > goal ? " is-over" : ""}" x="${x}" y="${y}" width="31" height="${height}" rx="5"/><text class="utlt-trend-value${latest}" x="${x + 15.5}" y="${Math.max(14, y - 7)}" text-anchor="middle">${Math.round(item.litres)}</text><text class="utlt-trend-date" x="${x + 15.5}" y="164" text-anchor="middle">${label}</text></g>`;
    }).join("");
    return `<section class="utlt-week utlt-scroll-reveal"><h2>See Across Days</h2><div class="utlt-trend-card"><div class="utlt-trend-head"><span>LAST ${summary.daily.length} DAYS</span><strong>Goal ${number(goal)} L</strong></div><svg class="utlt-trend-plot" viewBox="0 0 300 175" role="img" aria-label="Water usage over the last ${summary.daily.length} days, daily goal ${goal} litres"><line class="utlt-trend-goal" x1="8" x2="292" y1="${goalY}" y2="${goalY}"/><line class="utlt-trend-baseline" x1="8" x2="292" y1="${baseline}" y2="${baseline}"/>${bars}</svg><div class="utlt-trend-footer"><span>Daily average</span><strong>${Math.round(average)} L</strong></div><div class="utlt-trend-footer"><span>Days within goal</span><strong>${withinGoal} of ${summary.daily.length}</strong></div><div class="utlt-trend-footer"><span>${summary.daily.length}-day total</span><strong>${number(Math.round(weekTotal))} L</strong></div><div class="utlt-trend-footer"><span>Lowest day</span><strong>${lowestLabel} · ${number(Math.round(lowest.litres))} L</strong></div></div></section>`;
  }

  function communityBucket(litres) {
    const limits = [50, 100, 150, 200, 250, 300, 400, 500, 750, 1000];
    const index = limits.findIndex(limit => litres < limit);
    return index < 0 ? 10 : index;
  }
  function communityInsightMarkup() {
    if (!state.communitySharing) return '<section class="utlt-community-insight"><span class="utlt-community-icon">🌍</span><div><strong>Community water insight</strong><p>Opt in from Friends to compare your daily usage anonymously with other participating UTLT users.</p></div></section>';
    if (state.usingDemo) return '<section class="utlt-community-insight"><span class="utlt-community-icon">💧</span><div><strong>Community comparison is enabled</strong><p>Demo readings are never shared. Connect a real meter to contribute today’s usage.</p></div></section>';
    if (state.communityStatus === "loading") return '<section class="utlt-community-insight"><span class="utlt-community-icon">🌍</span><div><strong>Checking community data…</strong><p>Comparing anonymous usage ranges for today.</p></div></section>';
    if (state.communityPercentile !== null) return '<section class="utlt-community-insight is-ready"><span class="utlt-community-icon">🌱</span><div><strong>You used less water than approximately ' + state.communityPercentile + '% of participating users today!</strong><p>Compared with ' + state.communityParticipants + ' other opt-in users. This is an estimate based on broad usage ranges.</p></div></section>';
    if (state.communityStatus === "error") return '<section class="utlt-community-insight"><span class="utlt-community-icon">⚠️</span><div><strong>Community insight unavailable</strong><p>Could not load the comparison. Your dashboard readings are unaffected.</p></div></section>';
    return '<section class="utlt-community-insight"><span class="utlt-community-icon">🌍</span><div><strong>Collecting community data</strong><p>The comparison appears after at least five other users share real readings for today.</p></div></section>';
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
  function emptyCard() {
    return `<section class="utlt-empty-card"><span class="utlt-empty-icon" aria-hidden="true">${icon("droplet", 30)}</span><h2>Waiting for your first reading</h2><p>As soon as your water monitor sends data, your daily usage, charts and saving tips will appear here.</p><button type="button" class="utlt-primary-button" data-action="pair">Set up your device</button></section>`;
  }
  function shareCard() {
    return `<button type="button" class="utlt-share-button" data-action="share-report">${icon("share", 18)} Share today’s report</button>`;
  }
  function dashboard() {
    const summary = window.UTLTData.summarize(state.readings);
    const source = `<p class="utlt-data-source">${state.usingDemo ? "Demo readings · Connect a device for live data" : "Device readings"}</p>`;
    if (!summary.daily.length) return `<div class="utlt-dashboard">${greetingMarkup(summary)}${usage(summary)}${emptyCard()}${source}</div>`;
    return `<div class="utlt-dashboard">${greetingMarkup(summary)}${usage(summary)}${status(summary)}${quickStats(summary)}${tipCard(summary)}${communityInsightMarkup()}${breakdown(summary)}${weekly(summary)}${shareCard()}<p class="utlt-data-source">${state.usingDemo ? "Demo readings · Connect a device for live data" : "Device readings"}</p></div>`;
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
    return `<section class="utlt-account"><div class="utlt-profile-card"><div class="utlt-avatar">${icon("user", 38)}</div><div><strong>${escapeHtml(state.name || "Your account")}</strong><span>Google account connected</span></div><span class="utlt-connected"><i></i> Active</span></div><section class="utlt-google-auth"><p class="utlt-data-source" role="status">✓ Signed in with Google. Your profile is stored in Firebase.</p><button class="utlt-settings-row" type="button" data-action="sign-out"><span>Sign out</span>${icon("chevron",18)}</button></section><form class="utlt-account-form" id="utlt-account-form"><div class="utlt-section-heading"><div><h2>Personal details</h2><p>Manage your profile and home settings.</p></div></div><label class="utlt-field">Full name<input name="name" value="${escapeHtml(state.name)}" autocomplete="name"></label><label class="utlt-field">Email address<input name="email" type="email" value="${escapeHtml(state.email)}" autocomplete="email"></label><label class="utlt-field">Home name<input name="homeName" value="${escapeHtml(state.homeName)}"></label><label class="utlt-field">Daily water goal <span class="utlt-input-wrap"><input name="goal" type="number" min="1" value="${escapeHtml(state.goal)}"><span>litres</span></span></label><button class="utlt-primary-button utlt-save-button" type="submit">${state.saved ? icon("check", 18) + " Saved" : "Save changes"}</button></form><button class="utlt-settings-row" data-action="theme"><span class="utlt-settings-icon">${icon(state.dark ? "sun" : "moon", 19)}</span><span><strong>Appearance</strong><small>${state.dark ? "Dark mode" : "Light mode"}</small></span>${icon("chevron", 18)}</button><button class="utlt-settings-row" data-action="device"><span class="utlt-settings-icon">${icon(state.device.connected ? "bluetooth" : "bluetoothOff", 19)}</span><span><strong>Connected devices</strong><small>Manage your utility monitor</small></span>${icon("chevron", 18)}</button></section>`;
  }

  function nav() {
    return `<nav class="utlt-tabbar" aria-label="Main navigation"><button class="${state.screen === "home" ? "is-current" : ""}" data-action="home" aria-current="${state.screen === "home" ? "page" : "false"}"><span class="utlt-nav-icon">${icon("home", 24)}</span><span>Home</span></button><button class="${state.screen === "family" ? "is-current" : ""}" data-action="family" aria-current="${state.screen === "family" ? "page" : "false"}"><span class="utlt-nav-icon">${icon("users", 24)}</span><span>Family</span></button><button class="${state.screen === "pair" ? "is-current" : ""}" data-action="pair" aria-current="${state.screen === "pair" ? "page" : "false"}"><span class="utlt-nav-icon">${icon("plus", 24)}</span><span>Devices</span></button><button class="${state.screen === "account" ? "is-current" : ""}" data-action="account" aria-current="${state.screen === "account" ? "page" : "false"}"><span class="utlt-tab-avatar">${icon("user", 18)}</span><span>Account</span></button></nav>`;
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

  const tutorialSlides = [
    {
      title: "Your dashboard at a glance",
      body: "The ring shows how much of today’s water goal you have used. Green means you’re on track, amber means you’re close to the limit, and red means you’ve gone over.",
      tip: "Change your daily goal any time with the − and + buttons under the ring."
    },
    {
      title: "Understand your usage",
      body: "Use “By use” to see where water went, or “By time” to see when it was used. Scroll down to compare your recent days and get a saving tip.",
      tip: "These charts use sample readings until a real monitor is connected."
    },
    {
      title: "Your controls are here",
      body: "Home is your dashboard. Family connects household members, Devices explains pairing a monitor, and Account lets you edit details or change appearance.",
      tip: "Family, Devices and Account need a quick Google sign-in. Gas and electricity are coming in a later version."
    }
  ];

  function onboardingMarkup() {
    const overlayStyle = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(10,18,30,.62);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);";
    const panelStyle = "width:min(100%,420px);max-height:90dvh;overflow:auto;padding:28px;border-radius:28px;background:#fff;color:#17202b;box-shadow:0 30px 80px rgba(0,0,0,.35);font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;";
    const labelStyle = "display:block;margin:18px 0 7px;font-size:13px;font-weight:700;";
    const inputStyle = "width:100%;height:50px;padding:0 14px;border:1.5px solid #cbd5e1;border-radius:14px;background:#fff;color:#17202b;font:inherit;font-size:16px;box-sizing:border-box;";
    const primaryStyle = "width:100%;min-height:52px;margin-top:20px;border:0;border-radius:15px;background:linear-gradient(180deg,#1573de,#0a6fd0);color:#fff;font:inherit;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 10px 20px -10px rgba(10,111,208,.8);";
    const secondaryStyle = "width:100%;min-height:44px;margin-top:8px;border:0;background:transparent;color:#64748b;font:inherit;font-size:14px;font-weight:600;cursor:pointer;";
    if (state.onboarding === "profile") {
      return `<div style="${overlayStyle}" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="utlt-welcome-title" style="${panelStyle}">
        <p style="margin:0 0 8px;color:#0a6fd0;font-size:11px;font-weight:800;letter-spacing:.13em;">WELCOME TO UTLT.AI</p>
        <h2 id="utlt-welcome-title" tabindex="-1" style="outline:none;margin:0;font-size:28px;line-height:1.15;letter-spacing:-.7px;">Let’s set things up</h2>
        <p style="margin:10px 0 0;color:#64748b;font-size:15px;line-height:1.55;">A couple of quick details will help us personalise your dashboard.</p>
        <form id="utlt-welcome-form">
          <label for="utlt-welcome-name" style="${labelStyle}">What is your name?</label>
          <input id="utlt-welcome-name" name="name" type="text" maxlength="60" autocomplete="given-name" placeholder="Enter your name" required pattern=".*\\S.*" title="Please enter your name" style="${inputStyle}">
          <fieldset style="margin:20px 0 0;padding:0;border:0;min-width:0;">
            <legend style="padding:0;font-size:15px;font-weight:700;">What do you plan to save?</legend>
            <p style="margin:5px 0 10px;color:#64748b;font-size:13px;">Choose the utility you want to focus on first.</p>
            ${["Water","Gas","Electricity"].map((item,index) => `<label style="display:flex;align-items:center;gap:10px;margin:9px 0;padding:14px;border:1.5px solid #dbe3ec;border-radius:14px;background:#f8fafc;font-size:15px;font-weight:600;cursor:pointer;"><input type="radio" name="utility" value="${item}" ${index === 0 ? "checked" : ""} style="accent-color:#1688f8;width:17px;height:17px;">${item}</label>`).join("")}
          </fieldset>
          <button type="submit" style="${primaryStyle}">Continue</button>
        </form>
      </section></div>`;
    }
    if (state.onboarding === "tutorial") {
      const slide = tutorialSlides[state.tutorialStep];
      const final = state.tutorialStep === tutorialSlides.length - 1;
      return `<div style="${overlayStyle}" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="utlt-tutorial-title" style="${panelStyle}">
        <p style="margin:0 0 8px;color:#0a6fd0;font-size:11px;font-weight:800;letter-spacing:.13em;">QUICK TOUR · ${state.tutorialStep + 1} OF ${tutorialSlides.length}</p>
        <div aria-hidden="true" style="display:flex;gap:6px;margin:0 0 20px;">${tutorialSlides.map((_,i)=>`<span style="height:6px;flex:1;border-radius:99px;background:${i <= state.tutorialStep ? "#1688f8" : "#e2e8f0"}"></span>`).join("")}</div>
        <h2 id="utlt-tutorial-title" tabindex="-1" style="outline:none;margin:0;font-size:26px;line-height:1.2;letter-spacing:-.6px;">${slide.title}</h2>
        <p style="margin:12px 0;color:#475569;font-size:15px;line-height:1.6;">${slide.body}</p>
        <p style="margin:16px 0 0;padding:14px;border-radius:14px;background:#eff6ff;border-left:4px solid #1688f8;color:#24527a;font-size:13px;line-height:1.55;">💡 ${slide.tip}</p>
        <button type="button" data-action="${final ? "onboarding-done" : "tutorial-next"}" style="${primaryStyle}">${final ? "Go to my dashboard" : "Next"}</button>
        <button type="button" data-action="tutorial-skip" style="${secondaryStyle}">Skip tutorial</button>
      </section></div>`;
    }
    return "";
  }

  let renderToken = 0, lastRenderSig = "", lastDialogKey = "";
  async function render(preserveScroll = false) {
    const token = ++renderToken;
    const previousScroll = preserveScroll ? root.querySelector(".utlt-content")?.scrollTop || 0 : 0;
    const compact = state.screen === "home" && state.utility !== "Water";
    const content = state.screen === "home"
      ? utilityTabs() + (state.utility === "Water" ? dashboard() : `<section class="utlt-unavailable-card"><div class="utlt-unavailable-icon">${icon(state.utility === "Gas" ? "flame" : "bolt", 30)}</div><h2>${state.utility} tracking is coming soon</h2><p>This preview currently tracks water only. When ${state.utility.toLowerCase()} monitoring arrives, you will see:</p><ul class="utlt-coming-list"><li>Your daily ${state.utility.toLowerCase()} usage and goal</li><li>A clear “too much” or “still fine” message</li><li>Records of your previous days</li></ul><button class="utlt-primary-button" data-action="utility" data-value="Water">View water dashboard</button></section>`)
      : state.screen === "device" ? devicePage()
      : state.screen === "account" ? accountPage()
      : state.screen === "family" ? await familyPage()
      : pairPage();
    // A newer render started while we were waiting (for example Family data): drop this stale one.
    if (token !== renderToken) return;
    // Only replay animations when the screen really changes, not on every tap.
    const sig = state.screen + "|" + state.utility + "|" + (state.onboarding ? "dialog" : "app");
    const still = sig === lastRenderSig;
    lastRenderSig = sig;
    // Remember what the person was typing / which control had focus, so a re-render never loses it.
    const active = document.activeElement;
    const focusKey = active && active !== document.body && root.contains(active)
      ? { id: active.id || "", action: active.dataset?.action || "", value: active.dataset?.value || "", name: active.getAttribute?.("name") || "", fieldValue: active.getAttribute?.("value") || "" } : null;
    const nameDraft = root.querySelector("#utlt-welcome-name")?.value;
    const utilityDraft = root.querySelector('input[name="utility"]:checked')?.value;
    root.innerHTML = `<div class="utlt-app ${state.dark ? "utlt-dark" : ""} ${still ? "utlt-still" : ""}"><div class="utlt-phone ${state.screen === "pair" ? "utlt-pair" : compact ? "utlt-compact" : ""}">${header()}<main class="utlt-content">${content}</main>${nav()}</div></div>${onboardingMarkup()}`;
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute("content", state.dark ? "#12171d" : "#ffffff"));
    const scroller = root.querySelector(".utlt-content");
    if (scroller) scroller.scrollTop = previousScroll;
    setupChartScrollAnimations(scroller, still);
    if (nameDraft !== undefined) { const input = root.querySelector("#utlt-welcome-name"); if (input && !input.value) input.value = nameDraft; }
    if (utilityDraft) { const radio = root.querySelector(`input[name="utility"][value="${utilityDraft}"]`); if (radio) radio.checked = true; }
    const appEl = root.querySelector(".utlt-app");
    const restoreFocus = () => {
      if (!focusKey) return;
      let target = null;
      if (focusKey.id) target = root.querySelector("#" + CSS.escape(focusKey.id));
      else if (focusKey.name && !focusKey.action) target = root.querySelector(`[name="${CSS.escape(focusKey.name)}"]` + (focusKey.fieldValue ? `[value="${CSS.escape(focusKey.fieldValue)}"]` : ""));
      else if (focusKey.action) target = root.querySelector(`[data-action="${CSS.escape(focusKey.action)}"]` + (focusKey.value ? `[data-value="${CSS.escape(focusKey.value)}"]` : ""));
      if (!target) return;
      target.focus({ preventScroll: true });
      try { if (typeof target.value === "string" && target.setSelectionRange && /^(text|email|search|tel|url)$/.test(target.type)) target.setSelectionRange(target.value.length, target.value.length); } catch (error) { /* not a text field */ }
    };
    if (state.onboarding) {
      // Pop-up open: keep the page behind it out of reach for keyboards and screen readers.
      if (appEl) appEl.setAttribute("inert", "");
      const dialogKey = state.onboarding + ":" + state.tutorialStep;
      if (dialogKey !== lastDialogKey) { lastDialogKey = dialogKey; root.querySelector('[role="dialog"] h2')?.focus({ preventScroll: true }); }
      else restoreFocus();
    } else { lastDialogKey = ""; restoreFocus(); }
  }

  function setupChartScrollAnimations(scroller, still = false) {
    const targets = root.querySelectorAll(".utlt-scroll-reveal");
    if (!targets.length) return;
    if (still) { targets.forEach(element => element.classList.add("is-visible")); return; }
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

  function showToast(message) {
    try {
      document.querySelectorAll(".utlt-toast").forEach((node) => node.remove());
      const toast = document.createElement("div");
      toast.className = "utlt-toast"; toast.setAttribute("role", "status"); toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(() => toast.classList.add("is-leaving"), 2300);
      setTimeout(() => toast.remove(), 2700);
    } catch (error) { console.warn("Could not show message.", error); }
  }
  async function shareReport() {
    const summary = window.UTLTData.summarize(state.readings);
    const goal = Math.max(1, Number(state.goal) || 350);
    const first = (state.name || "").trim().split(" ")[0];
    const text = `${first ? first + "’s" : "My"} water report: ${number(summary.used)} L used of a ${number(goal)} L daily goal (${Math.round(summary.used / goal * 100)}%)${state.usingDemo ? " (sample data)" : ""}. Tracked with UTLT.ai 💧 Let’s save water in Hyderabad!`;
    try {
      if (navigator.share) { await navigator.share({ title: "UTLT.ai water report", text }); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); showToast("Report copied. Paste it anywhere to share."); return; }
      showToast("Sharing is not supported in this browser.");
    } catch (error) { if (!error || error.name !== "AbortError") showToast("Could not share right now."); }
  }

  root.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "tutorial-next") { state.tutorialStep = Math.min(state.tutorialStep + 1, tutorialSlides.length - 1); }
    else if (action === "tutorial-skip" || action === "onboarding-done") { state.onboarding = ""; }
    if (action === "login-google") { signInWithGoogle(); return; }
    else if (action === "auth-cancel") { state.pendingAuthScreen = ""; state.screen = "home"; render(); return; }
    else if (action === "sign-out") { signOutOfApp().catch(error => renderAuthGate(error.message)); return; }
    else if (action === "goal-down" || action === "goal-up") {
      state.goal = Math.min(5000, Math.max(10, (Number(state.goal) || 350) + (action === "goal-up" ? 10 : -10)));
      clearTimeout(goalSaveTimer);
      goalSaveTimer = setTimeout(() => { persistProfile(); syncCompetitionStats(); }, 700);
    }
    else if (action === "share-report") { shareReport(); return; }
    else if (action === "theme") { state.dark = !state.dark; persistProfile(); }
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
    } else if (["home", "pair", "account", "device", "family"].includes(action)) {
      if (["pair", "account", "device", "family"].includes(action) && !firebaseStore) {
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
    render(action === "theme" || action === "utility" || action === "breakdown" || action === "goal-down" || action === "goal-up");
  });

  root.addEventListener("change", (event) => {
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

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.onboarding === "tutorial") { state.onboarding = ""; render(); }
  });

  // Integration surface for the future device bridge. Call these from your
  // Bluetooth/Wi-Fi adapter after receiving readings or connection updates.
  window.UTLT = Object.freeze({
    setReadings(readings) {
      if (!Array.isArray(readings)) throw new TypeError("Readings must be an array");
      state.readings = readings;
      state.usingDemo = false;
      syncFamilyUsage();
      syncCommunityInsight().then(() => { if (state.screen === "home" || state.screen === "family") render(true); });
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
