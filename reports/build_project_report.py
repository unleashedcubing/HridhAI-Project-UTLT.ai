# AI-assisted report layout script.
from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "UTLT_Project_Report_16_Nov_2026.docx"


def shade(cell, fill):
    props = cell._tc.get_or_add_tcPr()
    item = OxmlElement("w:shd")
    item.set(qn("w:fill"), fill)
    props.append(item)


def add_paragraph(doc, text, style=None):
    paragraph = doc.add_paragraph(style=style)
    paragraph.add_run(text)
    return paragraph


def add_section(doc, title, body):
    doc.add_paragraph(title, style="Heading 2")
    add_paragraph(doc, body)


def add_two_column_table(doc, rows):
    table = doc.add_table(rows=0, cols=2)
    table.autofit = False
    table.columns[0].width = Cm(3.2)
    table.columns[1].width = Cm(14.1)
    for index, (label, detail) in enumerate(rows):
        cells = table.add_row().cells
        cells[0].width = Cm(3.2)
        cells[1].width = Cm(14.1)
        cells[0].text = label
        cells[1].text = detail
        for cell in cells:
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            if index % 2 == 0:
                shade(cell, "F3F7FA")
            for para in cell.paragraphs:
                para.paragraph_format.space_before = Pt(3)
                para.paragraph_format.space_after = Pt(3)
                for run in para.runs:
                    run.font.name = "Arial"
                    run.font.size = Pt(8.4)
        for run in cells[0].paragraphs[0].runs:
            run.font.bold = True
    return table


doc = Document()
section = doc.sections[0]
section.page_height = Cm(29.7)
section.page_width = Cm(21)
section.top_margin = Cm(1.65)
section.bottom_margin = Cm(1.65)
section.left_margin = Cm(1.8)
section.right_margin = Cm(1.8)

styles = doc.styles
normal = styles["Normal"]
normal.font.name = "Arial"
normal.font.size = Pt(9.5)
normal.font.color.rgb = RGBColor(28, 38, 49)
normal.paragraph_format.space_after = Pt(5)
normal.paragraph_format.line_spacing = 1.11
for name, size, before, after in [("Heading 1", 14, 12, 5), ("Heading 2", 10.8, 8, 2)]:
    style = styles[name]
    style.font.name = "Arial"
    style.font.size = Pt(size)
    style.font.bold = True
    style.font.color.rgb = RGBColor(18, 44, 65)
    style.paragraph_format.space_before = Pt(before)
    style.paragraph_format.space_after = Pt(after)
    style.paragraph_format.keep_with_next = True
title_style = styles["Title"]
title_style.font.name = "Arial"
title_style.font.size = Pt(20)
title_style.font.bold = True
title_style.font.color.rgb = RGBColor(12, 29, 43)
title_style.paragraph_format.space_after = Pt(2)
title_border = title_style._element.get_or_add_pPr().find(qn("w:pBdr"))
if title_border is not None:
    title_style._element.get_or_add_pPr().remove(title_border)

footer = section.footer.paragraphs[0]
footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
footer.style = normal
run = footer.add_run("UTLT.ai  |  HridhAI 2026  |  ")
run.font.size = Pt(8)
run.font.color.rgb = RGBColor(105, 115, 124)
field = OxmlElement("w:fldSimple")
field.set(qn("w:instr"), "PAGE")
footer._p.append(field)

doc.add_paragraph("UTLT.ai Project Report", style="Title")
subtitle = add_paragraph(doc, "Water conservation prototype  ·  Work recorded through 16 November 2026")
subtitle.runs[0].font.size = Pt(9)
subtitle.runs[0].font.color.rgb = RGBColor(104, 113, 121)

add_paragraph(doc, "UTLT.ai began with a household problem: water use is easy to overlook until the bill arrives or a tank runs low. Our working prototype measures flow in a small recirculating loop, sends readings from an ESP32 to a phone, and turns those readings into a daily view. Gas and electricity remain future modules. The aim is to help people notice patterns and choose where to save water; the app does not shut off their supply.")

doc.add_paragraph("Why this problem matters", style="Heading 1")
add_paragraph(doc, "The Central Ground Water Board’s 2024 Telangana assessment lists Hyderabad district as over-exploited: its groundwater extraction exceeds its annual extractable resource. This does not measure every household’s municipal supply, but it gives our local problem a clear reason for attention. A family may know that water is scarce and still have no simple picture of what it used today, when it used it, or whether a tap has been running unusually long.")

