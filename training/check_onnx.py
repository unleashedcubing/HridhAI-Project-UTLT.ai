"""Small direct ONNX smoke test with Qwen3's explicit 128-wide KV cache."""

import argparse
from pathlib import Path

import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=Path("models/utlt-qwen3-0.6b-onnx"))
    parser.add_argument("--tokens", type=int, default=70)
    args = parser.parse_args()
    tok = AutoTokenizer.from_pretrained(args.model)
    session = ort.InferenceSession(str(args.model / "onnx" / "model_q4f16.onnx"),
                                   providers=["CPUExecutionProvider"])
    messages = [
        {"role": "system", "content": "You are UTLT.ai, a careful water-use assistant. A whole-home flow meter cannot prove an activity. Call activity predictions unverified. Keep answers short."},
        {"role": "user", "content": "The whole-home meter observed 12.0 L starting at 08:30 for about 3 minutes. What activity might this be? /no_think"},
    ]
    ids = np.array([tok.apply_chat_template(messages, add_generation_prompt=True)], dtype=np.int64)
    prompt_length = ids.shape[1]
    cache = {item.name: np.zeros((1, 8, 0, 128), dtype=np.float16)
             for item in session.get_inputs() if item.name.startswith("past_key_values.")}
    output_names = [item.name for item in session.get_outputs()]
    generated = []
    for _ in range(args.tokens):
        past_length = next(iter(cache.values())).shape[2]
        feed = {"input_ids": ids,
                "attention_mask": np.ones((1, past_length + ids.shape[1]), dtype=np.int64),
                "position_ids": np.arange(past_length, past_length + ids.shape[1], dtype=np.int64)[None, :],
                **cache}
        outputs = dict(zip(output_names, session.run(None, feed)))
        token = int(np.argmax(outputs["logits"][0, -1]))
        if token == tok.eos_token_id:
            break
        generated.append(token)
        ids = np.array([[token]], dtype=np.int64)
        cache = {name: outputs[name.replace("past_key_values.", "present.")]
                 for name in cache}
    print(f"Prompt tokens: {prompt_length}; generated: {len(generated)}")
    print(tok.decode(generated, skip_special_tokens=True))


if __name__ == "__main__":
    main()
