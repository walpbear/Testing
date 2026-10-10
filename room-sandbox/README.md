# Room & Company

A standalone, non-explicit room sandbox for Windows, built in Godot 4.6.3. It contains original clothed character art, room illustrations, dialogue and synthesized music. It runs independently of Wife's Bedroom and does not require its executable or data files.

## Play

Extract `room-and-company-windows.zip` completely, then double-click `RoomAndCompany.exe`. Godot does not need to be installed to play.

- Select Rowan or Mika, an outfit, a pose, a room palette, and daylight or moonlight.
- Chat, wave, share tea, or click your companion to wave. Interactions increase friendship.
- Toggle the optional ambient music.
- F11 toggles fullscreen. Escape restores the normal window. The 4K button opens a 3840 × 2160 window; use fullscreen on a smaller display.
- Settings, friendship, and visits save automatically. Reset room restores the visual defaults while keeping friendship.

Saves are separate from the original game. On Windows they live in `%APPDATA%\Godot\app_userdata\Room & Company`.

## Custom high-resolution artwork

Click **Import your character…** and select a transparent PNG for a single pose, or a JSON character pack for multiple poses and animation. PNGs can be 3840 × 2160 or 4096 × 4096; texture data is loaded at its original resolution. Each frame fits the same character display area, with its feet anchored at the bottom. The art is not permanently resized.

For consistent placement, use identical canvas dimensions and align the character at the same point in every frame. Preserve the artwork's aspect ratio and avoid adding different transparent margins to different frames. Imported images retain their own outfit and colors; the built-in outfit selector is disabled for imported art.

Use this folder layout:

```text
MyCharacter/
  character.json
  standing/frame_00.png
  standing/frame_01.png
  sitting/frame_00.png
  waving/frame_00.png
  waving/frame_01.png
```

Copy `custom-character-example.json` to `character.json`, add your images, and edit its name, paths and frame rate. Frame arrays specify the exact order; no frame-count guessing or oversized horizontal strip is involved. Paths must stay inside the character folder. Up to 64 separate frames per pose are supported, at 0.2–30 frames per second. Only two decoded frame textures are cached at a time, though the renderer can temporarily retain additional references.

A 4096 × 4096 RGBA frame uses about 64 MiB before rendering overhead. Repeated PNG decoding can cause stutter with large animations; playback performance depends on the artwork and PC. The current importer is a simple runtime loader, not a production asset-streaming system.

Imported pack paths are remembered if you quit with the custom character selected. Keep that folder in place. The sample JSON is a template; its referenced artwork is not included.

## Develop and build

Open `project.godot` in Godot **4.6.3**. The project uses the Compatibility renderer and has no third-party project dependencies.

```sh
godot --headless --path . --editor --import --quit
godot --headless --path . --script res://tests/smoke.gd
godot --headless --path . --export-release "Windows Desktop" build/RoomAndCompany.exe
```

Create the `build` directory first and install the matching Godot export templates for exporting. `export_presets.cfg` includes Windows x64 and Linux presets. The Windows export embeds the game data inside the executable.

Tests exercise the actual scene and controls, interactions, saving, PNG decoding, pose switching, invalid manifests, frame caching, and restoration of built-in art. Running the same smoke script with a graphics display additionally tests rendering a 4096 × 4096 image. `tests/visual.gd` captures a screenshot to `user://screenshot.png`.

The delivered build was checked in Godot on Linux, including a software OpenGL renderer. Windows export succeeded, but Windows execution remains to be verified on your PC. This is a complete small sandbox, not a recreation of the original game's mechanics or a full story campaign.

The smoke runner reports a Godot audio-resource warning at shutdown after its playback check; the checks and exit status pass. The exported Linux game's normal startup/exit check completed without this warning.

The Godot engine is MIT-licensed; its license is included in the download. Original game content is separate and is not reused here.
