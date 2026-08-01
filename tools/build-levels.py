#!/usr/bin/env python3
"""Bygger de sex nya banorna och väver in dem i levels.js.

Kroppen till varje bana är handskriven rad för rad. Skriptet lägger på
huvudet (fyra tomma rader) och foten (skåpsfickan), fyller ut till exakt
det djup banan ska ha, och placerar syretuber i de fickor kroppen har.
"""
import pathlib
import re

FYLL = ['0123012', '1230123', '2301230', '3012301']


def F(i):
    return FYLL[i % 4]


def fyll(n, start=0):
    return [F(start + i) for i in range(n)]


# ---------------------------------------------------------------- banorna

# 2. Trånga passagen — grad 1. Trattar som tvingar fram sidoborrning.
KROPP_A = (
    fyll(3)
    + ['###0###']
    + fyll(2, 1)
    + ['#1#####', '0.12301']
    + fyll(2, 3)
    + ['===2301']
    + fyll(2, 1)
    + ['#####1#', '23012.0']
    + fyll(2, 3)
    + ['###2###']
)

# 4. Luftfickan — grad 2. Långa sträckor mellan tuberna.
KROPP_B = (
    fyll(4)
    + ['0123===', '12301.3']
    + fyll(4, 2)
    + ['###1###']
    + fyll(4, 1)
    + ['#0#####', '.230123']
    + fyll(4, 3)
    + ['===0123']
    + fyll(3, 2)
    + ['#####2#', '30120.1']
    + fyll(2, 1)
)

# 6. Dubbla spärren — grad 3. Två X-block i rad.
KROPP_C = (
    fyll(3)
    + ['###1###']
    + fyll(3, 1)
    + ['0123X12', '1230.23']
    + fyll(3, 2)
    + ['===2301']
    + fyll(3, 1)
    + ['X123012', '2301.30']
    + fyll(3, 3)
    + ['##1####']
    + fyll(3, 2)
    + ['0123X12']
    + fyll(3, 1)
    + ['#####0#', '12301.3']
    + fyll(1, 2)
)

# 8. Långa fallet — grad 4. Stödtak och fall att läsa av.
KROPP_D = (
    fyll(3)
    + ['===0123', '.230123']
    + fyll(3, 2)
    + ['###X###']
    + fyll(3, 1)
    + ['0123===', '12301.3']
    + fyll(3, 2)
    + ['#2#####']
    + fyll(3, 1)
    + ['X1230X2', '2301.30']
    + fyll(4, 3)
    + ['===1230']
    + fyll(3, 2)
    + ['#####1#', '30120.1']
    + fyll(1, 1)
)

# 10. Silen — grad 5. Tät växling mellan berg, stöd och X.
KROPP_E = (
    fyll(2)
    + ['#1#####', '.123012']
    + fyll(2, 2)
    + ['===X123']
    + fyll(3, 1)
    + ['###0###']
    + fyll(2, 2)
    + ['0X23012', '1230.23']
    + fyll(3, 3)
    + ['#####2#']
    + fyll(2, 1)
    + ['===0X23', '2301.30']
    + fyll(3, 2)
    + ['##3####']
    + fyll(3, 1)
    + ['012X012', '.230123']
    + fyll(3, 3)
    + ['#####1#']
)

# 11. Nålsögat — grad 6. Allt på en gång, minst luft.
KROPP_F = (
    fyll(2)
    + ['###2###']
    + fyll(2, 1)
    + ['0X23X12', '1230.23']
    + fyll(2, 3)
    + ['===1230']
    + fyll(2, 2)
    + ['#0#####', '.123012']
    + fyll(2, 1)
    + ['X123X12']
    + fyll(2, 3)
    + ['###1###']
    + fyll(2, 2)
    + ['012X0X2', '3012.01']
    + fyll(2, 1)
    + ['===2301']
    + fyll(2, 3)
    + ['#####0#', '12301.3']
    + fyll(2, 2)
    + ['0X23012']
    + fyll(2, 1)
    + ['##2####']
)

FOT = ['####1##', '##..0##', '##..###', '#######']

NYA = [
    dict(kropp=KROPP_A, djup=24, grad=1, plats=1,
         id='narrow-passage', titel='Trånga passagen',
         klart='Trånga passagen forcerad',
         sammanfattning='Berget stryper schaktet — borra åt sidan för att komma förbi.',
         bild='vault-apple', namn='Ett halvätet äpple',
         text='Någon blev avbruten. Bettet är färskt.'),
    dict(kropp=KROPP_B, djup=32, grad=2, plats=3,
         id='air-pocket', titel='Luftfickan',
         klart='Luftfickan hittad',
         sammanfattning='Långt mellan tuberna. Planera var du fyller på innan du gräver vidare.',
         bild='vault-bills', namn='En bunt obetalda räkningar',
         text='Samtliga förfallna. Adressaten okänd.'),
    dict(kropp=KROPP_C, djup=36, grad=3, plats=5,
         id='double-lock', titel='Dubbla spärren',
         klart='Dubbla spärren bruten',
         sammanfattning='Två X-block i samma schakt. Ha luft kvar när du börjar borra.',
         bild='vault-umbrella', namn='Ett paraply',
         text='Hopfällt. Ovanligt långt från väder.'),
    dict(kropp=KROPP_D, djup=38, grad=4, plats=7,
         id='long-drop', titel='Långa fallet',
         klart='Långa fallet överlevt',
         sammanfattning='Stödtaken håller inte länge. Läs skakningen och var inte kvar under.',
         bild='vault-glasses', namn='En glasögonbåge utan glas',
         text='Bågen är hel. Glasen är ett annat kapitel.'),
    dict(kropp=KROPP_E, djup=41, grad=5, plats=9,
         id='the-sieve', titel='Silen',
         klart='Silen genomborrad',
         sammanfattning='Berg, stöd och X om vartannat hela vägen ned. Ingen sträcka är gratis.',
         bild='vault-photo', namn='Ett fotografi av ett hål',
         text='Odaterat. Motivet är svårbedömt.'),
    dict(kropp=KROPP_F, djup=42, grad=6, plats=10,
         id='the-needle', titel='Nålsögat',
         klart='Nålsögat passerat',
         sammanfattning='Sista schaktet före djupet. Minst luft, flest spärrar, ingen marginal.',
         bild='vault-medal', namn='En medalj för lång och trogen tjänst',
         text='Graverad åt någon annan. Bandet är slitet.'),
]


