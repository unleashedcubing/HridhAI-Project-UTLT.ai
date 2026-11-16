from pathlib import Path
import html
import sys

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader


ROOT = Path(__file__).resolve().parent
SVG = ROOT / "UTLT_full_board_map.svg"
PDF = ROOT / "UTLT_wiring_troubleshooting.pdf"
PHOTOS = ROOT / "photos"
W, H = landscape(A4)
INK = colors.HexColor("#122033")
MUTED = colors.HexColor("#53657A")
BLUE = colors.HexColor("#0874C9")
PALE = colors.HexColor("#F2F6FA")


def t(x, y, value, size=22, weight=600, fill="#122033"):
    return f'<text x="{x}" y="{y}" fill="{fill}" font-family="Arial,Helvetica,sans-serif" font-size="{size}" font-weight="{weight}">{html.escape(value)}</text>'


def line(x1, y1, x2, y2, color, width=5, dash=""):
    extra = f' stroke-dasharray="{dash}"' if dash else ""
    return f'<path d="M{x1} {y1} L{x2} {y2}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"{extra}/>'


def board(y, name, fitted):
    a = []
    a.append(f'<rect x="34" y="{y}" width="1532" height="340" rx="22" fill="#fff" stroke="#CCD8E4" stroke-width="3"/>')
    a.append(t(65, y + 38, name, 29, 700))
    subtitle = "Converter shown as fitted" if fitted else "A014 photo: converter missing; dashed paths are the required finished build"
    a.append(t(650, y + 38, subtitle, 21, 500, "#53657A"))
    for rail_y, label, color in ((y + 72, "5 V rail", "#C92C3C"), (y + 306, "GND rail", "#445365")):
        a.append(f'<rect x="65" y="{rail_y}" width="1468" height="18" rx="9" fill="{color}" opacity="0.17"/>')
        a.append(line(65, rail_y + 9, 1533, rail_y + 9, color, 3, "8 8"))
        a.append(t(75, rail_y - 9, label + " / check split", 16, 600, color))
    a.append(f'<rect x="90" y="{y+112}" width="370" height="150" rx="18" fill="#172638"/>')
    a.append(t(113, y + 151, "ESP32 30-pin", 28, 700, "#fff"))
    a.append(t(113, y + 180, "USB power bank -> USB port", 17, 500, "#DAE8F6"))
    a.append(t(110, y + 211, "VIN / 5V  white", 17, 700, "#fff"))
    a.append(t(285, y + 211, "GPIO27  black", 17, 700, "#fff"))
    lead = "red->blue splice" if fitted else "solid red lead"
    a.append(t(110, y + 244, "3V3  " + lead, 16, 700, "#C9D8FF"))
    a.append(t(360, y + 244, "GND", 17, 700, "#fff"))
    cv = y + 116
    dash = "" if fitted else ' stroke-dasharray="10 8"'
    a.append(f'<rect x="650" y="{cv}" width="260" height="147" rx="17" fill="{("#E9F3FC" if fitted else "#FFF5EC")}" stroke="{("#0874C9" if fitted else "#B46B31")}" stroke-width="3"{dash}/>')
    a.append(t(673, y + 153, "Level converter", 23, 700))
    a.append(t(675, y + 183, "HV  5V   |   LV  3V3", 18, 600))
    a.append(t(675, y + 213, "HV1 sensor  |  LV1 GPIO27", 17, 600))
    a.append(t(675, y + 243, "GND shared", 17, 600))
    if not fitted:
        a.append(t(694, y + 284, "DO NOT POWER", 19, 700, "#B14328"))
    a.append(f'<rect x="1100" y="{y+122}" width="370" height="125" rx="22" fill="#E9F7F5" stroke="#42A995" stroke-width="3"/>')
    a.append(t(1126, y + 157, "Flow meter", 24, 700))
    a.append(t(1126, y + 188, "red 5V  |  black GND", 18, 600))
    a.append(t(1126, y + 218, "yellow signal (orange jumper)", 17, 600))
    a.append(line(460, y + 195, 650, y + 195, "#121C2D", 6, "8 8" if not fitted else ""))
    a.append(t(478, y + 183, "LV1 -> GPIO27", 16, 700))
    a.append(line(910, y + 196, 1100, y + 196, "#E28422", 6, "8 8" if not fitted else ""))
    a.append(t(930, y + 181, "yellow / orange -> HV1", 15, 700, "#AD5B11"))
    a.append(line(260, y + 263, 650, y + 263, "#3474C6", 5, "8 8" if not fitted else ""))
    a.append(t(472, y + 282, "3V3 -> LV", 16, 700, "#2860A8"))
    a.append(line(190, y + 112, 190, y + 81, "#C92C3C", 5))
    a.append(line(770, y + 116, 770, y + 81, "#C92C3C", 5, "8 8" if not fitted else ""))
    a.append(line(1270, y + 122, 1270, y + 81, "#C92C3C", 5))
    a.append(line(390, y + 263, 390, y + 315, "#445365", 5))
    a.append(line(850, y + 263, 850, y + 315, "#445365", 5, "8 8" if not fitted else ""))
    a.append(line(1370, y + 247, 1370, y + 315, "#445365", 5))
    return "\n".join(a)


