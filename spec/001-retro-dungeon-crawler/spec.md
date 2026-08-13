# Feature Specification: Retro Dungeon Crawler RPG

**Feature Branch**: `001-retro-dungeon-crawler`

**Created**: 2026-06-15

**Status**: Draft

**Input**: User description: "build a birdseye-view retro dungen-crawler RPG game with map being generated as the play progresses"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Dungeon Exploration (Priority: P1)

A player opens the game in their browser and is placed at the entrance of a dungeon. They move their character around using keyboard controls. As they step into unexplored areas, new rooms and corridors are revealed — the map expands dynamically. Previously visited areas remain visible; unvisited areas remain shrouded in fog.

**Why this priority**: This is the defining mechanic of the game. Without procedural map generation tied to player movement, nothing else is meaningful.

**Independent Test**: Can be fully tested by moving through the dungeon and confirming that new tiles are revealed only upon approach, and that the total map grows as movement continues — delivers the core exploration loop with no other feature needed.

**Acceptance Scenarios**:

1. **Given** the game just loaded, **When** the player views the screen, **Then** only the starting room (or immediate surroundings) is visible and the rest of the dungeon is hidden — hidden tiles still occupy space in the grid as black squares, preserving the grid layout, but show no content.
2. **Given** the player is at the edge of the revealed map, **When** they move in a direction, **Then** new tiles (rooms/corridors) are generated and revealed in that direction.
3. **Given** the player has explored an area and returned, **When** they view the map, **Then** previously revealed tiles remain visible.
4. **Given** the player is adjacent to a wall, **When** they attempt to move into it, **Then** movement is blocked and no new tiles are generated.
5. **Given** the player presses a movement key, **When** the input is processed, **Then** the player moves exactly one tile in that direction.
6. **Given** the user opens `index.html` directly from the filesystem via `file://` protocol, **When** the browser loads the page, **Then** the game launches and is playable with no server, no external network requests, and no console errors.

---

### User Story 2 - Enemy Combat (Priority: P2)

A player exploring the dungeon walks into a room containing enemies. A turn-based combat exchange begins: the player attacks, then all enemies in range respond. If the player's HP reaches zero, a game-over screen is shown. If an enemy's HP reaches zero, it is removed from the map. Players learn to manage risk by avoiding overwhelm.

**Why this priority**: Combat is the primary tension driver. Without it, exploration has no stakes and the game lacks challenge.

**Independent Test**: Can be fully tested by navigating to a room with enemies and fighting until either the player dies or the enemies are defeated — delivers a full risk/reward loop.

**Acceptance Scenarios**:

