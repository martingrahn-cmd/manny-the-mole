#!/usr/bin/env node
/**
 * Checks the campaign maps.
 *
 * The game already validates shape on load — row width, valid symbols and
 * items on empty cells — and throws when something is off. What nobody
 * checks is whether a map can actually be played: that the safe is
 * reachable, that the air lasts, and that neither start nor safe sits in
 * rock. Hand-drawn maps break quietly in exactly those ways.
 *
 *   node tools/validate-levels.mjs
 *
 * Exits with code 1 if any map fails.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAMPAIGN_LEVELS = new Function(
    `${fs.readFileSync(path.join(ROOT, 'levels.js'), 'utf8')}; return CAMPAIGN_LEVELS;`
)();

// Game timings, taken from game.js. Change them there, change them here.
const GRID_WIDTH = 7;
const AIR_MAX = 100;
const AIR_PER_SECOND = 1.2;
const AIR_PER_TANK = 20;
const WALK_PER_CELL = 0.12;   // moveCooldown
const DIG_PER_HIT = 0.105;    // DIG_RECOVERY
const XBLOCK_HP = 5;
// Dijkstra gives optimal play. A person searches, backtracks and misses
// hits, so the practical margin is measured against a fumbling player.
const FUMBLE_FACTOR = 3;

const ROCK = new Set(['#', '=']);
const DIGGABLE = new Set(['0', '1', '2', '3', 'X']);

/** Seconds to enter a cell: walk if it is empty, dig otherwise. */
function cellCost(symbol) {
    if (symbol === '.') return WALK_PER_CELL;
    if (symbol === 'X') return WALK_PER_CELL + DIG_PER_HIT * XBLOCK_HP;
    if (DIGGABLE.has(symbol)) return WALK_PER_CELL + DIG_PER_HIT;
    return Infinity;
}

/**
 * Cheapest route from a start cell to any goal cell, in seconds.
 * Dijkstra over everything that is not rock, four-neighbour, since the
 * mole can drill in all four directions and step up one block.
 */
function cheapestRoute(rows, start, goals) {
    const height = rows.length;
    const key = (x, y) => y * GRID_WIDTH + x;
    const cost = new Map([[key(start.x, start.y), 0]]);
    const queue = [{ x: start.x, y: start.y, t: 0 }];
    const goalKeys = new Set(goals.map(g => key(g.x, g.y)));

    while (queue.length > 0) {
        queue.sort((a, b) => a.t - b.t);
        const current = queue.shift();
        if (current.t > (cost.get(key(current.x, current.y)) ?? Infinity)) {
            continue;
        }
        if (goalKeys.has(key(current.x, current.y))) return current.t;

        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const x = current.x + dx;
            const y = current.y + dy;
            if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= height) continue;
            const step = cellCost(rows[y][x]);
            if (!Number.isFinite(step)) continue;
            const next = current.t + step;
            if (next < (cost.get(key(x, y)) ?? Infinity)) {
                cost.set(key(x, y), next);
                queue.push({ x, y, t: next });
            }
        }
    }
    return null;
}

/** Cells reachable at all, whatever the cost. */
function reachableCells(rows, start) {
    const height = rows.length;
    const seen = new Set([start.y * GRID_WIDTH + start.x]);
    const stack = [start];
    while (stack.length > 0) {
        const current = stack.pop();
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const x = current.x + dx;
            const y = current.y + dy;
            if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= height) continue;
            if (ROCK.has(rows[y][x])) continue;
            const k = y * GRID_WIDTH + x;
            if (seen.has(k)) continue;
            seen.add(k);
            stack.push({ x, y });
        }
    }
    return seen;
}

function safeCells(level) {
    const cells = [];
    for (let dy = 0; dy < level.safe.height; dy++) {
        for (let dx = 0; dx < level.safe.width; dx++) {
            cells.push({ x: level.safe.x + dx, y: level.safe.y + dy });
        }
    }
    return cells;
}

