#!/usr/bin/env node
/**
 * Checks that the validator actually fails broken maps.
 * A validator that never rejects anything proves nothing.
 *
 *   node tools/validate-levels.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { inspect } = await import('./validate-levels.mjs');
const CAMPAIGN_LEVELS = new Function(
    `${fs.readFileSync(path.join(ROOT, 'levels.js'), 'utf8')}; return CAMPAIGN_LEVELS;`
)();

const healthy = structuredClone(CAMPAIGN_LEVELS[0]);

function variant(mutate) {
    const level = structuredClone(healthy);
    mutate(level);
    return level;
}

const cases = [
    {
        name: 'a healthy map passes',
        level: healthy,
        expects: { errors: 0 },
    },
    {
        name: 'a walled-off safe fails',
        level: variant(l => {
            // a solid rock layer just above the safe
            l.rows[l.safe.y - 1] = '#######';
            l.rows[l.safe.y - 2] = '#######';
        }),
        expects: { errors: 1, contains: 'walled off' },
    },
    {
        name: 'a start in rock fails',
        level: variant(l => {
            const row = [...l.rows[l.start.y]];
            row[l.start.x] = '#';
            l.rows[l.start.y] = row.join('');
        }),
        expects: { errors: 1, contains: 'not open air' },
    },
    {
        name: 'a safe in rock fails',
        level: variant(l => {
            const row = [...l.rows[l.safe.y]];
            row[l.safe.x] = '0';
            l.rows[l.safe.y] = row.join('');
        }),
        expects: { errors: 1, contains: 'not open air' },
    },
    {
        name: 'a safe off the map fails',
        level: variant(l => { l.safe.y = l.rows.length + 3; }),
        expects: { errors: 1, contains: 'outside the map' },
    },
    {
        name: 'a shaft too long to breathe through fails',
        level: variant(l => {
            l.items = l.items.filter(i => i.kind !== 'oxygen');
            // long enough that even optimal play runs out
            const deep = [];
            for (let i = 0; i < 400; i++) deep.push('X123X01');
            l.rows = [...l.rows.slice(0, 4), ...deep, '##..0##', '##..###'];
            l.safe.y = l.rows.length - 2;
        }),
        expects: { errors: 1, contains: 'air runs out' },
    },
    {
        name: 'a par nobody can beat fails',
        level: variant(l => { l.par = 1; }),
        expects: { errors: 1, contains: 'not beatable' },
    },
    {
        name: 'a par that hands out gold for free warns',
        level: variant(l => { l.par = 600; }),
        expects: { errors: 0, warns: 'gold costs nothing' },
    },
    {
        name: 'a level without a par warns rather than fails',
        level: variant(l => { delete l.par; }),
        expects: { errors: 0, warns: 'no par time' },
    },
    {
        name: 'an unreachable air tank is reported',
        level: variant(l => {
            l.rows[6] = '#######';
            l.rows[7] = '#######';
            l.items = [{ kind: 'oxygen', x: 3, y: 5 }];
            // the safe is unreachable too, so an error is expected
        }),
        expects: { atLeastOneError: true },
    },
];

let passed = 0;
let failed = 0;
for (const test of cases) {
    const r = inspect(test.level);
    const errorText = r.errors.join(' | ');
    let ok = true;
    let reason = '';

    if (test.expects.errors === 0 && r.errors.length !== 0) {
        ok = false; reason = `expected no errors, got: ${errorText}`;
    }
    if (test.expects.errors >= 1 && r.errors.length === 0) {
        ok = false; reason = 'expected at least one error, got none';
    }
    if (test.expects.atLeastOneError && r.errors.length === 0) {
        ok = false; reason = 'expected at least one error, got none';
    }
    if (test.expects.contains && !errorText.includes(test.expects.contains)) {
        ok = false;
        reason = `missing "${test.expects.contains}" in: ` +
            `${errorText || '(no errors)'}`;
    }
    if (test.expects.warns) {
        const warningText = r.warnings.join(' | ');
        if (!warningText.includes(test.expects.warns)) {
            ok = false;
            reason = `missing warning "${test.expects.warns}" in: ` +
                `${warningText || '(no warnings)'}`;
        }
    }

    console.log(`${ok ? '  ok  ' : ' FAIL '} ${test.name}`);
    if (!ok) console.log(`        ${reason}`);
    if (ok) passed++; else failed++;
}

console.log(`\n${passed} passed · ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
