# Three.js Terrain Renderer — Tasks

## Task 1: Renderer flag and HTML setup
**Requirements**: 1.1, 1.2, 1.3, 1.4

- [ ] Add the `USE_THREE_RENDERER = true` constant at the top of `game-iso.js` (just below the existing constants block)
- [ ] Conditionally add Three.js r165 CDN `<script>` tag to `index.html` — it can always be present in the file; the flag controls whether the code is invoked
- [ ] Add `<script src="js/game-logic/lib/three-terrain-renderer.js">` to `index.html` after `iso-camera.js` and before `game-iso.js` — this file must exist (even as a stub) before `game-iso.js` loads
- [ ] Verify script load order: `utils.js` → ... → `iso-camera.js` → **`three-terrain-renderer.js`** → `iso-renderer.js` → `hud.js` → `level-loader.js` → `game-iso.js`
- [ ] In `Game._render()`, replace the unconditional `ctx.fillStyle = '#1a2a12'; ctx.fillRect(...)` background clear with:
  ```js
  if (!USE_THREE_RENDERER) {
      ctx.fillStyle = '#1a2a12';
      ctx.fillRect(0, 0, canvasW, canvasH);
  }
  // When USE_THREE_RENDERER is true, Three.js already cleared to SKY_COLOR
  ```
- [ ] No changes to the HTML canvas structure — `#gameCanvas` remains the single canvas element; no `#threeCanvas` is added; no `position: absolute` CSS changes are needed

**Acceptance**: `USE_THREE_RENDERER = false` → page behaves identically to today, dark background, 2D sprites. `USE_THREE_RENDERER = true` → page loads without console errors, body background visible until Three.js initialises.

---

## Task 2: ThreeTerrainRenderer module skeleton
**Requirements**: 6.1, 6.2, 6.4

Create `js/game-logic/lib/three-terrain-renderer.js` with the full public API stubbed:

- [ ] Define `ThreeTerrainRenderer` as a browser global object
- [ ] Implement `init(gameCanvas)` — takes the existing `#gameCanvas` element; creates `THREE.WebGLRenderer({ canvas: gameCanvas, alpha: false, preserveDrawingBuffer: true })`; creates `THREE.Scene` and `OrthographicCamera`; sets `renderer.setClearColor(SKY_COLOR)` where `SKY_COLOR = '#4DD0E1'`; does NOT start its own `requestAnimationFrame` loop
- [ ] Implement `buildTiles(tiles)` — separate from `init()` so it can be called after LevelLoader resolves; stub as no-op for now
- [ ] Implement `render()` — calls `renderer.render(scene, camera)` once synchronously
- [ ] Implement `syncCamera(isoCamera)` — stub (no-op for now)
- [ ] Implement `handles(spriteName)` — returns `false` for all sprites (stub)
- [ ] Implement `updateTile(row, col, spriteName)` — no-op stub
- [ ] Implement `destroy()` — calls `renderer.dispose()`
- [ ] Add graceful degradation guard at module top: if `typeof THREE === 'undefined'`, log a warning and export a no-op object so `game-iso.js` never throws even if the CDN fails

**Acceptance**: Module loads without errors; `ThreeTerrainRenderer.init(canvas)` creates a WebGL context on `#gameCanvas`; `render()` does not throw; setting `USE_THREE_RENDERER = false` in `game-iso.js` skips all calls and the game runs as before.

---

## Task 3: game-iso.js integration wiring
**Requirements**: 7.1, 7.2, 1.2

Wire the three integration points in `game-iso.js` behind the `USE_THREE_RENDERER` flag:

- [ ] In `Game.init()`, after `IsoCamera.init(...)`:
  ```js
  if (USE_THREE_RENDERER && typeof ThreeTerrainRenderer !== 'undefined') {
      ThreeTerrainRenderer.init(this.canvas);
  }
  ```
- [ ] In `Game._setupLevel()` (or the equivalent post-load callback), after `LevelLoader` finishes:
  ```js
  if (USE_THREE_RENDERER && typeof ThreeTerrainRenderer !== 'undefined') {
      ThreeTerrainRenderer.buildTiles(LevelLoader.getCurrentLevel().tiles);
  }
  ```
- [ ] In `Game.loop()`, before the `this._render(state)` call:
  ```js
  if (USE_THREE_RENDERER && typeof ThreeTerrainRenderer !== 'undefined') {
      ThreeTerrainRenderer.syncCamera(IsoCamera);
      ThreeTerrainRenderer.render();
  }
  ```
- [ ] Confirm toggling `USE_THREE_RENDERER = false` removes all Three.js calls from the loop — no dead code paths run

**Acceptance**: With `USE_THREE_RENDERER = true`, `ThreeTerrainRenderer.render()` is called every frame before `_render()`. With `USE_THREE_RENDERER = false`, the game loop is byte-for-byte equivalent to the pre-Three.js codebase.

---

## Task 4: Orthographic isometric camera
**Requirements**: 2.1, 2.2, 2.3, 2.4

