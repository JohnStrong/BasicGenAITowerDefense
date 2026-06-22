# Three.js Terrain Renderer — Design

## Overview

This document describes the technical design for layering a Three.js WebGL scene under the existing 2D Canvas game to render terrain tiles (grass, water, stone, road) as Minecraft-style voxel blocks viewed from a fixed isometric camera.

The core principle: **the existing game is untouched except for two integration points** (`game-iso.js` and `iso-renderer.js`). Everything else — game logic, AI, HUD, units, level loading — remains unchanged.

---

## Architecture

### Renderer Flag

A single constant in `game-iso.js` controls the active terrain renderer:

```js
const USE_THREE_RENDERER = true;
```

When `false`, the codebase behaves exactly as it does today — no Three.js is loaded, no new code runs. When `true`, Three.js handles terrain and the 2D path is bypassed for handled tile types.

### Layer Model

```
#gameCanvas  (single canvas element)
│
├─ Frame start: THREE.WebGLRenderer renders terrain blocks
│   └─ Grass, water, stone, road as voxel BoxGeometry
│   └─ Clears to background colour #1a2a12
│
└─ Frame continue: 2D Canvas context draws on top (ctx = canvas.getContext('2d'))
    ├─ Tree overlays (transparent PNGs)
    ├─ Castle tiles (2D sprites, unchanged)
    ├─ Unit sprites (2D sprites, unchanged)
    ├─ Hover/select diamond outlines
    └─ HUD panels (unit bar, tile info, turn timer)
```

Because WebGL and 2D Canvas share the same element, Three.js renders first with `preserveDrawingBuffer: true`, then the 2D `ctx` composites on top. This is a supported browser pattern — each draw call on `ctx` composites over whatever WebGL left in the buffer.

### File Changes

| File | Change |
|------|--------|
| `index.html` | Add Three.js CDN `<script>` tag (conditional on flag); load `three-terrain-renderer.js` |
| `js/game-logic/lib/three-terrain-renderer.js` | **New file** — all Three.js logic |
| `js/game-logic/game-iso.js` | Add `USE_THREE_RENDERER` flag; 3 integration lines; remove `fillRect` background clear |
| `js/game-logic/lib/iso-renderer.js` | Skip ground-sprite draw for 3D-handled tile types when flag is on |

---

## three-terrain-renderer.js

### Constants

```js
const VOXEL_HEIGHT = 12;          // default block height (world units)
const TILE_W = 64;                 // must match IsoCamera.tileW
const TILE_H_ISO = 32;             // must match IsoCamera.tileH (iso projection depth)
const TEXTURE_SIZE = 32;           // texture pixels per face (power of 2)
const SKY_COLOR = '#4DD0E1';       // azure/aqua skybox background (Material Design cyan 300)

// Height multipliers per tile type
const HEIGHT_SCALE = {
    grass: 1.0,
    water: 0.5,
    stone: 0.85,
    road:  0.3,
};
```

### Tile Type Detection

```js
function getTileType(spriteName) {
    if (spriteName.startsWith('grass-'))  return 'grass';
    if (spriteName.startsWith('water-'))  return 'water';
    if (spriteName === 'rock')            return 'stone';
    if (spriteName === 'road-full')       return 'road';
    return null; // unhandled — falls back to 2D
}
```

### Instanced Mesh Architecture

Rather than one `Mesh` per tile (potentially 2000+ draw calls for a full level), we use one `InstancedMesh` per tile type. Each instance's position is set via `instanceMatrix`.

```
InstancedMesh[grass]  → N grass tiles, single draw call
InstancedMesh[water]  → M water tiles, single draw call
InstancedMesh[stone]  → P stone tiles, single draw call
InstancedMesh[road]   → Q road tiles, single draw call
```

The geometry for each type uses a `BoxGeometry(TILE_W, height, TILE_H_ISO)` with `groups` for per-face materials.

### Camera Synchronisation

