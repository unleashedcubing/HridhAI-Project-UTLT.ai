"""Export the ten V2 3MF bodies as separately oriented binary STL files in mm."""
import math
import struct
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

CORE = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
N = {"m": CORE}
NAMES = {
    "1": "01-large-panel-magnets-up",
    "2": "02-main-body",
    "3": "03-small-block-a",
    "4": "04-side-bracket-a",
    "5": "05-small-block-b",
    "6": "06-small-block-c",
    "7": "07-side-panel-a-magnet-up",
    "8": "08-small-block-d",
    "9": "09-side-panel-b-magnet-up",
    "10": "10-side-bracket-b",
}


def orient(point, object_id):
    x, y, z = point
    if object_id in {"1", "7", "9"}:
        return x, -y, -z  # 180 degrees about X; magnet recesses face upward.
    if object_id in {"4", "10"}:
        return y, z, x  # Largest broad side on the bed.
    if object_id in {"3", "5", "6", "8"}:
        return z, x, y  # Shorter 7 mm print height.
    return x, y, z


def write_stl(path, vertices, faces):
    with open(path, "wb") as output:
        output.write(b"UTLT.ai case V2 - dimensions in mm".ljust(80, b"\0"))
        output.write(struct.pack("<I", len(faces)))
        for a, b, c in faces:
            p, q, r = vertices[a], vertices[b], vertices[c]
            u = [q[i] - p[i] for i in range(3)]
            v = [r[i] - p[i] for i in range(3)]
            normal = (u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0])
            length = math.sqrt(sum(n*n for n in normal))
            normal = tuple(n / length for n in normal) if length else (0, 0, 0)
            output.write(struct.pack("<12fH", *(normal + p + q + r), 0))


def main(source, destination):
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(source) as archive:
        root = ET.fromstring(archive.read("3D/3dmodel.model"))
    for obj in root.findall("./m:resources/m:object", N):
        object_id = obj.get("id")
        vertices = [orient(tuple(float(vertex.get(axis)) for axis in "xyz"), object_id)
                    for vertex in obj.findall(".//m:vertex", N)]
        faces = [tuple(int(face.get(axis)) for axis in ("v1", "v2", "v3"))
                 for face in obj.findall(".//m:triangle", N)]
        minima = tuple(min(point[i] for point in vertices) for i in range(3))
        vertices = [tuple(point[i] - minima[i] for i in range(3)) for point in vertices]
        size = tuple(max(point[i] for point in vertices) for i in range(3))
        name = NAMES[object_id]
        write_stl(destination / f"{name}.stl", vertices, faces)
        print(f"{name}: {size[0]:.1f} x {size[1]:.1f} x {size[2]:.1f} mm")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
