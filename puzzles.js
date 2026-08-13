const MAX_PIPE_DIFFICULTY = 6;
// The first lock a player ever sees. The step is stretched hard, because
// that is the budget an actual solve spends. The opening is stretched much
// less on purpose: it is dead time before the current first moves, and a
// board where nothing moves reads as broken — which is exactly how the
// frozen version failed. Twelve seconds is long enough to look around and
// short enough to prove the thing is alive.
const TEACHING_STEP_SCALE = 10;
const TEACHING_OPENING_SCALE = 2;

// Every retry wears the lock's mechanism down: the current runs 20% slower
// per attempt, to roughly double speed at the cap. Losing never raises the
// wall — it lowers it, so a player who keeps trying always gets through,
// and the medal times stay the reason to come back and do it clean.
const PIPE_WEAR_SCALE = 1.2;
const PIPE_WEAR_CAP = 4;

const SAFE_PUZZLE_META = Object.freeze({
    pipes: {
        eyebrow: 'Fuse box',
        title: 'Restore the circuit',
        copy: 'Build a route from IN to OUT by swapping conductors — ' +
            'the current is coming down it.',
    },
    wires: {
        eyebrow: 'Detonator bank',
        title: 'Cut the right one',
        copy: 'Cut, and the tester clamps whichever terminals were right.',
    },


});

// The bank shares the block palette so a wire reads as part of the same
// world; the names are what the tester prints, not decoration.
const WIRE_COLORS = Object.freeze([
    { id: 'blue', name: 'Blue', color: '#2786e8', light: '#7dd8ff' },
    { id: 'red', name: 'Red', color: '#ed3e52', light: '#ff9a94' },
    { id: 'yellow', name: 'Yellow', color: '#f4bd21', light: '#fff29a' },
    { id: 'green', name: 'Green', color: '#38b95e', light: '#9af5a0' },
    { id: 'pink', name: 'Pink', color: '#e94fb7', light: '#ffb1e4' },
    { id: 'white', name: 'White', color: '#dbe4f2', light: '#ffffff' },
]);

// Per grade: the board, and how many cuts it allows.
//
// The tester clamps every terminal it finds in place, so each one is an
// independent search through its own colours and no terminal can ever
// need more tries than there are colours. The budget is exactly that
// number, which makes a sensibly played bank impossible to lose — the
// pressure belongs to the clock running on the level outside, not to a
// deduction the player has to hold in their head.
//
// Measured over 4000 banks a grade: 3.4 to 5.6 cuts on average, never
// more than the colour count.
const WIRE_BALANCE = Object.freeze({
    1: Object.freeze({ length: 3, colors: 4, cuts: 4 }),
    2: Object.freeze({ length: 4, colors: 4, cuts: 4 }),
    3: Object.freeze({ length: 4, colors: 5, cuts: 5 }),
    4: Object.freeze({ length: 5, colors: 5, cuts: 5 }),
    5: Object.freeze({ length: 5, colors: 6, cuts: 6 }),
    6: Object.freeze({ length: 6, colors: 6, cuts: 6 }),
});

const WIRE_TYPES = Object.freeze(['wires']);

const PIPE_BASE_CONNECTIONS = Object.freeze({
    straight: Object.freeze([false, true, false, true]),
    corner: Object.freeze([true, true, false, false]),
    tee: Object.freeze([true, true, false, true]),
    cross: Object.freeze([true, true, true, true]),
});

const PIPE_DIRECTION_NAMES = Object.freeze(['up', 'right', 'down', 'left']);

const PIPE_DIRECTION_SOURCES = Object.freeze([
    'from above',
    'from the right',
    'from below',
    'from the left',
]);

const PIPE_FLOW_BALANCE = Object.freeze({
    1: Object.freeze({
        size: 4,
        step: 3.8,
        opening: 6,
        safeLead: 2,
        welded: 0,
        startRevealed: 0.5,
        turnChance: 0,
        doubleTurnChance: 0,
    }),
    2: Object.freeze({
        size: 5,
        step: 3.8,
        opening: 8,
        safeLead: 3,
        welded: 0,
        startRevealed: 0.45,
        turnChance: 0,
        doubleTurnChance: 0,
    }),
    3: Object.freeze({
        size: 5,
        step: 4,
        opening: 9,
        safeLead: 3,
        welded: 0,
        startRevealed: 0.4,
        turnChance: 0.58,
        doubleTurnChance: 0.2,
    }),
    4: Object.freeze({
        size: 6,
        step: 5.2,
        opening: 12,
        safeLead: 4,
        welded: 2,
        startRevealed: 0.3,
        turnChance: 0.62,
        doubleTurnChance: 0.45,
    }),
    5: Object.freeze({
        size: 6,
        step: 4.8,
        opening: 13,
        safeLead: 4,
        welded: 3,
        startRevealed: 0.26,
        turnChance: 0.7,
        doubleTurnChance: 0.55,
    }),
    6: Object.freeze({
        size: 6,
        step: 5.4,
        opening: 13,
        safeLead: 3,
        welded: 2,
        startRevealed: 0.34,
        turnChance: 0,
        doubleTurnChance: 0,
        branching: true,
    }),
});

