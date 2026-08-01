#!/usr/bin/env python3
"""Composes the title backdrop in the game's own block palette.

One image, the whole premise: strata all the way up, the shaft Manny has
already dug, Manny halfway down it, and the vault waiting at the bottom.
Rendered at the canvas size (7x11 cells of 64px) so the safe sprite lands
at its native resolution and the mole at a clean 4x.
"""
from PIL import Image, ImageDraw
import pathlib

A = pathlib.Path('/home/user/manny-the-mole/assets')
S = 64
W, H = 7, 11

# BLOCK_COLORS from game.js
BLOCK = [
    ('#2786e8', '#7dd8ff', '#1550a6'),   # blue
    ('#ed3e52', '#ff9a94', '#a91d3a'),   # red
    ('#f4bd21', '#fff29a', '#ad6c12'),   # yellow
    ('#38b95e', '#9af5a0', '#17753d'),   # green
]
BEDROCK = ('#232634', '#333849', '#14161f')

canvas = Image.new('RGBA', (W * S, H * S), (7, 9, 15, 255))
draw = ImageDraw.Draw(canvas)
u = S // 32   # the sprite grid the block art was drawn on, scaled up


def block(x, y, colors):
    base, light, shade = colors
    px, py = x * S, y * S
    draw.rectangle([px + u, py + u, px + S - 2 * u, py + S - 2 * u], fill=base)
    draw.rectangle([px + 3 * u, py + 3 * u,
                    px + S - 4 * u, py + 6 * u], fill=light)
    draw.rectangle([px + 3 * u, py + S - 7 * u,
                    px + S - 4 * u, py + S - 4 * u], fill=shade)
    draw.rectangle([px + u, py + u, px + S - 2 * u, py + S - 2 * u],
                   outline=shade)


# Strata to the top edge, one shaft carved down the middle, a vault
# chamber cut into the bedrock at the bottom.
plan = [
    '2301.30',
    '3012.01',
    '0123.12',
    '1230.23',
    '2301.30',
    '3012.01',
    '0123.12',
    '1230.23',
    '123##23',
    '##...##',
    '#######',
]
for y, row in enumerate(plan):
    for x, tile in enumerate(row):
        if tile.isdigit():
            block(x, y, BLOCK[int(tile)])
        elif tile == '#':
            block(x, y, BEDROCK)

# Spoil in the shaft: loose grit that says the tunnel was dug, not found.
grit = ImageDraw.Draw(canvas)
for y, x_off, size, tone in [
    (1, 0.34, 0.07, (58, 46, 34, 150)),
    (2, 0.62, 0.05, (48, 40, 30, 130)),
    (4, 0.28, 0.06, (58, 46, 34, 140)),
    (6, 0.70, 0.05, (44, 38, 30, 120)),
    (7, 0.40, 0.08, (58, 46, 34, 150)),
]:
    cx = (4 + x_off) * S
    cy = (y + 0.72) * S
    r = size * S
    grit.ellipse([cx - r, cy - r * 0.7, cx + r, cy + r * 0.7], fill=tone)

# Darken from the top so the wordmark has quiet ground to sit on. Done
# before the figures so they stay crisp against it.
mask = Image.new('L', canvas.size, 0)
px = mask.load()
for y in range(canvas.size[1]):
    v = int(max(0, min(255, (y / canvas.size[1]) ** 1.4 * 420 - 34)))
    for x in range(canvas.size[0]):
        px[x, y] = v
canvas = Image.composite(
    canvas, Image.new('RGBA', canvas.size, (6, 8, 14, 255)), mask)

mole = Image.open(A / 'mole.png').convert('RGBA')
mole = mole.resize((S * 2, S * 2), Image.NEAREST)
safe = Image.open(A / 'safe-pipes.png').convert('RGBA')
safe = safe.resize((S * 2, S * 2), Image.LANCZOS)


def glow(box, color):
    layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse(box, fill=color)
    canvas.alpha_composite(layer)


# cool light on Manny, warm light spilling out of the vault below
glow([int(3.1 * S), int(4.5 * S), int(4.9 * S), int(6.3 * S)],
     (120, 210, 255, 34))
glow([int(1.6 * S), int(8.5 * S), int(5.4 * S), int(10.4 * S)],
     (240, 186, 96, 30))

canvas.paste(mole, (int(3.5 * S), int(4.7 * S)), mole)
canvas.paste(safe, (int(2.5 * S), int(8.5 * S)), safe)

canvas.save(A / 'title-backdrop.png')
print('title-backdrop.png', canvas.size)
