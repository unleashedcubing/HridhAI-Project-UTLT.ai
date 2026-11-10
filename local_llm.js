/* Opt-in, phone-side language model. The model is downloaded only on a tap. */
(function () {
  "use strict";
  let worker = null;
  let nextId = 1;
  const pending = new Map();
  let progressHandler = null;

  function supported() {
    return typeof Worker !== "undefined" && Boolean(navigator.gpu);
  }

  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker("./llm-worker.js", { type: "module" });
    worker.onmessage = event => {
      const message = event.data || {};
      if (message.type === "progress") {
        progressHandler?.(message.percent);
        return;
      }
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.type === "error") request.reject(new Error(message.message));
      else request.resolve(message);
    };
    worker.onerror = error => {
      for (const request of pending.values()) request.reject(new Error(error.message || "Phone AI could not start."));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
    return worker;
  }

  function send(type, data = {}, onProgress) {
    if (!supported()) return Promise.reject(new Error("This browser does not offer WebGPU for the on-phone model."));
    progressHandler = onProgress || null;
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ensureWorker().postMessage({ id, type, ...data });
    });
  }

  window.UTLTLocalLLM = Object.freeze({ supported, load: onProgress => send("load", {}, onProgress), ask: (question, facts) => send("ask", { question, facts }) });
})();