// The Lock Campaign: twenty-four designed locks on one continuous curve.
// The campaign safes used to repeat each of the six grades twice, so half
// the locks a player met were reruns. These are all distinct: entries 1-12
// interleave the old grades (the second of each old pair sits a notch
// harder than the first), and 13-24 go past anything the dig campaign
// asked — seven-wide boards, more welds, less face up, branching earlier.
//
// Each entry has a FIXED seed, so a lock is one specific board that every
// player meets identically — a designed level, chased on time. gold is the
// medal target in seconds; silver and bronze derive from it.
const LOCK_CAMPAIGN = Object.freeze([
    { lock: 1,  size: 4, step: 5.7, opening: 9,  safeLead: 2, welded: 0, startRevealed: 0.50, turnChance: 0,    doubleTurnChance: 0,    gold: 12, seed: 'lock-01' },
    { lock: 2,  size: 4, step: 5.4, opening: 9,  safeLead: 2, welded: 0, startRevealed: 0.42, turnChance: 0.30, doubleTurnChance: 0.10, gold: 13, seed: 'lock-02' },
    { lock: 3,  size: 5, step: 5.7, opening: 12, safeLead: 3, welded: 0, startRevealed: 0.45, turnChance: 0,    doubleTurnChance: 0,    gold: 15, seed: 'lock-03' },
    { lock: 4,  size: 5, step: 5.6, opening: 12, safeLead: 3, welded: 1, startRevealed: 0.40, turnChance: 0.30, doubleTurnChance: 0.10, gold: 17, seed: 'lock-04' },
    { lock: 5,  size: 5, step: 6.0, opening: 14, safeLead: 3, welded: 0, startRevealed: 0.40, turnChance: 0.58, doubleTurnChance: 0.20, gold: 17, seed: 'lock-05' },
    { lock: 6,  size: 5, step: 5.7, opening: 14, safeLead: 3, welded: 2, startRevealed: 0.34, turnChance: 0.60, doubleTurnChance: 0.30, gold: 19, seed: 'lock-06' },
    { lock: 7,  size: 6, step: 7.8, opening: 18, safeLead: 4, welded: 2, startRevealed: 0.30, turnChance: 0.62, doubleTurnChance: 0.45, gold: 22, seed: 'lock-07' },
    { lock: 8,  size: 6, step: 7.5, opening: 18, safeLead: 4, welded: 3, startRevealed: 0.28, turnChance: 0.65, doubleTurnChance: 0.50, gold: 24, seed: 'lock-08' },
    { lock: 9,  size: 6, step: 7.2, opening: 20, safeLead: 4, welded: 3, startRevealed: 0.26, turnChance: 0.70, doubleTurnChance: 0.55, gold: 25, seed: 'lock-09' },
    { lock: 10, size: 6, step: 6.9, opening: 18, safeLead: 3, welded: 4, startRevealed: 0.24, turnChance: 0.72, doubleTurnChance: 0.60, gold: 27, seed: 'lock-10' },
    { lock: 11, size: 6, step: 8.1, opening: 20, safeLead: 3, welded: 2, startRevealed: 0.34, turnChance: 0,    doubleTurnChance: 0,    branching: true, gold: 28, seed: 'lock-11' },
    { lock: 12, size: 6, step: 7.8, opening: 20, safeLead: 3, welded: 3, startRevealed: 0.30, turnChance: 0,    doubleTurnChance: 0,    branching: true, gold: 30, seed: 'lock-12' },
    { lock: 13, size: 7, step: 8.4, opening: 21, safeLead: 4, welded: 2, startRevealed: 0.32, turnChance: 0.60, doubleTurnChance: 0.40, gold: 30, seed: 'lock-13' },
    { lock: 14, size: 7, step: 8.1, opening: 21, safeLead: 4, welded: 3, startRevealed: 0.30, turnChance: 0.65, doubleTurnChance: 0.45, gold: 32, seed: 'lock-14' },
    { lock: 15, size: 6, step: 6.6, opening: 17, safeLead: 3, welded: 3, startRevealed: 0.26, turnChance: 0,    doubleTurnChance: 0,    branching: true, gold: 30, seed: 'lock-15' },
    { lock: 16, size: 7, step: 7.8, opening: 21, safeLead: 3, welded: 4, startRevealed: 0.26, turnChance: 0.70, doubleTurnChance: 0.50, gold: 34, seed: 'lock-16' },
    { lock: 17, size: 7, step: 8.4, opening: 23, safeLead: 4, welded: 3, startRevealed: 0.30, turnChance: 0,    doubleTurnChance: 0,    branching: true, gold: 36, seed: 'lock-17' },
    { lock: 18, size: 7, step: 7.5, opening: 20, safeLead: 3, welded: 4, startRevealed: 0.24, turnChance: 0.72, doubleTurnChance: 0.55, gold: 36, seed: 'lock-18' },
    { lock: 19, size: 7, step: 8.1, opening: 21, safeLead: 3, welded: 4, startRevealed: 0.26, turnChance: 0,    doubleTurnChance: 0,    branching: true, gold: 38, seed: 'lock-19' },
    { lock: 20, size: 7, step: 7.2, opening: 18, safeLead: 3, welded: 5, startRevealed: 0.22, turnChance: 0.75, doubleTurnChance: 0.60, gold: 38, seed: 'lock-20' },
    { lock: 21, size: 7, step: 7.8, opening: 20, safeLead: 3, welded: 5, startRevealed: 0.24, turnChance: 0,    doubleTurnChance: 0,    branching: true, gold: 40, seed: 'lock-21' },
    { lock: 22, size: 7, step: 6.9, opening: 18, safeLead: 2, welded: 5, startRevealed: 0.20, turnChance: 0.78, doubleTurnChance: 0.65, gold: 40, seed: 'lock-22' },
    { lock: 23, size: 7, step: 7.5, opening: 18, safeLead: 2, welded: 6, startRevealed: 0.22, turnChance: 0,    doubleTurnChance: 0,    branching: true, gold: 42, seed: 'lock-23' },
    { lock: 24, size: 7, step: 6.6, opening: 18, safeLead: 2, welded: 6, startRevealed: 0.18, turnChance: 0,    doubleTurnChance: 0,    branching: true, gold: 45, seed: 'lock-24' },
]);

const LOCK_MEDAL_SILVER = 1.6;
const LOCK_MEDAL_BRONZE = 2.4;

function lockMedal(entry, seconds) {
    if (!entry || !Number.isFinite(seconds) || seconds <= 0) return null;
    if (seconds <= entry.gold) return 'gold';
    if (seconds <= entry.gold * LOCK_MEDAL_SILVER) return 'silver';
    if (seconds <= entry.gold * LOCK_MEDAL_BRONZE) return 'bronze';
    return null;
}

