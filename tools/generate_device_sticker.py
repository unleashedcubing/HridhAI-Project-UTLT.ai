"""Generate a QR sticker for one ESP32 BLE meter: python tools/generate_device_sticker.py DEVICE_ID.

Install the optional image dependency first: python -m pip install 'qrcode[pil]'.
DEVICE_ID is the 12-character hex value printed by the ESP32 at boot.
"""
import re
import sys
from pathlib import Path

import qrcode
from PIL import Image, ImageDraw, ImageFont

if len(sys.argv) != 2 or not re.fullmatch(r"[0-9a-fA-F]{12}", sys.argv[1]):
    raise SystemExit("Usage: python tools/generate_device_sticker.py 12_HEX_DIGIT_DEVICE_ID")

identifier = sys.argv[1].lower()
name = "UTLT-" + identifier[-4:].upper()
payload = "UTLT:BLE:1:" + identifier
qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=14, border=4)
qr.add_data(payload)
qr.make(fit=True)
code = qr.make_image(fill_color="#102238", back_color="white").convert("RGB")
code.thumbnail((450, 450))

canvas = Image.new("RGB", (760, 860), "#f1f6fc")
draw = ImageDraw.Draw(canvas)
draw.rounded_rectangle((24, 24, 736, 836), radius=36, fill="white", outline="#d6e5f5", width=2)
font_path = "/System/Library/Fonts/SFNS.ttf"
try:
    title = ImageFont.truetype(font_path, 48)
    label = ImageFont.truetype(font_path, 27)
    small = ImageFont.truetype(font_path, 23)
except OSError:
    title = label = small = ImageFont.load_default()
draw.rounded_rectangle((70, 70, 248, 116), radius=23, fill="#e8f2ff")
draw.text((92, 75), "UTLT.ai", font=label, fill="#0875dc")
draw.text((70, 148), "Pair your device", font=title, fill="#102238")
draw.text((70, 216), "Scan in the UTLT.ai app", font=label, fill="#51667d")
canvas.paste(code, ((760 - code.width) // 2, 270))
draw.text((70, 744), "Bluetooth: " + name, font=label, fill="#102238")
draw.text((70, 788), "Devices  →  Scan QR  →  Connect", font=small, fill="#51667d")
output = Path(__file__).resolve().parents[1] / "assets" / (name + "-pairing-qr.png")
canvas.save(output)
print(output)
