// Game constants
const GRID_SIZE = 64; // Double size - scale up 32px sprites
const PLAYER_SIZE = 64;
const GRID_WIDTH = 7; // Like Mr. Driller / Tetris
const GRID_HEIGHT = 50;
const VIEWPORT_HEIGHT = 11;
const FALL_DELAY = 1.1; // Readable hang time after the last support disappears
const MIN_FALL_DELAY = 0.85;
const FALL_DELAY_DEPTH_REDUCTION = 0.25;
const FALL_SPEED = 0.105; // Seconds per grid cell while blocks are falling
const MIN_FALL_SPEED = 0.08;
const FALL_SPEED_DEPTH_REDUCTION = 0.025;
const SHAKE_DURATION = 0.5; // Reach a strong warning shake early in the hang time
const DEATH_BEAT_DURATION = 0.52;
const MATCH_CLEAR_SIZE = 4;
const MATCH_CLEAR_FLASH = 0.42;
const DIG_CLEAR_FLASH = 0.09;
const DIG_SCORE = 10;
const MATCH_SCORE = 30;
const MAX_GENERATED_CLUSTER_SIZE = 3;
const ACTIVE_COLOR_COUNT = 4;
const COLOR_NEIGHBOR_PREFERENCE = 0.45;
const WALK_SPEED = 350;
const AIR_CONTROL_SPEED = 235;
const FALL_START_SPEED = 390;
const FALL_ACCELERATION = 2300;
const FALL_MAX_SPEED = 1100;
const FALL_CENTER_WINDOW = 0.12;
const LONG_FALL_VISUAL_THRESHOLD = 1.05;
const STEP_UP_DURATION = 0.15;
const STEP_UP_HOLD_DELAY = 0.3;
const STEP_UP_ALIGN_WINDOW = 0.20;
const DIG_BUFFER_DURATION = 0.055;
const DIG_RECOVERY = 0.105;
const DIG_LOCK_DURATION = 0.055;
const DIG_ANIM_DURATION = 0.18;
const DRILL_ANIM_SPEED = 24;
const MAX_DEBRIS_PARTICLES = 44;
const PROGRESS_STORAGE_KEY = 'manny-the-mole:campaign-progress';

let CANVAS_WIDTH = GRID_WIDTH * GRID_SIZE;
let CANVAS_HEIGHT = VIEWPORT_HEIGHT * GRID_SIZE;
let SCALE = 1;

// Asset loader
const ASSETS = {
    mole: null,
    mole_drilling_down: null,
    mole_drilling_left: null,
    mole_drilling_right: null,
    mole_drilling_up: null,
    mole_walk_left: null,
    mole_walk_right: null,
    mole_falling: null,
    gold: null,
    safe_keypad: null,
    safe_dial: null,
    safe_pipes: null,
    loaded: false
};

function loadAssets() {
    return new Promise((resolve) => {
        const assetList = [
            ['mole', 'assets/mole.png'],
            ['mole_drilling_down', 'assets/mole_drilling_down.png'],
            ['mole_drilling_left', 'assets/mole_drilling_left.png'],
            ['mole_drilling_right', 'assets/mole_drilling_right.png'],
            ['mole_drilling_up', 'assets/mole_drilling_up.png'],
            ['mole_walk_left', 'assets/mole_walk_left.png'],
            ['mole_walk_right', 'assets/mole_walk_right.png'],
            ['mole_falling', 'assets/mole_falling.png'],
            ['gold', 'assets/gold.png'],
            ['safe_keypad', 'assets/safe-keypad.png'],
            ['safe_dial', 'assets/safe-dial.png'],
            ['safe_pipes', 'assets/safe-pipes.png'],
        ];
        
        let loadedCount = 0;
        const total = assetList.length;
        
        assetList.forEach(([name, src]) => {
            const img = new Image();
            img.onload = () => {
                ASSETS[name] = img;
                loadedCount++;
                if (loadedCount === total) {
                    ASSETS.loaded = true;
                    resolve();
                }
            };
            img.onerror = () => {
                console.warn(`Failed to load ${src}, using fallback`);
                loadedCount++;
                if (loadedCount === total) {
                    ASSETS.loaded = true;
                    resolve();
                }
            };
            img.src = src;
        });
    });
}

// Block colors - bright Mr. Driller style colors
const BLOCK_COLORS = [
    { name: 'blue', color: '#2786e8', highlight: '#7dd8ff', light: '#49aef4', shadow: '#1550a6', deep: '#0b2b63' },
    { name: 'red', color: '#ed3e52', highlight: '#ff9a94', light: '#ff6570', shadow: '#a91d3a', deep: '#5f1028' },
    { name: 'yellow', color: '#f4bd21', highlight: '#fff29a', light: '#ffd94f', shadow: '#ad6c12', deep: '#67400a' },
    { name: 'green', color: '#38b95e', highlight: '#9af5a0', light: '#63dc78', shadow: '#17753d', deep: '#0b4329' },
    { name: 'pink', color: '#e94fb7', highlight: '#ffb1e4', light: '#fa79ca', shadow: '#9a297a', deep: '#561648' },
];

// Hand-painted loot from the original artwork sheet. Each region keeps a little
// transparent breathing room so it reads cleanly inside a 64 px item pocket.
const TREASURE_ATLAS_REGIONS = {
    coin: { sx: 40, sy: 39, sw: 16, sh: 16, size: 48 },
    bag: { sx: 0, sy: 64, sw: 32, sh: 32, size: 64 },
    chest: { sx: 96, sy: 64, sw: 32, sh: 32, size: 64 },
};

const BLOCK_TYPES = {
    EMPTY: 0,
    COLORED: 1,
    XBLOCK: 10,
    BEDROCK: 11,
    ITEM: 12, // Treasures and oxygen - blocks can't fall through them
};

const SAFE_TYPES = new Set(['keypad', 'dial', 'pipes']);
const SAFE_ASSET_KEYS = Object.freeze({
    keypad: 'safe_keypad',
    dial: 'safe_dial',
    pipes: 'safe_pipes',
});
const SAFE_TYPE_LABELS = Object.freeze({
    keypad: 'Minneslås',
    dial: 'Rattlås',
    pipes: 'Kretslås',
});

function isColoredBlockValue(value) {
    return value >= BLOCK_TYPES.COLORED && value < BLOCK_TYPES.COLORED + BLOCK_COLORS.length;
}

class ColoredBlock {
    constructor(id, x, y, colorIndex) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.colorIndex = colorIndex;
        this.fallTimer = 0;
        this.isFalling = false;
        this.fallProgress = 0;
        this.isShaking = false;
        this.shakeTimer = 0;
        this.isClearing = false;
        this.clearTimer = 0;
        this.clearDuration = MATCH_CLEAR_FLASH;
        this.destroyed = false;
        this.matchEligible = false;
    }
    
    canFall(grid) {
        const belowY = this.y + 1;
        if (belowY >= GRID_HEIGHT) return false;
        return grid[belowY]?.[this.x] === BLOCK_TYPES.EMPTY;
    }
    
    fall() {
        this.y++;
        this.fallProgress = 0;
    }
    
    overlapsWithPlayer(playerGridX, playerGridY) {
        return this.x === playerGridX && this.y === playerGridY;
    }
    
    getShakeOffset(reducedMotion = false) {
        if (!this.isShaking || reducedMotion) return 0;
        // Shake intensity increases as timer progresses
        const intensity = 2 + Math.min(1, this.shakeTimer / SHAKE_DURATION) * 3;
        return Math.sin(this.shakeTimer * 40) * intensity;
    }
}

// X-Block class
class XBlock {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.hp = 5;
        this.maxHp = 5;
        this.fallTimer = 0;
        this.isFalling = false;
        this.fallProgress = 0;
        this.destroyed = false;
        this.isShaking = false;
        this.shakeTimer = 0;
        this.hitFlash = 0; // Visual feedback when hit
    }
    
    canFall(grid) {
        const belowY = this.y + 1;
        if (belowY >= GRID_HEIGHT) return false;
        return grid[belowY]?.[this.x] === BLOCK_TYPES.EMPTY;
    }
    
    fall() {
        this.y++;
        this.fallProgress = 0;
    }
    
    getShakeOffset(reducedMotion = false) {
        if (!this.isShaking || reducedMotion) return 0;
        const intensity = 2 + Math.min(1, this.shakeTimer / SHAKE_DURATION) * 3;
        return Math.sin(this.shakeTimer * 40) * intensity;
    }
}

// Gamepad handler
class GamepadHandler {
    constructor() {
        this.lastButtons = {};
        this.lastDirections = { left: false, right: false, up: false, down: false };
        this.deadzone = 0.3;
        this.preferredIndex = null;
    }
    
    getGamepadList() {
        const gamepads = navigator.getGamepads();
        const list = [];
        for (let i = 0; i < gamepads.length; i++) {
            if (gamepads[i]) {
                list.push({
                    index: i,
                    id: gamepads[i].id,
                    isLikelyController: this.isLikelyController(gamepads[i])
                });
            }
        }
        return list;
    }
    
    isLikelyController(gp) {
        const id = gp.id.toLowerCase();
        const audioKeywords = ['audio', 'headset', 'headphone', 'speaker', 'microphone', 'sound'];
        if (audioKeywords.some(kw => id.includes(kw))) return false;
        if (gp.buttons.length >= 4 && gp.axes.length >= 2) return true;
        return false;
    }
    
    findBestGamepad() {
        const gamepads = navigator.getGamepads();
        
        if (this.preferredIndex !== null && gamepads[this.preferredIndex]) {
            return gamepads[this.preferredIndex];
        }
        
        for (let i = 0; i < gamepads.length; i++) {
            if (gamepads[i] && this.isLikelyController(gamepads[i])) {
                return gamepads[i];
            }
        }
        
        for (let i = 0; i < gamepads.length; i++) {
            if (gamepads[i]) return gamepads[i];
        }
        
        return null;
    }
    
    setPreferredGamepad(index) {
        this.preferredIndex = index;
    }
    
    getInput() {
        const gp = this.findBestGamepad();
        
        if (!gp) return null;
        
        // Current state
        const left = gp.buttons[14]?.pressed || gp.axes[0] < -this.deadzone;
        const right = gp.buttons[15]?.pressed || gp.axes[0] > this.deadzone;
        const up = gp.buttons[12]?.pressed || gp.axes[1] < -this.deadzone;
        const down = gp.buttons[13]?.pressed || gp.axes[1] > this.deadzone;
        const digPressed = gp.buttons[0]?.pressed || gp.buttons[2]?.pressed;
        const pausePressed = gp.buttons[9]?.pressed;
        
        const input = {
            left,
            right,
            up,
            down,
            dig: digPressed,
            digJustPressed: digPressed && !this.lastButtons.dig,
            pauseJustPressed: pausePressed && !this.lastButtons.pause,
            // Direction just pressed (for facing)
            leftJustPressed: left && !this.lastDirections.left,
            rightJustPressed: right && !this.lastDirections.right,
            upJustPressed: up && !this.lastDirections.up,
            downJustPressed: down && !this.lastDirections.down,
        };
        
        // Save state for next frame
        this.lastButtons.dig = digPressed;
        this.lastButtons.pause = pausePressed;
        this.lastDirections = { left, right, up, down };
        
        return input;
    }
    
    getCurrentGamepadName() {
        const gp = this.findBestGamepad();
        return gp ? gp.id : 'None';
    }
}

const TOUCH_STICK_DEADZONE = 0.32;

class TouchControls {
    constructor() {
        this.available =
            window.matchMedia?.('(pointer: coarse)')?.matches === true ||
            navigator.maxTouchPoints > 0;
        this.zone = null;
        this.stick = null;
        this.drill = null;
        this.stickPointer = null;
        this.origin = { x: 0, y: 0 };
        this.radius = 1;
        this.direction = { left: false, right: false, up: false, down: false };
        this.drillPointers = new Set();
        this.last = {
            left: false,
            right: false,
            up: false,
            down: false,
            dig: false,
        };
    }

    attach(zoneElement, stickElement, drillElement) {
        this.zone = zoneElement;
        this.stick = stickElement;
        this.drill = drillElement;
        if (!this.zone || !this.stick || !this.drill) return;

        this.zone.addEventListener(
            'pointerdown',
            event => this.beginStick(event),
            { passive: false }
        );
        this.zone.addEventListener(
            'pointermove',
            event => this.moveStick(event),
            { passive: false }
        );
        ['pointerup', 'pointercancel'].forEach(name => {
            this.zone.addEventListener(name, event => this.endStick(event));
        });

        this.drill.addEventListener(
            'pointerdown',
            event => {
                event.preventDefault();
                this.capture(this.drill, event.pointerId);
                this.drillPointers.add(event.pointerId);
                this.drill.classList.add('is-pressed');
            },
            { passive: false }
        );
        ['pointerup', 'pointercancel'].forEach(name => {
            this.drill.addEventListener(name, event => {
                this.drillPointers.delete(event.pointerId);
                if (this.drillPointers.size === 0) {
                    this.drill.classList.remove('is-pressed');
                }
            });
        });
        // Ett finger som glider ut ur knappen ska inte fastna som nedtryckt.
        window.addEventListener('pointercancel', () => this.release());
        window.addEventListener('blur', () => this.release());
    }

    capture(element, pointerId) {
        // Kan kasta om pekaren redan släppts; fångsten är en bonus, inte ett krav.
        try {
            element.setPointerCapture?.(pointerId);
        } catch {
            /* pekaren finns inte längre */
        }
    }

    beginStick(event) {
        event.preventDefault();
        // Spaken föds under tummen istället för på en fast plats.
        const zone = this.zone.getBoundingClientRect();
        this.origin = { x: event.clientX, y: event.clientY };
        this.radius = Math.max(1, this.stick.offsetWidth / 2);
        this.stick.style.setProperty(
            '--stick-origin-x',
            `${event.clientX - zone.left}px`
        );
        this.stick.style.setProperty(
            '--stick-origin-y',
            `${event.clientY - zone.top}px`
        );
        this.stickPointer = event.pointerId;
        this.capture(this.zone, event.pointerId);
        this.stick.classList.add('is-active');
        this.applyStick(event.clientX, event.clientY);
    }

    moveStick(event) {
        if (this.stickPointer !== event.pointerId) return;
        event.preventDefault();
        this.applyStick(event.clientX, event.clientY);
    }

    endStick(event) {
        if (this.stickPointer !== event.pointerId) return;
        this.stickPointer = null;
        this.stick.classList.remove('is-active');
        this.setDirection({
            left: false,
            right: false,
            up: false,
            down: false,
        });
        this.stick.style.setProperty('--stick-x', '0');
        this.stick.style.setProperty('--stick-y', '0');
    }

    applyStick(clientX, clientY) {
        const dx = (clientX - this.origin.x) / this.radius;
        const dy = (clientY - this.origin.y) / this.radius;
        const distance = Math.hypot(dx, dy);
        const clamp = distance > 1 ? 1 / distance : 1;
        this.stick.style.setProperty(
            '--stick-x',
            String(Math.round(dx * clamp * this.radius * 0.58))
        );
        this.stick.style.setProperty(
            '--stick-y',
            String(Math.round(dy * clamp * this.radius * 0.58))
        );

        if (distance < TOUCH_STICK_DEADZONE) {
            this.setDirection({
                left: false,
                right: false,
                up: false,
                down: false,
            });
            return;
        }

        // Fyrvägs: rutnätet mår bättre av en dominant axel än av diagonaler.
        const horizontal = Math.abs(dx) >= Math.abs(dy);
        this.setDirection({
            left: horizontal && dx < 0,
            right: horizontal && dx > 0,
            up: !horizontal && dy < 0,
            down: !horizontal && dy > 0,
        });
    }

    setDirection(next) {
        this.direction = next;
        if (!this.stick) return;
        this.stick.classList.toggle('is-left', next.left);
        this.stick.classList.toggle('is-right', next.right);
        this.stick.classList.toggle('is-up', next.up);
        this.stick.classList.toggle('is-down', next.down);
    }

    release() {
        this.drillPointers.clear();
        this.drill?.classList.remove('is-pressed');
        this.stickPointer = null;
        this.stick?.classList.remove('is-active');
        this.setDirection({
            left: false,
            right: false,
            up: false,
            down: false,
        });
        this.stick?.style.setProperty('--stick-x', '0');
        this.stick?.style.setProperty('--stick-y', '0');
    }

    getInput() {
        const { left, right, up, down } = this.direction;
        const dig = this.drillPointers.size > 0;
        const input = {
            left,
            right,
            up,
            down,
            dig,
            digJustPressed: dig && !this.last.dig,
            leftJustPressed: left && !this.last.left,
            rightJustPressed: right && !this.last.right,
            upJustPressed: up && !this.last.up,
            downJustPressed: down && !this.last.down,
        };
        this.last = { left, right, up, down, dig };
        return input;
    }
}

class ArcadeSound {
    constructor() {
        this.context = null;
        this.noiseBuffer = null;
        this.lastLandTime = -1;
        this.lastFallWarningTime = -1;
    }

    unlock() {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return null;

        if (!this.context) {
            this.context = new AudioContextClass();
            const sampleCount = Math.floor(this.context.sampleRate * 0.5);
            this.noiseBuffer = this.context.createBuffer(1, sampleCount, this.context.sampleRate);
            const samples = this.noiseBuffer.getChannelData(0);
            for (let i = 0; i < sampleCount; i++) {
                samples[i] = Math.random() * 2 - 1;
            }
        }

        if (this.context.state === 'suspended') {
            this.context.resume().catch(() => {});
        }
        return this.context;
    }

    playTone(startFrequency, endFrequency, duration, volume, type = 'square', delay = 0) {
        const context = this.unlock();
        if (!context) return;

        const startTime = context.currentTime + delay;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(startFrequency, startTime);
        oscillator.frequency.exponentialRampToValueAtTime(
            Math.max(20, endFrequency),
            startTime + duration
        );
        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(startTime);
        oscillator.stop(startTime + duration + 0.01);
    }

    playNoise(duration, volume, frequency) {
        const context = this.unlock();
        if (!context || !this.noiseBuffer) return;

        const now = context.currentTime;
        const source = context.createBufferSource();
        const filter = context.createBiquadFilter();
        const gain = context.createGain();
        source.buffer = this.noiseBuffer;
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(frequency, now);
        filter.Q.setValueAtTime(0.8, now);
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(context.destination);
        source.start(now, Math.random() * 0.08, duration);
    }

    playDrill(strength, isHardBlock = false) {
        const weight = Math.min(4, Math.max(1, strength));
        if (isHardBlock) {
            this.playTone(165, 58, 0.085, 0.07, 'square');
            this.playNoise(0.075, 0.07, 420);
        } else {
            this.playTone(125 + weight * 7, 48, 0.075, 0.045 + weight * 0.008, 'sawtooth');
            this.playNoise(0.065, 0.035 + weight * 0.008, 720);
        }
    }

    playLand(strength = 1) {
        const context = this.unlock();
        if (!context || context.currentTime - this.lastLandTime < 0.045) return;
        this.lastLandTime = context.currentTime;
        const weight = Math.min(4, Math.max(1, strength));
        this.playTone(82, 32, 0.07, 0.025 + weight * 0.012, 'triangle');
        this.playNoise(0.045, 0.015 + weight * 0.007, 190);
    }

    playFallWarning() {
        const context = this.unlock();
        if (
            !context ||
            context.currentTime - this.lastFallWarningTime < 0.12
        ) return;
        this.lastFallWarningTime = context.currentTime;
        this.playTone(118, 62, 0.13, 0.026, 'triangle');
        this.playNoise(0.09, 0.018, 145);
    }

    playCrush() {
        this.playTone(92, 28, 0.24, 0.085, 'sawtooth');
        this.playNoise(0.18, 0.085, 125);
        this.playTone(52, 24, 0.2, 0.045, 'triangle', 0.06);
    }

    playAirOut() {
        this.playTone(360, 145, 0.3, 0.045, 'sine');
        this.playTone(240, 82, 0.32, 0.032, 'triangle', 0.12);
        this.playNoise(0.28, 0.024, 920);
    }

    playClear(size) {
        const lift = Math.min(5, Math.max(0, size - MATCH_CLEAR_SIZE));
        this.playTone(330 + lift * 25, 510 + lift * 35, 0.11, 0.045, 'square');
        this.playTone(495 + lift * 25, 720 + lift * 35, 0.1, 0.03, 'square', 0.045);
    }

    playPickup(isOxygen = false) {
        if (isOxygen) {
            this.playTone(390, 690, 0.11, 0.035, 'square');
            this.playTone(585, 880, 0.09, 0.024, 'square', 0.045);
        } else {
            this.playTone(620, 980, 0.09, 0.035, 'square');
            this.playTone(820, 1240, 0.08, 0.022, 'square', 0.04);
        }
    }
}

class GameUI {
    constructor(game) {
        this.game = game;
        this.root = document.getElementById('gameUi');
        this.enabled = Boolean(this.root);
        this.lastState = null;

        if (!this.enabled) return;

        this.hud = document.getElementById('gameHud');
        this.level = document.getElementById('hudLevel');
        this.depth = document.getElementById('hudDepth');
        this.score = document.getElementById('hudScore');
        this.air = document.getElementById('hudAir');
        this.airFill = document.getElementById('hudAirFill');
        this.airModule = document.getElementById('hudAirModule');
        this.pauseButton = document.getElementById('pauseButton');
        this.sideDrillHint = document.getElementById('sideDrillHint');
        this.touchControls = document.getElementById('touchControls');
        this.countdown = document.getElementById('countdownDisplay');
        this.toast = document.getElementById('gameToast');
        this.gameoverEyebrow = document.getElementById('gameoverEyebrow');
        this.gameoverTitle = document.getElementById('gameoverTitle');
        this.gameoverCopy = document.getElementById('gameoverCopy');
        this.gameoverScore = document.getElementById('gameoverScore');
        this.gameoverDepth = document.getElementById('gameoverDepth');
        this.wonEyebrow = document.getElementById('wonEyebrow');
        this.wonTitle = document.getElementById('wonTitle');
        this.wonCopy = document.getElementById('wonCopy');
        this.wonPrimaryButton = document.getElementById('wonPrimaryButton');
        this.wonScore = document.getElementById('wonScore');
        this.wonAir = document.getElementById('wonAir');
        this.levelSelect = document.getElementById('levelSelect');
        this.campaignProgress = document.getElementById('campaignProgress');
        this.puzzleEyebrow = document.getElementById('puzzleEyebrow');
        this.puzzleTitle = document.getElementById('puzzleTitle');
        this.puzzleCopy = document.getElementById('puzzleCopy');
        this.puzzleDifficulty = document.getElementById('puzzleDifficulty');
        this.puzzleBody = document.getElementById('puzzleBody');
        this.puzzleStatus = document.getElementById('puzzleStatus');
        this.puzzleActions = document.getElementById('puzzleActions');
        this.lastPuzzleRevision = -1;
        this.lastPuzzlePhase = null;
        this.pipePuzzleShell = null;
        this.pipePuzzleGrid = null;
        this.pipeCells = [];
        this.lastPipeFlowFrame = null;
        this.screens = {
            menu: document.getElementById('screenMenu'),
            'puzzle-select': document.getElementById('screenPuzzleSelect'),
            paused: document.getElementById('screenPaused'),
            puzzle: document.getElementById('screenPuzzle'),
            gameover: document.getElementById('screenGameover'),
            won: document.getElementById('screenWon'),
        };

        this.refreshLevelSelect();

        this.root.addEventListener('click', event => {
            const button = event.target.closest?.('[data-action]');
            if (!button || !this.root.contains(button) || button.disabled) return;

            this.game.sound.unlock();
            this.game.clearKeyboardInput();
            const action = button.dataset.action;
            if (action === 'start') this.game.startRun();
            else if (action === 'start-level') {
                this.game.startLevel(Number(button.dataset.level));
            }
            else if (action === 'next-level') this.game.advanceLevel();
            else if (action === 'resume') this.game.resumeGame();
            else if (action === 'restart') this.game.restart();
            else if (action === 'menu') this.game.showMainMenu();
            else if (action === 'puzzles' || action === 'puzzle-menu') {
                this.game.showPuzzleSelect();
            }
            else if (action === 'start-puzzle') {
                this.game.startStandalonePuzzle(
                    button.dataset.puzzle,
                    Number(button.dataset.difficulty)
                );
            }
            else if (action === 'puzzle-close') {
                this.game.cancelSafePuzzle();
            }
            else if (action.startsWith('puzzle-')) {
                this.game.handleSafePuzzleAction(
                    action,
                    button.dataset.value
                );
            }
        });

        document.addEventListener('keydown', event => {
            if (this.handlePuzzleShortcut(event)) return;
            this.handleMenuKeydown(event);
        });

        this.root.addEventListener('focusin', event => {
            const control = event.target.closest?.('button:not(:disabled)');
            if (control && this.root.contains(control)) {
                this.markFocusedControl(control);
            }
        });

        this.pauseButton?.addEventListener('click', () => {
            this.game.sound.unlock();
            this.game.clearKeyboardInput();
            this.game.pauseGame();
        });

        window.addEventListener('blur', () => {
            this.game.isWindowActive = false;
            this.game.clearKeyboardInput();
            if (this.game.gameState === 'playing') {
                this.game.pauseGame();
            }
        });
        window.addEventListener('focus', () => {
            this.game.isWindowActive = !document.hidden;
        });

        document.addEventListener('visibilitychange', () => {
            this.game.isWindowActive = !document.hidden;
            if (document.hidden) {
                this.game.clearKeyboardInput();
                if (this.game.gameState === 'playing') {
                    this.game.pauseGame();
                }
            }
        });
    }

    handlePuzzleShortcut(event) {
        if (this.game.gameState !== 'puzzle' || event.defaultPrevented) {
            return false;
        }

        const puzzle = this.game.safePuzzle?.state;
        if (
            puzzle?.type === 'keypad' &&
            puzzle.phase === 'input' &&
            /^[0-9]$/.test(event.key)
        ) {
            event.preventDefault();
            event.stopPropagation();
            this.game.clearKeyboardInput();
            this.game.handleSafePuzzleAction('puzzle-key', event.key);
            return true;
        }
        return false;
    }

    getActiveScreen() {
        return [...this.root.querySelectorAll('.screen')].find(screen =>
            !screen.hidden && screen.getAttribute('aria-hidden') !== 'true'
        ) || null;
    }

    getMenuControls(screen = this.getActiveScreen()) {
        if (!screen) return [];

        return [...screen.querySelectorAll('button:not(:disabled)')].filter(control =>
            !control.hidden &&
            control.getAttribute('aria-hidden') !== 'true' &&
            control.getClientRects().length > 0
        );
    }

    markFocusedControl(control) {
        this.root.querySelectorAll('.is-menu-focused').forEach(element => {
            if (element !== control) element.classList.remove('is-menu-focused');
        });
        control?.classList.add('is-menu-focused');
    }

    focusMenuControl(control) {
        if (!control) return;

        control.focus({ preventScroll: true });
        this.markFocusedControl(control);
        control.scrollIntoView({
            block: 'nearest',
            inline: 'nearest',
        });
    }

    findDirectionalControl(controls, current, direction) {
        const currentRect = current?.getBoundingClientRect();
        if (!currentRect) return null;

        const currentCenter = {
            x: currentRect.left + currentRect.width / 2,
            y: currentRect.top + currentRect.height / 2,
        };
        const vertical = direction === 'up' || direction === 'down';
        const sign = direction === 'up' || direction === 'left' ? -1 : 1;
        let nearest = null;
        let nearestScore = Infinity;

        for (const candidate of controls) {
            if (candidate === current) continue;
            const rect = candidate.getBoundingClientRect();
            const center = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
            };
            const primaryDelta = vertical ?
                (center.y - currentCenter.y) * sign :
                (center.x - currentCenter.x) * sign;
            if (primaryDelta <= 1) continue;

            const secondaryDelta = vertical ?
                Math.abs(center.x - currentCenter.x) :
                Math.abs(center.y - currentCenter.y);
            const score = primaryDelta + secondaryDelta * 4;
            if (score < nearestScore) {
                nearest = candidate;
                nearestScore = score;
            }
        }