doc.add_paragraph("What we built", style="Heading 1")
add_paragraph(doc, "A 5 V flow meter sits after a small pump. The pump returns water to a reservoir, so each pass stands in for use during a demonstration. The meter’s pulses pass through a 5 V to 3.3 V level converter to ESP32 GPIO27. MicroPython counts the pulses; Bluetooth Low Energy sends live totals and saved history to the phone web app. The dashboard shows a daily goal, a by-time or by-use view, and a warning after sustained flow. The smaller local model suggests possible activities; the on-phone Qwen model handles questions after a download. A flow meter alone cannot tell whether water was used for bathing or cooking, so those labels need confirmation.")

add_paragraph(doc, "The interface began in Figma as light and dark mobile screens, with a water-use ring, a clear litres count and two ways to inspect the day: by time and by likely use. Keeping both views mattered. A time chart can come directly from the meter; a use chart relies on a model and, where the model is unsure, a person’s answer. The design deliberately uses warnings and explanations rather than a valve that cuts water off. Household size and routine inform activity suggestions; the water goal remains under the family’s control.")

doc.add_paragraph("How the work developed", style="Heading 1")
rows = [
    ("4 November", "Hrishi, Armaan and Vibhav discussed the hackathon themes and chose water conservation as the starting point."),
    ("5–7 November", "Hrishi’s Figma screens became a web app as Armaan and Abhinav worked on its app and backend; navigation, Firebase profiles and sign-in followed."),
    ("8–9 November", "Hrishi, Vibhav and Saketh met around the physical model. The team wired the ESP32 and sensor, added QR/Bluetooth pairing and checked a 160 mL fill."),
    ("10–11 November", "Seven-day synthetic records, a local activity model, Qwen training and seven-day BLE history were added."),
    ("12–16 November", "Hrishi and Saketh refined the enclosure; the app gained water feedback, a larger survey and 1,000 simulated household records."),
]
table = doc.add_table(rows=0, cols=2)
table.autofit = False
table.columns[0].width = Cm(2.55)
table.columns[1].width = Cm(14.75)
for index, (when, what) in enumerate(rows):
    cells = table.add_row().cells
    cells[0].width = Cm(2.55)
    cells[1].width = Cm(14.75)
    for cell in cells:
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        if index % 2 == 0:
            shade(cell, "F3F7FA")
    cells[0].text = when
    cells[1].text = what
    for cell in cells:
        for para in cell.paragraphs:
            para.paragraph_format.space_after = Pt(3)
            para.paragraph_format.space_before = Pt(3)
            for r in para.runs:
                r.font.name = "Arial"
                r.font.size = Pt(8.4)
    for r in cells[0].paragraphs[0].runs:
        r.font.bold = True

doc.add_page_break()
doc.add_paragraph("Who did what", style="Heading 1")
add_paragraph(doc, "The project moved through design, code and physical testing in quick succession. The responsibilities below reflect the team’s reports and the work recorded so far; some tasks were shared rather than handed neatly to one person.")

add_section(doc, "Hrishi  ·  concept, design, hardware and AI", "Hrishi drove the original water-conservation idea and much of the research behind it. He drew the first app timeline in Figma, then kept pushing the interface toward a clear daily water view instead of a generic dashboard. He sourced and assembled the ESP32, pump, flow meter and level converter, wrote and tested MicroPython meter code, and worked through the awkward calibration question: the pump’s demo flow was slower than the sensor’s rated minimum, so 4,075 pulses per litre is a working estimate, not a proven household-meter constant. He also worked with Saketh on the enclosure, including its magnet seats, and directed the seven-day data, local AI and phone assistant work. The A014 zero-reading issue remains in the test plan.")

add_section(doc, "Saketh  ·  enclosure design", "Saketh’s report follows the case from an early SketchUp attempt to Shapr3D. SketchUp slowed the work down; after researching alternatives, he and Hrishi moved to Shapr3D. Hrishi helped him learn it, and the two developed a case intended to fit the breadboard and wiring while keeping the flow meter outside the dry electronics tray. Saketh’s contribution was not simply drawing a box: he helped make the design editable and print-ready, and he checked how the parts would sit together.")

add_section(doc, "Armaan  ·  web app and accounts", "Armaan’s portfolio records his HTML and JavaScript work on page structure and navigation, followed by Firebase profile storage and Google sign-in. He proposed Friends and a leaderboard as a way to make conservation more engaging. Hrishi raised the risk that a competition could reward cutting necessary water use, which led to a family-oriented alternative. Armaan’s work supplied important app infrastructure alongside Hrishi’s initial design, water research and hardware integration.")

