#!/usr/bin/env python3
"""Builds the six new maps and weaves them into levels.js.

The body of each map is written by hand, row by row. The script adds the
header (four empty rows) and the footer (the safe pocket), pads to the
exact depth the map should have, and drops air tanks into its pockets.
"""
import pathlib
import re

FILLER = ['0123012', '1230123', '2301230', '3012301']


def F(i):
    return FILLER[i % 4]


def filler(n, start=0):
    return [F(start + i) for i in range(n)]


# ------------------------------------------------------------------- maps

# 2. Core Sample - grade 1. Funnels that force sideways drilling.
BODY_A = (
    filler(3)
    + ['###0###']
    + filler(2, 1)
    + ['#1#####', '0.12301']
    + filler(2, 3)
    + ['===2301']
    + filler(2, 1)
    + ['#####1#', '23012.0']
    + filler(2, 3)
    + ['###2###']
)

# 4. Final Notice - grade 2. Long stretches between the tanks.
BODY_B = (
    filler(4)
    + ['0123===', '12301.3']
    + filler(4, 2)
    + ['###1###']
    + filler(4, 1)
    + ['#0#####', '.230123']
    + filler(4, 3)
    + ['===0123']
    + filler(3, 2)
    + ['#####2#', '30120.1']
    + filler(2, 1)
)

# 6. Rainy Day - grade 3. Two X-blocks in one shaft.
BODY_C = (
    filler(3)
    + ['###1###']
    + filler(3, 1)
    + ['0123X12', '1230.23']
    + filler(3, 2)
    + ['===2301']
    + filler(3, 1)
    + ['X123012', '2301.30']
    + filler(3, 3)
    + ['##1####']
    + filler(3, 2)
    + ['0123X12']
    + filler(3, 1)
    + ['#####0#', '12301.3']
    + filler(1, 2)
)

# 8. Hindsight - grade 4. Support roofs and drops to read.
BODY_D = (
    filler(3)
    + ['===0123', '.230123']
    + filler(3, 2)
    + ['###X###']
    + filler(3, 1)
    + ['0123===', '12301.3']
    + filler(3, 2)
    + ['#2#####']
    + filler(3, 1)
    + ['X1230X2', '2301.30']
    + filler(4, 3)
    + ['===1230']
    + filler(3, 2)
    + ['#####1#', '30120.1']
    + filler(1, 1)
)

# 10. Negative Space - grade 5. Rock, supports and X alternating.
BODY_E = (
    filler(2)
    + ['#1#####', '.123012']
    + filler(2, 2)
    + ['===X123']
    + filler(3, 1)
    + ['###0###']
    + filler(2, 2)
    + ['0X23012', '1230.23']
    + filler(3, 3)
    + ['#####2#']
    + filler(2, 1)
    + ['===0X23', '2301.30']
    + filler(3, 2)
    + ['##3####']
    + filler(3, 1)
    + ['012X012', '.230123']
    + filler(3, 3)
    + ['#####1#']
)

# 11. Long Service - grade 6. Everything at once, least air.
BODY_F = (
    filler(2)
    + ['###2###']
    + filler(2, 1)
    + ['0X23X12', '1230.23']
    + filler(2, 3)
    + ['===1230']
    + filler(2, 2)
    + ['#0#####', '.123012']
    + filler(2, 1)
    + ['X123X12']
    + filler(2, 3)
    + ['###1###']
    + filler(2, 2)
    + ['012X0X2', '3012.01']
    + filler(2, 1)
    + ['===2301']
    + filler(2, 3)
    + ['#####0#', '12301.3']
    + filler(2, 2)
    + ['0X23012']
    + filler(2, 1)
    + ['##2####']
)

FOOTER = ['####1##', '##..0##', '##..###', '#######']

NEW_MAPS = [
    dict(body=BODY_A, depth=24, grade=1, slot=1,
         id='narrow-passage', title='Core Sample',
         done='Core sampled',
         summary='Bedrock pinches the shaft - drill sideways to get past it.',
         artwork='vault-apple', label='A half-eaten apple',
         blurb='Someone was interrupted. The bite is fresh.'),
    dict(body=BODY_B, depth=32, grade=2, slot=3,
         id='air-pocket', title='Final Notice',
         done='Notice served',
         summary='Long stretches between tanks. Plan where you top up before digging on.',
         artwork='vault-bills', label='A bundle of overdue bills',
         blurb='All past due. Addressee unknown.'),
    dict(body=BODY_C, depth=36, grade=3, slot=5,
         id='double-lock', title='Rainy Day',
         done='Rainy day covered',
         summary='Two X-blocks in one shaft. Keep air in hand before you start drilling.',
         artwork='vault-umbrella', label='An umbrella',
         blurb='Folded. Unusually far from any weather.'),
    dict(body=BODY_D, depth=38, grade=4, slot=7,
         id='long-drop', title='Hindsight',
         done='Hindsight acquired',
         summary='The support roofs will not hold. Read the shake and do not be under it.',
         artwork='vault-glasses', label='Spectacle frames, no lenses',
         blurb='The frame is intact. The lenses are another matter.'),
    dict(body=BODY_E, depth=41, grade=5, slot=9,
         id='the-sieve', title='Negative Space',
         done='Space developed',
         summary='Rock, supports and X all the way down. No stretch comes free.',
         artwork='vault-photo', label='A photograph of a hole',
         blurb='Undated. The subject is hard to make out.'),
    dict(body=BODY_F, depth=42, grade=6, slot=10,
         id='the-needle', title='Long Service',
         done='Service recognised',
         summary='The last shaft before the deep. Least air, most blocks, no margin.',
         artwork='vault-medal', label='A medal for long service',
         blurb='Engraved for somebody else. The ribbon is worn.'),
]


