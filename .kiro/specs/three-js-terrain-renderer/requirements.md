# Three.js Terrain Renderer — Requirements

## Overview

Replace the flat 2D sprite-based terrain tiles with a Three.js-powered isometric 3D scene for terrain types grass, water, and stone (rock). All other game systems (game logic, HUD, AI, unit sprites, camera input, level loading) remain unchanged. The Three.js scene renders terrain-only tiles as voxel-style 3D blocks viewed from a fixed isometric camera angle, matching the Minecraft-style block aesthetic from the reference images.

---

## Requirements

### 1. Three.js Scene Setup

**Requirement 1.1 — Three.js integration**
The system MUST load Three.js (r165 or later) as a script tag in `index.html`. It MUST be loaded only when the Three.js renderer is active (controlled by the renderer flag — see 1.2). When the flag is off, Three.js is not loaded and the page behaves exactly as before.

**Requirement 1.2 — Renderer flag**
A single constant `USE_THREE_RENDERER` in `game-iso.js` (default `true`) MUST control which terrain rendering path is active at startup:
- `true` → Three.js renders all terrain tiles into `#gameCanvas` via a `THREE.WebGLRenderer` targeting that same canvas. The 2D terrain sprite draw path in `IsoRenderer.drawTerrain()` is bypassed for handled tile types.
- `false` → the existing 2D Canvas sprite path runs unchanged. No Three.js code is called. The page is identical to the current codebase.

The flag is the only change required to switch between renderers. No HTML structure changes are needed beyond the conditional `<script>` tag for Three.js.

**Requirement 1.3 — Single canvas**
Three.js MUST render into the existing `#gameCanvas` using `THREE.WebGLRenderer({ canvas: gameCanvas, alpha: true })`. There is NO separate `<canvas id="threeCanvas">`. The same canvas element serves both the Three.js terrain layer and the 2D Canvas HUD/unit/overlay layer — the WebGL context handles terrain, then the 2D context handles everything drawn on top.

**Requirement 1.4 — Background clear colour**
When Three.js is active, the WebGL renderer MUST clear to a sky-like azure/aqua colour instead of the current dark `#1a2a12`. The clear colour MUST be set via `renderer.setClearColor('#4DD0E1')` (Material Design cyan 300) or a close equivalent in the `#29B6F6`–`#80DEEA` range. The exact hex is tunable via a constant `SKY_COLOR` in `three-terrain-renderer.js`. When `USE_THREE_RENDERER = false`, the existing `ctx.fillRect('#1a2a12')` background is unchanged.

---

### 2. Isometric Camera

**Requirement 2.1 — Orthographic camera**
The Three.js camera MUST be an `OrthographicCamera`. Perspective projection is not acceptable — the game requires a true parallel isometric look with no vanishing point.

**Requirement 2.2 — Classic isometric angle**
The camera MUST be positioned at a fixed isometric angle: 45° azimuth rotation around the Y-axis and approximately 35.264° elevation (the mathematically exact isometric angle where all three faces of a cube show equal area). The camera MUST look at the centre of the tile grid.

**Requirement 2.3 — Camera mirrors IsoCamera**
The Three.js camera position and frustum MUST update every frame to match `IsoCamera`'s current `camX`, `camY`, `zoom`, and `mapOffsetX/Y` values so the Three.js terrain layer stays pixel-perfectly aligned with the 2D Canvas layer above it. If the player scrolls or zooms, the Three.js view moves identically.

**Requirement 2.4 — No Three.js camera controls**
`OrbitControls` or any Three.js camera control library MUST NOT be used. The existing `IsoCamera` / `IsoInput` system controls all camera movement.

---

### 3. Voxel Block Tiles

**Requirement 3.1 — BoxGeometry per tile**
Each terrain tile MUST be represented by a `THREE.BoxGeometry`. The box footprint MUST match the game's existing tile dimensions: 64 units wide × 32 units deep in world space (matching `IsoCamera.tileW` and `tileH`). Block height MUST be configurable via a constant `VOXEL_HEIGHT` (default: 12 units).

**Requirement 3.2 — Tile positioning**
Each box MUST be positioned in 3D world space by converting the tile's `(row, col)` grid coordinates using the same isometric formula as `IsoCamera.gridToScreen`, so the 3D blocks project to the same screen positions as the 2D sprites they replace.

**Requirement 3.3 — Three face materials**
Each voxel block MUST use a `THREE.MeshStandardMaterial` array with distinct materials for the six faces (left, right, front, back, top, bottom). At minimum, the visible isometric faces MUST be differentiated:
- **Top face** — brightest, most saturated version of the tile's colour palette
- **Left side face** — medium brightness (approx. 75% of top)
- **Right side face** — darkest (approx. 55% of top)

**Requirement 3.4 — Procedural voxel texture**
Each face MUST use a procedurally generated `THREE.CanvasTexture` painted to look like the reference images — a grid of slightly varying colour micro-pixels (voxel pattern). The texture MUST be pixel-art style (16×16 or 32×32 pixels per face, `magFilter = THREE.NearestFilter`, `minFilter = THREE.NearestFilter`).

---

### 4. Tile Type Visuals

**Requirement 4.1 — Grass tile**
Grass tiles (sprite names starting with `grass-`) MUST render as:
- Top face: lumpy green voxel texture — bright greens (`#4CAF50`, `#66BB6A`, `#81C784`) with small brown/dirt patches at perimeter
- Left/right side faces: layered dirt brown (`#795548`, `#8D6E63`, `#A1887F`) with green caps at top edge
- Matches the grass reference image: raised uneven top surface with soil sides

