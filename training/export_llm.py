"""Merge the trained MLX QLoRA adapter into the original Qwen3 HF weights.

Run on a computer with enough memory before exporting the merged model to ONNX.
The MLX adapter uses A=(input, rank), B=(rank, output), scale=20; PEFT
uses their transposes and lora_alpha/r=20 (alpha=160 for rank 8).
"""

import argparse
from pathlib import Path

import torch
from peft import LoraConfig, get_peft_model
from safetensors import safe_open
from transformers import AutoModelForCausalLM, AutoTokenizer

BASE = "Qwen/Qwen3-0.6B"
PROJECTIONS = ("q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--adapter", type=Path, default=Path("training/llm/trained_adapter/adapters.safetensors"))
    parser.add_argument("--output", type=Path, default=Path("/private/tmp/utlt-qwen3-merged"))
    args = parser.parse_args()

    model = AutoModelForCausalLM.from_pretrained(BASE, dtype=torch.float16, low_cpu_mem_usage=True)
    config = LoraConfig(r=8, lora_alpha=160, target_modules=list(PROJECTIONS),
                        layers_to_transform=[24, 25, 26, 27], bias="none",
                        task_type="CAUSAL_LM")
    model = get_peft_model(model, config)
    loaded = 0
    with safe_open(args.adapter, framework="pt", device="cpu") as adapter:
        for name, layer in model.named_modules():
            if not hasattr(layer, "lora_A") or "default" not in layer.lora_A:
                continue
            # PEFT prefix: base_model.model.model.layers.N....
            source = name.removeprefix("base_model.model.")
            for letter, parameter in (("a", layer.lora_A["default"].weight),
                                      ("b", layer.lora_B["default"].weight)):
                key = f"{source}.lora_{letter}"
                if key not in adapter.keys():
                    raise KeyError(f"Missing trained weight: {key}")
                value = adapter.get_tensor(key).T.contiguous().to(parameter.dtype)
                if value.shape != parameter.shape:
                    raise ValueError(f"{key}: {value.shape} != {parameter.shape}")
                with torch.no_grad():
                    parameter.copy_(value)
                loaded += 1
    if loaded != 56:
        raise ValueError(f"Expected 56 LoRA tensors, loaded {loaded}")
    print(f"Loaded {loaded} trained tensors; merging into Qwen3")
    merged = model.merge_and_unload()
    args.output.mkdir(parents=True, exist_ok=True)
    merged.save_pretrained(args.output, safe_serialization=True)
    AutoTokenizer.from_pretrained(BASE).save_pretrained(args.output)
    print(f"Merged model: {args.output}")


if __name__ == "__main__":
    main()
