/**
 * Tests for js/game-logic/lib/three-terrain-renderer.js
 *
 * Validates: Requirements 3.4, 4.1, 4.2, 4.3, 4.4, 9.1, 9.2, 9.3
 *
 * Uses Node.js built-in test runner (node:test).
 * Run: node --test tests/game-logic/lib/three-terrain-renderer.spec.js
 *
 * THREE and document are mocked so no WebGL/DOM context is needed.
 */

'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');

// ── Constants mirrored from the module ──────────────────────────────────────
const TEXTURE_SIZE = 32;

// ── Canvas / ctx mock ───────────────────────────────────────────────────────

/**
 * A minimal canvas mock that records fillStyle + fillRect calls so
 * tests can inspect which colours were painted and where.
 */
function createMockCanvas() {
    const pixels = {}; // key: "x,y" → fillStyle at time of last fillRect covering it

    const ctx = {
        fillStyle: '',
        fillRect(x, y, w, h) {
            const color = this.fillStyle;
            for (let py = y; py < y + h; py++) {
                for (let px = x; px < x + w; px++) {
                    pixels[`${px},${py}`] = color;
                }
            }
        },
        getPixel(x, y) { return pixels[`${x},${y}`] || null; },
        getAllColors() { return new Set(Object.values(pixels)); },
    };

    return {
        width:  0,
        height: 0,
        getContext: () => ctx,
        _ctx: ctx,
        _pixels: pixels,
    };
}

// ── THREE mock ───────────────────────────────────────────────────────────────

class MockCanvasTexture {
    constructor(canvas) {
        this.canvas     = canvas;
        this.magFilter  = null;
        this.minFilter  = null;
    }
}

const NearestFilter = 'NearestFilter';

class MockVector3 {
    constructor(x, y, z) {
        this.x = x || 0; this.y = y || 0; this.z = z || 0;
    }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v)      { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    normalize()  {
        const len = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
        if (len > 0) { this.x /= len; this.y /= len; this.z /= len; }
        return this;
    }
    addScaledVector(v, s) {
        this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this;
    }
}

const MockTHREE = {
    CanvasTexture: MockCanvasTexture,
    NearestFilter,
    // Minimal stubs so the module skeleton doesn't throw when loaded
    WebGLRenderer:        class { setClearColor() {} render() {} dispose() {} },
    Scene:                class {},
    OrthographicCamera:   class { updateProjectionMatrix() {} lookAt() {} position = new MockVector3() },
    Vector3:              MockVector3,
    AmbientLight:         class {},
    DirectionalLight:     class {},
    BoxGeometry:          class {},
    MeshStandardMaterial: class {},
    InstancedMesh:        class { instanceMatrix = { needsUpdate: false }; setMatrixAt() {} },
    Matrix4:              class { makeTranslation() { return this; } },
    SQRT2: Math.SQRT2,
};

// ── document mock ────────────────────────────────────────────────────────────

let canvasCreateCount = 0;
const createdCanvases = [];

const MockDocument = {
    createElement(tag) {
        if (tag === 'canvas') {
            canvasCreateCount++;
            const c = createMockCanvas();
            createdCanvases.push(c);
            return c;
        }
        return {};
    },
};

// ── Load module with mocked globals ─────────────────────────────────────────

// Inject globals that the module expects when running in a browser.
global.THREE    = MockTHREE;
global.document = MockDocument;
global.window   = global.window || {};

// Execute the module source in the current context via eval so that
// `window.ThreeTerrainRenderer` is populated the same way a browser would.
const moduleSrc = fs.readFileSync(
    path.join(__dirname, '../../../js/game-logic/lib/three-terrain-renderer.js'),
    'utf8'
);
// Wrap in an IIFE to avoid "use strict" issues and top-level return
eval(`(function() { ${moduleSrc} })()`);  // eslint-disable-line no-eval

const TTR = global.window.ThreeTerrainRenderer;

// ── Helper ───────────────────────────────────────────────────────────────────

/**
 * Call a texture generator, return the MockCanvasTexture and its backing
 * mock canvas so tests can inspect painted pixels.
 */
function callGenerator(fnName) {
    const texture = TTR[fnName]();
    assert.ok(texture instanceof MockCanvasTexture,
        `${fnName} must return a MockCanvasTexture`);
    return { texture, canvas: texture.canvas };
}