/**
 * Air along the way. The tanks are spread out, so rather than guess the
 * player's route we measure each stretch between refills: start to the
 * first tank, tank to tank going down, and the last tank to the safe.
 */
function airMargin(rows, level) {
    const tanks = level.items
        .filter(item => item.kind === 'oxygen')
        .map(item => ({ x: item.x, y: item.y }))
        .sort((a, b) => a.y - b.y);
    const legs = [];
    let from = { x: level.start.x, y: level.start.y };
    let air = level.start.oxygen ?? AIR_MAX;

    for (const tank of tanks) {
        const t = cheapestRoute(rows, from, [tank]);
        if (t === null) continue;          // tank behind rock, not a leg
        legs.push({
            goal: `tank ${tank.x},${tank.y}`,
            seconds: t,
            airBefore: air,
        });
        air = Math.min(AIR_MAX, air - t * AIR_PER_SECOND + AIR_PER_TANK);
        from = tank;
    }

    const last = cheapestRoute(rows, from, safeCells(level));
    if (last !== null) {
        legs.push({ goal: 'the safe', seconds: last, airBefore: air });
        air -= last * AIR_PER_SECOND;
    }

    // the same legs again, but for a player who takes detours
    let fumbling = level.start.oxygen ?? AIR_MAX;
    for (const leg of legs) {
        fumbling -= leg.seconds * FUMBLE_FACTOR * AIR_PER_SECOND;
        if (leg.goal.startsWith('tank')) {
            fumbling = Math.min(AIR_MAX, fumbling + AIR_PER_TANK);
        }
    }
    return { legs, airLeft: air, airLeftFumbling: fumbling };
}

function inspect(level) {
    const rows = level.rows;
    const height = rows.length;
    const errors = [];
    const warnings = [];

    // start and safe must sit in open air
    const startSymbol = rows[level.start.y]?.[level.start.x];
    if (startSymbol === undefined) {
        errors.push(
            `start ${level.start.x},${level.start.y} is outside the map`
        );
    } else if (startSymbol !== '.') {
        errors.push(
            `start ${level.start.x},${level.start.y} sits in ` +
            `"${startSymbol}", not open air`
        );
    }

    for (const cell of safeCells(level)) {
        const symbol = rows[cell.y]?.[cell.x];
        if (symbol === undefined) {
            errors.push(
                `the safe sticks outside the map at ${cell.x},${cell.y}`
            );
        } else if (symbol !== '.') {
            errors.push(
                `safe cell ${cell.x},${cell.y} is "${symbol}", not open air`
            );
        }
    }

    // is the safe reachable?
    const reachable = reachableCells(rows, level.start);
    const reachedSafeCells = safeCells(level)
        .filter(c => reachable.has(c.y * GRID_WIDTH + c.x));
    if (reachedSafeCells.length === 0) {
        errors.push('the safe is walled off, no route to it from the start');
    }

    let air = null;
    let bareAir = null;
    if (reachedSafeCells.length > 0) {
        air = airMargin(rows, level);
        // The margin that matters once the tanks stop being decoration:
        // what is left on arrival for a player who never detours for one.
        const direct = cheapestRoute(rows, level.start, safeCells(level));
        if (direct !== null) {
            const start = level.start.oxygen ?? AIR_MAX;
            bareAir = {
                seconds: direct,
                onArrival: start - direct * AIR_PER_SECOND,
                fumbling: start - direct * FUMBLE_FACTOR * AIR_PER_SECOND,
            };
            if (bareAir.onArrival <= 0) {
                warnings.push(
                    'the safe cannot be reached without taking a tank ' +
                    `(${bareAir.onArrival.toFixed(0)}% on arrival)`
                );
            }
        }
        if (air.airLeft <= 0) {
            errors.push(
                'air runs out before the safe even with perfect play ' +
                `(${air.airLeft.toFixed(0)}% on arrival)`
            );
        } else if (air.airLeftFumbling <= 0) {
            warnings.push(
                `a fumbling player (${FUMBLE_FACTOR}x optimal time) ` +
                `suffocates, ${air.airLeftFumbling.toFixed(0)}% at the safe`
            );
        } else if (air.airLeftFumbling < 15) {
            warnings.push(
                'thin margin for a fumbling player: ' +
                `${air.airLeftFumbling.toFixed(0)}% left`
            );
        }
        for (const leg of air.legs) {
            const spend = leg.seconds * AIR_PER_SECOND;
            if (spend > leg.airBefore) {
                errors.push(
                    `the leg to ${leg.goal} costs ${spend.toFixed(0)}% ` +
                    `but only ${leg.airBefore.toFixed(0)}% is available`
                );
            }
        }
    }

    // The gold time has to be beatable. Dijkstra assumes perfect pathing
    // and no wasted hits, so a par at or below it is unreachable by a
    // person; a par far above it hands out gold for showing up.
    if (air && Number.isFinite(level.par)) {
        const optimal = air.legs.reduce((sum, leg) => sum + leg.seconds, 0);
        if (level.par <= optimal * 1.1) {
            errors.push(
                `par ${level.par}s is not beatable — the optimal route ` +
                `alone takes ${optimal.toFixed(1)}s`
            );
        } else if (level.par > optimal * 3) {
            warnings.push(
                `par ${level.par}s is ${(level.par / optimal).toFixed(1)}x ` +
                'the optimal route, so gold costs nothing'
            );
        }
    } else if (!Number.isFinite(level.par)) {
        warnings.push('no par time, so the level awards no medals');
    }

    // items behind rock are wasted
    for (const item of level.items) {
        if (!reachable.has(item.y * GRID_WIDTH + item.x)) {
            warnings.push(
                `${item.kind} at ${item.x},${item.y} cannot be reached`
            );
        }
    }

    // unreachable pockets usually mean the map was mistyped
    let open = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            if (!ROCK.has(rows[y][x])) open++;
        }
    }
    const sealed = open - reachable.size;
    if (sealed > 6) {
        warnings.push(`${sealed} cells are sealed behind rock`);
    }

    return { errors, warnings, air, bareAir, reachable: reachable.size, open };
}

