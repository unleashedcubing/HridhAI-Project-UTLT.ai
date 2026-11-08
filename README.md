# UTLT.ai — standalone water demo

## Pair by scanning the device sticker

The current `esp32/main.py` runs the demo directly on the ESP32. Power it from a USB power bank, scan the private `UTLT-Water` Wi-Fi QR sticker with an iPhone or Android phone, accept the Wi-Fi join prompt, and open **http://192.168.4.1/** in the phone browser. The phone may say this Wi-Fi has no internet; stay connected to use the local dashboard. The QR joins Wi-Fi; phone cameras do not reliably open a webpage as part of the same Wi-Fi QR action, so the sticker also prints the address. No Mac or router is needed while using the demo.

The sticker PNG is kept outside this Git repository because its QR embeds the Wi-Fi password. Make the sticker and `esp32/config.py` use the same SSID and password. The ESP32 serves the app and `/api/water` itself. The flow sensor is on GPIO27. The pump has its own power supply and is not controlled by the ESP32. Google account and cloud social features require internet and are unavailable on the isolated device Wi-Fi.

The sections below document the earlier optional computer bridge, preserved as `esp32/bridge_main.py`. They do not describe the current standalone firmware.

This folder starts from the GitHub UTLT.ai web app and adds a Python bridge plus ESP32 MicroPython firmware. The ESP32 sends each flow reading to the computer over Bluetooth Low Energy (BLE), with Wi-Fi as a backup. The Python bridge stores each packet only once, then serves the same dashboard to Android and iPhone browsers over local Wi-Fi. The browser's ring, pie and bar charts come from stored flow packets. The app shows labeled demo data until a real packet arrives.

## Start the bridge

Python 3.9+ is enough for Wi-Fi only. BLE reception adds the optional `bleak` package.

1. In this folder, create an environment and install BLE support: `python3 -m venv .venv` then `.venv/bin/python -m pip install -r requirements-ble.txt`.
2. Copy `esp32/config.example.py` to `esp32/config.py` and make a long random token: `python3 -c "import secrets; print(secrets.token_hex(24))"`. Put that token in `DEVICE_TOKEN`. This computer's local `config.py` has already been created with a token and its current LAN IP; fill in your Wi-Fi name and password for backup.
3. In a terminal in this folder, run `.venv/bin/python start_bridge.py`. It reads the same token from `config.py` and enables BLE. macOS may ask VS Code or Terminal for Bluetooth permission; allow it for the demo.
4. For Wi-Fi-only operation, omit `--ble` and use `python3 server.py` with the same token and network options.
5. Find the computer's Wi-Fi IP address. Open `http://COMPUTER_IP:8080/` on your computer and phone. The ESP32, phone and computer must use the same local Wi-Fi for Wi-Fi backup, and that network must allow devices to reach each other. The computer must remain close enough to the ESP32 for BLE.

Use a trusted local network. This prototype uses plain HTTP; the device token is sent on that network. Do not expose port 8080 to the public internet. The server stores packets in `water.sqlite3` and does not store Google account data. The existing Firebase login and social features still use Firebase. Google sign-in from a LAN IP may require that origin to be authorized in Firebase; local device readings and the dashboard work as a guest.

## Firebase cloud features

The web app is configured for Firebase project `utlt-ai1`. To use Google sign-in, enable **Google** under Authentication → Sign-in method and allow the app's deployed domain under Authorized domains. Create a Firestore database and deploy this repository's `firestore.rules`. The Friends and Family features store account-linked documents there. Leaderboard and community sharing are opt-in and use Asia/Kolkata dates. The local Python bridge does not verify Firebase users or make the leaderboard tamper-proof.

Guest mode can view the dashboard and local device screen. Account and Family require Google sign-in. The profile's email field is informational; it is not an email/password login.

## Connect the ESP32

