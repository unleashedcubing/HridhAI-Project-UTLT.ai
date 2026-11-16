# AI-assisted dataset selector.
"""Make one balanced chat example per simulated household for phone-model training."""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent / "llm"
DESTINATION = ROOT / "one_per_home"


def main():
    DESTINATION.mkdir(exist_ok=True)
    for name, households in (("train", 800), ("valid", 100), ("test", 100)):
        records = [json.loads(line) for line in (ROOT / f"{name}.jsonl").read_text().splitlines()]
        if len(records) != households * 5:
            raise ValueError(f"{name} has {len(records)} examples, expected {households * 5}")
        selected = [records[index * 5 + index % 5] for index in range(households)]
        target = DESTINATION / f"{name}.jsonl"
        target.write_text("".join(json.dumps(item, ensure_ascii=False) + "\n" for item in selected))
        print(name, len(selected), "households")


if __name__ == "__main__":
    main()