add_section(doc, "Vibhav  ·  demo operations and team support", "Vibhav describes his role as operating the physical model, coordinating with teammates and helping test and troubleshoot it. His report is marked ongoing. That matters for a live demonstration: someone must keep the water loop, phone and power sources working while the rest of the team explains the result. Specific test outcomes will be added as that work is completed.")

add_section(doc, "Abhinav  ·  app work in progress", "The current team account places Abhinav in UI and backend work alongside Armaan. A more detailed record of his own contribution will be added when his report is available. Until then, the team should avoid assigning him features that have not been verified with him.")

doc.add_page_break()
doc.add_paragraph("Evidence, limits and next build", style="Heading 1")
add_paragraph(doc, "The repo shows the web app beginning on 5 November, BLE pairing and pulse calibration work on 8–9 November, Qwen and seven-day history work on 10–11 November, and enclosure and feedback revisions through 16 November. The prototype can pair over BLE and record pulses. On iPhone, the older 2C2C board produced readings while A014 paired but stayed at zero; the pump was unavailable for the latest A014 check. A014’s installed program matches the repo and its GPIO27 idle level is high. None of that proves its pulse input works under flowing water. The next fair test is one sensor, one board at a time, at the same known flow. Separate pulse-rate and fill-time ranges imply roughly −8.5% to +8.8% volume error around our 4,075 pulses/L setting; this is only a rough bound, not a calibration certificate.")

doc.add_paragraph("The AI has a similar boundary. The activity classifier was trained with 800 of 1,000 simulated seven-day households and held out 200 homes, reaching 96.78% accuracy on synthetic sessions. That score says the model learned our simulator, not that it can identify real bathing or cooking from one whole-home sensor. Qwen3-0.6B was also fine-tuned again with one example from each of 800 training homes; 100 validation and 100 test homes were held out, with a test loss of 0.110. These are synthetic results. Numerical totals still come from meter arithmetic in app code, and uncertain activities need a person’s confirmation.")

doc.add_paragraph("How gas and electricity could join", style="Heading 1")
add_paragraph(doc, "Gas consumption needs a certified meter with an approved pulse or digital output, read through the right interface and installed by a qualified professional. A cheap gas detector can warn about gas in air, but it does not measure household gas consumption. Electricity could come from a certified smart meter’s optical pulse or data interface, or from a properly isolated metering module selected and installed by a qualified electrician. We would convert its pulses to kWh and keep mains voltage entirely away from the ESP32. Neither extension is part of the present water demo.")

doc.add_paragraph("What would make this useful beyond a hackathon", style="Heading 1")
add_paragraph(doc, "First, calibrate with measured water volumes across the sensor’s rated flow range and repeat the A014 test. Then try the system in several homes, with consent, comparing its totals to trusted meters and collecting corrected activity labels. A product version would need a sealed enclosure, dependable power, a clock that survives outages, secure device ownership, private account storage, and a recovery path when Bluetooth drops. The same app could then accept water, gas and electricity as separate measured streams. We would judge success by whether families understand and reduce avoidable use without feeling pushed to sacrifice basic needs.")

add_paragraph(doc, "A sensible first pilot would ask each household to record a known 5 L, 10 L and 20 L draw, then compare those amounts with the app at different flow rates. We would also test a week with the phone disconnected to see whether saved history returns in the right order. For the enclosure, the next print should be checked with the real board, breadboard, wires and 8 × 1.5 mm magnets before ordering more copies. This is where a neat demo becomes a device someone could trust.")

doc.add_paragraph("Code and model credits", style="Heading 1")
add_paragraph(doc, "Claude Code and OpenAI Codex helped debug and improve parts of the source code; those files are tagged as AI-assisted in the repository. The two models are Qwen3-0.6B for questions on the phone and a scikit-learn random forest for tentative activity labels. Open-source components include MicroPython, jsQR, Transformers.js, MLX LM and ONNX Runtime. Firebase supplies account features. Team design choices and physical test results are credited to the people above, while model outputs remain subject to checking.")

doc.add_page_break()
doc.add_paragraph("Bench build: what to connect and test", style="Heading 1")
add_paragraph(doc, "The water path is a reservoir, a small pump, the flow meter and a return line to the reservoir. The pump’s flow stands in for household use. Its water loop should stay physically below and away from the open breadboard. The current pump is not switched by the ESP32; the ESP32 receives sensor pulses and sends the resulting count to the phone. A power bank can run the ESP32 during the demo without a laptop bridge.")

doc.add_paragraph("The signal path", style="Heading 2")
add_paragraph(doc, "The sensor’s red wire takes 5 V, black joins common ground, and yellow goes to the high-voltage side of the level converter. Converter HV receives 5 V, LV receives the ESP32’s 3.3 V, and its low-voltage channel goes to GPIO27. The ESP32 input must not receive the sensor’s 5 V signal directly. On the 830-hole breadboard, a split power rail can leave half the circuit unpowered even when neighbouring holes look connected. The sensor’s white plug also needs a firm mating connector; loose male pins can make an apparently successful circuit unreliable.")

