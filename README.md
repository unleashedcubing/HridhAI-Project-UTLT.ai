# UTLT.ai water demo

UTLT.ai is a HridhAI 2026 team project. The current build measures water in a recirculating demo and shows the readings in a phone web app. Gas and electricity are planned extensions, not working measurements yet. The three-page [project report](reports/UTLT_Project_Report_16_Nov_2026.docx) records the build and each member's contribution through 16 November.

## Team and credits

| Member | Work recorded so far |
| --- | --- |
| Hrishi Varun | Original water-conservation direction and research; first Figma screens; ESP32 MicroPython, circuit build, pulse calibration and troubleshooting; local AI direction and integration; enclosure work with Saketh. |
| Saketh | Joint enclosure design with Hrishi, from early SketchUp trials to the Shapr3D case and fit checks. |
| Armaan | HTML and JavaScript navigation, Firebase profiles, Google sign-in, and the Friends idea that led to discussion of family monitoring. |
| S. Vibhav Ram | Physical demo operation, team coordination and testing support. His contribution report describes this as ongoing work. |
| Abhinav | App UI and backend work with Armaan; a fuller record will be added when his own report is available. |

The team used Figma, Shapr3D, VS Code, MLX and AI-assisted coding tools during development. The hardware readings and AI suggestions still need independent physical validation.

### Development and source credit

Claude Code and OpenAI Codex were used to debug and improve the source code. Source headers marked **AI-assisted** identify files with substantial AI-assisted changes; they do not replace the team members' design, wiring, testing or coding credits. The bundled third-party QR decoder is credited separately.