def write_svg():
    body = [f'<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="960" viewBox="0 0 1600 960">',
            '<rect width="1600" height="960" fill="#F3F6FA"/>',
            t(42, 52, "UTLT.ai | 830-hole breadboard wiring map", 37, 700),
            t(43, 78, "Functional map, not literal hole positions. Follow printed pin labels and meter-checked rails.", 20, 500, "#53657A"),
            board(95, "2C2C  |  Vibhav", True), board(472, "A014  |  Saketh", False),
            t(52, 866, "White VIN and black GPIO27 leads use cut male pins beside the header pins: temporary contact; replace for the demo.", 19, 600),
            t(52, 898, "Only move the converter with both boards unplugged. Never connect a possible 5 V sensor signal directly to GPIO27.", 19, 600, "#A33928"),
            t(52, 929, "Pump is separate; run the submersible pump only with its inlet under water. Keep breadboard and USB dry.", 18, 600, "#53657A"),
            '</svg>']
    SVG.write_text("\n".join(body), encoding="utf-8")
    print(SVG)


def para(c, value, x, top, width, size=10, leading=14, color=INK, bold=False):
    font = "Helvetica-Bold" if bold else "Helvetica"
    c.setFillColor(color)
    c.setFont(font, size)
    words = value.split()
    lines, current = [], ""
    for word in words:
        trial = word if not current else current + " " + word
        if stringWidth(trial, font, size) <= width:
            current = trial
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    for n, row in enumerate(lines):
        c.drawString(x, top - n * leading, row)
    return top - len(lines) * leading


def header(c, page, title, sub):
    c.setFillColor(PALE); c.rect(0, H - 86, W, 86, fill=1, stroke=0)
    c.setFillColor(INK); c.setFont("Helvetica-Bold", 22); c.drawString(36, H - 42, title)
    c.setFillColor(MUTED); c.setFont("Helvetica", 10); c.drawString(37, H - 63, sub)
    c.setFillColor(MUTED); c.setFont("Helvetica", 8); c.drawRightString(W - 36, 20, f"UTLT.ai  |  16 Nov 2026  |  {page}")


def label(c, x, y, tag):
    c.setFillColor(BLUE); c.roundRect(x, y, 145, 20, 6, fill=1, stroke=0)
    c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 9); c.drawString(x + 8, y + 6, tag)


def image_fit(c, path, x, y, width, height):
    im = ImageReader(str(path))
    iw, ih = im.getSize()
    scale = min(width / iw, height / ih)
    dw, dh = iw * scale, ih * scale
    c.drawImage(im, x + (width - dw) / 2, y + (height - dh) / 2, dw, dh)