doc.add_paragraph("Calibration record", style="Heading 2")
add_paragraph(doc, "The app currently uses 4,075 pulses per litre. The reported 15.7–17.3 pulses per second and 38–41 seconds to collect 160 mL imply about 3,729–4,433 pulses per litre if we combine the extremes. Dividing those values by 4,075 gives roughly −8.5% to +8.8% indicated-volume error. The pulse-rate and fill-time ranges were reported separately, not as matched trials, so this is an illustrative bound. It is not a guarantee at 350 litres or at a different flow rate. The observed demo flow was roughly 0.2–0.3 L/min, below the mini meter’s stated 0.5 L/min minimum. That is why a measured-volume test across several speeds matters more than further adjusting the display.")

doc.add_paragraph("Two boards, one fair comparison", style="Heading 2")
add_paragraph(doc, "On iPhone Bluefy, 2C2C paired and produced readings while A014 paired but stayed at zero. They were on the same power source, and pairing by itself only proves that BLE is working. A014’s installed program matched the repository, and its GPIO27 idle level was high, but no pump was available for the last A014 test. The next check should use the same sensor, converter, pump and measured water volume, swapping only the board. Record raw pulse count before and after each run. If 2C2C advances and A014 does not, inspect the A014 jumper, converter rails, ground and input pin before changing calibration code.")

doc.add_paragraph("Seven days of history", style="Heading 2")
add_paragraph(doc, "The newer ESP32 program saves nonempty five-minute pulse buckets and sends the last seven days to the phone over BLE. The device has no battery-backed clock. After losing power, water used before the phone reconnects can be retained only as an undated amount. The current bucket may also be lost if power fails before its flash write. A reliable home product needs an RTC or another time source, backup power or a clear gap marker, and a test that compares downloaded history against a known log after a full week disconnected.")

doc.add_paragraph("Bench checks to record", style="Heading 2")
add_two_column_table(doc, [
    ("Power off", "Confirm pulse count stays still with the pump off and the sensor connected."),
    ("Known volume", "Record starting and ending pulses, fill time, collected volume and supply used."),
    ("Board swap", "Repeat with the same flow path on 2C2C and A014, changing only the ESP32."),
    ("Reconnect", "Check that live totals and saved buckets reconcile after a phone disconnect."),
])

doc.add_page_break()
doc.add_paragraph("From a reading to a useful answer", style="Heading 1")
add_paragraph(doc, "The app receives a cumulative pulse count, converts differences between readings into litres and merges live updates with five-minute history buckets. The by-time view can be tied to these measured records. A by-use pie chart needs more interpretation: a whole-home meter does not know which tap or room used the water. The interface therefore treats activity labels as suggestions and leaves unconfirmed use under Misc rather than presenting a guess as a fact.")

doc.add_paragraph("Survey and review", style="Heading 2")
add_paragraph(doc, "After device pairing and login, the household survey asks for information such as household size and common routines. During the first seven days, the app observes patterns. It flags uncertain periods only after at least 16 minutes of sustained measured flow, and asks for review at the end of that same day. Reviews recur on the first three days of later months to catch changed routines. Five-minute history buckets can support a conservative long-flow warning, but they cannot prove every second within a bucket was continuous. Corrections from residents should be used to improve suggestions, with clear consent and with a way to fix mistakes.")

doc.add_paragraph("The two model jobs", style="Heading 2")
add_paragraph(doc, "A scikit-learn random forest suggests possible activities from amount, time, duration and survey context. The synthetic data generator produced 1,000 seven-day households, with 800 used for training and 200 held out for this classifier. Its 96.78% result is accuracy on simulated sessions; a real home with overlapping baths, cleaning and cooking may look very different. Qwen3-0.6B handles follow-up questions on the phone. It was fine-tuned again using one balanced example from each of 800 training homes, with 100 validation and 100 test homes. The held-out synthetic test loss was 0.110, or perplexity 1.116. This does not measure real-world advice quality or successful operation on every phone.")

doc.add_paragraph("What runs where", style="Heading 2")
add_paragraph(doc, "The ESP32 counts pulses and stores recent history. The web app performs the litre arithmetic, goal comparison and data display. A phone downloads the roughly 564 MB four-bit ONNX model before local Qwen inference; the browser needs enough memory and suitable WebGPU support, and it may later evict the cached files. Google sign-in and the first model download require internet, but the BLE water link itself does not require home Wi-Fi. The language model receives calculated facts and survey context; it should not invent meter totals. Android Chrome and iPhone Bluefy still need a full end-to-end download and inference check.")

