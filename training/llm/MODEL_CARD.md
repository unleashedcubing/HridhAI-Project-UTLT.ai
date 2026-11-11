---
license: apache-2.0
base_model: Qwen/Qwen3-0.6B
tags:
- onnx
- transformers.js
- qwen3
- water-use
---

# UTLT.ai Qwen3 0.6B synthetic water-use fine-tune

This is a 4-bit ONNX export of Qwen3-0.6B fine-tuned with a rank-8 LoRA adapter on 200 **simulated** seven-day household water records. It is intended for the optional on-phone UTLT.ai assistant.

Training examples cover seven-day averages, daily goals, cautious descriptions of uncertain flow events, and low-disruption water-saving advice. The 200 households were split by household into 160 training, 20 validation, and 20 test homes, yielding 800/100/100 chat examples. The held-out synthetic test loss was 0.135 (perplexity 1.144). These scores do not measure performance on real water data.

**Limitations:** The model made an arithmetic error on an independent seven-day average question. Compute all litres, averages, and goal comparisons in application code. A single whole-home flow sensor cannot identify the activity behind a flow event. Treat every activity suggestion as unverified and ask the user to confirm ambiguous periods. The ONNX export reported precision differences from the PyTorch reference at a strict 1e-5 tolerance; local quantized inference worked, but phone WebGPU performance and accuracy still require testing.

Base model: [Qwen/Qwen3-0.6B](https://huggingface.co/Qwen/Qwen3-0.6B), Apache 2.0. Training scripts and adapter: [UTLT.ai project](https://github.com/unleashedcubing/HridhAI-Project-UTLT.ai/tree/codex/esp32-water-bridge/training).
