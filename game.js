// Game constants
const GRID_SIZE = 64; // Double size - scale up 32px sprites
const PLAYER_SIZE = 64;
const GRID_WIDTH = 7; // Like Mr. Driller / Tetris
const GRID_HEIGHT = 50;
const VIEWPORT_HEIGHT = 11;
const FALL_DELAY = 1.2;
const FALL_SPEED = 0.1;
const SHAKE_DURATION = 0.5;

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

// Block Group class
class BlockGroup {
    constructor(id, colorIndex) {
        this.id = id;
        this.colorIndex = colorIndex;
        this.cells = [];
        this.fallTimer = 0;
        this.isFalling = false;
        this.fallProgress = 0;
        this.isShaking = false;
        this.shakeTimer = 0;
    }
    
    addCell(x, y) {
        this.cells.push({ x, y });
    }
    
    hasCell(x, y) {
        return this.cells.some(cell => cell.x === x && cell.y === y);
    }
    
    destroy() {
        this.cells = [];
    }
    
    canFall(grid) {
        if (this.cells.length === 0) return false;
        
        for (const cell of this.cells) {
            const belowY = cell.y + 1;
            if (belowY >= GRID_HEIGHT) return false;
            
            const blockBelow = grid[belowY]?.[cell.x];
            if (blockBelow !== BLOCK_TYPES.EMPTY) {
                const isOwnCell = this.cells.some(c => c.x === cell.x && c.y === belowY);
                if (!isOwnCell) return false;
            }
        }
        return true;
    }
    
    fall() {
        this.cells.forEach(cell => cell.y++);
        this.fallProgress = 0;
    }
    
