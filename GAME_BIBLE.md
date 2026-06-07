# ATOMHOWL — Game Bible v3
*(working title — fits the atomic/nuclear + "howl" theme; rename freely)*

> Humanity built the machines to be ruthless. Then someone dropped the bomb.
> Now two brothers howl back at the end of the world.

Single source of truth. Keep in the repo as `GAME_BIBLE.md`. v3 sets the new direction:
a **2D side-view action horde game** with light platforming and a satirical AI-apocalypse story.

---

## 0. THE PITCH
A **2D side-view action horde-brawler** with light platforming. Satire-comedy tone. Two
wolf-blooded brothers — **Eterwolf** and **Wolffel** — fight through biome stages (forest, ice,
desert, ruined city) against swarms of rogue AI robots, nuclear-mutated creatures, and slow
shuffling zombies. Swords, guns with swappable bullets, evolving gear, and outrageous anime
powers. Think **Castle Crashers × Vampire Survivors × Metal Slug**, with anime ultimates.
**NOT** a Hollow-Knight Metroidvania — stage-based action, not open-world exploration.

## 1. STORY (original, satirical)
Humanity *programmed* the AI to be "evil" — not a sentient villain that *wants* to destroy us,
but a cold, hyper-efficient intelligence (Halo-style) following corrupted directives to their
logical, ruthless end. The machine war escalated; a nuclear bomb finished the job and mutated
the animals and sea life into monsters. The world's a ruin. The brothers don't take it too
seriously — the humor is in two siblings bickering and cracking jokes through the apocalypse.

---

## 2. SCOPE (build in layers — finishable on purpose)
- **v1 Core:** one brother; move + jump + dash; sword melee + gun; a few enemy types in ONE
  biome; one ultimate power; self-heal; one boss. Prove the fighting is fun.
- **v2:** double-jump + wall-slide; both brothers + local co-op; bullet-swap; sword evolution;
  more enemies + biomes; companions + robot helper; the lobby.
- **v3:** story scenes, cosmetics, difficulties, polish, sound; package to PC (.exe), itch.io.
- **v4 (dream):** online co-op (Colyseus, "join by code"). Its own project — much later.

**Reality:** agent builds a chunk — player runs + reacts — agent fixes. Game feel is tuned by
the player. No one-shot finished game.

---

## 3. PERSPECTIVE & MOVEMENT
- 2D **side-view** (see the brothers from the side). Character faces right; engine flips for left.
- Move left/right, **JUMP**, **DOUBLE JUMP**, **DASH**, **WALL-SLIDE** (jump to a wall, cling and
  slide down briefly — the "Ultimate Chicken Horse" feel). Light platforming only.
- Levels: mostly side-scrolling with **light vertical sections** (climb up, drop down, slide a
  gap). Built from free tilesets via Phaser tilemaps (Tiled editor). NOT an open world.

---

## 4. THE BROTHERS
- **ETERWOLF — the Spark:** lean, curly hair, fast, cocky, plays guitar idle. Speedy combos.
  Weapons: **thin AI samurai sword** (fast melee) + AK-style gun (swappable bullets).
  Spanglish flavor ("¡ágale!", "¡listo!", "Die, you son of a howl!"), sparing.
- **WOLFFEL — "Feli", the Anchor:** big, bearded, elf ears, tanky. Eats during idle.
  Weapons: **big heavy sword** (slow, strong) + AK-style gun (swappable bullets).
  "¡Delicioso! I want more, I'm never full!" Revive: "Don't touch me — I'm fine, eh!"
- **Banter system + The Howl** (Up = cheer; both howl near each other = Pack Sync buff). Comedy
  is core — keep them bickering and funny.

---

## 5. COMBAT (manual action-brawler — horde clearing)
- **Melee:** swing your sword (Eterwolf fast/thin, Wolffel slow/heavy) at enemies in front.
- **Gun:** fire the AK-style gun toward your aim/facing. **Bullet-swap (Cuphead-style):** the
  gun is always the same; you swap BULLET TYPES (spread, homing, fire, piercing, etc.),
  unlocked/equipped in the lobby.
- **Sword evolution:** each sword evolves through **10 levels** (more damage/range/effects),
  upgraded at the lobby with points/money.
