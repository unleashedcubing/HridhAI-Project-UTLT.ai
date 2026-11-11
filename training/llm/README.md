# UTLT Qwen3 fine-tune

This folder holds chat examples made from the 200 **simulated** seven-day households in `../households_labeled.jsonl`. `generate_llm_dataset.py` splits by household, so no household appears in both training and evaluation: 160 homes/800 examples for training, 20/100 for validation, and 20/100 for test. It covers averages, goals, uncertain activity suggestions, and modest water-saving actions. The underlying flow meter measures amount and time; its activity labels cannot be verified from flow alone.

The final adapter is `trained_adapter/adapters.safetensors`. It fine-tunes `mlx-community/Qwen3-0.6B-4bit` with LoRA rank 8, scale 20, on the final four transformer layers. Training used Apple MLX LM 0.32.2, masked prompts, batch size 1, sequence length 512, 100 initial iterations plus 200 resumed iterations. The 100 held-out synthetic examples had loss **0.135** and perplexity **1.144**. This is a synthetic language-model metric, not a measure of real household activity accuracy. One independent arithmetic check gave a wrong per-person average (70 instead of 87.5 L), so app code must calculate all meter quantities and goals.

To reproduce on Apple Silicon, use a dedicated Python environment with `mlx-lm[train]==0.32.2` and a compatible Transformers version:

```sh
python training/generate_llm_dataset.py
mlx_lm.lora --model mlx-community/Qwen3-0.6B-4bit --train --data training/llm --iters 100 --batch-size 1 --num-layers 4 --max-seq-length 512 --mask-prompt --adapter-path training/llm/checkpoint1 --save-every 100
mlx_lm.lora --model mlx-community/Qwen3-0.6B-4bit --train --data training/llm --iters 200 --batch-size 1 --num-layers 4 --max-seq-length 512 --mask-prompt --resume-adapter-file training/llm/checkpoint1/adapters.safetensors --adapter-path training/llm/checkpoint2 --save-every 200
mlx_lm.lora --model mlx-community/Qwen3-0.6B-4bit --data training/llm --adapter-path training/llm/checkpoint2 --test --test-batches 100 --batch-size 1 --max-seq-length 512 --mask-prompt
```

The adapter alone is an MLX training artifact. The merged and quantized model was built locally and passed ONNX validation and a direct CPU inference check. The packaged model is at `models/utlt-qwen3-0.6b-onnx/` on this computer; its 564 MB ONNX weight file is deliberately Git-ignored because GitHub rejects files over 100 MB. It still needs to be uploaded to a model host and tested in Chrome/Bluefy before the live app can load it. The current site therefore still uses the original pretrained ONNX model.

To rebuild the browser package in a **separate** Python environment with `torch`, `peft`, `optimum-onnx`, `onnxruntime==1.22.1`, and `onnx`:

```sh
python training/export_llm.py
optimum-cli export onnx --model /private/tmp/utlt-qwen3-merged --task text-generation-with-past --dtype fp16 /private/tmp/utlt-qwen3-onnx
python -m onnxruntime.quantization.matmul_nbits_quantizer --input_model /private/tmp/utlt-qwen3-onnx/model.onnx --output_model /private/tmp/utlt-qwen3-onnx/model_q4f16.onnx --block_size 32 --symmetric true --accuracy_level 2 --op_types_to_quantize MatMul
python training/package_llm.py
python training/check_onnx.py
```

The FP16 ONNX export reported output differences at an extremely strict `1e-5` tolerance. The direct quantized inference check produced a water-use answer, but neither that check nor synthetic test loss is a phone performance test. Upload the package with its `onnx/` subfolder intact; Transformers.js expects `onnx/model_q4f16.onnx` under the model ID. Once hosted, update the model ID in `llm-worker.js`, then test the download and answer quality on the actual phone.
