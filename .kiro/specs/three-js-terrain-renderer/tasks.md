# Implementation Plan: Three.js Terrain Renderer

## Overview

Implement a Three.js WebGL terrain renderer that overlays the existing 2D isometric game, rendering grass, water, stone, and road tiles as Minecraft-style voxel blocks viewed from a fixed isometric camera. Controlled by a single `USE_THREE_RENDERER` flag in `game-iso.js` — when `false`, the game is byte-for-byte identical to today.

## Tasks

- [x] 1. Renderer flag and HTML setup
  - Add the `USE_THREE_RENDERER = true` constant at the top of `game-iso.js` (just below the existing constants block)
  - Add Three.js r165 CDN `<script>` tag to `index.html` — it can always be present; the flag controls whether the code is invoked
  - Add `<script src="js/game-logic/lib/three-terrain-renderer.js">` to `index.html` after `iso-camera.js` and before `game-iso.js`
  - Verify script load order: `utils.js` → ... → `iso-camera.js` → `three-terrain-renderer.js` → `iso-renderer.js` → `hud.js` → `level-loader.js` → `game-iso.js`
  - In `Game._render()`, replace the unconditional `ctx.fillStyle = '#1a2a12'; ctx.fillRect(...)` background clear with a conditional that skips it when `USE_THREE_RENDERER` is true
  - Confirm no changes to the HTML canvas structure — `#gameCanvas` remains the single canvas element; no `#threeCanvas` is added
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. ThreeTerrainRenderer module skeleton
  - Create `js/game-logic/lib/three-terrain-renderer.js` and define `ThreeTerrainRenderer` as a browser global object
  - Implement `init(gameCanvas)` — creates `THREE.WebGLRenderer({ canvas: gameCanvas, alpha: false, preserveDrawingBuffer: true })`; creates `THREE.Scene` and `OrthographicCamera`; sets `renderer.setClearColor(SKY_COLOR)` where `SKY_COLOR = '#4DD0E1'`; does NOT start its own `requestAnimationFrame` loop
  - Implement `buildTiles(tiles)` — separate from `init()` so it can be called after LevelLoader resolves; stub as no-op for now
  - Implement `render()` — calls `renderer.render(scene, camera)` once synchronously
  - Implement `syncCamera(isoCamera)` — stub (no-op for now)
  - Implement `handles(spriteName)` — returns `false` for all sprites (stub)
  - Implement `updateTile(row, col, spriteName)` — no-op stub
  - Implement `destroy()` — calls `renderer.dispose()`
  - Add graceful degradation guard at module top: if `typeof THREE === 'undefined'`, log a warning and export a no-op object so `game-iso.js` never throws even if the CDN fails
  - _Requirements: 6.1, 6.2, 6.4_

- [x] 3. game-iso.js integration wiring
  - In `Game.init()`, after `IsoCamera.init(...)`, call `ThreeTerrainRenderer.init(this.canvas)` when `USE_THREE_RENDERER` is true and `ThreeTerrainRenderer` is defined
  - In `Game._setupLevel()` (or the equivalent post-load callback), after `LevelLoader` finishes, call `ThreeTerrainRenderer.buildTiles(LevelLoader.getCurrentLevel().tiles)` when flag is on
  - In `Game.loop()`, before `this._render(state)`, call `ThreeTerrainRenderer.syncCamera(IsoCamera)` and `ThreeTerrainRenderer.render()` when flag is on
  - Confirm toggling `USE_THREE_RENDERER = false` removes all Three.js calls from the loop — no dead code paths run
  - _Requirements: 7.1, 7.2, 1.2_