1. **Given** the player enters a room, **When** an enemy is present in that room, **Then** the enemy is visible on the map.
2. **Given** the player attempts to move into an enemy-occupied tile, **When** the player takes their turn, **Then** the player deals damage to the enemy (the enemy's HP decreases) and the player remains on their current tile.
3. **Given** an enemy is alive after the player's turn, **When** it is the enemy's turn, **Then** the enemy moves toward or attacks the player.
4. **Given** the player's HP drops to zero, **When** the update resolves, **Then** a game-over screen is displayed with the floor reached and enemies defeated.
5. **Given** an enemy's HP drops to zero, **When** the update resolves, **Then** the enemy is removed from the map and has a 25% chance to drop a random item (potion, weapon, or armor) on its tile.

---

### User Story 3 - Character Progression & Items (Priority: P3)

As the player defeats enemies and finds items scattered in dungeon rooms, they collect weapons, potions, and armor. Using a potion restores HP. Equipping a better weapon increases attack damage. This allows players to make meaningful choices about risk and resource management across a run.

**Why this priority**: Items give depth to the exploration loop and create run-to-run variety. The game is playable without them but becomes repetitive.

**Independent Test**: Can be fully tested by picking up an item, verifying it appears in the player's inventory, and using/equipping it to confirm a stat change.

**Acceptance Scenarios**:

1. **Given** an item is present on the dungeon floor, **When** the player moves onto the item tile, **Then** the item is added to the player's inventory.
2. **Given** the player has a health potion in inventory, **When** they open the inventory screen (`I`), select the potion, and press `Enter`, **Then** their HP increases (up to max HP) and the potion is consumed.
3. **Given** the player has a weapon in inventory better than their current weapon, **When** they open the inventory screen (`I`), select the weapon, and press `Enter`, **Then** their attack power increases accordingly.
4. **Given** the player has armor in inventory better than their current armor, **When** they open the inventory screen (`I`), select the armor, and press `Enter`, **Then** their defense increases accordingly.
5. **Given** the player's inventory is displayed, **When** the player views it, **Then** all held items with their effects are listed.

---

### User Story 4 - Floor Descent (Priority: P4)

Once the player finds the staircase on a floor, they can descend to a deeper dungeon floor. The next floor is a freshly generated dungeon with more and stronger enemies. The player retains their stats and inventory between floors. This continues until the player dies (permadeath — no save between sessions).

**Why this priority**: Floor progression adds long-term structure and escalating challenge. It is the roguelike loop that gives the game replayability.

**Independent Test**: Can be fully tested by finding and activating the staircase tile, which transitions to a new floor with increased difficulty and the player's current stats intact.

**Acceptance Scenarios**:

1. **Given** the player reaches the staircase tile on the current floor, **When** they step onto it, **Then** a new dungeon floor is generated and the player is placed at its entrance. If the current floor is floor 9, the victory screen appears instead and no new floor is generated.
2. **Given** the player descends to the next floor, **When** the new floor loads, **Then** the player retains the same HP, inventory, and level as before descending.
3. **Given** the player is on floor N, **When** they descend, **Then** enemies on floor N+1 have higher base stats than enemies on floor N.
4. **Given** the player dies on any floor, **When** game-over is shown, **Then** the run ends and the player must restart from floor 1.

---

### User Story 5 - Test Scenario Dungeon (Priority: P5, testing-only)

**Note**: This user story exists solely to enable deterministic automated testing of game behaviors that require reaching specific entities (enemies, items, stairs). It does not affect normal gameplay. Implementations that do not support this scenario will have those automated tests fail.

When the game is loaded with the seed `99999`, floor 1 MUST produce a minimal, deterministic dungeon layout consisting of exactly four rooms arranged in a hub pattern around a central starting room. The player starts in Room A (safe, no enemies, no items). Three corridors branch from Room A to three independently accessible rooms: Room B (right, containing a single Goblin enemy and eleven items for combat, item-pickup, and inventory-cap tests where the player must survive and can fully fill and overflow the 10-slot inventory without leaving the room), Room C (down, containing three Goblin enemies for game-over and restart tests where the player must be defeated), and Room D (up, containing only the staircase for descent tests where the player must reach stairs without combat). Each room is reachable directly from Room A via its own corridor — the player does not pass through one room to reach another. Floors 2 and above use normal procedural generation per FR-017/FR-020.

**Why this priority**: Testing-only. Enables automated verification of combat, item pickup, equipment, floor descent, game-over, and restart without relying on exploration of a randomly generated dungeon.

**Independent Test**: Load the game with `?seed=99999`. Walk right to find 1 enemy and items in Room B. Walk down to find 3 enemies in Room C. Walk up to find stairs in Room D. All within 30 steps from the starting position.

**Acceptance Scenarios**:

1. **Given** the game is loaded with `?seed=99999`, **When** floor 1 is generated, **Then** the dungeon consists of exactly four rooms connected by corridors in a hub pattern — no additional rooms, corridors, or branches.
2. **Given** seed 99999 on floor 1, **When** the player walks right from the starting position, **Then** they enter Room B within 20 keypresses.
3. **Given** Room B is entered with seed 99999, **When** the player views the room, **Then** one Goblin enemy and eleven items (a mix of health potions, weapons, and armor, including at least one of each type) are present and visible. No staircase is present.
4. **Given** seed 99999 on floor 1, **When** the player walks down from the starting position, **Then** they enter Room C within 20 keypresses.
5. **Given** Room C is entered with seed 99999, **When** the player views the room, **Then** three Goblin enemies are present and visible. No items and no staircase are present.
6. **Given** seed 99999 on floor 1, **When** the player walks up from the starting position, **Then** they enter Room D within 20 keypresses.
7. **Given** Room D is entered with seed 99999, **When** the player views the room, **Then** one staircase tile is present and visible. No enemies and no items are present.
8. **Given** seed 99999 on floor 1, **When** the player steps on the staircase in Room D, **Then** floor 2 is generated using normal procedural generation (not the test layout).
9. **Given** seed 99999 on floor 1, **When** the player explores all four rooms, **Then** each room contains only its designated entities: Room A has no enemies, no items, and no stairs; Room B has exactly 1 enemy and 11 items but no stairs; Room C has exactly 3 enemies but no items and no stairs; Room D has exactly 1 staircase but no enemies and no items. No entity is misplaced in the wrong room.

---

### Edge Cases

- What happens when the player attempts to move into a wall or outside the dungeon boundary? Movement is blocked and no position change occurs.
- How does the system handle an inventory that is full when the player steps on an item? The item remains on the floor; the player receives a notification that inventory is full.
- What happens if a player is surrounded by enemies with no viable escape? Combat continues turn-by-turn until the player dies or uses a consumable to break out.
- What happens if random generation produces a disconnected room with no path to stairs? The generation algorithm guarantees all rooms are connected via corridors.
- What happens if two enemies attempt to move to the same tile on the same turn? The first enemy in iteration order moves; the second enemy's move is blocked and it stays in place.
- Can multiple items occupy the same floor tile? No — each floor tile may contain at most one item. Item generation skips occupied tiles.
- What happens if a player presses multiple movement keys simultaneously? Only the last keypress before the turn resolves is processed; all others are ignored.
- What happens if a potion is used at full HP? The potion is consumed and HP remains at max — no overflow, no prevention of use.
- What happens on page refresh during combat? The run is lost; a new run starts from floor 1 with fresh stats. This is the permadeath assumption.
- What happens if a room has no valid enemy placement tiles (all occupied by items or staircase)? The room simply has zero enemies — this is acceptable and not an error condition.
- What happens when an enemy (activated or patrolling) moves onto a tile containing a floor item? The enemy ignores the item — it passes over the tile with no effect; the item remains on the ground for the player to pick up.
- Can enemies move onto the staircase tile? No — the staircase tile is treated as non-walkable for all enemy movement (both patrol and pursuit). This ensures the descent path is never blocked by an enemy camping the stairs.

---

### User Story 6 - Inlined Artifact Smoke Test (Priority: P1)

<!--
Cross-reference index — each scenario below re-asserts an existing behavior,
but against the shipped inlined artifact (not the dev ES-module source).
Update this index when scenarios are added/removed.

  US6-S1  load + focus  ← re-asserts  US1-AS6, SC-007, FR-014, FR-030, FR-036
  US6-S2  Room A render ← re-asserts  US5-AS1, US5-AS9, R100, R102, FR-012
  US6-S3  cardinal move ← re-asserts  US1-AS2, US1-AS5, FR-004, FR-027
  US6-S4  wall blocked  ← re-asserts  US1-AS4
  US6-S5  Room B reach  ← re-asserts  US5-AS2, US5-AS3, FR-006, FR-032
  US6-S6  shippability  ← re-asserts  SC-007, FR-014, FR-036, Constitution Pr. III

Test driver: Playwright (dev-only dependency; excluded from the shipped
artifact per FR-036). Runs against the post-inline index.html, NOT the
dev ES-module source.
-->

The shipped game artifact is a single `index.html` with all JS inlined in a
non-module script block (per FR-014 and the 2026-06-25 clarification). The
dev source uses ES modules for vitest; the inlining step that produces the
shipped artifact is a seam that MUST be guarded by an integration test. No
unit test against the ES-module source can substitute, because the failure
modes unique to inlining (global name collisions, dropped module boundaries,
missing DOM elements, script-order regressions) are invisible to module-imported
tests.

**Why this priority**: If the inlined artifact does not render and accept input,
no other acceptance scenario is exercisable. This is the shippability gate.

**Independent Test**: Open the shipped `index.html` via `file://` in a headless
browser (Playwright), inject `?seed=99999`, and verify the test-dungeon layout
renders and that keyboard movement changes player position and reveals tiles —
with zero console errors. Requires no other feature. Playwright is a dev-only
test dependency and is NOT bundled into the shipped artifact, preserving
FR-014 (no external network requests at runtime) and FR-036 (shipped artifact
contains no test code or test-only dependencies).

**Acceptance Scenarios**:

1. **Given** the shipped `index.html` (the inlined artifact, not the dev ES-module source), **When** it is loaded via `file://` with `?seed=99999` in a headless browser, **Then** the page renders within 2 seconds with no `console.error` or uncaught exceptions, and the dungeon grid container holds focus and responds to keyboard events without a mouse click. *(Re-asserts US1-AS6, FR-014, FR-030.)*
2. **Given** the inlined artifact loaded with `?seed=99999`, **When** the starting room is inspected, **Then** the rendered grid shows the Room A hub layout from User Story 5 (player glyph `@` visible, surrounding tiles lit within the 5-tile sight radius, hidden tiles rendered as black/fog). *(Re-asserts US5-AS1, US5-AS9, R100, R102.)*
3. **Given** the inlined artifact loaded with `?seed=99999`, **When** the player presses a cardinal movement key (W/A/S/D or arrow) toward an unexplored corridor, **Then** the player's position changes by exactly one tile and newly-in-sight tiles transition from hidden to lit. *(Re-asserts US1-AS2, US1-AS5, FR-004.)*
4. **Given** the inlined artifact loaded with `?seed=99999`, **When** the player attempts to move into a wall tile, **Then** the player's position does not change and no console error is emitted. *(Re-asserts US1-AS4.)*
5. **Given** the inlined artifact loaded with `?seed=99999`, **When** the player moves right through the corridor into Room B, **Then** a Goblin glyph (`g`) and item glyphs become visible within 20 keypresses — confirming the test dungeon's entity placement is intact in the shipped artifact. *(Re-asserts US5-AS2, US5-AS3, FR-006, FR-032.)*
6. **Given** any of scenarios 1-5 fails, **When** the integration test reports, **Then** the build/inline step is treated as broken and no artifact is considered shippable regardless of the vitest suite status. *(Re-asserts SC-007, FR-014, FR-036, Constitution Principle III.)*

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render the dungeon as a top-down, 2D grid-based map where each cell is a tile (wall, floor, staircase, or empty/fog). Tiles MUST be arranged in horizontal rows and vertical columns.
- **FR-002**: System MUST reveal dungeon rooms via fog-of-war as the player moves, using pre-generated floor data — the exploration effect is achieved through fog, not incremental generation; the entire floor is generated at floor entry.

- **FR-003**: System MUST apply a fog-of-war mechanic: tiles the player has never visited are hidden; tiles within a defined sight radius of the player are visible; tiles previously visited but outside sight radius are dimmed (seen but not actively lit). Fog-of-war state MUST reset to fully hidden when the player descends to a new floor — no visited-tile memory carries over between floors.

- **FR-004**: System MUST support player movement via keyboard (WASD and/or arrow keys), advancing one tile per keypress. Movement is 8-directional (cardinal and diagonal) — diagonal movement is triggered by pressing two directional keys simultaneously (e.g., W+A = up-left).

- **FR-005**: System MUST track and display the player's current HP, max HP, attack power, defense, level, and floor number on a HUD visible at all times during gameplay. Attack power and defense MUST reflect the player's base stats plus any equipped weapon or armor bonuses, allowing the player to observe stat changes when equipping items.

- **FR-006**: System MUST place enemies in generated rooms according to floor difficulty, excluding the starting room (the player spawn room MUST contain zero enemies). The staircase room is NOT excluded and follows normal enemy placement rules. Enemy count per non-starting room is 1-3, randomly determined. Enemy stats (HP, attack, defense) scale linearly with floor number per the formulas in the Enemy entity definition. Enemy type is determined by floor range: Goblin (floors 1-3), Orc (floors 4-6), Wraith (floors 7-9).

- **FR-007**: System MUST resolve combat in turns: the player attacks by attempting to move into an enemy-occupied tile — there is no separate attack command or key. The player deals damage to the enemy, the enemy's HP decreases, and the player does not move onto the tile (stays in place). After the player's action, surviving activated enemies respond by moving toward or attacking the player.

- **FR-008**: System MUST end the current run and display a game-over screen when the player's HP reaches zero, showing the floor reached and total enemies defeated. The screen MUST display a "Press R to restart" prompt and restart the run from floor 1 when the player presses `R`.

- **FR-009**: System MUST allow the player to pick up items by moving onto item tiles; items are added to an inventory capped at 10 slots.

- **FR-010**: System MUST support at least three item types: health potions (restore HP), weapons (increase attack), and armor (increase defense).

- **FR-011**: System MUST place one staircase tile per floor that, when stepped on, generates a new deeper floor and transitions the player to it with their current inventory and stats. Descent occurs immediately upon stepping on the staircase — there is no combat restriction; enemies do not take a turn on the round the player descends. If the current floor is floor 9, the victory screen appears instead (per R101).

- **FR-012**: System MUST render all game visuals using a retro aesthetic with ASCII glyphs or simple tile characters for all entities (e.g., `@` for player, `g` for goblin, `#` for wall, `.` for floor). The color palette is limited: walls and fog-of-war use grey tones, while entities (player, enemies, items) use distinct colors per R102.

- **FR-013**: System MUST guarantee all generated rooms on a floor are reachable from the player's starting position via corridors.

- **FR-014**: System MUST run entirely in a browser with no server, no build step, and no external network requests. The shipped game artifact MUST be a single file named `index.html` located at the root of the implementation project directory (i.e. `<impl>/index.html`), and MUST be launchable by opening that file directly from the filesystem via `file://`. No subdirectory, no alternate filename, and no path suffix is permitted for the shippable artifact. Target browsers: Chrome 90+, Firefox 88+, Safari 14+.

### Key Entities

- **Player**: Position (x, y), current HP (starts at 20), max HP (20), attack power (starts at 5), defense (starts at 1), level (starts at 1, equals floor number), floor number, inventory (ordered list of items, max 10).
- **Tile**: Grid cell type — one of: wall, floor, staircase-down, empty/fog. Items on the ground are rendered as an overlay on a floor tile (the underlying tile type remains floor); "item-ground" is a render state, not a distinct tile type. Visibility state: hidden, dimmed, lit.
- **Room**: Rectangular region of floor tiles within the 80×80 grid with a width and height; linked to adjacent rooms via corridors.
- **Corridor**: Horizontal or vertical strip of floor tiles connecting two rooms.
- **Enemy**: Position (x, y), HP, max HP, attack, defense, type label, glyph character. Enemy types scale by floor: Goblin (glyph `g`, floors 1-3), Orc (glyph `o`, floors 4-6), Wraith (glyph `w`, floors 7-9). Stats are formula-based per floor: `HP = 10 + floor * 5`, `attack = 3 + floor * 2`, `defense = floor`. Behavior: move toward player one tile per turn when activated (room-wide aggro on player entry), attack when adjacent (8-directional, including diagonals). Damage dealt follows the standard formula: `max(1, attack - target.defense)`.
- **Item**: Type (potion/weapon/armor), effect value (HP restored / attack bonus / defense bonus), glyph character. May be on the ground (has position) or in inventory (no position). Item effect values scale with floor number: potion HP restore = `10 + floor * 5`; weapon attack bonus = `floor + random(0..2)`; armor defense bonus = `floor + random(0..2)`. Floor item placement count is 1-3 items per floor, randomly determined, placed on random walkable floor tiles (excluding staircase and occupied tiles per FR-025). Enemy drop items use the same bonus formulas based on the floor where the enemy died.
- **Run**: A single playthrough session — starts at floor 1, ends on player death. No persistence between browser sessions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The dungeon map visibly expands as the player moves into previously unvisited areas — new rooms and corridors appear for every exploratory step, with no pre-revealed content beyond the starting position.
- **SC-002**: All generated rooms on a floor are connected and walkable — every room is reachable from the player's starting position without passing through walls.
- **SC-003**: A combat encounter between the player and a single enemy resolves (enemy dies or player dies) within 20 turns without any state inconsistency.
- **SC-004**: Players can complete a full run (floors 1 through death or victory on floor 9) with game state remaining consistent: HUD always displays current HP/max HP/level/floor; no enemy entities exist outside their room's enemy list; all rooms remain reachable via corridors throughout the run.
- **SC-005**: The game renders and accepts input at 60 FPS with input-to-render latency under 16ms on a modern desktop browser (Chrome 90+, Firefox 88+, Safari 14+) at any point during a session, including after 10+ floors of exploration. The 80×80 grid must render without exceeding a single frame budget per turn update.
- **SC-006**: A new player with no instructions can identify the objective (reach the stairs, survive enemies) within 60 seconds of first opening the game. The HUD MUST display a one-line control hint on floor 1: "WASD/Arrows to move · I for inventory · Reach > to descend" until the player descends to floor 2, after which the hint is hidden.
- **SC-007**: The game loads and renders floor 1 within 2 seconds of opening `index.html` via `file://` protocol, with zero console errors and zero external network requests. The shipped game artifact MUST NOT require a local server, a build step, or any tooling to launch.
- **SC-008**: The shipped inlined `index.html`, loaded via `file://` with `?seed=99999` in a headless browser (Playwright), renders the test dungeon and accepts cardinal movement that changes player position and reveals tiles, with zero console errors. This integration test MUST run against the post-inline artifact (not the dev ES-module source) and MUST pass for the artifact to be deemed shippable. It guards the dev-source → shipped-artifact seam required by Constitution Principle III. *(Exercised by User Story 6 acceptance scenarios.)*

## Assumptions

- Single-player only; no multiplayer or networked features.
- Roguelike permadeath: no save file, no mid-run resume between browser sessions. State resets on page reload.
- Turn-based movement and combat: game state only advances when the player takes an action (moves or attacks).
- Keyboard-only controls; no mouse interaction required for core gameplay.
- Retro aesthetic means ASCII-style character glyphs on a black background — no sprite images, no external art assets. Limited entity-color palette per R102 (walls and staircase grey, fog dark grey, player white, enemies brown, items light blue).
- Procedural generation per floor entry: the entire floor (all rooms, corridors, stairs) is generated at the moment the player enters the floor — synchronously, with no loading state. Fog-of-war then reveals tiles progressively as the player moves, creating the appearance of incremental exploration.
- Enemy AI moves activated enemies one tile per turn toward the player; enemies activate on room entry (room-wide aggro) per R103.
- Maximum floor depth is 10; stepping on the staircase on floor 9 triggers the victory screen immediately — no floor 10 is generated.
- No audio in v1; a silent game is acceptable.
- Inventory cap of 10 items; full inventory silently refuses new pickups with a message in the HUD log.
- All randomness is seeded per run. If a `seed` URL query parameter is present (e.g., `?seed=12345`), that value is used as the run seed; otherwise the seed is auto-generated at run start. All RNG calls (floor generation, enemy placement, item generation, item drops) use this seed, making a run fully reproducible given the same seed. The seed value is displayed on the game-over and victory screens.

## Clarifications

- **Rendering Backend** → DOM/CSS character grid (100% weighted, D1)
- **Player Leveling Mechanic** → Level = floor number (display only, no XP system) (100% weighted, D2)
- **Map Generation Algorithm** → BSP partitioning (rectangular rooms, connectivity by construction) (100% weighted, D4)
- **Combat Feedback Channel** → One-line HUD log per event ('You hit Goblin for 4. Goblin hits you for 2.') (100% weighted, D6)
- **Fog-of-War Sight Radius** → 5 tiles (balanced / standard roguelike) (100% weighted, D3)
- **Victory Condition on Floor 10** → Stepping on staircase on floor 9 triggers victory screen immediately; no floor 10 generated (100% weighted, D5, clarified 2026-06-23)
- **Terminal Color Palette** → Limited entity-color palette: walls and staircase grey, fog dark grey, player white, enemies brown, items light blue on black (overrides D7 green-on-black, 2026-06-23; staircase color clarified 2026-07-14)
- **Enemy Engagement Rule** → Room-wide aggro: all room enemies activate on player entry (100% weighted, D8)

### Session 2026-06-23

- Q: How does the player use/equip inventory items during gameplay? → A: Press `I` to open inventory, arrow keys to select, `Enter` to use/equip, `Esc` to close
- Q: What are the dungeon grid dimensions per floor? → A: 80×80 tiles
- Q: How is combat damage calculated? → A: `max(1, attacker.attack - defender.defense)` — deterministic, minimum 1
- Q: What pathfinding algorithm do enemies use? → A: Greedy step with wall-sliding — try primary axis, if blocked try secondary axis
- Q: What are the player's starting stats? → A: HP 20, Attack 5, Defense 1
- Q: Override D7 color palette — should the game use green-on-black or a limited entity-color palette? → A: Limited palette — walls grey, fog dark grey, player white, enemies medium light brown, items light blue on black background

### Session 2026-06-26

- Q: Do activated enemies pursue indefinitely or do they deactivate/return to their room? → A: Pursue indefinitely — no deactivation, no room confinement; enemies follow through corridors until death
- Q: Do unactivated enemies move before the player enters their room? → A: Idle patrol — unactivated enemies move randomly within their spawning room each turn
- Q: Can enemies pick up or destroy floor items by walking over them? → A: No — enemies ignore floor items; items remain untouched for the player
- Q: Can enemies move onto the staircase tile? → A: No — stairs are non-walkable for enemy movement; descent path is never blocked
- Q: Does FR-026 collision resolution apply to patrol movement too? → A: Yes — iteration-order collision applies to all enemy movement; one enemy per tile at all times
- Q: Is tile adjacency 4-directional or 8-directional (including diagonals)? → A: 8-directional (Chebyshev) — diagonals count as adjacent for movement, combat, fog-of-war, and patrol
- Q: Do enemies attack instead of moving when adjacent to the player? → A: Yes — adjacent enemies attack and do not move that turn
- Q: How does the player restart after game-over or victory? → A: Press `R` key — screen shows "Press R to restart" prompt
- Q: Can the player move diagonally or only cardinally? → A: 8-directional — diagonal via two-key combos (e.g., W+A = up-left)
- Q: How does FR-027 (last keypress only) interact with simultaneous diagonal keys? → A: Simultaneous keys = diagonal move; sequential keys = last-wins (FR-027 applies to sequential only)
- Q: Can the starting room contain enemies on floor entry? → A: No — starting room never contains enemies (safe spawn)
- Q: What happens when `?seed=` is present but non-integer (e.g. `?seed=abc`)? → A: Fall back to `Date.now()` auto-seed (ignore invalid value)
- Q: Can the staircase room contain enemies? → A: Yes — staircase room follows normal 1-3 enemy rules
- Q: Does fog-of-war state reset when the player descends to a new floor? → A: Yes — fresh fog state per floor (reset on descent)

### Session 2026-06-25

- Q: How will tests be written and run given the tension between constitution Principle II (TDD non-negotiable) and FR-014 (no build step, no external dependencies)? → A: Tests in Node + vitest importing game ES modules; game itself ships build-free
- Q: How many lines should the HUD combat log retain to avoid unbounded memory growth on long runs? → A: Rolling buffer: last 50 lines retained, older lines discarded
- Q: How are item bonuses and floor item counts determined to ensure progression balance? → A: Bonuses scale with floor number; 1-3 items per floor
- Q: How is the constitution's structured logging requirement (Principle IV) satisfied separately from the player-facing HUD log? → A: Structured logs via `console` (DevTools-only, invisible to players)
- Q: Should the run seed be exposed for testing/reproducibility per constitution Principle V? → A: Seed settable via URL param (`?seed=N`) and shown on game-over screen
- Q: How is the cross-requirement tension between FR-014 (no server, file:// launch) and FR-036 (ES modules importable by browser) resolved? → A: Dev source uses ES modules for vitest; shipped index.html inlines all JS in a non-module script block (no import/export), since browsers block ES modules over file://
- Q: Where must the final shippable game artifact live within an implementation project? → A: At the project root as `<impl>/index.html` — no subdirectory, no alternate filename. The artifact is opened directly via `file://<impl>/index.html`. This is the path SC-007/SC-008 and the Playwright runner target. (Resolved 2026-07-09.)

### Session 2026-07-10

- Q: Does "grid-based map" (FR-001) / "character grid" (FR-015) require a 2D visual layout, or is a 1D strip of all tiles in a single row acceptable? → A: 2D visual layout is mandatory. Tiles MUST be arranged in rows and columns. A flat 1D strip of 6400 tiles in one horizontal row is not a grid. This was observed in a generated implementation that placed all tiles in a single flex row, causing the player glyph to render ~37000px off-screen with nothing visible in the viewport. FR-001 and FR-015 have been amended to make the 2D requirement explicit.
- Q: Does FR-034 (player centered) require scrollability in both axes? → A: Yes. When the 80×80 grid exceeds the viewport, the grid MUST be scrollable in both horizontal and vertical axes, and the player MUST be within the visible portion of the grid on initial load and after every turn. FR-034 has been amended to state this explicitly.

### Session 2026-07-14

- Q: What color should the staircase glyph `>` be rendered in? R102 specifies colors for walls, fog, player, enemies, and items but does not mention the staircase, while also stating "no other foreground colors are permitted." → A: The staircase MUST be rendered in grey (same as walls). This resolves the ambiguity where some implementations rendered the staircase in light blue (the item color), causing the test suite's item detector to misidentify the staircase as an item — a false failure in P1-21 ("Room D should have no items"). R102 and the Terminal Color Palette clarification have been amended accordingly.


## Requirements

- **FR-015**: System MUST render the dungeon as a 2D character grid where each tile displays a single glyph character.

- **FR-016**: System MUST display the player's 'Level' on the HUD as the current floor number (e.g., floor 3 → Level 3); there is no XP accumulation, no level-up event, and no stat change on level increase — the value is display-only.

- **FR-017**: System MUST generate dungeon floors procedurally with rectangular rooms connected by corridors, guaranteeing full connectivity from the player's starting position. Generation MUST complete with no loading state visible to the player.

- **FR-018**: System MUST display all combat events as one-line messages appended to a persistent HUD log area (e.g., 'You hit Goblin for 4. Goblin hits you for 2.'); each event appends a new line; no modal dialogs or overlays are used for combat feedback. The HUD log MUST retain at most the last 50 lines in a rolling buffer — when a new line is appended beyond 50, the oldest line is removed. The log area displays only the most recent lines that fit within the 3-line header height constraint (per FR-033); older retained lines are accessible via scroll but do not increase header height.
- **FR-019**: System MUST provide an inventory screen toggled by pressing `I`: while open, the game loop pauses, arrow keys move a selection cursor through the 10 inventory slots, `Enter` uses the selected item (consume potion / equip weapon or armor), and `Esc` closes the inventory screen and resumes the game. Equipping a weapon or armor is a swap operation: the selected item moves to the equipped slot and the previously equipped item moves into the freed inventory slot — equipping always succeeds regardless of inventory occupancy.

- **FR-020**: System MUST generate each dungeon floor on a fixed grid of 80×80 tiles; all rooms, corridors, and entities MUST fit within this grid.

- **FR-021**: System MUST calculate combat damage as `max(1, attacker.attack - defender.defense)`: every attack deals at least 1 damage regardless of defense; the formula is deterministic with no random variance.

- **FR-022**: System MUST move activated enemies one tile per turn toward the player (8-directional, including diagonals). If the preferred tile is blocked, the enemy MUST attempt an alternate adjacent tile; if no viable move exists, the enemy stays in place. No pathfinding or precomputed routes are used. If an activated enemy is already adjacent to the player at the start of its turn, it attacks instead of moving — the enemy deals damage per FR-021 and does not change position that turn.

- **FR-023**: System MUST initialize a new player with the following base stats: HP 20 (max HP 20), Attack 5, Defense 1, Level 1 (floor 1). These values persist across floor descents and are modified only by equipped items.

- **FR-024**: System MUST designate one random room as the starting room (player spawn point at room center) and a different random room for the staircase. The starting room and staircase room must not be the same room.

- **FR-025**: System MUST place at most one item per floor tile — item generation skips tiles that already contain an item or the staircase.

- **FR-026**: System MUST resolve enemy movement collisions by iteration order: the first enemy to claim a tile moves there; subsequent enemies targeting the same tile treat it as blocked and stay in place. This rule applies to ALL enemy movement — both activated pursuit and idle patrol. One enemy per tile is enforced at all times; tile stacking is never permitted.

- **FR-027**: System MUST process only the last keypress when multiple movement keys are pressed sequentially before a turn resolves; all prior queued keypresses are discarded. However, when two directional keys are pressed simultaneously (held at the same time), they are recognized as a single combined diagonal movement input, not as two sequential presses.

- **FR-028**: System MUST complete floor generation for an 80×80 grid within 50ms with no loading screen or async operation required.

- **FR-029**: System MUST maintain stable rendering performance throughout a 10-floor session — no rendering resources may grow unboundedly as the player explores. Total memory footprint MUST remain under 50MB for a 10-floor session.

- **FR-030**: System MUST provide visible focus feedback: the tile grid container maintains browser focus and responds to keyboard input without requiring mouse clicks. No screen reader support is required for v1.

- **FR-031**: *(Deferred to plan — wall thickness between adjacent rooms is an implementation detail of the generation algorithm.)*

- **FR-032**: System MUST display each alive enemy on the map as its glyph character (e.g., `g`, `o`, `w`) when the enemy's tile is within the player's current sight radius (R100). Enemies outside the player's sight radius MUST NOT be displayed — previously visited tiles show only terrain (floor, walls, stairs), not enemies that may have since moved. Dead enemies MUST NOT be displayed. This requirement elaborates FR-012 for the specific case of enemy entity visibility.

- **FR-033**: System MUST display the game in a viewport-adaptive layout: a compact header (max 3 lines tall) containing player stats and combat log in a left column and controls hint in a right column, followed by the dungeon grid filling the remaining viewport space. The header MUST NOT exceed 3 lines of height regardless of viewport size. The dungeon grid MUST fill the remaining viewport after the header and be horizontally centered. The grid MUST retain scroll functionality without visible scrollbars.

- **FR-034**: System MUST keep the player centered in the visible dungeon grid area when the full 80×80 grid is larger than the viewport. The grid MUST be scrollable in both horizontal and vertical axes. The view MUST update after every player move and after every enemy turn so the player remains visible at all times. The player MUST be within the visible portion of the grid on initial load and after every turn.

- **FR-035**: System MUST display inventory, game-over, and victory screens as full-viewport overlays that completely cover the game when active, and MUST be fully invisible (not occupying layout space, not visible at all) when inactive.

- R100: System MUST apply a fog-of-war sight radius of exactly 5 tiles using 8-directional (Chebyshev) distance: tiles within a 5-tile Chebyshev radius of the player's current position are fully lit; tiles beyond 5 tiles that have been previously visited are rendered dimmed; tiles beyond 5 tiles that have never been visited remain hidden.
- R101: System MUST trigger the victory screen immediately when the player steps on the staircase tile on floor 9 — no floor 10 dungeon is generated or rendered. The staircase transition on floor 9 is the sole win trigger. No floor 10 or 11 is ever generated. The victory screen MUST display a "Press R to restart" prompt and restart the run from floor 1 when the player presses `R`.
- R102: System MUST render game visuals using a limited entity-color palette on a black background: walls and staircase in grey, fog-of-war (dimmed tiles) in dark grey, player in white, enemies in light brown, and items in light blue. No other foreground colors are permitted.
- R103: System MUST activate all enemies present in a room simultaneously the moment the player's position tile belongs to that room: every enemy in the room begins pursuing and attacking the player on each subsequent turn; enemies do NOT require adjacency or line-of-sight to activate — room entry is the sole trigger. Once activated, enemies pursue the player indefinitely — they follow the player through corridors across rooms until the enemy dies or the player dies. There is no deactivation mechanism and enemies are NOT confined to their spawning room. Unactivated enemies (player has not entered their room) patrol randomly within their spawning room — they move one tile per turn to a random adjacent walkable tile within the room boundary; they do NOT pursue the player, leave the room, or attack until activation.

- **FR-036**: System MUST be developed test-first per constitution Principle II: tests MUST be written and fail (red) before implementation, and the Red-Green-Refactor cycle MUST be enforced. The shipped game artifact MUST contain no test code or test-only dependencies.

- **FR-037**: System MUST emit structured developer-facing log events (invisible to players, visible in developer tools). Each log event MUST include: timestamp, level (info/warn/error), component name, and a message. This is distinct from the player-facing HUD combat log (FR-018) and does not render in the game UI.

- **FR-038**: System MUST accept an optional `seed` URL query parameter (e.g., `?seed=12345`) to set the run's RNG seed. When present, the seed value MUST be parsed as an integer and used for all RNG calls in that run. When the parsed value is `NaN` (non-integer input), the system MUST fall back to an auto-generated seed — no error is shown. When absent, the seed is auto-generated at run start. The active seed value MUST be displayed on the game-over and victory screens alongside the floor reached and enemies defeated, enabling run reproduction and test determinism.

- **FR-039**: System MUST produce a deterministic test dungeon layout on floor 1 when the seed is `99999`. This layout is used solely for automated testing and does not affect any other seed. The layout MUST consist of four rooms arranged in a hub pattern around a central starting room, each connected by its own corridor: (a) Room A — starting room (minimum 5×5 tiles) where the player spawns at the center with no enemies, no items, and no stairs; (b) Room B — combat and item room (minimum 7×7 tiles, to comfortably fit the item count below alongside the enemy) connected to Room A by a corridor (exactly 8 tiles long, 3 tiles wide) extending to the right, containing exactly one Goblin enemy and exactly eleven items — a mix of health potions, weapons, and armor including at least one of each type, each on its own floor tile — no staircase; (c) Room C — death room (minimum 7×7 tiles) connected to Room A by a corridor (exactly 8 tiles long, 3 tiles wide) extending downward, containing exactly three Goblin enemies — no items and no staircase; (d) Room D — descent room (minimum 5×5 tiles) connected to Room A by a corridor (exactly 8 tiles long, 3 tiles wide) extending upward, containing exactly one staircase tile — no enemies and no items. Each room MUST be independently accessible from Room A via its own corridor — the player MUST NOT pass through one room to reach another. The single Goblin in Room B MUST be killable by the player (player ATK 5 vs Goblin DEF 1 = 4 damage/turn; Goblin HP 15, killed in 4 turns; player takes 3 damage/turn from one Goblin = 12 total, player survives with 8 HP). The eleven items in Room B exist so that an automated test can fill the player's 10-slot inventory (FR-009) and then observe the 11th pickup attempt's overflow behavior without leaving the room or relying on procedurally-generated floors. The three Goblins in Room C MUST defeat the player (3 Goblins × 3 damage/turn = 9 damage/turn; player has at most 20 HP, dies within 3 turns). All enemies MUST be positioned within the player's sight radius upon entering each room, ensuring simultaneous activation per R103. The staircase in Room D MUST be placed within 3 tiles of the room entrance, so that the player can reach it within 2 movement turns. No additional rooms, corridors, enemies, or items MAY be present on floor 1 when seed is 99999. All placement MUST be deterministic — the same seed 99999 always produces the same layout. Floors 2 and above MUST use normal procedural generation per FR-017/FR-020 regardless of seed.


## Deferred to Probe

All previously deferred probe dimensions (D3, D5, D7, D8) have been resolved. D7 was subsequently overridden on 2026-06-23 to use a limited entity-color palette instead of green-on-black — see Clarifications and R102.
