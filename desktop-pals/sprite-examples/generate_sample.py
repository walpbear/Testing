"""Generate original, transparent Mochi art with only the Python standard library.

Run from any working directory: python3 sprite-examples/generate_sample.py
This draws new art; it does not read or edit any reference image.
"""
from pathlib import Path
import math
import struct
import zlib

W, H, SCALE = 384, 288, 3
pixels = bytearray(W * H * SCALE * SCALE * 4)
PW = W * SCALE


def color(value):
    return tuple(bytes.fromhex(value.lstrip('#'))) + (255,)


def pixel(x, y, rgba):
    if 0 <= x < PW and 0 <= y < H * SCALE:
        i = (y * PW + x) * 4
        pixels[i:i + 4] = bytes(rgba)


def oval(cx, cy, rx, ry, fill):
    rgba = color(fill)
    for y in range(int((cy - ry) * SCALE), math.ceil((cy + ry) * SCALE)):
        for x in range(int((cx - rx) * SCALE), math.ceil((cx + rx) * SCALE)):
            if ((x / SCALE + 0.5 / SCALE - cx) / rx) ** 2 + ((y / SCALE + 0.5 / SCALE - cy) / ry) ** 2 <= 1:
                pixel(x, y, rgba)


def polygon(points, fill):
    pts = [(x * SCALE, y * SCALE) for x, y in points]
    rgba = color(fill)
    for y in range(int(min(y for _, y in pts)), math.ceil(max(y for _, y in pts))):
        intersections = []
        for index, (x1, y1) in enumerate(pts):
            x2, y2 = pts[(index + 1) % len(pts)]
            if (y1 <= y + .5 < y2) or (y2 <= y + .5 < y1):
                intersections.append(x1 + (y + .5 - y1) * (x2 - x1) / (y2 - y1))
        intersections.sort()
        for left, right in zip(intersections[0::2], intersections[1::2]):
            for x in range(math.ceil(left - .5), math.ceil(right - .5)):
                pixel(x, y, rgba)


def line(x1, y1, x2, y2, width, fill):
    distance = math.hypot(x2 - x1, y2 - y1)
    for step in range(max(1, int(distance * SCALE)) + 1):
        t = step / max(1, int(distance * SCALE))
        oval(x1 + t * (x2 - x1), y1 + t * (y2 - y1), width / 2, width / 2, fill)