- [x] 4. Orthographic isometric camera
  - In `init(gameCanvas)`, create `THREE.OrthographicCamera` with frustum derived from `gameCanvas.width / zoom` and `gameCanvas.height / zoom` (initial zoom = `IsoCamera.zoom` default 0.7)
  - Position camera along the isometric axis `(1, √2, 1)` normalised and scaled to a large look-distance (e.g. 2000 units), looking at `(0, 0, 0)`
  - Implement `syncCamera(isoCamera)` fully: recompute `camera.left/right/top/bottom` from canvas size / zoom; translate the camera's look-at target by `isoCamera.camX` / `isoCamera.camY` mapped from 2D screen offsets to 3D world shift; call `camera.updateProjectionMatrix()` after every change
  - Confirm `OrbitControls` or any Three.js camera control library is NOT used
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 5. Procedural voxel textures
  - Implement `generateGrassTopTexture(canvas)` — bright green voxel pattern with dirt perimeter (Req 4.1)
  - Implement `generateGrassSideTexture(canvas)` — green cap strip + layered earth browns (Req 4.1)
  - Implement `generateWaterTopTexture(canvas)` — cyan/blue tiled voxel pattern with highlight streaks (Req 4.2)
  - Implement `generateWaterSideTexture(canvas)` — darker saturated blue (Req 4.2)
  - Implement `generateStoneTopTexture(canvas)` — off-white with cross-hatch seam lines (Req 4.3)
  - Implement `generateStoneSideTexture(canvas)` — medium grey (Req 4.3)
  - Implement `generateRoadTopTexture(canvas)` — dirt brown horizontal stripes (Req 4.4)
  - Each function uses `TEXTURE_SIZE = 32` pixel canvas; wrap in `THREE.CanvasTexture` with `magFilter = THREE.NearestFilter`, `minFilter = THREE.NearestFilter`
  - Write `tests/game-logic/lib/three-terrain-renderer.spec.js` covering: each generator produces a 32×32 canvas with no fully transparent pixels; grass top uses only colours from the defined green/brown palette; water top uses only colours from the defined blue palette; stone top contains cross-hatch pixels in grey tones; `getTileType()` returns the correct type string for each handled sprite name and `null` for unhandled types
  - _Requirements: 3.4, 4.1, 4.2, 4.3, 4.4, 9.1, 9.2, 9.3_

- [x] 6. Voxel block geometry and materials
  - Create one `THREE.BoxGeometry(TILE_W, height, TILE_H_ISO)` per tile type where `height = VOXEL_HEIGHT * HEIGHT_SCALE[type]`
  - Create a `THREE.MeshStandardMaterial` array (6 elements) per tile type with correct face order: right (+X), left (−X), top (+Y), bottom (−Y), front (+Z), back (−Z); top face uses generated top texture; left side at ~75% brightness; right side at ~55% brightness; bottom face uses any opaque material
  - Add `THREE.AmbientLight(0xffffff, 0.6)` to scene (Req 5.1)
  - Add `THREE.DirectionalLight(0xffffff, 0.8)` from upper-left isometric direction; `castShadow = false` (Req 5.2)
  - Confirm no `EffectComposer`, bloom, or post-processing passes are added (Req 5.3)
  - _Requirements: 3.1, 3.2, 3.3, 5.1, 5.2, 5.3_

- [x] 7. InstancedMesh tile placement
  - In `buildTiles(tiles)`, group tiles by type using `getTileType(tile.sprite)`
  - For each type with ≥1 tile, create `THREE.InstancedMesh(geometry, materials, count)`
  - For each tile instance, compute 3D world position from `tile.row`/`tile.col` using the same isometric formula as `IsoCamera.gridToScreen` with `camX = 0, camY = 0`
  - Set each instance matrix: `new THREE.Matrix4().makeTranslation(worldX, worldY, worldZ)`; call `instancedMesh.instanceMatrix.needsUpdate = true` after all positions are set
  - Tiles with `getTileType() === null` are silently skipped — not added to any `InstancedMesh`
  - Update `handles(spriteName)` to return `true` for grass, water, stone, and road sprite names
  - Store a `Map<'row,col', { type, instanceIndex }>` for `updateTile()` use
  - _Requirements: 3.2, 6.3, 4.5_

