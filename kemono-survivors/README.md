# Kemono Survivors

An original standalone endless survival action game made with Godot 4.6.3. Four clothed kemono heroes fight zombies, slimes, skeletons, and stronger elite variants in a scrolling graveyard. Manual aimed melee and weapon attacks, dodging, area slam, hit flashes, knockback, damage numbers, synthesized effect sounds, crystals, randomized level-up choices, scaling enemy difficulty, active skills, death/retry, and saved best score are included. There is no fixed victory timer.

## Windows

Extract `kemono-survivors-windows.zip` and run `KemonoSurvivors.exe`. The game is self-contained; no data.win or previous game files are required. WASD/arrows move; aim with the mouse. Left click or J slashes in front of you; right click or K uses your selected weapon. Q activates your hero ability, Space dodges, E performs an area slam, R activates a fully charged ultimate, F8 toggles camera shake, Esc pauses, F11 toggles fullscreen. Hold an attack button to repeat attacks when its cooldown expires. No attacks fire without input. Lightning targets nearby enemies; other attacks use your aim or an area around you. Dodging briefly grants invulnerability. Abilities have separate cooldowns shown in the HUD. Pick up green crystals to level up and choose one of three random upgrades.

## Characters and customization

- Rowan (fox): ember bolts, explosive burst; balanced stats.
- Luna (rabbit): orbit blades, invulnerable dash; fastest movement.
- Kael (wolf): frost pulse, healing howl; highest health.
- Yuki (cat): lightning, wide thunder strike.

At camp, choose a character, override their starting weapon, and choose a fur color. Level-up boons customize damage, attack rate, speed, health, pickup radius, and weapon mastery during a run. Imported characters inherit the selected hero's stats and active ability; any of the four starting weapons can be selected. This release supports these predefined skill sets, not user-written skill code. Custom-image colors come from the image itself.

## Import artwork, including individual 4K frames

Use **Import character PNG / JSON**. A single transparent PNG becomes a static character. For animations, copy the example JSON into the same folder as your separate PNG frames and edit paths. `Standing` is the default; `Walk` is used when moving. Each pose supports 1–64 frames; fps is clamped to 1–30. `survivor.weapon` selects 0=ember, 1=blades, 2=frost, 3=lightning. Alternatively select a weapon in camp after importing.

Each frame can be 3840×2160 or 4096×4096. Artwork is fit proportionally into a consistent gameplay box, preserving its full texture resolution. Align every frame's canvas/padding consistently and put the character in the center; transparent empty canvas affects apparent size. Frames remain external and only two textures are cached. Keep the source folder accessible while playing; importing does not copy it into the game. 4K animation frame decoding can stall on slower machines: lower dimensions or fewer frames may run better. PNGs remain full-resolution; no automatic image upscaling is included.

## Development and validation

Open `project.godot` in Godot 4.6.3 or run `godot --path kemono-survivors`. No package installation or online services are needed. Use the existing checkout rather than making a worktree.

On this cloud machine, prefix Godot commands with:

```
XDG_DATA_HOME=/workspace/tools/godot-data XDG_CACHE_HOME=/workspace/tools/godot-cache XDG_CONFIG_HOME=/workspace/tools/godot-config
```

Run `godot --headless --path kemono-survivors --script res://tests/smoke.gd` for functional combat, loadouts, upgrades, death/retry, persistence, a real 4096×4096 PNG import, and bounded long-running simulation. Export with `godot --headless --path kemono-survivors --export-release "Windows Desktop" /absolute/output/KemonoSurvivors.exe`; installed Godot 4.6.3 export templates are required. Windows and Linux presets embed the PCK in the executable. Generated outputs belong outside the checkout or under ignored `build/`.

Validated on Linux with 69 functional checks, graphical rendering, and an exported Linux startup. The graphical test can report retained audio objects when it quits immediately after playing effects; functional tests finish cleanly. The Windows executable was exported successfully but has not been executed on Windows here. This is a playable hack-and-slash release with procedural original artwork; it has no controller support, multiplayer, or commercial-scale balance/content.

## Ultimates and animation

Ultimates charge passively and through hits/kills, then consume 100% charge on R. Each lasts five seconds: Rowan creates an inferno, Luna gains speed and orbit blades, Kael emits healing frost waves, Yuki unleashes a wide tempest. Heavy attacks create camera shake, expanding shockwaves, sparks and projectile trails. Knockback is now a decaying impulse, with reduced enemy pursuit while being pushed; elites resist more. Built-in heroes have walk bob, alternating steps/arms, tail motion, breathing, slash lunges and casting movement. Enemies bob/hop. Imported JSON can also supply Attack, Skill, Ultimate and Hurt frame lists alongside Standing and Walk; missing animations fall back to existing frames. These are procedural 2D animations, not 3D models.

## Easy editing with character folders

The Windows ZIP now includes `characters/`. Open a folder's `character.json` with Notepad and change stats, weapon, skill class, cooldowns, knockback, ultimate duration/rate, fur color, or animation fps. Copy a folder to create another character. Add PNG frames and a `poses` block for custom art. Return to camp, click **Reload folder edits (F5)**, select your custom character, and begin a new run. Read `characters/EDITING-GUIDE.txt` for every setting and a complete animation example. Built-in heroes are retained alongside folder characters. The editor/source uses `res://characters`; exports read `characters` beside the executable. Folder loading errors are shown on reload, and missing artwork falls back to built-in art. Settings are deliberately clamped; abilities use the four predefined skill sets.
