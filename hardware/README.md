# UTLT.ai water demo wiring

Start with [the six-page photo guide](UTLT_wiring_troubleshooting.pdf). Page 4 is the pre-power checklist; page 6 covers the competition-day handover. The [SVG board map](UTLT_full_board_map.svg) is zoomable. It shows the *intended electrical path*, not certified breadboard hole positions.

The four original HEIC photos were supplied by the team. Smaller, orientation-corrected copies are in [`photos/`](photos/), so this guide can be rebuilt. The A014 photo shows no level converter; do not power that water-meter assembly until the converter is fitted and the pre-power checklist passes.

To rebuild the diagram and PDF on macOS, run `python3 hardware/build_wiring_guide.py`, convert the SVG to a PNG with `sips -s format png hardware/UTLT_full_board_map.svg --out /private/tmp/utlt-board-map.png`, then run `python3 hardware/build_wiring_guide.py /private/tmp/utlt-board-map.png`. The script needs ReportLab and Pillow is needed only to prepare different source photos.