    overlapsWithPlayer(playerGridX, playerGridY) {
        return this.cells.some(cell => cell.x === playerGridX && cell.y === playerGridY);
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
        this.blockGroups = [];
        this.xBlocks = [];
        this.groupIdCounter = 0;
        
        this.player = {
            x: Math.floor(GRID_WIDTH / 2) * GRID_SIZE,
            y: 2 * GRID_SIZE,
            facing: 'down',
            isGrounded: false,
            moveTimer: 0,
            moveCooldown: 0.08,
            fallTimer: 0,
            fallSpeed: 0.04,
            digCooldown: 0,
            isDrilling: false,
            drillAnimFrame: 0,
            drillAnimTimer: 0,
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
        
        // Track which cells are filled
        const filled = new Set();
        const airPockets = [];
        
        // Mark safe area
        for (let sy = safeStartY; sy < safeStartY + 2; sy++) {
            for (let sx = safeStartX; sx < safeStartX + 2; sx++) {
                filled.add(`${sx},${sy}`);
            }
        }
        
        // Define shapes - Mr. Driller style (mostly 2x2 and small)
        const SHAPES = [
            // 2x2 square (most common - classic Mr. Driller)
            { cells: [[0,0], [1,0], [0,1], [1,1]], weight: 50 },
            // Single blocks (creates variety)
            { cells: [[0,0]], weight: 20 },
            // Horizontal 2-bar
            { cells: [[0,0], [1,0]], weight: 15 },
            // Vertical 2-bar
            { cells: [[0,0], [0,1]], weight: 10 },
            // Horizontal 3-bar (occasional)
            { cells: [[0,0], [1,0], [2,0]], weight: 5 },
        ];
        
        // Calculate total weight
        const totalWeight = SHAPES.reduce((sum, s) => sum + s.weight, 0);
        
        // Pick random shape by weight
        const pickShape = () => {
            let r = Math.random() * totalWeight;
            for (const shape of SHAPES) {
                r -= shape.weight;
                if (r <= 0) return shape.cells;
            }
            return SHAPES[0].cells;
        };
        
        // Check if shape fits
        const shapeFits = (shape, startX, startY) => {
            for (const [dx, dy] of shape) {
                const x = startX + dx;
                const y = startY + dy;
                if (x < 0 || x >= GRID_WIDTH) return false;
                if (y < 4 || y >= GRID_HEIGHT - 3) return false;
                if (filled.has(`${x},${y}`)) return false;
            }
            return true;
        };
        
        // Generate blocks row by row
        for (let y = 4; y < GRID_HEIGHT - 3; y++) {
            for (let x = 0; x < GRID_WIDTH; x++) {
                if (filled.has(`${x},${y}`)) continue;
                
                // Air pocket chance
                const distFromMid = Math.abs(x - midX);
                const airChance = distFromMid <= 1 ? 0.05 : 0.10;
                
                if (Math.random() < airChance) {
                    airPockets.push({ x, y });
                    this.grid[y][x] = BLOCK_TYPES.EMPTY;
                    filled.add(`${x},${y}`);
                    continue;
                }
                
                // X-block chance (increases with depth)
                const depthFactor = y / GRID_HEIGHT;
                const xBlockChance = 0.06 + depthFactor * 0.10;
                
                if (Math.random() < xBlockChance) {
                    const xBlock = new XBlock(x, y);
                    this.xBlocks.push(xBlock);
                    this.grid[y][x] = BLOCK_TYPES.XBLOCK;
                    filled.add(`${x},${y}`);
                    continue;
                }
                
                // Try to place a shape
                let placed = false;
                
                // Try a few random shapes
                for (let attempt = 0; attempt < 5; attempt++) {
                    const shape = pickShape();
                    
                    if (shapeFits(shape, x, y)) {
                        const colorIndex = Math.floor(Math.random() * BLOCK_COLORS.length);
                        const group = new BlockGroup(this.groupIdCounter++, colorIndex);
                        
                        for (const [dx, dy] of shape) {
                            const cellX = x + dx;
                            const cellY = y + dy;
                            group.addCell(cellX, cellY);
                            this.grid[cellY][cellX] = colorIndex + 1;
                            filled.add(`${cellX},${cellY}`);
                        }
                        
                        this.blockGroups.push(group);
                        placed = true;
                        break;
                    }
                }
                
                // Fallback: single block
                if (!placed && !filled.has(`${x},${y}`)) {
                    const colorIndex = Math.floor(Math.random() * BLOCK_COLORS.length);
                    const group = new BlockGroup(this.groupIdCounter++, colorIndex);
                    group.addCell(x, y);
                    this.grid[y][x] = colorIndex + 1;
                    this.blockGroups.push(group);
                    filled.add(`${x},${y}`);
                }
            }
        }
        
        // Clean up empty groups
        this.blockGroups = this.blockGroups.filter(g => g.cells.length > 0);
        
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
        
        const gridX = Math.round(this.player.x / GRID_SIZE);
        const gridY = Math.round(this.player.y / GRID_SIZE);
        
        this.player.x = gridX * GRID_SIZE;
        this.player.y = gridY * GRID_SIZE;
        
        // Check if grounded - player falls through ITEM cells
        const blockBelow = this.grid[gridY + 1]?.[gridX];
        const isBlockSolid = blockBelow !== undefined && 
                             blockBelow !== BLOCK_TYPES.EMPTY && 
                             blockBelow !== BLOCK_TYPES.ITEM;
        this.player.isGrounded = isBlockSolid || gridY >= GRID_HEIGHT - 1;
        
        // Gravity
        if (!this.player.isGrounded) {
            this.player.fallTimer += deltaTime;
            if (this.player.fallTimer >= this.player.fallSpeed) {
                this.player.fallTimer = 0;
                this.player.y += GRID_SIZE;
                // Don't change facing when falling
            }
            return;
        }
        
        this.player.fallTimer = 0;
        this.player.moveTimer += deltaTime;
        this.player.digCooldown -= deltaTime;
        
        // Determine facing direction - change when direction key/stick is NEWLY pressed
        // Only change facing, don't revert when released
        if (input.leftJustPressed) {
            this.player.facing = 'left';
        } else if (input.rightJustPressed) {
            this.player.facing = 'right';
        } else if (input.downJustPressed) {
            this.player.facing = 'down';
        } else if (input.upJustPressed) {
            this.player.facing = 'up';
        }
        
        // DIG ACTION - dig in facing direction, don't move
        if (input.digJustPressed && this.player.digCooldown <= 0) {
            let digX = gridX;
            let digY = gridY;
            
            if (this.player.facing === 'left' && gridX > 0) {
                digX = gridX - 1;
            } else if (this.player.facing === 'right' && gridX < GRID_WIDTH - 1) {
                digX = gridX + 1;
            } else if (this.player.facing === 'down') {
                digY = gridY + 1;
            } else if (this.player.facing === 'up' && gridY > 0) {
                digY = gridY - 1;
            }
            
            // Try to dig
            if (digY < GRID_HEIGHT && digY >= 0 && digX >= 0 && digX < GRID_WIDTH) {
                const targetBlock = this.grid[digY]?.[digX];
                if (targetBlock !== BLOCK_TYPES.EMPTY && targetBlock !== BLOCK_TYPES.BEDROCK) {
                    const didDig = this.digBlock(digX, digY);
                    if (didDig) {
                        this.player.digCooldown = 0.2;
                        this.player.isDrilling = true;
                        this.player.drillAnimTimer = 0.25;
                        // Don't move after digging - stay in place
                        this.player.moveTimer = 0;
                    }
                }
            }
        }
        
        // Update drill animation
        if (this.player.isDrilling) {
            this.player.drillAnimTimer -= 0.016;
            this.player.drillAnimFrame = (this.player.drillAnimFrame + 0.3) % 3;
            if (this.player.drillAnimTimer <= 0) {
                this.player.isDrilling = false;
                this.player.drillAnimFrame = 0;
            }
            // Don't allow movement while drilling
            return;
        }
        
        // MOVEMENT - only when NOT drilling
        if (this.player.moveTimer >= this.player.moveCooldown) {
            let dx = 0;
            
            if (input.left) dx = -1;
            else if (input.right) dx = 1;
            
            if (dx !== 0) {
                const newGridX = gridX + dx;
                
                if (newGridX >= 0 && newGridX < GRID_WIDTH) {
                    const targetBlock = this.grid[gridY]?.[newGridX];
                    
                    // Can move through EMPTY and ITEM cells
                    if (targetBlock === BLOCK_TYPES.EMPTY || targetBlock === BLOCK_TYPES.ITEM) {
                        this.player.x = newGridX * GRID_SIZE;
                        this.player.moveTimer = 0;
                        // Don't change facing here - only on key press
                    }
                }
            }
            
            // Move down if pressing down and block below is empty or item
            if (input.down) {
                const belowBlock = this.grid[gridY + 1]?.[gridX];
                if (belowBlock === BLOCK_TYPES.EMPTY || belowBlock === BLOCK_TYPES.ITEM) {
                    this.player.y += GRID_SIZE;
                    this.player.moveTimer = 0;
                    // Don't change facing here - only on key press
                }
            }
        }
        
        // Win condition
        if (this.player.x < this.safe.x + this.safe.width &&
            this.player.x + PLAYER_SIZE > this.safe.x &&
            this.player.y < this.safe.y + this.safe.height &&
            this.player.y + PLAYER_SIZE > this.safe.y) {
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
        } else if (blockInfo.type === 'group') {
            const group = blockInfo.group;
            const cellCount = group.cells.length;
            
            group.cells.forEach(cell => {
                this.grid[cell.y][cell.x] = BLOCK_TYPES.EMPTY;
            });
            
            this.score += cellCount * 20;
            group.destroy();
            return true;
        }
        return false;
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
        
        for (const group of this.blockGroups) {
            if (group.hasCell(x, y)) {
                return { type: 'group', group };
            }
        }
        
        return null;
    }
    
    updatePhysics(deltaTime) {
        // Don't run physics until player has dug something
        if (!this.hasPlayerDug) return;
        
        // Sort block groups by lowest cell (bottom-up processing)
        const sortedGroups = [...this.blockGroups].sort((a, b) => {
            const aMaxY = Math.max(...a.cells.map(c => c.y));
            const bMaxY = Math.max(...b.cells.map(c => c.y));
            return bMaxY - aMaxY; // Higher Y (lower on screen) first
        });
        
        // Update block groups
        for (const group of sortedGroups) {
            if (group.cells.length === 0) continue;
            
            if (group.isFalling) {
                group.fallProgress += deltaTime / FALL_SPEED;
                
                if (group.fallProgress >= 1) {
                    group.cells.forEach(cell => {
                        if (this.grid[cell.y]?.[cell.x] === group.colorIndex + 1) {
                            this.grid[cell.y][cell.x] = BLOCK_TYPES.EMPTY;
                        }
                    });
                    
                    group.fall();
                    
                    group.cells.forEach(cell => {
                        if (this.grid[cell.y]) {
                            this.grid[cell.y][cell.x] = group.colorIndex + 1;
                        }
                    });
                    
                    if (!group.canFall(this.grid)) {
                        group.isFalling = false;
                        group.isShaking = false;
                        group.fallTimer = 0;
                        group.shakeTimer = 0;
                    }
                    
                    const playerGridX = Math.round(this.player.x / GRID_SIZE);
                    const playerGridY = Math.round(this.player.y / GRID_SIZE);
                    if (group.overlapsWithPlayer(playerGridX, playerGridY)) {
                        this.gameState = 'gameover';
                    }
                }
            } else {
                if (group.canFall(this.grid)) {
                    if (!group.isShaking) {
                        group.isShaking = true;
                        group.shakeTimer = 0;
                    }
                    
                    group.shakeTimer += deltaTime;
                    
                    if (group.shakeTimer >= SHAKE_DURATION) {
                        group.fallTimer += deltaTime;
                        if (group.fallTimer >= FALL_DELAY - SHAKE_DURATION) {
                            group.isFalling = true;
                            group.fallProgress = 0;
                        }
                    }
                } else {
                    group.fallTimer = 0;
                    group.isShaking = false;
                    group.shakeTimer = 0;
                }
            }
        }
        
        // Update X-blocks
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
                if (xBlock.canFall(this.grid)) {
                    if (!xBlock.isShaking) {
                        xBlock.isShaking = true;
                        xBlock.shakeTimer = 0;
                    }
                    
                    xBlock.shakeTimer += deltaTime;
                    
                    if (xBlock.shakeTimer >= SHAKE_DURATION) {
                        xBlock.fallTimer += deltaTime;
                        if (xBlock.fallTimer >= FALL_DELAY - SHAKE_DURATION) {
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
        
        // Oxygen tubes fall
        this.oxygenTubes.forEach(tube => {
            if (tube.collected) return;
            
            const tubeGridX = Math.floor(tube.x / GRID_SIZE);
            const tubeGridY = Math.floor(tube.y / GRID_SIZE);
            
            const blockBelow = this.grid[tubeGridY + 1]?.[tubeGridX];
            if (blockBelow === BLOCK_TYPES.EMPTY && tubeGridY < GRID_HEIGHT - 2) {
                tube.fallTimer = (tube.fallTimer || 0) + deltaTime;
                if (tube.fallTimer >= 0.08) {
                    // Clear old position
                    if (this.grid[tubeGridY]?.[tubeGridX] === BLOCK_TYPES.ITEM) {
                        this.grid[tubeGridY][tubeGridX] = BLOCK_TYPES.EMPTY;
                    }
                    tube.y += GRID_SIZE;
                    // Set new position
                    const newGridY = Math.floor(tube.y / GRID_SIZE);
                    if (this.grid[newGridY]) {
                        this.grid[newGridY][tubeGridX] = BLOCK_TYPES.ITEM;
                    }
                    tube.fallTimer = 0;
                }
            } else {
                tube.fallTimer = 0;
            }
        });
        
        // Treasures fall
        this.treasures.forEach(treasure => {
            if (treasure.collected) return;
            
            const treasureGridX = Math.floor(treasure.x / GRID_SIZE);
            const treasureGridY = Math.floor(treasure.y / GRID_SIZE);
            
            const blockBelow = this.grid[treasureGridY + 1]?.[treasureGridX];
            if (blockBelow === BLOCK_TYPES.EMPTY && treasureGridY < GRID_HEIGHT - 2) {
                treasure.fallTimer = (treasure.fallTimer || 0) + deltaTime;
                if (treasure.fallTimer >= 0.08) {
                    // Clear old position
                    if (this.grid[treasureGridY]?.[treasureGridX] === BLOCK_TYPES.ITEM) {
                        this.grid[treasureGridY][treasureGridX] = BLOCK_TYPES.EMPTY;
                    }
                    treasure.y += GRID_SIZE;
                    // Set new position
                    const newGridY = Math.floor(treasure.y / GRID_SIZE);
                    if (this.grid[newGridY]) {
                        this.grid[newGridY][treasureGridX] = BLOCK_TYPES.ITEM;
                    }
                    treasure.fallTimer = 0;
                }
            } else {
                treasure.fallTimer = 0;
            }
        });
        
        // Cleanup
        this.blockGroups = this.blockGroups.filter(g => g.cells.length > 0);
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
        const targetCameraY = this.player.y - CANVAS_HEIGHT / 2 + GRID_SIZE;
        this.cameraY += (targetCameraY - this.cameraY) * 0.1;
        this.cameraY = Math.max(0, Math.min(this.cameraY, GRID_HEIGHT * GRID_SIZE - CANVAS_HEIGHT));
        this.depth = Math.max(0, Math.floor((this.player.y / GRID_SIZE) - 2));
    }
    
    restart() {
        this.grid = [];
        this.blockGroups = [];
        this.xBlocks = [];
        this.groupIdCounter = 0;
        
        this.player = {
            x: Math.floor(GRID_WIDTH / 2) * GRID_SIZE,
            y: 2 * GRID_SIZE,
            facing: 'down',
            isGrounded: false,
            moveTimer: 0,
            moveCooldown: 0.08,
            fallTimer: 0,
            fallSpeed: 0.04,
            digCooldown: 0,
            isDrilling: false,
            drillAnimFrame: 0,
            drillAnimTimer: 0,
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
        
        // Render block groups
        for (const group of this.blockGroups) {
            if (group.cells.length === 0) continue;
            this.renderBlockGroup(group);
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
        const playerScreenY = this.player.y - this.cameraY;
        this.renderManny(this.player.x, playerScreenY, this.player.facing, this.player.isDrilling);
        
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
    
    renderBlockGroup(group) {
        if (group.cells.length === 0) return;
        
        const color = BLOCK_COLORS[group.colorIndex];
        const fallOffset = group.isFalling ? group.fallProgress * GRID_SIZE : 0;
        const shakeOffset = group.getShakeOffset();
        
        const cellSet = new Set(group.cells.map(c => `${c.x},${c.y}`));
        const ctx = this.ctx;
        const padding = 2; // Small gap between cells for Mr. Driller look
        const radius = 6; // Corner radius
        
        for (const cell of group.cells) {
            const screenX = cell.x * GRID_SIZE + shakeOffset + padding;
            const screenY = cell.y * GRID_SIZE - this.cameraY + fallOffset + padding;
            const size = GRID_SIZE - padding * 2;
            
            if (screenY < -GRID_SIZE || screenY > CANVAS_HEIGHT + GRID_SIZE) continue;
            
            const hasTop = cellSet.has(`${cell.x},${cell.y - 1}`);
            const hasBottom = cellSet.has(`${cell.x},${cell.y + 1}`);
            const hasLeft = cellSet.has(`${cell.x - 1},${cell.y}`);
            const hasRight = cellSet.has(`${cell.x + 1},${cell.y}`);
            
            // Determine which corners should be rounded
            const tl = !hasTop && !hasLeft ? radius : 0;
            const tr = !hasTop && !hasRight ? radius : 0;
            const bl = !hasBottom && !hasLeft ? radius : 0;
            const br = !hasBottom && !hasRight ? radius : 0;
            
            // Draw rounded rectangle
            ctx.beginPath();
            ctx.moveTo(screenX + tl, screenY);
            ctx.lineTo(screenX + size - tr, screenY);
            if (tr) ctx.arcTo(screenX + size, screenY, screenX + size, screenY + tr, tr);
            else ctx.lineTo(screenX + size, screenY);
            ctx.lineTo(screenX + size, screenY + size - br);
            if (br) ctx.arcTo(screenX + size, screenY + size, screenX + size - br, screenY + size, br);
            else ctx.lineTo(screenX + size, screenY + size);
            ctx.lineTo(screenX + bl, screenY + size);
            if (bl) ctx.arcTo(screenX, screenY + size, screenX, screenY + size - bl, bl);
            else ctx.lineTo(screenX, screenY + size);
            ctx.lineTo(screenX, screenY + tl);
            if (tl) ctx.arcTo(screenX, screenY, screenX + tl, screenY, tl);
            else ctx.lineTo(screenX, screenY);
            ctx.closePath();
            
            // Main fill with gradient
            const gradient = ctx.createLinearGradient(screenX, screenY, screenX, screenY + size);
            gradient.addColorStop(0, color.highlight);
            gradient.addColorStop(0.3, color.color);
            gradient.addColorStop(1, color.shadow);
            ctx.fillStyle = gradient;
            ctx.fill();
            
            // Dark outline
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Inner highlight (top-left)
            if (!hasTop && !hasLeft) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.beginPath();
                ctx.ellipse(screenX + 8, screenY + 8, 5, 4, -0.3, 0, Math.PI * 2);
                ctx.fill();
                
                // Secondary smaller shine
                ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.beginPath();
                ctx.ellipse(screenX + 14, screenY + 12, 3, 2, -0.3, 0, Math.PI * 2);
                ctx.fill();
            }
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
        
        // Get current input to check if holding a direction (for drill animation)
        const input = this.getInput();
        const holdingDirection = input.down || input.left || input.right || input.up;
        
        // Determine which sprite to use
        let sprite = ASSETS.mole;
        let frameWidth = 32;
        let frameIndex = 0;
        let flipH = false;
        
        // Jump/bounce effect when drilling down
        let offsetY = 0;
        let scaleX = 1;
        let scaleY = 1;
        
        if (isDrilling && facing === 'down') {
            // Bounce effect - jump up then squash down
            const progress = this.player.drillAnimTimer / 0.25;
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
        
        // Always show direction-appropriate sprite based on facing
        // Show animated drill when actually drilling OR holding direction key
        const showDrillAnim = isDrilling || holdingDirection;
        
        if (facing === 'down') {
            if (ASSETS.mole_drilling_down) {
                sprite = ASSETS.mole_drilling_down;
                frameIndex = showDrillAnim ? Math.floor(this.player.drillAnimFrame || 0) : 0;
            }
        } else if (facing === 'left') {
            if (ASSETS.mole_drilling_left) {
                sprite = ASSETS.mole_drilling_left;
                frameIndex = showDrillAnim ? Math.floor(this.player.drillAnimFrame || 0) : 0;
            }
        } else if (facing === 'right') {
            if (ASSETS.mole_drilling_right) {
                sprite = ASSETS.mole_drilling_right;
                frameIndex = showDrillAnim ? Math.floor(this.player.drillAnimFrame || 0) : 0;
            }
        } else if (facing === 'up') {
            if (ASSETS.mole_drilling_up) {
                sprite = ASSETS.mole_drilling_up;
                frameIndex = showDrillAnim ? Math.floor(this.player.drillAnimFrame || 0) : 0;
            }
        }
        
        if (sprite) {
            const srcX = frameIndex * frameWidth;
            
            ctx.save();
            
            // Apply transformations for bounce effect
            const centerX = x + GRID_SIZE / 2;
            const centerY = y + GRID_SIZE / 2;
            ctx.translate(centerX, centerY + offsetY);
            ctx.scale(flipH ? -scaleX : scaleX, scaleY);
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