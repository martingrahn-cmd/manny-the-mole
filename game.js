// Game constants
const GRID_SIZE = 64; // Double size - scale up 32px sprites
const PLAYER_SIZE = 64;
const GRID_WIDTH = 7; // Like Mr. Driller / Tetris
const GRID_HEIGHT = 50;
const VIEWPORT_HEIGHT = 11;
const FALL_DELAY = 1.0; // Time before falling
const FALL_SPEED = 0.08; // Speed of falling animation
const SHAKE_DURATION = 0.4; // Shake warning before fall
const MATCH_CLEAR_SIZE = 4;
const MATCH_CLEAR_FLASH = 0.18;
const DIG_SCORE = 10;
const MATCH_SCORE = 30;
const MAX_GENERATED_CLUSTER_SIZE = 5;
const COLOR_NEIGHBOR_PREFERENCE = 0.45;

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
    bedrock: null,
    x_block: null,
    oxygen_tube: null,
    gold: null, // Treasure spritesheet by Clint Bellanger (CC-BY 3.0)
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
            ['bedrock', 'assets/bedrock.png'],
            ['x_block', 'assets/x_block.png'],
            ['oxygen_tube', 'assets/oxygen_tube.png'],
            ['gold', 'assets/gold.png'], // Clint Bellanger CC-BY 3.0
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
    { name: 'blue', color: '#4488ff', highlight: '#88bbff', shadow: '#2266cc' },
    { name: 'red', color: '#ff4444', highlight: '#ff8888', shadow: '#cc2222' },
    { name: 'yellow', color: '#ffdd00', highlight: '#ffee66', shadow: '#ccaa00' },
    { name: 'green', color: '#44cc44', highlight: '#88ee88', shadow: '#22aa22' },
    { name: 'pink', color: '#ff66cc', highlight: '#ffaadd', shadow: '#cc4499' },
];

const BLOCK_TYPES = {
    EMPTY: 0,
    COLORED: 1,
    XBLOCK: 10,
    BEDROCK: 11,
    ITEM: 12, // Treasures and oxygen - blocks can't fall through them
};

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
    
    getShakeOffset() {
        if (!this.isShaking) return 0;
        // Shake intensity increases as timer progresses
        const intensity = 2 + (this.shakeTimer / SHAKE_DURATION) * 3;
        return Math.sin(this.shakeTimer * 40) * intensity;
    }
}

// X-Block class
class XBlock {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.hp = 3; // Takes 3 hits to destroy!
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
    
    getShakeOffset() {
        if (!this.isShaking) return 0;
        const intensity = 2 + (this.shakeTimer / SHAKE_DURATION) * 3;
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
        
        const input = {
            left,
            right,
            up,
            down,
            dig: digPressed,
            digJustPressed: digPressed && !this.lastButtons.dig,
            // Direction just pressed (for facing)
            leftJustPressed: left && !this.lastDirections.left,
            rightJustPressed: right && !this.lastDirections.right,
            upJustPressed: up && !this.lastDirections.up,
            downJustPressed: down && !this.lastDirections.down,
        };
        
        // Save state for next frame
        this.lastButtons.dig = digPressed;
        this.lastDirections = { left, right, up, down };
        
        return input;
    }
    
    getCurrentGamepadName() {
        const gp = this.findBestGamepad();
        return gp ? gp.id : 'None';
    }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.gamepad = new GamepadHandler();
        
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
            
            // Movement
            moveTimer: 0,
            moveCooldown: 0.12, // Slower, more deliberate movement
            isMoving: false,
            moveAnimFrame: 0,
            
