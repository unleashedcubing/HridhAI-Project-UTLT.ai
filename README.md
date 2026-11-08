# UTLT.ai — local water demo

This folder starts from the GitHub UTLT.ai web app and adds a Python bridge plus ESP32 MicroPython firmware. The dashboard works in a browser on Android and iPhone because readings travel over Wi-Fi to the Python server; the earlier BLE scanner test is separate. The browser's live values, pie and bar charts come from stored flow packets. The app still shows labeled demo data until a real packet arrives.

## Start the bridge

Python 3.9+ is enough; there are no pip dependencies.

1. Make a long random token: `python3 -c "import secrets; print(secrets.token_hex(24))"`.
2. In a terminal in this folder, run `UTLT_DEVICE_TOKEN='paste-token-here' python3 server.py --host 0.0.0.0 --port 8080`.
3. Find the computer's Wi-Fi IP address. Open `http://COMPUTER_IP:8080/` on your computer and phone. The ESP32, phone and computer must use the same local Wi-Fi, and that network must allow devices to reach each other.

Use a trusted local network. This prototype uses plain HTTP; the device token is sent on that network. Do not expose port 8080 to the public internet. The server stores packets in `water.sqlite3` and does not store Google account data. The existing Firebase login and social features still use Firebase. Google sign-in from a LAN IP may require that origin to be authorized in Firebase; local device readings and the dashboard work as a guest.

## Firebase cloud features

The web app is configured for Firebase project `utlt-ai1`. To use Google sign-in, enable **Google** under Authentication → Sign-in method and allow the app's deployed domain under Authorized domains. Create a Firestore database and deploy this repository's `firestore.rules`. The Friends and Family features store account-linked documents there. Leaderboard and community sharing are opt-in and use Asia/Kolkata dates. The local Python bridge does not verify Firebase users or make the leaderboard tamper-proof.

Guest mode can view the dashboard and local device screen. Account and Family require Google sign-in. The profile's email field is informational; it is not an email/password login.

## Connect the ESP32

1. Keep the pump off while first checking the sensor wiring. Run `esp32/flow_test.py` from VS Code with **MicroPico: Run Current File on Board**. Its pulse count should stay at zero when no water moves. Once the wiring has been visually checked, run the pump from its separate supply and confirm the pulse count rises. Stop the pump; it should stop rising.
2. Copy `esp32/config.example.py` to `esp32/config.py`. Set Wi-Fi name/password, the **computer's LAN IP** (not `localhost`), port 8080, and the same device token. Keep `PUMP_ON_AT_START = False` until the wet loop is complete.
3. Upload `config.py` and `main.py` to the MicroPython ESP32 using MicroPico or `mpremote`. For example, from this folder: `mpremote connect /dev/cu.usbserial-0001 fs cp esp32/config.py :config.py fs cp esp32/main.py :main.py reset`. Use the port printed by `mpremote connect list`.
4. The ESP32 prints its Wi-Fi IP and sends a packet every five seconds. The Devices screen changes from **Bridge ready** to **ESP32 connected** when packets arrive. A packet with zero pulses keeps the connection alive without adding water. With flowing water, the dashboard charts switch to measured litres.

The firmware counts falling edges on **GPIO27**. It drives the pump MOSFET trigger on **GPIO26**. When you have verified the water loop and the MOSFET's printed terminal labels, set `PUMP_ON_AT_START = True` in the ESP32 config and upload it again. The firmware sets the pump output low on a normal exit or Wi-Fi loss. Keep a physical way to unplug pump power.

## Wiring

Follow the actual pin labels and sensor wire colours. On the 830-hole breadboard, use the power rails as distribution points only after checking whether each rail is split in the middle. The earlier shared chat specified **pins**, not numbered holes.

| From | To |
| --- | --- |
| ESP32 VIN/5V | Sensor red and converter HV |
| ESP32 3V3 | Converter LV |
| ESP32 GND | Sensor black, converter GND and MOSFET trigger GND |
| Sensor yellow | Converter HV1 |
| Converter LV1 | ESP32 GPIO27 |
| ESP32 GPIO26 | MOSFET trigger signal |
| Separate 5 V supply | MOSFET power input |
| MOSFET load output | 3–6 V pump |
| Pump wires | 1N4007 diode across them, stripe at pump positive |

Join the pump supply negative to ESP32 GND. Verify VIN/5V has 5 V when powered over USB. The sensor's white connector needs a matching adapter; do not force jumper pins into it. Never put the 5 V sensor output directly on GPIO27. Keep the breadboard, ESP32, exposed joints and power bank dry. Water path: submerged pump outlet → sensor inlet (follow arrow) → sensor outlet → reservoir.

Robocraze lists the [mini white sensor](https://robocraze.com/products/mini-water-flow-sensor-white) at **450 pulses per litre**. The server uses that as its initial `UTLT_PULSES_PER_LITRE` value. Calibrate it with a measured volume for accurate readings. Recirculating water is counted on every lap; it represents demo usage, not water consumed.

## API and data

- `POST /api/device/reading` accepts `{"session":"board-session","sequence":0,"pulses":450}` with `X-UTLT-Device-Token`. The pair of session and sequence makes retries safe.
- `GET /api/water` returns `readings`, `device.connected`, `device.lastConnectedAt`, and `pulsesPerLitre`.
- Each positive packet becomes a dated reading with litres = pulses / `UTLT_PULSES_PER_LITRE`. The backend labels it **Misc** because a flow sensor cannot know whether water was used for food, bathing or housework. The time chart uses its timestamp.

The displayed device connection turns off if no packet arrives for 30 seconds. Previous readings stay visible. The API groups packets by minute for the six-day dashboard; SQLite keeps the original packets.

## Competition day power

The computer must stay on to run this local Python bridge. Power the ESP32 through USB from the computer or a power bank. Power the pump from a separate 5 V output through the MOSFET; do not power it from ESP32 GPIO or 3V3. A suitable 20,000 mAh bank can supply both if it has two working 5 V outputs and stays on at the ESP32's load. Test that exact bank, cabling, Wi-Fi and water loop together before the event.

## Current limits

This is a local prototype. It has no phone-to-ESP32 BLE pairing flow and no remote cloud ingestion. The web app depends on the computer being reachable on the same network. The Firebase social leaderboard is not a tamper-proof competition system. The ESP32 firmware is provided but has not been flashed or tested with the physical flow sensor in this update.