- [ ] In `init(gameCanvas)`, create `THREE.OrthographicCamera` with frustum derived from `gameCanvas.width / zoom` and `gameCanvas.height / zoom` (initial zoom = `IsoCamera.zoom` default 0.7)
- [ ] Position camera along the isometric axis `(1, √2, 1)` normalised and scaled to a large look-distance (e.g. 2000 units), looking at `(0, 0, 0)`
- [ ] Implement `syncCamera(isoCamera)` fully:
  - Recompute `camera.left/right/top/bottom` from `canvas.width / isoCamera.zoom` and `canvas.height / isoCamera.zoom`
  - Translate the camera's look-at target by `isoCamera.camX` / `isoCamera.camY` mapped from 2D screen offsets to 3D world shift
  - Call `camera.updateProjectionMatrix()` after every change
- [ ] Confirm `OrbitControls` or any Three.js camera control library is NOT used

**Acceptance**: Camera computes without errors; scroll and zoom driven by `IsoCamera` / `IsoInput` do not crash; Three.js scene moves when the player scrolls.

---

## Task 5: Procedural voxel textures
**Requirements**: 3.4, 4.1, 4.2, 4.3, 4.4, 9.1, 9.2, 9.3

Implement and export texture generator functions (pure — take a canvas, paint it; no Three.js dependency):

- [ ] `generateGrassTopTexture(canvas)` — bright green voxel pattern with dirt perimeter (Req 4.1)
- [ ] `generateGrassSideTexture(canvas)` — green cap strip + layered earth browns (Req 4.1)
- [ ] `generateWaterTopTexture(canvas)` — cyan/blue tiled voxel pattern with highlight streaks (Req 4.2)
- [ ] `generateWaterSideTexture(canvas)` — darker saturated blue (Req 4.2)
- [ ] `generateStoneTopTexture(canvas)` — off-white with cross-hatch seam lines (Req 4.3)
- [ ] `generateStoneSideTexture(canvas)` — medium grey (Req 4.3)
- [ ] `generateRoadTopTexture(canvas)` — dirt brown horizontal stripes (Req 4.4)
- [ ] Each function uses `TEXTURE_SIZE = 32` pixel canvas; wrap in `THREE.CanvasTexture` with `magFilter = THREE.NearestFilter`, `minFilter = THREE.NearestFilter`
- [ ] Write `tests/game-logic/lib/three-terrain-renderer.spec.js` covering:
  - Each generator produces a 32×32 canvas with no fully transparent pixels
  - Grass top uses only colours from the defined green/brown palette
  - Water top uses only colours from the defined blue palette
  - Stone top contains cross-hatch pixels in grey tones
  - `getTileType()` returns the correct type string for each handled sprite name and `null` for unhandled types (castle, tree, bridge etc.)

**Acceptance**: All spec tests pass with `npm test`; textures are visually distinguishable in a browser.

---

## Task 6: Voxel block geometry and materials
**Requirements**: 3.1, 3.2, 3.3, 5.1, 5.2, 5.3

- [ ] Create one `THREE.BoxGeometry(TILE_W, height, TILE_H_ISO)` per tile type where `height = VOXEL_HEIGHT * HEIGHT_SCALE[type]`
- [ ] Create a `THREE.MeshStandardMaterial` array (6 elements) per tile type:
  - Face order (Three.js BoxGeometry): right (+X), left (−X), top (+Y), bottom (−Y), front (+Z), back (−Z)
  - Top face: generated top texture
  - Left side: medium-brightness texture (approx. 75% of top brightness)
  - Right side: darkest texture (approx. 55% of top brightness)
  - Bottom face: any opaque material (never visible)
- [ ] Add `THREE.AmbientLight(0xffffff, 0.6)` to scene (Req 5.1)
- [ ] Add `THREE.DirectionalLight(0xffffff, 0.8)` from upper-left isometric direction; `castShadow = false` (Req 5.2)
- [ ] Confirm no `EffectComposer`, bloom, or post-processing passes are added (Req 5.3)

**Acceptance**: A single manually placed test tile renders as a coloured box with distinct top/side face shading; no post-processing pipeline.

---

## Task 7: InstancedMesh tile placement
**Requirements**: 3.2, 6.3, 4.5

- [ ] In `buildTiles(tiles)`, group tiles by type using `getTileType(tile.sprite)`
- [ ] For each type with ≥1 tile, create `THREE.InstancedMesh(geometry, materials, count)`
- [ ] For each tile instance, compute 3D world position from `tile.row`/`tile.col` using the same isometric formula as `IsoCamera.gridToScreen` with `camX = 0, camY = 0` (camera panning is handled by the Three.js camera via `syncCamera`, not per-tile)
- [ ] Set each instance matrix: `new THREE.Matrix4().makeTranslation(worldX, worldY, worldZ)`
- [ ] Call `instancedMesh.instanceMatrix.needsUpdate = true` after all positions are set
- [ ] Tiles with `getTileType() === null` are silently skipped — they are not added to any `InstancedMesh`
- [ ] Update `handles(spriteName)` to return `true` for grass, water, stone, and road sprite names
- [ ] Store a `Map<'row,col', { type, instanceIndex }>` for `updateTile()` use

