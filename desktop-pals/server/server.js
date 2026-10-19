import http from 'node:http';
import { randomBytes, randomUUID, randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';

export const SKINS = Object.freeze(['cream', 'fox', 'cat', 'wolf']);
export const BEHAVIORS = Object.freeze(['idle', 'walk', 'sleep', 'play']);
export const EXPRESSIONS = Object.freeze(['neutral', 'happy', 'sad', 'surprised', 'sleepy', 'angry']);
export const EMOTES = Object.freeze(['wave', 'heart', 'happy', 'sparkle', 'sleep', 'food', 'pet', 'time']);
const SPRITE_ANIMATIONS = [...BEHAVIORS, 'eat', 'pet', 'happy', 'sad', 'surprised', 'angry'];
const DICE_SIDES = [4, 6, 8, 10, 12, 20, 100];
const MAX_SPRITE_BYTES = 2 * 1024 * 1024;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEFAULT_STATE = Object.freeze({ x: 0.5, y: 0.65, behavior: 'idle', facing: 1, expression: 'neutral' });
const ownObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const cleanText = (value, max) => typeof value === 'string' && value.trim().length > 0
  && [...value.trim()].length <= max && !/[\u0000-\u001f\u007f]/u.test(value);

function normalizedCode(value) {
  if (typeof value !== 'string') return '';
  const code = value.toUpperCase().replace(/[\s-]/gu, '');
  return /^[A-HJ-NP-Z2-9]{12}$/u.test(code) ? code : '';
}

function validState(value) {
  return ownObject(value) && Number.isFinite(value.x) && value.x >= 0 && value.x <= 1
    && Number.isFinite(value.y) && value.y >= 0 && value.y <= 1
    && BEHAVIORS.includes(value.behavior) && [-1, 1].includes(value.facing)
    && (value.expression === undefined || EXPRESSIONS.includes(value.expression));
}

function publicState(value) {
  return { x: value.x, y: value.y, behavior: value.behavior, facing: value.facing,
    expression: value.expression ?? 'neutral' };
}

// The relay never fetches artwork URLs or reads client-supplied filesystem paths.
// PNG decoding remains in the desktop client's image loader; metadata is bounded here.
function validatedSprite(value) {
  if (!ownObject(value) || !cleanText(value.name, 40)
    || !Number.isInteger(value.fps) || value.fps < 1 || value.fps > 24
    || !Number.isInteger(value.frameWidth) || value.frameWidth < 1 || value.frameWidth > 4096
    || !Number.isInteger(value.frameHeight) || value.frameHeight < 1 || value.frameHeight > 4096
    || !ownObject(value.animations) || typeof value.image !== 'string') return null;
  const prefix = 'data:image/png;base64,';
  if (!value.image.startsWith(prefix)) return null;
  const encoded = value.image.slice(prefix.length);
  if (encoded.length > Math.ceil(MAX_SPRITE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)
    || encoded.length % 4 !== 0) return null;
  const png = Buffer.from(encoded, 'base64');
  if (png.length < 45 || png.length > MAX_SPRITE_BYTES
    || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || png.readUInt32BE(8) !== 13 || png.toString('ascii', 12, 16) !== 'IHDR') return null;
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width < 1 || height < 1 || width > 4096 || height > 4096 || width * height > 16777216
    || width % value.frameWidth !== 0 || height % value.frameHeight !== 0) return null;
  const frameCount = (width / value.frameWidth) * (height / value.frameHeight);
  if (frameCount < 1 || frameCount > 256) return null;
  const animations = {};
  for (const behavior of SPRITE_ANIMATIONS) {
    const frames = value.animations[behavior];
    if (frames === undefined && behavior !== 'idle') continue;
    if (!Array.isArray(frames) || frames.length < 1 || frames.length > 64
      || frames.some((index) => !Number.isInteger(index) || index < 0 || index >= frameCount)) return null;
    animations[behavior] = [...frames];
  }
  return {
    bytes: png.length,
    sprite: { name: value.name.trim(), fps: value.fps, frameWidth: value.frameWidth,
      frameHeight: value.frameHeight, animations, image: value.image },
  };
}

/**
 * Starts the relay. TLS is supplied by the hosting provider/reverse proxy in production.
 * Tests can pass tls: { key, cert } to exercise a real WSS listener directly.
 */
