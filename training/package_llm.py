"""Package the quantized ONNX export as a Transformers.js model repository.

The ORT quantizer writes an external data sidecar. Transformers.js model repos
normally serve a single `onnx/model_q4f16.onnx`, so embed that sidecar here.
"""

import argparse
import shutil
from pathlib import Path

import onnx


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=Path("/private/tmp/utlt-qwen3-onnx"))
    parser.add_argument("--output", type=Path, default=Path("models/utlt-qwen3-0.6b-onnx"))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    onnx_dir = args.output / "onnx"
    onnx_dir.mkdir(exist_ok=True)
    source = args.input / "model_q4f16.onnx"
    model = onnx.load(source, load_external_data=True)
    target = onnx_dir / "model_q4f16.onnx"
    onnx.save_model(model, target, save_as_external_data=False)
    onnx.checker.check_model(target)
    for name in ("config.json", "generation_config.json", "tokenizer.json",
                 "tokenizer_config.json", "special_tokens_map.json", "added_tokens.json",
                 "chat_template.jinja", "vocab.json", "merges.txt"):
        file = args.input / name
        if file.exists():
            shutil.copy2(file, args.output / name)
    print(f"Packaged {target} ({target.stat().st_size / 1_000_000:.1f} MB)")


if __name__ == "__main__":
    main()