**Acceptance**: All grass/water/stone/road tiles render as 3D blocks at correct positions; castle, tree, and bridge tiles are absent from the Three.js scene and still rendered correctly by the 2D path.

---

## Task 8: iso-renderer.js integration
**Requirements**: 7.3, 7.4

- [ ] In `IsoRenderer.drawTerrain()`, gate the `SpriteManager.draw()` ground-sprite call behind a `handles()` check:
  ```js
  const is3D = typeof ThreeTerrainRenderer !== 'undefined'
      && ThreeTerrainRenderer.handles(tile.sprite);
  if (!is3D) {
      SpriteManager.draw(ctx, tile.sprite,
          x - camera.tileW/2, y - camera.tileH/2,
          camera.tileW, camera.tileH);
  }
  ```
- [ ] The overlay pass (tree canopies) is NOT gated — it always draws via the 2D path regardless of `is3D`
- [ ] Hover/select diamond outlines are NOT gated — they always draw via the 2D path
- [ ] Castle tiles draw their 2D sprites as before (`handles()` returns `false` for all castle sprite names)
- [ ] When `USE_THREE_RENDERER = false`, `ThreeTerrainRenderer.handles()` either returns `false` (stub) or is never called — either way the 2D sprite draw fires for every tile

**Acceptance**: With flag on — grass/water/stone show only the Three.js block with no 2D sprite underneath; tree overlays, castle walls, and hover outlines still appear. With flag off — all tiles render via 2D sprites as today.

---

## Task 9: Camera alignment validation
**Requirements**: 2.3, 7.1, 7.2

- [ ] Create `three-terrain-test.html` — a standalone debug page that loads the tutorial level with `USE_THREE_RENDERER = true` and draws red diamond outlines (via `IsoRenderer.drawDiamondOutline`) over every tile centre on the 2D canvas, so the 2D outlines can be visually compared to the Three.js block top faces
- [ ] Iterate on `syncCamera()` maths until the 2D diamond outline of any tile exactly coincides with the Three.js block top face at all tested zoom/pan states:
  - Zoom 0.7 (game default)
  - Zoom 1.0
  - Zoom 2.0
  - Scrolled to map corners
- [ ] Alignment tolerance: ≤ 1 pixel at all tested states

**Acceptance**: Diamond outlines sit precisely on Three.js block top faces at all zoom/pan positions.

---

## Task 10: Full integration and smoke test
**Requirements**: 1.2, 1.4, 7.1, 7.2, 6.3

- [ ] Load the tutorial level in a browser with `USE_THREE_RENDERER = true`
- [ ] Confirm Three.js terrain renders in ≤ 4 ms per frame (browser DevTools Performance panel)
- [ ] Confirm background is azure/aqua sky colour (`SKY_COLOR = '#4DD0E1'`) not the old dark green
- [ ] Confirm grass tiles look like the reference image (green voxel top, brown dirt sides)
- [ ] Confirm water tiles render shallower than grass, with cyan/blue voxel pattern
- [ ] Confirm rock tiles render as off-white stone with cross-hatch seams
- [ ] Confirm all HUD panels, unit sprites, tree overlays, briefing screen still function correctly on top of the Three.js layer
- [ ] Confirm camera scroll (arrow keys / mouse drag) and zoom (scroll wheel) move both layers in sync
- [ ] Confirm no JS console errors during a full game session (briefing → placement → active → enemy turn)
- [ ] Switch `USE_THREE_RENDERER = false` — confirm the game reverts to dark background and 2D sprites with zero errors; this validates the flag acts as a clean switch
- [ ] Simulate Three.js CDN failure (block the CDN request in DevTools) with `USE_THREE_RENDERER = true` — confirm the game falls back to 2D sprites gracefully via the `typeof THREE === 'undefined'` guard

**Acceptance**: Full game playable with voxel terrain; total frame time ≤ 16 ms; no regressions in either mode.

---

## Task 11: Tests and documentation
**Requirements**: 9.1, 9.2, 9.3

- [ ] Ensure all `three-terrain-renderer.spec.js` tests written in Task 5 pass with `npm test`
- [ ] Update the project structure section of root `README.md` to include `three-terrain-renderer.js`
- [ ] Add a "Terrain Rendering" section to root `README.md` explaining: the `USE_THREE_RENDERER` flag, the single-canvas WebGL + 2D Canvas compositing approach, how to switch between renderers, and the `SKY_COLOR` constant
- [ ] Note in the README that `USE_THREE_RENDERER = false` restores the full pre-Three.js 2D rendering path with no code changes required beyond the flag

**Acceptance**: `npm test` passes; README accurately describes both rendering modes and the flag.