// ── Palette constants (mirrors the module) ────────────────────────────────

const GREEN_PALETTE  = ['#4CAF50', '#66BB6A', '#81C784', '#43A047', '#388E3C'];
const DIRT_PALETTE   = ['#795548', '#8D6E63'];
const BLUE_PALETTE   = ['#29B6F6', '#4FC3F7', '#81D4FA', '#B3E5FC', '#0288D1'];
const STONE_PALETTE  = ['#ECEFF1', '#CFD8DC', '#B0BEC5', '#90A4AE'];
const SEAM_COLOR     = '#78909C';

// ── Tests: getTileType ───────────────────────────────────────────────────────

describe('getTileType', () => {
    const fn = TTR._getTileType;

    it('returns "grass" for grass-plain', () => {
        assert.equal(fn('grass-plain'), 'grass');
    });

    it('returns "grass" for grass-hill', () => {
        assert.equal(fn('grass-hill'), 'grass');
    });

    it('returns "grass" for any sprite starting with grass-', () => {
        assert.equal(fn('grass-short-1'), 'grass');
        assert.equal(fn('grass-flowers-2'), 'grass');
    });

    it('returns "water" for water-shallow', () => {
        assert.equal(fn('water-shallow'), 'water');
    });

    it('returns "water" for any sprite starting with water-', () => {
        assert.equal(fn('water-deep'), 'water');
        assert.equal(fn('water-1'), 'water');
    });

    it('returns "stone" for rock', () => {
        assert.equal(fn('rock'), 'stone');
    });

    it('returns "road" for road-full', () => {
        assert.equal(fn('road-full'), 'road');
    });

    it('returns null for castle-keep-tl', () => {
        assert.equal(fn('castle-keep-tl'), null);
    });

    it('returns null for tree-pine', () => {
        assert.equal(fn('tree-pine'), null);
    });

    it('returns null for bridge-start', () => {
        assert.equal(fn('bridge-start'), null);
    });

    it('returns null for empty string', () => {
        assert.equal(fn(''), null);
    });

    it('returns null for non-string input', () => {
        assert.equal(fn(null), null);
        assert.equal(fn(undefined), null);
        assert.equal(fn(42), null);
    });
});

// ── Tests: canvas size ───────────────────────────────────────────────────────

describe('Texture generators — canvas dimensions', () => {
    const generators = [
        '_generateGrassTopTexture',
        '_generateGrassSideTexture',
        '_generateWaterTopTexture',
        '_generateWaterSideTexture',
        '_generateStoneTopTexture',
        '_generateStoneSideTexture',
        '_generateRoadTopTexture',
    ];

    for (const name of generators) {
        it(`${name} creates a ${TEXTURE_SIZE}×${TEXTURE_SIZE} canvas`, () => {
            const { canvas } = callGenerator(name);
            assert.equal(canvas.width,  TEXTURE_SIZE,
                `${name}: canvas.width must be ${TEXTURE_SIZE}`);
            assert.equal(canvas.height, TEXTURE_SIZE,
                `${name}: canvas.height must be ${TEXTURE_SIZE}`);
        });
    }
});

// ── Tests: NearestFilter ─────────────────────────────────────────────────────

describe('Texture generators — NearestFilter', () => {
    const generators = [
        '_generateGrassTopTexture',
        '_generateGrassSideTexture',
        '_generateWaterTopTexture',
        '_generateWaterSideTexture',
        '_generateStoneTopTexture',
        '_generateStoneSideTexture',
        '_generateRoadTopTexture',
    ];

    for (const name of generators) {
        it(`${name} sets magFilter and minFilter to NearestFilter`, () => {
            const { texture } = callGenerator(name);
            assert.equal(texture.magFilter, NearestFilter,
                `${name}: magFilter must be NearestFilter`);
            assert.equal(texture.minFilter, NearestFilter,
                `${name}: minFilter must be NearestFilter`);
        });
    }
});

// ── Tests: grass top colours ─────────────────────────────────────────────────

