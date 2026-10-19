# DeskFur multiplayer relay

This small Node.js service connects DeskFur on different computers. Up to eight
friends share one private room. The relay carries pet positions, emotes, short text
messages, imported PNG sprites, shared tabletop minigames, and dice rolls; it never controls another computer's mouse or
opens remote files. Node.js 22 or newer is required (Node 24 is recommended).

## Run on your own computer

```sh
cd desktop-pals/server
npm ci
npm start
```

The default port is **8787**. On the same computer, enter `ws://127.0.0.1:8787`
in the app. For two computers on the same trusted home network, use the server
computer's LAN address, for example `ws://192.168.1.20:8787`. Your operating system
may need an inbound firewall rule for that port. `PORT` overrides the port.

`localhost` always refers to the computer where the app is running; it cannot
connect two friends in different houses. For internet play, host one public relay
and both enter its **wss://** address. No port forwarding is needed when using a
hosting provider.

## Host on Render

The included `render.yaml` is a Blueprint configuration. In Render, create a
Blueprint from your copy of `walpbear/Testing` and set the Blueprint path to
`desktop-pals/server/render.yaml`. Review the service and plan before deploying.
This file uses Render's free service plan; availability and limits can change.

Alternatively, create a **Web Service** with these settings:

| Setting | Value |
| --- | --- |
| Repository | Your copy of `walpbear/Testing` |
| Root directory | `desktop-pals/server` |
| Runtime | Node |
| Build command | `npm ci --omit=dev` |
| Start command | `npm start` |
| Health check | `/health` |
| Node version | 24 |

Render terminates HTTPS and WSS. If your service URL is
`https://deskfur-relay-xxxx.onrender.com`, the app's relay field is
`wss://deskfur-relay-xxxx.onrender.com` (no extra port). Both friends must use
the same URL. One friend creates a room and shares its code with the other.

No account credentials, API keys, or payment details belong in this repository.
This source project does **not** include an already hosted public relay. Free
services may sleep when unused, take a while to wake, and restart without warning.
A restart closes the rooms; create a new room after reconnecting.

Other hosts work too: run `npm ci --omit=dev && npm start`, expose the `PORT`
environment variable, and put the service behind a TLS reverse proxy that supports
WebSocket upgrades. Use `wss://` on the internet. Plain `ws://` connections have no
transport encryption and are intended for local testing or trusted LAN use.

## Room and privacy behavior

- Room codes contain 12 randomly generated characters (60 bits of randomness).
  Anyone who knows the code can join; treat it as a private invitation. There are
  no user accounts or verified identities.
- Each room holds up to eight clients. A disconnected player can join again with
  the same code and receives a new participant ID. Empty rooms expire after
  approximately one minute. Rooms are held in memory only and disappear on restart.
- Imported artwork is shared with room members and retained in relay memory while
  its uploader is connected. It is not written to disk. After everyone leaves,
  nothing is persisted by this application. The hosting provider may keep normal
  connection/access logs.
- Chats are relayed immediately and are not stored as history. Names, chat, and
  sprite names are plain text. Clients must render them as text, never as HTML.
  Optional direct messages go only to the selected member of the same room.
- Tabletop games require an explicit invitation and acceptance by the other
  player. They do not use money, bets, or purchases. Dice and game outcomes are
  generated or validated by the server. The relay is a trusted intermediary and
  can see direct messages and hidden game choices while relaying them.
- There is no public room list, HTTP file upload, remote image fetch, or scripting
  interface. Server logs include startup status only, not messages or room codes.

## Protocol (JSON text over WebSocket)

Connect at `/` or `/ws`. `/health` serves an HTTP JSON health check. All events use
protocol version 1. `id` fields are assigned by the server; supplied client IDs
never override identity.

Create a room:

```json
{"type":"create","name":"Rowan","skin":"fox","state":{"x":0.5,"y":0.7,"behavior":"idle","facing":1,"expression":"neutral"}}
```

Join an existing room:

```json
{"type":"join","code":"ABCD2345EFGH","name":"Mika","skin":"cat"}
```