def build(spec):
    """Assembles a map and places tanks in the body's pockets."""
    safe_y = spec['depth'] + 2
    total = safe_y + 3
    body = list(spec['body'])
    space = total - 4 - len(FOOTER)
    # The two rows closest to the footer are always ordinary blocks.
    # Otherwise a rock motif can end up against the footer with their gaps
    # in different columns, and the safe gets walled off.
    MARGIN = 2
    slot = space - MARGIN
    while len(body) > slot and body[-1] in FILLER:
        body.pop()
    if len(body) > slot:
        raise SystemExit(
            f"{spec['id']}: {len(body)} rows do not fit in {slot} "
            f"and the last row '{body[-1]}' is a motif"
        )
    while len(body) < slot:
        body.append(F(len(body)))
    for i in range(MARGIN):
        body.append(F(len(body)))

    rows = ['.......'] * 4 + body + FOOTER
    assert len(rows) == total, (spec['id'], len(rows), total)

    # pockets in the body become air; every third becomes treasure instead
    pockets = []
    for y in range(4, 4 + len(body)):
        for x, tecken in enumerate(rows[y]):
            if tecken == '.':
                pockets.append((x, y))
    entries = []
    for i, (x, y) in enumerate(pockets):
        if i % 3 == 2:
            value = 200 if i % 2 else 50
            kind = 'bag' if i % 2 else 'coin'
            entries.append(
                f"            {{ kind: 'treasure', type: '{kind}', "
                f"value: {value}, x: {x}, y: {y} }},"
            )
        else:
            entries.append(f"            {{ kind: 'oxygen', x: {x}, y: {y} }},")

    row_text = '\n'.join(f"            '{r}'," for r in rows)
    entry_text = '\n'.join(entries)
    return f"""    {{
        id: '{spec['id']}',
        number: 0,
        title: '{spec['title']}',
        completeTitle: '{spec['done']}',
        summary: '{spec['summary']}',
        start: {{ x: 3, y: 2, facing: 'down', oxygen: 100 }},
        reward: {{
            image: 'assets/{spec['artwork']}.png',
            name: '{spec['label']}',
            blurb: '{spec['blurb']}',
        }},
        safe: {{
            type: 'pipes',
            difficulty: {spec['grade']},
            x: 2,
            y: {safe_y},
            width: 2,
            height: 2,
        }},
        rows: [
{row_text}
        ],
        items: [
{entry_text}
        ],
    }},
"""


ROOT = pathlib.Path('/home/user/manny-the-mole')
source = (ROOT / 'levels.js').read_text(encoding='utf-8')

# split out the existing maps
inner = source[source.index('[') + 1:source.rindex(']')]
existing = re.findall(r'    \{\n.*?\n    \},\n', inner, re.S)
if len(existing) != 6:
    raise SystemExit(f'expected 6 existing maps, found {len(existing)}')

ordered = []
new_i = 0
for i, level in enumerate(existing):
    ordered.append(level)
    if new_i < len(NEW_MAPS) and NEW_MAPS[new_i]['slot'] == len(ordered):
        ordered.append(build(NEW_MAPS[new_i]))
        new_i += 1
while new_i < len(NEW_MAPS):
    ordered.insert(NEW_MAPS[new_i]['slot'], build(NEW_MAPS[new_i]))
    new_i += 1

# renumber and set the circuit grade to 1,1,2,2,3,3,4,4,5,5,6,6
GRADES = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]
for i, level in enumerate(ordered):
    level = re.sub(r'        number: \d+,', f'        number: {i + 1},', level)
    level = re.sub(r"(type: 'pipes',\n            difficulty: )\d+",
                  rf'\g<1>{GRADES[i]}', level)
    ordered[i] = level

out = 'const CAMPAIGN_LEVELS = Object.freeze([\n' + ''.join(ordered) + ']);\n'
tail = source[source.rindex(']') + 1:].lstrip(');').lstrip('\n')
(ROOT / 'levels.js').write_text(out + ('\n' + tail if tail.strip() else ''), encoding='utf-8')
print(f'{len(ordered)} maps written')
