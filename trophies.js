// Thirty-one trophies, and the pixel sprites that stand for them.
//
// The finds in the vaults are hand-drawn objects; imported icons would sit
// beside them like a different game. So each trophy is drawn here from the
// same small vocabulary of shapes the blocks use — flat fills, one bright
// top edge, one dark bevel — and a locked trophy is the very same drawing
// run through dead metal, so the cabinet reads as a shelf of objects you
// either have or have not dug up yet.

const TROPHY_STORAGE_KEY = 'manny-the-mole:trophies';

/** Every group the cabinet is divided into, in shelf order. */
const TROPHY_GROUPS = Object.freeze([
    { id: 'descent', label: 'The descent' },
    { id: 'metal', label: 'Metal' },
    { id: 'air', label: 'Air' },
    { id: 'drill', label: 'The drill' },
    { id: 'gravity', label: 'Gravity' },
    { id: 'locks', label: 'The locks' },
    { id: 'odds', label: 'Odds and ends' },
]);

// icon: which drawing to use. tint: the metal it is struck in.
const TROPHY_DEFINITIONS = Object.freeze([
    // The descent
    { id: 'first-bite', group: 'descent', icon: 'shaft', tint: 'copper',
      name: 'First Bite', blurb: 'You dug the first shaft.' },
    { id: 'three-down', group: 'descent', icon: 'shaft', tint: 'bronze',
      name: 'Three Down', blurb: 'Three levels behind you.' },
    { id: 'halfway', group: 'descent', icon: 'shaft', tint: 'silver',
      name: 'Halfway', blurb: 'Six levels. The easy half.' },
    { id: 'nine-deep', group: 'descent', icon: 'shaft', tint: 'gold',
      name: 'Nine Deep', blurb: 'Nine down, three to go.' },
    { id: 'all-twelve', group: 'descent', icon: 'shaft', tint: 'cyan',
      name: 'All Twelve', blurb: 'Every safe on the way down, opened.' },
    { id: 'the-key', group: 'descent', icon: 'key', tint: 'gold',
      name: 'The Next Safe Down', blurb: 'You saw what was in the last one.' },

    // Metal
    { id: 'first-medal', group: 'metal', icon: 'medal', tint: 'bronze',
      name: 'Something To Show', blurb: 'Your first medal.' },
    { id: 'first-gold', group: 'metal', icon: 'medal', tint: 'gold',
      name: 'Gold', blurb: 'Under par, at last.' },
    { id: 'six-golds', group: 'metal', icon: 'medal-stack', tint: 'gold',
      name: 'Six Golds', blurb: 'Half the campaign at speed.' },
    { id: 'all-golds', group: 'metal', icon: 'medal-stack', tint: 'cyan',
      name: 'Twelve Golds', blurb: 'Nothing left to shave.' },
    { id: 'own-record', group: 'metal', icon: 'stopwatch', tint: 'silver',
      name: 'Faster Than Yesterday', blurb: 'You beat your own best time.' },

    // Air
    { id: 'deep-breath', group: 'air', icon: 'tank', tint: 'cyan',
      name: 'Deep Breath', blurb: 'Finished a level with air to spare.' },
    { id: 'on-fumes', group: 'air', icon: 'tank', tint: 'copper',
      name: 'On Fumes', blurb: 'Finished on the last few percent.' },
    { id: 'held-breath', group: 'air', icon: 'tank', tint: 'gold',
      name: 'Held Breath', blurb: 'A whole level without a top-up.' },
    { id: 'out-of-air', group: 'air', icon: 'skull', tint: 'dead',
      name: 'Out Of Air', blurb: 'It happens. It happened to you.' },

    // The drill
    { id: 'first-cut', group: 'drill', icon: 'drill', tint: 'copper',
      name: 'First Cut', blurb: 'One block, gone.' },
    { id: 'handful', group: 'drill', icon: 'shards', tint: 'bronze',
      name: 'A Handful', blurb: 'Five blocks came away at once.' },
    { id: 'armful', group: 'drill', icon: 'shards', tint: 'silver',
      name: 'An Armful', blurb: 'Eight at once.' },
    { id: 'whole-wall', group: 'drill', icon: 'shards', tint: 'gold',
      name: 'The Whole Wall', blurb: 'Twelve blocks in one bite.' },
    { id: 'thousand', group: 'drill', icon: 'drill', tint: 'cyan',
      name: 'A Thousand Blocks', blurb: 'All told, across every run.' },

    // Gravity
    { id: 'flattened', group: 'gravity', icon: 'boulder', tint: 'dead',
      name: 'Flattened', blurb: 'Something heavy found you.' },
    { id: 'ten-times', group: 'gravity', icon: 'boulder', tint: 'copper',
      name: 'Ten Times Flattened', blurb: 'You are not learning quickly.' },
    { id: 'long-drop', group: 'gravity', icon: 'drop', tint: 'silver',
      name: 'The Long Drop', blurb: 'You fell a very long way and lived.' },

    // The locks — one for each grade of circuit
    { id: 'grade-1', group: 'locks', icon: 'lock', tint: 'copper',
      name: 'Grade One', blurb: 'Your first circuit, restored.' },
    { id: 'grade-2', group: 'locks', icon: 'lock', tint: 'bronze',
      name: 'Grade Two', blurb: 'Two outputs, one path.' },
    { id: 'grade-3', group: 'locks', icon: 'lock', tint: 'silver',
      name: 'Grade Three', blurb: 'The board got wider.' },
    { id: 'grade-4', group: 'locks', icon: 'lock', tint: 'gold',
      name: 'Grade Four', blurb: 'Welded anchors and all.' },
    { id: 'grade-5', group: 'locks', icon: 'lock', tint: 'cyan',
      name: 'Grade Five', blurb: 'Very few wrong turns left.' },
    { id: 'grade-6', group: 'locks', icon: 'lock-branch', tint: 'cyan',
      name: 'Grade Six', blurb: 'The branching one. Solved.' },

    // Odds and ends
    { id: 'curator', group: 'odds', icon: 'frame', tint: 'bronze',
      name: 'Curator', blurb: 'You went and looked at the shelf.' },
    { id: 'quiet', group: 'odds', icon: 'speaker', tint: 'dead',
      name: 'Quiet Mole', blurb: 'You turned the sound off.' },
]);