Names allow 1–24 Unicode characters after trimming. Skins are `cream`, `fox`, `cat`,
or `wolf`. Initial state is optional. `x` and `y` are normalized 0–1 positions
relative to the display so friends with different resolutions can share space.
`behavior` is `idle`, `walk`, `sleep`, or `play`; `facing` is `-1` or `1`.
`expression` is `neutral`, `happy`, `sad`, `surprised`, `sleepy`, or `angry` and
defaults to `neutral` if omitted.

Successful creation/join returns:

```json
{"type":"welcome","id":"server-assigned-id","code":"ABCD2345EFGH","peers":[],"maxPlayers":8,"game":null}
```

`peers` contains other members only, each as
`{id,name,skin,state,sprite}`. `sprite` is `null` for built-in artwork. Existing
members receive `{type:"peer_joined",peer:{...}}`.
`game` contains the current sanitized tabletop state, if any, so late joiners can
watch without receiving hidden RPS choices or card values.

After joining, these client messages are available:

| Client message | Event sent to other room members |
| --- | --- |
| `{type:"state",state:{x,y,behavior,facing,expression}}` | `{type:"state",id,state}` |
| `{type:"profile",name:"Taron",skin:"cream"}` | `{type:"profile",id,name,skin}` |
| `{type:"emote",emote:"heart"}` | `{type:"emote",id,emote}` |
| `{type:"chat",text:"Hello!"}` | `{type:"chat",id,text}` |
| `{type:"chat",to:friendId,text:"Just us"}` | `{type:"chat",id,to,text}` to that friend only |
| `{type:"sprite",sprite:{...}}` | `{type:"sprite",id,sprite}` |
| `{type:"sprite",sprite:null}` | `{type:"sprite",id,sprite:null}` |
| `{type:"leave"}` | `{type:"peer_left",id}`; sender receives `{type:"left"}` |

Emotes are `wave`, `heart`, `happy`, `sparkle`, `sleep`, `food`, `pet`, or `time`. Chat is limited to
140 Unicode characters, without control characters or line breaks. State,
profile, chat, emotes, and sprites do not echo to the sender. Disconnects also emit
`peer_left`. A client should interpolate remote movement and send its own movement
at about 10–20 Hz, rather than sending every rendered frame.

Custom sprite structure:

```json
{
  "name":"My Pal",
  "fps":8,
  "frameWidth":128,
  "frameHeight":128,
  "animations":{"idle":[0],"walk":[1,2],"sleep":[3],"play":[4,5]},
  "image":"data:image/png;base64,ENCODED_PNG_BYTES"
}
```

Frame indices count from zero, left to right then top to bottom. Only inline PNGs
are accepted: no filenames or URLs. Limits are 2 MiB of decoded PNG bytes,
4096×4096 image dimensions, 4096×4096 frame dimensions, 256 total grid cells,
1–24 fps, and 1–40 characters for the sprite name. Dimensions must divide evenly
into the image. `idle` must be nonempty; the other animations may be omitted and
clients should fall back to `idle`. Optional animation keys `eat`, `pet`, `happy`,
`sad`, `surprised`, and `angry` are also preserved. All supplied frame arrays must
be nonempty and contain at most 64 valid indices. The relay checks PNG signature and IHDR
metadata; clients still need a safe PNG decoder and matching bounds checks.

Failures return `{type:"error",code,message}` without changing accepted state.
Useful codes include `room_not_found`, `room_full`, `already_joined`, `not_joined`,
`invalid_profile`, `invalid_state`, `invalid_chat`, `invalid_emote`,
`invalid_sprite`, `sprite_rate_limited`, `sprite_capacity`, and `rate_limited`.

## Shared tabletop games and dice

Each room has one shared table; other friends can watch. A participant starts an
invitation with `{type:"game",action:"start",game:"ttt"|"rps"|"cards",opponent:friendId}`.
The invited friend accepts with `{type:"game",action:"accept"}` or declines with
`{type:"game",action:"decline"}`. Either player can cancel with `action:"cancel"`.
Invitations expire after 90 seconds. A game clears when either participant leaves
or disconnects; a spectator leaving does not interrupt it. A finished game can be
replaced by a new invitation. Active and pending games cannot be overwritten.

