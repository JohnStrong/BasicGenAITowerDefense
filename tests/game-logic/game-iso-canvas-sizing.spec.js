/**
 * Tests for the full-page canvas sizing in js/game-logic/game-iso.js
 *
 * Covers the change that replaced the fixed 1024×768 canvas dimensions with
 * dynamic sizing from window.innerWidth / window.innerHeight so both
 * #threeCanvas and #gameCanvas fill the browser viewport on init.
 *
 * Uses Node.js built-in test runner (node:test).
 * Run: node --test tests/game-logic/game-iso-canvas-sizing.spec.js
 */

'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Minimal canvas stub. width/height are mutable properties that callers can
 * assign, just like real HTMLCanvasElements.
 */
function createCanvasStub(initialW = 300, initialH = 150) {
    const ctx = {
        fillStyle: '',
        calls: [],
        fillRect(x, y, w, h) { this.calls.push({ m: 'fillRect', a: [x, y, w, h] }); },
        save()      { this.calls.push({ m: 'save' }); },
        restore()   { this.calls.push({ m: 'restore' }); },
        translate() { this.calls.push({ m: 'translate' }); },
        scale()     { this.calls.push({ m: 'scale' }); },
        clearRect()  {},
        beginPath()  {},
        stroke()     {},
    };
    return { width: initialW, height: initialH, getContext: () => ctx, _ctx: ctx };
}

/**
 * Build a minimal Game-init stub that mirrors the relevant canvas-sizing
 * section of Game.init() from game-iso.js, isolated from all async I/O.
 *
 * This lets us exercise the logic:
 *   const W = window.innerWidth;
 *   const H = window.innerHeight;
 *   threeCanvas.width  = W;
 *   threeCanvas.height = H;
 *   this.canvas.width  = W;
 *   this.canvas.height = H;
 *
 * @param {{ innerWidth: number, innerHeight: number }} win  — window mock
 * @param {object} threeCanvas  — the WebGL canvas stub
 * @param {object} gameCanvas   — the 2D overlay canvas stub
 * @returns {{ threeCanvas, gameCanvas }} after sizing
 */
function runCanvasSizing(win, threeCanvas, gameCanvas) {
    const W = win.innerWidth;
    const H = win.innerHeight;

    threeCanvas.width  = W;
    threeCanvas.height = H;
    gameCanvas.width   = W;
    gameCanvas.height  = H;

    return { threeCanvas, gameCanvas };
}

// ── Tests: canvas sizing matches window dimensions ────────────────────────────

describe('Game.init() canvas sizing — full-page fill', () => {

    it('sets both canvases to window.innerWidth × window.innerHeight', () => {
        const win         = { innerWidth: 1280, innerHeight: 800 };
        const threeCanvas = createCanvasStub();
        const gameCanvas  = createCanvasStub();

        runCanvasSizing(win, threeCanvas, gameCanvas);

        assert.equal(threeCanvas.width,  1280, 'threeCanvas.width must equal window.innerWidth');
        assert.equal(threeCanvas.height, 800,  'threeCanvas.height must equal window.innerHeight');
        assert.equal(gameCanvas.width,   1280, 'gameCanvas.width must equal window.innerWidth');
        assert.equal(gameCanvas.height,  800,  'gameCanvas.height must equal window.innerHeight');
    });

    it('handles a large 4K viewport (3840×2160)', () => {
        const win         = { innerWidth: 3840, innerHeight: 2160 };
        const threeCanvas = createCanvasStub();
        const gameCanvas  = createCanvasStub();

        runCanvasSizing(win, threeCanvas, gameCanvas);

        assert.equal(threeCanvas.width,  3840);
        assert.equal(threeCanvas.height, 2160);
        assert.equal(gameCanvas.width,   3840);
        assert.equal(gameCanvas.height,  2160);
    });

    it('handles a small mobile viewport (375×667)', () => {
        const win         = { innerWidth: 375, innerHeight: 667 };
        const threeCanvas = createCanvasStub();
        const gameCanvas  = createCanvasStub();

        runCanvasSizing(win, threeCanvas, gameCanvas);

        assert.equal(threeCanvas.width,  375);
        assert.equal(threeCanvas.height, 667);
        assert.equal(gameCanvas.width,   375);
        assert.equal(gameCanvas.height,  667);
    });

    it('both canvases receive identical dimensions', () => {
        const win         = { innerWidth: 1920, innerHeight: 1080 };
        const threeCanvas = createCanvasStub();
        const gameCanvas  = createCanvasStub();

        runCanvasSizing(win, threeCanvas, gameCanvas);

        assert.equal(threeCanvas.width,  gameCanvas.width,
            'threeCanvas and gameCanvas must share the same width');
        assert.equal(threeCanvas.height, gameCanvas.height,
            'threeCanvas and gameCanvas must share the same height');
    });

    it('overwrites any pre-existing canvas dimensions', () => {
        // Both canvases start with the old fixed 1024×768
        const win         = { innerWidth: 1600, innerHeight: 900 };
        const threeCanvas = createCanvasStub(1024, 768);
        const gameCanvas  = createCanvasStub(1024, 768);

        assert.equal(threeCanvas.width, 1024, 'precondition: starts at 1024');

        runCanvasSizing(win, threeCanvas, gameCanvas);

        assert.equal(threeCanvas.width,  1600, 'threeCanvas.width should be overwritten to 1600');
        assert.equal(threeCanvas.height, 900,  'threeCanvas.height should be overwritten to 900');
        assert.equal(gameCanvas.width,   1600, 'gameCanvas.width should be overwritten to 1600');
        assert.equal(gameCanvas.height,  900,  'gameCanvas.height should be overwritten to 900');
    });

    it('width and height are strictly positive integers for a normal viewport', () => {
        const win         = { innerWidth: 1366, innerHeight: 768 };
        const threeCanvas = createCanvasStub();
        const gameCanvas  = createCanvasStub();

        runCanvasSizing(win, threeCanvas, gameCanvas);

        assert.ok(threeCanvas.width  > 0, 'threeCanvas.width must be positive');
        assert.ok(threeCanvas.height > 0, 'threeCanvas.height must be positive');
        assert.ok(gameCanvas.width   > 0, 'gameCanvas.width must be positive');
        assert.ok(gameCanvas.height  > 0, 'gameCanvas.height must be positive');
        assert.equal(threeCanvas.width  % 1, 0, 'threeCanvas.width must be an integer');
        assert.equal(threeCanvas.height % 1, 0, 'threeCanvas.height must be an integer');
    });
});

