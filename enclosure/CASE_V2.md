# UTLT.ai Case V2

Source: `UTLT.ai Case - V1.3mf` in the workspace root. The original is preserved.

V2 refines only six 8 mm magnet seats: four on `Body_03`, one on `Body_07`, and one on `Body_07_(1)`. Each 14-sided seat is now 28-sided. Its nominal diameter is 8.4 mm and depth remains 1.7 mm for 8 × 1.5 mm magnets. The usable diameter across the polygon flats stays about 8.35 mm, nearly the same as V1's 8.38 mm. The extra 0.1 mm radial material slightly strengthens the narrow corner walls.

All other bodies, pipe openings, attachment features, and overall part bounds are unchanged. Every object was checked for closed, two-face-per-edge topology after the edit. This is geometric verification of the 3MF, not a physical print-fit test; try one magnet seat before printing the whole case.

Regenerate from the original:

```sh
python3 enclosure/refine_magnet_seats.py '../UTLT.ai Case - V1.3mf' 'enclosure/UTLT.ai Case - V2.3mf'
```
