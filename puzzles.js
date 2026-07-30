const SAFE_PUZZLE_META = Object.freeze({
    keypad: {
        eyebrow: 'Minneslås',
        title: 'Återskapa koden',
        copy: 'Studera sifferföljden och slå sedan in samma kod.',
    },
    dial: {
        eyebrow: 'Mekaniskt lås',
        title: 'Fånga stiften',
        copy: 'Stoppa visaren i den gröna zonen för varje låsstift.',
    },
    pipes: {
        eyebrow: 'Säkringscentral',
        title: 'Återställ kretsen',
        copy: 'Avtäck och byt ledare innan strömmen hinner ikapp dig.',
    },
});

const PIPE_BASE_CONNECTIONS = Object.freeze({
    straight: Object.freeze([false, true, false, true]),
    corner: Object.freeze([true, true, false, false]),
    tee: Object.freeze([true, true, false, true]),
    cross: Object.freeze([true, true, true, true]),
});

const PIPE_DIRECTION_NAMES = Object.freeze(['upp', 'höger', 'ned', 'vänster']);

const PIPE_DIRECTION_SOURCES = Object.freeze([
    'uppifrån',
    'från höger',
    'nedifrån',
    'från vänster',
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

const DIAL_BALANCE = Object.freeze({
    1: Object.freeze({ baseSpeed: 124, speedStep: 30, targetWidth: 32 }),
    2: Object.freeze({ baseSpeed: 148, speedStep: 36, targetWidth: 26 }),
    3: Object.freeze({ baseSpeed: 150, speedStep: 24, targetWidth: 24 }),
});

class SafePuzzleEngine {
    constructor() {
        this.state = null;
        this.revision = 0;
    }

    start(type, difficulty, seedText) {
        if (!SAFE_PUZZLE_META[type]) {
            throw new Error(`Unknown safe puzzle type: ${type}`);
        }

        const maximumDifficulty = type === 'pipes' ? 6 : 3;
        const safeDifficulty = Math.max(
            1,
            Math.min(maximumDifficulty, Math.floor(difficulty))
        );
        const seed = this.hashSeed(`${seedText}:${type}:${safeDifficulty}`);
        if (type === 'keypad') {
            this.state = this.createKeypadState(safeDifficulty, seed);
        } else if (type === 'dial') {
            this.state = this.createDialState(safeDifficulty, seed);
        } else {
            this.state = this.createPipesState(safeDifficulty, seed);
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
            completionTimer: 0,
            completionReported: false,
        };
    }

    createKeypadState(difficulty, seed) {
        const random = this.createRandom(seed);
        const length = 2 + difficulty;
        const code = [];
        while (code.length < length) {
            const digit = Math.floor(random() * 10);
            if (digit !== code[code.length - 1]) code.push(digit);
        }

        return {
            ...this.createBaseState('keypad', difficulty),
            status: `Minns ${length} siffror. Tryck ”Visa koden” när du är redo.`,
            code,
            input: [],
            shownDigit: null,
            playbackIndex: 0,
            playbackLit: false,
            playbackTimer: 0,
            misses: 0,
        };
    }

    beginKeypadPlayback() {
        const state = this.state;
        if (!state || state.type !== 'keypad' || state.solved) return false;

        state.phase = 'watch';
        state.input = [];
        state.playbackIndex = 0;
        state.playbackLit = true;
        state.shownDigit = state.code[0];
        state.playbackTimer = 0.62;
        state.status = 'Titta noga …';
        this.touch();
        return true;
    }

    pressKeypadDigit(value) {
        const state = this.state;
        const digit = Number(value);
        if (
            !state ||
            state.type !== 'keypad' ||
            state.phase !== 'input' ||
            !Number.isInteger(digit) ||
            digit < 0 ||
            digit > 9
        ) return false;

        const expected = state.code[state.input.length];
        if (digit !== expected) {
            state.misses++;
            state.input = [];
            state.phase = 'ready';
            state.status = 'Fel siffra. Koden är oförändrad — visa den igen.';
            this.touch();
            return true;
        }

        state.input.push(digit);
        if (state.input.length === state.code.length) {
            this.markSolved('Koden godkänd. Låskolvarna släpper!');
        } else {
            const remaining = state.code.length - state.input.length;
            state.status = `Rätt · ${remaining} ${
                remaining === 1 ? 'siffra' : 'siffror'
            } kvar.`;
            this.touch();
        }
        return true;
    }

    createDialState(difficulty, seed) {
        const random = this.createRandom(seed);
        const targetCount = 1 + difficulty;
        const { baseSpeed, speedStep, targetWidth } =
            DIAL_BALANCE[difficulty];
        const targets = [];
        let attempts = 0;
        while (targets.length < targetCount && attempts < 200) {
            attempts++;
            const candidate = 36 + Math.floor(random() * 288);
            if (targets.every(target => Math.abs(target - candidate) >= 44)) {
                targets.push(candidate);
            }
        }
        while (targets.length < targetCount) {
            targets.push(45 + targets.length * (270 / targetCount));
        }

        return {
            ...this.createBaseState('dial', difficulty),
            status: `Tryck ”Starta ratt” för att fånga ${targetCount} stift.`,
            targets,
            lockIndex: 0,
            angle: 8,
            direction: 1,
            baseSpeed,
            speedStep,
            speed: baseSpeed,
            targetWidth,
            misses: 0,
        };
    }

    startDial() {
        const state = this.state;
        if (!state || state.type !== 'dial' || state.solved) return false;
        state.phase = 'active';
        state.status =
            `Stift ${state.lockIndex + 1} av ${state.targets.length} · ` +
            `ratten går i ${Math.round(state.speed)}°/s. Tryck i grönt.`;
        this.touch();
        return true;
    }

    hitDial() {
        const state = this.state;
        if (!state || state.type !== 'dial' || state.phase !== 'active') {
            return false;
        }

        const target = state.targets[state.lockIndex];
        const rawDelta = Math.abs(state.angle - target);
        const delta = Math.min(rawDelta, 360 - rawDelta);
        if (delta <= state.targetWidth / 2) {
            state.lockIndex++;
            if (state.lockIndex >= state.targets.length) {
                this.markSolved('Alla stift sitter. Ratten låser upp!');
            } else {
                state.direction *= -1;
                state.speed =
                    state.baseSpeed + state.lockIndex * state.speedStep;
                state.status =
                    `Stift ${state.lockIndex} satt · ratten accelererar till ` +
                    `${Math.round(state.speed)}°/s. Nästa är ${
                        state.lockIndex + 1
                    } av ${state.targets.length}.`;
                this.touch();
            }
        } else {
            state.misses++;
            state.lockIndex = 0;
            state.direction *= -1;
            state.speed = state.baseSpeed;
            state.status =
                `Miss! Stiften återställdes och ratten går åter i ` +
                `${Math.round(state.speed)}°/s.`;
            this.touch();
        }
        return true;
    }

    nudgeDial(value) {
        const state = this.state;
        const amount = Number(value);
        if (
            !state ||
            state.type !== 'dial' ||
            state.phase !== 'active' ||
            !Number.isFinite(amount)
        ) return false;
        state.angle = (state.angle + amount + 360) % 360;
        this.touch();
        return true;
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

    // Två utgångar som matas av ett T-kors: strömmen delar sig i stammen och
    // grenarna hålls i var sin halva så de aldrig kan korsa varandra.
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

        // Grenen kröker en gång på vägen ut, annars blir den en lång raksträcka.
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
            const kanKröka =
                jogRow >= 0 &&
                jogRow < size &&
                (step < 0 ? jogRow < sourceY : jogRow > sourceY) &&
                size - 1 - splitX >= 3;
            const jogX = kanKröka ?
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

    createPipesState(difficulty, seed) {
        const random = this.createRandom(seed);
        const balance = PIPE_FLOW_BALANCE[difficulty];
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

        // Fastsvetsade ledare sitter rätt men går inte att flytta, så banan
        // byggs mellan givna ankare i stället för från ingenting.
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
        // En fastsvetsad ledare är ett ankare bara om man ser den.
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
        const kvar = state.anchors.filter(
            anchor => !state.filled.has(anchor)
        ).length;
        const utKvar = state.sinks.length - state.poweredSinks.size;
        if (state.sinks.length > 1 && kvar === 0) {
            return `${state.filled.size} ledare strömsatta · ` +
                `${utKvar} av ${state.sinks.length} utgångar kvar att mata.`;
        }
        if (kvar > 0) {
            return `${state.filled.size} ledare strömsatta · ` +
                `${kvar} fastsvetsad${kvar === 1 ? '' : 'e'} punkt` +
                `${kvar === 1 ? '' : 'er'} kvar att passera.`;
        }
        return `Strömmen rör sig · ${state.filled.size} ledare ` +
            `${state.filled.size === 1 ? 'strömsatt' : 'strömsatta'}. ` +
            'Bygg vidare framför den!';
    }

    getPipeOpeningStatus(state) {
        return state.flowFastForward ?
            'Vägen till UT är redan klar — strömmen spolas igenom!' :
            'Strömmen dröjer kvar i första ledaren — ' +
            'avtäck några brickor innan den rör sig.';
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
        let huvuden = [{
            index: state.sourceY * state.size,
            incoming: 3,
        }];
        const besökta = new Set();
        const nådda = new Set();

        for (let varv = 0; varv < state.cells.length && huvuden.length; varv++) {
            const nästa = [];
            for (const head of huvuden) {
                if (besökta.has(head.index)) return false;
                besökta.add(head.index);
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
                        nådda.add(head.index);
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
                    nästa.push({
                        index: nextY * state.size + nextX,
                        incoming: (outgoing + 2) % 4,
                    });
                }
            }
            huvuden = nästa;
        }

        if (huvuden.length > 0) return false;
        if (nådda.size !== state.sinks.length) return false;
        return state.anchors.every(anchor => besökta.has(anchor));
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
        const nästaHuvuden = [];
        const besökta = new Set();

        for (const head of state.heads) {
            const index = head.index;
            if (
                !Number.isInteger(index) ||
                index < 0 ||
                index >= state.cells.length ||
                state.filled.has(index) ||
                besökta.has(index)
            ) {
                return this.failPipeFlow(
                    state,
                    'Strömmen gick i en slinga och kretsen överbelastades.',
                    index
                );
            }
            besökta.add(index);

            const cell = state.cells[index];
            cell.revealed = true;
            const connections = this.getPipeConnections(cell);
            if (!connections[head.incoming]) {
                return this.failPipeFlow(
                    state,
                    'Strömmen nådde en bruten ledare. Kretsen slog ifrån.',
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
                    'Strömmen nådde en återvändsgränd. Kretsen slog ifrån.',
                    index
                );
            }
            if (exits.length > 1 && !state.branching) {
                return this.failPipeFlow(
                    state,
                    'Strömmen nådde en återvändsgränd. Kretsen slog ifrån.',
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
                        'Strömmen lämnade kretskortet. Kretsen slog ifrån.',
                        index
                    );
                }
                nästaHuvuden.push({
                    index: nextY * state.size + nextX,
                    incoming: (outgoing + 2) % 4,
                });
            }
        }

        state.connected = new Set(state.filled);
        state.trail = trail;
        state.heads = nästaHuvuden;
        state.flowBlockedIndex = null;
        state.flowVersion++;

        if (nästaHuvuden.length === 0) {
            const saknade = state.sinks.filter(
                sink => !state.poweredSinks.has(sink)
            );
            if (saknade.length > 0) {
                return this.failPipeFlow(
                    state,
                    `Strömmen nådde bara ${state.poweredSinks.size} av ` +
                    `${state.sinks.length} utgångar. Kretsen underkändes.`,
                    saknade[0],
                    'sink'
                );
            }
            const missade = state.anchors.filter(
                anchor => !state.filled.has(anchor)
            );
            if (missade.length > 0) {
                return this.failPipeFlow(
                    state,
                    `Strömmen nådde UT men gick förbi ${missade.length} ` +
                    `${missade.length === 1 ?
                        'fastsvetsad punkt' :
                        'fastsvetsade punkter'}. Kretsen underkändes.`,
                    missade[0],
                    'anchor'
                );
            }
            this.markSolved(
                `Strömmen nådde ${state.sinks.length > 1 ? 'båda UT' : 'UT'} ` +
                `efter ${state.moves} byten och ` +
                `${state.reveals} avtäckta ledare!`
            );
            return true;
        }

        state.status = state.flowFastForward ?
            'Vägen till UT är klar — strömmen snabbspolas genom kretsen!' :
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
                'Ledaren är redan strömsatt och går inte längre att flytta.';
            this.touch();
            return true;
        }

        const cell = state.cells[index];
        if (cell.welded) {
            state.status =
                'Den ledaren är fastsvetsad. Bygg vidare från den i stället.';
            this.touch();
            return true;
        }

        if (!cell.revealed) {
            cell.revealed = true;
            state.reveals++;
            state.status =
                `Ledare avtäckta: ${state.reveals}/${state.cells.length}. ` +
                'Markera två avtäckta ledare för att byta plats.';
            this.touch();
            return true;
        }

        if (state.selectedIndex === null) {
            state.selectedIndex = index;
            state.status =
                'Ledaren är markerad. Välj en annan avtäckt ledare för att byta.';
            this.touch();
            return true;
        }

        if (state.selectedIndex === index) {
            state.selectedIndex = null;
            state.status = 'Markeringen togs bort.';
            this.touch();
            return true;
        }

        if (state.filled.has(state.selectedIndex)) {
            state.selectedIndex = null;
            state.status =
                'Den markerade ledaren hann strömsättas. Välj en annan.';
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
            'Kretsen är kopplad till UT! Strömmen snabbspolas genom ledarna.' :
            `${state.moves} ${state.moves === 1 ? 'byte' : 'byten'} · ` +
            'fortsätt bygga framför den framryckande strömmen.';
        this.touch();
        return true;
    }

    resetPipes() {
        const state = this.state;
        if (!state || state.type !== 'pipes' || state.solved) return false;
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
        return true;
    }

    getPipeLabel(index) {
        const state = this.state;
        if (!state || state.type !== 'pipes') return 'Ledare';
        const cell = state.cells[index];
        const row = Math.floor(index / state.size) + 1;
        const column = index % state.size + 1;
        if (!cell.revealed && !state.filled.has(index)) {
            return `Dold ledarplatta, rad ${row}, kolumn ${column}. Avtäck.`;
        }
        const connections = this.getPipeConnections(cell)
            .map((connected, direction) =>
                connected ? PIPE_DIRECTION_NAMES[direction] : null
            )
            .filter(Boolean)
            .join(' och ');
        const stateLabel = state.flowBlockedIndex === index ?
            (state.flowBlockedReason === 'anchor' ?
                'Missad säkring — strömmen gick aldrig här.' :
                'Här bröts kretsen — strömmen kom in ' +
                `${PIPE_DIRECTION_SOURCES[state.flowIncoming]}.`) :
            cell.welded ?
                'Fastsvetsad — sitter fast.' :
            state.filled.has(index) ?
                'Strömsatt och låst.' :
                state.selectedIndex === index ?
                    'Markerad för byte.' :
                    'Välj för att byta.';
        return `Fast ledare rad ${row}, kolumn ${column}. ` +
            `Öppet ${connections}. ${stateLabel}`;
    }

    action(action, value) {
        if (!this.state || this.state.solved) return false;
        if (action === 'puzzle-begin') {
            if (this.state.type === 'keypad') {
                return this.beginKeypadPlayback();
            }
            if (this.state.type === 'dial') return this.startDial();
            return false;
        }
        if (action === 'puzzle-key') return this.pressKeypadDigit(value);
        if (action === 'puzzle-dial-hit') return this.hitDial();
        if (action === 'puzzle-dial-nudge') return this.nudgeDial(value);
        if (action === 'puzzle-pipe') return this.interactPipe(value);
        if (action === 'puzzle-reset') {
            if (this.state.type === 'keypad') return this.beginKeypadPlayback();
            if (this.state.type === 'pipes') return this.resetPipes();
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

        if (state.type === 'keypad' && state.phase === 'watch') {
            state.playbackTimer -= elapsed;
            if (state.playbackTimer <= 0) {
                if (state.playbackLit) {
                    state.playbackLit = false;
                    state.shownDigit = null;
                    state.playbackTimer = 0.17;
                } else {
                    state.playbackIndex++;
                    if (state.playbackIndex >= state.code.length) {
                        state.phase = 'input';
                        state.status = 'Din tur — slå in koden.';
                    } else {
                        state.playbackLit = true;
                        state.shownDigit = state.code[state.playbackIndex];
                        state.playbackTimer = 0.62;
                    }
                }
                this.touch();
            }
        } else if (
            state.type === 'dial' &&
            state.phase === 'active' &&
            !state.manual
        ) {
            let nextAngle = state.angle +
                state.direction * state.speed * elapsed;
            let reflections = 0;
            while (
                (nextAngle > 356 || nextAngle < 4) &&
                reflections < 8
            ) {
                if (nextAngle > 356) {
                    nextAngle = 356 - (nextAngle - 356);
                    state.direction = -1;
                } else {
                    nextAngle = 4 + (4 - nextAngle);
                    state.direction = 1;
                }
                reflections++;
            }
            state.angle = Math.max(4, Math.min(356, nextAngle));
        } else if (
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