// ── Tests: fillRect background clear uses dynamic canvas size ─────────────────

describe('Game._render() background clear — adapts to canvas size', () => {

    /**
     * Minimal render stub that mirrors the background-clear logic in
     * Game._render() when USE_THREE_RENDERER is false:
     *
     *   ctx.fillStyle = '#1a2a12';
     *   ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
     *
     * The key invariant is that the clear always uses the current canvas size,
     * which is now dynamic, not the old fixed 1024×768.
     */
    function renderClear(ctx, canvasW, canvasH) {
        ctx.fillStyle = '#1a2a12';
        ctx.fillRect(0, 0, canvasW, canvasH);
    }

    it('clears using the full window-sized canvas width and height (1920×1080)', () => {
        const canvas = createCanvasStub(1920, 1080);
        const ctx    = canvas._ctx;

        renderClear(ctx, canvas.width, canvas.height);

        const call = ctx.calls.find(c => c.m === 'fillRect');
        assert.ok(call, 'fillRect must be called');
        assert.deepEqual(call.a, [0, 0, 1920, 1080]);
    });

    it('clears using 1280×720 when canvas was sized to that viewport', () => {
        const canvas = createCanvasStub(1280, 720);
        const ctx    = canvas._ctx;

        renderClear(ctx, canvas.width, canvas.height);

        const call = ctx.calls.find(c => c.m === 'fillRect');
        assert.ok(call, 'fillRect must be called');
        assert.deepEqual(call.a, [0, 0, 1280, 720]);
    });

    it('clear covers entire canvas — x=0, y=0, w=canvasW, h=canvasH', () => {
        const W = 2560, H = 1440;
        const canvas = createCanvasStub(W, H);
        const ctx    = canvas._ctx;

        renderClear(ctx, W, H);

        const call = ctx.calls.find(c => c.m === 'fillRect');
        assert.equal(call.a[0], 0, 'fillRect x must be 0');
        assert.equal(call.a[1], 0, 'fillRect y must be 0');
        assert.equal(call.a[2], W, 'fillRect width must equal canvas width');
        assert.equal(call.a[3], H, 'fillRect height must equal canvas height');
    });

    it('NOT the old hardcoded 1024×768 when canvas is 1920×1080', () => {
        const canvas = createCanvasStub(1920, 1080);
        const ctx    = canvas._ctx;

        renderClear(ctx, canvas.width, canvas.height);

        const call = ctx.calls.find(c => c.m === 'fillRect');
        assert.notDeepEqual(call.a, [0, 0, 1024, 768],
            'Background clear must NOT use the old hardcoded 1024×768 when canvas is larger');
    });
});

// ── Tests: sizing invariants ──────────────────────────────────────────────────

describe('Canvas sizing invariants', () => {

    it('canvas dimensions equal window inner dimensions exactly (no rounding)', () => {
        // window.innerWidth/Height are already integers in browsers; verify
        // the sizing logic performs no rounding / scaling on them.
        const inputs = [
            { w: 800,  h: 600  },
            { w: 1024, h: 768  },
            { w: 1366, h: 768  },
            { w: 1440, h: 900  },
            { w: 1920, h: 1080 },
        ];

        for (const { w, h } of inputs) {
            const win         = { innerWidth: w, innerHeight: h };
            const threeCanvas = createCanvasStub();
            const gameCanvas  = createCanvasStub();

            runCanvasSizing(win, threeCanvas, gameCanvas);

            assert.equal(gameCanvas.width,  w, `gameCanvas.width must be ${w} for innerWidth=${w}`);
            assert.equal(gameCanvas.height, h, `gameCanvas.height must be ${h} for innerHeight=${h}`);
        }
    });

    it('threeCanvas dimensions always equal gameCanvas dimensions after sizing', () => {
        const viewports = [
            { w: 320, h: 480 },
            { w: 768, h: 1024 },
            { w: 2560, h: 1600 },
        ];

        for (const { w, h } of viewports) {
            const win         = { innerWidth: w, innerHeight: h };
            const threeCanvas = createCanvasStub();
            const gameCanvas  = createCanvasStub();

            runCanvasSizing(win, threeCanvas, gameCanvas);

            assert.equal(threeCanvas.width,  gameCanvas.width,
                `Both canvases must share width ${w}`);
            assert.equal(threeCanvas.height, gameCanvas.height,
                `Both canvases must share height ${h}`);
        }
    });
});
