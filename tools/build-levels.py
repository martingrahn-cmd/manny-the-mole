"""Regenerates the campaign shafts.

The old maps were 24 to 48 rows, which is five to ten seconds of digging
each — a hundred seconds for the whole campaign, against a measured
average session of just under three minutes. The game was not being
abandoned; it was running out. These are two to three times deeper, and
the air is sized against the descent instead of dwarfing it.

Everything hand-written is preserved: ids, titles, summaries, rewards,
lock types and grades. Only the rock, the items, the air and the par time
are computed here.

Usage: python3 tools/build-levels.py [--check]
"""
import json
import pathlib
import random
import sys
from collections import deque

ROOT = pathlib.Path(__file__).resolve().parent.parent
CURRENT = json.loads((ROOT / 'tools' / 'levels-source.json').read_text())

GRID_W = 7
HEADROOM = 4          # empty rows above the first rock
CHAMBER = 4           # rows the safe chamber occupies
SECONDS_PER_ROW = 0.42  # measured: 24 rows read as roughly ten seconds
DRAIN = 1.2           # oxygen per second
AIR_SLACK = 1.6       # how much longer the tank lasts than a clean descent
MAX_SEAM = 14         # largest run one bite may remove

# Depth is the honest knob for length; character is what keeps the levels
# from feeling like one shaft cut into twelve pieces.
#
#   seam    how far a colour spreads before the next one starts. Big seams
#           break in one bite, which is the move the game is most fun at.
#   bands   bedrock courses per hundred rows. Each one has a gap or two,
#           so passing it means drilling sideways — where the danger is.
#   heavy   share of cells that are X blocks, which cost air to crack.
PROFILES = {
    'gentle':  {'seam': 3.4, 'bands': 5,  'heavy': 0.00, 'colors': 3},
    'ore':     {'seam': 4.6, 'bands': 7,  'heavy': 0.01, 'colors': 3},
    'maze':    {'seam': 2.4, 'bands': 20, 'heavy': 0.02, 'colors': 4},
    'heavy':   {'seam': 2.8, 'bands': 9,  'heavy': 0.07, 'colors': 4},
    'mixed':   {'seam': 3.2, 'bands': 13, 'heavy': 0.04, 'colors': 4},
}

# seconds of digging, character. Level one is the lesson; the rest run
# thirty to fifty.
PLAN = [
    (20, 'gentle'),
    (30, 'ore'),
    (32, 'maze'),
    (34, 'ore'),
    (36, 'heavy'),
    (38, 'maze'),
    (40, 'mixed'),
    (42, 'ore'),
    (44, 'heavy'),
    (46, 'maze'),
    (48, 'mixed'),
    (50, 'mixed'),
]