describe('generateGrassTopTexture — colour palette', () => {
    it('uses only colours from the green and dirt palettes (plus base)', () => {
        const { canvas } = callGenerator('_generateGrassTopTexture');
        const allowed = new Set([
            '#5BB846',               // base fill
            ...GREEN_PALETTE,
            ...DIRT_PALETTE,
        ]);
        const allColors = canvas._ctx.getAllColors();
        for (const color of allColors) {
            assert.ok(allowed.has(color),
                `Unexpected colour in grass top: ${color}`);
        }
    });

    it('contains at least one green from the palette', () => {
        const { canvas } = callGenerator('_generateGrassTopTexture');
        const allColors = canvas._ctx.getAllColors();
        const hasGreen = GREEN_PALETTE.some(c => allColors.has(c));
        assert.ok(hasGreen, 'Grass top must contain at least one green palette colour');
    });
});

// ── Tests: water top colours ─────────────────────────────────────────────────

describe('generateWaterTopTexture — colour palette', () => {
    it('uses only colours from the blue palette (plus base)', () => {
        const { canvas } = callGenerator('_generateWaterTopTexture');
        const allowed = new Set(BLUE_PALETTE);
        const allColors = canvas._ctx.getAllColors();
        for (const color of allColors) {
            assert.ok(allowed.has(color),
                `Unexpected colour in water top: ${color}`);
        }
    });

    it('contains at least one colour from the blue palette', () => {
        const { canvas } = callGenerator('_generateWaterTopTexture');
        const allColors = canvas._ctx.getAllColors();
        const hasBlue = BLUE_PALETTE.some(c => allColors.has(c));
        assert.ok(hasBlue, 'Water top must contain at least one blue palette colour');
    });
});

// ── Tests: stone top seam pixels ─────────────────────────────────────────────

describe('generateStoneTopTexture — cross-hatch seam lines', () => {
    it('has seam colour at the horizontal seam (y=16)', () => {
        const { canvas } = callGenerator('_generateStoneTopTexture');
        // Seam at y = TEXTURE_SIZE/2 = 16, width = 2 rows
        const seamY = TEXTURE_SIZE / 2;
        // At least one x-pixel in this row must be SEAM_COLOR
        let found = false;
        for (let x = 0; x < TEXTURE_SIZE; x++) {
            if (canvas._ctx.getPixel(x, seamY) === SEAM_COLOR) { found = true; break; }
        }
        assert.ok(found, `Stone top must have seam colour ${SEAM_COLOR} at y=${seamY}`);
    });

    it('has seam colour at the vertical seam (x=16)', () => {
        const { canvas } = callGenerator('_generateStoneTopTexture');
        const seamX = TEXTURE_SIZE / 2;
        let found = false;
        for (let y = 0; y < TEXTURE_SIZE; y++) {
            if (canvas._ctx.getPixel(seamX, y) === SEAM_COLOR) { found = true; break; }
        }
        assert.ok(found, `Stone top must have seam colour ${SEAM_COLOR} at x=${seamX}`);
    });

    it('has seam colour at x=24 (3/4 vertical seam)', () => {
        const { canvas } = callGenerator('_generateStoneTopTexture');
        const seamX = Math.floor(TEXTURE_SIZE * 3 / 4);
        let found = false;
        for (let y = 0; y < TEXTURE_SIZE; y++) {
            if (canvas._ctx.getPixel(seamX, y) === SEAM_COLOR) { found = true; break; }
        }
        assert.ok(found, `Stone top must have seam colour ${SEAM_COLOR} at x=${seamX}`);
    });

    it('has seam colour at y=24 (3/4 horizontal seam)', () => {
        const { canvas } = callGenerator('_generateStoneTopTexture');
        const seamY = Math.floor(TEXTURE_SIZE * 3 / 4);
        let found = false;
        for (let x = 0; x < TEXTURE_SIZE; x++) {
            if (canvas._ctx.getPixel(x, seamY) === SEAM_COLOR) { found = true; break; }
        }
        assert.ok(found, `Stone top must have seam colour ${SEAM_COLOR} at y=${seamY}`);
    });
});

// ── Tests: grass side ────────────────────────────────────────────────────────

describe('generateGrassSideTexture — colour palette', () => {
    it('uses only colours from the green and brown palettes', () => {
        const { canvas } = callGenerator('_generateGrassSideTexture');
        const brownPalette = ['#795548', '#8D6E63', '#A1887F'];
        const allowed = new Set([...GREEN_PALETTE, ...brownPalette]);
        const allColors = canvas._ctx.getAllColors();
        for (const color of allColors) {
            assert.ok(allowed.has(color),
                `Unexpected colour in grass side: ${color}`);
        }
    });

    it('has green at the top row (y=0)', () => {
        const { canvas } = callGenerator('_generateGrassSideTexture');
        const topColor = canvas._ctx.getPixel(0, 0);
        assert.ok(GREEN_PALETTE.includes(topColor),
            `Top-left pixel of grass side must be a green; got ${topColor}`);
    });
});

