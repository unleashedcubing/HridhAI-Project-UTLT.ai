# UTLT.ai case V2 — Garuda3D print request

The 3MF is in millimetres and has ten closed parts. The ten binary STL files contain the same bodies, each moved to the origin and oriented for an initial FFF print review. **Print one copy of each part, not the 3MF plus the STLs.** The 3MF is the source/assembly reference; individual STLs make quoting, placement, and support decisions easier.

## Requested print settings

- Material: PLA for a low-cost fit prototype; ask for a PETG quote as the final option near the water demo.
- Main shell and large panels: **20% gyroid infill**. Small inserts may become effectively solid because of their size.
- Three perimeters where geometry allows; four top and bottom layers. Prioritize continuous walls over more infill.
- Magnet panels `01`, `07`, `09`: 0.25 mm nozzle and 0.12–0.16 mm layers if available. The magnet seats face upward in the STL files. A 0.4 mm nozzle is acceptable only after a slicer preview confirms the narrow seat walls are present.
- Other parts: 0.4 mm nozzle and 0.16–0.20 mm layers for lower cost.
- Supports only where the slicer shows an unsupported feature; avoid supports inside magnet seats and pipe openings. Ask the shop to confirm the main body's orientation and supports before printing.
- Do not scale the models or apply hole compensation without checking the 8 x 1.5 mm magnets. Magnet seats are nominally 8.4 mm diameter x 1.7 mm deep; print one seat first for a fit check.

## Model checks

All ten source objects have closed, two-face-per-edge topology. STL exports preserve volume and dimensions under rigid rotations. The main body is approximately 179 x 119.2 x 100.9 mm, so the printer needs at least that usable build area plus a brim/clearance. The full mesh is about 519.5 cm³, or 644 g if printed completely solid in PLA (1.24 g/cm³). Actual 20% infill print mass and price require Garuda's slicer estimate and may include supports, minimum charges, and delivery.