def build_rows(depth, profile, rng):
    """Rock from HEADROOM down to the chamber, as a grid of characters."""
    body_top = HEADROOM
    body_bottom = depth - CHAMBER
    grid = [['.'] * GRID_W for _ in range(depth)]

    # Colour the body in vertical-ish blobs so seams come away together.
    colors = profile['colors']
    seeds = {}
    for y in range(body_top, body_bottom):
        for x in range(GRID_W):
            key = (x // 2, int(y / profile['seam']))
            if key not in seeds:
                seeds[key] = rng.randrange(colors)
            # A little bleed keeps the seams from looking like bricks.
            c = seeds[key]
            if rng.random() < 0.18:
                c = rng.randrange(colors)
            grid[y][x] = str(c)

    # Heavy blocks, never against the chamber roof.
    for y in range(body_top + 2, body_bottom - 1):
        for x in range(GRID_W):
            if rng.random() < profile['heavy']:
                grid[y][x] = 'X'

    # Bedrock courses. Each leaves one or two gaps, so the way down is a
    # sideways move rather than a straight drop.
    band_count = max(1, round(profile['bands'] * (body_bottom - body_top) / 100))
    if band_count:
        spacing = (body_bottom - body_top) / (band_count + 1)
        for i in range(band_count):
            y = body_top + int(spacing * (i + 1))
            if not (body_top + 1 < y < body_bottom - 1):
                continue
            gaps = {rng.randrange(GRID_W)}
            if rng.random() < 0.45:
                gaps.add(rng.randrange(GRID_W))
            for x in range(GRID_W):
                grid[y][x] = str(rng.randrange(colors)) if x in gaps else '='

    # The chamber: bedrock shell with a two-by-two pocket for the safe and
    # one soft cell above it to break in through.
    entry = rng.choice([1, 4])
    top, mid, low, floor = [['#'] * GRID_W for _ in range(4)]
    top[entry] = str(rng.randrange(colors))
    mid[2] = mid[3] = '.'
    mid[entry] = str(rng.randrange(colors))
    low[2] = low[3] = '.'
    for i, row in enumerate((top, mid, low, floor)):
        grid[body_bottom + i] = row

    return grid


def components(grid, depth):
    """Every connected run of one colour, which is what one bite removes."""
    seen, out = set(), []
    for y in range(depth):
        for x in range(GRID_W):
            if grid[y][x] not in '0123' or (x, y) in seen:
                continue
            colour, comp, stack = grid[y][x], [], [(x, y)]
            seen.add((x, y))
            while stack:
                ax, ay = stack.pop()
                comp.append((ax, ay))
                for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                    nx, ny = ax + dx, ay + dy
                    if not (0 <= nx < GRID_W and 0 <= ny < depth):
                        continue
                    if (nx, ny) in seen or grid[ny][nx] != colour:
                        continue
                    seen.add((nx, ny))
                    stack.append((nx, ny))
            out.append(comp)
    return out


def split_big_seams(grid, depth, max_seam, colors, rng):
    """Nothing caps a bite in the engine — the whole connected run comes
    away. Left alone the generator produced a seventy-block slab, which is
    ten rows of shaft deleted in one press. Big is the point; that is not
    big, that is a hole."""
    for _ in range(60):
        oversized = [c for c in components(grid, depth) if len(c) > max_seam]
        if not oversized:
            return
        for comp in oversized:
            for cx, cy in comp[max_seam:]:
                neighbours = {
                    grid[cy + dy][cx + dx]
                    for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0))
                    if 0 <= cx + dx < GRID_W and 0 <= cy + dy < depth
                }
                options = [
                    str(i) for i in range(colors)
                    if str(i) not in neighbours and str(i) != grid[cy][cx]
                ]
                grid[cy][cx] = rng.choice(options) if options else \
                    str((int(grid[cy][cx]) + 1) % colors)


def carve_pockets(grid, depth, count, rng):
    """Small empty cells for the tubes and coins to sit in."""
    body_top, body_bottom = HEADROOM + 2, depth - CHAMBER - 2
    cells, tries = [], 0
    while len(cells) < count and tries < 4000:
        tries += 1
        x = rng.randrange(GRID_W)
        y = rng.randrange(body_top, body_bottom)
        if grid[y][x] in '#=.':
            continue
        if any(abs(y - cy) < 4 for _, cy in cells):
            continue
        grid[y][x] = '.'
        cells.append((x, y))
    return cells


def reachable(grid, start, target):
    """Bedrock is the only thing that cannot be drilled, so a route exists
    whenever one can be walked ignoring everything else."""
    depth = len(grid)
    seen = {start}
    queue = deque([start])
    while queue:
        x, y = queue.popleft()
        if (x, y) == target:
            return True
        for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < GRID_W and 0 <= ny < depth):
                continue
            if (nx, ny) in seen or grid[ny][nx] in '#=':
                continue
            seen.add((nx, ny))
            queue.append((nx, ny))
    return False


def free_column(grid, depth):
    """A column with no bedrock at all means the level can be held-down."""
    return any(
        all(grid[y][x] not in '#=' for y in range(HEADROOM, depth))
        for x in range(GRID_W)
    )


