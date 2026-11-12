# UTLT.ai print enclosure

- `utlt-base.stl`: dry ESP32 tray with an external platform for the flow sensor.
- `utlt-lid.stl`: slip-fit lid. The USB lead exits through the short end.
- `build.py`: editable dimensions; run `python3 enclosure/build.py` to rebuild both STLs.

The tray is 76 × 46 × 25 mm; its sensor platform adds 42 mm to one end. The interior is 71.2 × 41.2 mm with two low board support rails. The model uses the seller's nominal 28 × 50 × 14 mm size for the 30-pin ESP32. The sensor seller did not provide a reliable body drawing, so the sensor is held externally with two zip ties rather than a tight-fit pocket. **Measure your actual board, sensor, USB plug, and tube clearance before printing.** The enclosure is a prototype and is not waterproof.

Print the base upright and the lid with its flat outside face on the bed. A first fit test at 0.2 mm layer height in PETG or PLA is sensible. Keep electronics above and away from the reservoir, and secure the tubing so water cannot drip along the wires into the tray.
