import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { WebSocket } from 'ws';
import { startServer } from '../server.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7pQxkAAAAASUVORK5CYII=';
const state = { x: 0.25, y: 0.8, behavior: 'walk', facing: -1, expression: 'neutral' };
const sprite = () => ({ name: 'Tiny Pal', fps: 8, frameWidth: 1, frameHeight: 1,
  animations: { idle: [0], walk: [0], sleep: [0], play: [0] }, image: `data:image/png;base64,${png}` });

async function connect(t, relay, options = {}) {
  const ws = new WebSocket(relay.url, options);
  const inbox = [];
  ws.on('message', (raw) => inbox.push(JSON.parse(raw)));
  await once(ws, 'open');
  t.after(() => { ws.terminate(); });
  return {
    ws, inbox,
    send(message) { ws.send(JSON.stringify(message)); },
    async next(type, timeout = 1500) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const index = inbox.findIndex((message) => message.type === type);
        if (index >= 0) return inbox.splice(index, 1)[0];
        await delay(5);
      }
      assert.fail(`Timed out waiting for ${type}: ${JSON.stringify(inbox)}`);
    },
  };
}

async function server(t, options = {}) {
  const relay = await startServer({ port: 0, host: '127.0.0.1', ...options });
  t.after(() => relay.close());
  return relay;
}

async function create(client, name = 'Rowan') {
  client.send({ type: 'create', name, skin: 'fox', state });
  return client.next('welcome');
}

async function join(client, code, name = 'Mika') {
  client.send({ type: 'join', code, name, skin: 'cat' });
  return client.next('welcome');
}