const TROPHY_BY_ID = Object.freeze(Object.fromEntries(
    TROPHY_DEFINITIONS.map(t => [t.id, t])
));

// Each metal as four steps: the bright top edge, the face, the bevel, the
// outline. Dead is what a trophy you have not earned is struck in.
const TROPHY_METALS = Object.freeze({
    copper: { light: '#ffb27a', face: '#c9713a', dark: '#7a3a18', line: '#3a1c0b' },
    bronze: { light: '#f0c98a', face: '#b8873f', dark: '#6f4c1c', line: '#35240d' },
    silver: { light: '#f2f7ff', face: '#b9c6d8', dark: '#6f7d92', line: '#2f3846' },
    gold: { light: '#fff29a', face: '#f4bd21', dark: '#ad6c12', line: '#4a2f07' },
    cyan: { light: '#c6fbff', face: '#5fd8ea', dark: '#1f7c8f', line: '#0c333c' },
    dead: { light: '#4a5160', face: '#333944', dark: '#20242c', line: '#12151a' },
});

/**
 * Draws one trophy at the given size. `earned` false swaps every metal for
 * dead grey, which is the whole locked state — same object, no shine.
 */
function drawTrophySprite(ctx, definition, size, earned) {
    const metal = TROPHY_METALS[earned ? definition.tint : 'dead'];
    const u = size / 16; // the sprites are laid out on a 16x16 grid
    const px = (x, y, w, h, fill) => {
        ctx.fillStyle = fill;
        ctx.fillRect(Math.round(x * u), Math.round(y * u),
                     Math.ceil(w * u), Math.ceil(h * u));
    };

    // A filled disc on the same 16x16 grid, for the round trophies.
    const disc = (cx, cy, r, fill) => {
        for (let y = -r; y <= r; y++) {
            const half = Math.floor(Math.sqrt(r * r - y * y));
            px(cx - half, cy + y, half * 2 + 1, 1, fill);
        }
    };

    const drawings = {
        // ground with a shaft bored through it: two lit walls and a
        // black opening that steps narrower as it goes down
        shaft: () => {
            px(0, 2, 16, 3, metal.face);
            px(0, 2, 16, 1, metal.light);
            px(0, 5, 5, 11, metal.face);
            px(11, 5, 5, 11, metal.face);
            px(4, 5, 1, 11, metal.light);
            px(11, 5, 1, 11, metal.dark);
            px(5, 5, 6, 11, metal.line);
            px(6, 6, 4, 3, metal.dark);
            px(7, 10, 2, 2, metal.dark);
        },
        key: () => {
            disc(4, 5, 3, metal.face);
            disc(4, 5, 1, metal.line);
            px(2, 3, 1, 2, metal.light);
            px(6, 6, 8, 2, metal.face); px(6, 6, 8, 1, metal.light);
            px(11, 8, 1, 3, metal.face);
            px(13, 8, 1, 2, metal.face);
        },
        medal: () => {
            px(5, 0, 2, 5, metal.dark); px(9, 0, 2, 5, metal.dark);
            px(5, 0, 2, 1, metal.face); px(9, 0, 2, 1, metal.face);
            disc(8, 10, 5, metal.line);
            disc(8, 10, 4, metal.face);
            disc(8, 9, 2, metal.light);
        },
        'medal-stack': () => {
            disc(4, 11, 4, metal.line); disc(4, 11, 3, metal.dark);
            disc(12, 11, 4, metal.line); disc(12, 11, 3, metal.dark);
            disc(8, 7, 5, metal.line); disc(8, 7, 4, metal.face);
            disc(8, 6, 2, metal.light);
        },
        stopwatch: () => {
            px(6, 0, 4, 2, metal.dark);
            px(7, 2, 2, 1, metal.face);
            disc(8, 9, 6, metal.line);
            disc(8, 9, 5, metal.face);
            disc(8, 9, 4, metal.dark);
            px(7, 5, 2, 5, metal.light);
            px(8, 9, 4, 2, metal.light);
        },
        // a bottle with a valve on top
        tank: () => {
            px(7, 0, 2, 2, metal.light);
            px(6, 2, 4, 1, metal.dark);
            px(4, 3, 8, 13, metal.line);
            px(5, 4, 6, 11, metal.face);
            px(5, 4, 2, 11, metal.light);
            px(5, 11, 6, 1, metal.dark);
            px(5, 13, 6, 2, metal.dark);
        },
        skull: () => {
            disc(8, 7, 6, metal.line);
            disc(8, 7, 5, metal.face);
            px(4, 7, 8, 4, metal.face);
            disc(6, 7, 2, metal.line);
            disc(10, 7, 2, metal.line);
            px(7, 10, 2, 2, metal.dark);
            px(5, 12, 6, 3, metal.face); px(5, 12, 6, 1, metal.light);
            px(7, 12, 1, 3, metal.line); px(9, 12, 1, 3, metal.line);
        },
        // the bit: a cone of flights on a housing, pointing left
        drill: () => {
            px(0, 7, 2, 2, metal.light);
            px(2, 6, 2, 4, metal.face); px(2, 6, 2, 1, metal.light);
            px(4, 5, 2, 6, metal.line);
            px(6, 4, 2, 8, metal.face); px(6, 4, 2, 1, metal.light);
            px(8, 5, 2, 6, metal.line);
            px(10, 3, 5, 10, metal.face);
            px(10, 3, 5, 1, metal.light);
            px(10, 11, 5, 2, metal.dark);
            px(12, 6, 2, 2, metal.line);
        },
        // four quarters thrown apart, each keeping its own top edge
        shards: () => {
            px(1, 1, 6, 6, metal.face); px(1, 1, 6, 1, metal.light);
            px(10, 2, 5, 5, metal.dark); px(10, 2, 5, 1, metal.face);
            px(2, 10, 5, 5, metal.dark); px(2, 10, 5, 1, metal.face);
            px(9, 9, 6, 6, metal.face); px(9, 9, 6, 1, metal.light);
        },
        boulder: () => {
            disc(8, 9, 6, metal.line);
            disc(8, 9, 5, metal.face);
            disc(7, 7, 3, metal.light);
            disc(11, 10, 2, metal.dark);
            disc(5, 12, 2, metal.dark);
        },
        // a long fall: a shaft of arrow with a heavy head
        drop: () => {
            px(7, 0, 2, 9, metal.light);
            px(6, 2, 1, 2, metal.face);
            px(9, 2, 1, 2, metal.face);
            px(3, 8, 10, 2, metal.face); px(3, 8, 10, 1, metal.light);
            px(5, 10, 6, 2, metal.face);
            px(6, 12, 4, 2, metal.dark);
            px(7, 14, 2, 1, metal.line);
        },
        // a circuit board with a live path crossing it
        lock: () => {
            px(1, 1, 14, 14, metal.line);
            px(2, 2, 12, 12, metal.dark);
            // the live path: in at the left, up, across, out at the right
            px(3, 9, 4, 2, metal.face); px(3, 9, 4, 1, metal.light);
            px(5, 4, 2, 6, metal.face); px(5, 4, 2, 1, metal.light);
            px(5, 4, 6, 2, metal.face); px(5, 4, 6, 1, metal.light);
            px(9, 5, 2, 7, metal.face);
            px(9, 10, 4, 2, metal.face); px(9, 10, 4, 1, metal.light);
            px(2, 8, 2, 4, metal.light);
            px(12, 9, 2, 4, metal.light);
        },
        // the same board, but the path forks to two outputs
        'lock-branch': () => {
            px(1, 1, 14, 14, metal.line);
            px(2, 2, 12, 12, metal.dark);
            px(3, 7, 5, 2, metal.face); px(3, 7, 5, 1, metal.light);
            px(7, 3, 2, 10, metal.face); px(7, 3, 2, 1, metal.light);
            px(9, 3, 4, 2, metal.face); px(9, 3, 4, 1, metal.light);
            px(9, 11, 4, 2, metal.face);
        },
        // a framed picture, which is what the gallery is
        frame: () => {
            px(1, 2, 14, 12, metal.line);
            px(2, 3, 12, 10, metal.face);
            px(2, 3, 12, 1, metal.light);
            px(3, 4, 10, 8, metal.dark);
            px(3, 9, 10, 3, metal.face);
            px(5, 6, 3, 3, metal.light);
            px(9, 5, 3, 4, metal.face);
        },
        // a speaker with the bar through it, same as the mute glyph
        // a speaker with the waves struck out, same read as the mute glyph
        speaker: () => {
            px(1, 6, 3, 4, metal.dark);
            px(4, 3, 4, 10, metal.face);
            px(4, 3, 4, 1, metal.light);
            px(4, 12, 4, 1, metal.dark);
            px(10, 5, 2, 6, metal.dark);
            px(13, 3, 2, 10, metal.dark);
            // the bar sits only over the waves, so the cone stays readable
            for (let i = 0; i < 7; i++) px(9 + i, 12 - i, 2, 2, metal.light);
        },
    };

    (drawings[definition.icon] ?? drawings.medal)();
}

