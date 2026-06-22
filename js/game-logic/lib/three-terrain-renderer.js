/**
 * three-terrain-renderer.js
 *
 * Renders all terrain tiles as 3D voxel blocks via Three.js WebGL.
 *
 * Tile placement: col → X axis, row → Z axis, Y up.
 * Camera: native Three.js OrthographicCamera at isometric angle.
 * Pan: driven by IsoInput scroll keys each frame (not IsoCamera math).
 * Zoom: driven by IsoCamera.zoom.
 */

if (typeof THREE === 'undefined') {
    console.warn('[TTR] THREE not loaded.');
    window.ThreeTerrainRenderer = {
        init() {}, buildTiles() {}, syncCamera() {}, render() {}, destroy() {},
    };
} else {

/* ── Tile dimensions (world units) ───────────────────────────────────────── */
const TW = 80;   // tile width  (X per col)
const TD = 80;   // tile depth  (Z per row)
const BH = 20;   // base voxel height

/* ── Category definitions ────────────────────────────────────────────────── */
const CATS = {
    grass:       { h: 1.00, color: 0x4CAF50 },
    water:       { h: 0.45, color: 0x29B6F6 },
    road:        { h: 0.20, color: 0x8D6E63 },
    stone:       { h: 0.85, color: 0xB0BEC5 },
    castle:      { h: 1.30, color: 0x9E9E9E },
    placeholder: { h: 0.70, color: 0x616161 },
};

function _cat(s) {
    if (!s) return 'placeholder';
    if (s.startsWith('grass-'))  return 'grass';
    if (s.startsWith('water-'))  return 'water';
    if (s === 'road-full')       return 'road';
    if (s === 'rock')            return 'stone';
    if (s.startsWith('castle-') || s.startsWith('bridge-') || s === 'bridge-mm') return 'castle';
    return 'placeholder';
}

/* ── State ───────────────────────────────────────────────────────────────── */
let _renderer = null;
let _scene    = null;
let _cam      = null;
let _canvas   = null;
const _meshes = new Map();

// Camera look-at point (world space). Updated every frame.
const _look = new THREE.Vector3();

// Camera direction: front-left elevated view matching the reference isometric style.
// Camera sits to the front-left slightly above, map reads left→right, depth goes back-right.
// (-1, 1.2, -1) normalised: x=-1 left, z=-1 front, y=1.2 moderate elevation.
const _ISO = new THREE.Vector3(-1, 1.2, -1).normalize();
const _CAM_DIST = 3000;

// Pan velocity (world units per scroll step)
const _PAN_SPEED = TW * 0.8;

/* ── Lighting ────────────────────────────────────────────────────────────── */
function _addLights() {
    _scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(-3, 5, -2);
    _scene.add(sun);
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function _updateCam() {
    _cam.position.copy(_look).addScaledVector(_ISO, _CAM_DIST);
    _cam.lookAt(_look);
    _cam.updateProjectionMatrix();
}

/* ── Public API ──────────────────────────────────────────────────────────── */
window.ThreeTerrainRenderer = {

    init(threeCanvas) {
        if (_renderer) return;
        _canvas = threeCanvas;

        _renderer = new THREE.WebGLRenderer({ canvas: _canvas, antialias: false });
        _renderer.setPixelRatio(1);
        _renderer.setSize(_canvas.width || window.innerWidth, _canvas.height || window.innerHeight, false);
        _renderer.setClearColor(0x4DD0E1, 1);

        _scene = new THREE.Scene();
        _addLights();

        const w = _canvas.width  || window.innerWidth;
        const h = _canvas.height || window.innerHeight;
        const hw = w / 2 / 0.7;
        const hh = h / 2 / 0.7;
        _cam = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 1, 20000);

        // Start looking at origin; buildTiles will recentre
        _look.set(0, 0, 0);
        _updateCam();

        console.log('[TTR] init', w, h);
    },

    buildTiles(tiles) {
        if (!_scene) return;

        // Clear old geometry
        _meshes.forEach(m => {
            _scene.remove(m);
            m.geometry.dispose();
            m.material.dispose();
        });
        _meshes.clear();

        // Group by category
        const groups = new Map();
        tiles.forEach(t => {
            if (t.covered) return;
            const c = _cat(t.sprite);
            if (!groups.has(c)) groups.set(c, []);
            groups.get(c).push(t);
        });

        const dummy = new THREE.Object3D();
        let maxCol = 0, maxRow = 0;

        groups.forEach((list, cat) => {
            const def = CATS[cat];
            const bh  = BH * def.h;
            const mesh = new THREE.InstancedMesh(
                new THREE.BoxGeometry(TW - 2, bh, TD - 2),   // 2px gap between tiles
                new THREE.MeshLambertMaterial({ color: def.color }),
                list.length
            );
            list.forEach((t, i) => {
                if (t.col > maxCol) maxCol = t.col;
                if (t.row > maxRow) maxRow = t.row;
                dummy.position.set(t.col * TW, -bh / 2, t.row * TD);
                dummy.updateMatrix();
                mesh.setMatrixAt(i, dummy.matrix);
            });
            mesh.instanceMatrix.needsUpdate = true;
            _scene.add(mesh);
            _meshes.set(cat, mesh);
        });

        // Centre camera on map
        _look.set((maxCol * TW) / 2, 0, (maxRow * TD) / 2);
        _updateCam();

        console.log('[TTR] built', tiles.length, 'tiles, look at', _look.x.toFixed(0), _look.z.toFixed(0));
    },

    /**
     * Called every frame from game loop.
     * Reads IsoInput for scroll/zoom; does not use IsoCamera pan math.
     */
    syncCamera(isoCamera) {
        if (!_cam || !_canvas) return;

        // Zoom: resize frustum
        const zoom = isoCamera.zoom;
        const hw   = _canvas.width  / 2 / zoom;
        const hh   = _canvas.height / 2 / zoom;
        _cam.left   = -hw;  _cam.right  = hw;
        _cam.top    =  hh;  _cam.bottom = -hh;

        // Pan: move the look-at point along camera-relative screen directions.
        // Compute screen-right and screen-up vectors projected onto the XZ ground plane.
        if (typeof IsoInput !== 'undefined') {
            const { dx, dy } = IsoInput.getScrollDir();
            if (dx || dy) {
                const spd = _PAN_SPEED / zoom;

                // Camera forward direction projected on XZ (ignore Y)
                const fwd = new THREE.Vector3();
                _cam.getWorldDirection(fwd);
                fwd.y = 0;
                fwd.normalize();

                // Screen-right is perpendicular to forward on XZ plane
                const right = new THREE.Vector3(-fwd.z, 0, fwd.x);

                // dx moves along screen-right, -dy moves along screen-forward (up key = dy -1 → move forward into scene)
                _look.x += (right.x * dx - fwd.x * dy) * spd;
                _look.z += (right.z * dx - fwd.z * dy) * spd;
            }
        }

        _updateCam();
    },

    render() {
        if (_renderer && _scene && _cam) _renderer.render(_scene, _cam);
    },

    destroy() {
        _meshes.forEach(m => {
            _scene && _scene.remove(m);
            m.geometry.dispose();
            m.material.dispose();
        });
        _meshes.clear();
        _renderer && _renderer.dispose();
        _renderer = _scene = _cam = _canvas = null;
    },
};

} // end THREE block