// ---- The daily lock ---------------------------------------------------
// One board a day, the same for every player, because the date is the
// seed. Templates come from the middle of the campaign curve — locks 5
// through 20, past the lessons but short of the gauntlet — so a daily is
// always interesting and never a wall. The daily never touches the
// campaign chain or its bests; its currency is the streak.
const DAILY_LOCK_TEMPLATES = Object.freeze(
    LOCK_CAMPAIGN.filter(entry => entry.lock >= 5 && entry.lock <= 20)
);

function hashDailyKey(text) {
    let hash = 2166136261;
    for (const character of String(text)) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

/** Local date as 'YYYY-MM-DD' — the daily rolls at the player's midnight. */
function dailyLockDateKey(now = new Date()) {
    const pad = value => String(value).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-` +
        pad(now.getDate());
}

/** The calendar day before a date key, as a date key. */
function dailyLockKeyBefore(dateKey) {
    const [year, month, day] = String(dateKey).split('-').map(Number);
    return dailyLockDateKey(new Date(year, month - 1, day - 1));
}

function dailyLockEntry(dateKey) {
    const template = DAILY_LOCK_TEMPLATES[
        hashDailyKey(`daily:${dateKey}`) % DAILY_LOCK_TEMPLATES.length
    ];
    return { ...template, seed: `daily-${dateKey}` };
}

class SafePuzzleEngine {
    constructor() {
        this.state = null;
        this.revision = 0;
    }

    // The first lock a player ever opens gets a very slow clock rather than
    // no clock. Stopping the current outright made the puzzle unwinnable —
    // the win fires when the current reaches OUT, so a frozen current can
    // never open the safe. It also looked broken, which is its own answer
    // to how slow is too slow: the current has to visibly move, or the
    // player is back to wondering what the board is for.
    //
    // At this scale lock one opens after 18 seconds and then steps every
    // 57, against 9 and 5.7 normally.
    // balance overrides the grade table lookup with a LOCK_CAMPAIGN entry;
    // difficulty then carries the lock number (1-24) for display and bests,
    // uncapped by MAX_PIPE_DIFFICULTY, which only bounds the legacy grades.
    start(type, difficulty, seedText, { teaching = false, balance = null } = {}) {
        if (!SAFE_PUZZLE_META[type]) {
            throw new Error(`Unknown safe puzzle type: ${type}`);
        }

        const safeDifficulty = balance ?
            Math.max(1, Math.floor(difficulty)) :
            Math.max(1, Math.min(MAX_PIPE_DIFFICULTY, Math.floor(difficulty)));
        const seed = this.hashSeed(`${seedText}:${type}:${safeDifficulty}`);
        this.state = WIRE_TYPES.includes(type) ?
            this.createWiresState(type, safeDifficulty, seed) :
            this.createPipesState(safeDifficulty, seed, balance);
        this.state.lockCampaign = balance !== null;
        this.state.teaching = teaching === true;
        if (this.state.teaching && this.state.type === 'pipes') {
            this.state.flowStep *= TEACHING_STEP_SCALE;
            // flowOpening as well as flowTimer: resetting the board restores
            // the timer from it, so scaling only the timer meant "Restart
            // circuit" quietly handed back the fast six-second opening.
            this.state.flowTimer *= TEACHING_OPENING_SCALE;
            this.state.flowOpening *= TEACHING_OPENING_SCALE;
            // flowFastStep is deliberately left alone. It is the speed the
            // current runs at once the route is finished — the payoff for
            // solving it, not part of the difficulty. Stretching it turned
            // "the current races through" into half a minute of watching it
            // crawl, with the puzzle already won.
            // createPipesState writes the opening line before the flag
            // reaches the state, so it has to be recomputed here.
            this.state.status = this.getPipeOpeningStatus(this.state);
        }
        this.touch();
        return this.state;
    }

    clear() {
        this.state = null;
        this.touch();
    }

    touch() {
        this.revision++;
    }

    hashSeed(text) {
        let hash = 2166136261;
        for (const character of String(text)) {
            hash ^= character.charCodeAt(0);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    createRandom(seed) {
        let value = seed >>> 0;
        return () => {
            value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
            return value / 4294967296;
        };
    }

    createBaseState(type, difficulty) {
        return {
            type,
            difficulty,
            phase: 'ready',
            status: '',
            solved: false,
            // wall-clock spent with the board live, so a standalone run
            // has something to beat next time
            elapsed: 0,
            completionTimer: 0,
            completionReported: false,
        };
    }

    rotateConnections(connections, rotation) {
        const result = [false, false, false, false];
        connections.forEach((connected, direction) => {
            if (connected) result[(direction + rotation) % 4] = true;
        });
        return result;
    }

    getPipeConnections(cell) {
        return this.rotateConnections(
            PIPE_BASE_CONNECTIONS[cell.type],
            cell.rotation
        );
    }

    directionBetween(from, to) {
        if (to.y < from.y) return 0;
        if (to.x > from.x) return 1;
        if (to.y > from.y) return 2;
        return 3;
    }

    findPipeForDirections(directionSet) {
        for (const type of ['straight', 'corner', 'tee', 'cross']) {
            for (let rotation = 0; rotation < 4; rotation++) {
                const connections = this.rotateConnections(
                    PIPE_BASE_CONNECTIONS[type],
                    rotation
                );
                const matches = connections.every(
                    (connected, direction) =>
                        connected === directionSet.has(direction)
                );
                if (matches) return { type, rotation };
            }
        }
        return { type: 'cross', rotation: 0 };
    }

    buildPipePath(balance, difficulty, random) {
        const size = balance.size;
        const turnChance = balance.turnChance || 0;
        const doubleTurnChance = balance.doubleTurnChance || 0;
        const path = [{ x: 0, y: Math.floor(size / 2) }];
        let y = path[0].y;

        for (let x = 0; x < size - 1; x++) {
            const shouldTurn =
                (x + difficulty) % 2 === 1 ||
                random() < turnChance;
            if (shouldTurn) {
                let direction = random() < 0.5 ? -1 : 1;
                if (y <= 0) direction = 1;
                if (y >= size - 1) direction = -1;
                const rows = random() < doubleTurnChance ? 2 : 1;
                for (let step = 0; step < rows; step++) {
                    const nextY = y + direction;
                    if (nextY < 0 || nextY >= size) break;
                    y = nextY;
                    path.push({ x, y });
                }
            }
            path.push({ x: x + 1, y });
        }
        return path;
    }

    addRequired(required, size, x, y, direction) {
        const key = y * size + x;
        if (!required.has(key)) required.set(key, new Set());
        required.get(key).add(direction);
    }

    connectRequired(required, size, from, to) {
        this.addRequired(
            required, size, from.x, from.y, this.directionBetween(from, to)
        );
        this.addRequired(
            required, size, to.x, to.y, this.directionBetween(to, from)
        );
    }

    buildLinearLayout(balance, difficulty, random) {
        const size = balance.size;
        const path = this.buildPipePath(balance, difficulty, random);
        const required = new Map();
        path.forEach((position, index) => {
            const previous = index === 0 ?
                { x: -1, y: position.y } :
                path[index - 1];
            const next = index === path.length - 1 ?
                { x: size, y: position.y } :
                path[index + 1];
            this.addRequired(
                required, size, position.x, position.y,
                this.directionBetween(position, previous)
            );
            this.addRequired(
                required, size, position.x, position.y,
                this.directionBetween(position, next)
            );
        });
        return {
            required,
            order: path.map(position => position.y * size + position.x),
            sinks: [{ x: size - 1, y: path[path.length - 1].y }],
            sourceY: path[0].y,
        };
    }

    // Two outlets fed by a tee: the current splits in the trunk and each
    // branch is held to its own half so they can never cross.
    buildBranchingLayout(balance, random) {
        const size = balance.size;
        const sourceY = 2 + Math.floor(random() * 2);
        const splitX = 1 + Math.floor(random() * 2);
        const rowUp = Math.floor(random() * sourceY);
        const rowDown = sourceY + 1 +
            Math.floor(random() * (size - sourceY - 1));
        const required = new Map();
        const order = [];
        const push = (x, y) => {
            const key = y * size + x;
            if (!order.includes(key)) order.push(key);
        };

        this.addRequired(required, size, 0, sourceY, 3);
        for (let x = 0; x <= splitX; x++) push(x, sourceY);
        for (let x = 0; x < splitX; x++) {
            this.connectRequired(
                required, size,
                { x, y: sourceY }, { x: x + 1, y: sourceY }
            );
        }

        // Each branch jogs once on the way out, or it is one long straight run.
        const branch = (row, step) => {
            this.connectRequired(
                required, size,
                { x: splitX, y: sourceY }, { x: splitX, y: sourceY + step }
            );
            for (let y = sourceY + step; y !== row; y += step) {
                push(splitX, y);
                this.connectRequired(
                    required, size,
                    { x: splitX, y }, { x: splitX, y: y + step }
                );
            }
            push(splitX, row);

            const jogRow = row + step;
            const canJog =
                jogRow >= 0 &&
                jogRow < size &&
                (step < 0 ? jogRow < sourceY : jogRow > sourceY) &&
                size - 1 - splitX >= 3;
            const jogX = canJog ?
                splitX + 1 + Math.floor(random() * (size - 2 - splitX)) :
                -1;

            let y = row;
            for (let x = splitX; x < size - 1; x++) {
                if (x === jogX) {
                    this.connectRequired(
                        required, size, { x, y }, { x, y: jogRow }
                    );
                    y = jogRow;
                    push(x, y);
                }
                this.connectRequired(
                    required, size, { x, y }, { x: x + 1, y }
                );
                push(x + 1, y);
            }
            this.addRequired(required, size, size - 1, y, 1);
            return y;
        };
        const sinkUp = branch(rowUp, -1);
        const sinkDown = branch(rowDown, 1);

        return {
            required,
            order,
            sinks: [{ x: size - 1, y: sinkUp }, { x: size - 1, y: sinkDown }],
            sourceY,
        };
    }

    createPipesState(difficulty, seed, balanceOverride = null) {
        const random = this.createRandom(seed);
        const balance = balanceOverride ?? PIPE_FLOW_BALANCE[difficulty];
        const size = balance.size;
        const layout = balance.branching ?
            this.buildBranchingLayout(balance, random) :
            this.buildLinearLayout(balance, difficulty, random);
        const path = layout.order.map(index => ({
            x: index % size,
            y: Math.floor(index / size),
        }));
        const cells = [];

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const required = layout.required.get(y * size + x);
                if (required !== undefined) {
                    const pipe = this.findPipeForDirections(required);
                    cells.push({
                        id: `pipe-${y * size + x}`,
                        type: pipe.type,
                        rotation: pipe.rotation,
                        path: true,
                        solutionIndex: y * size + x,
                        revealed: false,
                    });
                } else {
                    const type = random() < 0.5 ? 'corner' : 'straight';
                    const rotation = Math.floor(random() * 4);
                    cells.push({
                        id: `pipe-${y * size + x}`,
                        type,
                        rotation,
                        path: false,
                        solutionIndex: y * size + x,
                        revealed: false,
                    });
                }
            }
        }

        for (let index = cells.length - 1; index > 0; index--) {
            const swapIndex = Math.floor(random() * (index + 1));
            [cells[index], cells[swapIndex]] =
                [cells[swapIndex], cells[index]];
        }

        const placeCorrectPipe = targetIndex => {
            const correctPipeIndex = cells.findIndex(
                cell => cell.solutionIndex === targetIndex
            );
            [cells[targetIndex], cells[correctPipeIndex]] =
                [cells[correctPipeIndex], cells[targetIndex]];
            return cells[targetIndex];
        };

        const safeLead = Math.max(1, balance.safeLead || 1);
        path.slice(0, safeLead).forEach(position => {
            placeCorrectPipe(position.y * size + position.x);
        });

        // Welded conductors sit correct but cannot be moved, so the route is
        // built between given anchors instead of from nothing.
        const weldCount = Math.min(
            balance.welded || 0,
            Math.max(0, path.length - safeLead - 1)
        );
        const weldable = path.slice(safeLead, path.length - 1);
        for (let slot = 0; slot < weldCount; slot++) {
            const spread = Math.floor(
                ((slot + 1) * weldable.length) / (weldCount + 1)
            );
            const position = weldable[Math.min(spread, weldable.length - 1)];
            if (!position) continue;
            const cell = placeCorrectPipe(position.y * size + position.x);
            cell.welded = true;
        }

        const sourceIndex = path[0].y * size;
        cells.forEach((cell, index) => {
            cell.initialIndex = index;
            cell.revealed = index === sourceIndex;
            cell.initialRevealed = index === sourceIndex;
        });

        const openFaceUp = Math.round(
            (cells.length - 1) * (balance.startRevealed || 0)
        );
        const candidates = cells
            .map((cell, index) => index)
            .filter(index => index !== sourceIndex);
        for (let index = candidates.length - 1; index > 0; index--) {
            const swapIndex = Math.floor(random() * (index + 1));
            [candidates[index], candidates[swapIndex]] =
                [candidates[swapIndex], candidates[index]];
        }
        candidates.slice(0, openFaceUp).forEach(index => {
            cells[index].revealed = true;
            cells[index].initialRevealed = true;
        });
        // A welded conductor is only an anchor if you can see it.
        cells.forEach(cell => {
            if (!cell.welded) return;
            cell.revealed = true;
            cell.initialRevealed = true;
        });

        const state = {
            ...this.createBaseState('pipes', difficulty),
            phase: 'active',
            status: '',
            size,
            cells,
            path,
            sourceY: layout.sourceY,
            sinks: layout.sinks.map(sink => sink.y * size + sink.x),
            sinkY: layout.sinks[0].y,
            branching: balance.branching === true,
            poweredSinks: new Set(),
            connected: new Set(),
            filled: new Set(),
            moves: 0,
            anchors: cells
                .map((cell, index) => (cell.welded ? index : -1))
                .filter(index => index >= 0),
            reveals: cells.filter(cell => cell.revealed).length,
            selectedIndex: null,
            flowPhase: 'flowing',
            flowStep: balance.step,
            flowOpening: balance.opening,
            flowFastStep: 0.45,
            flowFastForward: false,
            flowInterval: balance.opening,
            flowTimer: balance.opening,
            heads: [{ index: sourceIndex, incoming: 3 }],
            trail: [],
            flowBlockedIndex: null,
            flowBlockedReason: 'break',
            flowVersion: 0,
            timedOut: false,
        };
        this.refreshPipeFastForward(state);
        this.advancePipeFlow(state);
        state.status = this.getPipeOpeningStatus(state);
        return state;
    }

    getPipeProgressStatus(state) {
        const remaining = state.anchors.filter(
            anchor => !state.filled.has(anchor)
        ).length;
        const outletsLeft = state.sinks.length - state.poweredSinks.size;
        if (state.sinks.length > 1 && remaining === 0) {
            return `${state.filled.size} conductors live · ` +
                `${outletsLeft} of ${state.sinks.length} outlets still to feed.`;
        }
        if (remaining > 0) {
            return `${state.filled.size} conductors live · ` +
                `${remaining} welded point${remaining === 1 ? '' : 's'} ` +
                'still to pass.';
        }
        return `Current moving · ${state.filled.size} conductor` +
            `${state.filled.size === 1 ? '' : 's'} live. ` +
            'Keep building ahead of it!';
    }

    getPipeOpeningStatus(state) {
        // Boards with welds say so up front — the welded conductor is the
        // one rule the board cannot show by being tapped at.
        const weldNote = state.anchors?.length ?
            ' The gold conductors are welded in — route through them.' :
            '';
        if (state.teaching) {
            return 'The current is barely creeping on this one. ' +
                'Take your time.' + weldNote;
        }
        return state.flowFastForward ?
            'The route to OUT is already open — the current races through!' :
            'The current is holding in the first conductor — ' +
            'uncover a few tiles before it moves.' + weldNote;
    }

    getActivePipeStep(state = this.state) {
        if (!state || state.type !== 'pipes') return 1;
        return state.flowFastForward ?
            state.flowFastStep :
            state.flowStep;
    }

    isPipeRouteComplete(state = this.state) {
        if (!state || state.type !== 'pipes') return false;

        const steps = [
            { x: 0, y: -1 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
            { x: -1, y: 0 },
        ];
        let heads = [{
            index: state.sourceY * state.size,
            incoming: 3,
        }];
        const visited = new Set();
        const reached = new Set();

        for (let pass = 0; pass < state.cells.length && heads.length; pass++) {
            const next = [];
            for (const head of heads) {
                if (visited.has(head.index)) return false;
                visited.add(head.index);
                const connections = this.getPipeConnections(
                    state.cells[head.index]
                );
                if (!connections[head.incoming]) return false;
                const exits = connections
                    .map((connected, direction) =>
                        connected && direction !== head.incoming ?
                            direction :
                            null
                    )
                    .filter(direction => direction !== null);
                if (exits.length === 0) return false;
                if (exits.length > 1 && !state.branching) return false;

                const x = head.index % state.size;
                const y = Math.floor(head.index / state.size);
                for (const outgoing of exits) {
                    if (
                        x === state.size - 1 &&
                        outgoing === 1 &&
                        state.sinks.includes(head.index)
                    ) {
                        reached.add(head.index);
                        continue;
                    }
                    const nextX = x + steps[outgoing].x;
                    const nextY = y + steps[outgoing].y;
                    if (
                        nextX < 0 ||
                        nextX >= state.size ||
                        nextY < 0 ||
                        nextY >= state.size
                    ) return false;
                    next.push({
                        index: nextY * state.size + nextX,
                        incoming: (outgoing + 2) % 4,
                    });
                }
            }
            heads = next;
        }

        if (heads.length > 0) return false;
        if (reached.size !== state.sinks.length) return false;
        return state.anchors.every(anchor => visited.has(anchor));
    }

    refreshPipeFastForward(state = this.state) {
        if (!state || state.type !== 'pipes') return false;
        const routeComplete = this.isPipeRouteComplete(state);
        state.flowFastForward = routeComplete;
        if (routeComplete) {
            state.flowTimer = Math.min(
                state.flowTimer,
                state.flowFastStep
            );
            state.flowInterval = Math.min(
                state.flowInterval,
                state.flowFastStep
            );
        }
        return routeComplete;
    }

    failPipeFlow(state, message, blockedIndex = null, reason = 'break') {
        state.phase = 'failed';
        state.flowBlockedReason = reason;
        state.flowPhase = 'failed';
        state.timedOut = true;
        state.flowBlockedIndex = blockedIndex === null ?
            (state.heads[0]?.index ?? null) :
            blockedIndex;
        state.heads = [];
        state.selectedIndex = null;
        state.status = message;
        state.flowVersion++;
        this.touch();
        return false;
    }

    advancePipeFlow(state = this.state) {
        if (
            !state ||
            state.type !== 'pipes' ||
            state.phase !== 'active' ||
            state.flowPhase !== 'flowing'
        ) return false;

        const steps = [
            { x: 0, y: -1 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
            { x: -1, y: 0 },
        ];
        const trail = [];
        const nextHeads = [];
        const visited = new Set();

        for (const head of state.heads) {
            const index = head.index;
            if (
                !Number.isInteger(index) ||
                index < 0 ||
                index >= state.cells.length ||
                state.filled.has(index) ||
                visited.has(index)
            ) {
                return this.failPipeFlow(
                    state,
                    'The current looped back and the circuit overloaded.',
                    index
                );
            }
            visited.add(index);

            const cell = state.cells[index];
            cell.revealed = true;
            const connections = this.getPipeConnections(cell);
            if (!connections[head.incoming]) {
                return this.failPipeFlow(
                    state,
                    'The current hit a broken conductor. The circuit tripped.',
                    index
                );
            }

            const exits = connections
                .map((connected, direction) =>
                    connected && direction !== head.incoming ?
                        direction :
                        null
                )
                .filter(direction => direction !== null);
            if (exits.length === 0) {
                return this.failPipeFlow(
                    state,
                    'The current hit a dead end. The circuit tripped.',
                    index
                );
            }
            if (exits.length > 1 && !state.branching) {
                return this.failPipeFlow(
                    state,
                    'The current hit a dead end. The circuit tripped.',
                    index
                );
            }

            state.filled.add(index);
            trail.push({ index, incoming: head.incoming, outgoings: exits });
            if (state.selectedIndex === index) state.selectedIndex = null;

            const x = index % state.size;
            const y = Math.floor(index / state.size);
            for (const outgoing of exits) {
                if (
                    x === state.size - 1 &&
                    outgoing === 1 &&
                    state.sinks.includes(index)
                ) {
                    state.poweredSinks.add(index);
                    continue;
                }
                const nextX = x + steps[outgoing].x;
                const nextY = y + steps[outgoing].y;
                if (
                    nextX < 0 ||
                    nextX >= state.size ||
                    nextY < 0 ||
                    nextY >= state.size
                ) {
                    return this.failPipeFlow(
                        state,
                        'The current left the board. The circuit tripped.',
                        index
                    );
                }
                nextHeads.push({
                    index: nextY * state.size + nextX,
                    incoming: (outgoing + 2) % 4,
                });
            }
        }

        state.connected = new Set(state.filled);
        state.trail = trail;
        state.heads = nextHeads;
        state.flowBlockedIndex = null;
        state.flowVersion++;

        if (nextHeads.length === 0) {
            const unfed = state.sinks.filter(
                sink => !state.poweredSinks.has(sink)
            );
            if (unfed.length > 0) {
                return this.failPipeFlow(
                    state,
                    `The current fed only ${state.poweredSinks.size} of ` +
                    `${state.sinks.length} outlets. The circuit failed.`,
                    unfed[0],
                    'sink'
                );
            }
            const missed = state.anchors.filter(
                anchor => !state.filled.has(anchor)
            );
            if (missed.length > 0) {
                return this.failPipeFlow(
                    state,
                    `The current reached OUT but skipped ${missed.length} ` +
                    `${missed.length === 1 ?
                        'welded point' :
                        'welded points'}. The circuit failed.`,
                    missed[0],
                    'anchor'
                );
            }
            this.markSolved(
                `The current reached ${state.sinks.length > 1 ? 'both outlets' : 'OUT'} ` +
                `after ${state.moves} swaps and ` +
                `${state.reveals} conductors uncovered!`
            );
            return true;
        }

        state.status = state.flowFastForward ?
            'The route to OUT is open — the current races through the circuit!' :
            this.getPipeProgressStatus(state);
        this.touch();
        return true;
    }

    getPipeFlowPresentation(state = this.state, reducedMotion = false) {
        const empty = {
            visible: new Set(),
            leading: new Set(),
            blocked: new Set(),
            trail: [],
            frame: 'empty',
            pulsed: false,
        };
        if (!state || state.type !== 'pipes') return empty;
        const activeStep = state.flowInterval ||
            this.getActivePipeStep(state);
        const progress = state.solved || state.flowPhase === 'failed' ?
            1 :
            state.flowPhase === 'flowing' ?
            Math.max(0, Math.min(1, 1 - state.flowTimer / activeStep)) :
            1;
        const trail = state.trail || [];
        const visible = new Set(state.filled);
        if (state.flowPhase === 'flowing' && !state.solved) {
            trail.forEach(entry => visible.delete(entry.index));
        }
        return {
            visible,
            leading: new Set(trail.map(entry => entry.index)),
            blocked: state.flowBlockedIndex === null ?
                new Set() :
                new Set([state.flowBlockedIndex]),
            trail,
            frame: `${state.flowPhase}:${state.flowVersion}`,
            pulsed: false,
            progress: reducedMotion ?
                Math.round(progress * 4) / 4 :
                progress,
        };
    }

    interactPipe(value) {
        const state = this.state;
        const index = Number(value);
        if (
            !state ||
            state.type !== 'pipes' ||
            state.solved ||
            state.phase !== 'active' ||
            !Number.isInteger(index) ||
            index < 0 ||
            index >= state.cells.length
        ) return false;

        if (state.filled.has(index)) {
            state.status =
                'That conductor is already live and can no longer be moved.';
            this.touch();
            return true;
        }

        const cell = state.cells[index];
        if (cell.welded) {
            // Both facts in one line, because a play test showed the old
            // message taught neither: the cell cannot move, AND the route
            // is required to pass through it. The tick lets the UI shake
            // the cell and the sound bench answer with a clank, so the
            // refusal is felt, not just printed.
            state.status = 'Welded solid — it cannot move, and the ' +
                'current must pass through it.';
            state.refusedIndex = index;
            state.refusalTick = (state.refusalTick || 0) + 1;
            this.touch();
            return true;
        }

        if (!cell.revealed) {
            cell.revealed = true;
            state.reveals++;
            state.status =
                `Uncovered: ${state.reveals}/${state.cells.length}. ` +
                'Mark two uncovered conductors to swap them.';
            this.touch();
            return true;
        }

        if (state.selectedIndex === null) {
            state.selectedIndex = index;
            state.status =
                'Conductor marked. Pick another uncovered one to swap with.';
            this.touch();
            return true;
        }

        if (state.selectedIndex === index) {
            state.selectedIndex = null;
            state.status = 'Selection cleared.';
            this.touch();
            return true;
        }

        if (state.filled.has(state.selectedIndex)) {
            state.selectedIndex = null;
            state.status =
                'The marked conductor went live first. Pick another.';
            this.touch();
            return true;
        }

        [
            state.cells[state.selectedIndex],
            state.cells[index],
        ] = [
            state.cells[index],
            state.cells[state.selectedIndex],
        ];
        state.moves++;
        state.selectedIndex = null;
        const routeComplete = this.refreshPipeFastForward(state);
        state.status = routeComplete ?
            'The circuit reaches OUT! The current races through it.' :
            `${state.moves} swap${state.moves === 1 ? '' : 's'} · ` +
            'keep building ahead of the advancing current.';
        this.touch();
        return true;
    }

    resetPipes() {
        const state = this.state;
        if (!state || state.type !== 'pipes' || state.solved) return false;
        // Wear compounds on the current values, so it stacks the same way
        // on top of a teaching-scaled clock as on a normal one.
        if ((state.wear || 0) < PIPE_WEAR_CAP) {
            state.wear = (state.wear || 0) + 1;
            state.flowStep *= PIPE_WEAR_SCALE;
            state.flowOpening *= PIPE_WEAR_SCALE;
        }
        state.cells.sort((first, second) =>
            first.initialIndex - second.initialIndex
        );
        state.cells.forEach(cell => {
            cell.revealed = cell.initialRevealed;
        });
        state.phase = 'active';
        state.flowPhase = 'flowing';
        state.flowInterval = state.flowOpening;
        state.flowTimer = state.flowOpening;
        state.flowFastForward = false;
        state.heads = [{ index: state.sourceY * state.size, incoming: 3 }];
        state.trail = [];
        state.poweredSinks = new Set();
        state.flowBlockedIndex = null;
        state.flowBlockedReason = 'break';
        state.flowVersion++;
        state.filled = new Set();
        state.connected = new Set();
        state.moves = 0;
        state.reveals = state.cells.filter(cell => cell.revealed).length;
        state.selectedIndex = null;
        state.timedOut = false;
        this.refreshPipeFastForward(state);
        this.advancePipeFlow(state);
        state.status = this.getPipeOpeningStatus(state);
        if (state.wear > 0) {
            const slower = Math.round(
                (Math.pow(PIPE_WEAR_SCALE, state.wear) - 1) * 100
            );
            state.status = `Attempt ${state.wear + 1} — the mechanism is ` +
                `wearing down. The current takes ${slower}% longer now` +
                (state.wear >= PIPE_WEAR_CAP ?
                    ', as slow as it gets.' :
                    '.');
        }
        return true;
    }

    getPipeLabel(index) {
        const state = this.state;
        if (!state || state.type !== 'pipes') return 'Conductor';
        const cell = state.cells[index];
        const row = Math.floor(index / state.size) + 1;
        const column = index % state.size + 1;
        if (!cell.revealed && !state.filled.has(index)) {
            return `Hidden plate, row ${row}, column ${column}. Uncover.`;
        }
        const connections = this.getPipeConnections(cell)
            .map((connected, direction) =>
                connected ? PIPE_DIRECTION_NAMES[direction] : null
            )
            .filter(Boolean)
            .join(' and ');
        const stateLabel = state.flowBlockedIndex === index ?
            (state.flowBlockedReason === 'anchor' ?
                'Missed weld — the current never came through here.' :
                'The circuit broke here — the current came in ' +
                `${PIPE_DIRECTION_SOURCES[state.flowIncoming]}.`) :
            cell.welded ?
                'Welded — fixed in place.' :
            state.filled.has(index) ?
                'Live and locked.' :
                state.selectedIndex === index ?
                    'Marked for swapping.' :
                    'Select to swap.';
        return `Conductor row ${row}, column ${column}. ` +
            `Open ${connections}. ${stateLabel}`;
    }

    // — the wire bank —
    //
    // One hidden arrangement. Cut, and every terminal that was right is
    // clamped and stops moving; the rest stay live. That turns the bank
    // into a handful of small independent searches rather than one piece
    // of combinatorial reasoning, which is the whole point: this sits in
    // a game about digging, not a game about deduction.

    createWiresState(type, difficulty, seed) {
        const random = this.createRandom(seed);
        const balance = WIRE_BALANCE[difficulty];
        const palette = WIRE_COLORS.slice(0, balance.colors);
        const answer = Array.from(
            { length: balance.length },
            () => Math.floor(random() * palette.length)
        );

        return {
            ...this.createBaseState(type, difficulty),
            phase: 'active',
            palette,
            answer,
            bank: Array.from({ length: balance.length }, () => 0),
            // a clamped terminal is settled and can no longer be dialled
            clamped: Array.from({ length: balance.length }, () => false),
            selected: 0,
            attempts: [],
            // the bank as it was when last cut, so an unchanged bank
            // cannot burn another cut for no information
            lastCut: null,
            cutsLeft: balance.cuts,
            status: `${balance.length} terminals · ${balance.cuts} cuts`,
        };
    }

    /** Which terminals sat in place, and how many. */
    scoreWireCut(bank, answer) {
        const hits = bank.map((value, index) => value === answer[index]);
        return { hits, exact: hits.filter(Boolean).length };
    }

    cycleWire(rawIndex) {
        const state = this.state;
        if (!state || state.solved || state.phase !== 'active') return false;
        const index = Number(rawIndex);
        if (!Number.isInteger(index) || !(index in state.bank)) return false;
        if (state.clamped[index]) return false;
        state.bank[index] = (state.bank[index] + 1) % state.palette.length;
        state.selected = index;
        this.touch();
        return true;
    }

    /** A cut only means something if the bank moved since the last one. */
    canCutWires(state = this.state) {
        if (!state || state.solved || state.phase !== 'active') return false;
        if (!state.lastCut) return true;
        return state.bank.some((value, i) => value !== state.lastCut[i]);
    }

    cutWires() {
        const state = this.state;
        if (!this.canCutWires(state)) return false;

        const score = this.scoreWireCut(state.bank, state.answer);
        score.hits.forEach((hit, index) => {
            if (hit) state.clamped[index] = true;
        });
        state.attempts.push({ bank: [...state.bank], hits: [...score.hits] });
        state.lastCut = [...state.bank];

        if (score.exact === state.answer.length) {
            this.markSolved('The bank goes dead. It opens.');
            return true;
        }

        state.cutsLeft--;
        if (state.cutsLeft <= 0) {
            return this.failWires('Out of cuts. The bank locks.');
        }

        const clamped = state.clamped.filter(Boolean).length;
        state.status = clamped === 0 ?
            'Nothing held. Change the bank and cut again.' :
            `${clamped} of ${state.answer.length} clamped.`;
        this.touch();
        return true;
    }

    failWires(message) {
        const state = this.state;
        state.phase = 'failed';
        state.status = message;
        this.touch();
        return true;
    }

    resetWires() {
        const state = this.state;
        if (!state) return false;
        const balance = WIRE_BALANCE[state.difficulty];
        state.phase = 'active';
        state.bank = state.bank.map(() => 0);
        state.clamped = state.clamped.map(() => false);
        state.attempts = [];
        state.lastCut = null;
        state.cutsLeft = balance.cuts;
        state.status = `${balance.length} terminals · ${balance.cuts} cuts`;
        this.touch();
        return true;
    }

    action(action, value) {
        if (!this.state || this.state.solved) return false;
        if (action === 'puzzle-pipe') return this.interactPipe(value);
        if (action === 'puzzle-wire') return this.cycleWire(value);
        if (action === 'puzzle-cut') return this.cutWires();
        if (action === 'puzzle-reset') {
            return WIRE_TYPES.includes(this.state.type) ?
                this.resetWires() :
                this.resetPipes();
        }
        return false;
    }

    markSolved(message) {
        const state = this.state;
        if (!state || state.solved) return;
        state.solved = true;
        state.phase = 'solved';
        state.status = message;
        state.completionTimer = 0.8;
        this.touch();
    }

    update(deltaTime) {
        const state = this.state;
        if (!state) return false;
        const elapsed = Number.isFinite(deltaTime) ?
            Math.max(0, deltaTime) :
            0;
        if (state.phase === 'active' && !state.solved) state.elapsed += elapsed;

        if (
            state.type === 'pipes' &&
            state.phase === 'active' &&
            !state.solved
        ) {
            state.flowTimer -= elapsed;
            let advances = 0;
            while (
                state.flowPhase === 'flowing' &&
                state.phase === 'active' &&
                state.flowTimer <= 0 &&
                advances < 8
            ) {
                state.flowInterval = this.getActivePipeStep(state);
                state.flowTimer += state.flowInterval;
                this.advancePipeFlow(state);
                advances++;
            }
        }

        if (!state.solved || state.completionReported) return false;
        state.completionTimer = Math.max(
            0,
            state.completionTimer - elapsed
        );
        if (state.completionTimer > 0) return false;
        state.completionReported = true;
        return true;
    }
}

globalThis.SafePuzzleEngine = SafePuzzleEngine;
globalThis.SAFE_PUZZLE_META = SAFE_PUZZLE_META;
globalThis.MAX_PIPE_DIFFICULTY = MAX_PIPE_DIFFICULTY;
globalThis.WIRE_COLORS = WIRE_COLORS;
globalThis.WIRE_TYPES = WIRE_TYPES;
globalThis.WIRE_BALANCE = WIRE_BALANCE;