/** A trophy sprite as a canvas, ready to drop into the DOM. */
function createTrophyCanvas(definition, size, earned) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    drawTrophySprite(ctx, definition, size, earned);
    return canvas;
}

/**
 * Holds what has been earned, decides when something new has been, and
 * hands the UI a queue of things to announce. Counters that outlive a
 * single run (blocks dug, times flattened) are kept here too, because
 * they are only ever read to decide a trophy.
 */
class TrophyCabinet {
    constructor(game) {
        this.game = game;
        this.pending = [];
        const stored = this.load();
        this.earned = stored.earned;
        this.counters = stored.counters;
        this.connectGameVolt();
    }

    /**
     * Cross-device sync with the GameVolt portal, when its SDK is on the
     * page. Cloud-earned trophies land on the shelf silently — no toast
     * for something announced on another device — and newly earned ones
     * are pushed up from award(). Absent SDK, all of this is a no-op.
     */
    connectGameVolt() {
        if (!window.GameVolt?.achievements) return;
        try {
            const backfill = () => {
                GameVolt.achievements.getUnlockedIds?.()?.then?.(ids => {
                    if (!ids?.forEach) return;
                    let changed = false;
                    ids.forEach(fullId => {
                        const id = String(fullId)
                            .replace(/^manny-the-mole-/, '');
                        if (TROPHY_BY_ID[id] && !this.earned[id]) {
                            this.earned[id] = true;
                            changed = true;
                        }
                    });
                    if (changed) {
                        this.save();
                        this.game?.ui?.refreshTrophies?.();
                    }
                });
            };
            GameVolt.auth?.onStateChange?.(user => { if (user) backfill(); });
            if (GameVolt.auth?.getUser?.()) backfill();
        } catch { /* the shelf works without the cloud */ }
    }

