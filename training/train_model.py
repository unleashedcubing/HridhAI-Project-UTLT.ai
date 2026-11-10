"""Train a free, local numerical activity classifier and export it for the browser.

Run: .venv/bin/python training/train_model.py
Validation holds out entire households, rather than sessions from training homes.
The model suggests labels only; a single whole-home meter cannot identify uses.
"""

import json
import math
from datetime import date
from pathlib import Path

from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score

ROOT = Path(__file__).resolve().parent
FEATURES = (
    "log_litres", "log_duration", "hour_sin", "hour_cos", "people",
    "shower_hour_sin", "shower_hour_cos", "shower_minutes", "shower_style",
    "laundry_days", "dishwasher", "meals", "weekend",
)


def features(event, survey):
    hour = int(event["recordedAt"][11:13]) + int(event["recordedAt"][14:16]) / 60
    shower = int(survey["usualShowerHour"])
    weekday = date.fromisoformat(event["recordedAt"][:10]).weekday()
    return [
        math.log1p(event["litres"]), math.log1p(event["durationMinutes"]),
        math.sin(hour * math.pi / 12), math.cos(hour * math.pi / 12),
        survey["people"], math.sin(shower * math.pi / 12), math.cos(shower * math.pi / 12),
        survey["typicalShowerMinutes"], {"bucket": 0, "mixed": 1, "shower": 2}[survey["showerStyle"]],
        survey["laundryDaysPerWeek"], int(survey["dishwasher"]), survey["cookingMealsPerDay"], int(weekday >= 5),
    ]


def flatten(homes):
    x, y = [], []
    for home in homes:
        for day in home["days"]:
            for event in day["events"]:
                x.append(features(event, home["survey"]))
                y.append(event["category"])
    return x, y


def export_tree(estimator):
    tree = estimator.tree_
    return {
        "feature": tree.feature.tolist(),
        "threshold": [round(float(value), 5) for value in tree.threshold],
        "left": tree.children_left.tolist(),
        "right": tree.children_right.tolist(),
        "probability": [[round(float(value), 6) for value in row[0]] for row in tree.value],
    }


def main():
    homes = [json.loads(line) for line in (ROOT / "households_labeled.jsonl").read_text().splitlines()]
    if len(homes) != 200 or any(len(home["days"]) != 7 for home in homes):
        raise ValueError("Expected 200 complete seven-day households")
    x_train, y_train = flatten(homes[:160])
    x_test, y_test = flatten(homes[160:])
    model = RandomForestClassifier(
        n_estimators=36, max_depth=9, min_samples_leaf=8,
        max_features="sqrt", class_weight="balanced_subsample", random_state=20261110, n_jobs=1,
    )
    model.fit(x_train, y_train)
    predicted = model.predict(x_test)
    report = {
        "trainHouseholds": 160, "testHouseholds": 40,
        "trainSessions": len(y_train), "testSessions": len(y_test),
        "holdoutAccuracy": round(accuracy_score(y_test, predicted), 4),
        "holdoutMacroF1": round(f1_score(y_test, predicted, average="macro"), 4),
        "classes": model.classes_.tolist(),
        "limitation": "Synthetic holdout only; real-world accuracy is unknown. Never treat an activity suggestion as verified.",
    }
    (ROOT / "validation.json").write_text(json.dumps(report, indent=2) + "\n")
    exported = {"version": 1, "features": FEATURES, "classes": model.classes_.tolist(),
                "trees": [export_tree(estimator) for estimator in model.estimators_]}
    (ROOT.parent / "model.json").write_text(json.dumps(exported, separators=(",", ":")))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
