## Game states (summary)
- Setup Phase — allocate X resources to buy units (archers, scouts, knights) and defenses (battlement towers, walls, wooden stakes). Place purchased items on the map.
- Player Phase — move and act with player pawns (recruits/units): movement up to unit-specific move points, then attacks or interactions.
- Enemy Phase — enemy units move along paths toward the keep/castle and attack player defenses/units.
- Resolve Phase — apply damage, deaths, rewards (gold/resources), and status effects; update health bars.
- End-of-Turn / Maintenance — spawn incomes, decrement cooldowns/effects, check win/lose, possibly start next wave or return to Setup if applicable.

## Core loop (per turn)
1. Start Turn: increment turn counter, refresh move/action points for player units.
2. Player Phase:
   - Player may spend remaining action budget to:
     - Move units (each unit has MovePoints per turn).
     - Attack (if enemy in range/adjacent) or interact with defenses.
     - Build/repair (if allowed in this phase and resources remain).
   - End Player Phase when player ends turn or no actions left.
3. Enemy Phase:
   - Enemy AI moves units along paths (pathfinding if branching).
   - Enemies attack towers/walls/units in range.
4. Resolve Phase:
   - Compute and apply damage simultaneously or in defined order.
   - Remove dead units/structures, award bounty/resources for kills.
5. Maintenance:
   - Apply regen, income, decrement durations.
   - Check win (all enemies defeated & objective) or lose (keep HP ≤ 0).
   - If game continues, loop to Start Turn.

## Unit / defense rules (concise)
- Resources: player starts with X gold; purchases consume gold. Some actions (repair, extra builds) cost gold mid-game.
- Units (example stats):
  - Scout: Move 5 tiles/turn, Attack range 1 (melee), Low HP, low damage, can traverse grass/road/cobble.
  - Archer: Move 3 tiles/turn, Attack range 3 (ranged), Medium HP, medium damage, limited to roads/grass.
  - Knight (mounted): Move 6 tiles/turn on allowed terrain (grass, road, cobble), cannot enter swamp/mountains; Attack range 1, High HP, high damage.
- Movement rules:
  - Each unit has MovePoints per turn; moving into different terrain consumes MovePoints (e.g., road = 1, grass = 1, swamp = 2).
  - Units cannot move through impassable terrain or stacked units unless allowed by rules.
- Attacking:
  - Units may attack once per turn if enemy within range after movement (or before, depending on design).
  - Ranged attacks target enemies within Manhattan/Chebyshev distance depending on grid type.
  - Damage subtracts from HP; display as health bars above units/structures.
- Defenses (example):
  - Battlement Tower: High HP, high resistance, long attack range, costs high; targeted by enemies; repairable.
  - Barricade / Wooden Stakes: Low HP, cheap, blocks path or slows enemies, easy to destroy.
  - Walls: Medium HP, block/slow enemies, may have gate logic.
- Structure HP and damage interactions:
  - Structures have HP bars; some structures have armor value reducing incoming damage by flat or percentage.
  - Destruction of structures can open new paths (enable enemy progress) or remove cover.

## Action & targeting priority
- Player controls targeting manually when selecting attack; otherwise auto-target nearest or priority (closest to goal, highest HP, lowest HP) configurable.
- Enemy targeting: attack nearest structure first or follow AI priority (e.g., break gate -> target towers -> attack units).

## Example numeric defaults (good starting point)
- Starting gold: 200
- Wave income: +20 gold per cleared wave; +5 gold per kill
- Scout: HP 20, Damage 6, Move 5, Cost 40
- Archer: HP 30, Damage 10 (range 3), Move 3, Cost 60
- Knight: HP 60, Damage 18, Move 6 (limited terrain), Cost 120
- Battlement Tower: HP 200, Damage 20 (range 4), Cost 150
- Wall: HP 80, Damage 0, Cost 40
- Wooden Stakes (barricade): HP 35, Damage 0, slowdown +1 turn on crossing, Cost 15

