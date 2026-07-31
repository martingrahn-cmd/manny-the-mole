#!/usr/bin/env node
/**
 * Kontrollerar kampanjens banor.
 *
 * Spelet validerar redan formen vid inläsning — radbredd, giltiga tecken och
 * att föremål ligger på tomma rutor — och kastar om något är fel. Det som
 * ingen kontrollerar är om banan faktiskt går att spela: att skåpet går att
 * nå, att syret räcker dit, och att start och skåp inte ligger i berget.
 * Handritade kartor går sönder tyst på just de sätten.
 *
 *   node tools/validate-levels.mjs
 *
 * Avslutar med kod 1 om någon bana underkänns.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAMPAIGN_LEVELS = new Function(
    `${fs.readFileSync(path.join(ROT, 'levels.js'), 'utf8')}; return CAMPAIGN_LEVELS;`
)();

// Speltakt, hämtad ur game.js. Ändras de där ska de ändras här.
const RUTBREDD = 7;
const SYRE_MAX = 100;
const SYRE_PER_SEKUND = 1.2;
const SYRE_PER_TUB = 20;
const GÅ_PER_RUTA = 0.12;      // moveCooldown
const GRÄV_PER_SLAG = 0.105;   // DIG_RECOVERY
const XBLOCK_HP = 5;
// Dijkstra ger optimalt spel. En människa letar, backar och missar slag, så
// den praktiska marginalen mäts mot en trevande spelare.
const SLARVFAKTOR = 3;

const BERG = new Set(['#', '=']);
const GRÄVBART = new Set(['0', '1', '2', '3', 'X']);

/** Sekunder att ta sig in i en ruta: gå om den är tom, gräva annars. */
function rutkostnad(tecken) {
    if (tecken === '.') return GÅ_PER_RUTA;
    if (tecken === 'X') return GÅ_PER_RUTA + GRÄV_PER_SLAG * XBLOCK_HP;
    if (GRÄVBART.has(tecken)) return GÅ_PER_RUTA + GRÄV_PER_SLAG;
    return Infinity;
}

/**
 * Billigaste väg från start till skåpet, mätt i sekunder.
 * Dijkstra över rutor som inte är berg; fyrgrannskap, eftersom mullvaden
 * kan borra i alla fyra riktningar och kliva upp ett steg.
 */
function billigasteVäg(rader, start, mål) {
    const höjd = rader.length;
    const nyckel = (x, y) => y * RUTBREDD + x;
    const kostnad = new Map([[nyckel(start.x, start.y), 0]]);
    const kö = [{ x: start.x, y: start.y, t: 0 }];
    const målNyckel = new Set(mål.map(m => nyckel(m.x, m.y)));

    while (kö.length > 0) {
        kö.sort((a, b) => a.t - b.t);
        const nu = kö.shift();
        if (nu.t > (kostnad.get(nyckel(nu.x, nu.y)) ?? Infinity)) continue;
        if (målNyckel.has(nyckel(nu.x, nu.y))) return nu.t;

        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const x = nu.x + dx;
            const y = nu.y + dy;
            if (x < 0 || x >= RUTBREDD || y < 0 || y >= höjd) continue;
            const extra = rutkostnad(rader[y][x]);
            if (!Number.isFinite(extra)) continue;
            const ny = nu.t + extra;
            if (ny < (kostnad.get(nyckel(x, y)) ?? Infinity)) {
                kostnad.set(nyckel(x, y), ny);
                kö.push({ x, y, t: ny });
            }
        }
    }
    return null;
}

/** Rutor som går att nå alls, oavsett kostnad. */
function nåbaraRutor(rader, start) {
    const höjd = rader.length;
    const sedda = new Set([start.y * RUTBREDD + start.x]);
    const kö = [start];
    while (kö.length > 0) {
        const nu = kö.pop();
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const x = nu.x + dx;
            const y = nu.y + dy;
            if (x < 0 || x >= RUTBREDD || y < 0 || y >= höjd) continue;
            if (BERG.has(rader[y][x])) continue;
            const k = y * RUTBREDD + x;
            if (sedda.has(k)) continue;
            sedda.add(k);
            kö.push({ x, y });
        }
    }
    return sedda;
}

/**
 * Syret längs vägen. Tuberna ligger utspridda, så i stället för att gissa
 * spelarens rutt mäter vi den längsta sträckan mellan två påfyllningar:
 * tiden från start till första tuben, mellan tuber i djupled, och från
 * sista tuben ned till skåpet.
 */
function syremarginal(rader, nivå) {
    const tuber = nivå.items
        .filter(item => item.kind === 'oxygen')
        .map(item => ({ x: item.x, y: item.y }))
        .sort((a, b) => a.y - b.y);
    const etapper = [];
    let från = { x: nivå.start.x, y: nivå.start.y };
    let syre = nivå.start.oxygen ?? SYRE_MAX;

    for (const tub of tuber) {
        const t = billigasteVäg(rader, från, [tub]);
        if (t === null) continue;            // tub bakom berg — inte en etapp
        etapper.push({ mål: `tub ${tub.x},${tub.y}`, sekunder: t, syreFöre: syre });
        syre = Math.min(SYRE_MAX, syre - t * SYRE_PER_SEKUND + SYRE_PER_TUB);
        från = tub;
    }

    const skåp = skåpRutor(nivå);
    const sista = billigasteVäg(rader, från, skåp);
    if (sista !== null) {
        etapper.push({ mål: 'skåpet', sekunder: sista, syreFöre: syre });
        syre -= sista * SYRE_PER_SEKUND;
    }

    // samma etapper igen, men med en spelare som tar omvägar
    let trevande = nivå.start.oxygen ?? SYRE_MAX;
    for (const etapp of etapper) {
        trevande -= etapp.sekunder * SLARVFAKTOR * SYRE_PER_SEKUND;
        if (etapp.mål.startsWith('tub')) {
            trevande = Math.min(SYRE_MAX, trevande + SYRE_PER_TUB);
        }
    }
    return { etapper, syreKvar: syre, syreKvarTrevande: trevande };
}