- **Dash-strike (Eterwolf super attack):** a fast dash that cuts through 1–2 nearby enemies with
  brief invincibility on the hit.
- **Self-heal:** HP regenerates after a few seconds without being hit (no health pickups).

## 6. ULTIMATE POWERS (charge a meter, then unleash)
- **ETERWOLF — "Super Mode":** Goku-style — gold glowing eyes, flames, big spiked hair,
  invincible + massive damage for a short time.
- **WOLFFEL — "Werewolf Mode":** transforms into a beast — bite/rip melee, invincible for a
  short time.
All power VFX (flames, auras, claws, slashes, lightning) come from FREE CC0 effect packs.

## 7. ALLIES
- **Robot helper:** found mid-stage; fights alongside you for a short time.
- **Companions ("the Pack"):** beasts that join and fight until they fall; scale up later.

---

## 8. ENEMIES (mix — from free CC0 packs)
- **AI robots:** drones, walkers, small mechs (the "evil programmed AI").
- **Mutated creatures:** nuclear animals + sea creatures (the bomb's children).
- **Zombies:** SLOW, weak, background filler — atmosphere, not the main threat.
- **Big-box brutes:** large tanky enemies / minibosses.
- **Stage bosses:** one per biome, telegraphed attacks, health bar.

## 9. STAGES / BIOMES
Forest · Ice · Desert · Ruined City. Pick a stage — fight through a side-scroll level with light
platforming + hordes — boss — back to the lobby. Each biome = its own free tileset + enemies,
all graded for one look.

## 10. THE LOBBY (between stages)
Evolve swords (10 levels) · unlock & equip bullet types · change outfits/cosmetics · buy upgrades
with points/money · read the story. (Can be a menu-style lobby for simplicity, or a small
walk-around room later.) This replaces mid-fight upgrade pop-ups.

## 11. DIFFICULTIES & MODES
Easy / Hard / Extreme / Super Extreme (scale enemy count, speed, HP). Play **solo** (pick either
brother — no puzzles that need both) or **local co-op**. Online co-op = v4 (Colyseus).

---

## 12. ART — WHAT THE PLAYER BUILDS vs WHAT'S FREE
**Player builds (PixelLab — ONLY the two brothers), side-view, facing right:**
idle (eating / guitar) · walk · jump · double-jump · dash · wall-slide · sword attack ·
gun attack · ultimate/transform · hurt · down. (Weapons drawn into the attack frames.)

**FREE / pulled by the agent (player builds NONE of these):**
- Enemies: Kenney Monster Builder Pack (CC0) + Tiny Creatures (CC0) + free robot & zombie packs
- Biome backgrounds/tilesets: free CC0 forest/ice/desert/ruined-city sets
- Power & sword-slash VFX: OpenGameArt "CC0 special effects", "Pixel Art Spells" (CC0), Free
  Pixel Magic Effects pack, ansimuz/pimen/CreativeKind effect packs (flames, auras, lightning,
  ice, slashes, explosions, teleport, hit-sparks)
- Bullets/projectiles, robot ally, UI icons
- EVERYTHING run through `tools/unify_assets.py` for one consistent look.

## 13. TECH
Phaser 3 + Vite (set up). Levels via Phaser tilemaps (Tiled editor) + free tilesets. Input:
gamepad + arrows + WASD. Live dev server at localhost:3000. Pushes to GitHub.

## 14. FIRST BUILD TARGET (hand to Claude Code)
Side-view CORE COMBAT only, one biome:
1. One brother on a tile ground; move L/R, JUMP, DASH (gamepad/arrows/WASD); side-scroll bg.
2. MELEE sword swing (attack button) + GUN fire toward facing. Hit-flash + screen shake.
3. A few enemies (free robot + creature sprites, graded) spawn from both sides and approach.
4. One ULTIMATE (Eterwolf Super Mode or Wolffel Werewolf) on a charge meter, using free VFX.
5. Self-heal regen. A wave counter. One boss at the end with a health bar.
6. Run at localhost:3000. Build this ONLY, then stop and let the player test the FIGHTING feel.
(Double-jump, wall-slide, bullet-swap, sword evolution, lobby, co-op come AFTER the fight is fun.)
