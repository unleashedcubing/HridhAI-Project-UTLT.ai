"""Refine only the six 8-mm magnet seats in the supplied 3MF mesh.

Usage: python3 refine_magnet_seats.py input.3mf output.3mf
The original file is never overwritten. No third-party packages required.
"""
import math
import sys
import zipfile
from xml.etree import ElementTree as ET

CORE = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
for prefix, uri in [("", CORE), ("m", "http://schemas.microsoft.com/3dmanufacturing/material/2015/02"),
                    ("p", "http://schemas.microsoft.com/3dmanufacturing/production/2015/06"),
                    ("b", "http://schemas.microsoft.com/3dmanufacturing/beamlattice/2017/02"),
                    ("s", "http://schemas.microsoft.com/3dmanufacturing/slice/2015/07"),
                    ("sc", "http://schemas.microsoft.com/3dmanufacturing/securecontent/2019/04")]:
    ET.register_namespace(prefix, uri)

# Existing pocket centres are used only to select their vertices. Exact centres
# are recomputed from the 14-sided rings before changing the radius.
SEATS = {"1": [(-318.33, 97.07), (-161.33, 97.07), (-318.33, 174.07), (-161.33, 174.07)],
         "7": [(-100.1, -5.05)], "9": [(-407.25, 10.65)]}
RADIUS = 4.2  # 8.4-mm nominal pocket, approximately 8.35 mm across the 28-gon flats


def update_object(obj):
    mesh = obj.find(f"{{{CORE}}}mesh")
    verts_el = mesh.find(f"{{{CORE}}}vertices")
    tris_el = mesh.find(f"{{{CORE}}}triangles")
    vertices = [[float(v.get(k)) for k in "xyz"] for v in verts_el]
    faces = [tuple(int(t.get(k)) for k in ("v1", "v2", "v3")) for t in tris_el]
    ring_edges = set()
    centres = []
    for near_x, near_y in SEATS[obj.get("id")]:
        groups = {}
        for i, (x, y, z) in enumerate(vertices):
            radius = math.hypot(x - near_x, y - near_y)
            if 3.8 < radius < 4.6:
                groups.setdefault(round(z, 3), []).append(i)
        if len(groups) != 2 or any(len(group) != 14 for group in groups.values()):
            raise ValueError(f"Magnet ring not found in body {obj.get('id')}: {near_x}, {near_y}")
        ids = [i for group in groups.values() for i in group]
        cx = sum(vertices[i][0] for i in ids) / len(ids)
        cy = sum(vertices[i][1] for i in ids) / len(ids)
        centres.append((cx, cy))
        for i in ids:
            x, y, z = vertices[i]
            length = math.hypot(x - cx, y - cy)
            vertices[i] = [cx + (x - cx) * RADIUS / length,
                           cy + (y - cy) * RADIUS / length, z]
        for group in groups.values():
            group_set = set(group)
            edges = {tuple(sorted((a, b))) for a, b, c in faces
                     for a, b in ((a, b), (b, c), (c, a))
                     if a in group_set and b in group_set and
                     math.dist(vertices[a], vertices[b]) < 2.4}
            if len(edges) != 14:
                raise ValueError(f"Expected 14 circular edges, got {len(edges)}")
            ring_edges.update((edge, cx, cy) for edge in edges)
    split = {}
    for edge, cx, cy in ring_edges:
        a, b = edge
        x = (vertices[a][0] + vertices[b][0]) / 2
        y = (vertices[a][1] + vertices[b][1]) / 2
        length = math.hypot(x - cx, y - cy)
        split[edge] = len(vertices)
        vertices.append([cx + (x - cx) * RADIUS / length,
                         cy + (y - cy) * RADIUS / length,
                         (vertices[a][2] + vertices[b][2]) / 2])
    new_faces = []
    for a, b, c in faces:
        polygon = []
        for u, v in ((a, b), (b, c), (c, a)):
            polygon.append(u)
            mid = split.get(tuple(sorted((u, v))))
            if mid is not None:
                polygon.append(mid)
        if len(polygon) == 3:
            new_faces.append((a, b, c))
            continue
        center = [sum(vertices[i][axis] for i in (a, b, c)) / 3 for axis in range(3)]
        center_id = len(vertices)
        vertices.append(center)
        new_faces.extend((center_id, polygon[i], polygon[(i + 1) % len(polygon)])
                         for i in range(len(polygon)))
    verts_el.clear()
    tris_el.clear()
    for x, y, z in vertices:
        ET.SubElement(verts_el, f"{{{CORE}}}vertex", x=f"{x:.6f}", y=f"{y:.6f}", z=f"{z:.6f}")
    for a, b, c in new_faces:
        ET.SubElement(tris_el, f"{{{CORE}}}triangle", v1=str(a), v2=str(b), v3=str(c))
    return len(centres), len(split)


def main(source, destination):
    if source == destination:
        raise ValueError("Output must differ from the original 3MF")
    with zipfile.ZipFile(source) as original:
        model = ET.fromstring(original.read("3D/3dmodel.model"))
        results = []
        for obj in model.findall(f"./{{{CORE}}}resources/{{{CORE}}}object"):
            if obj.get("id") in SEATS:
                results.append((obj.get("id"), *update_object(obj)))
        model_bytes = ET.tostring(model, encoding="utf-8", xml_declaration=True)
        with zipfile.ZipFile(destination, "w") as output:
            for info in original.infolist():
                output.writestr(info, model_bytes if info.filename == "3D/3dmodel.model"
                                else original.read(info.filename))
    print("Refined (body, seats, ring edges):", results)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
