"""
Generate PNG icons for the Scholar Lens Chrome extension.
Requires no third-party packages — uses only Python standard library.

Usage:
    cd icons
    python3 generate_icons.py
"""

import struct
import zlib
import math
import os

def png_bytes(width, height, pixels):
    """Build a minimal PNG file from a list of (r,g,b,a) tuples (row-major)."""
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xFFFFFFFF)

    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))  # RGBA

    raw = b''
    for y in range(height):
        raw += b'\x00'  # filter: None
        for x in range(width):
            r, g, b, a = pixels[y * width + x]
            raw += bytes([r, g, b, a])

    idat = chunk(b'IDAT', zlib.compress(raw, 9))
    iend = chunk(b'IEND', b'')
    return b'\x89PNG\r\n\x1a\n' + ihdr + idat + iend


def lerp(a, b, t):
    return a + (b - a) * t


def draw_icon(size):
    """Draw a simple 'S' (Scholar) on a blue rounded-square background."""
    pixels = []

    # Colours
    bg_r, bg_g, bg_b = 26, 115, 232   # #1a73e8 — Google blue
    fg_r, fg_g, fg_b = 255, 255, 255  # white

    corner_radius = size * 0.22

    for y in range(size):
        for x in range(size):
            cx, cy = x + 0.5, y + 0.5  # pixel centre

            # ── Rounded square mask (anti-aliased) ───────────────────────
            # Distance to the nearest corner-circle edge
            rx = max(corner_radius - cx, cx - (size - corner_radius), 0)
            ry = max(corner_radius - cy, cy - (size - corner_radius), 0)
            dist_corner = math.hypot(rx, ry) - corner_radius
            # dist_corner < 0  → inside, > 0 → outside
            bg_alpha = max(0.0, min(1.0, 0.5 - dist_corner))

            # ── "S" glyph ────────────────────────────────────────────────
            # Draw three horizontal bars as a stylised 'S' / open-book icon
            pad   = size * 0.22
            lw    = size * 0.13   # line (bar) height
            gap   = size * 0.115
            w     = size * 0.56

            left  = size * 0.22
            right = left + w

            bar_y = [
                size * 0.28,    # top bar
                size * 0.28 + lw + gap,  # middle bar
                size * 0.28 + 2 * (lw + gap),  # bottom bar (shorter)
            ]
            bar_w = [w, w, w * 0.65]

            fg_alpha = 0.0
            for i, (by, bw) in enumerate(zip(bar_y, bar_w)):
                # Anti-alias bars (soft edges, 0.8px feather)
                feather = 0.8
                dy = min(cy - by, by + lw - cy)
                dx = min(cx - left, left + bw - cx)
                aa = min(max(dy / feather + 0.5, 0.0), 1.0) * min(max(dx / feather + 0.5, 0.0), 1.0)
                fg_alpha = max(fg_alpha, aa)

            # ── Composite: background then glyph ─────────────────────────
            if bg_alpha <= 0:
                pixels.append((0, 0, 0, 0))
                continue

            r = round(lerp(bg_r, fg_r, fg_alpha))
            g = round(lerp(bg_g, fg_g, fg_alpha))
            b = round(lerp(bg_b, fg_b, fg_alpha))
            a = round(bg_alpha * 255)
            pixels.append((r, g, b, a))

    return pixels


def main():
    sizes = [16, 32, 48, 128]
    script_dir = os.path.dirname(os.path.abspath(__file__))

    for s in sizes:
        pixels = draw_icon(s)
        data   = png_bytes(s, s, pixels)
        path   = os.path.join(script_dir, f'icon{s}.png')
        with open(path, 'wb') as f:
            f.write(data)
        print(f'  Created {path}  ({s}×{s})')

    print('Done.')


if __name__ == '__main__':
    main()
