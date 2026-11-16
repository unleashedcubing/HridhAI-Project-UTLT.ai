---
license: apache-2.0
base_model: Qwen/Qwen3-0.6B
tags:
- onnx
- transformers.js
- qwen3
- water-use
---

# UTLT.ai Qwen3 0.6B water assistant version 2

This model is a 4-bit ONNX export of Qwen3-0.6B for questions inside the UTLT.ai phone web app. The team fine-tuned a rank-8 LoRA adapter on synthetic seven-day water records, then merged it with the Apache 2.0 base model.

The dataset contains 1,000 simulated households with seven days each. Eight hundred households were used for training, 100 for validation and 100 for the final test. One balanced chat example from each home was selected for this retraining pass; the full five-example-per-home dataset remains in the project repository. Training resumed from the earlier 200-household adapter and ran 800 steps on the final four transformer layers with masked prompts, batch size 1, maximum sequence length 512 and learning rate 1e-5. The 100-home synthetic test set gave loss **0.110** and perplexity **1.116**. This is a language-model result on simulated prompts, not real-world water-use accuracy.

The local quantized ONNX check generated a cautious activity suggestion and stated that a single flow meter cannot identify the true activity. The ONNX export reported differences from the PyTorch reference at a strict 1e-5 tolerance, so this check does not prove numerical equivalence. Phone WebGPU speed, memory use and answer quality still need testing on the target Android and iPhone browsers.

The app computes litres, averages, goals and forecasts in JavaScript and rejects model answers with numbers not present in supplied facts. The model must not be used to infer a leak, identify an activity as fact, or restrict water supply. Real household labels and calibrated meters are needed before claims of practical accuracy.

Base model: [Qwen3-0.6B](https://huggingface.co/Qwen/Qwen3-0.6B). Training code, dataset generator and adapters: [UTLT.ai repository](https://github.com/unleashedcubing/HridhAI-Project-UTLT.ai/tree/ble-enabled/training).