The critical challenge is keeping the Three.js orthographic camera pixel-perfectly aligned with IsoCamera's 2D projection.

**IsoCamera's projection formula** (viewpoint `br-tl`):
```
screenX = (col - row) * (tileW / 2) + mapOffsetX - camX
screenY = (col + row) * (tileH / 2) + mapOffsetY - camY + elevOffset
```

**Three.js equivalent**: The OrthographicCamera is positioned at:
```
camera position:  (camX_3d, elevation, camZ_3d)  — along the [1, √2, 1] isometric axis
camera target:    (gridCentreX, 0, gridCentreZ)   — centre of the tile grid
```

The orthographic frustum `[left, right, top, bottom]` is derived from the canvas size divided by zoom:
```js
const halfW = (canvasW / 2) / zoom;
const halfH = (canvasH / 2) / zoom;
camera.left   = -halfW;
camera.right  =  halfW;
camera.top    =  halfH;
camera.bottom = -halfH;
```

Camera is panned by translating its `lookAt` target using `camX`/`camY` deltas converted from 2D screen space back into 3D world space.

### Texture Generation

Each tile face texture is a 32×32 `HTMLCanvasElement` painted programmatically and wrapped in a `THREE.CanvasTexture` with `NearestFilter` for the crisp pixelated look.

#### Grass top face
```
Algorithm:
1. Fill base with mid-green (#5BB846)
2. For each 4×4 pixel cell:
   - Pick random green shade from palette [#4CAF50, #66BB6A, #81C784, #43A047, #388E3C]
   - Paint cell with that shade
   - 15% chance: add a slightly raised "voxel bump" (1px lighter border on top/left edges)
3. Around perimeter (outer 4px ring): mix in brown dirt tones
```

#### Grass side face
```
Algorithm:
1. Top 4px strip: same green palette as top face
2. Lower section: layered earth browns [#795548, #8D6E63, #A1887F]
   - Each horizontal strip gets a slightly different shade
   - 20% of pixel cells: darker speck for texture variation
```

#### Water top face
```
Algorithm:
1. Fill base with mid-blue (#29B6F6)
2. For each 2×2 pixel cell:
   - Pick from palette [#29B6F6, #4FC3F7, #81D4FA, #B3E5FC, #0288D1]
   - Vary brightness based on simple noise: hash(x, y) * 0.3 + 0.7
3. Add subtle diagonal highlight streaks (2px wide, 30% opacity white)
```

#### Stone top face
```
Algorithm:
1. Fill base with off-white (#ECEFF1)
2. For each 4×4 pixel cell:
   - Pick from palette [#ECEFF1, #CFD8DC, #B0BEC5, #90A4AE]
3. Draw 2px-wide cross-hatch seam lines at 1/2 and 3/4 positions (horizontal + vertical)
   in darker grey (#78909C) to create the 4-block division visible in reference image
4. Random 1px dark flecks (8% probability) for stone texture
```

#### Road top face
```
Algorithm:
1. Fill with dirt brown (#8D6E63)
2. Horizontal stripe variation: alternate between #795548 and #8D6E63 every 3px
3. Random speckle: 10% probability darker (#5D4037) or lighter (#A1887F) pixels
```

### Scene Graph

```
Scene
├── AmbientLight (0xffffff, intensity: 0.6)
├── DirectionalLight (from NW upper, intensity: 0.8, castShadow: false)
├── InstancedMesh[grass]  (BoxGeometry, MultiMaterial[6])
├── InstancedMesh[water]  (BoxGeometry, MultiMaterial[6])
├── InstancedMesh[stone]  (BoxGeometry, MultiMaterial[6])
└── InstancedMesh[road]   (BoxGeometry, MultiMaterial[6])
```

### Grid-to-World Coordinate Mapping

The 3D world coordinates of each tile must match the 2D isometric projection exactly. Given `IsoCamera.gridToScreen(row, col)` returns `(screenX, screenY)`, the 3D position of the tile centre in the Three.js world is:

