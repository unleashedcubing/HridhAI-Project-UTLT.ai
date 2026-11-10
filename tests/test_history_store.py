"""Persistence checks that run on a computer without an ESP32 attached."""

import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "esp32"))
from history_store import HistoryStore  # noqa: E402


class HistoryStoreTests(unittest.TestCase):
    def test_seven_day_history_survives_restart_and_prunes_old_days(self):
        with tempfile.TemporaryDirectory() as folder:
            store = HistoryStore(folder)
            start = 1_800_000_000
            store.add(start, 100)
            store.add(start + 60, 25)
            store.flush()
            for day in range(1, 9):
                store.add(start + day * 86400, day * 10)
                store.flush()
            restarted = HistoryStore(folder)
            now = start + 8 * 86400
            restarted.prune(now)
            rows = list(restarted.records(now))
            self.assertEqual(8, len(rows))
            self.assertEqual(10, rows[0][1])
            self.assertEqual(80, rows[-1][1])

    def test_unknown_time_pulses_are_persisted_but_not_dated(self):
        with tempfile.TemporaryDirectory() as folder:
            store = HistoryStore(folder)
            store.add(None, 47)
            store.flush()
            restored = HistoryStore(folder)
            self.assertEqual(47, restored.unknown_pulses)
            self.assertEqual([], list(restored.records(1_800_000_000)))

    def test_history_snapshot_does_not_include_later_appends(self):
        with tempfile.TemporaryDirectory() as folder:
            store = HistoryStore(folder)
            start = 1_800_000_000
            store.add(start, 100)
            store.flush()
            snapshot = store.records(start + 600)
            store.add(start + 300, 50)
            store.flush()
            self.assertEqual([(start, 100)], list(snapshot))
            self.assertEqual(2, len(list(store.records(start + 600))))


if __name__ == "__main__":
    unittest.main()
