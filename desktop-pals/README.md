# DeskFur

Original anthro desktop pets for Windows, with custom PNG sprites, online private rooms, pet care, local duo mode and shared tabletop games. Pets have ears, tails, faces, paws, arms and legs, plus procedural movement and expressions. Electron draws a transparent always-on-top desktop overlay. Empty desktop areas pass mouse input through; the pet and controls remain interactive.

## Start on Windows

Download `modding/deskfur-windows-setup.zip`, extract the entire ZIP, then double-click **Start-DeskFur.cmd**. Windows 10/11 x64 is the intended platform. First launch downloads about 151 MiB of the official Electron 44.9.0 runtime from GitHub and verifies its pinned SHA-256. Later launches use that saved runtime. Administrator rights, npm, and a separate Node installation are not required. Keep the extracted folder; launch its CMD file again to reopen DeskFur.

The runtime installs under `%LOCALAPPDATA%/DeskFur`. User settings use Electron's standard per-user application-data directory. Replacing the setup folder updates the app on the next launcher run. Windows launcher code was reviewed but has not been executed on Windows in this cloud machine; native Electron behavior was exercised on Linux instead.

## Pet controls

- Drag a pet to move it. Double-click for affection. Adjust size and wandering speed; set speed to zero to stay put.
- Feed, pet, wave, sleep, and choose neutral/happy/sad/surprised/sleepy/grumpy expressions. Fullness, bond and energy are simple persistent care values. Random idle messages and stretches add activity.
- Use **Time**, or type `what time is it?` in **Ask pet**. Time comes from your computer and its timezone. Other built-in commands include snack, pet, sleep and walk. This is a small command system, not a connected AI chatbot.
- **Duo mode** adds a second local companion. Click either local pet to select it for feeding or petting. The primary pet is the customizable, online-synced pet; the second companion stays local.
- Hide the controls with **−**. Restore them with the small DeskFur button, the system-tray menu, or **Ctrl+Shift+P**. Quit with the panel or tray menu.
- Quiet mode disables interaction sounds. This release supports the primary monitor's work area.

## Customize with sprites

Open **Sprites → Import PNG / sprite pack**. A transparent PNG works as a static pet. A JSON sprite pack points to one PNG sheet and defines uniform frame dimensions, fps, and frame-number sequences. The panel can set sheet rows/columns and idle, walk, sleep and play frames; **Export editable sprite pack** writes a PNG and JSON for easy editing.

The included `sprite-examples/mochi` folder is an original animated kemono pack. Read `sprite-examples/EDITING-GUIDE.txt`. PNG files can be up to 4096×4096 and 2 MiB; sheets support up to 256 cells, with up to 64 frames in each sequence. Extra eat/pet/happy/sad/surprised/angry animations can be defined in JSON. Keep equal transparent canvases and consistent alignment. Import copies the data into saved app settings; moving the original files afterward does not break an imported pet. Custom primary-pet sprites sync to friends when online.

## Play with your friend over the internet

**A hosted relay is required. There is no public DeskFur relay running by default.** The source and download include the complete relay service. It carries room state, sprites, messages and games; it does not remotely control computers.

One friend hosts it once, then both use the same `wss://...` address in **Friends**. Create a private room, share its 12-character code and relay address, and the other friend chooses **Join**. Up to 8 people can join. Ordinary chat goes to the room; the recipient selector sends a private message to one current room member. Messages reach people who are currently connected; there is no offline delivery or inbox.

For Render, create a Node Web Service from `walpbear/Testing`: root directory `desktop-pals/server`, build `npm ci --omit=dev`, start `npm start`, health path `/health`, Node 24. Or use the Blueprint at `desktop-pals/server/render.yaml`. Hosting account creation, plan selection and deployment are done by the user; free-tier availability can change. Convert the service's `https://...` address to `wss://...` in DeskFur. Free services may sleep or reset rooms. See `server/README.md` for full steps and alternatives.

For local testing only, run `npm ci && npm start` in `server`, then use `ws://127.0.0.1:8787`. Trusted LAN addresses also work with ws; the public internet requires wss. Localhost cannot connect friends in separate houses. A room code is an invitation, not a verified identity. The relay operator can read relayed data; use a trusted host.

## Games

Open **Games**, select a connected friend, choose tic-tac-toe, rock-paper-scissors or High Card, and send an invitation. The friend explicitly accepts. The relay validates turns, keeps pending RPS/card choices hidden, and decides outcomes. High Card is a simple one-card game with an ace-high deck; no betting or purchases. Other room members can watch.

Dice support D4,D6,D8,D10,D12,D20,D100 and modifiers from−20 to+20. Online rolls come from the shared relay; offline rolls use the local cryptographic random generator. D20 results highlight natural 1/natural 20. No Baldur's Gate artwork or game assets are included.

## Development

Node 24 recommended. `npm ci` in this directory installs Electron and build/test tools. `npm start` opens the desktop app. `npm run build:app` creates `build/app.asar`; distribute it beside the files under `windows/` and the sprite examples. `npm run dist:win` can create a conventional unpacked Electron Windows app if release-download access is available. Build artifacts and node_modules are ignored. The separate relay has its own pinned package-lock and starts with `npm ci && npm start` from `server`.

Tests:

```
npm test
npm run test:ui
cd server
npm test
```

The renderer suite uses installed Chromium where available, or Playwright's browser install. Current validation: 77 automated tests (14 sprite/import, 15 screen-physics, 28 relay integration including actual TLS/WSS, and 20 browser/UI tests) including two real app clients, shared movement/art/chat, a completed tic-tac-toe match and a synchronized die roll. The packaged native Linux app was also checked for hidden startup, landing, right-click climbing and restoring controls. Windows-native transparency, click-through and the launcher remain to be checked on a Windows PC. Internet hosting has not been deployed or tested from two separate real-world networks.

## Shimeji-style desktop behavior (0.2)

Native desktop launches start with just the pets and a small restore button. Right-click your pet for walking, sitting, jumping, climbing the screen edge, following the cursor, feeding, petting, toggling a companion, or opening controls. Ctrl+Shift+P and the tray menu also restore controls. The app remembers whether you leave controls open or hidden.

Shimeji-style movement is enabled by default. Pets fall to the bottom of the work area, walk and take random rests, climb the left/right screen edge, crawl along the top, then let go. Pick them up and release them to drop or gently toss them. Built-in artwork reacts to dragging, falling, climbing, hanging, sitting and landing. Speed zero stops autonomous walking/climbing; explicit jumps and gravity still work. Turn off **Shimeji-style movement** to restore classic wandering.

The optional sprite fields `sit`, `climb`, `hang`, `fall`, `jump`, `drag`, and `land` supply matching frames; edit them under **Sprites → Shimeji poses** or in a JSON pack. Existing PNG packs fall back to their standard animations. Online pets share these poses through the included updated relay. Screen edges are supported; this version does not detect or climb other applications' window borders and does not move or close other windows. Original Shimeji XML behavior scripts are not imported.
