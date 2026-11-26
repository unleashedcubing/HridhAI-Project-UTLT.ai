const modelId = "HuggingFaceTB/SmolLM2-135M-Instruct";
const revision = "12fd25f77366fa6b3b4b768ec3050bf629380bac";
let loading;

function loadModel() {
  // Share the model load and clear a failed attempt so the user can retry.
  loading ??= (async () => {
    const { pipeline, env } = await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2");
    env.useBrowserCache = true;
    env.allowLocalModels = false;
    env.backends.onnx.wasm.numThreads = 1;
    return pipeline("text-generation", modelId, {
      revision, device: "wasm", dtype: "q8",
      progress_callback: ({ status, progress }) => {
        if (status === "progress" && Number.isFinite(progress)) {
          self.postMessage({ type: "progress", percent: Math.min(99, Math.round(progress)) });
        }
      }
    });
  })().catch(error => { loading = undefined; throw error; });
  return loading;
}

self.onmessage = async ({ data }) => {
  const { id, type, question, facts } = data || {};
  try {
    const generate = await loadModel();
    if (type === "load") return self.postMessage({ id, type: "ready" });
    if (type !== "ask") return;
    const result = await generate([
      { role: "system", content: "You’re Niro, a household water assistant. Answer the water question directly in one plain sentence using the supplied facts. Never make up numbers, activities, or causes. If unsure, say what the meter can measure." },
      { role: "user", content: `Meter facts: ${facts}\nQuestion: ${question}` },
    ], { max_new_tokens: 55, do_sample: false, repetition_penalty: 1.15, return_full_text: false });
    // The model writes explanations. The app calculates all numeric answers.
    const generated = result?.[0]?.generated_text;
    const raw = String(Array.isArray(generated) ? generated.at(-1)?.content || "" : generated || "").trim();
    const sentences = (raw.match(/[^.!?]+[.!?]+/g) || [raw]).map(line =>
      line.trim().replace(/^(?:the )?answer(?: to this question)? is:\s*/i, "")
    ).filter(Boolean);
    const answer = [...new Set(sentences)].slice(0, 2).join(" ");
    if (!answer || /\p{N}|my response|will not repeat|can be found/iu.test(answer)) throw new Error("Could not verify a general explanation.");
    self.postMessage({ id, type: "answer", answer });
  } catch (error) {
    self.postMessage({ id, type: "error", message: error?.message || String(error) });
  }
};