```
worldX_3d = screenX - canvasW/2    // 2D screen offset → 3D X
worldY_3d = 0                      // flat ground plane
worldZ_3d = screenY - canvasH/2    // 2D screen Y → 3D Z (depth axis)
```

The orthographic camera maps this directly: when `worldX_3d = screenX - cx`, the projected screen position matches the 2D canvas point `(screenX, screenY)` at zoom=1 exactly.

This avoids any custom projection matrix — the Three.js orthographic camera IS the isometric projection.

---

## Integration Points

### index.html changes

```html
<!-- Three.js CDN — add only when USE_THREE_RENDERER is true -->
<script src="https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.min.js"></script>
<!-- New terrain renderer — after iso-camera.js, before game-iso.js -->
<script src="js/game-logic/lib/three-terrain-renderer.js"></script>
```

No structural HTML changes are needed. The flag in `game-iso.js` controls whether these scripts are loaded and used. In practice, both script tags can always be present in `index.html` since they are small; the renderer flag controls whether their code is invoked.

### game-iso.js changes

```js
// ── Renderer flag ──────────────────────────────────────────────────────────
const USE_THREE_RENDERER = true;
```

**In `Game.init()`**, after the canvas is obtained:
```js
if (USE_THREE_RENDERER && typeof ThreeTerrainRenderer !== 'undefined') {
    // THREE.WebGLRenderer targets #gameCanvas directly
    ThreeTerrainRenderer.init(this.canvas);
}
```

**In `Game._setupLevel()`** (or wherever `LevelLoader` finishes), pass tiles to Three.js:
```js
if (USE_THREE_RENDERER && typeof ThreeTerrainRenderer !== 'undefined') {
    ThreeTerrainRenderer.buildTiles(LevelLoader.getCurrentLevel().tiles);
}
```

**In `Game.loop()`, before `_render()`**:
```js
if (USE_THREE_RENDERER && typeof ThreeTerrainRenderer !== 'undefined') {
    ThreeTerrainRenderer.syncCamera(IsoCamera);
    ThreeTerrainRenderer.render();   // WebGL terrain draw — synchronous
}
```

**In `Game._render()`**, replace `ctx.fillRect('#1a2a12', ...)` with:
```js
if (!USE_THREE_RENDERER) {
    ctx.fillStyle = '#1a2a12';
    ctx.fillRect(0, 0, canvasW, canvasH);
}
// When USE_THREE_RENDERER is true: Three.js already cleared to SKY_COLOR (#4DD0E1)
// via renderer.setClearColor(SKY_COLOR) — no fillRect needed
```

### iso-renderer.js changes (minimal)

```js
drawTerrain(ctx, camera, tiles, state) {
    for (const tile of tiles) {
        if (tile.covered) continue;
        let { x, y } = camera.gridToScreen(tile.row, tile.col);

        if (isSelected) y -= state.selectedLift;

        // ── Ground sprite: skip for tiles handled by Three.js ──
        const handledBy3D = typeof ThreeTerrainRenderer !== 'undefined'
            && ThreeTerrainRenderer.handles(tile.sprite);
        if (!handledBy3D) {
            SpriteManager.draw(ctx, tile.sprite,
                x - camera.tileW/2, y - camera.tileH/2,
                camera.tileW, camera.tileH);
        }

        // ── Overlay pass: always 2D regardless of renderer ──
        if (tile.overlay) { /* ... unchanged ... */ }

        // ── Hover/select outlines: always 2D ──
        /* ... unchanged ... */
    }
}
```

---

## Data Flow Per Frame