def write_pdf(map_png):
    c = canvas.Canvas(str(PDF), pagesize=(W, H))
    c.setTitle("UTLT.ai Wiring and Troubleshooting")
    c.setAuthor("UTLT.ai team")

    header(c, 1, "The flow-meter cable", "Photographs 1 and 2: loose jumper contacts and colour changes")
    image_fit(c, PHOTOS / "IMG_0916.jpg", 43, 180, 340, 295)
    image_fit(c, PHOTOS / "IMG_0917.jpg", 454, 180, 340, 295)
    label(c, 45, 486, "PHOTO 1 | IMG 0916")
    label(c, 456, 486, "PHOTO 2 | IMG 0917")
    para(c, "Sensor red = supply; black = ground; yellow = Hall pulse signal. In one loose jumper set the wire continuing the yellow signal is ORANGE. The colour change does not change its function.", 43, 160, 750, 11, 16)
    para(c, "The loose male pins are shown beside the white three-contact plug. When used, they are pushed into it; this is a temporary connection, not a locking mating plug. With power OFF, verify red-to-red, black-to-black and yellow-to-orange/yellow end-to-end. Do not let exposed pins touch.", 43, 112, 750, 10, 14, MUTED)
    c.showPage()

    header(c, 2, "Two boards, one known-good signal path", "Photographs 3 and 4: A014 and 2C2C breadboards")
    image_fit(c, PHOTOS / "IMG_0918.jpg", 42, 248, 365, 275)
    image_fit(c, PHOTOS / "IMG_0919.jpg", 435, 248, 365, 275)
    label(c, 47, 496, "PHOTO 3 | A014")
    label(c, 440, 496, "PHOTO 4 | 2C2C")
    c.setFillColor(INK); c.setFont("Helvetica-Bold", 11)
    c.drawString(43, 228, "A014: no level converter is fitted in this photo.")
    c.drawString(435, 228, "2C2C: level converter is visible.")
    para(c, "Do not power the A014 water-meter assembly without the converter. Its solid red 3V3 jumper is intended to feed converter LV once fitted; the photographed signal routing is not a verified safe circuit.", 43, 209, 360, 9.5, 13)
    para(c, "The 3V3 lead starts red and becomes blue after a splice. It serves the same intended 3V3-to-LV purpose as A014's solid red lead. Verify actual voltage; colour and a photo cannot prove electrical contact.", 435, 209, 360, 9.5, 13)
    para(c, "Both photos show a white lead at top VIN and a black lead at top GPIO27. The user reports cut male jumper pins and copper contacts pushed into the same breadboard holes as those ESP32 pins. Treat these as temporary contacts: they can be loose or short adjacent holes. Replace with proper connectors before relying on the demo.", 43, 129, 750, 10, 14, MUTED)
    c.showPage()

    header(c, 3, "Full board map", "SVG companion: UTLT_full_board_map.svg  |  pin names are authoritative; hole numbers are not inferred")
    image_fit(c, map_png, 26, 85, W - 52, H - 175)
    para(c, "The diagram shows the intended circuit. A014's dashed converter and signal wires are missing in photo 3; add and verify them before power. A 5 V signal must not be wired directly to ESP32 GPIO27.", 38, 72, W - 76, 10, 14)
    c.showPage()

    header(c, 4, "Before either board gets power", "Read together and tick each item with USB and pump unplugged")
    checks = [
        "A014 has a fitted level converter. If it is missing, do not power the A014 water-meter assembly.",
        "The white jumper is at the printed VIN/5V pin; black is at printed GPIO27. Cut-pin copper does not touch a neighbour.",
        "Sensor red reaches 5V; black reaches shared GND; yellow (orange on one jumper set) reaches converter HV1.",
        "Converter HV reaches 5V; LV reaches 3V3; GND reaches common ground; LV1 reaches GPIO27.",
        "3V3 is not linked to the 5V rail. The 2C2C red-to-blue splice and A014 solid red wire lead only to 3V3/LV.",
        "Each wire is firmly seated. No loose male pin, exposed splice or cut copper can touch another conductor.",
        "The pump inlet is submerged, the outlet returns to the reservoir, and no water can drip onto the breadboard.",
        "The power bank and USB cable are sound; pump remains OFF for the first ESP32 power check.",
    ]
    y = H - 114
    for check in checks:
        c.setFillColor(colors.HexColor("#E9F2FB")); c.roundRect(40, y - 39, W - 80, 46, 6, fill=1, stroke=0)
        c.setFillColor(BLUE); c.rect(52, y - 16, 13, 13, fill=0, stroke=1)
        para(c, check, 77, y - 4, W - 130, 9.5, 13)
        y -= 53
    para(c, "Only after every box is checked: connect the ESP32 USB with the pump off, measure VIN near 5 V and 3V3 near 3.3 V, then check converter HV/LV. Unplug immediately if anything is hot, reversed or unexpectedly high.", 42, 67, W - 84, 10, 14, INK, True)
    c.showPage()

    header(c, 5, "Port map and checks", "Use this order when the phone pairs but the flow count stays at zero")
    y = H - 108
    rows = [
        ("1  POWER OFF / PORTS", "Unplug USB and pump. Read ESP32 labels: white VIN, black GPIO27; bottom 3V3 and GND. Confirm sensor red/black/yellow and the orange signal jumper. Check holes on the same five-hole strip, centre trench and split rails."),
        ("2  CONVERTER", "On both meter assemblies: VIN/5V -> sensor red + HV; 3V3 -> LV; GND -> sensor black + converter GND; sensor yellow/orange -> HV1; LV1 -> GPIO27. Never feed sensor signal directly to GPIO27. Check soldered converter pins actually contact the breadboard."),
        ("3  LOOSE WIRES", "With power off, gently check every sensor plug pin, red-to-blue splice and cut-pin VIN/GPIO27 contact. Replace loose male pins with a matching keyed connector and replace cut-pin piggybacks with secure leads."),
        ("4  ESP32 SEATING", "Check all board header pins sit firmly; no pin is bent or one row off. If BLE connects, compare raw pulse count with pump off/on. Swap one board onto the known-good breadboard to separate ESP32 trouble from wiring trouble."),
        ("5  POWER", "Only after inspection, power the ESP32 with pump OFF. With a meter check VIN near USB 5 V, 3V3 near 3.3 V, and matching converter HV/LV. If voltage drops when pump starts, try separate pump and ESP32 supplies; retain common ground only where the circuit needs it."),
    ]
    for title, body in rows:
        c.setFillColor(PALE); c.roundRect(36, y - 62, W - 72, 71, 8, fill=1, stroke=0)
        c.setFillColor(BLUE); c.setFont("Helvetica-Bold", 10); c.drawString(48, y - 8, title)
        para(c, body, 180, y - 8, W - 230, 9.0, 12)
        y -= 79
    c.setFillColor(colors.HexColor("#FFF1E6")); c.roundRect(36, 54, W - 72, 56, 8, fill=1, stroke=0)
    para(c, "Motor rule: run the submersible pump only with its intake submerged and tubing returning to the reservoir. Keep the motor off while the reservoir is empty, and keep all breadboard contacts dry.", 48, 91, W - 96, 10, 14, INK, True)
    c.showPage()

    header(c, 6, "Competition-day handover", "One kit per teammate; both people should be able to run the same check sequence")
    para(c, "Vibhav keeps the 2C2C set; Saketh keeps the A014 set. Pack each board, labelled USB cable, pump tubing, sensor lead, power source and the printout of this page separately. A014's set needs a fitted and verified level converter before it is powered as a water-meter assembly.", 44, H - 115, W - 88, 12, 17)
    para(c, "If 2C2C fails on the day", 44, H - 180, W - 88, 15, 18, INK, True)
    fallback = [
        "1. Stop the pump. Unplug BOTH ESP32s and the power bank before touching wiring.",
        "2. Move the 2C2C converter to A014 (or use a verified spare). Do not simply move a signal lead directly to GPIO27.",
        "3. Recheck the pre-power checklist on page 4 and the five required paths on page 5; verify HV=5 V, LV=3.3 V and shared ground.",
        "4. Power A014, pair to its matching QR/BLE ID, then run the pump only when submerged. Confirm raw pulses rise during flow and stop afterward.",
        "5. If no pulses, swap one part at a time: connector, converter, jumper, board, power cable. Note what changed so the cause is clear.",
    ]
    y = H - 218
    for item in fallback:
        y = para(c, item, 56, y, W - 112, 11, 16) - 11
    c.setFillColor(PALE); c.roundRect(43, 103, W - 86, 73, 8, fill=1, stroke=0)
    para(c, "Quick proof before judges arrive: phone sees correct UTLT device; raw pulse count is still with pump off; pump runs only submerged; count rises with water flowing in the sensor arrow direction; count stops after pump off. Litres are a provisional calibration, not a certified accuracy claim.", 55, 154, W - 110, 10, 14)
    para(c, "Sources: Robocraze mini sensor and 4-channel converter product pages; Espressif ESP32 hardware FAQ (GPIO tolerance 3.6 V). The photos establish appearance, not continuity or voltage; meter-check the final build.", 44, 84, W - 88, 8.5, 12, MUTED)
    c.save()
    print(PDF)


if __name__ == "__main__":
    write_svg()
    if len(sys.argv) > 1:
        write_pdf(Path(sys.argv[1]))
