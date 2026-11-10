"""Seven-day, five-minute pulse history for the ESP32 flash filesystem.

Each nonempty bucket is one 8-byte (Unix bucket start, pulses) record. Records
are appended to UTC-day files; old files are pruned. A powered board needs one
phone time sync before it can date its readings. Without a clock, pulses are
kept separately as an undated total and cannot be placed on a day chart.
"""

import os
import struct

BUCKET_SECONDS = 300
RECORD = "<II"
RECORD_SIZE = 8


class HistoryStore:
    def __init__(self, folder="."):
        self.folder = folder
        self.bucket = None
        self.bucket_pulses = 0
        self.unknown_pulses = 0
        try:
            with open(self._path("unknown.bin"), "rb") as stream:
                data = stream.read(4)
                if len(data) == 4:
                    self.unknown_pulses = struct.unpack("<I", data)[0]
        except OSError:
            pass
        self.unknown_saved = self.unknown_pulses

    def _path(self, name):
        return self.folder.rstrip("/") + "/" + name

    def _save_unknown(self):
        if self.unknown_pulses == self.unknown_saved:
            return
        with open(self._path("unknown.bin"), "wb") as stream:
            stream.write(struct.pack("<I", self.unknown_pulses & 0xFFFFFFFF))
        self.unknown_saved = self.unknown_pulses

    def add(self, epoch_seconds, pulses):
        if pulses <= 0:
            return
        if epoch_seconds is None:
            self.unknown_pulses += pulses
            return
        bucket = int(epoch_seconds) // BUCKET_SECONDS * BUCKET_SECONDS
        if self.bucket is not None and bucket != self.bucket:
            self.flush()
        self.bucket = bucket
        self.bucket_pulses += pulses

    def flush(self):
        if self.bucket is not None and self.bucket_pulses:
            day = self.bucket // 86400
            with open(self._path("hist-{}.bin".format(day)), "ab") as stream:
                stream.write(struct.pack(RECORD, self.bucket, self.bucket_pulses))
            self.bucket_pulses = 0
        self._save_unknown()

    def prune(self, epoch_seconds):
        oldest_day = int(epoch_seconds) // 86400 - 7
        for name in os.listdir(self.folder):
            if not name.startswith("hist-") or not name.endswith(".bin"):
                continue
            try:
                day = int(name[5:-4])
            except ValueError:
                continue
            if day < oldest_day:
                try:
                    os.remove(self._path(name))
                except OSError:
                    pass

    def records(self, epoch_seconds):
        cutoff = int(epoch_seconds) - 7 * 86400
        names = []
        for name in os.listdir(self.folder):
            if name.startswith("hist-") and name.endswith(".bin"):
                try:
                    names.append((int(name[5:-4]), name, os.stat(self._path(name))[6]))
                except ValueError:
                    pass
        def snapshot_rows():
            for _day, name, size in sorted(names):
                with open(self._path(name), "rb") as stream:
                    remaining = size
                    while remaining >= RECORD_SIZE:
                        data = stream.read(RECORD_SIZE)
                        if len(data) < RECORD_SIZE:
                            break
                        remaining -= RECORD_SIZE
                        bucket, pulses = struct.unpack(RECORD, data)
                        if cutoff <= bucket <= int(epoch_seconds) and pulses:
                            yield bucket, pulses
        return snapshot_rows()