```
Game.loop()
  │
  ├─ TickTransitions.tick()                [pure state]
  ├─ EnemyManager.moveUnit()               [AI side effect]
  ├─ IsoCamera.scroll() / applyZoom()      [camera update]
  │
  ├─ [USE_THREE_RENDERER = true]
  │   ├─ ThreeTerrainRenderer.syncCamera(IsoCamera)
  │   │   └─ Updates OrthographicCamera frustum + position from IsoCamera state
  │   └─ ThreeTerrainRenderer.render()
  │       └─ renderer.render(scene, camera)  [WebGL terrain draw to #gameCanvas, ~2-4ms]
  │
  └─ _render(state)                        [2D canvas composited on top of WebGL]
      │   (no fillRect — Three.js cleared to SKY_COLOR #4DD0E1 already)
      ├─ IsoCamera.applyTransform(ctx)
      ├─ IsoRenderer.drawTerrain()         [skips ground sprites for 3D tile types;
      │                                     still draws overlays + outlines via 2D ctx]
      ├─ IsoRenderer.drawUnits()           [2D sprites, unchanged]
      └─ HUD.*                             [drawn on top of everything]
```

When `USE_THREE_RENDERER = false`, the frame is identical to today: `fillRect` clears to `#1a2a12`, `IsoRenderer.drawTerrain()` draws all 2D sprites, nothing Three.js-related runs.

---

## ThreeTerrainRenderer Public API

```js
ThreeTerrainRenderer = {
    // Initialise scene, create InstancedMeshes, position tiles
    init(threeCanvas, tiles),

    // Update OrthographicCamera to match IsoCamera state
    syncCamera(isoCamera),

    // Trigger one Three.js render frame (no own rAF loop)
    render(),

    // Check if a sprite name is rendered by Three.js (for iso-renderer skip)
    handles(spriteName) → boolean,

    // Replace a single tile's instance material (for future water animation)
    updateTile(row, col, spriteName),

    // Clean up WebGL resources
    destroy(),
}
```

---

## Performance Budget

| Item | Target |
|------|--------|
| Draw calls (Three.js) | ≤ 10 (4 InstancedMesh + lights) |
| Three.js render time | ≤ 4 ms/frame |
| Texture memory | ≤ 2 MB (4 types × 6 faces × 32×32 RGBA) |
| Geometry vertices | ≤ 50k (BoxGeometry × instance count) |
| Total frame budget | ≤ 16 ms at 60 fps |

---

## What Does NOT Change

- `LevelLoader` — no changes, tiles still have `row, col, sprite, overlay`
- `IsoCamera` — no changes, still owns all camera state
- `IsoInput` — no changes, keyboard/mouse still drives IsoCamera
- `SpriteManager` — no changes, still draws unit/overlay sprites
- `HUD` — no changes, still draws entirely on `#gameCanvas`
- All game state, AI, pathfinding, unit management — untouched
- All existing `*.spec.js` tests — untouched

---

## Risk Notes

**WebGL + 2D context on same canvas**: Browsers support calling `canvas.getContext('2d')` after WebGL renders if Three.js uses `preserveDrawingBuffer: true`. The 2D context draw calls composite on top of the WebGL framebuffer. This is the standard pattern for overlaying UI on WebGL games. If a browser doesn't support it (very rare), the fallback is `USE_THREE_RENDERER = false`.

**Camera alignment precision**: The hardest part is pixel-perfect alignment between the Three.js world and the 2D canvas. The design uses the orthographic camera as a direct 2D-to-3D mapping (world units = pixels at zoom 1) which makes the maths straightforward. A test page (`three-terrain-test.html`) should be created during development to validate alignment with a grid overlay.

**Three.js CDN load failure**: If the CDN script fails to load, `typeof ThreeTerrainRenderer` will be `'undefined'` and all `USE_THREE_RENDERER` code paths are skipped. The game falls back to the 2D sprite path automatically — no explicit error handling needed.

**Image-rendering: pixelated vs WebGL**: The `image-rendering: pixelated` CSS on `#gameCanvas` applies to how the browser scales the canvas element. Three.js uses `NearestFilter` textures to achieve the crisp pixel look within the WebGL framebuffer itself.
