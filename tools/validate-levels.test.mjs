#!/usr/bin/env node
/**
 * Kontrollerar att validatorn faktiskt fäller trasiga banor.
 * En validator som aldrig underkänner något säger ingenting.
 *
 *   node tools/validate-levels.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { granska } = await import('./validate-levels.mjs');
const CAMPAIGN_LEVELS = new Function(
    `${fs.readFileSync(path.join(ROT, 'levels.js'), 'utf8')}; return CAMPAIGN_LEVELS;`
)();

const frisk = structuredClone(CAMPAIGN_LEVELS[0]);

function kopia(ändra) {
    const nivå = structuredClone(frisk);
    ändra(nivå);
    return nivå;
}

const fall = [
    {
        namn: 'frisk bana passerar',
        nivå: frisk,
        väntar: { fel: 0 },
    },
    {
        namn: 'inmurat skåp fälls',
        nivå: kopia(n => {
            // lägg ett heltäckande berglager strax ovanför skåpet
            n.rows[n.safe.y - 1] = '#######';
            n.rows[n.safe.y - 2] = '#######';
        }),
        väntar: { fel: 1, innehåller: 'inmurat' },
    },
    {
        namn: 'start i berget fälls',
        nivå: kopia(n => {
            const rad = [...n.rows[n.start.y]];
            rad[n.start.x] = '#';
            n.rows[n.start.y] = rad.join('');
        }),
        väntar: { fel: 1, innehåller: 'inte tom luft' },
    },
    {
        namn: 'skåp i berget fälls',
        nivå: kopia(n => {
            const rad = [...n.rows[n.safe.y]];
            rad[n.safe.x] = '0';
            n.rows[n.safe.y] = rad.join('');
        }),
        väntar: { fel: 1, innehåller: 'inte tom luft' },
    },
    {
        namn: 'skåp utanför banan fälls',
        nivå: kopia(n => { n.safe.y = n.rows.length + 3; }),
        väntar: { fel: 1, innehåller: 'utanför banan' },
    },
    {
        namn: 'för långt utan syre fälls',
        nivå: kopia(n => {
            n.items = n.items.filter(i => i.kind !== 'oxygen');
            // gör vägen lång nog att optimalt spel inte räcker
            const djup = [];
            for (let i = 0; i < 400; i++) djup.push('X123X01');
            n.rows = [...n.rows.slice(0, 4), ...djup, '##..0##', '##..###'];
            n.safe.y = n.rows.length - 2;
        }),
        väntar: { fel: 1, innehåller: 'syret tar slut' },
    },
    {
        namn: 'onåbar syretub varnar',
        nivå: kopia(n => {
            n.rows[6] = '#######';
            n.rows[7] = '#######';
            n.items = [{ kind: 'oxygen', x: 3, y: 5 }];
            // skåpet nås fortfarande inte -> både fel och varning väntas
        }),
        väntar: { minstEttFel: true },
    },
];

let godkända = 0;
let misslyckade = 0;
for (const test of fall) {
    const r = granska(test.nivå);
    const felText = r.fel.join(' | ');
    let ok = true;
    let orsak = '';

    if (test.väntar.fel === 0 && r.fel.length !== 0) {
        ok = false; orsak = `väntade inga fel, fick: ${felText}`;
    }
    if (test.väntar.fel >= 1 && r.fel.length === 0) {
        ok = false; orsak = 'väntade minst ett fel, fick inga';
    }
    if (test.väntar.minstEttFel && r.fel.length === 0) {
        ok = false; orsak = 'väntade minst ett fel, fick inga';
    }
    if (test.väntar.innehåller && !felText.includes(test.väntar.innehåller)) {
        ok = false;
        orsak = `saknade "${test.väntar.innehåller}" i: ${felText || '(inga fel)'}`;
    }

    console.log(`${ok ? '  ok  ' : ' FEL  '} ${test.namn}`);
    if (!ok) console.log(`        ${orsak}`);
    if (ok) godkända++; else misslyckade++;
}

console.log(`\n${godkända} godkända · ${misslyckade} misslyckade`);
process.exit(misslyckade > 0 ? 1 : 0);
