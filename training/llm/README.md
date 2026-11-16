# UTLT Qwen3 phone model

The current phone assistant uses [HrishiBuilds/UTLT-Qwen3-0.6B-ONNX-v2](https://huggingface.co/HrishiBuilds/UTLT-Qwen3-0.6B-ONNX-v2). It is Qwen3-0.6B with a rank-8 LoRA adapter fine-tuned on simulated UTLT water questions, merged and exported as a 4-bit ONNX model. Its 564 MB weights stay out of GitHub; `llm-worker.js` downloads them into the browser cache when the user taps **Download on-phone AI**.

The data generator made 1,000 seven-day households. Eight hundred were used for training, 100 for validation and 100 for test, with no home shared across splits. The full dataset has five chat examples per home. To cover every training home in one feasible MacBook Air pass, `make_llm_subset.py` picked one balanced example per home. Training resumed from the earlier 200-home adapter in `adapter_200_households/` and ran 800 more steps on the final four layers, masked prompts, batch size 1, length 512 and learning rate 1e-5. The 100-home held-out synthetic test set gave loss **0.110** and perplexity **1.116**. These metrics do not measure real-household activity accuracy or phone performance, and the old and new scores use different test sets.

Recreate the adapter on Apple Silicon with MLX LM 0.32.2:

```sh
python training/generate_households.py
python training/generate_llm_dataset.py
python training/make_llm_subset.py
mlx_lm.lora --model mlx-community/Qwen3-0.6B-4bit --train --data training/llm/one_per_home --iters 800 --batch-size 1 --num-layers 4 --max-seq-length 512 --mask-prompt --learning-rate 1e-5 --resume-adapter-file training/llm/adapter_200_households/adapters.safetensors --adapter-path training/llm/trained_adapter --save-every 200
mlx_lm.lora --model mlx-community/Qwen3-0.6B-4bit --data training/llm/one_per_home --adapter-path training/llm/trained_adapter --test --test-batches 100 --batch-size 1 --max-seq-length 512 --mask-prompt
```

The browser package was rebuilt with the project scripts and Optimum ONNX:

```sh
python training/export_llm.py --adapter training/llm/trained_adapter/adapters.safetensors --output /private/tmp/utlt-qwen3-merged-v2
optimum-cli export onnx --model /private/tmp/utlt-qwen3-merged-v2 --task text-generation-with-past --dtype fp16 /private/tmp/utlt-qwen3-onnx-v2
python -m onnxruntime.quantization.matmul_nbits_quantizer --input_model /private/tmp/utlt-qwen3-onnx-v2/model.onnx --output_model /private/tmp/utlt-qwen3-onnx-v2/model_q4f16.onnx --block_size 32 --symmetric true --accuracy_level 2 --op_types_to_quantize MatMul
python training/package_llm.py --input /private/tmp/utlt-qwen3-onnx-v2 --output models/utlt-qwen3-0.6b-onnx-v2
python training/check_onnx.py --model models/utlt-qwen3-0.6b-onnx-v2
```

The quantized local check produced a cautious answer and said a whole-home meter cannot identify the actual activity. The FP16 ONNX export reported differences from its PyTorch reference at a strict `1e-5` tolerance, so the export is not numerically identical by that test. The app calculates litres, averages and goals itself and filters model answers that invent numbers. Android Chrome and iPhone Bluefy still need end-to-end download, memory and answer tests. A single flow sensor cannot prove bath, food or cleaning labels; confirmation and real-household validation remain necessary.