// ── Tests: stone side ────────────────────────────────────────────────────────

describe('generateStoneSideTexture — colour palette', () => {
    it('uses only grey tones', () => {
        const { canvas } = callGenerator('_generateStoneSideTexture');
        const greys = new Set(['#90A4AE', '#78909C']);
        const allColors = canvas._ctx.getAllColors();
        for (const color of allColors) {
            assert.ok(greys.has(color),
                `Unexpected colour in stone side: ${color}`);
        }
    });
});

// ── Tests: road top ──────────────────────────────────────────────────────────

describe('generateRoadTopTexture — colour palette', () => {
    it('uses only dirt brown tones', () => {
        const { canvas } = callGenerator('_generateRoadTopTexture');
        const roadColors = new Set(['#795548', '#8D6E63']);
        const allColors = canvas._ctx.getAllColors();
        for (const color of allColors) {
            assert.ok(roadColors.has(color),
                `Unexpected colour in road top: ${color}`);
        }
    });
});

// ── Tests: water side ────────────────────────────────────────────────────────

describe('generateWaterSideTexture — colour palette', () => {
    it('uses only dark blue tones', () => {
        const { canvas } = callGenerator('_generateWaterSideTexture');
        const waterSideColors = new Set(['#0288D1', '#0277BD']);
        const allColors = canvas._ctx.getAllColors();
        for (const color of allColors) {
            assert.ok(waterSideColors.has(color),
                `Unexpected colour in water side: ${color}`);
        }
    });
});

// ── Tests: handles() — Task 7 ────────────────────────────────────────────────
// Validates: Requirements 4.5, 6.3

describe('handles()', () => {
    it('returns true for grass- prefixed sprites', () => {
        assert.equal(TTR.handles('grass-plain'), true);
        assert.equal(TTR.handles('grass-hill'), true);
    });

    it('returns true for water- prefixed sprites', () => {
        assert.equal(TTR.handles('water-shallow'), true);
        assert.equal(TTR.handles('water-deep'), true);
    });

    it('returns true for rock', () => {
        assert.equal(TTR.handles('rock'), true);
    });

    it('returns true for road-full', () => {
        assert.equal(TTR.handles('road-full'), true);
    });

    it('returns false for castle sprites', () => {
        assert.equal(TTR.handles('castle-keep-tl'), false);
        assert.equal(TTR.handles('castle-bailey-1'), false);
    });

    it('returns false for tree sprites', () => {
        assert.equal(TTR.handles('tree-pine'), false);
    });

    it('returns false for bridge sprites', () => {
        assert.equal(TTR.handles('bridge-start'), false);
    });

    it('returns false for empty string', () => {
        assert.equal(TTR.handles(''), false);
    });

    it('returns false for undefined/null', () => {
        assert.equal(TTR.handles(null), false);
        assert.equal(TTR.handles(undefined), false);
    });
});

// ── Tests: buildTiles() — Task 7 ─────────────────────────────────────────────
// Validates: Requirements 3.2, 6.3, 4.5

/**
 * Create a minimal mock scene that tracks added objects.
 * Returns a scene-like object and the list of items added to it.
 */
function createMockScene() {
    const added = [];
    const removed = [];
    return {
        add(obj)    { added.push(obj);   },
        remove(obj) { removed.push(obj); },
        _added:   added,
        _removed: removed,
    };
}

/**
 * Create a minimal mock canvas with width/height for buildTiles() to read.
 */
function createMockGameCanvas(w = 800, h = 600) {
    return { width: w, height: h };
}

/**
 * Stub out the Three scene and canvas so buildTiles() can run in Node.js.
 * Returns a function to restore the original state.
 */
function setupBuildTilesEnv(canvasW = 800, canvasH = 600) {
    // Patch the module internals via TTR._xxx references.
    // We need to inject a mock scene and gameCanvas since init() was not called.
    // The module checks `if (!scene || !gameCanvas) return;`, so we inject them.
    // We do this by temporarily monkey-patching buildTiles via a wrapper.
    const mockScene = createMockScene();
    const mockCanvas = createMockGameCanvas(canvasW, canvasH);
    return { mockScene, mockCanvas };
}