doc.add_paragraph("Why these boundaries matter", style="Heading 2")
add_paragraph(doc, "A confident chart can be persuasive even when its input is uncertain. The app should always distinguish measured water totals, model-inferred activities and demo data. It should also say when a board is disconnected, when history has an undated gap, and when the reading is outside the sensor’s reliable range. These small labels are part of the design, not a footnote to it.")

doc.add_paragraph("What each screen can claim", style="Heading 2")
add_two_column_table(doc, [
    ("Total litres", "Converted from sensor pulses; its accuracy depends on calibration and flow rate."),
    ("Time chart", "Derived from dated pulse buckets when the board has a valid clock."),
    ("Use chart", "Suggested categories; ambiguous activity needs a resident’s confirmation."),
    ("AI feedback", "An interpretation of supplied readings, not a new measurement."),
])

doc.add_page_break()
doc.add_paragraph("A practical path beyond the competition", style="Heading 1")
add_paragraph(doc, "The next version should be judged by repeated measurements and what families can understand, not by adding more graphics. A sensible pilot begins with known 5 L, 10 L and 20 L draws at several flow rates, comparing the app against a trusted container or approved meter. It should repeat the test on both ESP32 boards, with the same sensor and wiring. Once totals are dependable, several consenting homes can test whether the daily views and long-flow prompts actually help them notice avoidable use.")

doc.add_paragraph("A safe expansion of the utility idea", style="Heading 2")
add_paragraph(doc, "Gas and electricity should become separate streams with their own approved meters and units. A future gas module could read a certified meter’s documented pulse or digital interface, installed by a qualified professional. A cheap gas-in-air detector might warn of a leak but cannot measure household gas consumption. Electricity could use an optical pulse or data port on a certified smart meter, or a properly isolated metering module selected and installed by a qualified electrician. Its calibrated pulses would be converted to kWh. Mains voltage must remain entirely away from the ESP32. None of this is part of the present water demo.")

doc.add_paragraph("What a home device would still need", style="Heading 2")
add_paragraph(doc, "The enclosure needs a real print and fit check with the 830-hole breadboard, ESP32, wires, external flow meter and 8 × 1.5 mm magnets. Before a home installation, the circuit would also need dependable connectors, splash protection, a clock that survives outages, secure device ownership, private account storage and a recovery path when Bluetooth permission disappears. A phone app can accept three utility streams later, but each must have a separate verified measurement source.")

doc.add_paragraph("How we would present the demo honestly", style="Heading 2")
add_paragraph(doc, "A visitor can watch water circulate, see pulses rise on the phone, then stop the pump and watch the count settle. The team can explain why the pie chart’s activity labels need confirmation and why the live litre number is an estimate at this slow flow. If A014 remains at zero, 2C2C should be the demonstration board while the unresolved A014 test is shown as engineering work in progress. That is a stronger demonstration than hiding the discrepancy. We would call the product successful only if families can understand the data and reduce avoidable use without being pushed to sacrifice basic needs.")

doc.add_paragraph("Next milestones", style="Heading 2")
add_two_column_table(doc, [
    ("Bench", "Resolve A014, secure the sensor plug and calibrate across the sensor’s rated range."),
    ("Phone", "Test BLE history, model download and question answering on the actual demo phones."),
    ("Enclosure", "Print one case, inspect the dry tray, tubing and magnet fit, then revise dimensions."),
    ("Pilot", "Compare with trusted volumes in consenting homes before making accuracy claims."),
])

sources = add_paragraph(doc, "Sources and team records: CGWB, Dynamic Ground Water Resources of Telangana 2024, chapter 8 (cgwb.gov.in); UTLT.ai repository history through 16 November 2026; Saketh’s case-design report; Armaan’s contribution portfolio; Vibhav’s operator report. Extension references: Itron Cyble gas-meter pulse documentation (apac.itron.com) and Landis+Gyr E220 optical-pulse technical data (landisgyr.com). Model and library licenses are linked in the project README.")
sources.runs[0].font.size = Pt(7.8)
sources.runs[0].font.color.rgb = RGBColor(100, 110, 120)

doc.core_properties.title = "UTLT.ai Project Report"
doc.core_properties.subject = "HridhAI water conservation prototype and team contributions"
doc.core_properties.author = "UTLT.ai team"
OUTPUT.parent.mkdir(exist_ok=True)
doc.save(OUTPUT)
print(OUTPUT)
