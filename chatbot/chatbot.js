(() => {
  "use strict";
  const API_URL = "https://YOUR-BACKEND-URL.onrender.com";
  const panel = document.getElementById("utlt-ai-panel");
  const launcher = document.getElementById("utlt-ai-launcher");
  const closeButton = document.getElementById("utlt-ai-close");
  const form = document.getElementById("utlt-ai-form");
  const input = document.getElementById("utlt-ai-input");
  const sendButton = document.getElementById("utlt-ai-send");
  const messages = document.getElementById("utlt-ai-messages");
  const status = document.getElementById("utlt-ai-status");
  if (![panel, launcher, closeButton, form, input, sendButton, messages].every(Boolean)) {
    console.error("UTLT.ai assistant: required HTML elements are missing.");
    return;
  }
  let sessionId;
  try {
    sessionId = sessionStorage.getItem("utlt-ai-chat-session");
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem("utlt-ai-chat-session", sessionId);
    }
  } catch (_) { sessionId = "tab-" + Date.now() + "-" + Math.random().toString(36).slice(2); }

  function setOpen(open) {
    panel.hidden = !open;
    launcher.setAttribute("aria-expanded", String(open));
    if (open) input.focus();
  }
  launcher.addEventListener("click", () => setOpen(panel.hidden));
  closeButton.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !panel.hidden) setOpen(false); });

  function appendInline(parent, text) {
    const pattern = /\*\*(.+?)\*\*/g;
    let cursor = 0, match;
    while ((match = pattern.exec(text))) {
      if (match.index > cursor) parent.appendChild(document.createTextNode(text.slice(cursor, match.index)));
      const strong = document.createElement("strong");
      strong.textContent = match[1];
      parent.appendChild(strong);
      cursor = pattern.lastIndex;
    }
    if (cursor < text.length) parent.appendChild(document.createTextNode(text.slice(cursor)));
  }
  function renderBotText(element, text) {
    const lines = String(text || "").replace(/\r/g, "").split("\n");
    let list = null;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) { list = null; continue; }
      if (/^[-*]\s+/.test(trimmed)) {
        if (!list) { list = document.createElement("ul"); element.appendChild(list); }
        const item = document.createElement("li");
        appendInline(item, trimmed.replace(/^[-*]\s+/, ""));
        list.appendChild(item);
      } else {
        list = null;
        const p = document.createElement("p");
        appendInline(p, trimmed);
        element.appendChild(p);
      }
    }
  }
  function addMessage(text, role) {
    const bubble = document.createElement("div");
    bubble.className = "utlt-ai-message " + role;
    if (role === "bot") renderBotText(bubble, text);
    else bubble.textContent = String(text);
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
    return bubble;
  }
  function getAppSnapshot() {
    try {
      if (!window.UTLT || typeof window.UTLT.getState !== "function") return { readings: [], goal: 350 };
      const state = window.UTLT.getState();
      return {
        readings: state.usingDemo === true ? [] : (Array.isArray(state.readings) ? state.readings.slice(-5000) : []),
        goal: Number.isFinite(Number(state.goal)) && Number(state.goal) > 0 ? Number(state.goal) : 350
      };
    } catch (error) {
      console.warn("UTLT.ai could not read app data:", error);
      return { readings: [], goal: 350 };
    }
  }
  async function ask(question) {
    const text = String(question || "").trim();
    if (!text || sendButton.disabled) return;
    setOpen(true);
    addMessage(text, "user");
    input.value = "";
    sendButton.disabled = true;
    status.textContent = "Connecting to UTLT.ai…";
    const pending = addMessage("Thinking…", "bot");
    try {
      if (API_URL.includes("YOUR-BACKEND-URL")) throw new Error("The backend URL has not been configured yet.");
      const snapshot = getAppSnapshot();
      const response = await fetch(API_URL + "/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: text, readings: snapshot.readings, goal: snapshot.goal })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || "Server error " + response.status);
      pending.replaceChildren();
      renderBotText(pending, payload.reply || "I couldn't create a response.");
      status.textContent = payload.source === "demo" ?
        "Using demo readings — connect your meter for live analysis." :
        "Analysing readings from your UTLT.ai app.";
    } catch (error) {
      console.error("UTLT.ai assistant request failed:", error);
      pending.textContent = error.message === "Failed to fetch" ?
        "I can't reach the AI server. Check that the backend is deployed and its CORS origin includes this website." :
        "Assistant unavailable: " + error.message;
      status.textContent = "Connection issue";
    } finally {
      sendButton.disabled = false;
      messages.scrollTop = messages.scrollHeight;
      if (!panel.hidden) input.focus();
    }
  }
  form.addEventListener("submit", e => { e.preventDefault(); ask(input.value); });
  document.querySelectorAll("[data-utlt-question]").forEach(button =>
    button.addEventListener("click", () => ask(button.dataset.utltQuestion)));
  addMessage("Hi! I'm your **UTLT.ai** assistant. I can analyse your water usage, daily goal, forecasts, patterns and possible leaks.", "bot");
  status.textContent = "Ready";
})();