test('HTTP health reports service availability without room codes', async (t) => {
  const relay = await server(t);
  const response = await fetch(`http://127.0.0.1:${relay.port}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: 'deskfur-relay', protocol: 1 });
  assert.equal((await fetch(`http://127.0.0.1:${relay.port}/`)).status, 404);
});

test('real clients create private room, join, and exchange normalized state', async (t) => {
  const relay = await server(t);
  const a = await connect(t, relay);
  const b = await connect(t, relay);
  const created = await create(a);
  assert.match(created.code, /^[A-HJ-NP-Z2-9]{12}$/u);
  assert.equal(created.peers.length, 0);
  const joined = await join(b, created.code.toLowerCase());
  assert.equal(joined.code, created.code);
  assert.equal(joined.peers[0].id, created.id);
  assert.deepEqual(joined.peers[0].state, { ...state, pose: state.behavior });
  assert.equal(joined.peers[0].sprite, null);
  const peerJoined = await a.next('peer_joined');
  assert.equal(peerJoined.peer.name, 'Mika');
  b.send({ type: 'state', id: 'spoofed', state: { ...state, x: 0.9 } });
  const movement = await a.next('state');
  assert.equal(movement.id, joined.id);
  assert.equal(movement.state.x, 0.9);
  await delay(20);
  assert.equal(b.inbox.some((message) => message.type === 'state'), false);
});

test('chat and emotes reach only friends inside the same room', async (t) => {
  const relay = await server(t);
  const a = await connect(t, relay);
  const b = await connect(t, relay);
  const outsider = await connect(t, relay);
  const first = await create(a);
  const second = await create(outsider, 'Elsewhere');
  assert.notEqual(first.code, second.code);
  await join(b, first.code);
  b.send({ type: 'chat', text: ' hello friend ' });
  assert.equal((await a.next('chat')).text, 'hello friend');
  b.send({ type: 'emote', emote: 'heart' });
  assert.equal((await a.next('emote')).emote, 'heart');
  await delay(40);
  assert.equal(outsider.inbox.length, 0);
});

test('unknown rooms, invalid profiles, malformed JSON and binary fail safely', async (t) => {
  const relay = await server(t);
  const a = await connect(t, relay);
  a.send({ type: 'join', code: 'AAAAAAAAAAAA', name: 'A', skin: 'cream' });
  assert.equal((await a.next('error')).code, 'room_not_found');
  a.send({ type: 'create', name: 'A', skin: '../../file.png' });
  assert.equal((await a.next('error')).code, 'invalid_profile');
  a.ws.send('not JSON');
  assert.equal((await a.next('error')).code, 'invalid_message');
  a.ws.send(Buffer.from('binary'));
  assert.equal((await a.next('error')).code, 'invalid_message');
  a.send({ type: 'chat', text: 'not joined' });
  assert.equal((await a.next('error')).code, 'not_joined');
  await create(a);
  a.send({ type: 'create', name: 'Another', skin: 'fox' });
  assert.equal((await a.next('error')).code, 'already_joined');
  a.send({ type: 'evaluate', script: 'anything' });
  assert.equal((await a.next('error')).code, 'unknown_type');
});

test('invalid movements, chat and emotes are rejected instead of forwarded', async (t) => {
  const relay = await server(t);
  const a = await connect(t, relay);
  const b = await connect(t, relay);
  const created = await create(a);
  await join(b, created.code);
  await a.next('peer_joined');
  for (const invalidState of [
    { ...state, x: -0.1 }, { ...state, y: 2 }, { ...state, x: '0.5' },
    { ...state, behavior: 'execute' }, { ...state, facing: 0 },
  ]) {
    b.send({ type: 'state', state: invalidState });
    assert.equal((await b.next('error')).code, 'invalid_state');
  }
  b.send({ type: 'chat', text: 'x'.repeat(141) });
  assert.equal((await b.next('error')).code, 'invalid_chat');
  b.send({ type: 'chat', text: 'a\nb' });
  assert.equal((await b.next('error')).code, 'invalid_chat');
  b.send({ type: 'emote', emote: 'file:///etc/passwd' });
  assert.equal((await b.next('error')).code, 'invalid_emote');
  b.send({ type: 'chat', text: 'x'.repeat(3000) });
  assert.equal((await b.next('error')).code, 'invalid_message');
  assert.equal(a.inbox.length, 0);
});

test('room capacity is enforced and slot becomes available after leaving', async (t) => {
  const relay = await server(t, { maxPlayers: 2 });
  const a = await connect(t, relay);
  const b = await connect(t, relay);
  const c = await connect(t, relay);
  const created = await create(a);
  const bWelcome = await join(b, created.code);
  c.send({ type: 'join', code: created.code, name: 'Third', skin: 'wolf' });
  assert.equal((await c.next('error')).code, 'room_full');
  b.send({ type: 'leave' });
  await b.next('left');
  assert.equal((await a.next('peer_left')).id, bWelcome.id);
  assert.equal((await join(c, created.code)).peers.length, 1);
});

test('unexpected disconnect announces departure and reconnect can use same code', async (t) => {
  const relay = await server(t);
  const a = await connect(t, relay);
  const b = await connect(t, relay);
  const created = await create(a);
  const bWelcome = await join(b, created.code);
  b.ws.terminate();
  assert.equal((await a.next('peer_left')).id, bWelcome.id);
  const reconnected = await connect(t, relay);
  const welcome = await join(reconnected, created.code);
  assert.notEqual(welcome.id, bWelcome.id);
  assert.equal(welcome.peers.length, 1);
});

test('empty rooms survive brief reconnect, then expire', async (t) => {
  const relay = await server(t, { emptyRoomTtlMs: 80, sweepMs: 10 });
  const a = await connect(t, relay);
  const created = await create(a);
  a.send({ type: 'leave' });
  await a.next('left');
  await join(a, created.code);
  a.send({ type: 'leave' });
  await a.next('left');
  await delay(120);
  assert.equal(relay.roomCount, 0);
  a.send({ type: 'join', code: created.code, name: 'Again', skin: 'cream' });
  assert.equal((await a.next('error')).code, 'room_not_found');
});

test('rate-limited clients are closed while other peers keep working', async (t) => {
  const relay = await server(t, { rateBurst: 4, ratePerSecond: 0 });
  const a = await connect(t, relay);
  const b = await connect(t, relay);
  const created = await create(a);
  await join(b, created.code);
  const closed = once(b.ws, 'close');
  for (let i = 0; i < 8; i += 1) b.send({ type: 'state', state });
  assert.equal((await b.next('error')).code, 'rate_limited');
  assert.equal((await closed)[0], 1008);
  assert.equal(a.ws.readyState, WebSocket.OPEN);
});

test('oversized messages close sender with 1009 and room remains healthy', async (t) => {
  const relay = await server(t, { maxPayload: 4096 });
  const a = await connect(t, relay);
  await create(a);
  const closed = once(a.ws, 'close');
  a.ws.send('x'.repeat(4097));
  assert.equal((await closed)[0], 1009);
});

test('idle clients and missing pong responses are cleaned up', async (t) => {
  const relay = await server(t, { handshakeMs: 35, heartbeatMs: 25 });
  const idle = await connect(t, relay);
  const idleClosed = once(idle.ws, 'close');
  assert.equal((await idleClosed)[0], 1008);
  const noPong = await connect(t, relay, { autoPong: false });
  await create(noPong);
  const noPongClosed = once(noPong.ws, 'close');
  assert.equal((await noPongClosed)[0], 1006);
});

test('validated PNG sprite is relayed, included in joins, and can be reset', async (t) => {
  const relay = await server(t);
  const a = await connect(t, relay);
  const b = await connect(t, relay);
  const created = await create(a);
  await join(b, created.code);
  a.send({ type: 'sprite', sprite: sprite() });
  const artwork = await b.next('sprite');
  assert.equal(artwork.id, created.id);
  assert.deepEqual(artwork.sprite, sprite());
  const c = await connect(t, relay);
  assert.deepEqual((await join(c, created.code, 'Third')).peers[0].sprite, sprite());
  a.send({ type: 'sprite', sprite: null });
  assert.equal((await b.next('sprite')).sprite, null);
});

test('sprite metadata, image bounds, URLs, and giant frame indices are rejected', async (t) => {
  const relay = await server(t, { spriteCooldownMs: 0 });
  const a = await connect(t, relay);
  await create(a);
  const tooWide = Buffer.from(png, 'base64');
  tooWide.writeUInt32BE(5000, 16);
  const invalid = [
    { ...sprite(), image: 'https://example.com/file.png' },
    { ...sprite(), image: 'data:image/png;base64,AAAA' },
    { ...sprite(), image: `data:image/png;base64,${tooWide.toString('base64')}` },
    { ...sprite(), frameWidth: 0 }, { ...sprite(), fps: 100 },
    { ...sprite(), animations: { idle: [999] } },
    { ...sprite(), image: `data:image/png;base64,${Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64')}` },
  ];
  for (const value of invalid) {
    a.send({ type: 'sprite', sprite: value });
    assert.equal((await a.next('error')).code, 'invalid_sprite');
  }
});

test('sprite upload cooldown and aggregate memory budget are enforced', async (t) => {
  const relay = await server(t, { maxSpriteMemoryBytes: 80 });
  const a = await connect(t, relay);
  const b = await connect(t, relay);
  const created = await create(a);
  await join(b, created.code);
  a.send({ type: 'sprite', sprite: sprite() });
  await b.next('sprite');
  a.send({ type: 'sprite', sprite: sprite() });
  assert.equal((await a.next('error')).code, 'sprite_rate_limited');
  b.send({ type: 'sprite', sprite: sprite() });
  assert.equal((await b.next('error')).code, 'sprite_capacity');
});

test('a real TLS WebSocket listener carries room messages over WSS', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'desktop-pals-tls-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-keyout', path.join(dir, 'key.pem'), '-out', path.join(dir, 'cert.pem'),
    '-subj', '/CN=localhost'], { stdio: 'ignore' });
  const relay = await server(t, { tls: {
    key: readFileSync(path.join(dir, 'key.pem')), cert: readFileSync(path.join(dir, 'cert.pem')),
  } });
  const a = await connect(t, relay, { rejectUnauthorized: false }); // Ephemeral test certificate only.
  const b = await connect(t, relay, { rejectUnauthorized: false });
  const created = await create(a);
  await join(b, created.code);
  b.send({ type: 'emote', emote: 'wave' });
  assert.equal((await a.next('emote')).emote, 'wave');
  const health = await new Promise((resolve, reject) => {
    https.get(`https://127.0.0.1:${relay.port}/health`, { rejectUnauthorized: false }, (res) => {
      let body = '';
      res.on('data', (part) => { body += part; });
      res.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
  assert.equal(health.ok, true);
});

async function table(t, options = {}) {
  const relay = await server(t, options);
  const a = await connect(t, relay);
  const b = await connect(t, relay);
  const created = await create(a);
  const joined = await join(b, created.code);
  return { relay, a, b, host: created.id, guest: joined.id, code: created.code };
}

async function invite(table, kind) {
  table.a.send({ type: 'game', action: 'start', game: kind, opponent: table.guest });
  const game = (await table.a.next('game_state')).game;
  assert.equal((await table.b.next('game_state')).game.id, game.id);
  return game;
}

async function accept(table) {
  table.b.send({ type: 'game', action: 'accept' });
  const game = (await table.a.next('game_state')).game;
  assert.equal((await table.b.next('game_state')).game.status, 'active');
  return game;
}

async function move(table, client, message) {
  client.send({ type: 'game', ...message });
  const game = (await table.a.next('game_state')).game;
  assert.equal((await table.b.next('game_state')).game.id, game.id);
  return game;
}

test('game invitations require explicit guest acceptance, and spectators cannot play', async (t) => {
  const gameTable = await table(t);
  const { relay, a, b, host, guest, code } = gameTable;
  const spectator = await connect(t, relay);
  await join(spectator, code, 'Spectator');
  a.send({ type: 'game', action: 'start', game: 'ttt', opponent: host });
  assert.equal((await a.next('error')).code, 'invalid_opponent');
  const invited = await invite(gameTable, 'ttt');
  assert.equal(invited.status, 'invited');
  assert.deepEqual(invited.players, [host, guest]);
  a.send({ type: 'game', action: 'move', cell: 0 });
  assert.equal((await a.next('error')).code, 'game_not_active');
  a.send({ type: 'game', action: 'accept' });
  assert.equal((await a.next('error')).code, 'invalid_accept');
  spectator.send({ type: 'game', action: 'accept' });
  assert.equal((await spectator.next('error')).code, 'not_player');
  b.send({ type: 'game', action: 'start', game: 'rps', opponent: host });
  assert.equal((await b.next('error')).code, 'game_busy');
  assert.equal((await accept(gameTable)).turn, host);
  const lateJoiner = await connect(t, relay);
  const lateWelcome = await join(lateJoiner, code, 'Late');
  assert.equal(lateWelcome.game.status, 'active');
  assert.equal(lateWelcome.game.id, invited.id);
});

test('tic-tac-toe enforces turns and legal squares and finds the winner', async (t) => {
  const gameTable = await table(t);
  const { a, b, host, guest } = gameTable;
  await invite(gameTable, 'ttt');
  await accept(gameTable);
  b.send({ type: 'game', action: 'move', cell: 0 });
  assert.equal((await b.next('error')).code, 'not_your_turn');
  let game = await move(gameTable, a, { action: 'move', cell: 0 });
  assert.equal(game.board[0], 'X');
  assert.equal(game.turn, guest);
  b.send({ type: 'game', action: 'move', cell: 0 });
  assert.equal((await b.next('error')).code, 'invalid_move');
  b.send({ type: 'game', action: 'move', cell: 99 });
  assert.equal((await b.next('error')).code, 'invalid_move');
  await move(gameTable, b, { action: 'move', cell: 3 });
  await move(gameTable, a, { action: 'move', cell: 1 });
  await move(gameTable, b, { action: 'move', cell: 4 });
  game = await move(gameTable, a, { action: 'move', cell: 2 });
  assert.equal(game.status, 'finished');
  assert.equal(game.winner, host);
  assert.equal(game.draw, false);
  assert.equal(game.turn, null);
});

test('tic-tac-toe detects a full-board draw and permits a new invitation', async (t) => {
  const gameTable = await table(t);
  await invite(gameTable, 'ttt');
  await accept(gameTable);
  const cells = [0, 1, 2, 4, 3, 5, 7, 6, 8];
  let game;
  for (let index = 0; index < cells.length; index += 1) {
    game = await move(gameTable, index % 2 === 0 ? gameTable.a : gameTable.b,
      { action: 'move', cell: cells[index] });
  }
  assert.equal(game.status, 'finished');
  assert.equal(game.draw, true);
  assert.equal(game.winner, null);
  assert.equal((await invite(gameTable, 'rps')).status, 'invited');
});

test('RPS keeps choices secret until both lock in, then resolves win and draw', async (t) => {
  const gameTable = await table(t);
  const { a, b, host, relay, code } = gameTable;
  await invite(gameTable, 'rps');
  await accept(gameTable);
  let game = await move(gameTable, a, { action: 'choose', choice: 'rock' });
  assert.deepEqual(game.choices, {});
  assert.deepEqual(game.chosen, [host]);
  assert.equal(JSON.stringify(game).includes('rock'), false);
  const spectator = await connect(t, relay);
  assert.deepEqual((await join(spectator, code, 'Spectator')).game.choices, {});
  a.send({ type: 'game', action: 'choose', choice: 'paper' });
  assert.equal((await a.next('error')).code, 'already_played');
  b.send({ type: 'game', action: 'choose', choice: 'fire' });
  assert.equal((await b.next('error')).code, 'invalid_choice');
  game = await move(gameTable, b, { action: 'choose', choice: 'scissors' });
  assert.equal(game.status, 'finished');
  assert.equal(game.winner, host);
  assert.equal(game.choices[host], 'rock');
  await invite(gameTable, 'rps');
  await accept(gameTable);
  await move(gameTable, a, { action: 'choose', choice: 'paper' });
  game = await move(gameTable, b, { action: 'choose', choice: 'paper' });
  assert.equal(game.draw, true);
  assert.equal(game.winner, null);
});

test('high-card draws without replacement, hides pending cards, and resolves rank winner', async (t) => {
  const picks = [12, 11];
  const gameTable = await table(t, { randomInt: () => picks.shift() });
  const { a, b, host } = gameTable;
  await invite(gameTable, 'cards');
  await accept(gameTable);
  let game = await move(gameTable, a, { action: 'draw' });
  assert.deepEqual(game.draws, []);
  assert.deepEqual(game.drawn, [host]);
  a.send({ type: 'game', action: 'draw' });
  assert.equal((await a.next('error')).code, 'already_played');
  game = await move(gameTable, b, { action: 'draw' });
  assert.equal(game.status, 'finished');
  assert.equal(game.winner, host);
  assert.equal(game.draws[0].rank, 14);
  assert.equal(game.draws[1].rank, 13);
  assert.equal(game.draws[0].suit, 'clubs');
  assert.notDeepEqual(game.draws[0], game.draws[1]);
});

test('high-card equal ranks are a draw, without duplicate physical cards', async (t) => {
  const picks = [0, 12];
  const gameTable = await table(t, { randomInt: () => picks.shift() });
  await invite(gameTable, 'cards');
  await accept(gameTable);
  await move(gameTable, gameTable.a, { action: 'draw' });
  const game = await move(gameTable, gameTable.b, { action: 'draw' });
  assert.equal(game.draw, true);
  assert.equal(game.winner, null);
  assert.equal(game.draws[0].rank, game.draws[1].rank);
  assert.notEqual(game.draws[0].suit, game.draws[1].suit);
});

test('cancel, decline, invitation expiry and player disconnect clear table state', async (t) => {
  const gameTable = await table(t, { inviteTtlMs: 50, sweepMs: 10 });
  const { a, b, relay, code } = gameTable;
  await invite(gameTable, 'ttt');
  b.send({ type: 'game', action: 'decline' });
  assert.equal((await a.next('game_state')).reason, 'declined');
  assert.equal((await b.next('game_state')).game, null);
  await invite(gameTable, 'ttt');
  a.send({ type: 'game', action: 'cancel' });
  assert.equal((await a.next('game_state')).game, null);
  await b.next('game_state');
  await invite(gameTable, 'ttt');
  assert.equal((await a.next('game_state')).reason, 'invite_expired');
  await b.next('game_state');
  await invite(gameTable, 'rps');
  await accept(gameTable);
  b.ws.terminate();
  assert.equal((await a.next('game_state')).reason, 'player_left');
  const replacement = await connect(t, relay);
  assert.equal((await join(replacement, code, 'Replacement')).game, null);
});

test('shared dice validate sides and modifiers, isolate rooms, and include natural flags', async (t) => {
  const gameTable = await table(t, { randomInt: (min, max) => max - 1 });
  const { a, b, host, relay } = gameTable;
  const outsider = await connect(t, relay);
  await create(outsider, 'Elsewhere');
  a.send({ type: 'roll', sides: 20, modifier: 5 });
  const die = await a.next('dice');
  assert.deepEqual(die, { type: 'dice', id: host, sides: 20, roll: 20, modifier: 5,
    total: 25, natural20: true, natural1: false });
  assert.deepEqual(await b.next('dice'), die);
  assert.equal(outsider.inbox.length, 0);
  for (const sides of [4, 6, 8, 10, 12, 100]) {
    a.send({ type: 'roll', sides, modifier: -2 });
    const result = await a.next('dice');
    assert.equal(result.total, sides - 2);
    assert.equal(result.natural20, false);
    await b.next('dice');
  }
  for (const payload of [{ sides: 5 }, { sides: 20, modifier: 21 }, { sides: 6, modifier: 1.5 }]) {
    a.send({ type: 'roll', ...payload });
    assert.equal((await a.next('error')).code, 'invalid_roll');
  }
});

test('profile changes and optional expressions are validated and relayed live', async (t) => {
  const gameTable = await table(t);
  const { a, b, relay, code, host } = gameTable;
  a.send({ type: 'profile', name: 'Taron', skin: 'cream' });
  assert.deepEqual(await b.next('profile'), { type: 'profile', id: host, name: 'Taron', skin: 'cream' });
  a.send({ type: 'state', state: { ...state, expression: 'surprised' } });
  assert.equal((await b.next('state')).state.expression, 'surprised');
  a.send({ type: 'state', state: { x: 0.5, y: 0.5, behavior: 'idle', facing: 1 } });
  assert.equal((await b.next('state')).state.expression, 'neutral');
  a.send({ type: 'state', state: { ...state, expression: 'execute' } });
  assert.equal((await a.next('error')).code, 'invalid_state');
  a.send({ type: 'profile', name: 'Taron', skin: 'remote-url' });
  assert.equal((await a.next('error')).code, 'invalid_profile');
  for (const emote of ['food', 'pet', 'time']) {
    a.send({ type: 'emote', emote });
    assert.equal((await b.next('emote')).emote, emote);
  }
  const c = await connect(t, relay);
  const welcome = await join(c, code, 'Third');
  assert.equal(welcome.peers[0].name, 'Taron');
  assert.equal(welcome.peers[0].skin, 'cream');
});

test('direct chat is private to one same-room recipient', async (t) => {
  const gameTable = await table(t);
  const { a, b, relay, code, host, guest } = gameTable;
  const c = await connect(t, relay);
  await join(c, code, 'Third');
  const outsider = await connect(t, relay);
  const otherRoom = await create(outsider, 'Elsewhere');
  a.send({ type: 'chat', to: guest, text: 'Just us' });
  assert.deepEqual(await b.next('chat'), { type: 'chat', id: host, to: guest, text: 'Just us' });
  await delay(30);
  assert.equal(c.inbox.some((message) => message.type === 'chat'), false);
  assert.equal(outsider.inbox.length, 0);
  a.send({ type: 'chat', to: otherRoom.id, text: 'No room crossing' });
  assert.equal((await a.next('error')).code, 'invalid_recipient');
});

test('sprite expression and interaction animations are preserved with bounded frame arrays', async (t) => {
  const gameTable = await table(t, { spriteCooldownMs: 0 });
  const value = sprite();
  for (const key of ['eat', 'pet', 'happy', 'sad', 'surprised', 'angry']) value.animations[key] = [0];
  gameTable.a.send({ type: 'sprite', sprite: value });
  assert.deepEqual((await gameTable.b.next('sprite')).sprite.animations, value.animations);
  value.animations.happy = Array(65).fill(0);
  gameTable.a.send({ type: 'sprite', sprite: value });
  assert.equal((await gameTable.a.next('error')).code, 'invalid_sprite');
});

test('Shimeji poses synchronize live and on joins while old clients inherit their behavior', async (t) => {
  const gameTable = await table(t);
  const { a, b, relay, code, host } = gameTable;
  for (const pose of ['idle', 'walk', 'sit', 'climb', 'hang', 'fall', 'jump', 'drag', 'land', 'sleep', 'play']) {
    a.send({ type: 'state', state: { ...state, pose } });
    const update = await b.next('state');
    assert.equal(update.id, host);
    assert.equal(update.state.pose, pose);
    assert.equal(update.state.behavior, state.behavior, 'a motion pose does not replace the base behavior');
  }
  a.send({ type: 'state', state: { ...state, pose: 'hang' } });
  await b.next('state');
  const c = await connect(t, relay);
  assert.equal((await join(c, code, 'Third')).peers[0].state.pose, 'hang');
  for (const behavior of ['idle', 'walk', 'sleep', 'play']) {
    a.send({ type: 'state', state: { ...state, behavior } });
    assert.equal((await b.next('state')).state.pose, behavior);
  }
  for (const pose of ['execute', '', null, 1, ['walk'], {}]) {
    a.send({ type: 'state', state: { ...state, pose } });
    assert.equal((await a.next('error')).code, 'invalid_state');
  }
  assert.equal(b.inbox.some(message => message.type === 'state'), false);
  const legacy = await connect(t, relay);
  legacy.send({ type: 'create', name: 'Legacy', skin: 'cream' });
  const legacyRoom = await legacy.next('welcome');
  const legacyGuest = await connect(t, relay);
  assert.equal((await join(legacyGuest, legacyRoom.code)).peers[0].state.pose, 'idle');
});

test('Shimeji sprite animations are shared and bounded using the same animation whitelist', async (t) => {
  const gameTable = await table(t, { spriteCooldownMs: 0 });
  const value = sprite();
  for (const key of ['sit', 'climb', 'hang', 'fall', 'jump', 'drag', 'land']) value.animations[key] = [0, 0];
  gameTable.a.send({ type: 'sprite', sprite: value });
  assert.deepEqual((await gameTable.b.next('sprite')).sprite.animations, value.animations);
  const late = await connect(t, gameTable.relay);
  assert.deepEqual((await join(late, gameTable.code)).peers[0].sprite.animations, value.animations);
  for (const key of ['sit', 'climb', 'hang', 'fall', 'jump', 'drag', 'land']) {
    for (const frames of [[], [1], [-1], Array(65).fill(0), '0']) {
      gameTable.a.send({ type: 'sprite', sprite: { ...value, animations: { ...value.animations, [key]: frames } } });
      assert.equal((await gameTable.a.next('error')).code, 'invalid_sprite');
    }
  }
  gameTable.a.send({ type: 'sprite', sprite: { ...value, animations: { ...value.animations, execute: [0] } } });
  assert.equal((await gameTable.a.next('error')).code, 'invalid_sprite');
});