**Requirement 4.2 — Water tile**
Water tiles (sprite names starting with `water-`) MUST render as:
- Top face: tiled cyan/blue voxel texture — varying shades of `#29B6F6`, `#4FC3F7`, `#81D4FA`, `#B3E5FC` in a random grid pattern
- Side faces: slightly darker saturated blue (`#0288D1`, `#0277BD`)
- Block height MUST be 50% of `VOXEL_HEIGHT` to appear as a shallower slab (water sits lower in the landscape)

**Requirement 4.3 — Stone/Rock tile**
Rock tiles (sprite name `rock`) MUST render as:
- Top face: off-white stone voxel texture — `#ECEFF1`, `#CFD8DC`, `#B0BEC5` cracked stone pattern with subtle cross-hatch divisions
- Side faces: medium grey (`#90A4AE`, `#78909C`)
- Matches the stone reference image: pale stone brick with cross-hatch seam lines

**Requirement 4.4 — Road tile**
Road tiles (`road-full`) MUST render as a flat slab (height = 30% of `VOXEL_HEIGHT`) with a dirt-brown top face (`#8D6E63`) and darker brown sides — visually lower than grass to suggest a worn path.

**Requirement 4.5 — Fallback for unhandled tile types**
Any tile type not explicitly handled (castle structures, bridge, bailey, trees, etc.) MUST fall through to the existing 2D sprite rendering path and NOT be rendered as a 3D block. The Three.js layer renders only terrain tiles; everything else is handled by the 2D canvas layer as today.

---

### 5. Lighting

**Requirement 5.1 — Ambient light**
An `AmbientLight` MUST be added to the Three.js scene with intensity sufficient to keep shadowed faces visible (suggested: `0xffffff`, intensity `0.6`).

**Requirement 5.2 — Directional light**
A `DirectionalLight` MUST be added from the upper-left isometric direction (matching the existing 2D sprite shading convention) with intensity `0.8`. The light MUST cast no Three.js shadows (shadow mapping is off — performance).

**Requirement 5.3 — No post-processing**
No Three.js post-processing passes (EffectComposer, bloom, etc.) are permitted in v1. Keep rendering simple.

---

### 6. Renderer Module

**Requirement 6.1 — ThreeTerrainRenderer module**
All Three.js terrain logic MUST live in a new file `js/game-logic/lib/three-terrain-renderer.js` exposed as a browser global `ThreeTerrainRenderer`. It MUST NOT import or depend on any existing game modules other than reading `IsoCamera` for projection sync.

**Requirement 6.2 — Public API**
`ThreeTerrainRenderer` MUST expose:
- `init(threeCanvas, tiles)` — builds the scene, creates all tile meshes, starts the render loop
- `syncCamera(isoCamera)` — updates the Three.js camera to match IsoCamera state (called every frame from `game-iso.js`)
- `updateTile(row, col, spriteName)` — replaces or updates a single tile mesh (for future animated water or damaged tiles)
- `destroy()` — tears down the renderer and cleans up WebGL resources

**Requirement 6.3 — Frame budget**
The Three.js scene MUST render in under 4 ms per frame on a mid-range laptop GPU. Geometry MUST be instanced (`THREE.InstancedMesh`) per tile type to minimise draw calls. One `InstancedMesh` per tile type (grass, water, stone, road) — not one mesh per tile.

**Requirement 6.4 — No Three.js render loop**
Three.js MUST NOT run its own `requestAnimationFrame` loop. Instead, `ThreeTerrainRenderer` MUST expose a `render()` method that `game-iso.js` calls once per frame inside the existing game loop, after `IsoRenderer.drawTerrain()` and before the 2D HUD draws.

---

### 7. Integration with game-iso.js

**Requirement 7.1 — Init during level setup**
`ThreeTerrainRenderer.init(threeCanvas, tiles)` MUST be called from `Game._setupLevel()` (or equivalent) after `LevelLoader` has parsed the level and tiles are available.

**Requirement 7.2 — Per-frame sync**
`ThreeTerrainRenderer.syncCamera(IsoCamera)` and `ThreeTerrainRenderer.render()` MUST be called every frame from `Game.loop()` before the 2D canvas is drawn. The Three.js render MUST complete synchronously before the 2D canvas draw.

**Requirement 7.3 — Terrain tiles skip 2D draw**
For tile types handled by Three.js (grass, water, rock, road), `IsoRenderer.drawTerrain()` MUST skip the `SpriteManager.draw()` call for the ground sprite pass. Tree overlays, castle tile overlays, and hover/select outlines MUST still be drawn by the 2D Canvas path on top.

**Requirement 7.4 — No changes to game logic**
No changes are permitted to any file in `js/game-logic/` other than `game-iso.js` and `lib/iso-renderer.js`. All AI, pathfinding, level loading, state machine, HUD, and unit management code MUST remain unchanged.

---

### 8. Animated Water (stretch goal — v1.1)

**Requirement 8.1 — Water shimmer animation**
In a future v1.1 update, water tiles SHOULD animate. The `ThreeTerrainRenderer` architecture MUST support calling `updateTile(row, col, 'water-animated')` per frame without rebuilding the entire scene. Animated water is NOT required in v1.

---

### 9. Testing

**Requirement 9.1 — Unit tests for texture generators**
The voxel texture generation functions (grass, water, stone) MUST be exported from `three-terrain-renderer.js` and unit-tested in `tests/game-logic/lib/three-terrain-renderer.spec.js`. Tests MUST verify: correct colour palette usage, correct pixel dimensions, no fully-transparent pixels in non-transparent textures.

**Requirement 9.2 — No DOM or WebGL in tests**
Tests MUST mock `THREE.CanvasTexture` and use a plain `<canvas>` substitute. No WebGL context is required in the test environment.

**Requirement 9.3 — Tile type mapping tests**
Tests MUST verify that the tile-type-to-material mapping function returns the correct material config for each of the four terrain types and returns `null` for unhandled types.
