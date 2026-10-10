# Kemono Survivors

An original standalone endless survival action game made with Godot 4.6.3. Four clothed kemono heroes fight zombies, slimes, skeletons, and stronger elite variants in a scrolling graveyard. Auto attacks, crystals, randomized level-up choices, scaling enemy difficulty, active skills, death/retry, and saved best score are included. There is no fixed victory timer.

## Windows

Extract `kemono-survivors-windows.zip` and run `KemonoSurvivors.exe`. The game is self-contained; no data.win or previous game files are required. WASD/arrows move, Space activates your character's ability, Esc pauses, F11 toggles fullscreen. Attacks target enemies automatically. Pick up green crystals to level up and choose one of three random upgrades.

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

Validated on Linux, including graphical rendering and an exported Linux startup. The Windows executable was exported successfully but has not been executed on Windows here. This is a first playable release with procedural original artwork; it has no audio, controller support, multiplayer, or commercial-scale balance/content.