## Health and UI
- Display health bars above units/structures; numeric HP on hover.
- Use color-coded bars (green→yellow→red) and pop damage floats on hit.

## Example flow chart (text)
Start Turn
  ↓
Player Phase
  ├─ Place/Repair/Build? (spend gold)
  ├─ Move selected unit (consume MovePoints)
  └─ Attack if in range
  ↓
Player Ends Turn
  ↓
Enemy Phase
  ├─ Enemy move along path (resolve movement)
  └─ Enemy attack structures/units in range
  ↓
Resolve Phase
  ├─ Apply damage/deaths
  └─ Award gold / spawn effects
  ↓
Maintenance
  ├─ Income / cooldowns / regen
  └─ Win/Lose? → If not, loop to Start Turn

## Notes / decisions to lock early
- Simultaneous vs ordered combat: choose simultaneous (all attacks resolve then deaths applied) for deterministic balance, or ordered (movement → attack) for more tactical timing.
- Movement grid type: square grid recommended for simpler Manhattan/diagonal rules.
- Terrain movement costs: define clearly and show tooltips.
- Allow repairs/builds only in Setup Phase or also during Player Phase (design choice).

If you want, I can produce:
- a small pseudocode game loop implementing the above,
- or a sample JSON for unit/structure definitions with the example defaults. Which would you like?


---

## Canvas Setup

The game uses a two-canvas stacking arrangement, both sized to fill the browser window on init:

```
#canvasContainer (fixed, full-page)
├── #threeCanvas  — Three.js WebGL terrain renderer (behind)
└── #gameCanvas   — 2D Canvas overlay for units, HUD, outlines (on top, transparent background)
```

Both canvases are sized to `window.innerWidth × window.innerHeight` during `Game.init()`. This replaced the previous fixed `1024×768` size so the game fills the browser window at any viewport size.

The `#gameCanvas` 2D context clears to fully transparent each frame (`clearRect`) so the WebGL terrain on `#threeCanvas` shows through. When `USE_THREE_RENDERER = false`, `#threeCanvas` is unused and the dark-green background fill is drawn directly on `#gameCanvas` instead.

---

## Current Implementation Status (as of latest build)

### What's Working
- **Isometric 2.5D map rendering** with camera scroll (WASD), zoom (+/-/wheel), viewpoint rotation (spacebar)
- **Full-page canvas** — both canvases size to `window.innerWidth × window.innerHeight` on load
- **Level loading** from text files with elevation support
- **Tile interaction**: hover highlight (gold border), click to select (lift animation + info panel)
- **Unit system**: resources CSV loaded, unit types mapped to sprites, placement API ready
- **HUD system**: top info bar, bottom-center unit bar, unit detail panel, tile info panel

### Unit Bar (Bottom Center HUD)
Displays all unit types from `levels/default.resources.txt`:

| Unit | Qty | HP | ATK | Armour | Sprites |
|------|-----|-----|-----|--------|---------|
| Archer/Crossbowman | 40 | 100 | 90 | 20% | unit-archer, unit-crossbowman |
| Spearman/Heavy infantry | 30 | 100 | 100 | 50% | unit-spearman, unit-heavy-infantry |
| Men-at-arms | 20 | 100 | 130 | 60% | unit-knight |
| Engineer/Siege crew | 5 | 100 | 50 | 15% | unit-engineer |
| Militia/Watchmen | 5 | 100 | 60 | 10% | unit-militia |

### Action Keys
- **Q** — Attack (placeholder, logic TBC)
- **V** — Defend (placeholder, logic TBC)

### What's NOT Yet Implemented
- Unit placement on map via UI (API exists: `UnitManager.placeUnit()`)
- Turn-based game loop (Setup → Player → Enemy → Resolve → Maintenance)
- Enemy AI / pathfinding
- Combat resolution (damage, deaths, health bars)
- Win/lose conditions
- Gold/resource economy
- Building/repair mechanics
- Multiple waves / level progression
