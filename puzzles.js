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
        step: 3.2,
        opening: 5,
        safeLead: 2,
        turnChance: 0,
        doubleTurnChance: 0,
    }),
    2: Object.freeze({
        size: 5,
        step: 2.8,
        opening: 6.5,
        safeLead: 3,
        turnChance: 0,
        doubleTurnChance: 0,
    }),
    3: Object.freeze({
        size: 5,
        step: 2.55,
        opening: 8,
        safeLead: 3,
        turnChance: 0.58,
        doubleTurnChance: 0.2,
    }),
    4: Object.freeze({
        size: 6,
        step: 3.6,
        opening: 10,
        safeLead: 4,
        turnChance: 0.62,
        doubleTurnChance: 0.45,
    }),
    5: Object.freeze({
        size: 6,
        step: 3.1,
        opening: 11,
        safeLead: 4,
        turnChance: 0.7,
        doubleTurnChance: 0.55,
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

        const maximumDifficulty = type === 'pipes' ? 5 : 3;
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

    createPipesState(difficulty, seed) {
        const random = this.createRandom(seed);
        const balance = PIPE_FLOW_BALANCE[difficulty];
        const size = balance.size;
        const path = this.buildPipePath(balance, difficulty, random);
        const pathByCell = new Map(
            path.map((position, pathIndex) => [
                `${position.x},${position.y}`,
                pathIndex,
            ])
        );
        const cells = [];

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const pathIndex = pathByCell.get(`${x},${y}`);
                if (pathIndex !== undefined) {
                    const current = path[pathIndex];
                    const previous = pathIndex === 0 ?
                        { x: -1, y: current.y } :
                        path[pathIndex - 1];
                    const next = pathIndex === path.length - 1 ?
                        { x: size, y: current.y } :
                        path[pathIndex + 1];
                    const required = new Set([
                        this.directionBetween(current, previous),
                        this.directionBetween(current, next),
                    ]);
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

        const safeLead = Math.max(1, balance.safeLead || 1);
        path.slice(0, safeLead).forEach(position => {
            const targetIndex = position.y * size + position.x;
            const correctPipeIndex = cells.findIndex(
                cell => cell.solutionIndex === targetIndex
            );
            [cells[targetIndex], cells[correctPipeIndex]] =
                [cells[correctPipeIndex], cells[targetIndex]];
        });

        const sourceIndex = path[0].y * size;
        cells.forEach((cell, index) => {
            cell.initialIndex = index;
            cell.revealed = index === sourceIndex;
            cell.initialRevealed = index === sourceIndex;
        });

        const state = {
            ...this.createBaseState('pipes', difficulty),
            phase: 'active',
            status: '',
            size,
            cells,
            path,
            sourceY: path[0].y,
            sinkY: path[path.length - 1].y,
            connected: new Set(),
            filled: new Set(),
            moves: 0,
            reveals: 1,
            selectedIndex: null,
            flowPhase: 'flowing',
            flowStep: balance.step,
            flowOpening: balance.opening,
            flowFastStep: 0.45,
            flowFastForward: false,
            flowInterval: balance.opening,
            flowTimer: balance.opening,
            flowIndex: sourceIndex,
            flowIncoming: 3,
            flowHead: null,
            flowHeadIncoming: null,
            flowHeadOutgoing: null,
            flowBlockedIndex: null,
            flowVersion: 0,
            timedOut: false,
        };
        this.refreshPipeFastForward(state);
        this.advancePipeFlow(state);
        state.status = this.getPipeOpeningStatus(state);
        return state;
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

        let index = state.sourceY * state.size;
        let incoming = 3;
        const visited = new Set();
        const steps = [
            { x: 0, y: -1 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
            { x: -1, y: 0 },
        ];

        while (!visited.has(index)) {
            visited.add(index);
            const connections = this.getPipeConnections(state.cells[index]);
            if (!connections[incoming]) return false;
            const exits = connections
                .map((connected, direction) =>
                    connected && direction !== incoming ?
                        direction :
                        null
                )
                .filter(direction => direction !== null);
            if (exits.length !== 1) return false;

            const outgoing = exits[0];
            const x = index % state.size;
            const y = Math.floor(index / state.size);
            if (
                x === state.size - 1 &&
                y === state.sinkY &&
                outgoing === 1
            ) return true;

            const nextX = x + steps[outgoing].x;
            const nextY = y + steps[outgoing].y;
            if (
                nextX < 0 ||
                nextX >= state.size ||
                nextY < 0 ||
                nextY >= state.size
            ) return false;
            index = nextY * state.size + nextX;
            incoming = (outgoing + 2) % 4;
        }
        return false;
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

    failPipeFlow(state, message, blockedIndex = state.flowIndex) {
        state.phase = 'failed';
        state.flowPhase = 'failed';
        state.timedOut = true;
        state.flowBlockedIndex = blockedIndex;
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

        const index = state.flowIndex;
        if (
            !Number.isInteger(index) ||
            index < 0 ||
            index >= state.cells.length ||
            state.filled.has(index)
        ) {
            return this.failPipeFlow(
                state,
                'Strömmen gick i en slinga och kretsen överbelastades.',
                index
            );
        }

        const cell = state.cells[index];
        cell.revealed = true;
        const connections = this.getPipeConnections(cell);
        if (!connections[state.flowIncoming]) {
            return this.failPipeFlow(
                state,
                'Strömmen nådde en bruten ledare. Kretsen slog ifrån.',
                index
            );
        }

        const exits = connections
            .map((connected, direction) =>
                connected && direction !== state.flowIncoming ?
                    direction :
                    null
            )
            .filter(direction => direction !== null);
        if (exits.length !== 1) {
            return this.failPipeFlow(
                state,
                'Strömmen nådde en återvändsgränd. Kretsen slog ifrån.',
                index
            );
        }

        const outgoing = exits[0];
        state.filled.add(index);
        state.connected = new Set(state.filled);
        state.flowHead = index;
        state.flowHeadIncoming = state.flowIncoming;
        state.flowHeadOutgoing = outgoing;
        state.flowBlockedIndex = null;
        state.flowVersion++;
        if (state.selectedIndex === index) state.selectedIndex = null;

        const x = index % state.size;
        const y = Math.floor(index / state.size);
        if (
            x === state.size - 1 &&
            y === state.sinkY &&
            outgoing === 1
        ) {
            this.markSolved(
                `Strömmen nådde UT efter ${state.moves} byten och ` +
                `${state.reveals} avtäckta ledare!`
            );
            return true;
        }

        const steps = [
            { x: 0, y: -1 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
            { x: -1, y: 0 },
        ];
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

        state.flowIndex = nextY * state.size + nextX;
        state.flowIncoming = (outgoing + 2) % 4;
        state.status = state.flowFastForward ?
            'Vägen till UT är klar — strömmen snabbspolas genom kretsen!' :
            `Strömmen rör sig · ${state.filled.size} ledare ` +
            `${state.filled.size === 1 ? 'strömsatt' : 'strömsatta'}. ` +
            'Bygg vidare framför den!';
        this.touch();
        return true;
    }

    getPipeFlowPresentation(state = this.state, reducedMotion = false) {
        const empty = {
            visible: new Set(),
            leading: new Set(),
            blocked: new Set(),
            frame: 'empty',
            pulsed: false,
        };
        if (!state || state.type !== 'pipes') return empty;
        const activeStep = state.flowInterval ||
            this.getActivePipeStep(state);
        const progress = state.solved || state.flowPhase === 'failed' ?
            1 :
            state.flowPhase === 'flowing' ?
            Math.max(
                0,
                Math.min(
                    1,
                    1 - state.flowTimer / activeStep
                )
            ) :
            1;
        const visible = new Set(state.filled);
        if (
            state.flowPhase === 'flowing' &&
            state.flowHead !== null &&
            !state.solved
        ) {
            visible.delete(state.flowHead);
        }
        return {
            visible,
            leading: state.flowHead === null ?
                new Set() :
                new Set([state.flowHead]),
            blocked: state.flowBlockedIndex === null ?
                new Set() :
                new Set([state.flowBlockedIndex]),
            frame: `${state.flowPhase}:${state.flowVersion}`,
            pulsed: false,
            progress: reducedMotion ?
                Math.round(progress * 4) / 4 :
                progress,
            incoming: state.flowHeadIncoming,
            outgoing: state.flowHeadOutgoing,
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
        state.flowIndex = state.sourceY * state.size;
        state.flowIncoming = 3;
        state.flowHead = null;
        state.flowHeadIncoming = null;
        state.flowHeadOutgoing = null;
        state.flowBlockedIndex = null;
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
            'Här bröts kretsen — strömmen kom in ' +
            `${PIPE_DIRECTION_SOURCES[state.flowIncoming]}.` :
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