function skåpRutor(nivå) {
    const rutor = [];
    for (let dy = 0; dy < nivå.safe.height; dy++) {
        for (let dx = 0; dx < nivå.safe.width; dx++) {
            rutor.push({ x: nivå.safe.x + dx, y: nivå.safe.y + dy });
        }
    }
    return rutor;
}

function granska(nivå) {
    const rader = nivå.rows;
    const höjd = rader.length;
    const fel = [];
    const varningar = [];

    // start och skåp måste ligga i öppen luft
    const startTecken = rader[nivå.start.y]?.[nivå.start.x];
    if (startTecken === undefined) {
        fel.push(`start ${nivå.start.x},${nivå.start.y} ligger utanför banan`);
    } else if (startTecken !== '.') {
        fel.push(`start ${nivå.start.x},${nivå.start.y} står i "${startTecken}", inte tom luft`);
    }

    for (const ruta of skåpRutor(nivå)) {
        const tecken = rader[ruta.y]?.[ruta.x];
        if (tecken === undefined) {
            fel.push(`skåpet sticker utanför banan vid ${ruta.x},${ruta.y}`);
        } else if (tecken !== '.') {
            fel.push(`skåpsrutan ${ruta.x},${ruta.y} är "${tecken}", inte tom luft`);
        }
    }

    // går skåpet att nå?
    const nåbara = nåbaraRutor(rader, nivå.start);
    const nåddaSkåpsrutor = skåpRutor(nivå)
        .filter(r => nåbara.has(r.y * RUTBREDD + r.x));
    if (nåddaSkåpsrutor.length === 0) {
        fel.push('skåpet är inmurat — ingen väg dit från starten');
    }

    // syre
    let syre = null;
    if (nåddaSkåpsrutor.length > 0) {
        syre = syremarginal(rader, nivå);
        if (syre.syreKvar <= 0) {
            fel.push(
                `syret tar slut före skåpet även vid perfekt spel ` +
                `(${syre.syreKvar.toFixed(0)}% vid framkomst)`
            );
        } else if (syre.syreKvarTrevande <= 0) {
            varningar.push(
                `en trevande spelare (${SLARVFAKTOR}x optimal tid) kvävs — ` +
                `${syre.syreKvarTrevande.toFixed(0)}% vid skåpet`
            );
        } else if (syre.syreKvarTrevande < 15) {
            varningar.push(
                `tunn marginal för en trevande spelare: ` +
                `${syre.syreKvarTrevande.toFixed(0)}% kvar`
            );
        }
        for (const etapp of syre.etapper) {
            const kostnad = etapp.sekunder * SYRE_PER_SEKUND;
            if (kostnad > etapp.syreFöre) {
                fel.push(
                    `etappen till ${etapp.mål} kostar ${kostnad.toFixed(0)}% ` +
                    `men bara ${etapp.syreFöre.toFixed(0)}% finns`
                );
            }
        }
    }

    // föremål bakom berg är bortkastade
    for (const item of nivå.items) {
        if (!nåbara.has(item.y * RUTBREDD + item.x)) {
            varningar.push(`${item.kind} på ${item.x},${item.y} går inte att nå`);
        }
    }

    // oåtkomliga fickor säger oftast att kartan är felskriven
    let öppna = 0;
    for (let y = 0; y < höjd; y++) {
        for (let x = 0; x < RUTBREDD; x++) {
            if (!BERG.has(rader[y][x])) öppna++;
        }
    }
    const instängda = öppna - nåbara.size;
    if (instängda > 6) {
        varningar.push(`${instängda} rutor är instängda bakom berg`);
    }

    return { fel, varningar, syre, nåbara: nåbara.size, öppna };
}

export { granska };

// Rapporten körs bara när filen startas direkt, så testet kan importera den.
const körsDirekt = process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (!körsDirekt) {
    // importerad som modul — hoppa över utskriften
} else {

let trasiga = 0;
let varnade = 0;
console.log(`Granskar ${CAMPAIGN_LEVELS.length} banor\n`);

for (const nivå of CAMPAIGN_LEVELS) {
    const r = granska(nivå);
    const status = r.fel.length ? 'FEL ' : r.varningar.length ? 'VARN' : ' OK ';
    const djup = nivå.safe.y - nivå.start.y;
    const syretext = r.syre ?
        `syre kvar ${r.syre.syreKvar.toFixed(0)}% optimalt, ` +
        `${Math.max(0, r.syre.syreKvarTrevande).toFixed(0)}% trevande` :
        'syre ej mätt';
    console.log(
        `[${status}] ${nivå.number}. ${nivå.title} — ${djup} m · ` +
        `kretslås ${nivå.safe.difficulty} · ${syretext}`
    );
    r.fel.forEach(f => console.log(`         fel: ${f}`));
    r.varningar.forEach(v => console.log(`         varning: ${v}`));
    if (r.fel.length) trasiga++;
    else if (r.varningar.length) varnade++;
}

console.log(
    `\n${CAMPAIGN_LEVELS.length - trasiga - varnade} utan anmärkning · ` +
    `${varnade} med varning · ${trasiga} underkända`
);
process.exit(trasiga > 0 ? 1 : 0);
}