def draw_frame(frame):
    ox, oy = (frame % 4) * 96, (frame // 4) * 96
    asleep = frame in (6, 7)
    playing = frame >= 8
    walking = frame in (2, 3, 4, 5)
    bounce = ([0, -2, 0, -2][frame - 2] if walking else [0, -2, -4, -1][frame - 8] if playing else frame % 2)
    if asleep:
        bounce = 8 + frame % 2

    def e(x, y, rx, ry, fill): oval(ox + x, oy + y + bounce, rx, ry, fill)
    def p(points, fill): polygon([(ox + x, oy + y + bounce) for x, y in points], fill)
    def l(x1, y1, x2, y2, width, fill): line(ox + x1, oy + y1 + bounce, ox + x2, oy + y2 + bounce, width, fill)

    # Fluffy crescent tail behind the body, plus a charcoal tip.
    e(27, 68, 19, 17, '#45404c')
    e(27, 66, 17, 15, '#e7d8ce')
    p([(10, 66), (9, 50), (19, 55), (17, 44), (30, 55), (38, 63), (24, 72)], '#fff5e9')
    p([(11, 54), (9, 45), (18, 49), (18, 39), (27, 51), (25, 58)], '#45404c')
    # Paws and rounded cream body; walking alternates foot positions.
    foot = (3 if frame in (2, 5) else -3) if walking else 0
    e(43, 80 + foot, 8, 7, '#45404c')
    e(59, 80 - foot, 8, 7, '#45404c')
    e(51, 65, 17, 19, '#45404c')
    e(51, 63, 15, 17, '#fff5e9')
    e(51, 71, 10, 10, '#e7d8ce')
    p([(42, 51), (48, 55), (51, 51), (55, 56), (63, 52), (59, 64), (50, 59), (42, 63)], '#fffaf2')
    # Large triangular ears.
    p([(27, 35), (24, 5), (44, 22)], '#45404c')
    p([(57, 22), (77, 5), (74, 35)], '#45404c')
    p([(29, 28), (28, 12), (40, 24)], '#ef9ba9')
    p([(62, 24), (73, 12), (71, 28)], '#ef9ba9')
    p([(30, 29), (31, 23), (38, 28)], '#fff5e9')
    p([(64, 28), (70, 23), (69, 29)], '#fff5e9')
    # Fur tufts form an animal silhouette rather than human skin or hair.
    e(51, 37, 25, 21, '#45404c')
    e(51, 36, 23, 20, '#fff5e9')
    p([(28, 34), (23, 37), (28, 41), (23, 46), (33, 47), (37, 54), (40, 48)], '#fff5e9')
    p([(73, 34), (79, 37), (74, 41), (79, 46), (69, 47), (64, 54), (62, 48)], '#fff5e9')
    p([(32, 22), (42, 15), (44, 10), (50, 16), (60, 12), (59, 19), (70, 24), (57, 25), (50, 21), (43, 27)], '#e7d8ce')
    # Eyes and feline muzzle.
    if asleep or (frame == 1):
        l(36, 36, 43, 38, 2, '#45404c')
        l(59, 38, 66, 36, 2, '#45404c')
    else:
        for x in (40, 62):
            e(x, 37, 4.1, 5.8, '#45404c')
            e(x, 38, 2.8, 4.3, '#5a9ed3')
            e(x - 1, 35.6, 1.35, 1.8, '#ffffff')
    e(34, 43, 4, 2.3, '#efbdba')
    e(68, 43, 4, 2.3, '#efbdba')
    e(47, 46, 6.2, 5, '#ffffff')
    e(55, 46, 6.2, 5, '#ffffff')
    p([(48, 42), (54, 42), (51, 45)], '#45404c')
    l(51, 45, 51, 48, 1.1, '#45404c')
    l(51, 48, 47.5, 49, 1.1, '#45404c')
    l(51, 48, 54.5, 49, 1.1, '#45404c')
    if playing:
        e(51, 50, 2.4, 2.6, '#e67993')
    # Blue scarf and paw hands. Play frames lift the paws.
    p([(37, 54), (49, 58), (64, 53), (63, 59), (49, 63), (37, 59)], '#5a9ed3')
    p([(55, 60), (63, 59), (68, 74), (61, 72)], '#377bad')
    arm_y = 49 if playing else 66
    for x, sign in ((33, -1), (69, 1)):
        e(x, arm_y, 6, 9, '#45404c')
        if playing:
            e(x, arm_y + 1, 2.8, 3.1, '#ef9ba9')
            for pad in (-2.8, 0, 2.8):
                e(x + pad, arm_y - 3.3 + abs(pad) * .2, 1.15, 1.4, '#ef9ba9')
    if playing:
        for x, y in ((15, 25 + frame % 2 * 5), (85, 39 - frame % 2 * 7)):
            p([(x, y - 4), (x + 1.4, y - 1.4), (x + 4, y), (x + 1.4, y + 1.4), (x, y + 4), (x - 1.4, y + 1.4), (x - 4, y), (x - 1.4, y - 1.4)], '#edac72')
    if asleep:
        l(77, 18, 85, 18, 1.5, '#5a9ed3')
        l(85, 18, 77, 25, 1.5, '#5a9ed3')
        l(77, 25, 85, 25, 1.5, '#5a9ed3')


for frame in range(12):
    draw_frame(frame)

# Box-filter downsample with premultiplied color to keep transparent edges clean.
raw = bytearray()
for y in range(H):
    raw.append(0)
    for x in range(W):
        samples = [pixels[((y * SCALE + dy) * PW + x * SCALE + dx) * 4:((y * SCALE + dy) * PW + x * SCALE + dx) * 4 + 4] for dy in range(SCALE) for dx in range(SCALE)]
        alpha_sum = sum(s[3] for s in samples)
        raw.extend([round(sum(s[c] * s[3] for s in samples) / alpha_sum) if alpha_sum else 0 for c in range(3)] + [round(alpha_sum / (SCALE * SCALE))])


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)


png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b'')
destination = Path(__file__).parent / 'mochi' / 'sheet.png'
destination.write_bytes(png)
print(f'Wrote {destination.name}: {W} x {H}, {len(png)} bytes')