def make_level(source, seconds, character, seed):
    depth = round(seconds / SECONDS_PER_ROW)
    profile = PROFILES[character]
    tubes = 1 if seconds <= 32 else 2
    coins = 2 if seconds <= 36 else 3

    for attempt in range(400):
        rng = random.Random(seed * 1000 + attempt)
        grid = build_rows(depth, profile, rng)
        split_big_seams(grid, depth, MAX_SEAM, profile['colors'], rng)
        pockets = carve_pockets(grid, depth, tubes + coins, rng)
        if len(pockets) < tubes + coins:
            continue
        start = (source['start']['x'], source['start']['y'])
        safe_cell = (2, depth - CHAMBER + 1)
        if free_column(grid, depth):
            continue
        if not reachable(grid, start, safe_cell):
            continue
        if not all(reachable(grid, start, p) for p in pockets):
            continue
        break
    else:
        raise SystemExit(f"{source['id']}: no layout satisfied the checks")

    items = []
    for i, (x, y) in enumerate(pockets):
        if i < tubes:
            items.append({'kind': 'oxygen', 'x': x, 'y': y})
        else:
            items.append({
                'kind': 'treasure', 'type': 'coin',
                'value': 50 + 25 * (i - tubes), 'x': x, 'y': y,
            })
    items.sort(key=lambda it: (it['y'], it['x']))

    level = dict(source)
    level['rows'] = [''.join(row) for row in grid]
    level['items'] = items
    level['par'] = round(depth * 0.5)
    level['start'] = dict(source['start'])
    level['start']['oxygen'] = round(seconds * AIR_SLACK * DRAIN)
    level['safe'] = dict(source['safe'])
    level['safe']['x'] = 2
    level['safe']['y'] = depth - CHAMBER + 1
    level['safe']['width'] = 2
    level['safe']['height'] = 2
    return level


def js(value):
    """Single-quoted, like the rest of the project. The bundle builder
    inlines artwork by matching 'assets/...' with single quotes, so
    double-quoted output left twelve images pointing at files that do not
    exist once everything is folded into one page."""
    if not isinstance(value, str):
        return json.dumps(value)
    body = value.replace('\\', '\\\\').replace("'", "\\'")
    return f"'{body}'"


def render(levels):
    out = ['const CAMPAIGN_LEVELS = Object.freeze([']
    for lv in levels:
        out.append('    {')
        for key in ('id', 'number', 'title', 'completeTitle', 'summary'):
            out.append(f'        {key}: {js(lv[key])},')
        s = lv['start']
        out.append(
            f"        start: {{ x: {s['x']}, y: {s['y']}, "
            f"facing: {js(s['facing'])}, oxygen: {s['oxygen']} }},"
        )
        out.append(f"        par: {lv['par']},")
        r = lv['reward']
        out.append('        reward: {')
        for key in ('image', 'name', 'blurb'):
            out.append(f'            {key}: {js(r[key])},')
        out.append('        },')
        sf = lv['safe']
        out.append('        safe: {')
        out.append(f"            type: {js(sf['type'])},")
        for key in ('difficulty', 'x', 'y', 'width', 'height'):
            out.append(f'            {key}: {sf[key]},')
        out.append('        },')
        out.append('        rows: [')
        for row in lv['rows']:
            out.append(f"            '{row}',")
        out.append('        ],')
        out.append('        items: [')
        for it in lv['items']:
            parts = [f'kind: {js(it["kind"])}']
            if 'type' in it:
                parts.append(f'type: {js(it["type"])}')
            if 'value' in it:
                parts.append(f'value: {it["value"]}')
            parts += [f'x: {it["x"]}', f'y: {it["y"]}']
            out.append('            { ' + ', '.join(parts) + ' },')
        out.append('        ],')
        out.append('    },')
    out.append(']);')
    out.append('')
    return '\n'.join(out)


levels = [
    make_level(src, seconds, character, i + 1)
    for i, (src, (seconds, character)) in enumerate(zip(CURRENT, PLAN))
]

print(f'{"lvl":>3} {"char":>7} {"rows":>5} {"dig":>6} {"air":>5} '
      f'{"lasts":>6} {"slack":>6} {"par":>4}')
for lv, (seconds, character) in zip(levels, PLAN):
    lasts = lv['start']['oxygen'] / DRAIN
    print(f'{lv["number"]:>3} {character:>7} {len(lv["rows"]):>5} '
          f'{seconds:>5}s {lv["start"]["oxygen"]:>5} {lasts:>5.0f}s '
          f'{lasts / seconds:>5.1f}x {lv["par"]:>4}')
total = sum(s for s, _ in PLAN)
print(f'\ncampaign: {sum(len(l["rows"]) for l in levels)} rows, '
      f'{total}s of digging ({total / 60:.1f} min)')

if '--check' not in sys.argv:
    (ROOT / 'levels.js').write_text(render(levels), encoding='utf-8')
    print('wrote levels.js')