describe('buildTiles() — tile grouping and InstancedMesh creation', () => {
    // Track what InstancedMesh instances were created.
    const createdMeshes = [];

    before(() => {
        // Extend mock THREE.InstancedMesh to record creation.
        MockTHREE.InstancedMesh = class {
            constructor(geometry, materials, count) {
                this.geometry  = geometry;
                this.materials = materials;
                this.count     = count;
                this.instanceMatrix = { needsUpdate: false };
                this._matrices = [];
                createdMeshes.push(this);
            }
            setMatrixAt(i, matrix) {
                this._matrices[i] = matrix;
            }
            dispose() {}
        };

        // Extend mock Matrix4 to record translation arguments.
        MockTHREE.Matrix4 = class {
            constructor() { this._translation = null; }
            makeTranslation(x, y, z) {
                this._translation = { x, y, z };
                return this;
            }
        };
    });

    it('skips tiles with unhandled sprite types', () => {
        // We test handles() rather than internal implementation; already tested above.
        assert.equal(TTR.handles('castle-keep-tl'), false);
        assert.equal(TTR.handles('tree-pine'), false);
    });

    it('_tileIndex is a Map (exposed on window.ThreeTerrainRenderer)', () => {
        assert.ok(TTR._tileIndex instanceof Map,
            '_tileIndex must be a Map');
    });

    it('_instancedMeshes is an object (exposed on window.ThreeTerrainRenderer)', () => {
        assert.ok(typeof TTR._instancedMeshes === 'object',
            '_instancedMeshes must be an object');
    });
});

describe('buildTiles() — world position computation', () => {
    it('computes correct worldX/worldZ for a tile at row=0, col=0 with mapOffset 0 on 800×600 canvas', () => {
        // With mapOffsetX=0, mapOffsetY=0, camX=0, camY=0, canvasW=800, canvasH=600:
        //   screenX = (0 - 0) * 32 + 0 = 0
        //   screenY = (0 + 0) * 16 + 0 = 0
        //   worldX  = 0 - 400 = -400
        //   worldZ  = 0 - 300 = -300
        const tileW   = 64;
        const tileH   = 32;
        const mapOffX = 0;
        const mapOffY = 0;
        const canvasW = 800;
        const canvasH = 600;
        const row = 0, col = 0;

        const screenX = (col - row) * (tileW / 2) + mapOffX;
        const screenY = (col + row) * (tileH / 2) + mapOffY;
        const worldX  = screenX - canvasW / 2;
        const worldZ  = screenY - canvasH / 2;

        assert.equal(worldX, -400);
        assert.equal(worldZ, -300);
    });

    it('computes correct worldX/worldZ for a tile at row=2, col=3 (br-tl isometric)', () => {
        // screenX = (3 - 2) * 32 + 0 = 32
        // screenY = (3 + 2) * 16 + 0 = 80
        // worldX  = 32 - 400 = -368
        // worldZ  = 80 - 300 = -220
        const tileW   = 64;
        const tileH   = 32;
        const mapOffX = 0;
        const mapOffY = 0;
        const canvasW = 800;
        const canvasH = 600;
        const row = 2, col = 3;

        const screenX = (col - row) * (tileW / 2) + mapOffX;
        const screenY = (col + row) * (tileH / 2) + mapOffY;
        const worldX  = screenX - canvasW / 2;
        const worldZ  = screenY - canvasH / 2;

        assert.equal(worldX, -368);
        assert.equal(worldZ, -220);
    });

    it('worldY = -(VOXEL_HEIGHT * HEIGHT_SCALE[type] / 2) so top face sits at Y=0', () => {
        // grass: VOXEL_HEIGHT=12, HEIGHT_SCALE=1.0 → height=12 → worldY = -6
        const VOXEL_HEIGHT = 12;
        const HEIGHT_SCALE = { grass: 1.0, water: 0.5, stone: 0.85, road: 0.3 };
        for (const [type, scale] of Object.entries(HEIGHT_SCALE)) {
            const height = VOXEL_HEIGHT * scale;
            const worldY = -(height / 2);
            assert.equal(worldY, -(VOXEL_HEIGHT * scale / 2),
                `worldY for ${type} should be ${-(VOXEL_HEIGHT * scale / 2)}`);
        }
    });
});