- [x] 8. iso-renderer.js integration
  - In `IsoRenderer.drawTerrain()`, gate the `SpriteManager.draw()` ground-sprite call behind a `handles()` check — skip the 2D draw when `ThreeTerrainRenderer.handles(tile.sprite)` returns true
  - Confirm the overlay pass (tree canopies) is NOT gated — it always draws via the 2D path regardless of `handles()`
  - Confirm hover/select diamond outlines are NOT gated — they always draw via the 2D path
  - Confirm castle tiles draw their 2D sprites as before (`handles()` returns `false` for all castle sprite names)
  - When `USE_THREE_RENDERER = false`, confirm `ThreeTerrainRenderer.handles()` either returns `false` (stub) or is never called — either way the 2D sprite draw fires for every tile
  - _Requirements: 7.3, 7.4_

- [x] 9. Camera alignment validation
  - Create `three-terrain-test.html` — a standalone debug page that loads the tutorial level with `USE_THREE_RENDERER = true` and draws red diamond outlines (via `IsoRenderer.drawDiamondOutline`) over every tile centre on the 2D canvas
  - Iterate on `syncCamera()` maths until the 2D diamond outline of any tile exactly coincides with the Three.js block top face at zoom 0.7 (game default), zoom 1.0, zoom 2.0, and scrolled to map corners
  - Alignment tolerance: ≤ 1 pixel at all tested states
  - _Requirements: 2.3, 7.1, 7.2_

- [x] 10. Full integration and smoke test
  - Load the tutorial level in a browser with `USE_THREE_RENDERER = true` and confirm Three.js terrain renders in ≤ 4 ms per frame (browser DevTools Performance panel)
  - Confirm background is azure/aqua sky colour (`SKY_COLOR = '#4DD0E1'`) not the old dark green
  - Confirm grass, water, and rock tiles render with correct voxel textures as described in requirements
  - Confirm all HUD panels, unit sprites, tree overlays, briefing screen still function correctly on top of the Three.js layer
  - Confirm camera scroll (arrow keys / mouse drag) and zoom (scroll wheel) move both layers in sync
  - Confirm no JS console errors during a full game session (briefing → placement → active → enemy turn)
  - Switch `USE_THREE_RENDERER = false` — confirm the game reverts to dark background and 2D sprites with zero errors
  - Simulate Three.js CDN failure (block the CDN request in DevTools) with `USE_THREE_RENDERER = true` — confirm the game falls back to 2D sprites gracefully via the `typeof THREE === 'undefined'` guard
  - _Requirements: 1.2, 1.4, 7.1, 7.2, 6.3_

- [x] 11. Tests and documentation
  - Ensure all `three-terrain-renderer.spec.js` tests written in Task 5 pass with `npm test`
  - Update the project structure section of root `README.md` to include `three-terrain-renderer.js`
  - Add a "Terrain Rendering" section to root `README.md` explaining: the `USE_THREE_RENDERER` flag, the single-canvas WebGL + 2D Canvas compositing approach, how to switch between renderers, and the `SKY_COLOR` constant
  - Note in the README that `USE_THREE_RENDERER = false` restores the full pre-Three.js 2D rendering path with no code changes required beyond the flag
  - _Requirements: 9.1, 9.2, 9.3_

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["3"] },
    { "id": 3, "tasks": ["4", "5"] },
    { "id": 4, "tasks": ["6"] },
    { "id": 5, "tasks": ["7"] },
    { "id": 6, "tasks": ["8"] },
    { "id": 7, "tasks": ["9"] },
    { "id": 8, "tasks": ["10"] },
    { "id": 9, "tasks": ["11"] }
  ]
}
```

## Notes

- `USE_THREE_RENDERER = false` must restore the full pre-Three.js 2D rendering path with zero code changes beyond the flag.
- All Three.js logic lives in `js/game-logic/lib/three-terrain-renderer.js` — no other game-logic files change except `game-iso.js` and `lib/iso-renderer.js`.
- Tests live in `tests/game-logic/lib/three-terrain-renderer.spec.js` and must run with `npm test`.
- The single-canvas approach uses `preserveDrawingBuffer: true` on the WebGL renderer so the 2D context can composite on top of the WebGL framebuffer.
- Tasks 4 and 5 can proceed in parallel once task 3 is complete — the camera work and texture generation are independent.
