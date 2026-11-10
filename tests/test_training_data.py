"""Guard the paired synthetic files used to train the browser model."""

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "training"


class TrainingDataTests(unittest.TestCase):
    def test_two_variants_have_identical_sessions_and_only_one_has_labels(self):
        labeled = [json.loads(line) for line in (ROOT / "households_labeled.jsonl").read_text().splitlines()]
        unlabeled = [json.loads(line) for line in (ROOT / "households_unlabeled.jsonl").read_text().splitlines()]
        self.assertEqual(200, len(labeled))
        self.assertEqual(200, len(unlabeled))
        for known, unknown in zip(labeled, unlabeled):
            self.assertEqual(known["id"], unknown["id"])
            self.assertEqual(known["survey"], unknown["survey"])
            self.assertEqual(7, len(known["days"]))
            self.assertEqual(7, len(unknown["days"]))
            for known_day, unknown_day in zip(known["days"], unknown["days"]):
                self.assertEqual(known_day["date"], unknown_day["date"])
                self.assertEqual(len(known_day["events"]), len(unknown_day["events"]))
                for event, blank in zip(known_day["events"], unknown_day["events"]):
                    self.assertIn(event["category"], ("Bath", "Food/Drink", "Housework", "Misc"))
                    self.assertEqual({key: value for key, value in event.items() if key != "category"}, blank)
                    self.assertGreater(event["litres"], 0)


if __name__ == "__main__":
    unittest.main()
