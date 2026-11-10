"""Deterministic, illustrative seven-day water sessions for 200 households.

Run: python training/generate_households.py
The unlabeled file contains the same sessions without activity labels.
Synthetic patterns are assumptions for a demo, not measured household data.
"""

import json
import random
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RNG = random.Random(20261110)
START = date(2026, 8, 3)


def clamp(value, low, high):
    return max(low, min(high, value))


def event(day, hour, minute, litres, duration, category):
    hour = int(clamp(hour, 0, 23))
    minute = int(clamp(minute, 0, 59))
    return {
        "recordedAt": f"{day}T{hour:02d}:{minute:02d}:00+05:30",
        "litres": round(max(0.2, litres), 2),
        "durationMinutes": int(max(1, duration)),
        "category": category,
    }


def household(index):
    people = RNG.randint(1, 6)
    shower_hour = RNG.choice((6, 7, 8, 9, 18, 19, 20, 21))
    shower_style = RNG.choice(("bucket", "shower", "mixed"))
    survey = {
        "people": people,
        "usualShowerHour": shower_hour,
        "showerStyle": shower_style,
        "typicalShowerMinutes": RNG.randint(5, 16),
        "laundryDaysPerWeek": RNG.randint(1, 5),
        "dishwasher": RNG.random() < 0.18,
        "cookingMealsPerDay": RNG.randint(1, 3),
        "usualBedtimeHour": RNG.choice((21, 22, 23, 0, 1)),
    }
    days = []
    for offset in range(7):
        day = START + timedelta(days=offset)
        events = []
        for person in range(people):
            hour = shower_hour + RNG.choice((-1, 0, 0, 1))
            duration = int(clamp(RNG.gauss(survey["typicalShowerMinutes"], 2), 3, 24))
            bucket = shower_style == "bucket" or (shower_style == "mixed" and RNG.random() < 0.5)
            litres = RNG.uniform(12, 27) if bucket else duration * RNG.uniform(3.0, 6.3)
            events.append(event(day, hour, RNG.randrange(0, 55, 5), litres, duration, "Bath"))
        for hour in (7, 12, 19):
            if hour == 12 and survey["cookingMealsPerDay"] < 3:
                continue
            if hour == 7 and survey["cookingMealsPerDay"] < 2:
                continue
            litres = RNG.uniform(2.0, 5.5) * people
            events.append(event(day, hour, RNG.randrange(0, 55, 5), litres, RNG.randint(3, 12), "Food/Drink"))
        for hour in (9, 20):
            litres = RNG.uniform(2, 5) if survey["dishwasher"] else RNG.uniform(8, 18)
            events.append(event(day, hour, RNG.randrange(0, 55, 5), litres, RNG.randint(5, 15), "Housework"))
        if offset < survey["laundryDaysPerWeek"]:
            events.append(event(day, RNG.choice((10, 11, 14, 16)), RNG.randrange(0, 55, 5), RNG.uniform(38, 72), RNG.randint(25, 65), "Housework"))
        if RNG.random() < 0.48:
            events.append(event(day, 10, RNG.randrange(0, 55, 5), RNG.uniform(9, 26), RNG.randint(8, 25), "Housework"))
        for _ in range(people * RNG.randint(2, 4)):
            hour = RNG.randint(6, 23)
            events.append(event(day, hour, RNG.randrange(0, 55, 5), RNG.uniform(2.5, 10), RNG.randint(1, 5), "Misc"))
        if RNG.random() < 0.025:
            events.append(event(day, RNG.choice((1, 2, 3, 23)), 0, RNG.uniform(22, 72), RNG.randint(45, 150), "Misc"))
        events.sort(key=lambda item: item["recordedAt"])
        days.append({"date": day.isoformat(), "events": events})
    return {"id": f"home-{index:03d}", "survey": survey, "days": days}


def main():
    labeled = ROOT / "households_labeled.jsonl"
    unlabeled = ROOT / "households_unlabeled.jsonl"
    with labeled.open("w", encoding="utf-8") as labels, unlabeled.open("w", encoding="utf-8") as no_labels:
        for index in range(1, 201):
            home = household(index)
            labels.write(json.dumps(home, separators=(",", ":")) + "\n")
            stripped = json.loads(json.dumps(home))
            for day in stripped["days"]:
                for item in day["events"]:
                    item.pop("category")
            no_labels.write(json.dumps(stripped, separators=(",", ":")) + "\n")
    print("Wrote 200 seven-day households to", labeled.name, "and", unlabeled.name)


if __name__ == "__main__":
    main()