Every accepted action broadcasts `{type:"game_state",game:{...}}` to the **entire
room including the sender**. Cancellation sends `game:null` with a `reason` of
`cancelled`, `declined`, `invite_expired`, or `player_left`. Each game object has
`id`, `kind`, `status` (`invited`, `active`, `finished`), `players` (host then guest),
`winner` (participant ID or `null`), and `draw` (boolean). Pending invitations also
include an `expiresAt` Unix timestamp in milliseconds. Moves can optionally carry
`gameId` to reject stale actions.

- **Tic-tac-toe (`ttt`)**: `board` is nine `null`, `"X"`, or `"O"` cells. The host
  plays X first, and `turn` is the current player's ID (or `null` when finished).
  Send `{type:"game",action:"move",cell:0}` for a zero-based cell from 0 to 8.
  The server checks player identity, turns, occupancy, winning lines, and draws.
- **Rock-paper-scissors (`rps`)**: send
  `{type:"game",action:"choose",choice:"rock"|"paper"|"scissors"}`. Choices lock
  after submission. `chosen` lists players who have submitted; `choices` remains
  `{}` until both choices are locked, then reveals an ID-to-choice mapping and
  resolves the winner or draw. Late joiners cannot see unrevealed choices.
- **High Card (`cards`)**: send `{type:"game",action:"draw"}`. A card is selected
  with cryptographic randomness from a fresh 52-card deck without replacement.
  `drawn` lists submitted player IDs; `draws` stays `[]` until both draw, then
  reveals `[{id,rank,suit},...]`. Ranks are 2–14 (14 is Ace), and suits are `clubs`,
  `diamonds`, `hearts`, `spades`. Higher rank wins; equal rank is a draw.

Roll tabletop dice with `{type:"roll",sides:20,modifier:3}`. Supported sides are
4, 6, 8, 10, 12, 20, and 100, and the optional modifier is an integer from -20 to
20 (default 0). The server broadcasts `{type:"dice",id,sides,roll,modifier,total,
natural20,natural1}` to everyone in that room including the roller. `roll` is the
unmodified die, `total` includes the modifier, and natural flags apply only to d20.
No other room receives these results.

Game error codes include `game_busy`, `invalid_game`, `invalid_opponent`,
`no_game`, `stale_game`, `not_player`, `invalid_accept`, `game_not_active`,
`not_your_turn`, `invalid_move`, `invalid_choice`, `already_played`,
`invalid_game_action`, and `invalid_roll`. Existing message and byte limits also
apply to game actions and dice.

## Resource limits

The defaults allow 500 rooms and 1000 connected sockets. JSON messages are limited
to 3 MiB; non-sprite messages are additionally limited to 2048 bytes. Each socket
has a 60-message/second token bucket (burst 90) and a 2 MiB/second byte bucket
(burst 6 MiB). Exceeding these rate limits closes the sender. Non-null sprite
uploads are limited to one every two seconds. Aggregate decoded sprite storage is
capped at 64 MiB, and slow readers with more than 4 MiB of queued data are closed
(32 MiB for the first 30 seconds after joining, to accommodate the initial sprites).
The application pings every 30 seconds and drops clients missing the next pong.
Sockets must create/join a room within 20 seconds of connecting or leaving.

These limits support a small group of friends. Large public deployments should
add a managed gateway with connection limits and abuse monitoring.

## Tests

```sh
npm ci
npm test
```

The 26-check Node test suite runs actual HTTP and WebSocket listeners with multiple
clients, including TLS/WSS using an ephemeral self-signed certificate. **OpenSSL**
must be on PATH for that test. It exercises room isolation, joining/reconnecting,
state validation, text/emotes, disconnect cleanup, expiration, payload/rate limits,
PNG sharing/validation, sprite memory limits, expression/profile updates, private
messaging, game invitation consent, legal turns, winners/draws, RPS/card secrecy,
and server dice. Test certificate validation is
disabled only for the ephemeral local WSS fixture; production clients must verify
their host's TLS certificate.
