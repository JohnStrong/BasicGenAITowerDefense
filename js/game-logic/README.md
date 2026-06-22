# Game Logic

All browser-side code that runs the game lives here. These files are loaded by `index.html` as plain `<script>` tags (no bundler).

## Table of Contents

- [File Overview](#file-overview)
- [utils.js](#utilsjs)
- [sprites.js — SpriteManager](#spritesjs--spritemanager)
- [level-loader.js — LevelLoader](#level-loaderjs--levelloader)
- [unit-manager.js — UnitManager](#unit-managerjs--unitmanager)
- [animation-controller.js — AnimationController](#animation-controllerjs--animationcontroller)
- [pixi-renderer.js — PixiRenderer](#pixi-rendererjs--pixirenderer)
- [game-iso.js — Game (Main Orchestrator)](#game-isojs--game-main-orchestrator)
  - [GameState — the state monad](#gamestate--the-state-monad)
  - [Phase machine](#phase-machine)
  - [Tick transitions](#tick-transitions-ticktransitions)
  - [Turn transitions](#turn-transitions-turntransitions)
  - [Input transitions](#input-transitions-inputtransitions)
- [lib/ — Reusable Modules](#lib--reusable-modules)

---

## File Overview

| File | What it does |
|------|-------------|
| `utils.js` | Shared constants and helper functions |
| `sprites.js` | Loads PNG sprite images into memory |
| `level-loader.js` | Reads level text files and turns them into tile data |
| `unit-manager.js` | Manages army units — stats, placement, removal |
| `animation-controller.js` | Shared frame-cycling timers for animated sprite types |
| `pixi-renderer.js` | PixiJS-backed renderer with WebGL/Canvas fallback chain |
| `game-iso.js` | The main game — ties everything together |
| `lib/` | Reusable modules (camera, input, renderer, HUD) |

---

## utils.js

Defines constants used everywhere and two helper functions.

```js
TILE_SIZE       // 32 (base reference)
HEX_WIDTH       // 32 (for top-down hex view)
HEX_HEIGHT      // 28
HEX_ROW_HEIGHT  // 21
HEX_COL_OFFSET  // 16

loadImage(src)      // Loads a PNG, returns a Promise
loadTextFile(src)   // Fetches a text file, returns a Promise
hexToPixel(row, col) // Converts grid position to pixel (hex view only)
```

---

## sprites.js — SpriteManager

Loads game sprites and delegates rendering to PixiJS when available. Sprite dimensions vary by category:

| Category | Dimensions | Examples |
|----------|-----------|---------|
| Terrain / castle (flat) | 64×32 | `grass-short-1`, `castle-wall`, `bridge-mm` |
| Units | 32×32 | `unit-knight`, `unit-archer` |
| Enemy units | 64×32 | `enemy-knight`, `enemy-siege` |
| Tree overlays | 64×48 | `tree-oak-overlay-1`, `tree-shrub-overlay-2` |
| Castle wall / bridge overlays | 64×48 | `castle-wall-overlay`, `bridge-mm-overlay` |
| Castle tower / keep overlays | 64×64 | `castle-tower-overlay`, `castle-keep-tl-overlay` |
| Castle gatehouse overlay | 64×80 | `castle-gatehouse-overlay` |

```js
// Preferred startup path — atlas + PixiJS (see game-iso.js init):
SpriteManager.usePixiRenderer(pixiRenderer);
await SpriteManager.loadAtlas('assets/sprites/atlas-0.png', 'assets/sprites/atlas.json');

// Legacy fallback (used automatically if atlas load fails):
await SpriteManager.loadAll();

// During rendering (API unchanged):
SpriteManager.draw(ctx, 'grass-short-1', x, y, 64, 32);

// Drawing a castle overlay at its native dimensions:
SpriteManager.draw(ctx, 'castle-tower-overlay', x, y, 64, 64);
```

`draw()` floors `x` and `y` to integers before rendering to prevent sub-pixel blur on pixel art. When a PixiJS renderer is wired in and the atlas is loaded, the call is delegated to `PixiRenderer.drawSprite()`; otherwise it falls back to Canvas 2D.

If a sprite file is missing, it creates a grey placeholder with the name printed on it so the game still runs.

### Registered sprite categories

`SpriteManager.spriteList` contains all sprites loaded at startup, grouped by category:

| Category | Count | Notes |
|----------|-------|-------|
| Terrain (grass, road, water, bridge, trees, rock) | 17 | Flat 64×32 diamonds |
| Tree overlay sprites | 7 | 64×48, transparent background; oak (3), pine (2), shrub (2) |
| Units | 9 | 32×32, transparent background |
| Castle structures (flat) | 13 | 64×32; includes `castle-bridge-start`, `castle-bridge-mid`, `castle-bridge-gate`, towers, keeps (4 quadrants), gatehouse, wall, bailey (3 variants) |
| Enemy sprites | 5 | 64×32, `enemy-` prefix |
| Damaged castle sprites | 10 | 64×32, `-damaged` suffix |
| Castle overlay sprites | 18 | Transparent background, variable height (48 / 64 / 80 px) |

**Castle overlay sprites** (18 total) are drawn on top of their corresponding flat ground tile to achieve 2.5D depth. Canvas height varies by structure category:

- **Walls and bridges** (64×48): `castle-wall-overlay`, `castle-wall-damaged-overlay`, `bridge-mm-overlay`, `castle-bridge-start-overlay`, `castle-bridge-mid-overlay`, `castle-bridge-gate-overlay`
- **Towers and keeps** (64×64): `castle-tower-overlay`, `castle-tower-damaged-overlay`, `castle-keep-tl-overlay`, `castle-keep-tl-damaged-overlay`, `castle-keep-bl-overlay`, `castle-keep-bl-damaged-overlay`, `castle-keep-br-overlay`, `castle-keep-br-damaged-overlay`, `castle-keep-center-overlay`, `castle-keep-center-damaged-overlay`
- **Gatehouse** (64×80): `castle-gatehouse-overlay`, `castle-gatehouse-damaged-overlay`

---

## level-loader.js — LevelLoader

Reads the level manifest, loads each `.txt` level file, and optionally loads a matching `.elevation.txt` file.

```js
// On startup:
await LevelLoader.loadLevelList();

// Get current level data:
const level = LevelLoader.getCurrentLevel();
// level.tiles = [{ row, col, x, y, sprite }, ...]
// level.width, level.height
// level.elevation = { colNumber: pixelOffset }
```

Each character in the text file becomes one tile. The loader maps characters to sprite names (e.g., `.` → `grass-short-1`, `~` → `water-1`).

Castle and bridge tiles carry both a `sprite` (the flat 64×32 ground diamond) and an `overlay` (the transparent-background structure sprite drawn on top). Tree tiles (`O`, `P`, `S`) also carry an `overlay` pointing to the appropriate tree overlay sprite. All other tiles have no `overlay` field.

```js
// Example tile objects:
{ row, col, x, y, sprite: 'castle-wall',         overlay: 'castle-wall-overlay' }
{ row, col, x, y, sprite: 'castle-tower',        overlay: 'castle-tower-overlay' }
{ row, col, x, y, sprite: 'bridge-mm',           overlay: 'bridge-mm-overlay' }        // = tile
{ row, col, x, y, sprite: 'castle-bridge-start', overlay: 'castle-bridge-start-overlay' } // b tile
{ row, col, x, y, sprite: 'castle-bridge-mid',   overlay: 'castle-bridge-mid-overlay' }   // m tile
{ row, col, x, y, sprite: 'castle-bridge-gate',  overlay: 'castle-bridge-gate-overlay' }  // g tile
{ row, col, x, y, sprite: 'grass-short-1',       overlay: 'tree-oak-overlay-1' }       // O tile
{ row, col, x, y, sprite: 'grass-short-2' }                                             // . tile — no overlay
```

> **Note:** Prior to the castle-structure-overlays feature, `b`, `m`, and `g` all incorrectly mapped to `castle-bridge-mid`. They now map to their distinct sprites: `castle-bridge-start` (`b`), `castle-bridge-mid` (`m`), and `castle-bridge-gate` (`g`).

### Known limitation: tileHash bias

The `tileHash(row, col)` function is used to pick which variant of a tile to show (e.g., `grass-short-1` vs `grass-short-2`, or `water-1` vs `water-2` vs `water-3`). Due to integer overflow in its multiplication steps, the hash output is stuck in the range [0, ~0.5) — it never reaches values above 0.5.

In practice this means:
- **Grass** always renders as `grass-short-1` (the `> 0.5` check for variant 2 never fires)
- **Flowers** always render as `grass-flowers-1`
- **Water** only shows variants 1 and 2 (variant 3 requires `hash ≥ 0.67`, which is unreachable)
- **Oak trees** only show variants 1 and 2 out of 3
- **Pine/shrub** only show one variant each

The game still works fine — you just see fewer visual variants than the code intends. Fixing the hash would change the appearance of every existing level, so it's left as-is for now.

---

## unit-manager.js — UnitManager

Handles the player's army. Loads unit definitions from a CSV file, tracks quantities, and manages placement on the map.

### Loading units

```js
await UnitManager.loadResources('levels/default.resources.txt');
// Parses: Unit,StartQty,Health,Attack,DefenseModifier
```

### Checking what's available

```js
const available = UnitManager.getAvailableUnits();
// Returns units that still have qtyRemaining > 0
```

### Placing a unit on the map

```js
const placed = UnitManager.placeUnit("Archer/Crossbowman", row, col);
// placed = { def, sprite, row, col, currentHealth }
// Decrements qtyRemaining automatically
```

### Checking if a tile is occupied

```js
const unit = UnitManager.getUnitAt(row, col);
// Returns the unit object or null
```

### Checking if terrain allows placement

```js
UnitManager.canPlaceOn('grass-short-1')  // true
UnitManager.canPlaceOn('tree-1')         // false (blocked)
UnitManager.canPlaceOn('castle-wall')    // false (blocked)
```

### Removing a unit

```js
UnitManager.removeUnit(unit);
// Removes from map AND restores qtyRemaining
```

---

## animation-controller.js — AnimationController

Manages frame cycling for animated sprite types (water tiles, castle flags, etc.). All sprites of the same type share a **single shared timer** — they advance frames in unison rather than each running their own clock.

The module is an IIFE that exposes a plain object, so it works both as a browser global and as a CommonJS module in tests.

### Registering an animated type

```js
// Register water with 4 frames cycling every 600ms
AnimationController.registerAnimatedType('water', 4, 600);

// Register flag with 3 frames at the default 500ms interval
AnimationController.registerAnimatedType('flag', 3);
```

The `intervalMs` argument is clamped to `[100, 2000]`. Registering a type that already exists stops the old timer and starts a fresh one.

### Reading the current frame

```js
// Called each render frame to pick the right atlas frame name
const frame = AnimationController.getCurrentFrame('water');
// → 0, 1, 2, or 3 (cycles automatically)
```

Returns `0` for any type that has not been registered.

### Constants

```js
AnimationController.MIN_INTERVAL_MS   // 100
AnimationController.MAX_INTERVAL_MS   // 2000
AnimationController.DEFAULT_INTERVAL_MS // 500
```

### Cleanup

```js
// Stop all timers and clear the registry (useful in tests or on game teardown)
AnimationController.reset();

// Check whether a type is registered
AnimationController.isRegistered('water'); // true / false
```

### Design notes

- One `setInterval` per sprite type, not per sprite instance — keeps timer count O(types) rather than O(sprites).
- Frame index wraps with `% frameCount`, so adding or removing frames mid-game is safe as long as `registerAnimatedType` is called again.
- `frameCount` is clamped to a minimum of 1 to prevent division-by-zero in the modulo.

---

## pixi-renderer.js — PixiRenderer

PixiJS-backed renderer that sits between `SpriteManager` and the canvas. Provides a WebGL → CanvasRenderer → Canvas 2D fallback chain so the game runs on hardware that doesn't support WebGL.

### Renderer initialisation

```js
// Attach to the existing game canvas; tries WebGL first (5 s timeout)
const renderer = await initPixiRenderer(canvas);
// renderer.rendererType → 'webgl' | 'canvas-renderer' | 'canvas2d'
```

**Fallback chain (Req 5.5):**
1. PixiJS WebGL — hardware-accelerated, 5 s init timeout
2. PixiJS CanvasRenderer — software canvas via PixiJS
3. Canvas 2D — delegates directly to `SpriteManager` (no PixiJS)

PixiJS is always attached to the *existing* `<canvas>` element via the `view` option, so the DOM is not modified.

### Atlas loading

```js
await loadSpriteAtlas('assets/sprites/atlas-0.png', 'assets/sprites/atlas.json');
// Falls back to SpriteManager.loadAll() if atlas or JSON fails to load
```

The atlas JSON and image must both parse within 5 seconds. On any failure the module silently falls back to individual PNG loading via the existing `SpriteManager.loadAll()`.

### Drawing sprites

```js
// Draw a sprite at (x, y) on the given tile layer
drawSprite(ctx, 'grass-short-1', x, y, 64, 32, 'ground');
```

**Integer pixel alignment (Req 5.2, Property 13):** `x` and `y` are always floored to integers with `Math.floor` before being passed to the underlying renderer. This prevents sub-pixel blur on pixel art sprites regardless of whether the input is already an integer or a floating-point value.

When PixiJS is active and the atlas is loaded, the sprite is drawn via a `PIXI.Sprite`. Otherwise the call is delegated to `SpriteManager.draw()`.

### Draw-call budgeting (Req 7.4, Property 18)

Each tile layer (`ground`, `structure`, `unit`, `overlay`) has a budget of **10 draw calls per frame**. Calls beyond the budget are silently dropped.

```js
resetDrawCallCounters();          // call once per frame before drawing
trackDrawCall('ground');          // returns true if within budget, false if exceeded
getDrawCallCount('ground');       // current count for diagnostics
MAX_DRAW_CALLS_PER_LAYER;         // 10
```

Counters are independent per layer — exceeding the budget on `unit` does not affect `ground`.

### Testing interface

The module exports a `_reset()` function for test isolation. It clears all internal state (renderer type, textures, atlas flag, draw-call counters) so each property-test run starts from a clean slate without module cache tricks.

```js
const { drawSprite, _reset } = require('./pixi-renderer');
_reset(); // force canvas2d mode, clear all state
```

### Module exports (Node.js / CommonJS)

| Export | Type | Description |
|--------|------|-------------|
| `initPixiRenderer(canvas, timeout?)` | `async fn` | Initialise renderer with fallback chain |
| `loadSpriteAtlas(imgPath, jsonPath)` | `async fn` | Load atlas; falls back to individual PNGs |
| `drawSprite(ctx, name, x, y, w?, h?, layer?)` | `fn` | Draw one sprite, floors coords to integers |
| `resetDrawCallCounters()` | `fn` | Reset per-layer counters (call each frame) |
| `trackDrawCall(layer)` | `fn` | Increment counter; returns false if over budget |
| `getDrawCallCount(layer)` | `fn` | Read current counter for a layer |
| `MAX_DRAW_CALLS_PER_LAYER` | `number` | `10` |
| `_reset()` | `fn` | Full state reset for test isolation |

---

## game-iso.js — Game (Main Orchestrator)

The entry point. Initializes everything, runs the game loop, and handles player interactions. It delegates heavy lifting to the `lib/` modules.

All mutable game logic state is stored in a single frozen `GameState` value (the state monad). Every update is a pure function `GameState → GameState`. The `Game` object is a thin orchestrator that owns only the canvas, context, and a single `_state` reference.

`Game` also holds two **out-of-band instance properties** that are intentionally kept off `GameState` because they are either infrastructure-level or would introduce frame-ordering dependencies if they lived inside the pure state:

| Property | Type | Reset by | Purpose |
|----------|------|----------|---------|
| `_state` | `GameState \| null` | `init()` | The single frozen game-logic snapshot for the current frame |
| `_waveSpawned` | `boolean` | `_setupLevel()` sets it to `false` | One-shot flag: `true` after the first enemy wave is spawned. Kept on `Game` (not `GameState`) so the spawn check in `loop()` is independent of `turnCounter` ordering relative to `TickTransitions.tick()`. Reset to `false` by `_setupLevel()` so every page reload or level restart re-spawns the wave cleanly. |

### GameState — the state monad

`GameState` is a frozen plain object that holds the complete snapshot of all game logic for one frame. Nothing mutates it in place — every operation calls `update(state, patch)` and returns a new frozen object.

```js
// All fields and their types:
{
  phase:              'loading' | 'briefing' | 'placement' | 'active',
  placementStartMs:   number | null,   // performance.now() at placement entry
  placementDone:      boolean,         // true once → 'active' has fired
  briefingOpen:       boolean,         // FurtherReadingPanel expanded

  unitDefs:           ReadonlyArray<Object>,    // definitions + per-type qty tracking
  placedUnits:        ReadonlyArray<Object>,    // units on the map

  hoveredTile:        { row, col } | null,
  selectedTile:       { row, col } | null,
  selectedLift:       number,          // animated, pixels
  selectedLiftTarget: number,

  selectedUnitIdx:    number,          // -1 = none selected
  hudOpen:            boolean,
  hudWidth:           number,          // animated, pixels
  hudTargetWidth:     number,

  turnCounter:        number,

  // ── Turn sub-state (active phase only) ───────────────────────────────
  turnPhase:           'player' | 'enemy' | 'resolve',
  turnTimerStartMs:    number | null,          // performance.now() when player turn started
  turnDurationMs:      number,                 // player turn length in ms; default 45_000
  enemyUnitQueue:      ReadonlyArray<string>,  // enemy unit IDs yet to move this turn (FIFO)
  unitStepIntervalMs:  number,                 // delay between enemy unit moves in ms; default 1_000
  unitStepStartMs:     number | null,          // performance.now() when current step began
  resolveDurationMs:   number,                 // resolve phase length in ms; default 10_000
  resolveTimerStartMs: number | null,          // performance.now() when resolve phase began
  lastActiveTurnRects: { endTurnButtonRect: Object|null } | null,

  // ── Transient scratch (cleared within the same frame it is set) ──────
  pendingMoveId:       string | null,          // enemy unit ID to move this frame

  lastBriefingRects:  { playButtonRect, moreButtonRect } | null,
  lastPlacementRects: { readyButtonRect } | null,
}
```

#### Turn sub-state lifecycle

During the `'active'` phase `turnPhase` cycles through three values:

```
'player'  →  timer expires or End Turn clicked  →  'enemy'
'enemy'   →  all queued units have stepped      →  'resolve'
'resolve' →  10 s pause elapses                 →  'player'  (turnCounter++)
```

| Field | Default | Notes |
|-------|---------|-------|
| `turnPhase` | `'player'` | Only meaningful while `phase === 'active'` |
| `turnTimerStartMs` | `null` | Armed on the first active frame; nulled on expiry |
| `turnDurationMs` | `45_000` | Constant `TURN_DURATION_MS`; stored in state for future difficulty scaling |
| `enemyUnitQueue` | `[]` | Frozen array seeded by `TurnTransitions.beginEnemyPhase()`; each step pops one ID |
| `unitStepIntervalMs` | `1_000` | Constant `UNIT_STEP_INTERVAL_MS` — 1 second per unit move (v1 baseline) |
| `unitStepStartMs` | `null` | Reset to `nowMs` after each unit step |
| `resolveDurationMs` | `10_000` | Constant `RESOLVE_DURATION_MS`; stored in state for future difficulty scaling |
| `resolveTimerStartMs` | `null` | Armed when `'resolve'` is entered; nulled on expiry |
| `lastActiveTurnRects` | `null` | Hit-test rects for the active-phase HUD (End Turn button) |
| `pendingMoveId` | `null` | Transient — written by `_checkEnemyStep`, consumed and cleared by `loop()` before `_render()` runs |

`makeInitialState(unitDefs)` constructs the initial frozen state from a unit definition array (loaded via `UnitManager`). All nested arrays and objects are also frozen on construction.

#### `update` — the state monad primitive

```js
// Shallow-merge patch onto frozen state, return new frozen state.
// The input state is never touched.
update(state, { phase: 'briefing' })
```

Arrays inside state (e.g. `placedUnits`, `unitDefs`) are replaced atomically — spread a new array into the patch. Individual array items are also frozen.

#### Module-level helpers

These plain functions live at module scope, not on `Game`. They are stateless and directly testable.

| Helper | Description |
|--------|-------------|
| `PLACEMENT_DURATION_MS` | `30_000` — placement phase timeout in ms |
| `TURN_DURATION_MS` | `45_000` — player turn length in ms |
| `UNIT_STEP_INTERVAL_MS` | `1_000` — delay between enemy unit moves in ms (1 second per unit, v1 baseline) |
| `RESOLVE_DURATION_MS` | `10_000` — resolve phase pause length in ms |
| `_hitTest(x, y, rect)` | AABB point-in-rect test |
| `_canPlaceOn(sprite)` | Returns `true` if terrain allows unit placement. Blocked prefixes: `tree-`, `water-`, `castle-wall`, `castle-keep-`, `castle-gatehouse`, `rock` |
| `_getUnitBarClick(mouseX, mouseY, unitDefs, canvasW, canvasH)` | Returns the clicked unit bar slot index, or `-1` if no slot was hit |

### Startup flow

```
Game.init()
  → size both canvases to window.innerWidth × window.innerHeight (full-page, responsive)
  → IsoCamera.init()
  → IsoInput.init() with callbacks
  → PixiRenderer.initPixiRenderer(canvas)        // WebGL → CanvasRenderer → Canvas 2D
  → SpriteManager.usePixiRenderer(pixiRenderer)  // wire PixiJS into draw() path
  → SpriteManager.loadAtlas(atlas-0.png, atlas.json)  // falls back to loadAll() on failure
  → AnimationController.registerAnimatedType('water-anim', 4, 500)
  → AnimationController.registerAnimatedType('flag', 3, 600)
  → Game._renderDamagedCastleIntegrationTest()   // startup visual smoke test (Req 9.7)
  → LevelLoader.loadLevelList()
  → UnitManager.loadResources()
  → Game._state = makeInitialState(UnitManager.units)
  → Game._state = PhaseTransitions.toBriefing(Game._state)
  → Game.loop()
```

`unitDefs` are copied from `UnitManager` into the frozen state at `init()` time. After that, `UnitManager` is no longer queried for runtime state — all values come from `GameState`.

#### PixiJS initialisation detail

The startup sequence replaces the old `SpriteManager.loadAll()` call with a five-step PixiJS pipeline:

1. **`PixiRenderer.initPixiRenderer(canvas)`** — attempts WebGL (5 s timeout), falls back to PixiJS CanvasRenderer, then to plain Canvas 2D. Always attaches to the existing `<canvas>` element via the `view` option.
2. **`SpriteManager.usePixiRenderer(pixiRenderer)`** — wires the renderer into `SpriteManager.draw()` so all subsequent draw calls delegate to PixiJS when the atlas is loaded.
3. **`SpriteManager.loadAtlas(...)`** — loads `atlas-0.png` + `atlas.json` via PixiJS Spritesheet. On any failure (missing file, parse error, timeout) it automatically falls back to `SpriteManager.loadAll()` which loads individual PNGs.
4. **`AnimationController.registerAnimatedType(...)`** — registers `water-anim` (4 frames, 500 ms) and `flag` (3 frames, 600 ms) so animated tiles cycle frames from the atlas automatically.
5. **`_renderDamagedCastleIntegrationTest()`** — draws `castle-wall-damaged` at position (8, 8) as a startup smoke test confirming damaged sprites load from the atlas without errors. The sprite is overwritten by the first game render frame.

### Phase machine

The game progresses through four phases in order:

```
loading → briefing → placement → active
```

| Phase | Entered when | Exited when |
|-------|-------------|-------------|
| `loading` | on page load | all assets loaded (`init()` completes) |
| `briefing` | assets loaded | Play button clicked |
| `placement` | Play clicked | timer expires, all units placed, or Ready clicked |
| `active` | placement ends | (not yet implemented — game continues) |

All phase transitions are guarded and idempotent. Calling a transition in the wrong phase returns the state unchanged.

### Game loop (runs every frame ~60fps)

```
Game.loop()
  0. Pre-tick: if TurnTransitions.isReadyToSeedEnemyQueue(state)
       → (first frame of enemy phase) spawnWave() if !_waveSpawned
       → update(state, { enemyUnitQueue: Object.freeze(enemyIds), unitStepStartMs: nowMs })
         // Direct patch — bypasses beginEnemyPhase because turnPhase is already 'enemy'
         // (set by _checkTurnTimer expiry). beginEnemyPhase's guard requires turnPhase === 'player'
         // and would return state unchanged. Only enemyUnitQueue and unitStepStartMs need seeding here.
  1. TickTransitions.tick(state, { nowMs })      // pure: animate, check timers
  2. IsoCamera scroll / zoom                     // side effect, gated to 'placement' or 'active' phases
  3. Post-tick: if state.pendingMoveId
       → EnemyManager.moveUnit(pendingMoveId)    // move one unit; wrapped in try/catch
       → state.pendingMoveId = null              // clear scratch field before render
  4. _render(state)                              // pure read → returns rectPatch
  5. applyRenderRects(state, rectPatch)          // write click-target rects back into state
  6. requestAnimationFrame(loop)
```

`_render` is always synchronous — it must never `await` or return a `Promise`. This guarantees that the rect write-back in step 5 is always coherent with the draw calls in step 4.

`pendingMoveId` is always `null` by the time `_render()` is called — it is written by `_checkEnemyStep` in the tick pipeline and cleared in step 3 of the same synchronous call stack.

#### Camera gating by phase

Camera scroll and zoom (step 2) are only applied during the `'placement'` and `'active'` phases. During `'loading'` and `'briefing'` the map is non-interactive and the camera stays locked, so WASD/arrow key scroll and +/− zoom inputs are silently ignored.

```js
if (state.phase === 'placement' || state.phase === 'active') {
    const { dx, dy } = IsoInput.getScrollDir();
    if (dx || dy) IsoCamera.scroll(dx, dy);
    if (IsoInput.keys.zoomIn)  IsoCamera.applyZoom(IsoCamera.zoomSpeed);
    if (IsoInput.keys.zoomOut) IsoCamera.applyZoom(-IsoCamera.zoomSpeed);
}
```

This prevents the player from inadvertently repositioning the camera before the game starts (e.g. while reading the briefing screen) and keeps the briefing overlay anchored to the full viewport.

### Tick transitions (`TickTransitions`)

`TickTransitions.tick(state, deps)` composes a pipeline of sub-transitions applied in order each frame:

| Sub-transition | What it does |
|----------------|-------------|
| `_animateLift` | Smoothly moves `selectedLift` toward `selectedLiftTarget` (speed 0.3 px/frame) |
| `_animateHud` | Smoothly moves `hudWidth` toward `hudTargetWidth` (speed 12 px/frame) |
| `_checkPlacementTimer` | Calls `PhaseTransitions.toActive` when `nowMs − placementStartMs ≥ PLACEMENT_DURATION_MS` |
| `_checkAllPlaced` | Calls `PhaseTransitions.toActive` when all `unitDefs` have `qtyRemaining ≤ 0` |
| `_checkTurnTimer` | No-op unless `phase === 'active'` and `turnPhase === 'player'`. Arms `turnTimerStartMs` on the first frame; sets `turnPhase: 'enemy'` when `elapsed ≥ turnDurationMs` |
| `_checkEnemyStep` | No-op unless `turnPhase === 'enemy'`. Dequeues one unit ID into `pendingMoveId` every `unitStepIntervalMs`; transitions to `'resolve'` when the queue empties |
| `_checkResolveTimer` | No-op unless `turnPhase === 'resolve'`. Arms `resolveTimerStartMs` on the first frame; transitions back to `'player'` and increments `turnCounter` when `elapsed ≥ resolveDurationMs` |

> `_advanceTurnCounter` was removed; `turnCounter` is now incremented exactly once per full `player → enemy → resolve` cycle by `_checkResolveTimer`.

Adding a new per-frame behaviour means appending one function to the pipeline array — no existing code changes.

### Turn transitions (`TurnTransitions`)

`TurnTransitions` contains the named transitions and predicate that manage the `player → enemy → resolve → player` cycle within the active phase.

| Member | Signature | What it does |
|--------|-----------|-------------|
| `isReadyToSeedEnemyQueue(state)` | `state → boolean` | Returns `true` when all four conditions hold: `phase === 'active'`, `turnPhase === 'enemy'`, `enemyUnitQueue.length === 0`, `unitStepStartMs === null`. Used by `loop()` as the pre-tick guard to seed the queue exactly once per enemy phase. |
| `beginEnemyPhase(state, nowMs, enemyIds)` | pure transition | Guard: no-op unless `phase === 'active'` **and** `turnPhase === 'player'`. Sets `turnPhase: 'enemy'`, clears `turnTimerStartMs`, populates `enemyUnitQueue` with the provided `enemyIds` (frozen), and arms `unitStepStartMs`. **Not** called from the `loop()` pre-tick path — the pre-tick block uses `update()` directly because `turnPhase` is already `'enemy'` by the time `isReadyToSeedEnemyQueue` returns `true` (set either by `_checkTurnTimer` expiry or by `endPlayerTurn`), so `beginEnemyPhase`'s guard would reject the call. Available for callers that need to seed the queue while still in `turnPhase === 'player'` (e.g. future automated test harnesses). |
| `endPlayerTurn(state, nowMs)` | pure transition | End Turn button click path. Guard: no-op unless `phase === 'active'` **and** `turnPhase === 'player'`. Sets `turnPhase: 'enemy'`, clears `turnTimerStartMs`, sets `enemyUnitQueue: []` (frozen), and clears `unitStepStartMs: null`. The empty queue is intentional — the pre-tick block in `loop()` detects `isReadyToSeedEnemyQueue` on the next frame and seeds the queue (and runs `spawnWave()` if needed) before `tick()` runs. Does **not** accept or require `enemyIds`; queue population is always the pre-tick block's responsibility. |

When `endPlayerTurn` is called from the click handler, `loop()`'s pre-tick block picks up the empty queue on the very next frame via `isReadyToSeedEnemyQueue`, calls `EnemyManager.getEnemyUnits().map(u => u.id)` at that point to get the live enemy list, and seeds the queue with `update()`. If no enemies are alive the queue stays empty and `_checkEnemyStep` immediately transitions to `'resolve'`.

### Input transitions (`InputTransitions`)

Click and mouse-move handlers are pure functions: `(state, x, y, deps) → GameState`.

`applyClick` dispatches by phase:
- `'briefing'` → `_briefingClick`: tests `lastBriefingRects` hit boxes; fires `toPlacement` or `toggleFurtherReading`
- `'placement'` → `_placementClick`: tests `lastPlacementRects` hit box for Ready button, then falls through to tile interaction
- `'active'` → `_activeClick`: tile interaction only

`_tileInteractionClick` (shared by placement and active):
1. Unit bar slot hit → toggle `selectedUnitIdx`
2. Tile panel close button hit → close panel
3. Map tile + unit selected → `_applyUnitPlacement` (place or remove)
4. Map tile + no unit selected → select/deselect tile (opens info panel)

`_applyUnitPlacement` is fully pure — it returns updated `unitDefs` and `placedUnits` arrays without touching `UnitManager`.

`applyRightClick` removes the top unit on the clicked tile and restores its quantity in `unitDefs`.

### Render step

`_render(state)` reads `GameState` and returns a `rectPatch` for the next frame's hit-testing. It never writes to `_state` directly.

1. Clear canvas (dark green background `#1a2a12`)
2. `'loading'` phase → draw loading text, return `{}`
3. Apply camera transform → draw terrain via `IsoRenderer.drawTerrain()`
4. `'briefing'` phase → draw dim overlay + `HUD.renderBriefingScreen()` → return `{ lastBriefingRects }`
5. Draw placed units via `IsoRenderer.drawUnits()`
6. `'placement'` phase → `HUD.renderPlacementHUD()`, tile panel, unit bar → return `{ lastPlacementRects }`
7. `'active'` phase → tile panel, `HUD.renderActiveTurnHUD()` (three-mode top bar: player countdown + End Turn button / enemy step status / resolve countdown), unit bar → return `{ lastActiveTurnRects }`

### Click handling (summary)

Input event → `InputTransitions.applyClick(state, x, y, deps)` → new `GameState` assigned to `_state`. All hit-testing uses the bounding rects stored in state from the previous frame's render pass.

### Concurrency model

JavaScript is single-threaded. The `rAF` game loop runs atomically — no DOM event handler can interrupt it mid-execution. This means:

- `EnemyManager.executeTurn()` and an `onClick` handler can never interleave.
- Multiple clicks queued between two frames execute serially; each handler reads the output of the previous one.
- Classic multi-thread race conditions do not apply here.

Two narrower risks (re-entrant init and stale render rects) are analysed in full in `.kiro/specs/defensive-phase-hud/design.md`.

---

## lib/ — Reusable Modules

See `lib/README.md` for full documentation. Quick summary:

| Module | Responsibility |
|--------|---------------|
| `iso-camera.js` | Projection math, scroll, zoom, viewpoint |
| `iso-input.js` | Event listeners, key state |
| `iso-renderer.js` | Drawing tiles and units with effects |
| `hud.js` | All UI panels and hit testing |

These are generic enough to reuse in any isometric tile game.
