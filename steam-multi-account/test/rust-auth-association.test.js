import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { RustAuthAssociation } from '../src/rust-auth-association.js';

const id = (type, account) => ((1n << 56n) | (BigInt(type) << 52n) | BigInt(account)).toString();
const steam = value => ({ getSteamID64: () => value });
const ownId = id(1, 42), serverId = id(4, 24), otherServer = id(3, 25);
const target = { host: '203.0.113.8', port: 28015 };

function setup() {
  const client = new EventEmitter();
  client.packageVersion = '5.3.0';
  client.steamID = steam(ownId);
  client._connection = {};
  const ticket = { appID: 252490, steamID: steam(ownId), ticketCrc: 123,
    gcToken: '18446744073709551614', validated: false };
  let tickets = [ticket], current = true;
  client.getActiveAuthSessionTickets = () => tickets;
  const options = { client, steamId: ownId, ticketCrc: 123, gcToken: ticket.gcToken,
    publishedServerSteamId: serverId, target, ensureCurrent: () => current };
  const observer = new RustAuthAssociation(options);
  const event = { appID: 252490, ticketCrc: 123, ticketGcToken: ticket.gcToken,
    steamID: steam(serverId), authSessionResponse: 0, state: 2 };
  const admitted = { ...target, state: 'entered_game', endedAt: null,
    metadata: { transportConnected: true, selfEntityObserved: true, finishLoadingObserved: true } };
  return { client, ticket, options, observer, event, admitted,
    validate: () => { ticket.validated = true; client.emit('authTicketStatus', event); },
    replaceTickets: value => { tickets = value; }, changeGeneration: () => { current = false; } };
}

test('requires both a current successful validation and real admission; preserves uint64 identity', () => {
  const s = setup();
  assert.equal(s.observer.activityForSession(s.admitted), null);
  s.validate();
  assert.equal(s.observer.snapshot().validatorMatchesPublishedServer, true);
  assert.deepEqual(s.observer.activityForSession(s.admitted), {
    game_id: 252490, game_ip_address: { v4: 3405803784 }, game_port: 28015, steam_id_gs: serverId,
  });
  for (const session of [null, { ...s.admitted, state: 'receiving_world' },
    { ...s.admitted, port: 28016 }, { ...s.admitted, endedAt: new Date().toISOString() },
    { ...s.admitted, metadata: { ...s.admitted.metadata, finishLoadingObserved: false } }]) {
    assert.equal(s.observer.activityForSession(session), null);
  }
  assert(!JSON.stringify(s.observer.snapshot()).includes(serverId));
  s.observer.close();
});

test('ignores callbacks for different app, CRC or token without accepting them', () => {
  const s = setup();
  for (const change of [{ appID: 1 }, { ticketCrc: 124 }, { ticketGcToken: '2' }, { ticketCrc: '123' }]) {
    s.client.emit('authTicketStatus', { ...s.event, ...change });
  }
  assert.equal(s.observer.snapshot().state, 'waiting_validation');
  assert.equal(s.observer.snapshot().ignoredTicketEvents, 4);
  s.validate();
  assert.equal(s.observer.snapshot().validatorMatchesPublishedServer, true);
  s.observer.close();
});

test('rejects wrong validator, rejected auth, missing active validation and extra own ticket', () => {
  for (const change of ['validator', 'rejection', 'unvalidated', 'duplicate']) {
    const s = setup();
    s.ticket.validated = change !== 'unvalidated';
    if (change === 'duplicate') s.replaceTickets([s.ticket, { ...s.ticket, ticketCrc: 124 }]);
    s.client.emit('authTicketStatus', { ...s.event,
      ...(change === 'validator' ? { steamID: steam(otherServer) } : {}),
      ...(change === 'rejection' ? { authSessionResponse: 1 } : {}),
    });
    assert.equal(s.observer.activityForSession(s.admitted), null);
    assert.notEqual(s.observer.snapshot().state, 'matched');
    // A later success cannot revive a rejected lease.
    s.validate();
    assert.equal(s.observer.activityForSession(s.admitted), null);
    s.observer.close();
  }
});

test('invalidates immediately on cancellation, replaced connection or lease generation', () => {
  for (const change of ['cancel', 'connection', 'generation', 'identity', 'revoke']) {
    const s = setup(); s.validate();
    if (change === 'cancel') s.replaceTickets([]);
    if (change === 'connection') s.client._connection = {};
    if (change === 'generation') s.changeGeneration();
    if (change === 'identity') s.client.steamID = steam(ownId);
    if (change === 'revoke') s.client.emit('authTicketStatus', { ...s.event, authSessionResponse: 1 });
    assert.equal(s.observer.activityForSession(s.admitted), null);
    assert.equal(s.observer.snapshot().validatorMatchesPublishedServer, false);
    s.observer.close();
  }
});

test('close removes only its own listeners and prevents reuse', () => {
  const s = setup(), other = () => {};
  s.client.on('authTicketStatus', other);
  s.validate(); s.observer.close(); s.observer.close();
  assert.deepEqual(s.client.listeners('authTicketStatus'), [other]);
  for (const name of ['disconnected', 'loggedOn', 'error']) assert.equal(s.client.listenerCount(name), 0);
  assert.equal(s.observer.activityForSession(s.admitted), null);
  assert.equal(s.observer.snapshot().closed, true);
});

test('refuses unsupported client, imprecise identity, unbound token or user validator', () => {
  const s = setup(); s.observer.close();
  for (const change of [{ publishedServerSteamId: Number(serverId) },
    { publishedServerSteamId: ownId }, { gcToken: Number(s.ticket.gcToken) },
    { ticketCrc: -1 }, { target: { ...target, host: 'localhost' } }]) {
    assert.throws(() => new RustAuthAssociation({ ...s.options, ...change }));
  }
  s.client.packageVersion = '5.4.0';
  assert.throws(() => new RustAuthAssociation(s.options));
});
