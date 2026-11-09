"""Time a physical 160 mL collection from first ESP32 pulse to the u key.

Run in a normal VS Code terminal, not the MicroPython REPL:
    ./.venv/bin/python tools/calibrate_laptop.py

The sensor must already be wired. Keep the pump off until READY appears.
At 160 mL, stop the pump and press u (no Enter). The board then resets to
its normal Bluetooth firmware.
"""

import subprocess
import sys
import termios
import threading
import time
import tty
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MPREMOTE = ROOT / ".venv" / "bin" / "mpremote"
BOARD_SCRIPT = ROOT / "esp32" / "pulse_stream.py"
PORT = sys.argv[1] if len(sys.argv) > 1 else "/dev/cu.usbserial-0001"
VOLUME_ML = 160

first_pulse_at = None
latest_pulses = 0
first_pulse_seen = threading.Event()


def read_board(stream):
    global first_pulse_at, latest_pulses
    for line in stream:
        line = line.strip()
        if line.startswith("READY:"):
            print(line, flush=True)
        elif line.startswith("COUNT:"):
            try:
                count = int(line[6:])
            except ValueError:
                continue
            latest_pulses = count
            if count > 0 and first_pulse_at is None:
                first_pulse_at = time.monotonic()
                first_pulse_seen.set()
        elif line and not line.startswith(">>>"):
            print("ESP32:", line, flush=True)


def wait_for_u():
    print("At exactly 160 mL, stop the pump and press u (no Enter): ",
          end="", flush=True)
    if not sys.stdin.isatty():
        while input().strip().lower() != "u":
            print("Type u and press Enter: ", end="", flush=True)
        return time.monotonic()
    fd = sys.stdin.fileno()
    old_settings = termios.tcgetattr(fd)
    try:
        tty.setcbreak(fd)
        while True:
            key = sys.stdin.read(1).lower()
            if key == "u":
                stopped_at = time.monotonic()
                print("u", flush=True)
                return stopped_at
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)


def main():
    command = [str(MPREMOTE), "connect", PORT, "run", str(BOARD_SCRIPT)]
    print("Starting ESP32 pulse reader. Keep the pump OFF until READY appears.", flush=True)
    process = subprocess.Popen(command, stdin=subprocess.DEVNULL,
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                               text=True, bufsize=1)
    reader = threading.Thread(target=read_board, args=(process.stdout,), daemon=True)
    reader.start()
    try:
        while not first_pulse_seen.wait(0.1):
            if process.poll() is not None:
                raise RuntimeError("ESP32 pulse reader ended before detecting flow. Check the USB port.")
        print("First pulse detected. Timer started.", flush=True)
        stopped_at = wait_for_u()
        # The pump should already be off. Allow one final serial reading to arrive.
        time.sleep(0.25)
        seconds = stopped_at - first_pulse_at
        pulses = latest_pulses
        print("Time: %.2f seconds" % seconds)
        print("Pulses: %d" % pulses)
        print("Measured flow: %.3f L/min" % (VOLUME_ML * 60 / (seconds * 1000)))
        print("If the cup contains exactly 160 mL: %.0f pulses/L for the app" %
              (pulses * 1000 / VOLUME_ML))
        print("Timing begins at the first observed pulse; USB updates add up to ~0.1 s of uncertainty.")
    finally:
        process.terminate()
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            process.kill()
        subprocess.run([str(MPREMOTE), "connect", PORT, "reset"],
                       capture_output=True, timeout=10, check=False)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nCancelled.")
    except (OSError, RuntimeError) as error:
        print("Error:", error, file=sys.stderr)
        sys.exit(1)
