"""Parametric, millimetre STL model: python3 enclosure/build.py.

Measure your own ESP32, USB plug and sensor before printing. The sensor sits
outside the dry electronics tray and is fastened with two zip ties.
"""

from collections import Counter
from pathlib import Path
from struct import pack

OUT = Path(__file__).resolve().parent
L, W, H, WALL, CLEARANCE = 76.0, 46.0, 25.0, 2.4, 0.35


def box(x0, x1, y0, y1, z0, z1):
    return x0, x1, y0, y1, z0, z1


def inside(b, x, y, z):
    return b[0] < x < b[1] and b[2] < y < b[3] and b[4] < z < b[5]


def write_stl(name, add, cut):
    all_boxes = add + cut
    axes = [sorted({v for b in all_boxes for v in (b[n], b[n+1])}) for n in (0, 2, 4)]
    xs, ys, zs = axes
    cells = set()
    for i in range(len(xs)-1):
        for j in range(len(ys)-1):
            for k in range(len(zs)-1):
                point = ((xs[i]+xs[i+1])/2, (ys[j]+ys[j+1])/2, (zs[k]+zs[k+1])/2)
                if any(inside(b, *point) for b in add) and not any(inside(b, *point) for b in cut):
                    cells.add((i,j,k))
    triangles = []
    for i,j,k in cells:
        x0,x1,y0,y1,z0,z1 = xs[i],xs[i+1],ys[j],ys[j+1],zs[k],zs[k+1]
        faces = [
            ((-1,0,0), [(x0,y0,z0),(x0,y0,z1),(x0,y1,z1),(x0,y1,z0)]),
            ((1,0,0), [(x1,y0,z0),(x1,y1,z0),(x1,y1,z1),(x1,y0,z1)]),
            ((0,-1,0), [(x0,y0,z0),(x1,y0,z0),(x1,y0,z1),(x0,y0,z1)]),
            ((0,1,0), [(x0,y1,z0),(x0,y1,z1),(x1,y1,z1),(x1,y1,z0)]),
            ((0,0,-1), [(x0,y0,z0),(x0,y1,z0),(x1,y1,z0),(x1,y0,z0)]),
            ((0,0,1), [(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)]),
        ]
        for (di,dj,dk), (a,b,c,d) in faces:
            if (i+di,j+dj,k+dk) not in cells:
                triangles.extend([((di,dj,dk),(a,b,c)), ((di,dj,dk),(a,c,d))])
    edges = Counter()
    for _, verts in triangles:
        for a,b in ((0,1),(1,2),(2,0)):
            edges[tuple(sorted((verts[a],verts[b])))] += 1
    if any(count != 2 for count in edges.values()):
        raise RuntimeError(f"{name} is not a closed mesh")
    path = OUT / name
    with path.open('wb') as f:
        f.write(b'UTLT.ai enclosure'.ljust(80,b'\0'))
        f.write(pack('<I',len(triangles)))
        for normal, verts in triangles:
            f.write(pack('<12fH',*normal,*(v for vertex in verts for v in vertex),0))
    print(path.name, len(triangles), 'triangles; closed mesh')


base = [box(-L/2,L/2,-W/2,W/2,0,H), box(L/2,L/2+42,-22,22,0,3)]
for y in (-17,17):
    base.append(box(-27.5,27.5,y-1.75,y+1.75,2.3,5.3))
cuts = [box(-L/2+WALL,L/2-WALL,-W/2+WALL,W/2-WALL,WALL,H+2),
        box(-L/2-2,-L/2+WALL+.1,-6.5,6.5,3,13)]  # USB cable opening
for x in (L/2+12,L/2+30):
    for y in (-16,16):
        cuts.append(box(x-2,x+2,y-3.5,y+3.5,-1,4))  # zip-tie slots
write_stl('utlt-base.stl',base,cuts)
write_stl('utlt-lid.stl',[box(-L/2,L/2,-W/2,W/2,0,2.4),
                          box(-L/2+WALL+CLEARANCE,L/2-WALL-CLEARANCE,
                              -W/2+WALL+CLEARANCE,W/2-WALL-CLEARANCE,-2,0)],[])
