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
        copy: 'Vrid kretsdelarna så att strömmen går från IN → UT innan tiden går ut.',
    },
});

const PIPE_BASE_CONNECTIONS = Object.freeze({
    straight: Object.freeze([false, true, false, true]),
    corner: Object.freeze([true, true, false, false]),
    tee: Object.freeze([true, true, false, true]),
    cross: Object.freeze([true, true, true, true]),
});

const PIPE_DIRECTION_NAMES = Object.freeze(['upp', 'höger', 'ned', 'vänster']);

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

    buildPipePath(size, difficulty, random) {
        const path = [{ x: 0, y: Math.floor(size / 2) }];
        let y = path[0].y;

        for (let x = 0; x < size - 1; x++) {
            const shouldTurn =
                (x + difficulty) % 2 === 1 ||
                (difficulty >= 3 && random() > 0.42);
            if (shouldTurn) {
                let direction = random() < 0.5 ? -1 : 1;
                if (y <= 0) direction = 1;
                if (y >= size - 1) direction = -1;
                y += direction;
                path.push({ x, y });
            }
            path.push({ x: x + 1, y });
        }
        return path;
    }

    buildSerpentinePipePath(difficulty, random) {
        const size = 6;
        const rowCount = difficulty === 4 ? 3 : 5;
        const topRow = Math.floor(random() * (size - rowCount + 1));
        const travelsDown = random() < 0.5;
        const rows = Array.from({ length: rowCount }, (_, index) =>
            travelsDown ?
                topRow + index :
                topRow + rowCount - 1 - index
        );
        const path = [];

        rows.forEach((y, rowIndex) => {
            if (rowIndex % 2 === 0) {
                for (let x = 0; x < size; x++) path.push({ x, y });
            } else {
                for (let x = size - 1; x >= 0; x--) path.push({ x, y });
            }
        });
        return path;
    }

    createPipesState(difficulty, seed) {
        const random = this.createRandom(seed);
        const isAdvanced = difficulty >= 4;
        const size = isAdvanced ? 6 : difficulty === 1 ? 4 : 5;
        const timeLimit = difficulty === 1 ?
            55 :
            difficulty === 2 ?
                42 :
                difficulty === 3 ?
                    32 :
                    difficulty === 4 ? 55 : 75;
        const path = isAdvanced ?
            this.buildSerpentinePipePath(difficulty, random) :
            this.buildPipePath(size, difficulty, random);
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
                    const offset = pipe.type === 'straight' ?
                        (random() < 0.5 ? 1 : 3) :
                        1 + Math.floor(random() * 3);
                    const rotation = (pipe.rotation + offset) % 4;
                    cells.push({
                        type: pipe.type,
                        rotation,
                        initialRotation: rotation,
                        path: true,
                    });
                } else {
                    const roll = random();
                    const type = difficulty >= 2 && roll > 0.84 ?
                        'tee' :
                        roll > 0.48 ? 'corner' : 'straight';
                    const rotation = Math.floor(random() * 4);
                    cells.push({
                        type,
                        rotation,
                        initialRotation: rotation,
                        path: false,
                    });
                }
            }
        }

        const state = {
            ...this.createBaseState('pipes', difficulty),
            phase: 'active',
            status: 'Koppla strömmen från IN → UT innan tiden går ut.',
            size,
            cells,
            path,
            sourceY: path[0].y,
            sinkY: path[path.length - 1].y,
            connected: new Set(),
            moves: 0,
            timeLimit,
            timeLeft: timeLimit,
            timedOut: false,
        };
        const startsSolved = this.calculatePipeFlow(state);
        if (startsSolved) {
            const sourceIndex = state.sourceY * size;
            state.cells[sourceIndex].rotation =
                (state.cells[sourceIndex].rotation + 1) % 4;
            state.cells[sourceIndex].initialRotation =
                state.cells[sourceIndex].rotation;
            state.solved = false;
            state.completionTimer = 0;
            this.calculatePipeFlow(state);
        }
        return state;
    }

    calculatePipeFlow(state = this.state) {
        if (!state || state.type !== 'pipes') return false;

        const sourceIndex = state.sourceY * state.size;
        const queue = [];
        const connected = new Set();
        const sourceConnections = this.getPipeConnections(
            state.cells[sourceIndex]
        );
        if (sourceConnections[3]) {
            queue.push(sourceIndex);
            connected.add(sourceIndex);
        }

        let reachesSink = false;
        while (queue.length > 0) {
            const index = queue.shift();
            const x = index % state.size;
            const y = Math.floor(index / state.size);
            const connections = this.getPipeConnections(state.cells[index]);
            if (
                x === state.size - 1 &&
                y === state.sinkY &&
                connections[1]
            ) {
                reachesSink = true;
            }

            const neighbors = [
                [x, y - 1],
                [x + 1, y],
                [x, y + 1],
                [x - 1, y],
            ];
            connections.forEach((connectedDirection, direction) => {
                if (!connectedDirection) return;
                const [nextX, nextY] = neighbors[direction];
                if (
                    nextX < 0 ||
                    nextX >= state.size ||
                    nextY < 0 ||
                    nextY >= state.size
                ) return;

                const nextIndex = nextY * state.size + nextX;
                if (connected.has(nextIndex)) return;
                const nextConnections = this.getPipeConnections(
                    state.cells[nextIndex]
                );
                const oppositeDirection = (direction + 2) % 4;
                if (!nextConnections[oppositeDirection]) return;
                connected.add(nextIndex);
                queue.push(nextIndex);
            });
        }

        state.connected = connected;
        return reachesSink;
    }

    rotatePipe(value) {
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

        state.cells[index].rotation = (state.cells[index].rotation + 1) % 4;
        state.moves++;
        if (this.calculatePipeFlow(state)) {
            this.markSolved(`Kretsen är sluten efter ${state.moves} drag!`);
        } else {
            state.status =
                `${state.moves} drag · följ den lysande strömmen från IN till UT.`;
            this.touch();
        }
        return true;
    }

    resetPipes() {
        const state = this.state;
        if (!state || state.type !== 'pipes' || state.solved) return false;
        const timedOut = state.phase === 'failed';
        state.cells.forEach(cell => {
            cell.rotation = cell.initialRotation;
        });
        state.moves = 0;
        if (timedOut) {
            state.phase = 'active';
            state.timeLeft = state.timeLimit;
            state.timedOut = false;
        }
        state.status = timedOut ?
            'Nytt försök — koppla strömmen från IN → UT.' :
            'Kretsen återställdes. Tiden fortsätter att gå.';
        this.calculatePipeFlow(state);
        this.touch();
        return true;
    }

    getPipeLabel(index) {
        const state = this.state;
        if (!state || state.type !== 'pipes') return 'Rör';
        const cell = state.cells[index];
        const connections = this.getPipeConnections(cell)
            .map((connected, direction) =>
                connected ? PIPE_DIRECTION_NAMES[direction] : null
            )
            .filter(Boolean)
            .join(' och ');
        const row = Math.floor(index / state.size) + 1;
        const column = index % state.size + 1;
        return `Rör rad ${row}, kolumn ${column}. Öppet ${connections}. Rotera.`;
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
        if (action === 'puzzle-pipe') return this.rotatePipe(value);
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
            state.timeLeft = Math.max(0, state.timeLeft - elapsed);
            if (state.timeLeft <= 0) {
                state.phase = 'failed';
                state.timedOut = true;
                state.status =
                    'Tiden är ute! Återställ kretsen för ett nytt försök.';
                this.touch();
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