        return nearest;
    }

    moveMenuFocus(direction) {
        const controls = this.getMenuControls();
        if (controls.length === 0) return;

        const current = controls.includes(document.activeElement) ?
            document.activeElement :
            null;
        if (!current) {
            this.focusMenuControl(controls[0]);
            return;
        }

        let next = this.findDirectionalControl(controls, current, direction);
        if (!next) {
            const currentIndex = controls.indexOf(current);
            const step = direction === 'up' || direction === 'left' ? -1 : 1;
            next = controls[
                (currentIndex + step + controls.length) % controls.length
            ];
        }
        this.focusMenuControl(next);
    }

    handleMenuKeydown(event) {
        const activeScreen = this.getActiveScreen();
        if (!activeScreen || event.defaultPrevented) return;
        if (
            event.target.matches?.(
                'input, textarea, select, [contenteditable="true"]'
            )
        ) return;

        const normalizedKey = event.key.length === 1 ?
            event.key.toLowerCase() :
            event.key;
        const direction = {
            ArrowUp: 'up',
            w: 'up',
            ArrowDown: 'down',
            s: 'down',
            ArrowLeft: 'left',
            a: 'left',
            ArrowRight: 'right',
            d: 'right',
        }[normalizedKey];

        if (direction) {
            event.preventDefault();
            event.stopPropagation();
            this.game.clearKeyboardInput();
            this.moveMenuFocus(direction);
            return;
        }

        if (
            normalizedKey === 'Escape' ||
            normalizedKey === 'Backspace' ||
            normalizedKey === 'BrowserBack'
        ) {
            event.preventDefault();
            event.stopPropagation();
            this.game.clearKeyboardInput();
            if (this.game.gameState === 'paused') {
                this.game.resumeGame();
            } else if (this.game.gameState === 'puzzle-select') {
                this.game.showMainMenu();
            } else if (this.game.gameState === 'puzzle') {
                this.game.cancelSafePuzzle();
            } else if (
                this.game.gameState === 'gameover' ||
                this.game.gameState === 'won'
            ) {
                this.game.showMainMenu();
            }
            return;
        }

        if (normalizedKey === 'Enter' || normalizedKey === ' ') {
            const controls = this.getMenuControls(activeScreen);
            const focusedControl = controls.includes(document.activeElement) ?
                document.activeElement :
                controls[0];
            if (!focusedControl) return;

            event.preventDefault();
            event.stopPropagation();
            if (event.target !== focusedControl) {
                this.focusMenuControl(focusedControl);
            }
            focusedControl.click();
        }
    }

    refreshLevelSelect() {
        if (!this.levelSelect) return;

        this.levelSelect.replaceChildren();
        const continueLevelIndex = this.game.getContinueLevelIndex();
        CAMPAIGN_LEVELS.forEach((level, levelIndex) => {
            const unlocked = this.game.isLevelUnlocked(levelIndex);
            const completed = this.game.isLevelCompleted(levelIndex);
            const bestScore = this.game.getLevelBestScore(levelIndex);
            const safeLabel = SAFE_TYPE_LABELS[level.safe.type];
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'level-card';
            card.dataset.action = 'start-level';
            card.dataset.level = levelIndex.toString();
            card.disabled = !unlocked;
            card.classList.toggle('is-locked', !unlocked);
            card.classList.toggle('is-complete', completed);
            card.classList.toggle(
                'is-current',
                unlocked && levelIndex === continueLevelIndex
            );
            card.setAttribute('aria-disabled', unlocked ? 'false' : 'true');
            card.setAttribute(
                'aria-label',
                unlocked ?
                    `Nivå ${level.number}, ${level.title}. ${
                        completed ? `Klar. Bästa byte ${bestScore}.` : 'Upplåst.'
                    } ${safeLabel}.` :
                    `Nivå ${level.number}, ${level.title}. Låst. Klara nivå ${
                        CAMPAIGN_LEVELS[levelIndex - 1]?.number
                    } för att låsa upp.`
            );

            const top = document.createElement('span');
            top.className = 'level-card__top';

            const number = document.createElement('span');
            number.className = 'level-card__number';
            number.textContent = String(level.number).padStart(2, '0');
            number.setAttribute('aria-hidden', 'true');

            const state = document.createElement('span');
            state.className = 'level-card__state';
            state.textContent = !unlocked ?
                'Låst' :
                completed ?
                    'Klar ✓' :
                    levelIndex === continueLevelIndex ? 'Nästa' : 'Öppen';
            state.setAttribute('aria-hidden', 'true');
            top.append(number, state);

            const previewFrame = document.createElement('span');
            previewFrame.className = 'level-card__preview';
            const preview = document.createElement('canvas');
            preview.width = 84;
            preview.height = 116;
            preview.setAttribute('aria-hidden', 'true');
            previewFrame.append(preview);

            if (!unlocked) {
                const lock = document.createElement('span');
                lock.className = 'level-card__lock';
                lock.textContent = '◆';
                lock.setAttribute('aria-hidden', 'true');
                previewFrame.append(lock);
            }

            const title = document.createElement('strong');
            title.className = 'level-card__title';
            title.textContent = level.title;

            const summary = document.createElement('small');
            summary.className = 'level-card__summary';
            summary.textContent = level.summary;

            const meta = document.createElement('span');
            meta.className = 'level-card__meta';
            meta.textContent = completed ?
                `${safeLabel} · bäst ${bestScore}` :
                !unlocked ?
                    'Klara föregående nivå' :
                    `${safeLabel} · ${
                        Math.max(0, level.safe.y - level.start.y)
                    } m djup`;

            const content = document.createElement('span');
            content.className = 'level-card__content';
            content.append(top, title, summary, meta);

            card.append(previewFrame, content);
            this.levelSelect.append(card);
            this.renderLevelPreview(preview, level);
        });

        if (this.campaignProgress) {
            const completedCount = this.game.getCompletedLevelCount();
            this.campaignProgress.textContent =
                `${completedCount} av ${CAMPAIGN_LEVELS.length} klara`;
        }
    }

    renderLevelPreview(canvas, level) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;
        const padX = 7;
        const padY = 6;
        const mapWidth = width - padX * 2;
        const mapHeight = height - padY * 2;
        const xAt = column =>
            padX + Math.floor(column * mapWidth / GRID_WIDTH);
        const yAt = row =>
            padY + Math.floor(row * mapHeight / level.rows.length);

        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#050713';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#0c1021';
        ctx.fillRect(padX - 2, padY - 2, mapWidth + 4, mapHeight + 4);
        ctx.fillStyle = '#080b18';
        ctx.fillRect(padX, padY, mapWidth, mapHeight);

        level.rows.forEach((row, rowIndex) => {
            [...row].forEach((symbol, columnIndex) => {
                if (symbol === '.') return;

                const left = xAt(columnIndex);
                const right = xAt(columnIndex + 1);
                const top = yAt(rowIndex);
                const bottom = yAt(rowIndex + 1);
                const tileWidth = Math.max(1, right - left);
                const tileHeight = Math.max(1, bottom - top);

                if (symbol >= '0' && symbol <= '3') {
                    const palette = BLOCK_COLORS[Number(symbol)];
                    ctx.fillStyle = palette.shadow;
                    ctx.fillRect(left, top, tileWidth, tileHeight);
                    ctx.fillStyle = palette.color;
                    ctx.fillRect(
                        left + 1,
                        top,
                        Math.max(1, tileWidth - 2),
                        Math.max(1, tileHeight - 1)
                    );
                } else if (symbol === 'X') {
                    ctx.fillStyle = '#432536';
                    ctx.fillRect(left, top, tileWidth, tileHeight);
                    ctx.fillStyle = '#d85f7f';
                    ctx.fillRect(
                        left + Math.floor(tileWidth / 3),
                        top,
                        Math.max(1, Math.floor(tileWidth / 3)),
                        tileHeight
                    );
                } else {
                    ctx.fillStyle = symbol === '=' ? '#827985' : '#413c4b';
                    ctx.fillRect(left, top, tileWidth, tileHeight);
                    if (tileHeight > 1) {
                        ctx.fillStyle = '#a39ba6';
                        ctx.fillRect(left, top, tileWidth, 1);
                    }
                }
            });
        });

        for (const item of level.items) {
            const centerX = Math.floor((xAt(item.x) + xAt(item.x + 1)) / 2);
            const centerY = Math.floor((yAt(item.y) + yAt(item.y + 1)) / 2);
            ctx.fillStyle = item.kind === 'oxygen' ? '#69f3ff' : '#ffd65a';
            ctx.fillRect(centerX - 1, centerY - 1, 3, 3);
        }

        const safeAssetKey = SAFE_ASSET_KEYS[level.safe.type];
        const safeSprite = safeAssetKey ? ASSETS[safeAssetKey] : null;
        const safeCenterX = Math.floor(
            (xAt(level.safe.x) + xAt(level.safe.x + level.safe.width)) / 2
        );
        const safeCenterY = Math.min(
            height - 12,
            Math.floor(
                (
                    yAt(level.safe.y) +
                    yAt(level.safe.y + level.safe.height)
                ) / 2
            )
        );
        if (safeSprite) {
            ctx.drawImage(
                safeSprite,
                safeCenterX - 9,
                safeCenterY - 9,
                18,
                18
            );
        } else {
            ctx.fillStyle = '#d6a535';
            ctx.fillRect(safeCenterX - 6, safeCenterY - 5, 12, 10);
        }

        const startCenterX = Math.floor(
            (xAt(level.start.x) + xAt(level.start.x + 1)) / 2
        );
        const startCenterY = Math.floor(
            (yAt(level.start.y) + yAt(level.start.y + 1)) / 2
        );
        ctx.fillStyle = '#f4fbff';
        ctx.fillRect(startCenterX - 1, startCenterY - 1, 3, 3);
        ctx.fillStyle = '#73e8f6';
        ctx.fillRect(startCenterX, startCenterY, 1, 1);
    }

    createPuzzleButton(label, action, {
        value = null,
        primary = false,
        className = '',
        disabled = false,
    } = {}) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = [
            'menu-button',
            primary ? 'menu-button--primary' : '',
            className,
        ].filter(Boolean).join(' ');
        button.dataset.action = action;
        if (value !== null) button.dataset.value = String(value);
        button.disabled = disabled;
        button.textContent = label;
        return button;
    }

    appendPuzzleCloseButton(state) {
        if (!this.puzzleActions || state.solved) return;
        const label = this.game.puzzleContext === 'standalone' ?
            'Tillbaka till pusselvalet' :
            'Tillbaka till gruvan';
        this.puzzleActions.append(
            this.createPuzzleButton(label, 'puzzle-close')
        );
    }

    renderKeypadPuzzle(state) {
        const shell = document.createElement('div');
        shell.className = 'puzzle-keypad';

        const display = document.createElement('div');
        display.className = 'puzzle-keypad__display';
        if (state.phase === 'watch') {
            display.textContent = state.shownDigit ?? '·';
            display.classList.toggle(
                'is-lit',
                state.shownDigit !== null
            );
        } else if (state.phase === 'input') {
            display.textContent = state.code.map((digit, index) =>
                index < state.input.length ? state.input[index] : '–'
            ).join(' ');
        } else if (state.solved) {
            display.textContent = 'OPEN';
            display.classList.add('is-success');
        } else {
            display.textContent = state.code.map(() => '•').join(' ');
        }
        shell.append(display);

        const keypad = document.createElement('div');
        keypad.className = 'puzzle-keypad__grid';
        const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
        digits.forEach((digit, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'puzzle-key';
            button.dataset.action = 'puzzle-key';
            button.dataset.value = String(digit);
            button.textContent = String(digit);
            button.disabled = state.phase !== 'input';
            button.setAttribute('aria-label', `Siffra ${digit}`);
            if (digit === 0) button.classList.add('puzzle-key--zero');
            if (state.shownDigit === digit && state.phase === 'watch') {
                button.classList.add('is-lit');
            }
            if (index === 0 && state.phase === 'input') {
                button.classList.add('puzzle-control--primary');
            }
            keypad.append(button);
        });
        shell.append(keypad);
        this.puzzleBody.append(shell);

        if (state.phase === 'ready') {
            this.puzzleActions.append(
                this.createPuzzleButton(
                    state.misses > 0 ? 'Visa koden igen' : 'Visa koden',
                    'puzzle-begin',
                    { primary: true }
                )
            );
        } else if (state.phase === 'input') {
            this.puzzleActions.append(
                this.createPuzzleButton(
                    'Visa igen',
                    'puzzle-reset'
                )
            );
        }
        this.appendPuzzleCloseButton(state);
    }

    renderDialPuzzle(state, game) {
        const shell = document.createElement('div');
        shell.className = 'puzzle-dial';

        const locks = document.createElement('div');
        locks.className = 'puzzle-dial__locks';
        locks.setAttribute('aria-label',
            `${state.lockIndex} av ${state.targets.length} stift satta`
        );
        state.targets.forEach((target, index) => {
            const lock = document.createElement('span');
            lock.className = 'puzzle-dial__lock';
            lock.classList.toggle('is-set', index < state.lockIndex);
            lock.classList.toggle('is-current', index === state.lockIndex);
            lock.textContent = index < state.lockIndex ? '✓' : String(index + 1);
            locks.append(lock);
        });
        shell.append(locks);

        const dial = document.createElement('div');
        dial.className = 'puzzle-dial__face';
        const target = document.createElement('div');
        target.className = 'puzzle-dial__target';
        const currentTarget = state.targets[
            Math.min(state.lockIndex, state.targets.length - 1)
        ];
        const targetStart = currentTarget - state.targetWidth / 2;
        target.style.background = `conic-gradient(
            from ${targetStart}deg,
            rgba(105, 240, 177, 0.95) 0deg ${state.targetWidth}deg,
            transparent ${state.targetWidth}deg 360deg
        )`;

        const ticks = document.createElement('div');
        ticks.className = 'puzzle-dial__ticks';
        for (let index = 0; index < 12; index++) {
            const tick = document.createElement('span');
            tick.style.transform = `rotate(${index * 30}deg)`;
            ticks.append(tick);
        }

        const needle = document.createElement('div');
        needle.className = 'puzzle-dial__needle';
        needle.style.transform = `rotate(${state.angle}deg)`;
        const hub = document.createElement('div');
        hub.className = 'puzzle-dial__hub';
        dial.append(target, ticks, needle, hub);
        shell.append(dial);
        this.puzzleBody.append(shell);
        this.dialNeedle = needle;

        if (state.phase === 'ready') {
            this.puzzleActions.append(
                this.createPuzzleButton(
                    'Starta ratt',
                    'puzzle-begin',
                    { primary: true }
                )
            );
        } else if (state.phase === 'active') {
            if (game.reducedMotion) {
                this.puzzleActions.append(
                    this.createPuzzleButton(
                        '← Vrid',
                        'puzzle-dial-nudge',
                        { value: -8 }
                    )
                );
            }
            this.puzzleActions.append(
                this.createPuzzleButton(
                    'Lås stift',
                    'puzzle-dial-hit',
                    { primary: true }
                )
            );
            if (game.reducedMotion) {
                this.puzzleActions.append(
                    this.createPuzzleButton(
                        'Vrid →',
                        'puzzle-dial-nudge',
                        { value: 8 }
                    )
                );
            }
        }
        this.appendPuzzleCloseButton(state);
    }

    renderPipesPuzzle(state) {
        const failed = state.phase === 'failed' || state.timedOut === true;
        const shell = document.createElement('div');
        shell.className = 'puzzle-pipes';
        shell.classList.toggle('is-six', state.size === 6);
        shell.classList.add('is-pressure-flow');
        shell.classList.toggle('is-failed', failed);
        shell.classList.toggle('is-solved', state.solved);
        this.pipePuzzleShell = shell;

        const labels = document.createElement('div');
        labels.className = 'puzzle-pipes__labels';
        const anchorTotal = state.anchors.length;
        const anchorsPassed = state.anchors.filter(
            anchor => state.filled.has(anchor)
        ).length;
        labels.innerHTML =
            '<strong><i aria-hidden="true"></i> INMATNING</strong>' +
            (anchorTotal > 0 ?
                '<span class="puzzle-pipes__anchors">SÄKRINGAR ' +
                `${anchorsPassed}/${anchorTotal}</span>` :
                '<span>STRÖMFLÖDE</span>') +
            '<strong>UTGÅNG <i aria-hidden="true"></i></strong>';
        shell.append(labels);

        const board = document.createElement('div');
        board.className = 'puzzle-pipes__board';
        board.style.setProperty('--pipe-size', state.size);
        const grid = document.createElement('div');
        grid.className = 'puzzle-pipes__grid';
        grid.style.setProperty('--pipe-size', state.size);
        grid.classList.toggle('is-disabled', failed);
        this.pipePuzzleGrid = grid;
        this.pipeCells = [];
        state.cells.forEach((cell, index) => {
            const x = index % state.size;
            const y = Math.floor(index / state.size);
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'puzzle-pipe-cell';
            button.dataset.action = 'puzzle-pipe';
            button.dataset.value = String(index);
            button.disabled = failed || state.solved;
            button.classList.toggle(
                'is-covered',
                !cell.revealed && !state.filled.has(index)
            );
            button.classList.toggle(
                'is-selected',
                state.selectedIndex === index
            );
            button.classList.toggle('is-locked', state.filled.has(index));
            button.classList.toggle('is-welded', cell.welded === true);
            button.setAttribute(
                'aria-label',
                this.game.safePuzzle.getPipeLabel(index)
            );
            button.classList.toggle(
                'is-flowing',
                state.connected.has(index)
            );
            button.classList.toggle(
                'is-source',
                x === 0 && y === state.sourceY
            );
            button.classList.toggle('is-sink', state.sinks.includes(index));
            if (
                x === 0 &&
                y === state.sourceY &&
                !failed &&
                !state.solved
            ) {
                button.classList.add('puzzle-control--primary');
            }
            if (x === 0 && y === state.sourceY) {
                const port = document.createElement('span');
                port.className = 'puzzle-pipe-port puzzle-pipe-port--in';
                port.textContent = 'IN';
                port.setAttribute('aria-hidden', 'true');
                button.append(port);
            } else if (state.sinks.includes(index)) {
                const port = document.createElement('span');
                port.className = 'puzzle-pipe-port puzzle-pipe-port--out';
                port.textContent = 'UT';
                port.setAttribute('aria-hidden', 'true');
                button.append(port);
            }

            const pipe = document.createElement('span');
            pipe.className = `puzzle-pipe puzzle-pipe--${cell.type}`;
            pipe.style.setProperty(
                '--pipe-rotation',
                `${cell.rotation * 90}deg`
            );
            if (cell.type === 'tee' || cell.type === 'cross') {
                const junction = document.createElement('span');
                junction.className = 'puzzle-pipe__junction';
                junction.setAttribute('aria-hidden', 'true');
                pipe.append(junction);
            }
            button.append(pipe);
            const trailEntry = (state.trail || []).find(
                entry => entry.index === index
            );
            if (trailEntry) {
                const edgePoints = [
                    [50, 0],
                    [100, 50],
                    [50, 100],
                    [0, 50],
                ];
                const incoming = edgePoints[trailEntry.incoming];
                const trace = document.createElementNS(
                    'http://www.w3.org/2000/svg',
                    'svg'
                );
                trace.classList.add('puzzle-pipe-flow-trace');
                trace.setAttribute('viewBox', '0 0 100 100');
                trace.setAttribute('aria-hidden', 'true');
                // Ett T-kors får en linje per gren, alla ritade i takt.
                trailEntry.outgoings.forEach(direction => {
                    const outgoing = edgePoints[direction];
                    const tracePath = document.createElementNS(
                        'http://www.w3.org/2000/svg',
                        'path'
                    );
                    tracePath.setAttribute(
                        'd',
                        `M ${incoming[0]} ${incoming[1]} ` +
                        `L 50 50 L ${outgoing[0]} ${outgoing[1]}`
                    );
                    tracePath.setAttribute('pathLength', '1');
                    trace.append(tracePath);
                });
                button.append(trace);
                if (trailEntry.outgoings.length === 1) {
                    const flowHead = document.createElement('span');
                    flowHead.className = 'puzzle-pipe-flow-head';
                    flowHead.setAttribute('aria-hidden', 'true');
                    button.append(flowHead);
                }
            }
            if (!cell.revealed && !state.filled.has(index)) {
                const cover = document.createElement('span');
                cover.className = 'puzzle-pipe-cover';
                cover.innerHTML =
                    '<i aria-hidden="true"></i><b aria-hidden="true">?</b>';
                button.append(cover);
            }
            grid.append(button);
            this.pipeCells[index] = button;
        });
        const inTerminal = document.createElement('span');
        inTerminal.className =
            'puzzle-pipes__terminal puzzle-pipes__terminal--in';
        inTerminal.style.setProperty('--terminal-row', state.sourceY);
        inTerminal.setAttribute('aria-hidden', 'true');
        board.append(grid, inTerminal);
        // En pil per utgång, så två utgångar syns som två uttag.
        state.sinks.forEach(sinkIndex => {
            const outTerminal = document.createElement('span');
            outTerminal.className =
                'puzzle-pipes__terminal puzzle-pipes__terminal--out';
            outTerminal.style.setProperty(
                '--terminal-row',
                Math.floor(sinkIndex / state.size)
            );
            outTerminal.setAttribute('aria-hidden', 'true');
            board.append(outTerminal);
        });

        let failureBanner = null;
        if (failed) {
            const failure = document.createElement('div');
            failure.className = 'puzzle-pipes__failure';
            failure.setAttribute('role', 'alert');
            const failureIcon = document.createElement('span');
            failureIcon.className = 'puzzle-pipes__failure-icon';
            failureIcon.textContent = '!';
            failureIcon.setAttribute('aria-hidden', 'true');
            const failureCopy = document.createElement('span');
            const failureTitle = document.createElement('strong');
            const missadSäkring = state.flowBlockedReason === 'anchor';
            failureTitle.textContent = missadSäkring ?
                'SÄKRING FÖRBIGÅNGEN' :
                'KRETSEN BRÖTS';
            const failureHint = document.createElement('small');
            failureHint.textContent = Number.isInteger(state.flowBlockedIndex) ?
                (missadSäkring ? 'Säkringen är markerad på rad ' : 'Brottet är markerat på rad ') +
                `${Math.floor(state.flowBlockedIndex / state.size) + 1}` +
                ', kolumn ' +
                `${state.flowBlockedIndex % state.size + 1}.` :
                'Se hur ledarna sitter innan du försöker igen.';
            failureCopy.append(failureTitle, failureHint);
            failure.append(failureIcon, failureCopy);
            failureBanner = failure;
        }

        const legend = document.createElement('div');
        legend.className = 'puzzle-pipes__legend';
        legend.innerHTML = anchorTotal > 0 ?
            '<span><b>1</b> Avtäck</span>' +
            '<span><b>2</b> Byt plats</span>' +
            '<span class="puzzle-pipes__anchors"><b>!</b> ' +
            'Dra strömmen genom de gula</span>' :
            '<span><b>1</b> Avtäck</span>' +
            '<span><b>2</b> Markera</span>' +
            '<span><b>3</b> Byt plats</span>';
        shell.append(failureBanner || legend, board);
        this.puzzleBody.append(shell);

        if (failed) {
            this.puzzleActions.append(
                this.createPuzzleButton(
                    'Försök igen',
                    'puzzle-reset',
                    { primary: true }
                )
            );
        } else if (!state.solved) {
            this.puzzleActions.append(
                this.createPuzzleButton('Starta om krets', 'puzzle-reset')
            );
        }
        this.appendPuzzleCloseButton(state);
        this.syncPipesFlow(state);
    }

    syncPipesFlow(state) {
        if (
            state.type !== 'pipes' ||
            this.pipeCells.length === 0
        ) return;

        const presentation =
            this.game.safePuzzle.getPipeFlowPresentation(
                state,
                this.game.reducedMotion
            );
        this.lastPipeFlowFrame = presentation.frame;

        this.pipeCells.forEach((cell, index) => {
            cell.classList.toggle(
                'is-flowing',
                presentation.visible.has(index)
            );
            cell.classList.toggle(
                'is-flow-head',
                presentation.leading.has(index)
            );
            cell.classList.toggle(
                'is-pulse-blocked',
                presentation.blocked.has(index)
            );
            if (!presentation.leading.has(index)) return;

            const entry = presentation.trail.find(
                item => item.index === index
            );
            if (!entry) return;
            const edgePoints = [
                [50, 11],
                [89, 50],
                [50, 89],
                [11, 50],
            ];
            const incoming = edgePoints[entry.incoming];
            const outgoing = edgePoints[entry.outgoings[0]];
            if (!incoming || !outgoing) return;
            const progress = Math.max(
                0,
                Math.min(1, Number(presentation.progress) || 0)
            );
            const legProgress = progress < 0.5 ?
                progress * 2 :
                (progress - 0.5) * 2;
            const from = progress < 0.5 ? incoming : [50, 50];
            const to = progress < 0.5 ? [50, 50] : outgoing;
            const x = from[0] + (to[0] - from[0]) * legProgress;
            const y = from[1] + (to[1] - from[1]) * legProgress;
            cell.style.setProperty('--flow-head-x', `${x}%`);
            cell.style.setProperty('--flow-head-y', `${y}%`);
            cell.querySelectorAll('.puzzle-pipe-flow-trace path')
                .forEach(trace => {
                    trace.style.strokeDashoffset = String(1 - progress);
                });
        });
    }

    getPuzzleFocusIdentity() {
        const active = document.activeElement;
        if (!this.screens.puzzle?.contains(active)) return null;
        return {
            action: active.dataset?.action || '',
            value: active.dataset?.value || '',
        };
    }

    restorePuzzleFocus(identity) {
        if (!identity || this.game.gameState !== 'puzzle') return;
        const controls = [
            ...this.screens.puzzle.querySelectorAll('button:not(:disabled)')
        ];
        const match = controls.find(control =>
            control.dataset.action === identity.action &&
            (control.dataset.value || '') === identity.value
        );
        this.focusMenuControl(
            match ||
            this.screens.puzzle.querySelector(
                '.menu-button--primary, .puzzle-control--primary, button:not(:disabled)'
            )
        );
    }

    syncPuzzle(game) {
        const state = game.safePuzzle?.state;
        if (!state) {
            this.lastPuzzleRevision = -1;
            this.lastPuzzlePhase = null;
            return;
        }

        if (this.lastPuzzleRevision !== game.safePuzzle.revision) {
            const focusIdentity = this.getPuzzleFocusIdentity();
            const phaseChanged = this.lastPuzzlePhase !== state.phase;
            this.lastPuzzleRevision = game.safePuzzle.revision;
            this.lastPuzzlePhase = state.phase;
            const meta = SAFE_PUZZLE_META[state.type];
            this.puzzleEyebrow.textContent = meta.eyebrow;
            this.puzzleTitle.textContent = meta.title;
            this.puzzleCopy.textContent = meta.copy;
            this.puzzleDifficulty.textContent = `Låsgrad ${state.difficulty}`;
            this.puzzleStatus.textContent = state.status;
            this.puzzleStatus.classList.toggle('is-success', state.solved);
            this.puzzleStatus.classList.toggle('is-critical', false);
            this.puzzleStatus.classList.toggle(
                'is-failure',
                state.type === 'pipes' && state.phase === 'failed'
            );
            this.puzzleBody.replaceChildren();
            this.puzzleActions.replaceChildren();
            this.dialNeedle = null;
            this.pipePuzzleShell = null;
            this.pipePuzzleGrid = null;
            this.pipeCells = [];
            this.lastPipeFlowFrame = null;

            if (state.type === 'keypad') {
                this.renderKeypadPuzzle(state);
            } else if (state.type === 'dial') {
                this.renderDialPuzzle(state, game);
            } else {
                this.renderPipesPuzzle(state);
            }
            if (
                game.gameState === 'puzzle' &&
                state.type === 'keypad' &&
                state.phase === 'input' &&
                phaseChanged
            ) {
                this.focusMenuControl(
                    this.screens.puzzle.querySelector(
                        '.puzzle-control--primary'
                    )
                );
            } else if (
                game.gameState === 'puzzle' &&
                state.type === 'pipes' &&
                state.phase === 'active' &&
                phaseChanged
            ) {
                this.focusMenuControl(
                    this.screens.puzzle.querySelector(
                        '.puzzle-control--primary'
                    )
                );
            } else {
                this.restorePuzzleFocus(focusIdentity);
            }
        }

        if (state.type === 'dial' && this.dialNeedle) {
            this.dialNeedle.style.transform = `rotate(${state.angle}deg)`;
        } else if (state.type === 'pipes') {
            this.syncPipesFlow(state);
        }
    }

    sync(game) {
        if (!this.enabled) return;

        this.syncPuzzle(game);
        const airPercent = Math.max(0, Math.min(1, game.oxygen / game.maxOxygen));
        if (this.level) {
            this.level.textContent =
                `${game.currentLevelIndex + 1}/${CAMPAIGN_LEVELS.length}`;
        }
        this.depth.textContent = Math.max(0, game.depth).toString();
        this.score.textContent = game.score.toString();
        this.air.textContent = `${Math.floor(game.oxygen)}%`;
        this.airFill.style.transform = `scaleX(${airPercent})`;
        this.airModule.classList.toggle('is-low', airPercent <= 0.25);

        const deathPresentation = game.deathCause === 'crushed' ? {
            eyebrow: 'Rasvarning',
            title: 'Krossad av raset',
            copy: 'Flytta dig ur kolumnen så fort blocken börjar skaka.',
        } : game.deathCause === 'oxygen' ? {
            eyebrow: 'Luften tog slut',
            title: 'Slut på syre',
            copy: 'Planera en väg till nästa syretub och lämna marginal för returen.',
        } : {
            eyebrow: 'Kuppen misslyckades',
            title: 'Gruvan vann',
            copy: 'Försök igen och ta dig djupare nästa gång.',
        };
        if (this.gameoverEyebrow) {
            this.gameoverEyebrow.textContent = deathPresentation.eyebrow;
        }
        if (this.gameoverTitle) {
            this.gameoverTitle.textContent = deathPresentation.title;
        }
        if (this.gameoverCopy) {
            this.gameoverCopy.textContent = deathPresentation.copy;
        }
        this.gameoverScore.textContent = game.score.toString();
        this.gameoverDepth.textContent = `${game.depth} m`;

        const isFinalLevel =
            game.currentLevelIndex === CAMPAIGN_LEVELS.length - 1;
        if (this.wonEyebrow) {
            this.wonEyebrow.textContent =
                `Nivå ${game.currentLevelIndex + 1} av ${CAMPAIGN_LEVELS.length} klar`;
        }
        if (this.wonTitle) {
            this.wonTitle.textContent = game.currentLevel.completeTitle;
        }
        if (this.wonCopy) {
            this.wonCopy.textContent = isFinalLevel ?
                'Det sista kassaskåpet är öppet. Kuppen är klar.' :
                game.newlyUnlockedLevelIndex === game.currentLevelIndex + 1 ?
                    `${CAMPAIGN_LEVELS[game.currentLevelIndex + 1].title} är nu upplåst.` :
                    `${CAMPAIGN_LEVELS[game.currentLevelIndex + 1].title} väntar.`;
        }
        if (this.wonPrimaryButton) {
            this.wonPrimaryButton.dataset.action = isFinalLevel ?
                'start-level' :
                'next-level';
            if (isFinalLevel) {
                this.wonPrimaryButton.dataset.level = '0';
            } else {
                delete this.wonPrimaryButton.dataset.level;
            }
            this.wonPrimaryButton.textContent = isFinalLevel ?
                'Spela från början' :
                `Fortsätt till nivå ${game.currentLevelIndex + 2}`;
        }
        this.wonScore.textContent = game.lastLevelScore.toString();
        this.wonAir.textContent = `${Math.floor(game.oxygen)}%`;

        const hideHud =
            game.gameState === 'menu' ||
            game.gameState === 'puzzle-select' ||
            (
                game.gameState === 'puzzle' &&
                game.puzzleContext === 'standalone'
            );
        this.hud.hidden = hideHud;
        this.pauseButton.hidden = game.gameState !== 'playing';
        if (this.touchControls) {
            const showTouchControls =
                game.touch.available && game.gameState === 'playing';
            if (this.touchControls.hidden === showTouchControls) {
                this.touchControls.hidden = !showTouchControls;
                if (!showTouchControls) game.touch.release();
            }
        }
        const showSideDrillHint =
            game.gameState === 'playing' &&
            !game.hasSideDrilled &&
            (
                game.depth < 7 ||
                (
                    game.player.isGrounded &&
                    game.player.showDrill &&
                    (game.player.facing === 'left' || game.player.facing === 'right')
                )
            );
        this.sideDrillHint.hidden = !showSideDrillHint;
        this.countdown.hidden = game.gameState !== 'countdown';
        if (game.gameState === 'countdown') {
            this.countdown.textContent = Math.max(1, game.countdownNumber).toString();
        }

        const activeScreen = this.screens[game.gameState] || null;
        for (const screen of Object.values(this.screens)) {
            if (!screen) continue;
            const isActive = screen === activeScreen;
            screen.hidden = !isActive;
            screen.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        }

        const activeWarning = game.gameState === 'playing' ?
            game.warningMessage :
            null;
        const toastMessage = game.gameState === 'playing' ?
            (activeWarning || game.gamepadMessage) :
            null;
        this.toast.classList.toggle('is-danger', Boolean(activeWarning));
        this.toast.setAttribute(
            'role',
            activeWarning ? 'alert' : 'status'
        );
        this.toast.setAttribute(
            'aria-live',
            activeWarning ? 'assertive' : 'polite'
        );
        if (toastMessage) {
            this.toast.textContent = toastMessage;
        }
        this.toast.hidden = !toastMessage;

        if (this.lastState !== game.gameState) {
            this.lastState = game.gameState;
            const primaryButton =
                activeScreen?.querySelector(
                    '.menu-button--primary, .puzzle-control--primary'
                ) ||
                activeScreen?.querySelector(
                    '.level-card.is-current:not(:disabled), .level-card:not(:disabled)'
                ) ||
                activeScreen?.querySelector(
                    '.menu-button, button:not(:disabled)'
                );
            this.focusMenuControl(primaryButton);
        }
    }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.frame = document.getElementById('gameFrame') || this.canvas.parentElement;
        
        this.gamepad = new GamepadHandler();
        this.touch = new TouchControls();
        this.touch.attach(
            document.getElementById('touchStickZone'),
            document.getElementById('touchStick'),
            document.getElementById('touchDrill')
        );
        this.sound = new ArcadeSound();
        
        this.grid = [];
        this.colorBlocks = [];
        this.xBlocks = [];
        this.nextColorBlockId = 1;
        this.colorComponentStates = new Map();
        
        this.player = {
            // Grid position (logical)
            gridX: Math.floor(GRID_WIDTH / 2),
            gridY: 2,
            // Visual position (for smooth interpolation)
            visualX: Math.floor(GRID_WIDTH / 2) * GRID_SIZE,
            visualY: 2 * GRID_SIZE,
            // Legacy x/y for compatibility
            get x() { return this.visualX; },
            set x(val) { this.visualX = val; this.gridX = Math.round(val / GRID_SIZE); },
            get y() { return this.visualY; },
            set y(val) { this.visualY = val; this.gridY = Math.round(val / GRID_SIZE); },
            
            facing: 'down',
            isGrounded: false,
            isFalling: false,
            fallVelocity: 0,
            fallStartY: 0,
            fallDistance: 0,
            landingTimer: 0,
            
            // Movement
            moveTimer: 0,
            moveCooldown: 0.12, // Slower, more deliberate movement
            isMoving: false,
            moveAnimFrame: 0,
            isSteppingUp: false,
            stepUpProgress: 0,
            stepUpStartX: 0,
            stepUpStartY: 0,
            stepUpTargetX: 0,
            stepUpTargetY: 0,
            stepUpHoldTimer: 0,
            stepUpHoldDirection: 0,
            
            // Drilling
            digCooldown: 0,
            digBufferTimer: 0,
            isDrilling: false,
            drillAnimFrame: 0,
            drillAnimTimer: 0,
            drillLockTimer: 0,
            drillSnapTargetX: null,
            drillMadeContact: false,
            showDrill: false, // True when facing a block
        };
        
        this.oxygen = 100;
        this.maxOxygen = 100;
        this.score = 0;
        this.depth = 0;
        this.cameraY = 0;
        
        this.oxygenTubes = [];
        this.treasures = []; // Coins, bags, chests
        this.itemsByCell = new Map();
        this.reinforcedRoofCells = new Set();
        this.safe = null;
        this.debrisParticles = [];
        this.screenShake = 0;
        this.screenShakePhase = 0;
        this.visualTime = 0;
        this.reducedMotionQuery = window.matchMedia?.(
            '(prefers-reduced-motion: reduce)'
        );
        this.reducedMotion = Boolean(this.reducedMotionQuery?.matches);
        this.reducedMotionQuery?.addEventListener?.('change', event => {
            this.reducedMotion = event.matches;
            if (event.matches) this.screenShake = 0;
        });
        
        this.keys = {};
        this.keysJustPressed = {};
        this.lastTime = 0;
        this.lastRenderedState = null;
        this.currentLevelIndex = 0;
        this.levelStartScore = 0;
        this.levelHeight = GRID_HEIGHT;
        
        this.gameState = 'menu';
        this.isWindowActive = !document.hidden;
        this.countdownTimer = 0;
        this.countdownNumber = 3;
        this.hasPlayerDug = false; // Physics paused until first dig
        this.hasSideDrilled = false;
        this.lastDestroyedItemType = null;
        this.pendingMatchCheck = false;
        this.deathCause = null;
        this.deathTimer = 0;
        this.deathImpact = null;
        this.warningMessage = null;
        this.warningMessageTimer = 0;
        this.hasShownFallWarning = false;
        
        this.gamepadMessage = null;
        this.gamepadMessageTime = 0;
        this.progress = this.loadProgress();
        this.lastLevelScore = 0;
        this.newlyUnlockedLevelIndex = null;
        this.safePuzzle = new SafePuzzleEngine();
        this.puzzleContext = null;
        this.standalonePuzzleRun = 0;
        this.safeContactArmed = true;
        this.puzzleBonus = 0;
        this.boundGameLoop = this.gameLoop.bind(this);
        this.ui = new GameUI(this);
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('pointerdown', () => this.sound.unlock(), { passive: true });
        
        this.init();
    }

    clearKeyboardInput() {
        this.keys = {};
        this.keysJustPressed = {};
    }
    
    resize() {
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        const gameAspect = GRID_WIDTH / VIEWPORT_HEIGHT;
        const windowAspect = windowWidth / windowHeight;
        
        if (windowAspect > gameAspect) {
            SCALE = windowHeight / (VIEWPORT_HEIGHT * GRID_SIZE);
        } else {
            SCALE = windowWidth / (GRID_WIDTH * GRID_SIZE);
        }
        
        // Ramens luftmarginal kostar mer än den ger på en liten skärm.
        const coarsePointer =
            window.matchMedia?.('(pointer: coarse)')?.matches === true;
        SCALE *= coarsePointer ? 0.995 : 0.95;
        
        CANVAS_WIDTH = GRID_WIDTH * GRID_SIZE;
        CANVAS_HEIGHT = VIEWPORT_HEIGHT * GRID_SIZE;
        
        this.canvas.width = CANVAS_WIDTH;
        this.canvas.height = CANVAS_HEIGHT;
        this.ctx.imageSmoothingEnabled = false;
        this.lastRenderedState = null;
        this.lightingOverlay = null;
        this.postProcessOverlay = null;
        this.playerLightSprite = null;
        this.dynamicLightMap = null;
        this.glowSprites = null;
        this.spriteSilhouetteCache = null;

        const displayWidth = CANVAS_WIDTH * SCALE;
        const displayHeight = CANVAS_HEIGHT * SCALE;
        if (this.frame) {
            this.frame.style.width = `${displayWidth}px`;
            this.frame.style.height = `${displayHeight}px`;
            this.frame.style.setProperty('--game-scale', SCALE.toString());
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
        } else {
            this.canvas.style.width = `${displayWidth}px`;
            this.canvas.style.height = `${displayHeight}px`;
        }
    }
    
    init() {
        this.loadLevel(0, {
            score: 0,
            checkpoint: 0,
            state: 'menu',
        });
        
        window.addEventListener('keydown', e => {
            this.sound.unlock();
            const isUiControl = Boolean(e.target?.closest?.('button'));
            const isPauseShortcut =
                e.key === 'Escape' ||
                e.key === 'p' ||
                e.key === 'P';
            if (isUiControl && !isPauseShortcut) return;

            if (!this.keys[e.key]) {
                this.keysJustPressed[e.key] = true;
            }
            this.keys[e.key] = true;
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
                e.preventDefault();
            }
            
            // G key to cycle through gamepads
            if (e.key === 'g' || e.key === 'G') {
                this.cycleGamepad();
            }
        });
        
        window.addEventListener('keyup', e => {
            const isPauseShortcut =
                e.key === 'Escape' ||
                e.key === 'p' ||
                e.key === 'P';
            if (e.target?.closest?.('button') && !isPauseShortcut) return;
            this.keys[e.key] = false;
        });
        
        requestAnimationFrame(this.boundGameLoop);
    }
    
    generateLevel() {
        const safeStartY = GRID_HEIGHT - 4;
        const safeStartX = Math.floor((GRID_WIDTH - 2) / 2);
        const midX = Math.floor(GRID_WIDTH / 2);

        const shuffle = array => {
            const copy = [...array];
            for (let i = copy.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [copy[i], copy[j]] = [copy[j], copy[i]];
            }
            return copy;
        };

        const getPotentialClusterSize = (x, y, colorIndex) => {
            const targetValue = colorIndex + BLOCK_TYPES.COLORED;
            const visited = new Set([`${x},${y}`]);
            const queue = [[x, y]];
            let size = 0;

            while (queue.length > 0) {
                const [currentX, currentY] = queue.shift();
                size++;

                const neighbors = [
                    [currentX, currentY - 1],
                    [currentX + 1, currentY],
                    [currentX, currentY + 1],
                    [currentX - 1, currentY],
                ];

                for (const [nextX, nextY] of neighbors) {
                    const key = `${nextX},${nextY}`;
                    if (visited.has(key)) continue;
                    if (this.grid[nextY]?.[nextX] !== targetValue) continue;
                    visited.add(key);
                    queue.push([nextX, nextY]);
                }
            }

            return size;
        };

        const pickColorIndex = (x, y) => {
            const allColors = BLOCK_COLORS
                .slice(0, ACTIVE_COLOR_COUNT)
                .map((_, index) => index);
            const validColors = shuffle(allColors).filter(colorIndex =>
                getPotentialClusterSize(x, y, colorIndex) <= MAX_GENERATED_CLUSTER_SIZE
            );
            const candidateColors = validColors.length > 0 ? validColors : shuffle(allColors);
            const neighborColors = [];
            const left = this.grid[y]?.[x - 1];
            const up = this.grid[y - 1]?.[x];
            
            if (isColoredBlockValue(left)) {
                const leftColor = left - BLOCK_TYPES.COLORED;
                if (candidateColors.includes(leftColor)) {
                    neighborColors.push(leftColor);
                }
            }
            if (isColoredBlockValue(up)) {
                const upColor = up - BLOCK_TYPES.COLORED;
                if (candidateColors.includes(upColor)) {
                    neighborColors.push(upColor);
                }
            }
            
            if (neighborColors.length > 0 && Math.random() < COLOR_NEIGHBOR_PREFERENCE) {
                return neighborColors[Math.floor(Math.random() * neighborColors.length)];
            }
            
            return candidateColors[0];
        };

        for (let y = 4; y < GRID_HEIGHT - 3; y++) {
            for (let x = 0; x < GRID_WIDTH; x++) {
                const isSafeCell = y >= safeStartY && y < safeStartY + 2 &&
                    x >= safeStartX && x < safeStartX + 2;
                if (isSafeCell) continue;
                
                // Air pocket chance
                const distFromMid = Math.abs(x - midX);
                const airChance = distFromMid <= 1 ? 0.01 : 0.02;
                
                if (Math.random() < airChance) {
                    this.grid[y][x] = BLOCK_TYPES.EMPTY;
                    continue;
                }
                
                // X-block chance (increases with depth)
                const depthFactor = y / GRID_HEIGHT;
                const xBlockChance = 0.06 + depthFactor * 0.10;
                
                if (Math.random() < xBlockChance) {
                    const xBlock = new XBlock(x, y);
                    this.xBlocks.push(xBlock);
                    this.grid[y][x] = BLOCK_TYPES.XBLOCK;
                    continue;
                }

                const colorIndex = pickColorIndex(x, y);
                this.colorBlocks.push(new ColoredBlock(this.nextColorBlockId++, x, y, colorIndex));
                this.grid[y][x] = colorIndex + BLOCK_TYPES.COLORED;
            }
        }

        // First let the terrain find a stable resting state. Item pockets are
        // carved afterwards, so nothing can settle into the same cell as loot.
        this.settleInitialBoard();
        this.createItemPockets(shuffle, safeStartY, safeStartX);
    }

    createItemPockets(shuffle, safeStartY, safeStartX) {
        const isSafeCell = (x, y) =>
            y >= safeStartY && y < safeStartY + 2 &&
            x >= safeStartX && x < safeStartX + 2;
        const isSolidTerrain = value =>
            isColoredBlockValue(value) ||
            value === BLOCK_TYPES.XBLOCK ||
            value === BLOCK_TYPES.BEDROCK;
        const neighbors = [
            [-1, -1], [0, -1], [1, -1],
            [-1, 0],           [1, 0],
            [-1, 1],  [0, 1], [1, 1],
        ];
        const candidates = [];

        for (let y = 6; y <= safeStartY - 2; y++) {
            for (let x = 1; x < GRID_WIDTH - 1; x++) {
                if (isSafeCell(x, y) || !isColoredBlockValue(this.grid[y]?.[x])) {
                    continue;
                }

                const hasCompleteRing = neighbors.every(([offsetX, offsetY]) => {
                    const ringX = x + offsetX;
                    const ringY = y + offsetY;
                    return !isSafeCell(ringX, ringY) &&
                        isSolidTerrain(this.grid[ringY]?.[ringX]);
                });

                if (hasCompleteRing) {
                    candidates.push({ x, y });
                }
            }
        }

        const available = shuffle(candidates);
        const selected = [];
        const pocketSpecs = [
            { kind: 'treasure', type: 'chest', value: 500, targetY: 42, minY: 28 },
            { kind: 'treasure', type: 'chest', value: 500, targetY: 34, minY: 28 },
            { kind: 'oxygen', targetY: 8 },
            { kind: 'treasure', type: 'coin', value: 50, targetY: 10 },
            { kind: 'oxygen', targetY: 14 },
            { kind: 'treasure', type: 'coin', value: 50, targetY: 16 },
            { kind: 'treasure', type: 'bag', value: 200, targetY: 19 },
            { kind: 'oxygen', targetY: 20 },
            { kind: 'treasure', type: 'coin', value: 50, targetY: 23 },
            { kind: 'oxygen', targetY: 26 },
            { kind: 'treasure', type: 'coin', value: 50, targetY: 28 },
            { kind: 'treasure', type: 'bag', value: 200, targetY: 30 },
            { kind: 'oxygen', targetY: 32 },
            { kind: 'treasure', type: 'coin', value: 50, targetY: 34 },
            { kind: 'treasure', type: 'bag', value: 200, targetY: 37 },
            { kind: 'oxygen', targetY: 38 },
            { kind: 'treasure', type: 'coin', value: 50, targetY: 40 },
            { kind: 'oxygen', targetY: 43 },
            { kind: 'treasure', type: 'coin', value: 50, targetY: 44 },
        ];

        const takePocket = spec => {
            const eligible = available
                .filter(pocket => pocket.y >= (spec.minY || 6))
                .filter(pocket => selected.every(chosen =>
                    Math.max(
                        Math.abs(chosen.x - pocket.x),
                        Math.abs(chosen.y - pocket.y)
                    ) > 1
                ))
                .sort((a, b) =>
                    Math.abs(a.y - spec.targetY) - Math.abs(b.y - spec.targetY)
                );

            const pocket = eligible[0];
            if (!pocket) return null;

            available.splice(available.indexOf(pocket), 1);
            selected.push(pocket);
            return pocket;
        };

        const reinforcePocketRoof = pocket => {
            for (let offsetX = -1; offsetX <= 1; offsetX++) {
                const roofX = pocket.x + offsetX;
                const roofY = pocket.y - 1;
                const colorBlock = this.colorBlocks.find(block =>
                    !block.destroyed && block.x === roofX && block.y === roofY
                );
                const xBlock = this.xBlocks.find(block =>
                    !block.destroyed && block.x === roofX && block.y === roofY
                );

                if (colorBlock) colorBlock.destroyed = true;
                if (xBlock) xBlock.destroyed = true;
                this.grid[roofY][roofX] = BLOCK_TYPES.BEDROCK;
                this.reinforcedRoofCells.add(`${roofX},${roofY}`);
            }
        };

        for (const spec of pocketSpecs) {
            const pocket = takePocket(spec);
            if (!pocket) continue;

            const centerBlock = this.colorBlocks.find(block =>
                !block.destroyed && block.x === pocket.x && block.y === pocket.y
            );
            if (!centerBlock) continue;

            centerBlock.destroyed = true;
            this.grid[pocket.y][pocket.x] = BLOCK_TYPES.ITEM;
            if (spec.kind === 'oxygen') {
                reinforcePocketRoof(pocket);
            }

            const item = {
                x: pocket.x * GRID_SIZE + GRID_SIZE / 2,
                y: pocket.y * GRID_SIZE + GRID_SIZE / 2,
                gridX: pocket.x,
                gridY: pocket.y,
                type: spec.type || 'oxygen',
                value: spec.value || 0,
                collected: false,
                destroyed: false,
            };
            const key = `${pocket.x},${pocket.y}`;
            this.itemsByCell.set(key, item);

            if (spec.kind === 'oxygen') {
                this.oxygenTubes.push(item);
            } else {
                this.treasures.push(item);
            }
        }

        this.colorBlocks = this.colorBlocks.filter(block => !block.destroyed);
        this.xBlocks = this.xBlocks.filter(block => !block.destroyed);
    }
    
    getInput() {
        // Combine keyboard, gamepad and touch input
        const gp = this.gamepad.getInput();
        const tc = this.touch.getInput();

        return {
            left: this.keys['ArrowLeft'] || this.keys['a'] || gp?.left || tc.left,
            right: this.keys['ArrowRight'] || this.keys['d'] || gp?.right || tc.right,
            up: this.keys['ArrowUp'] || this.keys['w'] || gp?.up || tc.up,
            down: this.keys['ArrowDown'] || this.keys['s'] || gp?.down || tc.down,
            dig: this.keys[' '] || gp?.dig || tc.dig,
            digJustPressed: this.keysJustPressed[' '] || gp?.digJustPressed || tc.digJustPressed,
            pauseJustPressed: gp?.pauseJustPressed,
            // Direction just pressed (for facing changes)
            leftJustPressed: this.keysJustPressed['ArrowLeft'] || this.keysJustPressed['a'] || gp?.leftJustPressed || tc.leftJustPressed,
            rightJustPressed: this.keysJustPressed['ArrowRight'] || this.keysJustPressed['d'] || gp?.rightJustPressed || tc.rightJustPressed,
            upJustPressed: this.keysJustPressed['ArrowUp'] || this.keysJustPressed['w'] || gp?.upJustPressed || tc.upJustPressed,
            downJustPressed: this.keysJustPressed['ArrowDown'] || this.keysJustPressed['s'] || gp?.downJustPressed || tc.downJustPressed,
        };
    }
    
    update(deltaTime) {
        const input = this.getInput();
        const pausePressed =
            this.keysJustPressed['Escape'] ||
            this.keysJustPressed['p'] ||
            this.keysJustPressed['P'] ||
            input.pauseJustPressed;

        if (this.gameState === 'menu') {
            this.updateEffects(deltaTime * 0.35);
            if (input.digJustPressed || this.keysJustPressed['Enter']) {
                this.startRun();
            }
            this.keysJustPressed = {};
            return;
        }

        if (this.gameState === 'puzzle-select') {
            this.updateEffects(deltaTime * 0.35);
            this.keysJustPressed = {};
            return;
        }

        if (this.gameState === 'paused') {
            if (pausePressed || input.digJustPressed || this.keysJustPressed['Enter']) {
                this.resumeGame();
            }
            this.keysJustPressed = {};
            return;
        }

        if (this.gameState === 'puzzle') {
            if (!this.isWindowActive) {
                this.keysJustPressed = {};
                return;
            }
            this.updateEffects(deltaTime * 0.25);
            const puzzleState = this.safePuzzle.state;
            if (
                puzzleState?.type === 'dial' &&
                puzzleState.manual !== this.reducedMotion
            ) {
                puzzleState.manual = this.reducedMotion;
                this.safePuzzle.touch();
            }
            const previousPipeFill =
                puzzleState?.type === 'pipes' ?
                    puzzleState.filled.size :
                    0;
            const previousPipePhase =
                puzzleState?.type === 'pipes' ?
                    puzzleState.flowPhase :
                    null;
            if (pausePressed) {
                this.cancelSafePuzzle();
            } else if (this.safePuzzle.update(deltaTime)) {
                this.completeSafePuzzle();
            } else if (puzzleState?.type === 'pipes') {
                if (puzzleState.filled.size > previousPipeFill) {
                    const pressure =
                        Math.min(5, puzzleState.filled.size) * 18;
                    this.sound.playTone(
                        150 + pressure,
                        92 + pressure,
                        0.1,
                        0.022,
                        'triangle'
                    );
                }
                if (
                    previousPipePhase !== 'failed' &&
                    puzzleState.flowPhase === 'failed'
                ) {
                    this.sound.playTone(
                        180,
                        48,
                        0.28,
                        0.05,
                        'sawtooth'
                    );
                }
            }
            this.keysJustPressed = {};
            return;
        }

        this.updateEffects(deltaTime);

        if (this.gameState === 'countdown') {
            this.countdownTimer += deltaTime;
            if (this.countdownTimer >= 0.8) {
                this.countdownTimer = 0;
                this.countdownNumber--;
                if (this.countdownNumber <= 0) {
                    this.gameState = 'playing';
                }
            }
            this.keysJustPressed = {};
            return;
        }

        if (this.gameState === 'dying') {
            this.deathTimer = Math.max(0, this.deathTimer - deltaTime);
            if (this.deathTimer === 0) {
                this.gameState = 'gameover';
            }
            this.keysJustPressed = {};
            return;
        }
        
        if (this.gameState === 'gameover') {
            if (this.keysJustPressed['Enter'] || input.digJustPressed) {
                this.retryCurrentLevel();
            }
            this.keysJustPressed = {};
            return;
        }

        if (this.gameState === 'won') {
            if (this.keysJustPressed['Enter'] || input.digJustPressed) {
                if (this.hasNextLevel()) {
                    this.advanceLevel();
                } else {
                    this.startLevel(0);
                }
            }
            this.keysJustPressed = {};
            return;
        }

        if (pausePressed) {
            this.pauseGame();
            this.keysJustPressed = {};
            return;
        }
        
        this.updatePlayer(deltaTime, input);
        if (this.gameState === 'playing') {
            this.checkWinCondition();
        }
        if (this.gameState === 'playing') {
            this.updatePhysics(deltaTime);
        }
        if (this.gameState === 'playing') {
            this.updateOxygen(deltaTime);
        }
        this.updateCamera(deltaTime);
        
        this.keysJustPressed = {};
    }
    
    updateEffects(deltaTime) {
        this.visualTime += deltaTime;
        this.screenShakePhase += deltaTime * 52;
        this.screenShake = Math.max(0, this.screenShake - deltaTime * 34);

        for (const xBlock of this.xBlocks) {
            xBlock.hitFlash = Math.max(0, xBlock.hitFlash - deltaTime);
        }

        for (const particle of this.debrisParticles) {
            particle.life -= deltaTime;
            particle.x += particle.vx * deltaTime;
            particle.y += particle.vy * deltaTime;
            particle.vy += (particle.gravity ?? 760) * deltaTime;
            particle.vx *= Math.pow(particle.drag ?? 0.08, deltaTime);
        }

        this.debrisParticles = this.debrisParticles.filter(particle => particle.life > 0);

        if (this.warningMessageTimer > 0) {
            this.warningMessageTimer = Math.max(
                0,
                this.warningMessageTimer - deltaTime
            );
            if (this.warningMessageTimer === 0) {
                this.warningMessage = null;
            }
        }

        if (this.gamepadMessage && Date.now() - this.gamepadMessageTime > 3000) {
            this.gamepadMessage = null;
        }
    }

    updatePlayer(deltaTime, input = this.getInput()) {
        const p = this.player;

        p.moveTimer += deltaTime;
        p.digCooldown = Math.max(0, p.digCooldown - deltaTime);
        p.digBufferTimer = Math.max(0, p.digBufferTimer - deltaTime);
        p.drillLockTimer = Math.max(0, p.drillLockTimer - deltaTime);
        p.landingTimer = Math.max(0, p.landingTimer - deltaTime);

        if (input.digJustPressed) {
            p.digBufferTimer = DIG_BUFFER_DURATION;
        }

        const directionChanged = input.leftJustPressed || input.rightJustPressed ||
            input.upJustPressed || input.downJustPressed;
        if (directionChanged && p.isDrilling && p.drillLockTimer <= 0) {
            p.isDrilling = false;
            p.drillAnimFrame = 0;
            p.drillAnimTimer = 0;
            p.drillMadeContact = false;
        }

        if (input.leftJustPressed) p.facing = 'left';
        else if (input.rightJustPressed) p.facing = 'right';
        else if (input.upJustPressed) p.facing = 'up';
        else if (input.downJustPressed) p.facing = 'down';
        else if (input.left && !input.right) p.facing = 'left';
        else if (input.right && !input.left) p.facing = 'right';
        else if (input.up && !input.down) p.facing = 'up';
        else if (input.down && !input.up) p.facing = 'down';

        if (p.isDrilling) {
            p.drillAnimTimer -= deltaTime;
            p.drillAnimFrame = (p.drillAnimFrame + deltaTime * DRILL_ANIM_SPEED) % 3;
            if (p.drillAnimTimer <= 0) {
                p.isDrilling = false;
                p.drillAnimFrame = 0;
                p.drillAnimTimer = 0;
                p.drillMadeContact = false;
            }
        }

        if (p.drillLockTimer > 0 && p.drillSnapTargetX !== null) {
            const snapAmount = Math.min(1, deltaTime * 28);
            p.visualX += (p.drillSnapTargetX - p.visualX) * snapAmount;
        } else if (p.drillSnapTargetX !== null) {
            if (Math.abs(p.drillSnapTargetX - p.visualX) < 2) {
                p.visualX = p.drillSnapTargetX;
            }
            p.drillSnapTargetX = null;
        }

        const cancelStepForSideDrill =
            p.isSteppingUp &&
            input.digJustPressed &&
            (p.facing === 'left' || p.facing === 'right');
        if (cancelStepForSideDrill) {
            p.isSteppingUp = false;
            p.stepUpProgress = 0;
            p.visualX = p.stepUpStartX;
            p.visualY = p.stepUpStartY;
            p.gridX = Math.round(p.visualX / GRID_SIZE);
            p.gridY = Math.round(p.visualY / GRID_SIZE);
            p.isMoving = false;
            p.stepUpHoldTimer = 0;
            p.stepUpHoldDirection = 0;
        }

        if (p.isSteppingUp) {
            p.stepUpProgress = Math.min(1, p.stepUpProgress + deltaTime / STEP_UP_DURATION);
            const t = p.stepUpProgress;
            const eased = 1 - Math.pow(1 - t, 3);
            p.visualX = p.stepUpStartX + (p.stepUpTargetX - p.stepUpStartX) * eased;
            p.visualY = p.stepUpStartY + (p.stepUpTargetY - p.stepUpStartY) * eased -
                Math.sin(Math.PI * t) * 7;
            p.gridX = Math.round(p.visualX / GRID_SIZE);
            p.gridY = Math.round(p.visualY / GRID_SIZE);
            p.isMoving = true;
            p.moveAnimFrame = (p.moveAnimFrame + deltaTime * 11) % 4;

            if (p.stepUpProgress >= 1) {
                p.isSteppingUp = false;
                p.visualX = p.stepUpTargetX;
                p.visualY = p.stepUpTargetY;
                p.gridX = Math.round(p.visualX / GRID_SIZE);
                p.gridY = Math.round(p.visualY / GRID_SIZE);
                p.stepUpHoldTimer = 0;
                p.stepUpHoldDirection = 0;
            }
            return;
        }

        // Current grid cell (based on center of player)
        const centerX = p.visualX + GRID_SIZE / 2;
        const currentGridX = Math.floor(centerX / GRID_SIZE);
        const currentGridY = Math.floor(p.visualY / GRID_SIZE);

        // How far into the current cell (0-1, 0.5 = centered)
        const cellOffsetX = (centerX % GRID_SIZE) / GRID_SIZE;
        const isCentered = Math.abs(cellOffsetX - 0.5) <= FALL_CENTER_WINDOW;

        // Check block below current position
        const blockBelow = this.grid[currentGridY + 1]?.[currentGridX];
        const isBlockSolid = blockBelow !== undefined &&
                             blockBelow !== BLOCK_TYPES.EMPTY &&
                             blockBelow !== BLOCK_TYPES.ITEM;
        const atBottom = currentGridY >= GRID_HEIGHT - 1;

        // Only fall if centered enough over the hole
        const shouldFall = p.isFalling || (!isBlockSolid && !atBottom && isCentered);

        p.isGrounded = !shouldFall;
        p.gridX = currentGridX;
        p.gridY = currentGridY;

        // FALLING
        if (shouldFall) {
            if (!p.isFalling) {
                p.fallStartY = p.visualY;
                p.fallVelocity = Math.max(p.fallVelocity, FALL_START_SPEED);
            }
            p.isFalling = true;
            p.isMoving = false;
            p.showDrill = false;
            p.stepUpHoldTimer = 0;
            p.stepUpHoldDirection = 0;

            const airDirection = input.left && !input.right ? -1 :
                (input.right && !input.left ? 1 : 0);
            if (airDirection !== 0) {
                const sideX = currentGridX + airDirection;
                const bodyTopRow = Math.floor((p.visualY + 8) / GRID_SIZE);
                const bodyBottomRow = Math.floor((p.visualY + PLAYER_SIZE - 8) / GRID_SIZE);
                const maxPlayerX = (GRID_WIDTH - 1) * GRID_SIZE;
                const aligningToOuterEdge =
                    (airDirection < 0 && currentGridX === 0 && p.visualX > 0) ||
                    (airDirection > 0 &&
                        currentGridX === GRID_WIDTH - 1 &&
                        p.visualX < maxPlayerX);
                let canSteerSideways =
                    aligningToOuterEdge ||
                    (sideX >= 0 && sideX < GRID_WIDTH);

                if (!aligningToOuterEdge) {
                    for (let row = bodyTopRow; row <= bodyBottomRow && canSteerSideways; row++) {
                        const sideCell = this.grid[row]?.[sideX];
                        canSteerSideways = sideCell === BLOCK_TYPES.EMPTY ||
                            sideCell === BLOCK_TYPES.ITEM;
                    }
                }

                if (canSteerSideways) {
                    p.visualX = Math.max(
                        0,
                        Math.min(
                            (GRID_WIDTH - 1) * GRID_SIZE,
                            p.visualX + airDirection * AIR_CONTROL_SPEED * deltaTime
                        )
                    );
                    p.isMoving = true;
                }
            } else {
                const targetX = currentGridX * GRID_SIZE;
                const snapAmount = Math.min(1, deltaTime * 9);
                p.visualX += (targetX - p.visualX) * snapAmount;
            }

            p.fallVelocity = Math.min(
                FALL_MAX_SPEED,
                p.fallVelocity + deltaTime * FALL_ACCELERATION
            );
            const nextVisualY = p.visualY + p.fallVelocity * deltaTime;
            const fallGridX = Math.max(
                0,
                Math.min(GRID_WIDTH - 1, Math.floor((p.visualX + GRID_SIZE / 2) / GRID_SIZE))
            );
            const firstCollisionRow = Math.max(
                0,
                Math.floor((p.visualY + GRID_SIZE) / GRID_SIZE)
            );
            const lastCollisionRow = Math.min(
                GRID_HEIGHT,
                Math.floor((nextVisualY + GRID_SIZE) / GRID_SIZE)
            );
            let landingRow = null;

            for (let row = firstCollisionRow; row <= lastCollisionRow; row++) {
                const cell = row >= GRID_HEIGHT ?
                    BLOCK_TYPES.BEDROCK :
                    this.grid[row]?.[fallGridX];
                const isSolid = cell !== undefined &&
                    cell !== BLOCK_TYPES.EMPTY &&
                    cell !== BLOCK_TYPES.ITEM;
                if (isSolid) {
                    landingRow = row;
                    break;
                }
            }

            p.moveAnimFrame = (p.moveAnimFrame + deltaTime * 12) % 4;
            p.fallDistance = (nextVisualY - p.fallStartY) / GRID_SIZE;

            if (landingRow !== null) {
                const landedDistance = Math.max(0, ((landingRow - 1) * GRID_SIZE - p.fallStartY) / GRID_SIZE);
                p.visualY = (landingRow - 1) * GRID_SIZE;
                p.gridX = fallGridX;
                p.gridY = landingRow - 1;
                p.isFalling = false;
                p.isGrounded = true;
                p.fallVelocity = 0;
                p.fallDistance = landedDistance;
                p.landingTimer = landedDistance > 0.6 ? 0.11 : 0.07;
                if (landedDistance > 0.35) {
                    this.sound.playLand(Math.min(3, landedDistance));
                }
                if (landedDistance > 1) {
                    this.screenShake = Math.max(this.screenShake, Math.min(4, landedDistance));
                }
            } else {
                p.visualY = nextVisualY;
                p.gridX = fallGridX;
                p.gridY = Math.floor(p.visualY / GRID_SIZE);
            }
            return;
        }

        // Reset fall distance when grounded
        p.fallDistance = 0;

        // GROUNDED
        p.isFalling = false;
        p.fallVelocity = 0;
        p.visualY = currentGridY * GRID_SIZE; // Keep Y snapped to grid

        // Reset states
        p.showDrill = false;

        if (p.drillLockTimer > 0) {
            return;
        }

        // Check what's in each direction (from current grid cell)
        const blockLeft = this.grid[currentGridY]?.[currentGridX - 1];
        const blockRight = this.grid[currentGridY]?.[currentGridX + 1];
        const blockDown = this.grid[currentGridY + 1]?.[currentGridX];
        const blockUp = this.grid[currentGridY - 1]?.[currentGridX];

        const maxPlayerX = (GRID_WIDTH - 1) * GRID_SIZE;
        const canMoveLeft =
            (currentGridX === 0 && p.visualX > 0) ||
            (currentGridX > 0 &&
                (blockLeft === BLOCK_TYPES.EMPTY || blockLeft === BLOCK_TYPES.ITEM));
        const canMoveRight =
            (currentGridX === GRID_WIDTH - 1 && p.visualX < maxPlayerX) ||
            (currentGridX < GRID_WIDTH - 1 &&
                (blockRight === BLOCK_TYPES.EMPTY || blockRight === BLOCK_TYPES.ITEM));
        const canMoveDown = (blockDown === BLOCK_TYPES.EMPTY || blockDown === BLOCK_TYPES.ITEM);

        const hasBlockLeft = currentGridX > 0 && blockLeft !== BLOCK_TYPES.EMPTY && blockLeft !== BLOCK_TYPES.ITEM && blockLeft !== undefined;
        const hasBlockRight = currentGridX < GRID_WIDTH - 1 && blockRight !== BLOCK_TYPES.EMPTY && blockRight !== BLOCK_TYPES.ITEM && blockRight !== undefined;
        const hasBlockDown = blockDown !== BLOCK_TYPES.EMPTY && blockDown !== BLOCK_TYPES.ITEM && blockDown !== undefined;
        const hasBlockUp = currentGridY > 0 && blockUp !== BLOCK_TYPES.EMPTY && blockUp !== BLOCK_TYPES.ITEM && blockUp !== undefined;

        if (p.digBufferTimer > 0 && p.digCooldown <= 0) {
            let digX = currentGridX;
            let digY = currentGridY;

            if (p.facing === 'left') digX--;
            else if (p.facing === 'right') digX++;
            else if (p.facing === 'down') digY++;
            else if (p.facing === 'up') digY--;

            p.digBufferTimer = 0;
            p.digCooldown = DIG_RECOVERY;
            p.isDrilling = true;
            p.drillAnimFrame = 0;
            p.drillAnimTimer = DIG_ANIM_DURATION;
            p.drillSnapTargetX = currentGridX * GRID_SIZE;

            const targetBlock = this.grid[digY]?.[digX];
            const targetItem = targetBlock === BLOCK_TYPES.ITEM ?
                this.itemsByCell.get(`${digX},${digY}`) :
                null;
            const targetIsUpwardItem =
                p.facing === 'up' &&
                this.isUpwardDrillableItem(targetItem);
            const targetIsSolid = targetBlock !== undefined &&
                targetBlock !== BLOCK_TYPES.EMPTY &&
                targetBlock !== BLOCK_TYPES.ITEM;
            const didDig = digX >= 0 && digX < GRID_WIDTH &&
                digY >= 0 && digY < GRID_HEIGHT &&
                this.digBlock(digX, digY, p.facing);

            p.drillLockTimer =
                targetIsSolid || targetIsUpwardItem ?
                    DIG_LOCK_DURATION :
                    0.025;
            p.drillMadeContact =
                didDig || targetIsSolid || targetIsUpwardItem;

            if (didDig) {
                if (p.facing === 'left' || p.facing === 'right') {
                    this.hasSideDrilled = true;
                }
                p.stepUpHoldTimer = 0;
                p.stepUpHoldDirection = 0;
                const digStrength = Math.min(4, Math.max(1, this.lastDigStrength || 1));
                this.sound.playDrill(digStrength, targetBlock === BLOCK_TYPES.XBLOCK);
                this.screenShake = Math.max(
                    this.screenShake,
                    targetBlock === BLOCK_TYPES.XBLOCK ? 4.5 : 2.2 + digStrength * 0.55
                );
                this.spawnDigDebris(digX, digY, targetBlock);
            } else if (targetIsSolid) {
                this.sound.playDrill(1, true);
                this.screenShake = Math.max(this.screenShake, 2.5);
                this.spawnDigDebris(digX, digY, BLOCK_TYPES.BEDROCK, 5);
            }
            return;
        }

        // MOVEMENT
        p.isMoving = false;

        if (input.left) {
            if (hasBlockLeft) {
                const alignedForStepUp = Math.abs(
                    p.visualX - currentGridX * GRID_SIZE
                ) <= GRID_SIZE * STEP_UP_ALIGN_WINDOW;
                const canStepUp = !input.dig &&
                    !p.isDrilling &&
                    currentGridY > 0 &&
                    alignedForStepUp &&
                    (blockUp === BLOCK_TYPES.EMPTY || blockUp === BLOCK_TYPES.ITEM) &&
                    (this.grid[currentGridY - 1]?.[currentGridX - 1] === BLOCK_TYPES.EMPTY ||
                        this.grid[currentGridY - 1]?.[currentGridX - 1] === BLOCK_TYPES.ITEM);

                if (canStepUp) {
                    if (p.stepUpHoldDirection !== -1) {
                        p.stepUpHoldDirection = -1;
                        p.stepUpHoldTimer = 0;
                    }
                    p.stepUpHoldTimer += deltaTime;
                    p.showDrill = true;
                    if (p.stepUpHoldTimer < STEP_UP_HOLD_DELAY) {
                        return;
                    }

                    p.isSteppingUp = true;
                    p.stepUpProgress = 0;
                    p.stepUpStartX = p.visualX;
                    p.stepUpStartY = p.visualY;
                    p.stepUpTargetX = (currentGridX - 1) * GRID_SIZE;
                    p.stepUpTargetY = (currentGridY - 1) * GRID_SIZE;
                    p.isMoving = true;
                    p.showDrill = false;
                    p.stepUpHoldTimer = 0;
                    p.stepUpHoldDirection = 0;
                    this.spawnStepDust(currentGridX, currentGridY, -1);
                    return;
                }

                p.stepUpHoldTimer = 0;
                p.stepUpHoldDirection = 0;
                p.showDrill = true;
                const snapAmount = Math.min(1, deltaTime * 18);
                p.visualX += (currentGridX * GRID_SIZE - p.visualX) * snapAmount;
            } else if (canMoveLeft) {
                p.stepUpHoldTimer = 0;
                p.stepUpHoldDirection = 0;
                p.visualX -= WALK_SPEED * deltaTime;
                p.visualX = Math.max(0, p.visualX);
                p.isMoving = true;
                p.moveAnimFrame = (p.moveAnimFrame + deltaTime * 10) % 4;
            }
        }
        else if (input.right) {
            if (hasBlockRight) {
                const alignedForStepUp = Math.abs(
                    p.visualX - currentGridX * GRID_SIZE
                ) <= GRID_SIZE * STEP_UP_ALIGN_WINDOW;
                const canStepUp = !input.dig &&
                    !p.isDrilling &&
                    currentGridY > 0 &&
                    alignedForStepUp &&
                    (blockUp === BLOCK_TYPES.EMPTY || blockUp === BLOCK_TYPES.ITEM) &&
                    (this.grid[currentGridY - 1]?.[currentGridX + 1] === BLOCK_TYPES.EMPTY ||
                        this.grid[currentGridY - 1]?.[currentGridX + 1] === BLOCK_TYPES.ITEM);

                if (canStepUp) {
                    if (p.stepUpHoldDirection !== 1) {
                        p.stepUpHoldDirection = 1;
                        p.stepUpHoldTimer = 0;
                    }
                    p.stepUpHoldTimer += deltaTime;
                    p.showDrill = true;
                    if (p.stepUpHoldTimer < STEP_UP_HOLD_DELAY) {
                        return;
                    }

                    p.isSteppingUp = true;
                    p.stepUpProgress = 0;
                    p.stepUpStartX = p.visualX;
                    p.stepUpStartY = p.visualY;
                    p.stepUpTargetX = (currentGridX + 1) * GRID_SIZE;
                    p.stepUpTargetY = (currentGridY - 1) * GRID_SIZE;
                    p.isMoving = true;
                    p.showDrill = false;
                    p.stepUpHoldTimer = 0;
                    p.stepUpHoldDirection = 0;
                    this.spawnStepDust(currentGridX, currentGridY, 1);
                    return;
                }

                p.stepUpHoldTimer = 0;
                p.stepUpHoldDirection = 0;
                p.showDrill = true;
                const snapAmount = Math.min(1, deltaTime * 18);
                p.visualX += (currentGridX * GRID_SIZE - p.visualX) * snapAmount;
            } else if (canMoveRight) {
                p.stepUpHoldTimer = 0;
                p.stepUpHoldDirection = 0;
                p.visualX += WALK_SPEED * deltaTime;
                p.visualX = Math.min((GRID_WIDTH - 1) * GRID_SIZE, p.visualX);
                p.isMoving = true;
                p.moveAnimFrame = (p.moveAnimFrame + deltaTime * 10) % 4;
            }
        }
        else if (input.down) {
            p.stepUpHoldTimer = 0;
            p.stepUpHoldDirection = 0;
            if (canMoveDown && isCentered) {
                p.isFalling = true;
                p.isGrounded = false;
                p.fallStartY = p.visualY;
                p.fallVelocity = FALL_START_SPEED;
                return;
            } else if (hasBlockDown) {
                p.showDrill = true;
            } else if (canMoveDown && !isCentered) {
                const snapAmount = Math.min(1, deltaTime * 14);
                p.visualX += (currentGridX * GRID_SIZE - p.visualX) * snapAmount;
            }
        }
        else if (input.up) {
            p.stepUpHoldTimer = 0;
            p.stepUpHoldDirection = 0;
            if (hasBlockUp) {
                p.showDrill = true;
            }
        } else {
            p.stepUpHoldTimer = 0;
            p.stepUpHoldDirection = 0;
        }
        
    }

    checkWinCondition() {
        const p = this.player;
        const reachedSafe =
            p.visualX < this.safe.x + this.safe.width &&
            p.visualX + PLAYER_SIZE > this.safe.x &&
            p.visualY < this.safe.y + this.safe.height &&
            p.visualY + PLAYER_SIZE > this.safe.y;

        if (!reachedSafe) {
            this.safeContactArmed = true;
        } else if (
            this.gameState === 'playing' &&
            this.safeContactArmed
        ) {
            this.beginSafePuzzle();
        }

        return reachedSafe;
    }

    beginSafePuzzle() {
        if (this.gameState !== 'playing' || !this.safe) return false;
        this.safeContactArmed = false;
        this.clearKeyboardInput();
        this.puzzleContext = 'campaign';
        this.safePuzzle.start(
            this.safe.type,
            this.safe.difficulty,
            this.currentLevel.id
        );
        if (this.safePuzzle.state?.type === 'dial') {
            this.safePuzzle.state.manual = this.reducedMotion;
        }
        this.gameState = 'puzzle';
        this.sound.playTone(260, 430, 0.12, 0.035, 'square');
        return true;
    }

    showPuzzleSelect() {
        this.clearKeyboardInput();
        this.safePuzzle.clear();
        this.puzzleContext = null;
        this.gameState = 'puzzle-select';
        this.lastRenderedState = null;
        return true;
    }

    startStandalonePuzzle(type, difficulty) {
        const puzzleType = String(type || '');
        const puzzleDifficulty = Number(difficulty);
        const maximumDifficulty = puzzleType === 'pipes' ? 6 : 3;
        if (
            this.gameState !== 'puzzle-select' ||
            !Object.prototype.hasOwnProperty.call(
                SAFE_PUZZLE_META,
                puzzleType
            ) ||
            !Number.isInteger(puzzleDifficulty) ||
            puzzleDifficulty < 1 ||
            puzzleDifficulty > maximumDifficulty
        ) return false;

        this.clearKeyboardInput();
        this.puzzleContext = 'standalone';
        this.standalonePuzzleRun++;
        this.safePuzzle.start(
            puzzleType,
            puzzleDifficulty,
            `standalone:${puzzleType}:${puzzleDifficulty}:${
                this.standalonePuzzleRun
            }`
        );
        if (this.safePuzzle.state?.type === 'dial') {
            this.safePuzzle.state.manual = this.reducedMotion;
        }
        this.gameState = 'puzzle';
        this.lastRenderedState = null;
        this.sound.playTone(260, 430, 0.12, 0.035, 'square');
        return true;
    }

    handleSafePuzzleAction(action, value) {
        if (this.gameState !== 'puzzle') return false;
        const handled = this.safePuzzle.action(action, value);
        if (!handled) return false;

        const state = this.safePuzzle.state;
        if (state?.solved) {
            this.sound.playTone(520, 880, 0.18, 0.04, 'square');
        } else if (action === 'puzzle-dial-hit') {
            this.sound.playTone(310, 460, 0.08, 0.025, 'square');
        } else {
            this.sound.playTone(420, 560, 0.055, 0.018, 'square');
        }
        return true;
    }

    cancelSafePuzzle() {
        if (
            this.gameState !== 'puzzle' ||
            this.safePuzzle.state?.solved
        ) return false;
        this.clearKeyboardInput();
        this.safePuzzle.clear();
        if (this.puzzleContext === 'standalone') {
            this.puzzleContext = null;
            this.gameState = 'puzzle-select';
            this.lastRenderedState = null;
            return true;
        }
        this.puzzleContext = null;
        this.gameState = 'playing';
        this.lastRenderedState = null;
        return true;
    }

    completeSafePuzzle() {
        if (
            this.gameState !== 'puzzle' ||
            !this.safePuzzle.state?.solved
        ) return false;

        if (this.puzzleContext === 'standalone') {
            const difficulty = this.safePuzzle.state.difficulty;
            this.sound.playClear(6 + difficulty);
            this.safePuzzle.clear();
            this.puzzleContext = null;
            this.gameState = 'puzzle-select';
            this.clearKeyboardInput();
            this.lastRenderedState = null;
            return true;
        }

        this.puzzleBonus =
            200 + this.safePuzzle.state.difficulty * 100;
        this.score += this.puzzleBonus;
        this.sound.playClear(6 + this.safePuzzle.state.difficulty);
        this.recordCurrentLevelCompletion();
        this.puzzleContext = null;
        this.gameState = 'won';
        this.clearKeyboardInput();
        return true;
    }

    showWarningMessage(message, duration = 2.4) {
        this.warningMessage = message;
        this.warningMessageTimer = duration;
    }

    triggerFallWarning(worldY) {
        const screenY = worldY * GRID_SIZE - this.cameraY;
        const isVisible =
            screenY + GRID_SIZE > 0 &&
            screenY < CANVAS_HEIGHT;
        if (!isVisible) return;

        this.sound.playFallWarning();
        if (this.hasShownFallWarning) return;

        this.hasShownFallWarning = true;
        this.showWarningMessage(
            'Rasvarning · skakande block faller — flytta dig!',
            3
        );
    }

    triggerCrush(blockValue, sourceBlock, sourceKind) {
        if (this.gameState !== 'playing' || !sourceBlock) return;
        const playerGridX = Math.round(this.player.x / GRID_SIZE);
        const playerGridY = Math.round(this.player.y / GRID_SIZE);

        this.triggerDeath('crushed', {
            x: playerGridX,
            y: playerGridY,
            blockValue,
            sourceBlock,
            sourceKind,
        });
    }

    spawnCrushDebris(impact) {
        const originX = impact.x * GRID_SIZE + GRID_SIZE / 2;
        const originY = impact.y * GRID_SIZE + GRID_SIZE / 2;
        let bright = '#c7b6a7';
        let dark = '#57424b';

        if (isColoredBlockValue(impact.blockValue)) {
            const palette = BLOCK_COLORS[
                impact.blockValue - BLOCK_TYPES.COLORED
            ];
            bright = palette.highlight;
            dark = palette.shadow;
        } else if (impact.blockValue === BLOCK_TYPES.XBLOCK) {
            bright = '#f06b8d';
            dark = '#4b2635';
        }

        for (let index = 0; index < 18; index++) {
            const life = 0.26 + Math.random() * 0.24;
            const isDust = index % 4 === 0;
            this.debrisParticles.push({
                x: originX + (Math.random() - 0.5) * GRID_SIZE * 0.7,
                y: originY + (Math.random() - 0.5) * GRID_SIZE * 0.4,
                vx: (Math.random() - 0.5) * 280,
                vy: -80 - Math.random() * 190,
                life,
                maxLife: life,
                size: isDust ? 8 + Math.floor(Math.random() * 5) :
                    [3, 5, 7][index % 3],
                color: isDust ? bright : (index % 2 ? bright : dark),
                kind: isDust ? 'dust' : 'chip',
                gravity: isDust ? 360 : 900,
                drag: isDust ? 0.04 : 0.14,
            });
        }

        if (this.debrisParticles.length > MAX_DEBRIS_PARTICLES) {
            this.debrisParticles.splice(
                0,
                this.debrisParticles.length - MAX_DEBRIS_PARTICLES
            );
        }
    }

    spawnAirOutParticles() {
        const centerX = this.player.x + PLAYER_SIZE / 2;
        const centerY = this.player.y + PLAYER_SIZE / 2;

        for (let index = 0; index < 10; index++) {
            const life = 0.38 + index * 0.025;
            this.debrisParticles.push({
                x: centerX + (Math.random() - 0.5) * 30,
                y: centerY + (Math.random() - 0.5) * 20,
                vx: (Math.random() - 0.5) * 34,
                vy: -34 - Math.random() * 42,
                life,
                maxLife: life,
                size: index % 3 === 0 ? 4 : 2,
                color: index % 2 === 0 ? '#bffaff' : '#5dd9e8',
                kind: 'sparkle',
                gravity: -28,
                drag: 0.24,
            });
        }

        if (this.debrisParticles.length > MAX_DEBRIS_PARTICLES) {
            this.debrisParticles.splice(
                0,
                this.debrisParticles.length - MAX_DEBRIS_PARTICLES
            );
        }
    }

    triggerDeath(cause, impact = null) {
        if (this.gameState !== 'playing') return;

        this.deathCause = cause;
        this.deathTimer = DEATH_BEAT_DURATION;
        this.deathImpact = impact;
        this.warningMessage = null;
        this.warningMessageTimer = 0;
        this.gameState = 'dying';
        this.clearKeyboardInput();

        if (cause === 'crushed' && impact) {
            this.screenShake = Math.max(
                this.screenShake,
                this.reducedMotion ? 2 : 9
            );
            this.spawnCrushDebris(impact);
            this.sound.playCrush();
        } else {
            this.spawnAirOutParticles();
            this.sound.playAirOut();
        }
    }
    
    spawnDigDebris(gridX, gridY, blockValue, countOverride = null) {
        let color = '#9a7a62';
        let secondaryColor = '#5c4238';
        let dustColor = '#d1ad8c';
        if (isColoredBlockValue(blockValue)) {
            const palette = BLOCK_COLORS[blockValue - BLOCK_TYPES.COLORED];
            color = palette.highlight;
            secondaryColor = palette.shadow;
            dustColor = palette.light;
        } else if (blockValue === BLOCK_TYPES.XBLOCK) {
            color = '#d85f7f';
            secondaryColor = '#5d263b';
            dustColor = '#bbb4b0';
        } else if (blockValue === BLOCK_TYPES.BEDROCK) {
            color = '#9b91a5';
            secondaryColor = '#3f354b';
            dustColor = '#c0b4c5';
        } else if (blockValue === BLOCK_TYPES.ITEM) {
            const destroyedOxygen =
                this.lastDestroyedItemType === 'oxygen';
            color = destroyedOxygen ? '#69f3ff' : '#ffd65a';
            secondaryColor = destroyedOxygen ? '#176b80' : '#9b5b10';
            dustColor = destroyedOxygen ? '#d8ffff' : '#fff1a0';
        }

        const strength = Math.max(1, this.lastDigStrength || 1);
        const count = countOverride ?? Math.min(18, 7 + strength * 2);
        const originX = gridX * GRID_SIZE + GRID_SIZE / 2;
        const originY = gridY * GRID_SIZE + GRID_SIZE / 2;
        let biasX = 0;
        let biasY = -110;

        if (this.player.facing === 'left') biasX = 145;
        else if (this.player.facing === 'right') biasX = -145;
        else if (this.player.facing === 'up') biasY = 145;

        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 55 + Math.random() * 155;
            const life = 0.18 + Math.random() * 0.2;
            const isDust = i % 4 === 0;
            this.debrisParticles.push({
                x: originX + (Math.random() - 0.5) * GRID_SIZE * 0.45,
                y: originY + (Math.random() - 0.5) * GRID_SIZE * 0.45,
                vx: Math.cos(angle) * speed + biasX,
                vy: Math.sin(angle) * speed + biasY,
                life,
                maxLife: life,
                size: isDust ? 7 + Math.floor(Math.random() * 4) :
                    [2, 4, 6][Math.floor(Math.random() * 3)],
                color: isDust ? dustColor :
                    (i % 3 === 0 ? secondaryColor : color),
                kind: isDust ? 'dust' : 'chip',
                gravity: isDust ? 320 : 820,
                drag: isDust ? 0.025 : 0.1,
            });
        }

        if (this.debrisParticles.length > MAX_DEBRIS_PARTICLES) {
            this.debrisParticles.splice(
                0,
                this.debrisParticles.length - MAX_DEBRIS_PARTICLES
            );
        }
    }

    spawnStepDust(gridX, gridY, direction) {
        const originX = gridX * GRID_SIZE + GRID_SIZE / 2;
        const originY = (gridY + 1) * GRID_SIZE - 5;

        for (let i = 0; i < 4; i++) {
            const life = 0.16 + i * 0.025;
            this.debrisParticles.push({
                x: originX - direction * (10 + i * 4),
                y: originY - i * 2,
                vx: -direction * (28 + i * 12),
                vy: -52 - i * 10,
                life,
                maxLife: life,
                size: i % 2 === 0 ? 4 : 6,
                color: i % 2 === 0 ? '#8f6b58' : '#c09a79',
                kind: 'dust',
                gravity: 330,
                drag: 0.035,
            });
        }
    }

    isUpwardDrillableItem(item) {
        return Boolean(
            item &&
            !item.collected &&
            !item.destroyed &&
            (item.type === 'oxygen' || item.type === 'coin')
        );
    }

    destroyItemAt(x, y) {
        const item = this.itemsByCell.get(`${x},${y}`);
        if (!this.isUpwardDrillableItem(item)) return false;

        this.hasPlayerDug = true;
        this.lastDigStrength = 1;
        this.lastDestroyedItemType = item.type;
        item.destroyed = true;
        item.collected = true;
        this.releaseItemCell(item);
        this.showWarningMessage(
            item.type === 'oxygen' ?
                'Syretuben borrades sönder · ingen luft!' :
                'Guldmyntet borrades sönder · inga poäng!',
            2.2
        );
        return true;
    }

    digBlock(x, y, direction = this.player.facing) {
        this.lastDestroyedItemType = null;
        if (
            direction === 'up' &&
            this.grid[y]?.[x] === BLOCK_TYPES.ITEM &&
            this.destroyItemAt(x, y)
        ) {
            return true;
        }

        const blockInfo = this.getBlockAt(x, y);
        if (!blockInfo) return false;
        
        // Enable physics on first dig
        this.hasPlayerDug = true;
        this.lastDigStrength = 1;
        
        if (blockInfo.type === 'xblock') {
            const xBlock = blockInfo.xBlock;
            xBlock.hp--;
            xBlock.hitFlash = 0.12;
            
            if (xBlock.hp <= 0) {
                xBlock.destroyed = true;
                this.grid[y][x] = BLOCK_TYPES.EMPTY;
                this.oxygen = Math.max(0, this.oxygen - 20);
                this.score += 50;
                this.lastDigStrength = 3;
            }
            return true;
        } else if (blockInfo.type === 'bedrock') {
            return false;
        } else if (blockInfo.type === 'color') {
            const block = blockInfo.block;
            const piece = this.findConnectedColorPiece(block);
            
            if (piece.length === 0) {
                return false;
            }
            
            piece.forEach(pieceBlock => {
                pieceBlock.isClearing = true;
                pieceBlock.clearTimer = 0;
                pieceBlock.clearDuration = DIG_CLEAR_FLASH;
                pieceBlock.matchEligible = false;
                
                if (this.grid[pieceBlock.y]?.[pieceBlock.x] === pieceBlock.colorIndex + BLOCK_TYPES.COLORED) {
                    this.grid[pieceBlock.y][pieceBlock.x] = BLOCK_TYPES.EMPTY;
                }
            });
            
            this.lastDigStrength = piece.length;
            this.score += DIG_SCORE * piece.length;
            return true;
        }
        return false;
    }
    
    getColorBlockAt(x, y) {
        return this.colorBlocks.find(block =>
            !block.destroyed &&
            block.x === x &&
            block.y === y
        ) || null;
    }

    findConnectedColorPiece(startBlock) {
        if (!startBlock || startBlock.destroyed || startBlock.isClearing) {
            return [];
        }
        
        const blockMap = this.getColorBlocksMap();
        const queue = [startBlock];
        const visited = new Set([`${startBlock.x},${startBlock.y}`]);
        const piece = [];
        
        while (queue.length > 0) {
            const block = queue.shift();
            piece.push(block);
            
            const neighbors = [
                [block.x, block.y - 1],
                [block.x + 1, block.y],
                [block.x, block.y + 1],
                [block.x - 1, block.y],
            ];
            
            for (const [nextX, nextY] of neighbors) {
                const key = `${nextX},${nextY}`;
                if (visited.has(key)) continue;
                
                const neighbor = blockMap.get(key);
                if (!neighbor || neighbor.colorIndex !== startBlock.colorIndex) continue;
                
                visited.add(key);
                queue.push(neighbor);
            }
        }
        
        return piece;
    }

    resetColoredBlockMotion(block) {
        block.isFalling = false;
        block.fallProgress = 0;
        block.fallTimer = 0;
        block.isShaking = false;
        block.shakeTimer = 0;
    }

    getColorBlocksMap() {
        const map = new Map();
        
        for (const block of this.colorBlocks) {
            if (block.destroyed || block.isClearing) continue;
            map.set(`${block.x},${block.y}`, block);
        }
        
        return map;
    }

    buildColorComponents(blockMap = this.getColorBlocksMap()) {
        const visited = new Set();
        const components = [];
        
        for (const block of this.colorBlocks) {
            if (block.destroyed || block.isClearing) continue;
            
            const startKey = `${block.x},${block.y}`;
            if (visited.has(startKey)) continue;
            
            const queue = [block];
            const blocks = [];
            visited.add(startKey);
            
            while (queue.length > 0) {
                const current = queue.shift();
                blocks.push(current);
                
                const neighbors = [
                    [current.x, current.y - 1],
                    [current.x + 1, current.y],
                    [current.x, current.y + 1],
                    [current.x - 1, current.y],
                ];
                
                for (const [nextX, nextY] of neighbors) {
                    const neighborKey = `${nextX},${nextY}`;
                    if (visited.has(neighborKey)) continue;
                    
                    const neighbor = blockMap.get(neighborKey);
                    if (!neighbor || neighbor.colorIndex !== block.colorIndex) continue;
                    
                    visited.add(neighborKey);
                    queue.push(neighbor);
                }
            }
            
            components.push({
                key: blocks.map(item => item.id).sort((a, b) => a - b).join(','),
                blocks,
                colorIndex: block.colorIndex,
            });
        }
        
        return components;
    }

    componentCanFall(component) {
        const ownCells = new Set(component.blocks.map(block => `${block.x},${block.y}`));
        
        for (const block of component.blocks) {
            const belowY = block.y + 1;
            if (belowY >= GRID_HEIGHT) return false;
            if (ownCells.has(`${block.x},${belowY}`)) continue;
            if (this.grid[belowY]?.[block.x] !== BLOCK_TYPES.EMPTY) return false;
        }
        
        return true;
    }

    getComponentDepthFactor(component) {
        const deepestRow = Math.max(...component.blocks.map(block => block.y));
        return Math.max(0, Math.min(1, deepestRow / (GRID_HEIGHT - 1)));
    }

    getComponentFallDelay(component) {
        return Math.max(
            MIN_FALL_DELAY,
            FALL_DELAY -
                this.getComponentDepthFactor(component) *
                FALL_DELAY_DEPTH_REDUCTION
        );
    }

    getComponentFallDuration(component) {
        return Math.max(
            MIN_FALL_SPEED,
            FALL_SPEED -
                this.getComponentDepthFactor(component) *
                FALL_SPEED_DEPTH_REDUCTION
        );
    }

    colorComponentHasExternalSupport(startBlock, excludedIds, blockMap) {
        const queue = [startBlock];
        const componentBlocks = [];
        const componentIds = new Set([startBlock.id]);

        while (queue.length > 0) {
            const block = queue.shift();
            componentBlocks.push(block);

            const neighbors = [
                [block.x - 1, block.y],
                [block.x + 1, block.y],
                [block.x, block.y - 1],
                [block.x, block.y + 1],
            ];

            for (const [neighborX, neighborY] of neighbors) {
                const neighbor = blockMap.get(`${neighborX},${neighborY}`);
                if (!neighbor || excludedIds.has(neighbor.id) || componentIds.has(neighbor.id)) continue;
                if (neighbor.colorIndex !== startBlock.colorIndex || neighbor.isClearing) continue;
                componentIds.add(neighbor.id);
                queue.push(neighbor);
            }
        }

        for (const block of componentBlocks) {
            const belowY = block.y + 1;
            if (belowY >= GRID_HEIGHT) return true;

            const belowBlock = blockMap.get(`${block.x},${belowY}`);
            if (belowBlock && componentIds.has(belowBlock.id)) continue;
            if (belowBlock && excludedIds.has(belowBlock.id)) continue;

            const belowValue = this.grid[belowY]?.[block.x];
            if (belowValue !== undefined && belowValue !== BLOCK_TYPES.EMPTY) {
                return true;
            }
        }

        return false;
    }

    componentTouchesSupportedSameColor(component, previousMotion, blockMap) {
        const ownIds = new Set(component.blocks.map(block => block.id));

        for (const block of component.blocks) {
            const neighbors = [
                [block.x - 1, block.y],
                [block.x + 1, block.y],
                [block.x, block.y - 1],
                [block.x, block.y + 1],
            ];

            for (const [neighborX, neighborY] of neighbors) {
                const neighbor = blockMap.get(`${neighborX},${neighborY}`);
                if (!neighbor || ownIds.has(neighbor.id)) continue;
                if (neighbor.colorIndex !== component.colorIndex || neighbor.isClearing) continue;

                const motion = previousMotion.get(neighbor.id);
                const wasStable = !motion ||
                    (!motion.isFalling && !motion.isShaking && !motion.isClearing);
                if (wasStable && this.colorComponentHasExternalSupport(
                    neighbor,
                    ownIds,
                    blockMap
                )) {
                    return true;
                }
            }
        }

        return false;
    }

    moveColorComponentDown(component, blockMap = null) {
        for (const block of component.blocks) {
            if (blockMap) {
                blockMap.delete(`${block.x},${block.y}`);
            }
            if (this.grid[block.y]?.[block.x] === block.colorIndex + BLOCK_TYPES.COLORED) {
                this.grid[block.y][block.x] = BLOCK_TYPES.EMPTY;
            }
        }
        
        for (const block of component.blocks) {
            block.y++;
        }
        
        for (const block of component.blocks) {
            if (this.grid[block.y]) {
                this.grid[block.y][block.x] = block.colorIndex + BLOCK_TYPES.COLORED;
            }
            if (blockMap) {
                blockMap.set(`${block.x},${block.y}`, block);
            }
        }
    }

    applyComponentMotionState(component, state) {
        for (const block of component.blocks) {
            block.isFalling = state.isFalling;
            block.fallProgress = state.fallProgress;
            block.fallTimer = state.fallTimer;
            block.isShaking = state.isShaking;
            block.shakeTimer = state.shakeTimer;
        }
    }

    componentOverlapsPlayer(component, playerGridX, playerGridY) {
        return component.blocks.some(block => block.overlapsWithPlayer(playerGridX, playerGridY));
    }
    
    getBlockAt(x, y) {
        if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) return null;
        
        const blockType = this.grid[y][x];
        if (blockType === BLOCK_TYPES.EMPTY) return null;
        
        if (blockType === BLOCK_TYPES.XBLOCK) {
            const xBlock = this.xBlocks.find(b => b.x === x && b.y === y && !b.destroyed);
            return xBlock ? { type: 'xblock', xBlock } : null;
        }
        
        if (blockType === BLOCK_TYPES.BEDROCK) {
            return { type: 'bedrock' };
        }
        
        // Items (treasures/oxygen) - can't be dug, player walks through
        if (blockType === BLOCK_TYPES.ITEM) {
            return null; // Don't block digging or movement
        }
        
        if (isColoredBlockValue(blockType)) {
            const block = this.getColorBlockAt(x, y);
            if (block && !block.isClearing) {
                return { type: 'color', block };
            }
        }
        
        return null;
    }
    
    updateColoredBlockPhysics(deltaTime) {
        const previousMotion = new Map();
        for (const block of this.colorBlocks) {
            previousMotion.set(block.id, {
                isFalling: block.isFalling,
                isShaking: block.isShaking,
                isClearing: block.isClearing,
            });
        }

        for (const block of this.colorBlocks) {
            if (block.destroyed) continue;
            
            if (block.isClearing) {
                block.clearTimer += deltaTime;
                if (block.clearTimer >= block.clearDuration) {
                    if (this.grid[block.y]?.[block.x] === block.colorIndex + BLOCK_TYPES.COLORED) {
                        this.grid[block.y][block.x] = BLOCK_TYPES.EMPTY;
                    }
                    block.destroyed = true;
                }
                continue;
            }
            
            this.resetColoredBlockMotion(block);
        }
        
        const liveBlockMap = this.getColorBlocksMap();
        const components = this.buildColorComponents(liveBlockMap);
        const nextStates = new Map();
        
        for (const component of components) {
            const previousState = this.colorComponentStates.get(component.key);
            const state = previousState ? { ...previousState } : {
                fallTimer: 0,
                isFalling: false,
                fallProgress: 0,
                isShaking: false,
                shakeTimer: 0,
            };

            if (this.gameState !== 'playing') {
                this.applyComponentMotionState(component, state);
                nextStates.set(component.key, state);
                continue;
            }
            
            if (state.isFalling) {
                state.fallProgress += deltaTime / this.getComponentFallDuration(component);
                
                if (state.fallProgress >= 1) {
                    const playerGridX = Math.round(this.player.x / GRID_SIZE);
                    const playerGridY = Math.round(this.player.y / GRID_SIZE);
                    const crushingBlock = component.blocks.find(block =>
                        block.x === playerGridX &&
                        block.y + 1 === playerGridY
                    );

                    this.moveColorComponentDown(component, liveBlockMap);
                    state.fallProgress = 0;

                    if (crushingBlock) {
                        state.isFalling = false;
                        state.isShaking = false;
                        state.fallTimer = 0;
                        state.shakeTimer = 0;
                        this.triggerCrush(
                            crushingBlock.colorIndex + BLOCK_TYPES.COLORED,
                            crushingBlock,
                            'color'
                        );
                    } else {
                        const attachedToSameColor = this.componentTouchesSupportedSameColor(
                            component,
                            previousMotion,
                            liveBlockMap
                        );
                        if (attachedToSameColor || !this.componentCanFall(component)) {
                            state.isFalling = false;
                            state.isShaking = false;
                            state.fallTimer = 0;
                            state.shakeTimer = 0;
                            component.blocks.forEach(block => {
                                block.matchEligible = true;
                            });
                            this.screenShake = Math.max(
                                this.screenShake,
                                Math.min(4, 1.4 + component.blocks.length * 0.35)
                            );
                            this.sound.playLand(Math.min(4, 1 + component.blocks.length * 0.35));
                            this.pendingMatchCheck = true;
                        }
                    }
                }
            } else {
                const shouldStartFalling = this.componentCanFall(component);
                
                if (shouldStartFalling) {
                    if (!state.isShaking) {
                        state.isShaking = true;
                        state.shakeTimer = 0;
                        state.fallTimer = 0;
                        this.triggerFallWarning(
                            Math.max(...component.blocks.map(block => block.y))
                        );
                    }
                    
                    state.shakeTimer += deltaTime;
                    state.fallTimer += deltaTime;
                    
                    if (state.fallTimer >= this.getComponentFallDelay(component) &&
                        this.componentCanFall(component)) {
                        state.isFalling = true;
                        state.isShaking = false;
                        state.shakeTimer = 0;
                        state.fallProgress = 0;
                    }
                } else {
                    state.fallTimer = 0;
                    state.isShaking = false;
                    state.shakeTimer = 0;
                }
            }
            
            this.applyComponentMotionState(component, state);
            nextStates.set(component.key, state);
        }
        
        this.colorComponentStates = nextStates;
    }
    
    updateXBlockPhysics(deltaTime) {
        const xBlocksCanFall = new Set();
        
        for (const xBlock of this.xBlocks) {
            if (xBlock.destroyed) continue;
            if (xBlock.canFall(this.grid)) {
                xBlocksCanFall.add(xBlock);
            }
        }
        
        for (const xBlock of this.xBlocks) {
            if (xBlock.destroyed) continue;
            const depthFactor = Math.max(0, Math.min(1, xBlock.y / (GRID_HEIGHT - 1)));
            const fallDuration = Math.max(
                MIN_FALL_SPEED,
                FALL_SPEED - depthFactor * FALL_SPEED_DEPTH_REDUCTION
            );
            const fallDelay = Math.max(
                MIN_FALL_DELAY,
                FALL_DELAY - depthFactor * FALL_DELAY_DEPTH_REDUCTION
            );
            
            if (xBlock.isFalling) {
                xBlock.fallProgress += deltaTime / fallDuration;
                
                if (xBlock.fallProgress >= 1) {
                    const playerGridX = Math.round(this.player.x / GRID_SIZE);
                    const playerGridY = Math.round(this.player.y / GRID_SIZE);
                    const crushesPlayer =
                        xBlock.x === playerGridX &&
                        xBlock.y + 1 === playerGridY;

                    this.grid[xBlock.y][xBlock.x] = BLOCK_TYPES.EMPTY;
                    xBlock.fall();
                    if (this.grid[xBlock.y]) {
                        this.grid[xBlock.y][xBlock.x] = BLOCK_TYPES.XBLOCK;
                    }

                    if (crushesPlayer) {
                        xBlock.isFalling = false;
                        xBlock.isShaking = false;
                        xBlock.fallTimer = 0;
                        xBlock.shakeTimer = 0;
                        this.triggerCrush(
                            BLOCK_TYPES.XBLOCK,
                            xBlock,
                            'x'
                        );
                        return;
                    } else {
                        if (!xBlock.canFall(this.grid)) {
                            xBlock.isFalling = false;
                            xBlock.isShaking = false;
                            xBlock.fallTimer = 0;
                            xBlock.shakeTimer = 0;
                            this.screenShake = Math.max(this.screenShake, 2);
                            this.sound.playLand(1.5);
                        }
                    }
                }
            } else {
                let shouldStartFalling = xBlocksCanFall.has(xBlock);
                
                if (shouldStartFalling) {
                    if (!xBlock.isShaking) {
                        xBlock.isShaking = true;
                        xBlock.shakeTimer = 0;
                        xBlock.fallTimer = 0;
                        this.triggerFallWarning(xBlock.y);
                    }
                    
                    xBlock.shakeTimer += deltaTime;
                    xBlock.fallTimer += deltaTime;
                    
                    if (xBlock.fallTimer >= fallDelay && xBlock.canFall(this.grid)) {
                        xBlock.isFalling = true;
                        xBlock.isShaking = false;
                        xBlock.shakeTimer = 0;
                        xBlock.fallProgress = 0;
                    }
                } else {
                    xBlock.fallTimer = 0;
                    xBlock.isShaking = false;
                    xBlock.shakeTimer = 0;
                }
            }
        }
    }
    
    settleInitialBoard() {
        const getComponentMaxY = component =>
            Math.max(...component.blocks.map(block => block.y));
        
        for (let i = 0; i < GRID_WIDTH * GRID_HEIGHT * 4; i++) {
            let movedAny = false;
            const components = this.buildColorComponents()
                .sort((a, b) => getComponentMaxY(b) - getComponentMaxY(a));
            
            for (const component of components) {
                if (!this.componentCanFall(component)) continue;
                this.moveColorComponentDown(component);
                movedAny = true;
            }
            
            const xBlocks = this.xBlocks
                .filter(xBlock => !xBlock.destroyed)
                .sort((a, b) => b.y - a.y);
            
            for (const xBlock of xBlocks) {
                if (!xBlock.canFall(this.grid)) continue;
                
                this.grid[xBlock.y][xBlock.x] = BLOCK_TYPES.EMPTY;
                xBlock.y++;
                this.grid[xBlock.y][xBlock.x] = BLOCK_TYPES.XBLOCK;
                movedAny = true;
            }
            
            if (!movedAny) break;
        }
        
        for (const block of this.colorBlocks) {
            block.isClearing = false;
            block.clearTimer = 0;
            block.matchEligible = false;
            this.resetColoredBlockMotion(block);
        }
        
        for (const xBlock of this.xBlocks) {
            xBlock.isFalling = false;
            xBlock.fallProgress = 0;
            xBlock.fallTimer = 0;
            xBlock.isShaking = false;
            xBlock.shakeTimer = 0;
        }
        
        this.colorComponentStates.clear();
        this.pendingMatchCheck = false;
    }
    
    findStableColorCluster(startBlock, visited) {
        const queue = [startBlock];
        const cluster = [];
        visited.add(`${startBlock.x},${startBlock.y}`);
        
        while (queue.length > 0) {
            const block = queue.shift();
            cluster.push(block);
            
            const neighbors = [
                [block.x, block.y - 1],
                [block.x + 1, block.y],
                [block.x, block.y + 1],
                [block.x - 1, block.y],
            ];
            
            for (const [nextX, nextY] of neighbors) {
                const key = `${nextX},${nextY}`;
                if (visited.has(key)) continue;
                
                const neighbor = this.getColorBlockAt(nextX, nextY);
                if (!neighbor || neighbor.colorIndex !== startBlock.colorIndex) continue;
                if (neighbor.isClearing || neighbor.isFalling || neighbor.isShaking) continue;
                
                visited.add(key);
                queue.push(neighbor);
            }
        }
        
        return cluster;
    }
    
    hasActiveColorMotion() {
        const colorBlocksMoving = this.colorBlocks.some(block =>
            !block.destroyed &&
            (block.isFalling || block.isShaking || block.isClearing)
        );
        const xBlocksMoving = this.xBlocks.some(xBlock =>
            !xBlock.destroyed &&
            (xBlock.isFalling || xBlock.isShaking)
        );
        
        return colorBlocksMoving || xBlocksMoving;
    }
    
    triggerColorMatches() {
        const visited = new Set();
        let foundMatch = false;
        
        for (const block of this.colorBlocks) {
            if (block.destroyed || block.isClearing || block.isFalling || block.isShaking) continue;
            
            const key = `${block.x},${block.y}`;
            if (visited.has(key)) continue;
            
            const cluster = this.findStableColorCluster(block, visited);
            const hasEligibleBlock = cluster.some(matchBlock => matchBlock.matchEligible);
            if (!hasEligibleBlock) continue;
            
            if (cluster.length < MATCH_CLEAR_SIZE) {
                cluster.forEach(matchBlock => {
                    matchBlock.matchEligible = false;
                });
                continue;
            }
            
            foundMatch = true;
            this.score += cluster.length * MATCH_SCORE;
            this.sound.playClear(cluster.length);
            
            cluster.forEach(matchBlock => {
                matchBlock.matchEligible = false;
                matchBlock.isClearing = true;
                matchBlock.clearTimer = 0;
                matchBlock.clearDuration = MATCH_CLEAR_FLASH;
                matchBlock.isShaking = false;
                matchBlock.isFalling = false;
                matchBlock.fallTimer = 0;
                matchBlock.shakeTimer = 0;
            });
        }
        
        return foundMatch;
    }
    
    updatePhysics(deltaTime) {
        // Don't run physics until player has dug something
        if (!this.hasPlayerDug) return;

        this.updateColoredBlockPhysics(deltaTime);
        if (this.gameState !== 'playing') return;

        this.updateXBlockPhysics(deltaTime);
        if (this.gameState !== 'playing') return;
        
        if (this.pendingMatchCheck) {
            this.triggerColorMatches();
            this.pendingMatchCheck = false;
        }
        
        this.colorBlocks = this.colorBlocks.filter(block => !block.destroyed);
        this.xBlocks = this.xBlocks.filter(b => !b.destroyed);
    }
    
    updateOxygen(deltaTime) {
        // Collect oxygen tubes
        this.oxygenTubes.forEach(tube => {
            if (!tube.collected) {
                const dist = Math.sqrt(
                    Math.pow(this.player.x + PLAYER_SIZE/2 - tube.x, 2) + 
                    Math.pow(this.player.y + PLAYER_SIZE/2 - tube.y, 2)
                );
                if (dist < GRID_SIZE * 0.5) {
                    tube.collected = true;
                    this.oxygen = Math.min(this.maxOxygen, this.oxygen + 20);
                    this.score += 100;
                    this.spawnPickupSparkles(tube, '#69f3ff');
                    this.sound.playPickup(true);
                    this.releaseItemCell(tube);
                }
            }
        });
        
        // Collect treasures
        this.treasures.forEach(treasure => {
            if (!treasure.collected) {
                const dist = Math.sqrt(
                    Math.pow(this.player.x + PLAYER_SIZE/2 - treasure.x, 2) + 
                    Math.pow(this.player.y + PLAYER_SIZE/2 - treasure.y, 2)
                );
                if (dist < GRID_SIZE * 0.8) {
                    treasure.collected = true;
                    this.score += treasure.value;
                    this.spawnPickupSparkles(treasure, '#ffd65a');
                    this.sound.playPickup(false);
                    this.releaseItemCell(treasure);
                }
            }
        });
        
        this.oxygen -= deltaTime * 1.2;
        if (this.oxygen <= 0) {
            this.oxygen = 0;
            this.triggerDeath('oxygen');
        }
    }

    releaseItemCell(item) {
        const key = `${item.gridX},${item.gridY}`;
        if (this.itemsByCell.get(key) !== item) return;

        this.itemsByCell.delete(key);
        if (this.grid[item.gridY]?.[item.gridX] === BLOCK_TYPES.ITEM) {
            this.grid[item.gridY][item.gridX] = BLOCK_TYPES.EMPTY;
        }
    }

    spawnPickupSparkles(item, color) {
        for (let index = 0; index < 8; index++) {
            const angle = index * Math.PI / 4;
            const life = 0.24 + (index % 3) * 0.04;
            this.debrisParticles.push({
                x: item.x,
                y: item.y,
                vx: Math.cos(angle) * (80 + (index % 2) * 35),
                vy: Math.sin(angle) * 70 - 80,
                life,
                maxLife: life,
                size: index % 2 === 0 ? 4 : 2,
                color,
                kind: 'sparkle',
                gravity: 260,
                drag: 0.22,
            });
        }

        if (this.debrisParticles.length > MAX_DEBRIS_PARTICLES) {
            this.debrisParticles.splice(
                0,
                this.debrisParticles.length - MAX_DEBRIS_PARTICLES
            );
        }
    }
    
    updateCamera(deltaTime) {
        const longFallBlend = this.player.isFalling ?
            Math.max(
                0,
                Math.min(
                    1,
                    (this.player.fallDistance - LONG_FALL_VISUAL_THRESHOLD) / 0.55
                )
            ) :
            0;
        const fallLookahead =
            Math.min(GRID_SIZE, this.player.fallVelocity * 0.055) *
            longFallBlend;
        const targetCameraY =
            this.player.visualY -
            CANVAS_HEIGHT / 2 +
            GRID_SIZE +
            fallLookahead;
        const followTime = 0.12 - longFallBlend * 0.035;
        const follow = 1 - Math.exp(-deltaTime / followTime);
        this.cameraY += (targetCameraY - this.cameraY) * follow;
        const maxCameraY = Math.max(
            0,
            this.levelHeight * GRID_SIZE - CANVAS_HEIGHT
        );
        this.cameraY = Math.max(0, Math.min(this.cameraY, maxCameraY));
        this.depth = Math.max(0, Math.floor((this.player.visualY / GRID_SIZE) - 2));
    }

    get currentLevel() {
        return CAMPAIGN_LEVELS[this.currentLevelIndex];
    }

    createDefaultProgress() {
        const levels = {};
        CAMPAIGN_LEVELS.forEach((level, levelIndex) => {
            levels[level.id] = {
                unlocked: levelIndex === 0,
                completed: false,
                bestScore: 0,
            };
        });
        return { version: 1, levels };
    }

    normalizeProgress(rawProgress) {
        const normalized = this.createDefaultProgress();
        if (
            !rawProgress ||
            rawProgress.version !== 1 ||
            !rawProgress.levels ||
            typeof rawProgress.levels !== 'object'
        ) {
            return normalized;
        }

        CAMPAIGN_LEVELS.forEach((level, levelIndex) => {
            const saved = rawProgress.levels[level.id];
            if (!saved || typeof saved !== 'object') return;

            const completed = saved.completed === true;
            const bestScore = Number.isFinite(saved.bestScore) ?
                Math.max(0, Math.floor(saved.bestScore)) :
                0;
            normalized.levels[level.id] = {
                unlocked:
                    levelIndex === 0 ||
                    completed ||
                    saved.unlocked === true,
                completed,
                bestScore,
            };
        });

        CAMPAIGN_LEVELS.forEach((level, levelIndex) => {
            if (!normalized.levels[level.id].completed) return;
            const nextLevel = CAMPAIGN_LEVELS[levelIndex + 1];
            if (nextLevel) normalized.levels[nextLevel.id].unlocked = true;
        });

        return normalized;
    }

    loadProgress() {
        const fallback = this.createDefaultProgress();
        try {
            const stored = window.localStorage?.getItem(PROGRESS_STORAGE_KEY);
            if (!stored) return fallback;
            return this.normalizeProgress(JSON.parse(stored));
        } catch {
            return fallback;
        }
    }

    saveProgress() {
        try {
            window.localStorage?.setItem(
                PROGRESS_STORAGE_KEY,
                JSON.stringify(this.progress)
            );
            return true;
        } catch {
            return false;
        }
    }

    getLevelProgress(levelIndex) {
        const level = CAMPAIGN_LEVELS[levelIndex];
        return level ? this.progress?.levels?.[level.id] || null : null;
    }

    isLevelUnlocked(levelIndex) {
        return this.getLevelProgress(levelIndex)?.unlocked === true;
    }

    isLevelCompleted(levelIndex) {
        return this.getLevelProgress(levelIndex)?.completed === true;
    }

    getLevelBestScore(levelIndex) {
        return this.getLevelProgress(levelIndex)?.bestScore || 0;
    }

    getCompletedLevelCount() {
        return CAMPAIGN_LEVELS.reduce(
            (count, level, levelIndex) =>
                count + (this.isLevelCompleted(levelIndex) ? 1 : 0),
            0
        );
    }

    getContinueLevelIndex() {
        const firstOpenLevel = CAMPAIGN_LEVELS.findIndex(
            (level, levelIndex) =>
                this.isLevelUnlocked(levelIndex) &&
                !this.isLevelCompleted(levelIndex)
        );
        return firstOpenLevel >= 0 ? firstOpenLevel : 0;
    }

    recordCurrentLevelCompletion() {
        const level = this.currentLevel;
        const entry = this.getLevelProgress(this.currentLevelIndex);
        if (!level || !entry) return;

        this.lastLevelScore = Math.max(
            0,
            Math.floor(this.score - this.levelStartScore)
        );
        this.newlyUnlockedLevelIndex = null;
        let changed = false;

        if (!entry.completed) {
            entry.completed = true;
            changed = true;
        }
        if (!entry.unlocked) {
            entry.unlocked = true;
            changed = true;
        }
        if (this.lastLevelScore > entry.bestScore) {
            entry.bestScore = this.lastLevelScore;
            changed = true;
        }

        const nextLevel = CAMPAIGN_LEVELS[this.currentLevelIndex + 1];
        if (nextLevel) {
            const nextEntry = this.progress.levels[nextLevel.id];
            if (nextEntry && !nextEntry.unlocked) {
                nextEntry.unlocked = true;
                this.newlyUnlockedLevelIndex = this.currentLevelIndex + 1;
                changed = true;
            }
        }

        if (changed) this.saveProgress();
        this.ui?.refreshLevelSelect();
    }

    hasNextLevel() {
        return this.currentLevelIndex < CAMPAIGN_LEVELS.length - 1;
    }

    startRun() {
        this.startLevel(this.getContinueLevelIndex());
    }

    startLevel(levelIndex) {
        if (
            !Number.isInteger(levelIndex) ||
            levelIndex < 0 ||
            levelIndex >= CAMPAIGN_LEVELS.length ||
            !this.isLevelUnlocked(levelIndex)
        ) return false;

        this.loadLevel(levelIndex, {
            score: 0,
            checkpoint: 0,
            state: 'countdown',
        });
        return true;
    }

    advanceLevel() {
        if (this.gameState !== 'won') return false;
        if (!this.hasNextLevel()) {
            this.showMainMenu();
            return false;
        }

        const nextLevelIndex = this.currentLevelIndex + 1;
        if (!this.isLevelUnlocked(nextLevelIndex)) return false;

        const checkpoint = this.score;
        this.loadLevel(nextLevelIndex, {
            score: checkpoint,
            checkpoint,
            state: 'countdown',
        });
        return true;
    }

    retryCurrentLevel() {
        this.loadLevel(this.currentLevelIndex, {
            score: this.levelStartScore,
            checkpoint: this.levelStartScore,
            state: 'countdown',
        });
    }

    pauseGame() {
        if (this.gameState === 'playing') {
            this.clearKeyboardInput();
            this.gameState = 'paused';
        }
    }

    resumeGame() {
        if (this.gameState === 'paused') {
            this.clearKeyboardInput();
            this.gameState = 'playing';
        }
    }

    showMainMenu() {
        this.loadLevel(0, {
            score: 0,
            checkpoint: 0,
            state: 'menu',
        });
    }
    
    restart() {
        this.retryCurrentLevel();
    }

    createPlayer(start) {
        const startX = start?.x ?? Math.floor(GRID_WIDTH / 2);
        const startY = start?.y ?? 2;

        return {
            gridX: startX,
            gridY: startY,
            visualX: startX * GRID_SIZE,
            visualY: startY * GRID_SIZE,
            get x() { return this.visualX; },
            set x(val) {
                this.visualX = val;
                this.gridX = Math.round(val / GRID_SIZE);
            },
            get y() { return this.visualY; },
            set y(val) {
                this.visualY = val;
                this.gridY = Math.round(val / GRID_SIZE);
            },

            facing: start?.facing || 'down',
            isGrounded: false,
            isFalling: false,
            fallVelocity: 0,
            fallStartY: startY * GRID_SIZE,
            fallDistance: 0,
            landingTimer: 0,

            moveTimer: 0,
            moveCooldown: 0.12,
            isMoving: false,
            moveAnimFrame: 0,
            isSteppingUp: false,
            stepUpProgress: 0,
            stepUpStartX: 0,
            stepUpStartY: 0,
            stepUpTargetX: 0,
            stepUpTargetY: 0,
            stepUpHoldTimer: 0,
            stepUpHoldDirection: 0,

            digCooldown: 0,
            digBufferTimer: 0,
            isDrilling: false,
            drillAnimFrame: 0,
            drillAnimTimer: 0,
            drillLockTimer: 0,
            drillSnapTargetX: null,
            drillMadeContact: false,
            showDrill: false,
        };
    }

    loadLevel(levelIndex, {
        score = 0,
        checkpoint = score,
        state = 'countdown',
    } = {}) {
        const level = CAMPAIGN_LEVELS[levelIndex];
        if (!level) {
            throw new Error(`Unknown campaign level: ${levelIndex}`);
        }
        if (!Array.isArray(level.rows) || level.rows.length === 0) {
            throw new Error(`${level.id} must contain at least one row`);
        }
        if (level.rows.length > GRID_HEIGHT) {
            throw new Error(`${level.id} is taller than the world grid`);
        }
        const isIntegerInRange = (value, min, max) =>
            Number.isInteger(value) && value >= min && value < max;
        if (
            !isIntegerInRange(level.start?.x, 0, GRID_WIDTH) ||
            !isIntegerInRange(level.start?.y, 0, level.rows.length)
        ) {
            throw new Error(`${level.id} has an invalid start cell`);
        }
        if (!SAFE_TYPES.has(level.safe?.type)) {
            throw new Error(`${level.id} has an invalid safe type`);
        }
        if (
            !Number.isInteger(level.safe?.difficulty) ||
            level.safe.difficulty < 1 ||
            level.safe.difficulty > 3
        ) {
            throw new Error(`${level.id} has an invalid safe difficulty`);
        }
        if (
            !isIntegerInRange(level.safe?.x, 0, GRID_WIDTH) ||
            !isIntegerInRange(level.safe?.y, 0, level.rows.length) ||
            !Number.isInteger(level.safe?.width) ||
            level.safe.width <= 0 ||
            !Number.isInteger(level.safe?.height) ||
            level.safe.height <= 0 ||
            level.safe.x + level.safe.width > GRID_WIDTH ||
            level.safe.y + level.safe.height > level.rows.length
        ) {
            throw new Error(`${level.id} has invalid safe bounds`);
        }
        if (
            level.start.x >= level.safe.x &&
            level.start.x < level.safe.x + level.safe.width &&
            level.start.y >= level.safe.y &&
            level.start.y < level.safe.y + level.safe.height
        ) {
            throw new Error(`${level.id} start cell overlaps the safe`);
        }
        if (!Array.isArray(level.items)) {
            throw new Error(`${level.id} items must be an array`);
        }

        this.grid = [];
        this.colorBlocks = [];
        this.xBlocks = [];
        this.nextColorBlockId = 1;
        this.colorComponentStates = new Map();
        this.currentLevelIndex = levelIndex;
        this.levelStartScore = checkpoint;
        this.levelHeight = level.rows.length;
        this.player = this.createPlayer(level.start);

        this.oxygen = level.start.oxygen ?? 100;
        this.score = score;
        this.depth = 0;
        this.cameraY = 0;
        this.debrisParticles = [];
        this.screenShake = 0;
        this.screenShakePhase = 0;
        this.visualTime = 0;
        this.oxygenTubes = [];
        this.treasures = [];
        this.itemsByCell = new Map();
        this.reinforcedRoofCells = new Set();
        this.gameState = state;
        this.countdownTimer = 0;
        this.countdownNumber = 3;
        this.safePuzzle.clear();
        this.puzzleContext = null;
        this.safeContactArmed = true;
        this.puzzleBonus = 0;
        this.lastLevelScore = 0;
        this.newlyUnlockedLevelIndex = null;
        this.hasPlayerDug = false;
        this.hasSideDrilled = false;
        this.lastDestroyedItemType = null;
        this.pendingMatchCheck = false;
        this.deathCause = null;
        this.deathTimer = 0;
        this.deathImpact = null;
        this.warningMessage = null;
        this.warningMessageTimer = 0;
        this.hasShownFallWarning = false;
        this.gamepadMessage = null;
        this.gamepadMessageTime = 0;
        this.lastRenderedState = null;
        this.clearKeyboardInput();
        
        for (let y = 0; y < GRID_HEIGHT; y++) {
            this.grid[y] = Array(GRID_WIDTH).fill(BLOCK_TYPES.EMPTY);
        }

        const validSymbols = new Set(['.', '0', '1', '2', '3', 'X', '#', '=']);
        level.rows.forEach((row, y) => {
            if (row.length !== GRID_WIDTH) {
                throw new Error(`${level.id} row ${y} must be ${GRID_WIDTH} cells wide`);
            }

            [...row].forEach((symbol, x) => {
                if (!validSymbols.has(symbol)) {
                    throw new Error(`${level.id} has invalid tile "${symbol}" at ${x},${y}`);
                }

                if (symbol >= '0' && symbol <= '3') {
                    const colorIndex = Number(symbol);
                    this.colorBlocks.push(new ColoredBlock(
                        this.nextColorBlockId++,
                        x,
                        y,
                        colorIndex
                    ));
                    this.grid[y][x] =
                        colorIndex + BLOCK_TYPES.COLORED;
                } else if (symbol === 'X') {
                    this.xBlocks.push(new XBlock(x, y));
                    this.grid[y][x] = BLOCK_TYPES.XBLOCK;
                } else if (symbol === '#' || symbol === '=') {
                    this.grid[y][x] = BLOCK_TYPES.BEDROCK;
                    if (symbol === '=') {
                        this.reinforcedRoofCells.add(`${x},${y}`);
                    }
                }
            });
        });

        for (const spec of level.items) {
            if (
                !isIntegerInRange(spec.x, 0, GRID_WIDTH) ||
                !isIntegerInRange(spec.y, 0, level.rows.length)
            ) {
                throw new Error(`${level.id} has an invalid item cell`);
            }
            const key = `${spec.x},${spec.y}`;
            if (this.grid[spec.y]?.[spec.x] !== BLOCK_TYPES.EMPTY) {
                throw new Error(`${level.id} item cell ${key} is not empty`);
            }
            if (spec.x === level.start.x && spec.y === level.start.y) {
                throw new Error(`${level.id} item cell ${key} overlaps the start`);
            }
            if (this.itemsByCell.has(key)) {
                throw new Error(`${level.id} has duplicate item cell ${key}`);
            }

            const item = {
                x: spec.x * GRID_SIZE + GRID_SIZE / 2,
                y: spec.y * GRID_SIZE + GRID_SIZE / 2,
                gridX: spec.x,
                gridY: spec.y,
                type: spec.kind === 'oxygen' ?
                    'oxygen' :
                    (spec.type || 'coin'),
                value: spec.value || 0,
                collected: false,
                destroyed: false,
            };
            this.grid[spec.y][spec.x] = BLOCK_TYPES.ITEM;
            this.itemsByCell.set(key, item);

            if (spec.kind === 'oxygen') {
                this.oxygenTubes.push(item);
            } else {
                this.treasures.push(item);
            }
        }

        if (
            this.grid[level.start.y]?.[level.start.x] !== BLOCK_TYPES.EMPTY
        ) {
            throw new Error(`${level.id} start cell is blocked`);
        }

        for (let y = level.safe.y; y < level.safe.y + level.safe.height; y++) {
            for (let x = level.safe.x; x < level.safe.x + level.safe.width; x++) {
                if (this.grid[y]?.[x] !== BLOCK_TYPES.EMPTY) {
                    throw new Error(`${level.id} safe cell ${x},${y} is blocked`);
                }
            }
        }

        this.safe = {
            type: level.safe.type,
            difficulty: level.safe.difficulty,
            x: level.safe.x * GRID_SIZE,
            y: level.safe.y * GRID_SIZE,
            width: level.safe.width * GRID_SIZE,
            height: level.safe.height * GRID_SIZE,
        };
    }
    
    render() {
        this.renderCaveBackground();
        this.renderAmbientDust();
        
        const shakeX = this.reducedMotion ?
            0 :
            this.pixelSnap(Math.sin(this.screenShakePhase) * this.screenShake);
        const shakeY = this.reducedMotion ?
            0 :
            this.pixelSnap(
                Math.cos(this.screenShakePhase * 1.37) *
                this.screenShake *
                0.65
            );
        this.renderShakeX = shakeX;
        this.renderShakeY = shakeY;
        this.ctx.save();
        this.ctx.translate(shakeX, shakeY);

        // Recessed pockets sit behind both the surrounding terrain and loot.
        for (const item of [...this.oxygenTubes, ...this.treasures]) {
            const screenY = item.y - this.cameraY;
            if (screenY > -GRID_SIZE && screenY < CANVAS_HEIGHT + GRID_SIZE) {
                this.renderItemPocket(item, screenY);
            }
        }

        this.renderWorldShadows();

        // Render colored blocks
        for (const block of this.colorBlocks) {
            if (block.destroyed) continue;
            this.renderColoredBlock(block);
        }
        
        // Render X-blocks
        for (const xBlock of this.xBlocks) {
            if (xBlock.destroyed) continue;
            
            const fallOffset = xBlock.isFalling ? xBlock.fallProgress * GRID_SIZE : 0;
            const shakeOffset = xBlock.getShakeOffset(this.reducedMotion);
            const screenY = xBlock.y * GRID_SIZE - this.cameraY + fallOffset;
            
            if (screenY > -GRID_SIZE && screenY < CANVAS_HEIGHT + GRID_SIZE) {
                this.renderXBlock(xBlock.x * GRID_SIZE + shakeOffset, screenY, xBlock);
            }
        }
        
        // Render bedrock blocks
        for (let y = 0; y < GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH; x++) {
                if (this.grid[y][x] === BLOCK_TYPES.BEDROCK) {
                    const screenY = y * GRID_SIZE - this.cameraY;
                    if (screenY > -GRID_SIZE && screenY < CANVAS_HEIGHT + GRID_SIZE) {
                        this.renderBedrock(
                            x * GRID_SIZE,
                            screenY,
                            this.reinforcedRoofCells.has(`${x},${y}`)
                        );
                    }
                }
            }
        }
        
        // Render oxygen tubes
        this.oxygenTubes.forEach(tube => {
            if (!tube.collected) {
                const screenY = tube.y - this.cameraY;
                if (screenY > -GRID_SIZE && screenY < CANVAS_HEIGHT + GRID_SIZE) {
                    this.renderOxygenTube(tube.x, screenY);
                }
            }
        });
        
        // Render treasures
        this.treasures.forEach(treasure => {
            if (!treasure.collected) {
                const screenY = treasure.y - this.cameraY;
                if (screenY > -GRID_SIZE && screenY < CANVAS_HEIGHT + GRID_SIZE) {
                    this.renderTreasure(treasure.x, screenY, treasure.type);
                }
            }
        });
        
        // Render safe
        const safeScreenY = this.safe.y - this.cameraY;
        if (safeScreenY > -this.safe.height && safeScreenY < CANVAS_HEIGHT) {
            this.renderSafe(this.safe.x, safeScreenY);
        }
        
        this.renderFallSpeedLines();
        this.renderDebris();

        // Render player
        const playerScreenY = this.player.visualY - this.cameraY;
        this.renderManny(
            this.pixelSnap(this.player.visualX),
            this.pixelSnap(playerScreenY),
            this.player.facing,
            this.player.isDrilling
        );

        if (this.gameState === 'dying' && this.deathCause === 'crushed') {
            this.renderCrushForeground();
        }
        
        this.ctx.restore();
        this.renderLighting();
        this.renderPostProcess();
        this.renderDangerOverlay();
        this.ui.sync(this);
    }

    pixelSnap(value) {
        return Math.round(value);
    }

    hashCell(x, y, seed = 0) {
        let value = Math.imul(x + seed * 17, 374761393);
        value = (value + Math.imul(y - seed * 31, 668265263)) | 0;
        value = Math.imul(value ^ (value >>> 13), 1274126177);
        return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
    }

    fillSteppedRect(x, y, width, height, cut, color) {
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x + cut, y, width - cut * 2, height);
        this.ctx.fillRect(x, y + cut, width, height - cut * 2);
    }

    renderCrushForeground() {
        if (!this.deathImpact) return;

        const sourceBlock = this.deathImpact.sourceBlock;
        if (
            this.deathImpact.sourceKind === 'color' &&
            sourceBlock &&
            !sourceBlock.destroyed
        ) {
            this.renderColoredBlock(sourceBlock);
            return;
        }

        if (
            this.deathImpact.sourceKind !== 'x' ||
            !sourceBlock ||
            sourceBlock.destroyed
        ) return;

        const fallOffset = sourceBlock.isFalling ?
            sourceBlock.fallProgress * GRID_SIZE :
            0;
        const screenY =
            sourceBlock.y * GRID_SIZE -
            this.cameraY +
            fallOffset;
        this.renderXBlock(
            sourceBlock.x * GRID_SIZE +
                sourceBlock.getShakeOffset(this.reducedMotion),
            screenY,
            sourceBlock
        );
    }

    renderDangerOverlay() {
        const ctx = this.ctx;
        ctx.save();

        if (this.gameState === 'dying') {
            const progress = Math.max(
                0,
                Math.min(1, 1 - this.deathTimer / DEATH_BEAT_DURATION)
            );

            if (this.deathCause === 'crushed') {
                const flash = this.reducedMotion ?
                    0 :
                    Math.max(0, 1 - progress / 0.32);
                ctx.globalAlpha = 0.26 * flash;
                ctx.fillStyle = '#fff0c5';
                ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

                ctx.globalAlpha = 0.12 + progress * 0.22;
                ctx.fillStyle = '#7b1723';
                for (let step = 0; step < 5; step++) {
                    const inset = step * 9;
                    ctx.fillRect(inset, inset, CANVAS_WIDTH - inset * 2, 6);
                    ctx.fillRect(
                        inset,
                        CANVAS_HEIGHT - inset - 6,
                        CANVAS_WIDTH - inset * 2,
                        6
                    );
                }
            } else {
                ctx.globalAlpha = 0.12 + progress * 0.38;
                ctx.fillStyle = '#03101a';
                ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                ctx.globalAlpha = Math.max(0, 0.18 - progress * 0.12);
                ctx.fillStyle = '#5cecff';
                ctx.fillRect(0, 0, CANVAS_WIDTH, 4);
                ctx.fillRect(0, CANVAS_HEIGHT - 4, CANVAS_WIDTH, 4);
            }
        }

        ctx.restore();
    }

    renderCaveBackground() {
        const ctx = this.ctx;
        const snappedCameraY = this.pixelSnap(this.cameraY);
        const firstWorldRow = Math.floor(snappedCameraY / GRID_SIZE) - 1;
        const rowOffset = -(snappedCameraY % GRID_SIZE) - GRID_SIZE;
        const biomes = {
            earth: {
                base: ['#211725', '#1d1724'],
                seam: '#332238',
                fleck: '#3b293d',
                shadow: '#120f18',
                accent: '#6a3c45',
            },
            slate: {
                base: ['#101723', '#0e1521'],
                seam: '#19263a',
                fleck: '#203149',
                shadow: '#080d16',
                accent: '#2c6675',
            },
            vault: {
                base: ['#10151c', '#0d1219'],
                seam: '#242b34',
                fleck: '#303844',
                shadow: '#070b10',
                accent: '#765738',
            },
        };

        ctx.fillStyle = '#080b13';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        for (let visibleRow = 0; visibleRow < VIEWPORT_HEIGHT + 3; visibleRow++) {
            const worldRow = firstWorldRow + visibleRow;
            const screenY = rowOffset + visibleRow * GRID_SIZE;
            const depth = Math.max(0, worldRow);
            const biome = depth < 15 ?
                biomes.earth :
                depth < 35 ? biomes.slate : biomes.vault;

            ctx.fillStyle = biome.base[Math.abs(worldRow) % biome.base.length];
            ctx.fillRect(0, screenY, CANVAS_WIDTH, GRID_SIZE);

            if (worldRow >= 0 && worldRow % (depth >= 35 ? 3 : 4) === 0) {
                ctx.fillStyle = biome.seam;
                for (let segment = 0; segment < GRID_WIDTH; segment++) {
                    const notch = depth >= 35 ?
                        0 :
                        (this.hashCell(segment, worldRow, 9) > 0.5 ? 4 : 0);
                    ctx.fillRect(
                        segment * GRID_SIZE,
                        this.pixelSnap(screenY + 8 + notch),
                        GRID_SIZE,
                        depth >= 35 ? 3 : 2
                    );
                }
            }

            for (let x = 0; x < GRID_WIDTH; x++) {
                const fleck = this.hashCell(x, worldRow, 3);
                const fleckX = x * GRID_SIZE + 8 +
                    Math.floor(this.hashCell(x, worldRow, 5) * 24) * 2;
                const fleckY = screenY + 12 +
                    Math.floor(this.hashCell(x, worldRow, 7) * 18) * 2;

                if (fleck > 0.38) {
                    ctx.fillStyle = biome.fleck;
                    ctx.fillRect(this.pixelSnap(fleckX), this.pixelSnap(fleckY), 6, 4);
                    ctx.fillStyle = biome.shadow;
                    ctx.fillRect(this.pixelSnap(fleckX + 4), this.pixelSnap(fleckY + 4), 4, 2);
                }

                if (fleck > 0.91) {
                    ctx.fillStyle = biome.accent;
                    ctx.fillRect(this.pixelSnap(fleckX + 18), this.pixelSnap(fleckY - 6), 4, 2);
                    ctx.fillRect(this.pixelSnap(fleckX + 20), this.pixelSnap(fleckY - 4), 2, 4);
                }

                if (depth < 15 && fleck > 0.78) {
                    ctx.fillStyle = '#49303b';
                    ctx.fillRect(this.pixelSnap(fleckX + 10), screenY, 3, 14);
                    ctx.fillRect(this.pixelSnap(fleckX + 7), screenY + 11, 6, 3);
                    ctx.fillStyle = '#251a25';
                    ctx.fillRect(this.pixelSnap(fleckX + 8), screenY + 14, 3, 9);
                } else if (depth >= 15 && depth < 35 && fleck > 0.84) {
                    ctx.fillStyle = '#285569';
                    for (let step = 0; step < 4; step++) {
                        ctx.fillRect(
                            this.pixelSnap(fleckX + step * 5),
                            this.pixelSnap(fleckY - step * 3),
                            6,
                            2
                        );
                    }
                    ctx.fillStyle = '#4f91a0';
                    ctx.fillRect(this.pixelSnap(fleckX + 8), this.pixelSnap(fleckY - 5), 4, 2);
                } else if (depth >= 35 && fleck > 0.8) {
                    ctx.fillStyle = '#4b5158';
                    ctx.fillRect(this.pixelSnap(fleckX + 12), this.pixelSnap(fleckY - 8), 4, 4);
                    ctx.fillStyle = '#181d24';
                    ctx.fillRect(this.pixelSnap(fleckX + 13), this.pixelSnap(fleckY - 7), 2, 2);
                }
            }
        }

        const centerDepth = Math.max(
            0,
            Math.floor((this.cameraY + CANVAS_HEIGHT / 2) / GRID_SIZE)
        );
        const parallaxColor = centerDepth < 15 ?
            'rgba(105, 58, 69, 0.12)' :
            centerDepth < 35 ?
                'rgba(54, 112, 132, 0.10)' :
                'rgba(145, 105, 65, 0.08)';
        const parallaxSpan = CANVAS_HEIGHT + 180;
        ctx.fillStyle = parallaxColor;

        for (let index = 0; index < 7; index++) {
            const x = Math.floor(this.hashCell(index, 4, 22) * CANVAS_WIDTH);
            const baseY = this.hashCell(index, 9, 31) * parallaxSpan;
            const y = (
                (baseY - this.cameraY * (0.12 + index * 0.012)) %
                parallaxSpan +
                parallaxSpan
            ) % parallaxSpan - 80;
            const height = 44 + Math.floor(this.hashCell(index, 11, 18) * 72);
            ctx.fillRect(this.pixelSnap(x), this.pixelSnap(y), index % 2 ? 2 : 3, height);
            ctx.fillRect(this.pixelSnap(x - 4), this.pixelSnap(y + height - 8), 8, 2);
        }

        // Larger, low-contrast silhouettes make each depth band feel like a
        // distinct place instead of only a palette swap.
        if (centerDepth < 15) {
            ctx.fillStyle = 'rgba(88, 48, 55, 0.16)';
            for (let index = 0; index < 4; index++) {
                const x = this.pixelSnap(24 + this.hashCell(index, 8, 105) * (CANVAS_WIDTH - 48));
                const y = this.pixelSnap(
                    ((this.hashCell(index, 5, 108) * parallaxSpan -
                        this.cameraY * 0.08) % parallaxSpan + parallaxSpan) %
                        parallaxSpan - 90
                );
                const length = 58 + index * 13;
                ctx.fillRect(x, y, index % 2 ? 3 : 4, length);
                ctx.fillRect(x - 12, y + 22 + index * 5, 14, 3);
                ctx.fillRect(x + 2, y + 43 + index * 4, 10, 3);
            }
        } else if (centerDepth < 35) {
            ctx.fillStyle = 'rgba(48, 112, 133, 0.12)';
            for (let index = 0; index < 5; index++) {
                const x = this.pixelSnap(18 + this.hashCell(index, 12, 112) * (CANVAS_WIDTH - 50));
                const y = this.pixelSnap(
                    ((this.hashCell(index, 3, 118) * parallaxSpan -
                        this.cameraY * 0.1) % parallaxSpan + parallaxSpan) %
                        parallaxSpan - 70
                );
                for (let step = 0; step < 5; step++) {
                    ctx.fillRect(x + step * 5, y + 26 - step * 7, 7, 35 + step * 5);
                }
                ctx.fillStyle = 'rgba(95, 175, 189, 0.08)';
                ctx.fillRect(x + 10, y + 12, 4, 40);
                ctx.fillStyle = 'rgba(48, 112, 133, 0.12)';
            }
        } else {
            ctx.fillStyle = 'rgba(128, 105, 72, 0.11)';
            for (let index = 0; index < 4; index++) {
                const x = this.pixelSnap(28 + this.hashCell(index, 16, 124) * (CANVAS_WIDTH - 56));
                const y = this.pixelSnap(
                    ((this.hashCell(index, 6, 131) * parallaxSpan -
                        this.cameraY * 0.06) % parallaxSpan + parallaxSpan) %
                        parallaxSpan - 100
                );
                ctx.fillRect(x, y, 4, 150);
                ctx.fillRect(x - 5, y + 32, 14, 5);
                ctx.fillRect(x - 7, y + 96, 18, 5);
                ctx.fillStyle = 'rgba(185, 138, 78, 0.08)';
                ctx.fillRect(x + 1, y + 4, 1, 142);
                ctx.fillStyle = 'rgba(128, 105, 72, 0.11)';
            }
        }
    }

    renderAmbientDust() {
        const ctx = this.ctx;
        const depth = Math.max(0, Math.floor(this.cameraY / GRID_SIZE));
        ctx.save();

        for (let index = 0; index < 24; index++) {
            const speed = 3 + this.hashCell(index, 3, 44) * 7;
            const drift = this.visualTime * speed;
            const x = (
                this.hashCell(index, 7, 12) * CANVAS_WIDTH +
                Math.sin(this.visualTime * 0.35 + index) * 12 +
                CANVAS_WIDTH
            ) % CANVAS_WIDTH;
            const y = (
                this.hashCell(index, 13, 6) * (CANVAS_HEIGHT + 40) +
                drift -
                this.cameraY * 0.035 +
                CANVAS_HEIGHT +
                40
            ) % (CANVAS_HEIGHT + 40) - 20;
            const alpha = 0.045 + this.hashCell(index, 5, 28) * 0.08;
            ctx.fillStyle = depth > 28 ?
                `rgba(162, 181, 198, ${alpha})` :
                `rgba(210, 189, 178, ${alpha})`;
            const size = index % 5 === 0 ? 2 : 1;
            ctx.fillRect(this.pixelSnap(x), this.pixelSnap(y), size, size);
        }

        ctx.restore();
    }

    renderWorldShadows() {
        const ctx = this.ctx;
        ctx.save();

        const isOpenCell = (x, y) => {
            const value = this.grid[y]?.[x];
            return value === undefined ||
                value === BLOCK_TYPES.EMPTY ||
                value === BLOCK_TYPES.ITEM;
        };
        const drawContactShadow = (screenX, screenY, rightOpen, bottomOpen) => {
            // A soft cast shadow plus a tight contact line gives the chunky
            // pixel blocks weight without blurring their silhouettes.
            ctx.fillStyle = 'rgba(1, 2, 7, 0.26)';
            if (rightOpen) {
                ctx.fillRect(
                    this.pixelSnap(screenX + GRID_SIZE - 1),
                    this.pixelSnap(screenY + 8),
                    8,
                    GRID_SIZE - 4
                );
            }
            if (bottomOpen) {
                ctx.fillRect(
                    this.pixelSnap(screenX + 8),
                    this.pixelSnap(screenY + GRID_SIZE - 1),
                    GRID_SIZE - 4,
                    8
                );
            }
            if (rightOpen && bottomOpen) {
                ctx.fillRect(
                    this.pixelSnap(screenX + GRID_SIZE - 1),
                    this.pixelSnap(screenY + GRID_SIZE - 1),
                    8,
                    8
                );
            }

            ctx.fillStyle = 'rgba(1, 2, 7, 0.6)';
            if (rightOpen) {
                ctx.fillRect(
                    this.pixelSnap(screenX + GRID_SIZE - 1),
                    this.pixelSnap(screenY + 12),
                    3,
                    GRID_SIZE - 16
                );
            }
            if (bottomOpen) {
                ctx.fillRect(
                    this.pixelSnap(screenX + 12),
                    this.pixelSnap(screenY + GRID_SIZE - 1),
                    GRID_SIZE - 16,
                    3
                );
            }
        };

        for (const block of this.colorBlocks) {
            if (block.destroyed) continue;
            const fallOffset = block.isFalling ? block.fallProgress * GRID_SIZE : 0;
            const screenY = block.y * GRID_SIZE - this.cameraY + fallOffset;
            if (screenY < -GRID_SIZE || screenY > CANVAS_HEIGHT + GRID_SIZE) continue;
            const screenX = block.x * GRID_SIZE +
                block.getShakeOffset(this.reducedMotion);
            drawContactShadow(
                screenX,
                screenY,
                isOpenCell(block.x + 1, block.y),
                isOpenCell(block.x, block.y + 1)
            );
        }

        for (const block of this.xBlocks) {
            if (block.destroyed) continue;
            const fallOffset = block.isFalling ? block.fallProgress * GRID_SIZE : 0;
            const screenY = block.y * GRID_SIZE - this.cameraY + fallOffset;
            if (screenY < -GRID_SIZE || screenY > CANVAS_HEIGHT + GRID_SIZE) continue;
            drawContactShadow(
                block.x * GRID_SIZE +
                    block.getShakeOffset(this.reducedMotion),
                screenY,
                isOpenCell(block.x + 1, block.y),
                isOpenCell(block.x, block.y + 1)
            );
        }

        for (let y = 0; y < GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH; x++) {
                if (this.grid[y]?.[x] !== BLOCK_TYPES.BEDROCK) continue;
                const screenY = y * GRID_SIZE - this.cameraY;
                if (screenY < -GRID_SIZE || screenY > CANVAS_HEIGHT + GRID_SIZE) continue;
                drawContactShadow(
                    x * GRID_SIZE,
                    screenY,
                    isOpenCell(x + 1, y),
                    isOpenCell(x, y + 1)
                );
            }
        }

        ctx.restore();
    }

    renderFallSpeedLines() {
        if (
            !this.player.isFalling ||
            this.player.fallDistance < LONG_FALL_VISUAL_THRESHOLD
        ) return;

        const ctx = this.ctx;
        const intensity = Math.min(
            1,
            (this.player.fallDistance - LONG_FALL_VISUAL_THRESHOLD) / 3
        );
        ctx.save();
        ctx.fillStyle = `rgba(186, 221, 239, ${0.08 + intensity * 0.13})`;

        for (let index = 0; index < 11; index++) {
            const x = Math.floor(this.hashCell(index, 17, 66) * CANVAS_WIDTH);
            const offset = (
                this.visualTime * (170 + index * 13) +
                this.hashCell(index, 8, 91) * CANVAS_HEIGHT
            ) % CANVAS_HEIGHT;
            const length = 8 +
                Math.floor(this.hashCell(index, 6, 43) * 22 * intensity);
            ctx.fillRect(
                this.pixelSnap(x),
                this.pixelSnap(offset),
                index % 4 === 0 ? 2 : 1,
                length
            );
        }

        ctx.restore();
    }

    renderItemPocket(item, screenCenterY) {
        const ctx = this.ctx;
        const x = item.gridX * GRID_SIZE;
        const y = this.pixelSnap(screenCenterY - GRID_SIZE / 2);
        const isOxygen = item.type === 'oxygen';
        const accent = isOxygen ? '#4de8ff' : '#f4bd21';

        // Uneven rock cavity; the surrounding world blocks are the frame.
        this.fillSteppedRect(x + 3, y + 4, GRID_SIZE - 6, GRID_SIZE - 7, 8, '#02040a');
        this.fillSteppedRect(x + 8, y + 9, GRID_SIZE - 16, GRID_SIZE - 17, 6, '#090c15');
        ctx.fillStyle = '#151a25';
        ctx.fillRect(x + 14, y + 12, GRID_SIZE - 29, 3);
        ctx.fillRect(x + 11, y + 16, 3, GRID_SIZE - 31);
        ctx.fillStyle = '#05070d';
        ctx.fillRect(x + 16, y + 17, GRID_SIZE - 31, GRID_SIZE - 31);

        for (let index = 0; index < 6; index++) {
            const chipX = x + 8 +
                Math.floor(this.hashCell(item.gridX, item.gridY, 80 + index) * 44);
            const chipY = y + 10 +
                Math.floor(this.hashCell(item.gridY, item.gridX, 94 + index) * 34);
            ctx.fillStyle = index % 2 === 0 ? '#303641' : '#1c222d';
            ctx.fillRect(
                this.pixelSnap(chipX),
                this.pixelSnap(chipY),
                3 + index % 3 * 2,
                2 + index % 2 * 2
            );
        }

        if (isOxygen) {
            // Industrial cradle: the pickup reads as a separate object mounted
            // inside the cave, never as another kind of drillable block.
            ctx.fillStyle = '#101b24';
            ctx.fillRect(x + 7, y + 13, 6, 37);
            ctx.fillRect(x + GRID_SIZE - 13, y + 13, 6, 37);
            ctx.fillStyle = '#3d5661';
            ctx.fillRect(x + 8, y + 14, 2, 31);
            ctx.fillRect(x + GRID_SIZE - 12, y + 14, 2, 31);
            ctx.fillStyle = '#172b35';
            ctx.fillRect(x + 10, y + 11, GRID_SIZE - 20, 5);
            ctx.fillStyle = '#63808a';
            ctx.fillRect(x + 14, y + 12, GRID_SIZE - 28, 2);

            ctx.fillStyle = '#071219';
            ctx.fillRect(x + GRID_SIZE - 14, y + 19, 5, 14);
            ctx.fillStyle = `rgba(91, 245, 255, ${
                0.58 + Math.sin(this.visualTime * 5 + item.gridY) * 0.2
            })`;
            ctx.fillRect(x + GRID_SIZE - 12, y + 21, 2, 3);
            ctx.fillStyle = '#b98534';
            ctx.fillRect(x + GRID_SIZE - 12, y + 27, 2, 2);
        } else {
            ctx.fillStyle = '#4f3c22';
            ctx.fillRect(x + 8, y + 12, 8, 3);
            ctx.fillRect(x + GRID_SIZE - 16, y + 12, 8, 3);
            ctx.fillStyle = '#a97a2b';
            ctx.fillRect(x + 10, y + 12, 3, 2);
            ctx.fillRect(x + GRID_SIZE - 13, y + 12, 3, 2);
        }

        ctx.fillStyle = '#171c25';
        ctx.fillRect(x + 9, y + GRID_SIZE - 13, GRID_SIZE - 18, 7);
        ctx.fillStyle = '#454d58';
        ctx.fillRect(x + 14, y + GRID_SIZE - 14, GRID_SIZE - 28, 3);
        ctx.fillStyle = '#080b11';
        ctx.fillRect(x + 15, y + GRID_SIZE - 6, GRID_SIZE - 30, 3);

        if (!item.collected) {
            ctx.save();
            ctx.globalAlpha = 0.19 +
                Math.sin(this.visualTime * 4.2 + item.gridY) * 0.04;
            ctx.fillStyle = accent;
            ctx.fillRect(x + 25, y + GRID_SIZE - 17, 14, 2);
            ctx.fillRect(x + 29, y + GRID_SIZE - 19, 6, 2);
            ctx.restore();
        }
    }

    renderOxygenTube(x, y) {
        const ctx = this.ctx;
        const bob = this.pixelSnap(Math.sin(this.visualTime * 4.2 + x) * 1.25);
        const centerX = this.pixelSnap(x);
        const centerY = this.pixelSnap(y + bob);

        ctx.save();
        ctx.fillStyle = 'rgba(1, 4, 9, 0.68)';
        ctx.fillRect(centerX - 18, centerY + 24, 36, 4);
        ctx.fillRect(centerX - 12, centerY + 28, 24, 2);

        // Dark stepped outline and broad shoulders make the silhouette legible
        // even when the surrounding cave is heavily shaded.
        this.fillSteppedRect(centerX - 16, centerY - 22, 32, 47, 5, '#01060b');
        this.fillSteppedRect(centerX - 14, centerY - 20, 28, 43, 4, '#26323c');

        const glass = ctx.createLinearGradient(centerX - 11, 0, centerX + 11, 0);
        glass.addColorStop(0, '#063746');
        glass.addColorStop(0.24, '#0f91a3');
        glass.addColorStop(0.5, '#19c7d1');
        glass.addColorStop(0.72, '#08778b');
        glass.addColorStop(1, '#032b39');
        this.fillSteppedRect(centerX - 11, centerY - 16, 22, 33, 3, glass);

        // Cool glass bands, hard pixel specular and a darker far rim.
        ctx.fillStyle = '#74f0f3';
        ctx.fillRect(centerX - 8, centerY - 13, 3, 25);
        ctx.fillStyle = '#dcffff';
        ctx.fillRect(centerX - 7, centerY - 12, 2, 10);
        ctx.fillRect(centerX - 6, centerY - 12, 2, 5);
        ctx.fillStyle = '#075064';
        ctx.fillRect(centerX + 7, centerY - 12, 3, 25);
        ctx.fillStyle = 'rgba(181, 255, 255, 0.4)';
        ctx.fillRect(centerX - 3, centerY + 13, 8, 2);

        // Steel collars, feet and a brass pressure valve.
        ctx.fillStyle = '#1a222b';
        ctx.fillRect(centerX - 15, centerY - 22, 30, 6);
        ctx.fillRect(centerX - 15, centerY + 16, 30, 6);
        ctx.fillStyle = '#71818a';
        ctx.fillRect(centerX - 12, centerY - 21, 22, 2);
        ctx.fillRect(centerX - 12, centerY + 17, 22, 2);
        ctx.fillStyle = '#c4d5d8';
        ctx.fillRect(centerX - 10, centerY - 21, 7, 1);
        ctx.fillRect(centerX - 10, centerY + 17, 6, 1);
        ctx.fillStyle = '#111820';
        ctx.fillRect(centerX - 11, centerY + 22, 6, 4);
        ctx.fillRect(centerX + 5, centerY + 22, 6, 4);

        ctx.fillStyle = '#1c252c';
        ctx.fillRect(centerX - 8, centerY - 28, 16, 7);
        ctx.fillStyle = '#8fa1a5';
        ctx.fillRect(centerX - 6, centerY - 27, 12, 2);
        ctx.fillStyle = '#050b0f';
        ctx.fillRect(centerX - 4, centerY - 25, 8, 4);
        ctx.fillStyle = '#80531c';
        ctx.fillRect(centerX + 9, centerY - 25, 8, 7);
        ctx.fillStyle = '#ffd66d';
        ctx.fillRect(centerX + 10, centerY - 24, 5, 2);
        ctx.fillStyle = '#c8912f';
        ctx.fillRect(centerX + 15, centerY - 23, 3, 4);

        // Inset O2 label.
        ctx.fillStyle = '#022833';
        ctx.fillRect(centerX - 8, centerY - 5, 16, 12);
        ctx.fillStyle = '#1d7d8b';
        ctx.fillRect(centerX - 7, centerY - 4, 14, 2);
        ctx.fillStyle = '#bffbff';
        ctx.fillRect(centerX - 5, centerY - 2, 2, 6);
        ctx.fillRect(centerX - 3, centerY - 3, 3, 2);
        ctx.fillRect(centerX - 3, centerY + 3, 3, 2);
        ctx.fillRect(centerX, centerY - 2, 2, 6);
        ctx.fillRect(centerX + 3, centerY - 2, 3, 2);
        ctx.fillRect(centerX + 4, centerY, 2, 2);
        ctx.fillRect(centerX + 2, centerY + 2, 4, 2);

        // Tiny pressure bubbles slowly rise behind the label.
        const bubblePhase = Math.floor(this.visualTime * 7 + x * 0.03) % 12;
        ctx.fillStyle = '#dcffff';
        ctx.fillRect(centerX + 3, centerY + 10 - bubblePhase, 2, 2);
        if (bubblePhase > 4) {
            ctx.fillStyle = '#6cebf2';
            ctx.fillRect(centerX, centerY + 14 - bubblePhase, 1, 1);
        }

        ctx.fillStyle = `rgba(111, 255, 239, ${
            0.62 + Math.sin(this.visualTime * 5.5 + x) * 0.2
        })`;
        ctx.fillRect(centerX + 12, centerY + 9, 2, 4);
        ctx.restore();
    }

    renderSafe(x, y) {
        const ctx = this.ctx;
        const screenX = this.pixelSnap(x);
        const screenY = this.pixelSnap(y);
        const width = this.safe.width;
        const height = this.safe.height;
        const assetKey = SAFE_ASSET_KEYS[this.safe.type];
        const safeSprite = assetKey ? ASSETS[assetKey] : null;

        if (safeSprite) {
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(safeSprite, screenX, screenY, width, height);
            ctx.restore();
            return;
        }

        ctx.fillStyle = '#020308';
        ctx.fillRect(screenX + 10, screenY + 12, width, height);
        ctx.fillStyle = '#0c0d14';
        ctx.fillRect(screenX + width - 2, screenY + 18, 12, height - 12);
        ctx.fillRect(screenX + 18, screenY + height - 2, width - 8, 14);
        this.fillSteppedRect(screenX, screenY, width, height, 6, '#171522');
        this.fillSteppedRect(screenX + 4, screenY + 4, width - 8, height - 8, 4, '#4b4855');
        ctx.fillStyle = '#242530';
        ctx.fillRect(screenX + 10, screenY + 10, width - 20, height - 20);
        ctx.fillStyle = '#77737d';
        ctx.fillRect(screenX + 10, screenY + 10, width - 20, 4);
        ctx.fillRect(screenX + 10, screenY + 10, 4, height - 20);
        ctx.fillStyle = '#11131c';
        ctx.fillRect(screenX + width - 16, screenY + 12, 5, height - 24);
        ctx.fillRect(screenX + 12, screenY + height - 16, width - 24, 5);

        const doorX = screenX + 24;
        const doorY = screenY + 24;
        this.fillSteppedRect(doorX, doorY, 80, 80, 8, '#0d0f17');
        this.fillSteppedRect(doorX + 5, doorY + 5, 70, 70, 7, '#343640');
        this.fillSteppedRect(doorX + 11, doorY + 11, 58, 58, 6, '#1b1e28');

        const centerX = screenX + width / 2;
        const centerY = screenY + height / 2;
        ctx.fillStyle = '#8a5b17';
        ctx.fillRect(centerX - 4, centerY - 28, 8, 56);
        ctx.fillRect(centerX - 28, centerY - 4, 56, 8);
        ctx.fillStyle = '#e4ad31';
        ctx.fillRect(centerX - 3, centerY - 25, 6, 50);
        ctx.fillRect(centerX - 25, centerY - 3, 50, 6);
        this.fillSteppedRect(centerX - 13, centerY - 13, 26, 26, 4, '#68420f');
        this.fillSteppedRect(centerX - 9, centerY - 9, 18, 18, 3, '#ffd65a');

        const rivets = [
            [16, 16], [width - 22, 16],
            [16, height - 22], [width - 22, height - 22],
        ];
        for (const [rivetX, rivetY] of rivets) {
            ctx.fillStyle = '#0b0c12';
            ctx.fillRect(screenX + rivetX, screenY + rivetY, 7, 7);
            ctx.fillStyle = '#d0c998';
            ctx.fillRect(screenX + rivetX + 1, screenY + rivetY + 1, 4, 4);
        }

        ctx.fillStyle = '#090b10';
        ctx.fillRect(screenX + width - 22, screenY + 47, 8, 34);
        const safePulse = 0.55 + Math.sin(this.visualTime * 3.4) * 0.2;
        ctx.fillStyle = `rgba(92, 241, 165, ${safePulse})`;
        ctx.fillRect(screenX + width - 20, screenY + 51, 4, 4);
        ctx.fillStyle = '#ae354d';
        ctx.fillRect(screenX + width - 20, screenY + 61, 4, 4);
        ctx.fillStyle = '#d39b32';
        ctx.fillRect(screenX + width - 20, screenY + 71, 4, 4);
    }

    getGlowSprite(color) {
        if (!this.glowSprites) {
            this.glowSprites = new Map();
        }
        if (this.glowSprites.has(color)) {
            return this.glowSprites.get(color);
        }

        const sprite = document.createElement('canvas');
        sprite.width = 128;
        sprite.height = 128;
        const glowCtx = sprite.getContext('2d');
        const gradient = glowCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
        gradient.addColorStop(0, color);
        gradient.addColorStop(0.18, color);
        gradient.addColorStop(0.58, `${color}42`);
        gradient.addColorStop(1, `${color}00`);
        glowCtx.fillStyle = gradient;
        glowCtx.fillRect(0, 0, 128, 128);
        this.glowSprites.set(color, sprite);
        return sprite;
    }

    renderLighting() {
        if (!this.dynamicLightMap) {
            this.dynamicLightMap = document.createElement('canvas');
            this.dynamicLightMap.width = Math.ceil(CANVAS_WIDTH / 2);
            this.dynamicLightMap.height = Math.ceil(CANVAS_HEIGHT / 2);
        }

        const lightMap = this.dynamicLightMap;
        const lightCtx = lightMap.getContext('2d');
        lightCtx.clearRect(0, 0, lightMap.width, lightMap.height);
        lightCtx.fillStyle = 'rgba(2, 5, 13, 0.27)';
        lightCtx.fillRect(0, 0, lightMap.width, lightMap.height);
        lightCtx.globalCompositeOperation = 'destination-out';

        const carveLight = (x, y, radius, strength = 1) => {
            const centerX = x / 2;
            const centerY = y / 2;
            const scaledRadius = radius / 2;
            const gradient = lightCtx.createRadialGradient(
                centerX,
                centerY,
                0,
                centerX,
                centerY,
                scaledRadius
            );
            gradient.addColorStop(0, `rgba(0, 0, 0, ${strength})`);
            gradient.addColorStop(0.38, `rgba(0, 0, 0, ${strength * 0.82})`);
            gradient.addColorStop(0.72, `rgba(0, 0, 0, ${strength * 0.34})`);
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            lightCtx.fillStyle = gradient;
            lightCtx.fillRect(
                centerX - scaledRadius,
                centerY - scaledRadius,
                scaledRadius * 2,
                scaledRadius * 2
            );
        };

        const shakeX = this.renderShakeX || 0;
        const shakeY = this.renderShakeY || 0;
        const playerLightX = this.player.visualX + GRID_SIZE / 2 + shakeX;
        const playerLightY =
            this.player.visualY - this.cameraY + GRID_SIZE / 2 + shakeY;
        carveLight(playerLightX, playerLightY, 184, 1);

        const visibleItems = [...this.oxygenTubes, ...this.treasures].filter(item => {
            const screenY = item.y - this.cameraY;
            return !item.collected &&
                screenY > -GRID_SIZE &&
                screenY < CANVAS_HEIGHT + GRID_SIZE;
        });
        for (const item of visibleItems) {
            carveLight(
                item.x + shakeX,
                item.y - this.cameraY + shakeY,
                item.type === 'oxygen' ? 86 : 76,
                item.type === 'oxygen' ? 0.82 : 0.72
            );
        }

        const safeScreenY = this.safe.y - this.cameraY;
        if (safeScreenY > -this.safe.height && safeScreenY < CANVAS_HEIGHT) {
            carveLight(
                this.safe.x + this.safe.width / 2 + shakeX,
                safeScreenY + this.safe.height / 2 + shakeY,
                118,
                0.74
            );
        }

        lightCtx.globalCompositeOperation = 'source-over';
        this.ctx.save();
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.drawImage(lightMap, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        this.ctx.globalCompositeOperation = 'screen';
        const playerGlow = this.getGlowSprite('#ffb35b');
        this.ctx.globalAlpha = 0.11;
        this.ctx.drawImage(
            playerGlow,
            playerLightX - 82,
            playerLightY - 82,
            164,
            164
        );

        for (const item of visibleItems) {
            const color = item.type === 'oxygen' ? '#39e5ff' : '#ffc444';
            const glow = this.getGlowSprite(color);
            const glowSize = item.type === 'oxygen' ? 108 : 94;
            this.ctx.globalAlpha = item.type === 'oxygen' ? 0.23 : 0.17;
            this.ctx.drawImage(
                glow,
                item.x + shakeX - glowSize / 2,
                item.y - this.cameraY + shakeY - glowSize / 2,
                glowSize,
                glowSize
            );
        }
        this.ctx.restore();

        if (!this.lightingOverlay) {
            const overlay = document.createElement('canvas');
            overlay.width = CANVAS_WIDTH;
            overlay.height = CANVAS_HEIGHT;
            const overlayCtx = overlay.getContext('2d');
            overlayCtx.imageSmoothingEnabled = false;

            for (let step = 0; step < 5; step++) {
                const inset = step * 12;
                const width = CANVAS_WIDTH - inset * 2;
                const height = CANVAS_HEIGHT - inset * 2;
                overlayCtx.fillStyle = 'rgba(2, 3, 10, 0.035)';
                overlayCtx.fillRect(inset, inset, width, 12);
                overlayCtx.fillRect(inset, inset + height - 12, width, 12);
                overlayCtx.fillRect(inset, inset + 12, 12, height - 24);
                overlayCtx.fillRect(inset + width - 12, inset + 12, 12, height - 24);
            }

            overlayCtx.fillStyle = 'rgba(2, 3, 10, 0.12)';
            overlayCtx.fillRect(0, CANVAS_HEIGHT - 44, CANVAS_WIDTH, 44);
            this.lightingOverlay = overlay;
        }

        this.ctx.drawImage(this.lightingOverlay, 0, 0);
    }

    renderPostProcess() {
        if (!this.postProcessOverlay) {
            const overlay = document.createElement('canvas');
            overlay.width = CANVAS_WIDTH;
            overlay.height = CANVAS_HEIGHT;
            const overlayCtx = overlay.getContext('2d');
            overlayCtx.imageSmoothingEnabled = false;

            overlayCtx.fillStyle = 'rgba(3, 5, 12, 0.022)';
            for (let y = 2; y < CANVAS_HEIGHT; y += 4) {
                overlayCtx.fillRect(0, y, CANVAS_WIDTH, 1);
            }

            for (let index = 0; index < 340; index++) {
                const x = Math.floor(this.hashCell(index, 11, 73) * CANVAS_WIDTH);
                const y = Math.floor(this.hashCell(index, 19, 37) * CANVAS_HEIGHT);
                const cool = index % 3 === 0;
                overlayCtx.fillStyle = cool ?
                    'rgba(115, 188, 225, 0.018)' :
                    'rgba(255, 219, 173, 0.014)';
                overlayCtx.fillRect(x, y, index % 9 === 0 ? 2 : 1, 1);
            }
            this.postProcessOverlay = overlay;
        }

        this.ctx.drawImage(this.postProcessOverlay, 0, 0);
    }
    
    renderDebris() {
        const ctx = this.ctx;
        ctx.save();

        for (const particle of this.debrisParticles) {
            const alpha = Math.max(0, particle.life / particle.maxLife);
            const screenY = particle.y - this.cameraY;
            if (screenY < -16 || screenY > CANVAS_HEIGHT + 16) continue;

            const screenX = this.pixelSnap(particle.x);
            const snappedY = this.pixelSnap(screenY);
            ctx.fillStyle = particle.color;

            if (particle.kind === 'sparkle') {
                const arm = Math.max(2, particle.size);
                ctx.globalAlpha = Math.min(1, alpha * 1.2);
                ctx.fillRect(screenX - arm, snappedY - 1, arm * 2 + 1, 2);
                ctx.fillRect(screenX - 1, snappedY - arm, 2, arm * 2 + 1);
                ctx.fillStyle = '#fff9d8';
                ctx.fillRect(screenX, snappedY, 2, 2);
            } else if (particle.kind === 'dust') {
                const size = Math.max(3, particle.size * (0.45 + alpha * 0.55));
                const width = this.pixelSnap(size);
                const height = Math.max(2, this.pixelSnap(size * 0.55));
                ctx.globalAlpha = alpha * 0.42;
                ctx.fillRect(
                    screenX - Math.floor(width / 2),
                    snappedY - Math.floor(height / 2),
                    width,
                    height
                );
                ctx.globalAlpha = alpha * 0.18;
                ctx.fillRect(screenX - 2, snappedY - height, width + 2, 2);
            } else {
                const size = Math.max(2, particle.size);
                ctx.globalAlpha = alpha;
                const isHorizontal = Math.abs(particle.vx) >= Math.abs(particle.vy);
                const width = isHorizontal ? size + 2 : Math.max(2, size / 2);
                const height = isHorizontal ? Math.max(2, size / 2) : size + 2;
                const chipX = screenX - Math.floor(width / 2);
                const chipY = snappedY - Math.floor(height / 2);
                ctx.fillRect(chipX, chipY, width, height);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
                if (isHorizontal) {
                    ctx.fillRect(chipX, chipY, Math.max(2, width / 2), 1);
                } else {
                    ctx.fillRect(chipX, chipY, 1, Math.max(2, height / 2));
                }
            }
        }

        ctx.restore();
    }

    getBlockTile(colorIndex, edgeMask, variant) {
        if (!this.blockTileCache) {
            this.blockTileCache = new Map();
        }

        const cacheKey = `${colorIndex}:${edgeMask}:${variant}`;
        if (this.blockTileCache.has(cacheKey)) {
            return this.blockTileCache.get(cacheKey);
        }

        const tile = document.createElement('canvas');
        tile.width = GRID_SIZE;
        tile.height = GRID_SIZE;
        const tileCtx = tile.getContext('2d');
        tileCtx.imageSmoothingEnabled = false;

        const color = BLOCK_COLORS[colorIndex];
        const hasTop = Boolean(edgeMask & 1);
        const hasRight = Boolean(edgeMask & 2);
        const hasBottom = Boolean(edgeMask & 4);
        const hasLeft = Boolean(edgeMask & 8);
        const drawShape = (left, top, right, bottom, cut, fill) => {
            tileCtx.fillStyle = fill;

            for (let row = top; row < bottom; row++) {
                let rowLeft = left;
                let rowRight = right;

                if (!hasTop && row < top + cut) {
                    const amount = top + cut - row;
                    if (!hasLeft) rowLeft += amount;
                    if (!hasRight) rowRight -= amount;
                }
                if (!hasBottom && row >= bottom - cut) {
                    const amount = row - (bottom - cut) + 1;
                    if (!hasLeft) rowLeft += amount;
                    if (!hasRight) rowRight -= amount;
                }

                tileCtx.fillRect(rowLeft, row, Math.max(0, rowRight - rowLeft), 1);
            }
        };

        const outerLeft = hasLeft ? 0 : 2;
        const outerTop = hasTop ? 0 : 2;
        const outerRight = hasRight ? GRID_SIZE : GRID_SIZE - 2;
        const outerBottom = hasBottom ? GRID_SIZE : GRID_SIZE - 2;
        drawShape(outerLeft, outerTop, outerRight, outerBottom, 6, color.deep);

        const innerLeft = hasLeft ? 0 : outerLeft + 4;
        const innerTop = hasTop ? 0 : outerTop + 4;
        const innerRight = hasRight ? GRID_SIZE : outerRight - 4;
        const innerBottom = hasBottom ? GRID_SIZE : outerBottom - 4;
        const bodyGradient = tileCtx.createLinearGradient(0, 0, GRID_SIZE, GRID_SIZE);
        bodyGradient.addColorStop(0, color.light);
        bodyGradient.addColorStop(0.16, color.color);
        bodyGradient.addColorStop(0.58, color.color);
        bodyGradient.addColorStop(0.82, color.shadow);
        bodyGradient.addColorStop(1, color.deep);
        drawShape(innerLeft, innerTop, innerRight, innerBottom, 4, bodyGradient);

        // Faceted light bands keep the material chunky and late-32-bit rather
        // than looking like a single smooth mobile-game gradient.
        tileCtx.globalAlpha = 0.13;
        tileCtx.fillStyle = '#ffffff';
        tileCtx.fillRect(14, 18, 34, 2);
        tileCtx.fillRect(18, 20, 25, 2);
        tileCtx.fillRect(14, 22, 17, 2);
        tileCtx.globalAlpha = 0.14;
        tileCtx.fillStyle = color.deep;
        tileCtx.fillRect(25, 48, 27, 2);
        tileCtx.fillRect(34, 50, 18, 2);
        tileCtx.globalAlpha = 1;

        tileCtx.fillStyle = color.light;
        if (!hasTop) {
            tileCtx.fillRect(14, 8, 36, 4);
            tileCtx.fillRect(18, 12, 25, 2);
        }
        if (!hasLeft) {
            tileCtx.fillRect(8, 16, 4, 32);
            tileCtx.fillRect(12, 20, 2, 23);
        }
        tileCtx.fillStyle = color.highlight;
        if (!hasTop && !hasLeft) {
            tileCtx.fillRect(14, 12, 12, 6);
            tileCtx.fillRect(16, 10, 8, 2);
            tileCtx.fillRect(12, 17, 4, 14);
        }

        tileCtx.fillStyle = color.shadow;
        if (!hasBottom) {
            tileCtx.fillRect(14, 54, 36, 4);
            tileCtx.fillRect(21, 52, 28, 2);
        }
        if (!hasRight) {
            tileCtx.fillRect(54, 16, 4, 34);
            tileCtx.fillRect(52, 23, 2, 26);
        }
        tileCtx.fillStyle = color.deep;
        if (!hasBottom) tileCtx.fillRect(20, 58, 26, 2);
        if (!hasRight) tileCtx.fillRect(58, 22, 2, 24);

        tileCtx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        tileCtx.fillRect(18, 22, 30, 2);
        tileCtx.fillStyle = 'rgba(0, 0, 0, 0.075)';
        tileCtx.fillRect(18, 46, 30, 2);

        const chipSets = [
            [[38, 20, 6, 4], [42, 24, 4, 2], [19, 39, 2, 2]],
            [[22, 40, 8, 4], [20, 44, 4, 2], [43, 29, 3, 2]],
            [[44, 36, 4, 8], [40, 40, 4, 4], [23, 25, 3, 2]],
            [[28, 28, 7, 3], [32, 31, 4, 5], [45, 42, 3, 2]],
            [[19, 31, 4, 7], [22, 36, 6, 3], [40, 25, 5, 2]],
        ];
        tileCtx.fillStyle = color.shadow;
        for (const [chipX, chipY, chipWidth, chipHeight] of chipSets[variant]) {
            tileCtx.fillRect(chipX, chipY, chipWidth, chipHeight);
        }

        // Deterministic 2 px inclusions add mineral texture while remaining
        // perfectly cacheable and stable between frames.
        for (let index = 0; index < 11; index++) {
            const speckX = 15 + Math.floor(
                this.hashCell(colorIndex + variant * 7, index, 201) * 18
            ) * 2;
            const speckY = 17 + Math.floor(
                this.hashCell(variant + index, colorIndex, 219) * 16
            ) * 2;
            tileCtx.globalAlpha = index % 3 === 0 ? 0.32 : 0.18;
            tileCtx.fillStyle = index % 2 === 0 ? color.highlight : color.deep;
            tileCtx.fillRect(speckX, speckY, index % 4 === 0 ? 3 : 2, 2);
        }
        tileCtx.globalAlpha = 1;

        tileCtx.fillStyle = color.highlight;
        const glintX = 16 + variant * 7;
        tileCtx.fillRect(glintX, 17 + variant * 3, 3, 2);

        this.blockTileCache.set(cacheKey, tile);
        return tile;
    }

    renderFallWarningMarker(x, y, phaseOffset = 0) {
        const ctx = this.ctx;
        const phase = this.reducedMotion ?
            0.35 :
            (
                this.visualTime * 8.5 +
                phaseOffset * 0.17
            ) % 1;
        const pulse = this.reducedMotion ?
            1 :
            Math.floor(this.visualTime * 12 + phaseOffset) % 2;
        const arrowY = this.pixelSnap(y + GRID_SIZE + 5 + phase * 6);
        const centerX = this.pixelSnap(x + GRID_SIZE / 2);

        ctx.save();
        ctx.globalAlpha = pulse ? 0.95 : 0.58;
        ctx.fillStyle = pulse ? '#fff1a6' : '#f0a33a';
        ctx.fillRect(
            this.pixelSnap(x + 12),
            this.pixelSnap(y + GRID_SIZE - 6),
            GRID_SIZE - 24,
            3
        );

        // Downward chevron and small grit are readable even without color.
        ctx.fillRect(centerX - 8, arrowY, 4, 3);
        ctx.fillRect(centerX + 4, arrowY, 4, 3);
        ctx.fillRect(centerX - 4, arrowY + 3, 8, 3);
        ctx.fillStyle = '#d8b780';
        ctx.fillRect(centerX - 18, arrowY - 4, 3, 3);
        ctx.fillRect(centerX + 15, arrowY + 2, 2, 4);
        ctx.restore();
    }

    renderColoredBlock(block) {
        if (block.destroyed) return;

        const fallOffset = block.isFalling ? block.fallProgress * GRID_SIZE : 0;
        const colorValue = block.colorIndex + BLOCK_TYPES.COLORED;
        const screenX = this.pixelSnap(
            block.x * GRID_SIZE +
            block.getShakeOffset(this.reducedMotion)
        );
        const screenY = this.pixelSnap(
            block.y * GRID_SIZE - this.cameraY + fallOffset
        );

        if (screenY < -GRID_SIZE || screenY > CANVAS_HEIGHT + GRID_SIZE) return;

        const hasTop = this.grid[block.y - 1]?.[block.x] === colorValue;
        const hasRight = this.grid[block.y]?.[block.x + 1] === colorValue;
        const hasBottom = this.grid[block.y + 1]?.[block.x] === colorValue;
        const hasLeft = this.grid[block.y]?.[block.x - 1] === colorValue;
        const edgeMask =
            (hasTop ? 1 : 0) |
            (hasRight ? 2 : 0) |
            (hasBottom ? 4 : 0) |
            (hasLeft ? 8 : 0);
        const variant = Math.abs(block.id) % 5;
        const tile = this.getBlockTile(block.colorIndex, edgeMask, variant);

        this.ctx.drawImage(tile, screenX, screenY, GRID_SIZE, GRID_SIZE);

        if (
            block.isShaking &&
            this.grid[block.y + 1]?.[block.x] === BLOCK_TYPES.EMPTY
        ) {
            this.renderFallWarningMarker(screenX, screenY, block.id);
        }

        if (block.isClearing && Math.floor(block.clearTimer * 24) % 2 === 0) {
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.68)';
            this.ctx.fillRect(screenX + 4, screenY + 4, GRID_SIZE - 8, GRID_SIZE - 8);
        }
    }
    
    renderXBlock(x, y, xBlock) {
        const ctx = this.ctx;
        const screenX = this.pixelSnap(x);
        const screenY = this.pixelSnap(y);
        const isFlashing = xBlock && xBlock.hitFlash > 0;

        const pulse = 0.64 + Math.sin(this.visualTime * 4.6 + screenX * 0.02) * 0.16;

        ctx.fillStyle = '#05060c';
        ctx.fillRect(screenX + 4, screenY + 7, 60, 58);
        this.fillSteppedRect(
            screenX + 2,
            screenY + 2,
            60,
            60,
            5,
            isFlashing ? '#4a3d42' : '#292c36'
        );
        ctx.fillStyle = isFlashing ? '#807077' : '#555966';
        ctx.fillRect(screenX + 8, screenY + 8, 48, 4);
        ctx.fillRect(screenX + 8, screenY + 8, 4, 48);
        ctx.fillStyle = isFlashing ? '#b8a8aa' : '#717684';
        ctx.fillRect(screenX + 14, screenY + 12, 34, 2);
        ctx.fillRect(screenX + 12, screenY + 16, 2, 27);
        ctx.fillStyle = '#151720';
        ctx.fillRect(screenX + 52, screenY + 12, 4, 42);
        ctx.fillRect(screenX + 12, screenY + 52, 42, 4);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.055)';
        ctx.fillRect(screenX + 19, screenY + 25, 28, 1);
        ctx.fillRect(screenX + 23, screenY + 39, 24, 1);

        const xColor = isFlashing ? '#fff8eb' : `rgba(237, 73, 104, ${pulse})`;
        const xShadow = isFlashing ? '#ff716f' : 'rgba(101, 27, 55, 0.94)';
        for (let step = 0; step < 6; step++) {
            const offset = 13 + step * 6;
            ctx.fillStyle = xShadow;
            ctx.fillRect(screenX + offset - 2, screenY + offset - 2, 10, 10);
            ctx.fillRect(screenX + 51 - step * 6 - 2, screenY + offset - 2, 10, 10);
            ctx.fillStyle = xColor;
            ctx.fillRect(screenX + offset, screenY + offset, 6, 6);
            ctx.fillRect(screenX + 51 - step * 6, screenY + offset, 6, 6);
        }

        const rivets = [[8, 8], [50, 8], [8, 50], [50, 50]];
        for (const [rivetX, rivetY] of rivets) {
            ctx.fillStyle = '#b5b1a9';
            ctx.fillRect(screenX + rivetX, screenY + rivetY, 5, 5);
            ctx.fillStyle = '#4b4750';
            ctx.fillRect(screenX + rivetX + 3, screenY + rivetY + 3, 2, 2);
        }

        if (xBlock && xBlock.hp < xBlock.maxHp) {
            const damage = xBlock.maxHp - xBlock.hp;
            ctx.fillStyle = '#070811';
            ctx.fillRect(screenX + 10, screenY + 18, 8, 3);
            ctx.fillRect(screenX + 15, screenY + 20, 3, 8);
            if (damage >= 2) {
                ctx.fillRect(screenX + 43, screenY + 10, 3, 12);
                ctx.fillRect(screenX + 38, screenY + 19, 8, 3);
            }
            if (damage >= 3) {
                ctx.fillRect(screenX + 34, screenY + 43, 14, 3);
                ctx.fillRect(screenX + 34, screenY + 38, 3, 8);
            }
            if (damage >= 4) {
                ctx.fillRect(screenX + 18, screenY + 38, 3, 14);
                ctx.fillRect(screenX + 13, screenY + 45, 8, 3);
            }
        }

        if (
            xBlock?.isShaking &&
            this.grid[xBlock.y + 1]?.[xBlock.x] === BLOCK_TYPES.EMPTY
        ) {
            this.renderFallWarningMarker(
                screenX,
                screenY,
                xBlock.x + xBlock.y * GRID_WIDTH
            );
        }
    }
    
    renderBedrock(x, y, isReinforcedRoof = false) {
        const ctx = this.ctx;
        const screenX = this.pixelSnap(x);
        const screenY = this.pixelSnap(y);

        if (isReinforcedRoof) {
            ctx.fillStyle = '#05070c';
            ctx.fillRect(screenX, screenY + 3, GRID_SIZE, GRID_SIZE - 1);
            ctx.fillStyle = '#242b34';
            ctx.fillRect(screenX + 2, screenY + 2, GRID_SIZE - 4, GRID_SIZE - 5);
            ctx.fillStyle = '#65717a';
            ctx.fillRect(screenX + 5, screenY + 5, GRID_SIZE - 10, 5);
            ctx.fillRect(screenX + 5, screenY + 10, 4, GRID_SIZE - 20);
            ctx.fillStyle = '#11161d';
            ctx.fillRect(screenX + 9, screenY + GRID_SIZE - 13, GRID_SIZE - 18, 7);
            ctx.fillRect(screenX + GRID_SIZE - 13, screenY + 10, 7, GRID_SIZE - 23);
            ctx.fillStyle = '#343e48';
            ctx.fillRect(screenX + 13, screenY + 25, GRID_SIZE - 26, 9);
            ctx.fillStyle = '#171d25';
            ctx.fillRect(screenX + 17, screenY + 28, GRID_SIZE - 34, 3);
            ctx.fillStyle = '#89949a';
            ctx.fillRect(screenX + 17, screenY + 25, GRID_SIZE - 40, 2);
            ctx.fillStyle = '#0b1016';
            ctx.fillRect(screenX + 12, screenY + 42, 40, 3);

            const rivets = [[9, 11], [50, 11], [9, 47], [50, 47]];
            for (const [rivetX, rivetY] of rivets) {
                ctx.fillStyle = '#0a0d12';
                ctx.fillRect(screenX + rivetX, screenY + rivetY, 5, 5);
                ctx.fillStyle = '#aeb9bd';
                ctx.fillRect(screenX + rivetX + 1, screenY + rivetY + 1, 2, 2);
            }
            return;
        }

        ctx.fillStyle = '#070710';
        ctx.fillRect(screenX, screenY, GRID_SIZE, GRID_SIZE);
        ctx.fillStyle = '#292437';
        ctx.fillRect(screenX + 2, screenY + 2, GRID_SIZE - 4, GRID_SIZE - 4);
        ctx.fillStyle = '#514561';
        ctx.fillRect(screenX + 4, screenY + 4, GRID_SIZE - 8, 5);
        ctx.fillRect(screenX + 4, screenY + 4, 5, GRID_SIZE - 8);
        ctx.fillStyle = '#171421';
        ctx.fillRect(screenX + 8, screenY + 54, 48, 6);
        ctx.fillRect(screenX + 54, screenY + 8, 6, 48);
        ctx.fillStyle = '#75647f';
        ctx.fillRect(screenX + 14, screenY + 16, 16, 4);
        ctx.fillRect(screenX + 12, screenY + 20, 4, 14);
        ctx.fillStyle = '#40364b';
        ctx.fillRect(screenX + 22, screenY + 29, 27, 3);
        ctx.fillRect(screenX + 27, screenY + 32, 3, 13);
        ctx.fillStyle = '#92819b';
        ctx.fillRect(screenX + 23, screenY + 29, 11, 1);
        ctx.fillStyle = '#110f19';
        ctx.fillRect(screenX + 38, screenY + 24, 4, 22);
        ctx.fillRect(screenX + 32, screenY + 42, 10, 4);
    }

    renderTreasureGlint(x, y, phaseOffset = 0) {
        const phase = Math.floor(this.visualTime * 5 + phaseOffset) % 12;
        if (phase > 2) return;

        const ctx = this.ctx;
        const offset = phase * 2;
        ctx.fillStyle = '#fffbe2';
        ctx.fillRect(x + offset, y, 4, 4);
        ctx.fillRect(x + 1 + offset, y - 4, 2, 12);
        ctx.fillRect(x - 4 + offset, y + 1, 12, 2);
    }
    
    renderTreasure(x, y, type) {
        const ctx = this.ctx;
        const centerX = this.pixelSnap(x);
        const bob = this.pixelSnap(Math.sin(this.visualTime * 4 + x * 0.02) * 2);
        const centerY = this.pixelSnap(y + bob);
        const atlasRegion = TREASURE_ATLAS_REGIONS[type];

        if (ASSETS.gold && atlasRegion) {
            const size = atlasRegion.size;
            const drawX = this.pixelSnap(centerX - size / 2);
            const drawY = this.pixelSnap(centerY - size / 2);
            const shadowY = type === 'coin' ? centerY + 14 : centerY + 22;
            const shadowWidth = type === 'coin' ? 24 : 36;

            ctx.save();
            ctx.fillStyle = 'rgba(2, 3, 8, 0.58)';
            ctx.fillRect(
                centerX - shadowWidth / 2,
                shadowY,
                shadowWidth,
                type === 'coin' ? 3 : 4
            );
            if (type !== 'coin') {
                ctx.fillRect(centerX - 12, centerY + 26, 24, 2);
            }
            ctx.drawImage(
                ASSETS.gold,
                atlasRegion.sx,
                atlasRegion.sy,
                atlasRegion.sw,
                atlasRegion.sh,
                drawX,
                drawY,
                size,
                size
            );
            ctx.restore();

            if (type === 'coin') {
                this.renderTreasureGlint(centerX - 7, centerY - 9, x * 0.01);
            } else if (type === 'bag') {
                this.renderTreasureGlint(centerX - 17, centerY - 15, x * 0.015);
            } else {
                this.renderTreasureGlint(centerX + 12, centerY - 16, x * 0.02);
            }
            return;
        }

        if (type === 'coin') {
            this.fillSteppedRect(centerX - 14, centerY - 18, 28, 36, 6, '#5c3308');
            this.fillSteppedRect(centerX - 10, centerY - 15, 20, 30, 4, '#f0a719');
            ctx.fillStyle = '#ffe678';
            ctx.fillRect(centerX - 6, centerY - 11, 5, 20);
            ctx.fillRect(centerX - 2, centerY - 11, 8, 4);
            ctx.fillStyle = '#b66a0a';
            ctx.fillRect(centerX + 4, centerY - 7, 4, 18);
            ctx.fillRect(centerX - 4, centerY + 9, 10, 3);
            this.renderTreasureGlint(centerX - 12, centerY - 15, x * 0.01);
        } else if (type === 'bag') {
            ctx.fillStyle = '#5b2e0a';
            ctx.fillRect(centerX - 9, centerY - 19, 18, 8);
            ctx.fillRect(centerX - 5, centerY - 23, 10, 5);
            this.fillSteppedRect(centerX - 18, centerY - 12, 36, 32, 6, '#6e3b0b');
            this.fillSteppedRect(centerX - 14, centerY - 9, 28, 26, 5, '#e6a725');
            ctx.fillStyle = '#ffdb5a';
            ctx.fillRect(centerX - 9, centerY - 7, 5, 17);
            ctx.fillStyle = '#9f5d0e';
            ctx.fillRect(centerX + 8, centerY - 5, 4, 17);
            ctx.fillStyle = '#fff1a2';
            ctx.fillRect(centerX - 3, centerY - 2, 6, 8);
            ctx.fillRect(centerX - 5, centerY, 10, 4);
            this.renderTreasureGlint(centerX - 15, centerY - 10, x * 0.015);
        } else if (type === 'chest') {
            ctx.fillStyle = '#36190b';
            ctx.fillRect(centerX - 22, centerY - 12, 44, 31);
            this.fillSteppedRect(centerX - 20, centerY - 19, 40, 19, 5, '#7d3512');
            ctx.fillStyle = '#bc5c1d';
            ctx.fillRect(centerX - 15, centerY - 15, 30, 10);
            ctx.fillStyle = '#4b220c';
            ctx.fillRect(centerX - 20, centerY + 1, 40, 15);
            ctx.fillStyle = '#e1a625';
            ctx.fillRect(centerX - 22, centerY - 3, 44, 6);
            ctx.fillRect(centerX - 4, centerY - 17, 8, 34);
            ctx.fillStyle = '#ffdc5b';
            ctx.fillRect(centerX - 2, centerY + 3, 5, 7);
            this.renderTreasureGlint(centerX + 13, centerY - 17, x * 0.02);
        }
    }
    
    getSpriteSilhouette(sprite, frameIndex, frameWidth = 32) {
        if (!this.spriteSilhouetteCache) {
            this.spriteSilhouetteCache = new WeakMap();
        }

        let frames = this.spriteSilhouetteCache.get(sprite);
        if (!frames) {
            frames = new Map();
            this.spriteSilhouetteCache.set(sprite, frames);
        }
        const cacheKey = `${frameWidth}:${frameIndex}`;
        if (frames.has(cacheKey)) return frames.get(cacheKey);

        const silhouette = document.createElement('canvas');
        silhouette.width = frameWidth;
        silhouette.height = 32;
        const silhouetteCtx = silhouette.getContext('2d');
        silhouetteCtx.imageSmoothingEnabled = false;
        silhouetteCtx.drawImage(
            sprite,
            frameIndex * frameWidth,
            0,
            frameWidth,
            32,
            0,
            0,
            frameWidth,
            32
        );
        silhouetteCtx.globalCompositeOperation = 'source-in';
        silhouetteCtx.fillStyle = '#03050b';
        silhouetteCtx.fillRect(0, 0, frameWidth, 32);
        frames.set(cacheKey, silhouette);
        return silhouette;
    }

    renderDrillSparks(facing) {
        const directions = {
            left: { x: 2, y: 48, nx: -1, ny: 0 },
            right: { x: 62, y: 48, nx: 1, ny: 0 },
            up: { x: 28, y: 2, nx: 0, ny: -1 },
            down: { x: 24, y: 62, nx: 0, ny: 1 },
        };
        const tip = directions[facing] || directions.down;
        const phase = Math.floor(this.visualTime * 30) % 3;
        const tangentX = -tip.ny;
        const tangentY = tip.nx;
        const ctx = this.ctx;

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = '#fff7cb';
        ctx.fillRect(this.pixelSnap(tip.x - 2), this.pixelSnap(tip.y - 2), 4, 4);
        ctx.fillStyle = '#ffb83d';
        ctx.fillRect(
            this.pixelSnap(tip.x + tip.nx * (4 + phase * 2) + tangentX * 3),
            this.pixelSnap(tip.y + tip.ny * (4 + phase * 2) + tangentY * 3),
            phase === 1 ? 4 : 2,
            2
        );
        ctx.fillRect(
            this.pixelSnap(tip.x + tip.nx * (7 - phase) - tangentX * 5),
            this.pixelSnap(tip.y + tip.ny * (7 - phase) - tangentY * 5),
            2,
            phase === 2 ? 4 : 2
        );
        ctx.restore();
    }

    renderManny(x, y, facing, isDrilling) {
        const ctx = this.ctx;
        const p = this.player;
        
        // Determine which sprite to use
        let sprite = null;
        let frameWidth = 32;
        let frameIndex = 0;

        if (!p.isFalling && !p.isSteppingUp) {
            ctx.fillStyle = 'rgba(2, 3, 8, 0.2)';
            ctx.fillRect(x + 9, y + 57, 46, 4);
            ctx.fillStyle = 'rgba(2, 3, 8, 0.48)';
            ctx.fillRect(x + 14, y + 55, 36, 5);
            ctx.fillRect(x + 20, y + 53, 24, 2);
        }
        
        // Bounce effect when drilling down
        let offsetY = 0;
        let scaleX = 1;
        let scaleY = 1;
        
        if (p.landingTimer > 0 && !isDrilling) {
            const squash = Math.min(1, p.landingTimer / 0.11);
            scaleX = 1 + squash * 0.13;
            scaleY = 1 - squash * 0.16;
            offsetY = (1 - scaleY) * GRID_SIZE / 2;
        }

        if (isDrilling && facing === 'down') {
            const progress = p.drillAnimTimer / DIG_ANIM_DURATION;
            if (progress > 0.5) {
                const lift = (progress - 0.5) * 2;
                offsetY = this.pixelSnap(-6 * lift);
                scaleY = Math.round((1 + 0.08 * lift) * 50) / 50;
                scaleX = Math.round((1 - 0.06 * lift) * 50) / 50;
            } else {
                const impact = Math.sin(progress * Math.PI * 2);
                offsetY = this.pixelSnap(2 * impact);
                scaleY = Math.round((1 - 0.11 * impact) * 50) / 50;
                scaleX = Math.round((1 + 0.11 * impact) * 50) / 50;
            }
        }
        
        // Priority: Falling > Drilling > ShowDrill > Walking / Idle
        
        if (p.isFalling) {
            if (
                p.fallDistance >= LONG_FALL_VISUAL_THRESHOLD &&
                ASSETS.mole_falling
            ) {
                // Dedicated animation only after Manny has fallen beyond one cell.
                sprite = ASSETS.mole_falling;
                frameIndex = Math.floor(p.moveAnimFrame) % 4;
            } else {
                // A one-cell drop keeps the normal pose and only gets landing squash.
                if (facing === 'left' && ASSETS.mole_walk_left) {
                    sprite = ASSETS.mole_walk_left;
                    frameIndex = 0;
                } else if (facing === 'right' && ASSETS.mole_walk_right) {
                    sprite = ASSETS.mole_walk_right;
                    frameIndex = 0;
                } else if (ASSETS.mole) {
                    sprite = ASSETS.mole;
                    frameIndex = 0;
                } else if (ASSETS.mole_walk_right) {
                    sprite = ASSETS.mole_walk_right;
                    frameIndex = 0;
                }
            }
            
        } else if (isDrilling) {
            // ACTIVELY DRILLING (dig animation)
            if (facing === 'down' && ASSETS.mole_drilling_down) {
                sprite = ASSETS.mole_drilling_down;
                frameIndex = Math.floor(p.drillAnimFrame) % 3;
            } else if (facing === 'left' && ASSETS.mole_drilling_left) {
                sprite = ASSETS.mole_drilling_left;
                frameIndex = Math.floor(p.drillAnimFrame) % 3;
            } else if (facing === 'right' && ASSETS.mole_drilling_right) {
                sprite = ASSETS.mole_drilling_right;
                frameIndex = Math.floor(p.drillAnimFrame) % 3;
            } else if (facing === 'up' && ASSETS.mole_drilling_up) {
                sprite = ASSETS.mole_drilling_up;
                frameIndex = Math.floor(p.drillAnimFrame) % 3;
            }
            
        } else if (p.showDrill) {
            // FACING A BLOCK - show drill raised (frame 0 only, no animation)
            if (facing === 'down' && ASSETS.mole_drilling_down) {
                sprite = ASSETS.mole_drilling_down;
                frameIndex = 0;
            } else if (facing === 'left' && ASSETS.mole_drilling_left) {
                sprite = ASSETS.mole_drilling_left;
                frameIndex = 0;
            } else if (facing === 'right' && ASSETS.mole_drilling_right) {
                sprite = ASSETS.mole_drilling_right;
                frameIndex = 0;
            } else if (facing === 'up' && ASSETS.mole_drilling_up) {
                sprite = ASSETS.mole_drilling_up;
                frameIndex = 0;
            }
            
        } else {
            // IDLE or WALKING - use walk sprite based on facing direction
            if (facing === 'left' && ASSETS.mole_walk_left) {
                sprite = ASSETS.mole_walk_left;
                frameIndex = p.isMoving ? Math.floor(p.moveAnimFrame) % 4 : 0;
            } else if (facing === 'right' && ASSETS.mole_walk_right) {
                sprite = ASSETS.mole_walk_right;
                frameIndex = p.isMoving ? Math.floor(p.moveAnimFrame) % 4 : 0;
            } else if (facing === 'down' && ASSETS.mole_drilling_down) {
                sprite = ASSETS.mole_drilling_down;
                frameIndex = 0;
            } else if (facing === 'up' && ASSETS.mole_drilling_up) {
                sprite = ASSETS.mole_drilling_up;
                frameIndex = 0;
            } else {
                sprite = ASSETS.mole;
                frameIndex = 0;
            }
        }
        
        if (sprite) {
            const srcX = frameIndex * frameWidth;
            
            ctx.save();
            
            const centerX = x + GRID_SIZE / 2;
            const centerY = y + GRID_SIZE / 2;
            ctx.translate(centerX, centerY + offsetY);
            ctx.scale(scaleX, scaleY);
            ctx.translate(-GRID_SIZE / 2, -GRID_SIZE / 2);

            const silhouette = this.getSpriteSilhouette(
                sprite,
                frameIndex,
                frameWidth
            );
            ctx.globalAlpha = 0.78;
            for (const [outlineX, outlineY] of [
                [-2, 0], [2, 0], [0, -2], [0, 2],
            ]) {
                ctx.drawImage(
                    silhouette,
                    0,
                    0,
                    frameWidth,
                    32,
                    outlineX,
                    outlineY,
                    GRID_SIZE,
                    GRID_SIZE
                );
            }
            ctx.globalAlpha = 1;
            
            ctx.drawImage(
                sprite,
                srcX, 0, frameWidth, 32,
                0, 0, GRID_SIZE, GRID_SIZE
            );

            if (isDrilling && p.drillMadeContact) {
                this.renderDrillSparks(facing);
            }
            
            ctx.restore();
        } else {
            // Fallback
            ctx.fillStyle = '#8B4513';
            ctx.fillRect(x + 4, y + 4, GRID_SIZE - 8, GRID_SIZE - 8);
        }
    }
    
    cycleGamepad() {
        const gamepads = this.gamepad.getGamepadList();
        if (gamepads.length === 0) {
            this.gamepadMessage = 'No gamepads connected';
            this.gamepadMessageTime = Date.now();
            return;
        }
        
        // Find current index
        let currentIdx = this.gamepad.preferredIndex || 0;
        
        // Cycle to next
        currentIdx = (currentIdx + 1) % gamepads.length;
        this.gamepad.setPreferredGamepad(gamepads[currentIdx].index);
        
        const name = gamepads[currentIdx].id.substring(0, 40);
        this.gamepadMessage = `Gamepad ${currentIdx + 1}/${gamepads.length}: ${name}`;
        this.gamepadMessageTime = Date.now();
    }
    
    gameLoop(currentTime) {
        const rawDeltaTime = (currentTime - this.lastTime) / 1000;
        const deltaTime = Math.min(1 / 30, Math.max(0, rawDeltaTime));
        this.lastTime = currentTime;
        
        this.update(deltaTime);

        const canReusePausedFrame =
            this.gameState === 'paused' &&
            this.lastRenderedState === 'paused';
        if (canReusePausedFrame) {
            this.ui.sync(this);
        } else {
            this.render();
        }
        this.lastRenderedState = this.gameState;
        
        requestAnimationFrame(this.boundGameLoop);
    }
}

// Load assets then start game
loadAssets().then(() => {
    console.log('Assets loaded, starting game');
    new Game();
}).catch(err => {
    console.warn('Asset loading failed, starting with fallbacks', err);
    new Game();
});