    load() {
        const fallback = { earned: {}, counters: { blocks: 0, crushes: 0 } };
        try {
            const raw = VaultStore.getItem(TROPHY_STORAGE_KEY);
            if (!raw) return fallback;
            const parsed = JSON.parse(raw);
            return {
                // an id that no longer exists is dropped rather than kept
                earned: Object.fromEntries(
                    Object.keys(parsed?.earned ?? {})
                        .filter(id => TROPHY_BY_ID[id])
                        .map(id => [id, true])
                ),
                counters: {
                    blocks: Number(parsed?.counters?.blocks) || 0,
                    crushes: Number(parsed?.counters?.crushes) || 0,
                },
            };
        } catch {
            return fallback;
        }
    }

    save() {
        try {
            VaultStore.setItem(TROPHY_STORAGE_KEY, JSON.stringify({
                earned: this.earned,
                counters: this.counters,
            }));
            return true;
        } catch {
            return false;
        }
    }

    has(id) {
        return this.earned[id] === true;
    }

    earnedCount() {
        return TROPHY_DEFINITIONS.filter(t => this.has(t.id)).length;
    }

    /** Earn one. Silent and free if it is already on the shelf. */
    award(id) {
        const definition = TROPHY_BY_ID[id];
        if (!definition || this.has(id)) return false;
        this.earned[id] = true;
        this.pending.push(definition);
        this.save();
        if (window.GameVolt?.achievements) {
            try { GameVolt.achievements.unlock(id); } catch { /* bonus */ }
        }
        this.game?.ui?.refreshTrophies?.();
        return true;
    }