export { inspect };

// The report only runs when this file is started directly, so the test
// can import inspect() without triggering it.
const runDirect = process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (runDirect) {
    let broken = 0;
    let warned = 0;
    console.log(`Checking ${CAMPAIGN_LEVELS.length} maps\n`);

    for (const level of CAMPAIGN_LEVELS) {
        const r = inspect(level);
        const status = r.errors.length ?
            'FAIL' :
            r.warnings.length ? 'WARN' : ' OK ';
        const depth = level.safe.y - level.start.y;
        // "with tanks" is the safety net; "no tanks" is the actual squeeze
        const airText = r.air ?
            `air ${r.air.airLeft.toFixed(0)}%/` +
            `${Math.max(0, r.air.airLeftFumbling).toFixed(0)}%` +
            (r.bareAir ?
                ` · no tanks ${r.bareAir.onArrival.toFixed(0)}%/` +
                `${Math.max(0, r.bareAir.fumbling).toFixed(0)}%` :
                '') :
            'air not measured';
        const parText = r.air && Number.isFinite(level.par) ?
            ` · optimal ${
                r.air.legs.reduce((s, leg) => s + leg.seconds, 0).toFixed(0)
            }s, gold ${level.par}s` :
            '';
        console.log(
            `[${status}] ${level.number}. ${level.title} — ${depth} m · ` +
            `grade ${level.safe.difficulty} · ${airText}${parText}`
        );
        r.errors.forEach(e => console.log(`         error: ${e}`));
        r.warnings.forEach(w => console.log(`         warning: ${w}`));
        if (r.errors.length) broken++;
        else if (r.warnings.length) warned++;
    }

    console.log(
        `\n${CAMPAIGN_LEVELS.length - broken - warned} clean · ` +
        `${warned} with warnings · ${broken} failed`
    );
    process.exit(broken > 0 ? 1 : 0);
}