export async function startServer(options = {}) {
  const config = {
    port: options.port ?? Number(process.env.PORT || 8787),
    host: options.host ?? '0.0.0.0',
    maxPlayers: options.maxPlayers ?? 8,
    maxRooms: options.maxRooms ?? 500,
    maxClients: options.maxClients ?? 1000,
    maxPayload: options.maxPayload ?? 3 * 1024 * 1024,
    maxSpriteMemoryBytes: options.maxSpriteMemoryBytes ?? 64 * 1024 * 1024,
    spriteCooldownMs: options.spriteCooldownMs ?? 2000,
    ratePerSecond: options.ratePerSecond ?? 60,
    rateBurst: options.rateBurst ?? 90,
    byteRatePerSecond: options.byteRatePerSecond ?? 2 * 1024 * 1024,
    byteBurst: options.byteBurst ?? 6 * 1024 * 1024,
    heartbeatMs: options.heartbeatMs ?? 30000,
    handshakeMs: options.handshakeMs ?? 20000,
    emptyRoomTtlMs: options.emptyRoomTtlMs ?? 60000,
    sweepMs: options.sweepMs ?? 15000,
    inviteTtlMs: options.inviteTtlMs ?? 90000,
  };
  const rooms = new Map();
  const clients = new Set();
  let closing = false;
  let spriteMemoryBytes = 0;
  const secureRandomInt = options.randomInt ?? randomInt;
  let tlsModule;
  if (options.tls) tlsModule = await import('node:https');
  const requestHandler = (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, service: 'deskfur-relay', protocol: 1 }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  };
  const httpServer = options.tls
    ? tlsModule.createServer(options.tls, requestHandler)
    : http.createServer(requestHandler);
  const wss = new WebSocketServer({ noServer: true, maxPayload: config.maxPayload, perMessageDeflate: false });

  function send(client, message) {
    if (client.ws.readyState !== WebSocket.OPEN) return;
    // A welcome can contain seven 2 MiB PNGs encoded as JSON; leave room for its
    // initial delivery before applying the tighter ongoing slow-reader limit.
    const bufferLimit = performance.now() < client.initialSyncUntil ? 32 * 1024 * 1024 : 4 * 1024 * 1024;
    if (client.ws.bufferedAmount > bufferLimit) {
      client.ws.close(1013, 'Connection too slow');
      return;
    }
    client.ws.send(JSON.stringify(message));
  }

  function error(client, code, message) {
    send(client, { type: 'error', code, message });
  }

  function peer(client) {
    return { id: client.id, name: client.name, skin: client.skin, state: { ...client.state }, sprite: client.sprite };
  }

  function armHandshake(client) {
    clearTimeout(client.handshakeTimer);
    client.initialSyncUntil = performance.now() + 30000;
    client.handshakeTimer = setTimeout(() => {
      if (!client.room) client.ws.close(1008, 'Join a room to continue');
    }, config.handshakeMs);
    client.handshakeTimer.unref();
  }

  function broadcast(room, message, except) {
    for (const client of room.members) if (client !== except) send(client, message);
  }

  function gameSnapshot(game) {
    if (!game) return null;
    const state = { id: game.id, kind: game.kind, status: game.status,
      players: [...game.players], winner: game.winner, draw: game.draw };
    if (game.status === 'invited') state.expiresAt = game.expiresAt;
    if (game.kind === 'ttt') {
      state.board = [...game.board];
      state.turn = game.turn;
    } else if (game.kind === 'rps') {
      state.chosen = Object.keys(game.choices);
      state.choices = game.status === 'finished' ? { ...game.choices } : {};
    } else if (game.kind === 'cards') {
      state.drawn = game.draws.map((card) => card.id);
      state.draws = game.status === 'finished' ? game.draws.map((card) => ({ ...card })) : [];
    }
    return state;
  }

  function gameState(room, reason) {
    broadcast(room, { type: 'game_state', game: gameSnapshot(room.game), ...(reason ? { reason } : {}) });
  }

  function handleGame(client, message) {
    const room = client.room;
    let game = room.game;
    if (message.action === 'start') {
      if (game && game.status !== 'finished') return error(client, 'game_busy', 'This room already has a game at the table.');
      if (!['ttt', 'rps', 'cards'].includes(message.game)) return error(client, 'invalid_game', 'Choose a supported game.');
      const opponent = [...room.members].find((member) => member.id === message.opponent && member !== client);
      if (!opponent) return error(client, 'invalid_opponent', 'Choose another friend in this room.');
      game = { id: randomUUID(), kind: message.game, status: 'invited',
        players: [client.id, opponent.id], winner: null, draw: false,
        expiresAt: Date.now() + config.inviteTtlMs };
      if (game.kind === 'ttt') Object.assign(game, { board: Array(9).fill(null), turn: client.id });
      if (game.kind === 'rps') game.choices = {};
      if (game.kind === 'cards') Object.assign(game, { draws: [], deck: Array.from({ length: 52 }, (_, i) => ({
        rank: (i % 13) + 2, suit: ['clubs', 'diamonds', 'hearts', 'spades'][Math.floor(i / 13)],
      })) });
      room.game = game;
      return gameState(room);
    }
    if (!game) return error(client, 'no_game', 'There is no game at the table.');
    if (message.gameId !== undefined && message.gameId !== game.id) return error(client, 'stale_game', 'That game has ended.');
    if (!game.players.includes(client.id)) return error(client, 'not_player', 'Only the invited players can play this game.');
    if (message.action === 'cancel' || message.action === 'decline') {
      room.game = null;
      return gameState(room, message.action === 'decline' ? 'declined' : 'cancelled');
    }
    if (message.action === 'accept') {
      if (game.status !== 'invited' || client.id !== game.players[1]) {
        return error(client, 'invalid_accept', 'Only the invited friend can accept this invitation.');
      }
      if (Date.now() >= game.expiresAt) {
        room.game = null;
        return gameState(room, 'invite_expired');
      }
      game.status = 'active';
      return gameState(room);
    }
    if (game.status !== 'active') return error(client, 'game_not_active', 'Wait for your friend to accept or start a new game.');
    if (game.kind === 'ttt' && message.action === 'move') {
      if (game.turn !== client.id) return error(client, 'not_your_turn', 'It is your friend\'s turn.');
      if (!Number.isInteger(message.cell) || message.cell < 0 || message.cell > 8 || game.board[message.cell] !== null) {
        return error(client, 'invalid_move', 'Choose an empty square.');
      }
      const mark = client.id === game.players[0] ? 'X' : 'O';
      game.board[message.cell] = mark;
      const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
      if (lines.some((line) => line.every((cell) => game.board[cell] === mark))) {
        game.winner = client.id;
        game.status = 'finished';
        game.turn = null;
      } else if (game.board.every((cell) => cell !== null)) {
        game.draw = true;
        game.status = 'finished';
        game.turn = null;
      } else {
        game.turn = game.players.find((id) => id !== client.id);
      }
    } else if (game.kind === 'rps' && message.action === 'choose') {
      if (!['rock', 'paper', 'scissors'].includes(message.choice)) return error(client, 'invalid_choice', 'Choose rock, paper, or scissors.');
      if (Object.hasOwn(game.choices, client.id)) return error(client, 'already_played', 'Your choice is already locked in.');
      game.choices[client.id] = message.choice;
      if (Object.keys(game.choices).length === 2) {
        const [a, b] = game.players;
        const [first, second] = [game.choices[a], game.choices[b]];
        game.draw = first === second;
        game.winner = game.draw ? null : ({ rock: 'scissors', paper: 'rock', scissors: 'paper' }[first] === second ? a : b);
        game.status = 'finished';
      }
    } else if (game.kind === 'cards' && message.action === 'draw') {
      if (game.draws.some((card) => card.id === client.id)) return error(client, 'already_played', 'You have already drawn your card.');
      const [card] = game.deck.splice(secureRandomInt(game.deck.length), 1);
      game.draws.push({ id: client.id, ...card });
      if (game.draws.length === 2) {
        const [first, second] = game.draws;
        game.draw = first.rank === second.rank;
        game.winner = game.draw ? null : (first.rank > second.rank ? first.id : second.id);
        game.status = 'finished';
        game.deck = [];
      }
    } else {
      return error(client, 'invalid_game_action', 'That action is not available for this game.');
    }
    gameState(room);
  }

  function leave(client, acknowledge = false) {
    if (client.room) {
      const room = client.room;
      room.members.delete(client);
      client.room = null;
      if (room.game?.players.includes(client.id)) {
        room.game = null;
        gameState(room, 'player_left');
      }
      if (room.members.size === 0) room.emptySince = Date.now();
      broadcast(room, { type: 'peer_left', id: client.id });
    }
    if (acknowledge) {
      armHandshake(client);
      send(client, { type: 'left' });
    }
  }

  function newCode() {
    let code;
    do {
      code = [...randomBytes(12)].map((byte) => CODE_ALPHABET[byte & 31]).join('');
    } while (rooms.has(code));
    return code;
  }

  function join(client, message) {
    if (client.room) return error(client, 'already_joined', 'Leave your current room first.');
    if (!cleanText(message.name, 24) || !SKINS.includes(message.skin)) {
      return error(client, 'invalid_profile', 'Choose a name of 1–24 characters and a supported pet.');
    }
    if (message.state !== undefined && !validState(message.state)) {
      return error(client, 'invalid_state', 'Pet position or behavior is invalid.');
    }
    let room;
    if (message.type === 'create') {
      if (rooms.size >= config.maxRooms) return error(client, 'server_full', 'The relay is busy. Try again later.');
      const code = newCode();
      room = { code, members: new Set(), emptySince: null, game: null };
      rooms.set(code, room);
    } else {
      room = rooms.get(normalizedCode(message.code));
      if (!room) return error(client, 'room_not_found', 'Room not found. Check the code or create a new room.');
      if (room.members.size >= config.maxPlayers) return error(client, 'room_full', 'This room is full.');
    }
    client.name = message.name.trim();
    client.skin = message.skin;
    client.state = message.state ? publicState(message.state) : { ...DEFAULT_STATE };
    const peers = [...room.members].map(peer);
    room.members.add(client);
    room.emptySince = null;
    client.room = room;
    clearTimeout(client.handshakeTimer);
    send(client, { type: 'welcome', id: client.id, code: room.code, peers, maxPlayers: config.maxPlayers, game: gameSnapshot(room.game) });
    broadcast(room, { type: 'peer_joined', peer: peer(client) }, client);
  }

  function handle(client, raw, isBinary) {
    const now = performance.now();
    const elapsed = (now - client.tokenAt) / 1000;
    client.tokens = Math.min(config.rateBurst, client.tokens + elapsed * config.ratePerSecond);
    client.byteTokens = Math.min(config.byteBurst, client.byteTokens + elapsed * config.byteRatePerSecond);
    client.tokenAt = now;
    if (client.tokens < 1 || client.byteTokens < raw.length) {
      if (!client.rateWarned) error(client, 'rate_limited', 'Sending too quickly.');
      client.rateWarned = true;
      client.ws.close(1008, 'Message rate exceeded');
      return;
    }
    client.tokens -= 1;
    client.byteTokens -= raw.length;
    if (isBinary) return error(client, 'invalid_message', 'Only JSON text messages are supported.');
    let message;
    try { message = JSON.parse(raw.toString('utf8')); }
    catch { return error(client, 'invalid_message', 'Message must be valid JSON.'); }
    if (!ownObject(message) || typeof message.type !== 'string') {
      return error(client, 'invalid_message', 'Message needs a type.');
    }
    if (message.type !== 'sprite' && raw.length > 2048) {
      return error(client, 'invalid_message', 'Message exceeds its size limit.');
    }
    if (message.type === 'create' || message.type === 'join') return join(client, message);
    if (message.type === 'leave') return leave(client, true);
    if (!client.room) return error(client, 'not_joined', 'Create or join a room first.');
    switch (message.type) {
      case 'game':
        handleGame(client, message);
        break;
      case 'roll': {
        const modifier = message.modifier ?? 0;
        if (!DICE_SIDES.includes(message.sides) || !Number.isInteger(modifier) || modifier < -20 || modifier > 20) {
          return error(client, 'invalid_roll', 'Choose d4, d6, d8, d10, d12, d20, or d100 with a modifier from -20 to 20.');
        }
        const roll = secureRandomInt(1, message.sides + 1);
        broadcast(client.room, { type: 'dice', id: client.id, sides: message.sides, roll, modifier,
          total: roll + modifier, natural20: message.sides === 20 && roll === 20,
          natural1: message.sides === 20 && roll === 1 });
        break;
      }
      case 'profile':
        if (!cleanText(message.name, 24) || !SKINS.includes(message.skin)) {
          return error(client, 'invalid_profile', 'Choose a name of 1–24 characters and a supported pet.');
        }
        client.name = message.name.trim();
        client.skin = message.skin;
        broadcast(client.room, { type: 'profile', id: client.id, name: client.name, skin: client.skin }, client);
        break;
      case 'state':
        if (!validState(message.state)) return error(client, 'invalid_state', 'Pet position or behavior is invalid.');
        client.state = publicState(message.state);
        broadcast(client.room, { type: 'state', id: client.id, state: client.state }, client);
        break;
      case 'emote':
        if (!EMOTES.includes(message.emote)) return error(client, 'invalid_emote', 'Unsupported emote.');
        broadcast(client.room, { type: 'emote', id: client.id, emote: message.emote }, client);
        break;
      case 'chat':
        if (!cleanText(message.text, 140)) return error(client, 'invalid_chat', 'Chat must be 1–140 characters on one line.');
        if (message.to !== undefined) {
          const recipient = [...client.room.members].find((member) => member.id === message.to && member !== client);
          if (!recipient) return error(client, 'invalid_recipient', 'Choose another friend in this room.');
          send(recipient, { type: 'chat', id: client.id, text: message.text.trim(), to: recipient.id });
        } else {
          broadcast(client.room, { type: 'chat', id: client.id, text: message.text.trim() }, client);
        }
        break;
      case 'sprite': {
        if (message.sprite === null) {
          spriteMemoryBytes -= client.spriteBytes;
          client.spriteBytes = 0;
          client.sprite = null;
          broadcast(client.room, { type: 'sprite', id: client.id, sprite: null }, client);
          break;
        }
        if (now - client.lastSpriteAt < config.spriteCooldownMs) {
          return error(client, 'sprite_rate_limited', 'Wait two seconds between artwork uploads.');
        }
        client.lastSpriteAt = now;
        const result = validatedSprite(message.sprite);
        if (!result) return error(client, 'invalid_sprite', 'Artwork must be a supported PNG sprite sheet.');
        if (spriteMemoryBytes - client.spriteBytes + result.bytes > config.maxSpriteMemoryBytes) {
          return error(client, 'sprite_capacity', 'The relay artwork budget is full. Try a smaller sprite.');
        }
        spriteMemoryBytes += result.bytes - client.spriteBytes;
        client.spriteBytes = result.bytes;
        client.sprite = result.sprite;
        broadcast(client.room, { type: 'sprite', id: client.id, sprite: client.sprite }, client);
        break;
      }
      default:
        error(client, 'unknown_type', 'Unsupported message type.');
    }
  }

  httpServer.on('upgrade', (req, socket, head) => {
    if (closing || clients.size >= config.maxClients || !['/', '/ws'].includes(req.url)) {
      socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  httpServer.requestTimeout = 10000;
  httpServer.headersTimeout = 10000;
  wss.on('connection', (ws) => {
    const client = {
      ws, id: randomUUID(), room: null, alive: true,
      name: '', skin: 'cream', state: { ...DEFAULT_STATE },
      tokens: config.rateBurst, tokenAt: performance.now(), rateWarned: false,
      byteTokens: config.byteBurst,
      sprite: null, spriteBytes: 0, lastSpriteAt: -Infinity,
      initialSyncUntil: 0,
      handshakeTimer: null,
    };
    clients.add(client);
    armHandshake(client);
    ws.on('pong', () => { client.alive = true; });
    ws.on('message', (data, binary) => handle(client, data, binary));
    ws.on('error', () => {}); // Close events perform cleanup; never log user content.
    ws.on('close', () => {
      clearTimeout(client.handshakeTimer);
      leave(client);
      spriteMemoryBytes -= client.spriteBytes;
      clients.delete(client);
    });
  });
  const heartbeat = setInterval(() => {
    for (const client of clients) {
      if (!client.alive) { client.ws.terminate(); continue; }
      client.alive = false;
      if (client.ws.readyState === WebSocket.OPEN) client.ws.ping();
    }
  }, config.heartbeatMs);
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (room.game?.status === 'invited' && now >= room.game.expiresAt) {
        room.game = null;
        gameState(room, 'invite_expired');
      }
      if (room.members.size === 0 && room.emptySince !== null && now - room.emptySince >= config.emptyRoomTtlMs) {
        rooms.delete(code);
      }
    }
  }, config.sweepMs);
  heartbeat.unref();
  sweep.unref();
  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(config.port, config.host, () => {
      httpServer.off('error', reject);
      resolve();
    });
  });
  const address = httpServer.address();
  return {
    httpServer, wss, port: address.port,
    url: `${options.tls ? 'wss' : 'ws'}://127.0.0.1:${address.port}`,
    get roomCount() { return rooms.size; },
    get clientCount() { return clients.size; },
    async close() {
      closing = true;
      clearInterval(heartbeat);
      clearInterval(sweep);
      for (const client of clients) {
        clearTimeout(client.handshakeTimer);
        client.ws.terminate();
      }
      await Promise.all([
        new Promise((resolve) => wss.close(resolve)),
        new Promise((resolve) => httpServer.close(resolve)),
      ]);
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const relay = await startServer();
  console.log(`DeskFur relay listening on port ${relay.port}`);
  const shutdown = async () => { await relay.close(); process.exit(0); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