    /** The next thing to announce, or null. */
    takePending() {
        return this.pending.shift() ?? null;
    }

    bumpCounter(name, amount = 1) {
        this.counters[name] = (this.counters[name] || 0) + amount;
        // counters are cheap to write and losing them silently is worse
        this.save();
        return this.counters[name];
    }

    // — the hooks the game calls —

    onBlocksDug(pieceLength) {
        this.award('first-cut');
        if (pieceLength >= 5) this.award('handful');
        if (pieceLength >= 8) this.award('armful');
        if (pieceLength >= 12) this.award('whole-wall');
        if (this.bumpCounter('blocks', pieceLength) >= 1000) {
            this.award('thousand');
        }
    }

    onDeath(cause) {
        if (cause === 'oxygen') this.award('out-of-air');
        if (cause !== 'crushed') return;
        this.award('flattened');
        if (this.bumpCounter('crushes') >= 10) this.award('ten-times');
    }

    onFall(cells) {
        if (cells >= 8) this.award('long-drop');
    }

    onLockOpened(grade) {
        const id = `grade-${grade}`;
        if (TROPHY_BY_ID[id]) this.award(id);
    }

    onGalleryOpened() {
        this.award('curator');
    }

    onMuted(muted) {
        if (muted) this.award('quiet');
    }

    onLevelComplete({ completedCount, medal, medals, air, toppedUp, beatRecord }) {
        if (completedCount >= 1) this.award('first-bite');
        if (completedCount >= 3) this.award('three-down');
        if (completedCount >= 6) this.award('halfway');
        if (completedCount >= 9) this.award('nine-deep');
        if (completedCount >= CAMPAIGN_LEVELS.length) this.award('all-twelve');

        if (medal) this.award('first-medal');
        if (medal === 'gold') this.award('first-gold');
        if (medals.gold >= 6) this.award('six-golds');
        if (medals.gold >= CAMPAIGN_LEVELS.length) this.award('all-golds');
        if (beatRecord) this.award('own-record');

        if (air >= 80) this.award('deep-breath');
        if (air > 0 && air < 5) this.award('on-fumes');
        if (!toppedUp) this.award('held-breath');
    }

    onEndingSeen() {
        this.award('the-key');
    }
}