The app uses two distinct models: [Qwen3-0.6B](https://huggingface.co/Qwen/Qwen3-0.6B), fine-tuned for the on-phone question assistant, and a local [scikit-learn random forest](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.RandomForestClassifier.html) for tentative activity labels. Meter totals, goals and forecasts are calculated in code. The training records are simulated, so neither model has demonstrated real-household activity accuracy.

Open-source code and runtimes used: [MicroPython](https://micropython.org/) on the ESP32, [jsQR](https://github.com/cozmo/jsQR) for QR image decoding (bundled with its [Apache 2.0 license](vendor/jsQR.LICENSE)), [Transformers.js](https://github.com/huggingface/transformers.js) for browser inference, [MLX LM](https://github.com/ml-explore/mlx-lm) for fine-tuning, and [ONNX Runtime](https://onnxruntime.ai/) for model validation and quantization. Firebase provides account and cloud features. The [Qwen3 base model](https://huggingface.co/Qwen/Qwen3-0.6B) is Apache 2.0 licensed.

The report's external evidence comes from the [Central Ground Water Board's 2024 Telangana assessment](https://www.cgwb.gov.in/cgwbpnm/public/uploads/documents/1743586655783642514file.pdf). Future gas and electricity modules should use approved meter outputs; examples are [Itron's gas-meter pulse sensor](https://apac.itron.com/pt/products/cyble-sensor) and [Landis+Gyr's E220 optical pulse specification](https://www.landisgyr.com/product/landisgyr-e220/?download=205084&filename=%2Fwebfoo%2Fwp-content%2Fuploads%2F2018%2F08%2FD000063493-E220-AMxD-Technical-Data-en-b.pdf). These are design references, not parts in the current prototype.

## Phone pairing

The GitHub Pages app is the phone interface. The ESP32 runs `esp32/main.py` and sends flow readings over Bluetooth Low Energy (BLE) to **Chrome on Android** or **Bluefy on iPhone**. iPhone Chrome cannot use Web Bluetooth. After firmware is uploaded, the demo needs only the phone, ESP32, and power bank; the pump has its own power source. No computer bridge, home Wi-Fi, or device hotspot is needed.

1. Power the ESP32 from the USB power bank. It advertises as **UTLT-A014** on the current board.
2. Open the GitHub Pages app in **Chrome on Android** or **Bluefy on iPhone** over HTTPS, then open **Devices**.
3. Tap **Scan device QR** and point the camera at [this board's sticker](assets/UTLT-A014-pairing-qr.png). Allow camera access. In Bluefy, **Or use a camera photo** is available if live camera scanning does not work.
4. On the first connection, tap **Allow Bluetooth for UTLT-A014**, choose **UTLT-A014** in Chrome's Bluetooth prompt, and allow the connection. The chooser is filtered to that exact name, so unrelated Bluetooth devices should not appear. After permission is granted, the app remembers that browser device and tries to reconnect automatically when opened again.
5. The dashboard reads the meter every two seconds. The app always converts at **4,075 pulses per litre**. The observed 15.7–17.3 pulses/s and 38–41 s to fill 160 mL imply roughly 3,729–4,433 pulses/L. Against 4,075, that corresponds to an estimated volume error of **−8.5% to +8.8%**. These are bounds made from separate timing and pulse-rate ranges, not a measured accuracy specification. Pump off should show no increase; pump on should make the total rise. In a recirculating demo, each lap is counted as simulated usage.

Chrome camera and Bluetooth permissions must be allowed. The scanned device ID is remembered on that phone. A new device requires one tap after scanning to open Chrome's Bluetooth chooser; scanning the QR alone cannot summon an Android OS pairing prompt from a website. Previously granted devices reconnect automatically when the app is visible and Chrome still has permission. Keep the page open for live readings. After pairing, Google sign-in and the household survey are required before the dashboard opens, so initial setup needs internet. For a sample dashboard before pairing, use **Devices → Explore with demo data**; live data turns demo mode off automatically. The QR contains the ESP32's public ID, **not** a Wi-Fi password. It identifies the device in the browser but does not provide secure ownership authentication; that is future product work.

The mini flow sensor is specified for 0.5–5 L/min. The app ignores intervals above 6 L/min and shows a sensor warning instead of adding impossible litres. If readings rose falsely during a demo, use **Devices → Pair a device → Clear saved water readings**, then reconnect. If the warning appears only while the pump is on, test the pump on a separate charger or power bank while keeping the ESP32 on its own 5 V USB supply. Check the sensor red/black/yellow wiring, converter HV/LV rails, and common ground; an app filter does not repair a noisy electrical signal.

The Devices screen also shows the raw pulse count and pulses per second. A display of hundreds of pulses/s would point to false pulses or a very different sensor calibration, not a decimal place in the app.

### 160 mL timing check (USB serial)

For the laptop-only first-pulse test, leave the flow sensor wired and powered, turn the pump **off**, and run `./.venv/bin/python tools/calibrate_laptop.py` in a normal VS Code terminal. When it prints READY, turn on the pump and collect water at the sensor outlet. The timer starts on the first detected pulse. At exactly 160 mL, stop the pump and press `u` **without Enter** in that same Mac terminal. It prints elapsed seconds, pulse count, flow, and pulses/L. It automatically resets the ESP32 to the normal Bluetooth firmware afterward. Do not unplug and replug the sensor's exposed jumper wires to start the timer.

`esp32/calibrate_160ml.py` is a temporary interactive MicroPython script for a separate timing experiment. It does not alter the app's fixed 4,075 pulses/L conversion. Upload it to the ESP32 as `calibrate_160ml.py`, open the MicroPython REPL, interrupt `main.py` with Ctrl-C, then enter `import calibrate_160ml`. Reset the board afterward to resume the BLE app.

The optional `USE_MOSFET` setting in this script is **False** until the pump switch is wired. For the Robocraze 15A/400W module, follow the printed terminal labels: 5 V pump supply to `DC+`/`DC-`, pump leads to `OUT+`/`OUT-`, ESP32 GPIO26 to `TRIG`/`PWM+`, and ESP32 GND to the module's signal `GND` and pump supply negative. The ESP32 USB supply is separate from the pump's 5 V feed; never power the pump from GPIO26 or the 3V3 pin. Place a 1N4007 diode directly across the pump leads, stripe/band at pump positive and the other end at pump negative. It absorbs the motor's turn-off voltage spike. This diode is for on/off switching; do not use high-frequency PWM speed control with this setup. Check the actual module's labels before connecting power.

The current ~0.2–0.3 L/min demo flow is below the sensor's rated minimum, so 4,075 pulses/L is only a practical demo estimate, not a guarantee across other flows.

Both boards run MicroPython v1.29.0. The older `UTLT-2C2C` has the earlier BLE meter firmware; `UTLT-A014` has the seven-day history firmware. On 12 November, both advertised and returned valid 16-byte live packets; A014 also completed the time-sync/history handshake. On 15 November, both paired on iPhone Bluefy from the same power source, but the user reported 2C2C working and A014 still not reporting water. Pairing therefore does not establish that A014's GPIO27 is receiving sensor pulses. For the next diagnosis, power **one board at a time** with the same sensor and level converter wiring, run water for 15 seconds, and watch **Devices → Total pulses**. If 2C2C rises but A014 stays at zero, check the A014 GPIO27 jumper, ground, converter HV/LV connections, and sensor plug; then test the board input. Do not connect the sensor signal to both boards at once. This needs a live-flow test; no firmware change is justified by pairing alone. Both boards were placed in deep sleep after the earlier inspection; unplug USB for complete power-off and press EN after repowering.

The browser-independent QR fallback uses [jsQR](https://github.com/cozmo/jsQR). Its bundled code and Apache 2.0 license are in `vendor/`.

The supplied wordmark is preserved in `assets/utlt-logo-original.png`. `assets/utlt-logo-styles.png` compares monochrome, water-blue, and light-background treatments. The small U-and-orbit mark is used for the favicon, loading screen, and installable app icon.

## ESP32 setup

The connected ESP32-D0WD-V3 (4 MB flash, ID `c82e18bfa014`) was flashed with official MicroPython v1.29.0. Both meter files were uploaded and a Bluetooth read returned advancing sequence numbers. For future updates, find the serial port with `mpremote connect list`, then run these commands from this folder:

```sh
mpremote connect /dev/cu.usbserial-0001 fs cp esp32/history_store.py :history_store.py
mpremote connect /dev/cu.usbserial-0001 fs cp esp32/main.py :main.py
mpremote connect /dev/cu.usbserial-0001 reset
```

Replace the sample port if yours differs. Upload `history_store.py` before resetting; the new `main.py` imports it. The board prints its 12-digit hex device ID at boot. Generate a sticker for a different board with `python -m pip install 'qrcode[pil]'` and `python tools/generate_device_sticker.py DEVICE_ID`. Print the PNG and attach it to the enclosure.

## Flow sensor wiring

Follow pin labels and sensor wire colours. On the 830-hole breadboard, check whether each power rail is split in the middle. The earlier shared chat specified pins, not numbered holes.

| From | To |
| --- | --- |
| ESP32 VIN/5V | Sensor red and converter HV |
| ESP32 3V3 | Converter LV |
| ESP32 GND | Sensor black and converter GND |
| Sensor yellow | Converter HV1 |
| Converter LV1 | ESP32 GPIO27 |

Confirm VIN/5V is 5 V when USB powered. Use a matching adapter for the sensor's white connector. Keep all exposed electronics dry. The water loop is reservoir → separately powered pump → flow sensor inlet → flow sensor outlet → reservoir. The pump is not connected to or controlled by the ESP32.

## Meter protocol and data

BLE service UUID: `930a7d60-8489-4b31-9cc6-64ee5e809100`. Live read/notify: `...9101`; control write: `...9102`; history notify: `...9103`.

The 16-byte live packet is eight session bytes, a little-endian uint32 sequence, and a little-endian uint32 cumulative pulse count. On connection, the phone writes `T` plus four-byte Unix seconds, then `H` to request history. History notifications are `S` plus snapshot pulse count, `R` plus Unix bucket start and bucket pulses, `E` plus snapshot count, then `U` plus pulses that had no known time. All integers are little-endian. The app merges five-minute buckets by timestamp and replaces overlapping local live estimates, avoiding double counting.

The ESP32 saves nonempty five-minute pulse buckets to flash, retains the last seven days, and transfers them over BLE when the phone reconnects. The board must **remain powered** after the phone first sets its clock. It has no battery-backed real-time clock: after a power loss, any pulses before the next phone time sync can be saved only as an undated total and cannot be put on the correct day. Up to five minutes of the active bucket can be lost if power fails before a flash write. An external RTC and backup power would be required to guarantee accurate dates across outages. This firmware boots and serves live packets on the physical ESP32. Time sync and the empty-history S/E/U transfer were verified over BLE. Nonzero seven-day history and Android phone pairing still need a physical end-to-end test.

Readings and survey answers are local to the phone. A single flow sensor cannot identify bath, food, or cleaning: unconfirmed use appears under **Misc**. The free local model in `training/` suggests labels from amount, time, duration and survey answers. It was trained on 1,000 **synthetic** seven-day households, with separate labeled and unlabeled files; synthetic holdout results are in `training/validation.json`. Real-world accuracy is unknown. After the household survey, the app starts a seven-day observation. It flags uncertain use only after at least **16 minutes of sustained measured flow**; five-minute history buckets can detect this conservatively but cannot prove truly uninterrupted flow. Reviews appear after **9 PM on the same day** during those first seven days and again on the first three days of each month. Confirmed labels stay on that phone and adapt similar suggestions.

Water Intelligence compares today's use so far with the median at the same local time on at least three earlier measured days. It excludes days without readings rather than treating them as zero. The Today and Recent use cards use app arithmetic; asking a question requires downloading the on-phone language model. During a live Bluetooth session, 16 minutes of continuously detected flow prompts a check of taps and the pump; it cannot diagnose a leak. Demo readings are labeled and do not include events later than the current time.

The **Recent use** mode reports the average and goal count from completed measured days, with a trend after six days. Google sign-in and the household survey are required after pairing. Live meter updates no longer redraw its form while a person is typing.

The printable enclosure files and adjustable source are in [enclosure/](enclosure/README.md). The flow sensor mounts outside the dry ESP32 tray; verify physical dimensions before printing.

### On-phone language assistant

**Home → Open AI assistant** offers a 0.6-billion-parameter Qwen3 model for questions through Transformers.js. The user must tap **Download on-phone AI** before asking questions. The selected q4f16 ONNX weights are about **570 MB**, plus the tokenizer and runtime; phone storage and memory needs are higher. A browser with WebGPU and enough free storage is required. The first download needs internet and may take time. Later loads use the browser's model cache when available, but browser storage can be evicted. Bluetooth water tracking and the numerical activity model still work if the LLM is unsupported or not downloaded.

Generation runs in a phone worker. The app supplies exact recent meter totals, survey answers and *unverified* suggestions from the smaller classifier as context; it does not send questions or water data to a hosted inference API. The numerical classifier trains on 800 of 1,000 simulated seven-day households, with 200 held out. The phone Qwen3 model was also retrained on one balanced example from each of 800 training homes, with 100 validation and 100 test homes. Its synthetic test loss was 0.110 (perplexity 1.116). The tested 4-bit ONNX package is [hosted on Hugging Face](https://huggingface.co/HrishiBuilds/UTLT-Qwen3-0.6B-ONNX-v2), and `llm-worker.js` downloads this version. See [training details](training/llm/README.md). JavaScript computes litres, averages and goals; the app rejects model replies containing numbers absent from its supplied facts. The assistant is experimental and still needs testing on Android and iPhone browsers.

## Other modes and cloud features

`esp32/wifi_main.py` preserves the earlier ESP32-hosted Wi-Fi dashboard. `esp32/bridge_main.py`, `server.py`, `ble_bridge.py`, and `start_bridge.py` preserve the older computer bridge for development. Neither is needed for Android BLE pairing.

Google sign-in is required after device pairing, while Friends and Family are optional online features. Enable Google sign-in and Firestore in the `utlt-ai1` Firebase project and deploy [firestore.rules](firestore.rules). The BLE meter itself can still send readings without Wi-Fi; account setup requires internet.