            // Drilling
            digCooldown: 0,
            isDrilling: false,
            drillAnimFrame: 0,
            drillAnimTimer: 0,
            showDrill: false, // True when facing a block
        };
        
        this.oxygen = 100;
        this.maxOxygen = 100;
        this.score = 0;
        this.depth = 0;
        this.cameraY = 0;
        
        this.oxygenTubes = [];
        this.treasures = []; // Coins, bags, chests
        this.safe = null;
        
        this.keys = {};
        this.keysJustPressed = {};
        this.lastTime = 0;
        
        this.gameState = 'countdown';
        this.countdownTimer = 0;
        this.countdownNumber = 3;
        this.hasPlayerDug = false; // Physics paused until first dig
        this.pendingMatchCheck = false;
        
        this.gamepadMessage = null;
        this.gamepadMessageTime = 0;
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        this.init();
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
        
        SCALE *= 0.95;
        
        CANVAS_WIDTH = GRID_WIDTH * GRID_SIZE;
        CANVAS_HEIGHT = VIEWPORT_HEIGHT * GRID_SIZE;
        
        this.canvas.width = CANVAS_WIDTH;
        this.canvas.height = CANVAS_HEIGHT;
        this.canvas.style.width = (CANVAS_WIDTH * SCALE) + 'px';
        this.canvas.style.height = (CANVAS_HEIGHT * SCALE) + 'px';
    }
    
    init() {
        for (let y = 0; y < GRID_HEIGHT; y++) {
            this.grid[y] = [];
            for (let x = 0; x < GRID_WIDTH; x++) {
                this.grid[y][x] = BLOCK_TYPES.EMPTY;
            }
        }
        
        this.generateLevel();
        
        this.safe = {
            x: Math.floor((GRID_WIDTH - 2) / 2) * GRID_SIZE,
            y: (GRID_HEIGHT - 4) * GRID_SIZE,
            width: GRID_SIZE * 2,
            height: GRID_SIZE * 2
        };
        
        window.addEventListener('keydown', e => {
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
            this.keys[e.key] = false;
        });
        
        requestAnimationFrame(this.gameLoop.bind(this));
    }
    
    generateLevel() {
        const safeStartY = GRID_HEIGHT - 4;
        const safeStartX = Math.floor((GRID_WIDTH - 2) / 2);
        const midX = Math.floor(GRID_WIDTH / 2);
        const airPockets = [];

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
            const allColors = BLOCK_COLORS.map((_, index) => index);
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
                const airChance = distFromMid <= 1 ? 0.05 : 0.10;
                
                if (Math.random() < airChance) {
                    airPockets.push({ x, y });
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

        // Place items ONLY in air pockets
        const shuffledPockets = [...airPockets].sort(() => Math.random() - 0.5);
        
        // Oxygen tubes
        const oxygenCount = Math.min(8, Math.floor(shuffledPockets.length * 0.25));
        for (let i = 0; i < oxygenCount && i < shuffledPockets.length; i++) {
            const pocket = shuffledPockets[i];
            this.oxygenTubes.push({
                x: pocket.x * GRID_SIZE + GRID_SIZE / 2,
                y: pocket.y * GRID_SIZE + GRID_SIZE / 2,
                gridX: pocket.x,
                gridY: pocket.y,
                collected: false,
                fallTimer: 0
            });
            // Mark in grid so blocks don't fall through
            this.grid[pocket.y][pocket.x] = BLOCK_TYPES.ITEM;
        }
        
        // Treasures
        const treasurePockets = shuffledPockets.slice(oxygenCount);
        
        // Helper to add treasure
        const addTreasure = (pocket, type, value) => {
            this.treasures.push({
                x: pocket.x * GRID_SIZE + GRID_SIZE / 2,
                y: pocket.y * GRID_SIZE + GRID_SIZE / 2,
                gridX: pocket.x,
                gridY: pocket.y,
                type,
                value,
                collected: false,
                fallTimer: 0
            });
            // Mark in grid so blocks don't fall through
            this.grid[pocket.y][pocket.x] = BLOCK_TYPES.ITEM;
        };
        
        // Coins
        const coinCount = Math.min(12, Math.floor(treasurePockets.length * 0.4));
        for (let i = 0; i < coinCount && i < treasurePockets.length; i++) {
            addTreasure(treasurePockets[i], 'coin', 50);
        }
        
        // Money bags
        const bagStart = coinCount;
        const bagCount = Math.min(4, Math.floor((treasurePockets.length - bagStart) * 0.3));
        for (let i = 0; i < bagCount && (bagStart + i) < treasurePockets.length; i++) {
            addTreasure(treasurePockets[bagStart + i], 'bag', 200);
        }
        
        // Chests (deep only)
        const deepPockets = treasurePockets.filter(p => p.y > GRID_HEIGHT / 2);
        for (let i = 0; i < 2 && i < deepPockets.length; i++) {
            addTreasure(deepPockets[i], 'chest', 500);
        }

        this.settleInitialBoard();
    }
    
    getInput() {
        // Combine keyboard and gamepad input
        const gp = this.gamepad.getInput();
        
        return {
            left: this.keys['ArrowLeft'] || this.keys['a'] || gp?.left,
            right: this.keys['ArrowRight'] || this.keys['d'] || gp?.right,
            up: this.keys['ArrowUp'] || this.keys['w'] || gp?.up,
            down: this.keys['ArrowDown'] || this.keys['s'] || gp?.down,
            dig: this.keys[' '] || gp?.dig,
            digJustPressed: this.keysJustPressed[' '] || gp?.digJustPressed,
            // Direction just pressed (for facing changes)
            leftJustPressed: this.keysJustPressed['ArrowLeft'] || this.keysJustPressed['a'] || gp?.leftJustPressed,
            rightJustPressed: this.keysJustPressed['ArrowRight'] || this.keysJustPressed['d'] || gp?.rightJustPressed,
            upJustPressed: this.keysJustPressed['ArrowUp'] || this.keysJustPressed['w'] || gp?.upJustPressed,
            downJustPressed: this.keysJustPressed['ArrowDown'] || this.keysJustPressed['s'] || gp?.downJustPressed,
        };
    }
    
    update(deltaTime) {
        if (this.gameState === 'countdown') {
            this.countdownTimer += deltaTime;
            if (this.countdownTimer >= 0.8) {
                this.countdownTimer = 0;
                this.countdownNumber--;
                if (this.countdownNumber <= 0) {
                    this.gameState = 'playing';
                }
            }
            return;
        }
        
        if (this.gameState === 'gameover' || this.gameState === 'won') {
            const input = this.getInput();
            if (this.keysJustPressed[' '] || this.keysJustPressed['Enter'] || input.digJustPressed) {
                this.restart();
            }
            this.keysJustPressed = {};
            return;
        }
        
        this.updatePlayer(deltaTime);
        this.updatePhysics(deltaTime);
        this.updateOxygen(deltaTime);
        this.updateCamera();
        
        this.keysJustPressed = {};
    }
    
    updatePlayer(deltaTime) {
        const input = this.getInput();
        const p = this.player;
        
        const WALK_SPEED = 380; // Pixels per second
        const FALL_THRESHOLD = 0.4; // How centered you need to be to fall (0.5 = perfectly centered)
        
        // Current grid cell (based on center of player)
        const centerX = p.visualX + GRID_SIZE / 2;
        const currentGridX = Math.floor(centerX / GRID_SIZE);
        const currentGridY = Math.floor(p.visualY / GRID_SIZE);
        
        // How far into the current cell (0-1, 0.5 = centered)
        const cellOffsetX = (centerX % GRID_SIZE) / GRID_SIZE;
        const isCentered = cellOffsetX > FALL_THRESHOLD && cellOffsetX < (1 - FALL_THRESHOLD);
        
        // Check block below current position
        const blockBelow = this.grid[currentGridY + 1]?.[currentGridX];
        const isBlockSolid = blockBelow !== undefined && 
                             blockBelow !== BLOCK_TYPES.EMPTY && 
                             blockBelow !== BLOCK_TYPES.ITEM;
        const atBottom = currentGridY >= GRID_HEIGHT - 1;
        
        // Only fall if centered enough over the hole
        const shouldFall = !isBlockSolid && !atBottom && isCentered;
        
        p.isGrounded = !shouldFall;
        p.gridX = currentGridX;
        p.gridY = currentGridY;
        
        // FALLING
        if (shouldFall) {
            // Track how far we've fallen (in pixels for smoother detection)
            if (!p.isFalling) {
                p.fallStartY = p.visualY; // Remember where we started falling (in pixels)
            }
            p.isFalling = true;
            p.isMoving = false;
            p.showDrill = false;
            
            // Snap X to center of cell when starting to fall
            const targetX = currentGridX * GRID_SIZE;
            p.visualX += (targetX - p.visualX) * 0.3; // Smooth snap
            
            // Accelerate falling
            p.fallVelocity += deltaTime * 1500;
            p.fallVelocity = Math.min(p.fallVelocity, 800);
            
            // Move down
            p.visualY += p.fallVelocity * deltaTime;
            
            // Animate
            p.moveAnimFrame = (p.moveAnimFrame + deltaTime * 10) % 4;
            
            // Update grid Y as we fall
            p.gridY = Math.floor(p.visualY / GRID_SIZE);
            
            // Calculate fall distance in grid cells
            p.fallDistance = (p.visualY - p.fallStartY) / GRID_SIZE;
            
            // Check if landed
            const blockAtGridY = this.grid[p.gridY + 1]?.[currentGridX];
            const solidAtGrid = blockAtGridY !== undefined && 
                               blockAtGridY !== BLOCK_TYPES.EMPTY && 
                               blockAtGridY !== BLOCK_TYPES.ITEM;
            
            if (solidAtGrid || p.gridY >= GRID_HEIGHT - 1) {
                p.visualY = p.gridY * GRID_SIZE;
                p.visualX = currentGridX * GRID_SIZE; // Snap X when landing
                p.isFalling = false;
                p.fallVelocity = 0;
                // Don't reset fallDistance here - keep it for one more frame
            }
            return;
        }
        
        // Reset fall distance when grounded
        p.fallDistance = 0;
        
        // GROUNDED
        p.isFalling = false;
        p.fallVelocity = 0;
        p.visualY = currentGridY * GRID_SIZE; // Keep Y snapped to grid
        
        p.moveTimer += deltaTime;
        p.digCooldown -= deltaTime;
        
        // Reset states
        p.showDrill = false;
        
        // Update drill animation
        if (p.isDrilling) {
            p.drillAnimTimer -= deltaTime;
            p.drillAnimFrame = (p.drillAnimFrame + deltaTime * 20) % 3;
            if (p.drillAnimTimer <= 0) {
                p.isDrilling = false;
                p.drillAnimFrame = 0;
            }
            // Snap to grid while drilling
            const targetX = currentGridX * GRID_SIZE;
            p.visualX += (targetX - p.visualX) * 0.3;
            return;
        }
        
        // Check what's in each direction (from current grid cell)
        const blockLeft = this.grid[currentGridY]?.[currentGridX - 1];
        const blockRight = this.grid[currentGridY]?.[currentGridX + 1];
        const blockDown = this.grid[currentGridY + 1]?.[currentGridX];
        const blockUp = this.grid[currentGridY - 1]?.[currentGridX];
        
        const canMoveLeft = currentGridX > 0 && (blockLeft === BLOCK_TYPES.EMPTY || blockLeft === BLOCK_TYPES.ITEM);
        const canMoveRight = currentGridX < GRID_WIDTH - 1 && (blockRight === BLOCK_TYPES.EMPTY || blockRight === BLOCK_TYPES.ITEM);
        const canMoveDown = (blockDown === BLOCK_TYPES.EMPTY || blockDown === BLOCK_TYPES.ITEM);
        
        const hasBlockLeft = currentGridX > 0 && blockLeft !== BLOCK_TYPES.EMPTY && blockLeft !== BLOCK_TYPES.ITEM && blockLeft !== undefined;
        const hasBlockRight = currentGridX < GRID_WIDTH - 1 && blockRight !== BLOCK_TYPES.EMPTY && blockRight !== BLOCK_TYPES.ITEM && blockRight !== undefined;
        const hasBlockDown = blockDown !== BLOCK_TYPES.EMPTY && blockDown !== BLOCK_TYPES.ITEM && blockDown !== undefined;
        const hasBlockUp = currentGridY > 0 && blockUp !== BLOCK_TYPES.EMPTY && blockUp !== BLOCK_TYPES.ITEM && blockUp !== undefined;
        
        // MOVEMENT
        p.isMoving = false;
        
        if (input.left) {
            p.facing = 'left';
            
            // Check if there's a block directly to our left in current cell
            if (hasBlockLeft) {
                // There's a wall to the left
                p.showDrill = true;
                // Snap towards center
                const targetX = currentGridX * GRID_SIZE;
                p.visualX += (targetX - p.visualX) * 0.2;
            } else {
                // No wall, free to move
                p.visualX -= WALK_SPEED * deltaTime;
                p.visualX = Math.max(0, p.visualX);
                p.isMoving = true;
                p.moveAnimFrame = (p.moveAnimFrame + deltaTime * 8) % 4;
            }
        }
        else if (input.right) {
            p.facing = 'right';
            
            // Check if there's a block directly to our right in current cell
            if (hasBlockRight) {
                // There's a wall to the right
                p.showDrill = true;
                // Snap towards center
                const targetX = currentGridX * GRID_SIZE;
                p.visualX += (targetX - p.visualX) * 0.2;
            } else {
                // No wall, free to move
                p.visualX += WALK_SPEED * deltaTime;
                p.visualX = Math.min((GRID_WIDTH - 1) * GRID_SIZE, p.visualX);
                p.isMoving = true;
                p.moveAnimFrame = (p.moveAnimFrame + deltaTime * 8) % 4;
            }
        }
        else if (input.down) {
            p.facing = 'down';
            if (canMoveDown && isCentered) {
                // Drop down
                p.gridY = currentGridY + 1;
                p.fallVelocity = 200;
            } else if (hasBlockDown) {
                p.showDrill = true;
                // Snap to center for drilling
                const targetX = currentGridX * GRID_SIZE;
                p.visualX += (targetX - p.visualX) * 0.2;
            } else if (canMoveDown && !isCentered) {
                // Need to center first
                const targetX = currentGridX * GRID_SIZE;
                p.visualX += (targetX - p.visualX) * 0.15;
            }
        }
        else if (input.up) {
            p.facing = 'up';
            if (hasBlockUp) {
                p.showDrill = true;
                // Snap to center for drilling
                const targetX = currentGridX * GRID_SIZE;
                p.visualX += (targetX - p.visualX) * 0.2;
            }
        }
        
        // DIG ACTION - requires being reasonably centered
        if (input.digJustPressed && p.digCooldown <= 0) {
            // Snap to center for digging
            p.visualX = currentGridX * GRID_SIZE;
            
            let digX = currentGridX;
            let digY = currentGridY;
            
            if (p.facing === 'left' && currentGridX > 0) digX = currentGridX - 1;
            else if (p.facing === 'right' && currentGridX < GRID_WIDTH - 1) digX = currentGridX + 1;
            else if (p.facing === 'down') digY = currentGridY + 1;
            else if (p.facing === 'up' && currentGridY > 0) digY = currentGridY - 1;
            
            if (digY < GRID_HEIGHT && digY >= 0 && digX >= 0 && digX < GRID_WIDTH) {
                const targetBlock = this.grid[digY]?.[digX];
                if (targetBlock !== BLOCK_TYPES.EMPTY && 
                    targetBlock !== BLOCK_TYPES.ITEM && 
                    targetBlock !== BLOCK_TYPES.BEDROCK) {
                    const didDig = this.digBlock(digX, digY);
                    if (didDig) {
                        p.digCooldown = 0.15;
                        p.isDrilling = true;
                        p.drillAnimTimer = 0.2;
                    }
                }
            }
        }
        
        // Win condition
        if (p.visualX < this.safe.x + this.safe.width &&
            p.visualX + PLAYER_SIZE > this.safe.x &&
            p.visualY < this.safe.y + this.safe.height &&
            p.visualY + PLAYER_SIZE > this.safe.y) {
            this.gameState = 'won';
        }
    }
    
    digBlock(x, y) {
        const blockInfo = this.getBlockAt(x, y);
        if (!blockInfo) return false;
        
        // Enable physics on first dig
        this.hasPlayerDug = true;
        
        if (blockInfo.type === 'xblock') {
            // X-blocks take 3 hits to destroy
            const xBlock = blockInfo.xBlock;
            xBlock.hp--;
            xBlock.hitFlash = 0.2; // Flash white briefly
            this.oxygen -= 5; // Small oxygen cost per hit
            
            if (xBlock.hp <= 0) {
                xBlock.destroyed = true;
                this.grid[y][x] = BLOCK_TYPES.EMPTY;
                this.score += 50;
            }
            return true;
        } else if (blockInfo.type === 'bedrock') {
            // Bedrock is truly indestructible
            return false;
        } else if (blockInfo.type === 'color') {
            const block = blockInfo.block;
            const piece = this.findConnectedColorPiece(block);
            
            if (piece.length === 0) {
                return false;
            }
            
            piece.forEach(pieceBlock => {
                pieceBlock.destroyed = true;
                pieceBlock.isClearing = false;
                pieceBlock.matchEligible = false;
                
                if (this.grid[pieceBlock.y]?.[pieceBlock.x] === pieceBlock.colorIndex + BLOCK_TYPES.COLORED) {
                    this.grid[pieceBlock.y][pieceBlock.x] = BLOCK_TYPES.EMPTY;
                }
            });
            
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

    buildColorComponents() {
        const blockMap = this.getColorBlocksMap();
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

    moveColorComponentDown(component) {
        for (const block of component.blocks) {
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
        for (const block of this.colorBlocks) {
            if (block.destroyed) continue;
            
            if (block.isClearing) {
                block.clearTimer += deltaTime;
                if (block.clearTimer >= MATCH_CLEAR_FLASH) {
                    if (this.grid[block.y]?.[block.x] === block.colorIndex + BLOCK_TYPES.COLORED) {
                        this.grid[block.y][block.x] = BLOCK_TYPES.EMPTY;
                    }
                    block.destroyed = true;
                }
                continue;
            }
            
            this.resetColoredBlockMotion(block);
        }
        
        const components = this.buildColorComponents();
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
            
            if (state.isFalling) {
                state.fallProgress += deltaTime / FALL_SPEED;
                
                if (state.fallProgress >= 1) {
                    this.moveColorComponentDown(component);
                    state.fallProgress = 0;
                    
                    if (!this.componentCanFall(component)) {
                        state.isFalling = false;
                        state.isShaking = false;
                        state.fallTimer = 0;
                        state.shakeTimer = 0;
                        component.blocks.forEach(block => {
                            block.matchEligible = true;
                        });
                        this.pendingMatchCheck = true;
                    }
                    
                    const playerGridX = Math.round(this.player.x / GRID_SIZE);
                    const playerGridY = Math.round(this.player.y / GRID_SIZE);
                    if (this.componentOverlapsPlayer(component, playerGridX, playerGridY)) {
                        this.gameState = 'gameover';
                    }
                }
            } else {
                const shouldStartFalling = this.componentCanFall(component);
                
                if (shouldStartFalling) {
                    if (!state.isShaking) {
                        state.isShaking = true;
                        state.shakeTimer = 0;
                    }
                    
                    state.shakeTimer += deltaTime;
                    
                    if (state.shakeTimer >= SHAKE_DURATION) {
                        state.fallTimer += deltaTime;
                        if (state.fallTimer >= FALL_DELAY - SHAKE_DURATION && this.componentCanFall(component)) {
                            state.isFalling = true;
                            state.fallProgress = 0;
                        }
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
            
            if (xBlock.isFalling) {
                xBlock.fallProgress += deltaTime / FALL_SPEED;
                
                if (xBlock.fallProgress >= 1) {
                    this.grid[xBlock.y][xBlock.x] = BLOCK_TYPES.EMPTY;
                    xBlock.fall();
                    if (this.grid[xBlock.y]) {
                        this.grid[xBlock.y][xBlock.x] = BLOCK_TYPES.XBLOCK;
                    }
                    
                    if (!xBlock.canFall(this.grid)) {
                        xBlock.isFalling = false;
                        xBlock.isShaking = false;
                        xBlock.fallTimer = 0;
                        xBlock.shakeTimer = 0;
                    }
                    
                    const playerGridX = Math.round(this.player.x / GRID_SIZE);
                    const playerGridY = Math.round(this.player.y / GRID_SIZE);
                    if (xBlock.x === playerGridX && xBlock.y === playerGridY) {
                        this.gameState = 'gameover';
                    }
                }
            } else {
                let shouldStartFalling = xBlocksCanFall.has(xBlock);
                
                if (shouldStartFalling) {
                    if (!xBlock.isShaking) {
                        xBlock.isShaking = true;
                        xBlock.shakeTimer = 0;
                    }
                    
                    xBlock.shakeTimer += deltaTime;
                    
                    if (xBlock.shakeTimer >= SHAKE_DURATION) {
                        xBlock.fallTimer += deltaTime;
                        if (xBlock.fallTimer >= FALL_DELAY - SHAKE_DURATION && xBlock.canFall(this.grid)) {
                            xBlock.isFalling = true;
                            xBlock.fallProgress = 0;
                        }
                    }
                } else {
                    xBlock.fallTimer = 0;
                    xBlock.isShaking = false;
                    xBlock.shakeTimer = 0;
                }
            }
        }
    }
    
    updateItemsPhysics(items, deltaTime) {
        items.forEach(item => {
            if (item.collected) return;
            
            const itemGridX = Math.floor(item.x / GRID_SIZE);
            const itemGridY = Math.floor(item.y / GRID_SIZE);
            const blockBelow = this.grid[itemGridY + 1]?.[itemGridX];
            
            if (blockBelow === BLOCK_TYPES.EMPTY && itemGridY < GRID_HEIGHT - 2) {
                item.fallTimer = (item.fallTimer || 0) + deltaTime;
                if (item.fallTimer >= 0.08) {
                    if (this.grid[itemGridY]?.[itemGridX] === BLOCK_TYPES.ITEM) {
                        this.grid[itemGridY][itemGridX] = BLOCK_TYPES.EMPTY;
                    }
                    item.y += GRID_SIZE;
                    const newGridY = Math.floor(item.y / GRID_SIZE);
                    if (this.grid[newGridY]) {
                        this.grid[newGridY][itemGridX] = BLOCK_TYPES.ITEM;
                    }
                    item.fallTimer = 0;
                }
            } else {
                item.fallTimer = 0;
            }
        });
    }

    settleInitialBoard() {
        const moveItemsDownOneStep = items => {
            let moved = false;
            
            for (const item of items) {
                if (item.collected) continue;
                
                const itemGridX = Math.floor(item.x / GRID_SIZE);
                const itemGridY = Math.floor(item.y / GRID_SIZE);
                const blockBelow = this.grid[itemGridY + 1]?.[itemGridX];
                
                if (blockBelow === BLOCK_TYPES.EMPTY && itemGridY < GRID_HEIGHT - 2) {
                    if (this.grid[itemGridY]?.[itemGridX] === BLOCK_TYPES.ITEM) {
                        this.grid[itemGridY][itemGridX] = BLOCK_TYPES.EMPTY;
                    }
                    item.y += GRID_SIZE;
                    const newGridY = Math.floor(item.y / GRID_SIZE);
                    if (this.grid[newGridY]) {
                        this.grid[newGridY][itemGridX] = BLOCK_TYPES.ITEM;
                    }
                    moved = true;
                }
            }
            
            return moved;
        };
        
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
            
            movedAny = moveItemsDownOneStep(this.oxygenTubes) || movedAny;
            movedAny = moveItemsDownOneStep(this.treasures) || movedAny;
            
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
            
            cluster.forEach(matchBlock => {
                matchBlock.matchEligible = false;
                matchBlock.isClearing = true;
                matchBlock.clearTimer = 0;
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
        this.updateXBlockPhysics(deltaTime);
        this.updateItemsPhysics(this.oxygenTubes, deltaTime);
        this.updateItemsPhysics(this.treasures, deltaTime);
        
        if (this.pendingMatchCheck && !this.hasActiveColorMotion()) {
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
                if (dist < GRID_SIZE) {
                    tube.collected = true;
                    this.oxygen = Math.min(this.maxOxygen, this.oxygen + 20);
                    this.score += 100;
                    // Clear from grid
                    const gx = Math.floor(tube.x / GRID_SIZE);
                    const gy = Math.floor(tube.y / GRID_SIZE);
                    if (this.grid[gy]?.[gx] === BLOCK_TYPES.ITEM) {
                        this.grid[gy][gx] = BLOCK_TYPES.EMPTY;
                    }
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
                    // Clear from grid
                    const gx = Math.floor(treasure.x / GRID_SIZE);
                    const gy = Math.floor(treasure.y / GRID_SIZE);
                    if (this.grid[gy]?.[gx] === BLOCK_TYPES.ITEM) {
                        this.grid[gy][gx] = BLOCK_TYPES.EMPTY;
                    }
                }
            }
        });
        
        this.oxygen -= deltaTime * 1.2;
        if (this.oxygen <= 0) {
            this.oxygen = 0;
            this.gameState = 'gameover';
        }
    }
    
    updateCamera() {
        const targetCameraY = this.player.visualY - CANVAS_HEIGHT / 2 + GRID_SIZE;
        this.cameraY += (targetCameraY - this.cameraY) * 0.15; // Slightly faster camera follow
        this.cameraY = Math.max(0, Math.min(this.cameraY, GRID_HEIGHT * GRID_SIZE - CANVAS_HEIGHT));
        this.depth = Math.max(0, Math.floor((this.player.visualY / GRID_SIZE) - 2));
    }
    
    restart() {
        this.grid = [];
        this.colorBlocks = [];
        this.xBlocks = [];
        this.nextColorBlockId = 1;
        this.colorComponentStates = new Map();
        
        this.player = {
            gridX: Math.floor(GRID_WIDTH / 2),
            gridY: 2,
            visualX: Math.floor(GRID_WIDTH / 2) * GRID_SIZE,
            visualY: 2 * GRID_SIZE,
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
            
            moveTimer: 0,
            moveCooldown: 0.12,
            isMoving: false,
            moveAnimFrame: 0,
            
            digCooldown: 0,
            isDrilling: false,
            drillAnimFrame: 0,
            drillAnimTimer: 0,
            showDrill: false,
        };
        
        this.oxygen = 100;
        this.score = 0;
        this.depth = 0;
        this.cameraY = 0;
        this.oxygenTubes = [];
        this.treasures = [];
        this.gameState = 'countdown';
        this.countdownTimer = 0;
        this.countdownNumber = 3;
        this.hasPlayerDug = false;
        this.pendingMatchCheck = false;
        
        for (let y = 0; y < GRID_HEIGHT; y++) {
            this.grid[y] = [];
            for (let x = 0; x < GRID_WIDTH; x++) {
                this.grid[y][x] = BLOCK_TYPES.EMPTY;
            }
        }
        
        this.generateLevel();
        
        this.safe = {
            x: Math.floor((GRID_WIDTH - 2) / 2) * GRID_SIZE,
            y: (GRID_HEIGHT - 4) * GRID_SIZE,
            width: GRID_SIZE * 2,
            height: GRID_SIZE * 2
        };
    }
    
    render() {
        // Background
        this.ctx.fillStyle = '#0a0a1a';
        this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        // Render colored blocks
        for (const block of this.colorBlocks) {
            if (block.destroyed) continue;
            this.renderColoredBlock(block);
        }
        
        // Render X-blocks
        for (const xBlock of this.xBlocks) {
            if (xBlock.destroyed) continue;
            
            // Update hit flash
            if (xBlock.hitFlash > 0) {
                xBlock.hitFlash -= 0.016; // Roughly 1 frame at 60fps
            }
            
            const fallOffset = xBlock.isFalling ? xBlock.fallProgress * GRID_SIZE : 0;
            const shakeOffset = xBlock.getShakeOffset();
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
                        this.renderBedrock(x * GRID_SIZE, screenY);
                    }
                }
            }
        }
        
        // Render oxygen tubes
        this.oxygenTubes.forEach(tube => {
            if (!tube.collected) {
                const screenY = tube.y - this.cameraY;
                if (screenY > -GRID_SIZE && screenY < CANVAS_HEIGHT) {
                    if (ASSETS.oxygen_tube) {
                        this.ctx.drawImage(
                            ASSETS.oxygen_tube,
                            tube.x - GRID_SIZE/2, screenY - GRID_SIZE/2,
                            GRID_SIZE, GRID_SIZE
                        );
                    } else {
                        // Fallback
                        this.ctx.fillStyle = '#00c8ff';
                        this.ctx.beginPath();
                        this.ctx.arc(tube.x, screenY, 14, 0, Math.PI * 2);
                        this.ctx.fill();
                    }
                }
            }
        });
        
        // Render treasures
        this.treasures.forEach(treasure => {
            if (!treasure.collected) {
                const screenY = treasure.y - this.cameraY;
                if (screenY > -GRID_SIZE && screenY < CANVAS_HEIGHT) {
                    this.renderTreasure(treasure.x, screenY, treasure.type);
                }
            }
        });
        
        // Render safe
        const safeScreenY = this.safe.y - this.cameraY;
        if (safeScreenY > -this.safe.height && safeScreenY < CANVAS_HEIGHT) {
            this.ctx.fillStyle = '#2a2a2a';
            this.ctx.fillRect(this.safe.x, safeScreenY, this.safe.width, this.safe.height);
            
            this.ctx.strokeStyle = '#ffd700';
            this.ctx.lineWidth = 4;
            this.ctx.strokeRect(this.safe.x + 3, safeScreenY + 3, this.safe.width - 6, this.safe.height - 6);
            
            this.ctx.fillStyle = '#ffd700';
            this.ctx.font = 'bold 28px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('$', this.safe.x + this.safe.width/2, safeScreenY + this.safe.height/2);
        }
        
        // Render player
        const playerScreenY = this.player.visualY - this.cameraY;
        this.renderManny(this.player.visualX, playerScreenY, this.player.facing, this.player.isDrilling);
        
        // Render HUD
        this.renderHUD();
        
        // Render overlays
        if (this.gameState === 'countdown') {
            const text = this.countdownNumber > 0 ? this.countdownNumber.toString() : 'DIG!';
            this.renderOverlay(text, '#ffd700');
        } else if (this.gameState === 'gameover') {
            this.renderGameOver();
        } else if (this.gameState === 'won') {
            this.renderWin();
        }
    }
    
    renderColoredBlock(block) {
        if (block.destroyed) return;
        
        const color = BLOCK_COLORS[block.colorIndex];
        const fallOffset = block.isFalling ? block.fallProgress * GRID_SIZE : 0;
        const shakeOffset = block.getShakeOffset();
        const ctx = this.ctx;
        const outerPadding = 2;
        const radius = 6;
        const colorValue = block.colorIndex + BLOCK_TYPES.COLORED;
        const baseX = block.x * GRID_SIZE + shakeOffset;
        const baseY = block.y * GRID_SIZE - this.cameraY + fallOffset;
        
        if (baseY < -GRID_SIZE || baseY > CANVAS_HEIGHT + GRID_SIZE) return;
        
        const hasTop = this.grid[block.y - 1]?.[block.x] === colorValue;
        const hasBottom = this.grid[block.y + 1]?.[block.x] === colorValue;
        const hasLeft = this.grid[block.y]?.[block.x - 1] === colorValue;
        const hasRight = this.grid[block.y]?.[block.x + 1] === colorValue;
        const topInset = hasTop ? 0 : outerPadding;
        const bottomInset = hasBottom ? 0 : outerPadding;
        const leftInset = hasLeft ? 0 : outerPadding;
        const rightInset = hasRight ? 0 : outerPadding;
        const screenX = baseX + leftInset;
        const screenY = baseY + topInset;
        const width = GRID_SIZE - leftInset - rightInset;
        const height = GRID_SIZE - topInset - bottomInset;
        
        // Determine which corners should be rounded
        const tl = !hasTop && !hasLeft ? radius : 0;
        const tr = !hasTop && !hasRight ? radius : 0;
        const bl = !hasBottom && !hasLeft ? radius : 0;
        const br = !hasBottom && !hasRight ? radius : 0;
        
        // Draw rounded rectangle
        ctx.beginPath();
        ctx.moveTo(screenX + tl, screenY);
        ctx.lineTo(screenX + width - tr, screenY);
        if (tr) ctx.arcTo(screenX + width, screenY, screenX + width, screenY + tr, tr);
        else ctx.lineTo(screenX + width, screenY);
        ctx.lineTo(screenX + width, screenY + height - br);
        if (br) ctx.arcTo(screenX + width, screenY + height, screenX + width - br, screenY + height, br);
        else ctx.lineTo(screenX + width, screenY + height);
        ctx.lineTo(screenX + bl, screenY + height);
        if (bl) ctx.arcTo(screenX, screenY + height, screenX, screenY + height - bl, bl);
        else ctx.lineTo(screenX, screenY + height);
        ctx.lineTo(screenX, screenY + tl);
        if (tl) ctx.arcTo(screenX, screenY, screenX + tl, screenY, tl);
        else ctx.lineTo(screenX, screenY);
        ctx.closePath();
        
        if (block.isClearing && Math.floor(block.clearTimer * 24) % 2 === 0) {
            ctx.fillStyle = '#ffffff';
            ctx.fill();
        } else {
            const gradient = ctx.createLinearGradient(screenX, screenY, screenX, screenY + height);
            gradient.addColorStop(0, color.highlight);
            gradient.addColorStop(0.3, color.color);
            gradient.addColorStop(1, color.shadow);
            ctx.fillStyle = gradient;
            ctx.fill();
        }
        
        if (!hasTop && !hasLeft && !block.isClearing) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.beginPath();
            ctx.ellipse(screenX + 8, screenY + 8, 5, 4, -0.3, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.beginPath();
            ctx.ellipse(screenX + 14, screenY + 12, 3, 2, -0.3, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.strokeStyle = block.isClearing ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        
        // Only draw edges that are on the outside of the same-color cluster
        if (!hasTop) {
            ctx.beginPath();
            ctx.moveTo(screenX, screenY);
            ctx.lineTo(screenX + width, screenY);
            ctx.stroke();
        }
        if (!hasBottom) {
            ctx.beginPath();
            ctx.moveTo(screenX, screenY + height);
            ctx.lineTo(screenX + width, screenY + height);
            ctx.stroke();
        }
        if (!hasLeft) {
            ctx.beginPath();
            ctx.moveTo(screenX, screenY);
            ctx.lineTo(screenX, screenY + height);
            ctx.stroke();
        }
        if (!hasRight) {
            ctx.beginPath();
            ctx.moveTo(screenX + width, screenY);
            ctx.lineTo(screenX + width, screenY + height);
            ctx.stroke();
        }
    }
    
    renderXBlock(x, y, xBlock) {
        // Hit flash effect
        if (xBlock && xBlock.hitFlash > 0) {
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillRect(x, y, GRID_SIZE, GRID_SIZE);
            return;
        }
        
        // Use sprite if available
        if (ASSETS.x_block) {
            this.ctx.drawImage(ASSETS.x_block, x, y, GRID_SIZE, GRID_SIZE);
        } else {
            // Fallback
            this.ctx.fillStyle = '#cc4466';
            this.ctx.fillRect(x, y, GRID_SIZE, GRID_SIZE);
        }
        
        // Show HP as dots
        if (xBlock && xBlock.hp < 3) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            // Show cracks based on damage
            if (xBlock.hp <= 2) {
                this.ctx.fillRect(x + 5, y + 5, 8, 2);
                this.ctx.fillRect(x + 8, y + 5, 2, 8);
            }
            if (xBlock.hp <= 1) {
                this.ctx.fillRect(x + 18, y + 18, 10, 2);
                this.ctx.fillRect(x + 22, y + 14, 2, 10);
            }
        }
    }
    
    renderBedrock(x, y) {
        if (ASSETS.bedrock) {
            this.ctx.drawImage(ASSETS.bedrock, x, y, GRID_SIZE, GRID_SIZE);
        } else {
            // Fallback
            this.ctx.fillStyle = '#2a2a2a';
            this.ctx.fillRect(x, y, GRID_SIZE, GRID_SIZE);
        }
    }
    
    renderTreasure(x, y, type) {
        const ctx = this.ctx;
        
        // Use gold spritesheet by Clint Bellanger (CC-BY 3.0)
        // Layout 4x4 grid, 32x32 each:
        // Row 0: [palette takes 2 tiles], empty, empty
        // Row 1: coin-stack, coin-pile, chalice, gold bars
        // Row 2: chest-closed, chest-open?, crown, sword-pile
        // Row 3: more items...
        
        if (ASSETS.gold) {
            let srcX = 0, srcY = 32; // Default: first item on row 1
            
            if (type === 'coin') {
                srcX = 0; srcY = 32; // Coin stack (row 1, col 0)
            } else if (type === 'bag') {
                srcX = 32; srcY = 32; // Coin pile (row 1, col 1)
            } else if (type === 'chest') {
                srcX = 0; srcY = 64; // Treasure chest (row 2, col 0)
            }
            
            ctx.drawImage(
                ASSETS.gold,
                srcX, srcY, 32, 32,
                x - GRID_SIZE/2, y - GRID_SIZE/2, GRID_SIZE, GRID_SIZE
            );
        } else {
            // Fallback procedural rendering
            const scale = GRID_SIZE / 32;
            
            if (type === 'coin') {
                ctx.fillStyle = '#ffd700';
                ctx.beginPath();
                ctx.arc(x, y, 10 * scale, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#b8860b';
                ctx.lineWidth = 2 * scale;
                ctx.stroke();
            } else if (type === 'bag') {
                ctx.fillStyle = '#ffd700';
                ctx.beginPath();
                ctx.arc(x, y, 12 * scale, 0, Math.PI * 2);
                ctx.fill();
            } else if (type === 'chest') {
                ctx.fillStyle = '#8b4513';
                ctx.fillRect(x - 14*scale, y - 10*scale, 28*scale, 20*scale);
                ctx.fillStyle = '#ffd700';
                ctx.fillRect(x - 3*scale, y - 10*scale, 6*scale, 20*scale);
            }
        }
    }
    
    renderManny(x, y, facing, isDrilling) {
        const ctx = this.ctx;
        const p = this.player;
        
        // Determine which sprite to use
        let sprite = null;
        let frameWidth = 32;
        let frameIndex = 0;
        
        // Bounce effect when drilling down
        let offsetY = 0;
        let scaleX = 1;
        let scaleY = 1;
        
        if (isDrilling && facing === 'down') {
            const progress = p.drillAnimTimer / 0.2;
            if (progress > 0.5) {
                offsetY = -8 * (progress - 0.5) * 2;
                scaleY = 1.1;
                scaleX = 0.9;
            } else {
                offsetY = 2 * (1 - progress * 2);
                scaleY = 0.85;
                scaleX = 1.15;
            }
        }
        
        // Priority: Falling > Drilling > ShowDrill > Walking / Idle
        
        if (p.isFalling) {
            if (p.fallDistance >= 1.5 && ASSETS.mole_falling) {
                // LONG FALL (1.5+ cells) - use falling sprite with animation
                sprite = ASSETS.mole_falling;
                frameIndex = Math.floor(p.moveAnimFrame) % 4;
            } else {
                // SHORT FALL - use falling sprite but frame 0 (still)
                if (ASSETS.mole_falling) {
                    sprite = ASSETS.mole_falling;
                    frameIndex = 0;
                } else if (facing === 'left' && ASSETS.mole_walk_left) {
                    sprite = ASSETS.mole_walk_left;
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
            
            ctx.drawImage(
                sprite,
                srcX, 0, frameWidth, 32,
                0, 0, GRID_SIZE, GRID_SIZE
            );
            
            ctx.restore();
        } else {
            // Fallback
            ctx.fillStyle = '#8B4513';
            ctx.fillRect(x + 4, y + 4, GRID_SIZE - 8, GRID_SIZE - 8);
        }
    }
    
    renderHUD() {
        const padding = 12;
        const barWidth = 120;
        const barHeight = 18;
        
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        this.ctx.fillRect(0, 0, CANVAS_WIDTH, 55);
        
        // Depth
        this.ctx.fillStyle = '#888';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('DEPTH', padding, 14);
        this.ctx.fillStyle = '#00c8ff';
        this.ctx.font = 'bold 20px Arial';
        this.ctx.fillText(this.depth + 'm', padding, 38);
        
        // Score
        this.ctx.fillStyle = '#888';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('SCORE', CANVAS_WIDTH / 2, 14);
        this.ctx.fillStyle = '#ffd700';
        this.ctx.font = 'bold 20px Arial';
        this.ctx.fillText(this.score.toString(), CANVAS_WIDTH / 2, 38);
        
        // Oxygen
        const oxygenX = CANVAS_WIDTH - barWidth - padding;
        
        this.ctx.fillStyle = '#888';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'right';
        this.ctx.fillText('AIR', CANVAS_WIDTH - padding, 14);
        
        this.ctx.fillStyle = '#222';
        this.ctx.fillRect(oxygenX, 28, barWidth, barHeight);
        
        const oxygenPercent = Math.max(0, this.oxygen / this.maxOxygen);
        let barColor = oxygenPercent > 0.5 ? '#00c8ff' : oxygenPercent > 0.25 ? '#ffaa00' : '#ff3333';
        
        this.ctx.fillStyle = barColor;
        this.ctx.fillRect(oxygenX, 28, barWidth * oxygenPercent, barHeight);
        
        this.ctx.strokeStyle = '#555';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(oxygenX, 28, barWidth, barHeight);
        
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(Math.floor(this.oxygen) + '%', oxygenX + barWidth/2, 37);
        
        // Show gamepad info if connected (small text at bottom)
        if (this.gamepadMessage) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(0, CANVAS_HEIGHT - 25, CANVAS_WIDTH, 25);
            this.ctx.fillStyle = '#0f0';
            this.ctx.font = '11px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(this.gamepadMessage, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 10);
            
            // Clear message after 3 seconds
            if (Date.now() - this.gamepadMessageTime > 3000) {
                this.gamepadMessage = null;
            }
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
    
    renderOverlay(text, color) {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, CANVAS_HEIGHT / 2 - 50, CANVAS_WIDTH, 100);
        
        this.ctx.fillStyle = color;
        this.ctx.font = 'bold 56px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    }
    
    renderGameOver() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        this.ctx.fillStyle = '#ff4444';
        this.ctx.font = 'bold 36px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 60);
        
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '22px Arial';
        this.ctx.fillText(`Score: ${this.score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        this.ctx.fillText(`Depth: ${this.depth}m`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 35);
        
        this.ctx.fillStyle = '#00c8ff';
        this.ctx.font = '16px Arial';
        this.ctx.fillText('Press SPACE to retry', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 90);
    }
    
    renderWin() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        this.ctx.fillStyle = '#ffd700';
        this.ctx.font = 'bold 32px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('HEIST COMPLETE!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 60);
        
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '22px Arial';
        this.ctx.fillText(`Score: ${this.score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        this.ctx.fillText(`Air: ${Math.floor(this.oxygen)}%`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 35);
        
        this.ctx.fillStyle = '#00c8ff';
        this.ctx.font = '16px Arial';
        this.ctx.fillText('Press SPACE to continue', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 90);
    }
    
    gameLoop(currentTime) {
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;
        
        if (deltaTime < 0.1) {
            this.update(deltaTime);
            this.render();
        }
        
        requestAnimationFrame(this.gameLoop.bind(this));
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
