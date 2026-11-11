"""Build household-disjoint, synthetic chat examples for Qwen3 LoRA training.

The answers come from exact arithmetic and simulator labels. A flow meter cannot
prove a use category, so every event label in an answer remains a suggestion.
"""

import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SYSTEM = ("You are UTLT.ai, a careful water-use assistant. Use supplied meter "
          "facts for quantities. A whole-home flow meter cannot prove an activity. "
          "Call activity predictions unverified. Keep answers short.")


def message(question, answer):
    return {"messages": [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": question + " /no_think"},
        {"role": "assistant", "content": answer},
    ]}


def examples(home):
    survey = home["survey"]
    people = survey["people"]
    days = home["days"]
    totals = [sum(event["litres"] for event in day["events"]) for day in days]
    profile = (f"Household survey: {people} people, usual shower at "
               f"{survey['usualShowerHour']}:00, {survey['showerStyle']} bathing. ")
    daily = "; ".join(f"{day['date']}: {total:.1f} L" for day, total in zip(days, totals))
    average = sum(totals) / 7
    yield message(
        f"{profile}Seven measured days: {daily}. What was the daily average?",
        f"The measured seven-day average was {average:.1f} L per day, or about "
        f"{average / people:.1f} L per person per day. These are calculated meter totals."
    )
    today = days[-1]
    total = totals[-1]
    left = 350 - total
    yield message(
        f"{profile}Today ({today['date']}) the meter recorded {total:.1f} L. "
        "The daily goal is 350 L. How are we doing?",
        (f"Today's measured use is {total:.1f} L, {left:.1f} L below the 350 L goal."
         if left >= 0 else f"Today's measured use is {total:.1f} L, {-left:.1f} L above the 350 L goal.")
    )
    # Choose one event from each home, rather than flooding training with many
    # near-identical synthetic events from the same simulator.
    candidate = sorted(today["events"], key=lambda item: item["litres"])[len(today["events"]) // 2]
    yield message(
        f"{profile}The whole-home meter observed {candidate['litres']:.1f} L "
        f"starting at {candidate['recordedAt'][11:16]} for about "
        f"{candidate['durationMinutes']} minutes. What activity might this be?",
        f"This could be {candidate['category'].lower()}, but that is an unverified "
        "suggestion. A single flow meter cannot identify the actual activity."
    )
    amounts = Counter()
    for event in today["events"]:
        amounts[event["category"]] += event["litres"]
    largest = max(amounts, key=amounts.get)
    action = {"Bath": "Use a bucket bath or shorten the shower.",
              "Food/Drink": "Use a bowl rather than a running tap when washing food.",
              "Housework": "Run full laundry loads and turn off the tap while scrubbing.",
              "Misc": "Turn off running water while soaping or scrubbing."}[largest]
    yield message(
        f"Simulated, human-labeled household record: {profile}Today's total was "
        f"{total:.1f} L. The largest labeled use was {largest.lower()} at "
        f"{amounts[largest]:.1f} L. What is one low-disruption action?",
        action
    )
    yield message(
        f"{profile}The whole-home meter shows {total:.1f} L today. Can you tell "
        "exactly which household activity used it?",
        "No. The flow meter measures total water and time, but it cannot prove "
        "whether a particular flow was for bathing, food, or housework. "
        "Please confirm uncertain periods yourself."
    )


def main():
    homes = [json.loads(line) for line in (ROOT / "households_labeled.jsonl").read_text().splitlines()]
    if len(homes) != 200 or any(len(home["days"]) != 7 for home in homes):
        raise ValueError("Expected 200 complete seven-day homes")
    for filename, selected in (("train.jsonl", homes[:160]),
                               ("valid.jsonl", homes[160:180]),
                               ("test.jsonl", homes[180:])):
        with (ROOT / "llm" / filename).open("w") as stream:
            for home in selected:
                for item in examples(home):
                    stream.write(json.dumps(item, ensure_ascii=False, separators=(",", ":")) + "\n")
        print(filename, len(selected) * 5, "examples")


if __name__ == "__main__":
    (ROOT / "llm").mkdir(exist_ok=True)
    main()