1. Keep the pump off while first checking the sensor wiring. Run `esp32/flow_test.py` from VS Code with **MicroPico: Run Current File on Board**. Its pulse count should stay at zero when no water moves. Once the wiring has been visually checked, run the pump from its separate supply and confirm the pulse count rises. Stop the pump; it should stop rising.
2. Check `esp32/config.py`. Set Wi-Fi name/password for backup, the **computer's current LAN IP** (not `localhost`), port 8080, and the same device token used by the bridge. BLE works even when Wi-Fi fields are still placeholders. The pump is not connected to or controlled by the ESP32 in this version.
3. Upload `config.py` and `main.py` to the MicroPython ESP32 using MicroPico or `mpremote`. For example, from this folder: `mpremote connect /dev/cu.usbserial-0001 fs cp esp32/config.py :config.py fs cp esp32/main.py :main.py reset`. Use the port printed by `mpremote connect list`.
4. The ESP32 advertises as **UTLT-Water** over BLE and sends a packet every five seconds. The computer bridge connects automatically when `--ble` is enabled. The same packets are retried over Wi-Fi; the database deduplicates them by session and sequence. The Devices screen changes from **Bridge ready** to **ESP32 connected** when either transport delivers packets. A packet with zero pulses keeps the connection alive without adding water. With flowing water, the dashboard charts switch to measured litres.

The firmware counts falling edges on **GPIO27**. It does not drive GPIO26 or any pump pin. Power the pump separately for the flow test, and keep a physical way to unplug it.

## Wiring

Follow the actual pin labels and sensor wire colours. On the 830-hole breadboard, use the power rails as distribution points only after checking whether each rail is split in the middle. The earlier shared chat specified **pins**, not numbered holes.

| From | To |
| --- | --- |
| ESP32 VIN/5V | Sensor red and converter HV |
| ESP32 3V3 | Converter LV |
| ESP32 GND | Sensor black and converter GND |
| Sensor yellow | Converter HV1 |
| Converter LV1 | ESP32 GPIO27 |


Verify VIN/5V has 5 V when powered over USB. The sensor's white connector needs a matching adapter; do not force jumper pins into it. Never put the 5 V sensor output directly on GPIO27. Keep the breadboard, ESP32, exposed joints and power bank dry. Water path: separately powered submerged pump outlet → sensor inlet (follow arrow) → sensor outlet → reservoir.

Robocraze lists the [mini white sensor](https://robocraze.com/products/mini-water-flow-sensor-white) at **450 pulses per litre**. The server uses that as its initial `UTLT_PULSES_PER_LITRE` value. Calibrate it with a measured volume for accurate readings. Recirculating water is counted on every lap; it represents demo usage, not water consumed.

## API and data

- `POST /api/device/reading` accepts `{"session":"board-session","sequence":0,"pulses":450}` with `X-UTLT-Device-Token`. The pair of session and sequence makes retries safe.
- `GET /api/water` returns `readings`, `device.connected`, `device.lastConnectedAt`, and `pulsesPerLitre`.
- Each positive packet becomes a dated reading with litres = pulses / `UTLT_PULSES_PER_LITRE`. The backend labels it **Misc** because a flow sensor cannot know whether water was used for food, bathing or housework. The time chart uses its timestamp.

The displayed device connection turns off if no packet arrives for 30 seconds. Previous readings stay visible. The API groups packets by minute for the six-day dashboard; SQLite keeps the original packets. The BLE packet is 16 bytes: eight session bytes, then little-endian 32-bit sequence and pulse count. The Wi-Fi packet carries the same fields, so receiving both never doubles the displayed water.

## Competition day power

The computer must stay on to run this local Python bridge. Power the ESP32 through USB from the computer or a power bank. Power the pump from a separate suitable supply; do not power it from ESP32 GPIO or 3V3. A suitable 20,000 mAh bank can supply both if it has two working 5 V outputs and stays on at the ESP32's load. Test that exact bank, cabling, Wi-Fi and water loop together before the event.

## Current limits

This is a local prototype. BLE pairs the ESP32 with the **computer bridge**, not directly with the phone browser. This keeps the browser app usable on iPhone and Android; browser BLE support varies and requires a secure origin. The web app depends on the computer being reachable on the same network. BLE notifications are not encrypted or authenticated in this demo, so use it only in a trusted setting; Wi-Fi packets use the device token. The ESP32 holds up to 120 unsent Wi-Fi packets while the network is down. After that, the oldest Wi-Fi backup packet is dropped so live BLE readings continue; prolonged loss of both links can lose data. The Firebase social leaderboard is not a tamper-proof competition system. The ESP32 firmware is provided but has not been flashed or tested with the physical flow sensor in this update.