def bygg(spec):
    """Sätter ihop en bana och placerar tuber i kroppens fickor."""
    skåp_y = spec['djup'] + 2
    total = skåp_y + 3
    kropp = list(spec['kropp'])
    behövs = total - 4 - len(FOT)
    # De två raderna närmast foten är alltid vanliga block. Annars kan ett
    # bergmotiv hamna vägg i vägg med foten med gluggarna i olika kolumner,
    # och skåpet muras in.
    MARGINAL = 2
    plats = behövs - MARGINAL
    while len(kropp) > plats and kropp[-1] in FYLL:
        kropp.pop()
    if len(kropp) > plats:
        raise SystemExit(
            f"{spec['id']}: {len(kropp)} rader ryms inte i {plats} "
            f"och sista raden '{kropp[-1]}' är ett motiv"
        )
    while len(kropp) < plats:
        kropp.append(F(len(kropp)))
    for i in range(MARGINAL):
        kropp.append(F(len(kropp)))

    rader = ['.......'] * 4 + kropp + FOT
    assert len(rader) == total, (spec['id'], len(rader), total)

    # fickor i kroppen blir syre; var tredje blir skatt i stället
    fickor = []
    for y in range(4, 4 + len(kropp)):
        for x, tecken in enumerate(rader[y]):
            if tecken == '.':
                fickor.append((x, y))
    poster = []
    for i, (x, y) in enumerate(fickor):
        if i % 3 == 2:
            värde = 200 if i % 2 else 50
            typ = 'bag' if i % 2 else 'coin'
            poster.append(
                f"            {{ kind: 'treasure', type: '{typ}', "
                f"value: {värde}, x: {x}, y: {y} }},"
            )
        else:
            poster.append(f"            {{ kind: 'oxygen', x: {x}, y: {y} }},")

    radtext = '\n'.join(f"            '{r}'," for r in rader)
    postext = '\n'.join(poster)
    return f"""    {{
        id: '{spec['id']}',
        number: 0,
        title: '{spec['titel']}',
        completeTitle: '{spec['klart']}',
        summary: '{spec['sammanfattning']}',
        start: {{ x: 3, y: 2, facing: 'down', oxygen: 100 }},
        reward: {{
            image: 'assets/{spec['bild']}.png',
            name: '{spec['namn']}',
            blurb: '{spec['text']}',
        }},
        safe: {{
            type: 'pipes',
            difficulty: {spec['grad']},
            x: 2,
            y: {skåp_y},
            width: 2,
            height: 2,
        }},
        rows: [
{radtext}
        ],
        items: [
{postext}
        ],
    }},
"""


ROT = pathlib.Path('/home/user/manny-the-mole')
källa = (ROT / 'levels.js').read_text(encoding='utf-8')

# dela upp befintliga banor
inre = källa[källa.index('[') + 1:källa.rindex(']')]
befintliga = re.findall(r'    \{\n.*?\n    \},\n', inre, re.S)
if len(befintliga) != 6:
    raise SystemExit(f'väntade 6 befintliga banor, hittade {len(befintliga)}')

ordning = []
nya_i = 0
for i, bana in enumerate(befintliga):
    ordning.append(bana)
    if nya_i < len(NYA) and NYA[nya_i]['plats'] == len(ordning):
        ordning.append(bygg(NYA[nya_i]))
        nya_i += 1
while nya_i < len(NYA):
    ordning.insert(NYA[nya_i]['plats'], bygg(NYA[nya_i]))
    nya_i += 1

# numrera om och sätt kretsgraden enligt 1,1,2,2,3,3,4,4,5,5,6,6
GRADER = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]
for i, bana in enumerate(ordning):
    bana = re.sub(r'        number: \d+,', f'        number: {i + 1},', bana)
    bana = re.sub(r"(type: 'pipes',\n            difficulty: )\d+",
                  rf'\g<1>{GRADER[i]}', bana)
    ordning[i] = bana

ut = 'const CAMPAIGN_LEVELS = Object.freeze([\n' + ''.join(ordning) + ']);\n'
svans = källa[källa.rindex(']') + 1:].lstrip(');').lstrip('\n')
(ROT / 'levels.js').write_text(ut + ('\n' + svans if svans.strip() else ''), encoding='utf-8')
print(f'{len(ordning)} banor skrivna')
