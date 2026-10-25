import { isIP } from 'node:net';

const APP_ID = 252490;
const UINT32_MAX = 0xffff_ffff;

function decimal64(value) {
  // Never route a uint64 through a JavaScript Number, even if its rounded
  // decimal rendering happens to describe a different well-formed identity.
  if (typeof value !== 'string' && (value === null || typeof value !== 'object')) return null;
  const text = typeof value === 'string' ? value : value?.toString?.();
  if (typeof text !== 'string' || !/^[1-9][0-9]{0,19}$/.test(text)) return null;
  try { return BigInt(text) <= 0xffff_ffff_ffff_ffffn ? text : null; }
  catch { return null; }
}

function serverIdentity(value) {
  const text = decimal64(value);
  if (!text) return null;
  const bits = BigInt(text), type = Number((bits >> 52n) & 15n);
  return bits >> 56n === 1n && [3, 4].includes(type) && (bits & 0xffff_ffffn) !== 0n ? text : null;
}

function steamIdentity(value) {
  try { return decimal64(value?.getSteamID64?.()); }
  catch { return null; }
}

// Observes one already-issued, exclusive own ticket. This class does not create
// tickets, authenticate players, send presence, or change any player count.
// Its optional activity payload describes only the admitted session whose real
// validator agrees with a freshly queried identity for the exact destination.
export class RustAuthAssociation {
  #client;
  #connection;
  #identity;
  #ownId;
  #crc;
  #token;
  #serverId;
  #target;
  #ensureCurrent;
  #state = 'waiting_validation';
  #closed = false;
  #matchedEvents = 0;
  #ignoredEvents = 0;
  #listeners;

  constructor({ client, steamId, ticketCrc, gcToken, publishedServerSteamId, target, ensureCurrent }) {
    const server = serverIdentity(publishedServerSteamId), token = decimal64(gcToken);
    if (client?.packageVersion !== '5.3.0' || !client?._connection
        || steamIdentity(client.steamID) !== steamId || !decimal64(steamId)
        || !Number.isInteger(ticketCrc) || ticketCrc < 0 || ticketCrc > UINT32_MAX
        || !token || !server || isIP(target?.host) !== 4
        || !Number.isInteger(target.port) || target.port < 1 || target.port > 65535
        || typeof ensureCurrent !== 'function' || typeof client.on !== 'function'
        || typeof client.removeListener !== 'function'
        || typeof client.getActiveAuthSessionTickets !== 'function') {
      throw new Error('invalid_auth_association_context');
    }
    this.#client = client;
    this.#connection = client._connection;
    this.#identity = client.steamID;
    this.#ownId = steamId;
    this.#crc = ticketCrc;
    this.#token = token;
    this.#serverId = server;
    this.#target = { host: target.host, port: target.port };
    this.#ensureCurrent = ensureCurrent;
    if (!this.#contextCurrent() || !this.#ticket(false)) throw new Error('exclusive_ticket_not_observed');
    this.#listeners = {
      authTicketStatus: event => this.#onValidation(event),
      disconnected: () => this.#invalidate('disconnected'),
      loggedOn: () => this.#invalidate('session_changed'),
      error: () => this.#invalidate('client_error'),
    };
    for (const [event, listener] of Object.entries(this.#listeners)) client.on(event, listener);
  }

  #invalidate(state) {
    if (this.#closed || !['waiting_validation', 'matched'].includes(this.#state)) return;
    this.#state = state;
  }

  #contextCurrent() {
    try {
      return !this.#closed && this.#ensureCurrent() !== false
        && this.#client._connection === this.#connection
        && this.#client.steamID === this.#identity
        && steamIdentity(this.#client.steamID) === this.#ownId;
    } catch { return false; }
  }

  #ticket(requireValidated) {
    try {
      const own = this.#client.getActiveAuthSessionTickets().filter(x =>
        x.appID === APP_ID && steamIdentity(x.steamID) === this.#ownId);
      return own.length === 1 && own[0].ticketCrc === this.#crc
        && decimal64(own[0].gcToken) === this.#token
        && (!requireValidated || own[0].validated === true);
    } catch { return false; }
  }

  #onValidation(event) {
    if (this.#closed || !['waiting_validation', 'matched'].includes(this.#state)) return;
    if (!event || event.appID !== APP_ID || event.ticketCrc !== this.#crc
        || decimal64(event.ticketGcToken) !== this.#token) {
      this.#ignoredEvents++;
      return;
    }
    this.#matchedEvents++;
    if (!this.#contextCurrent()) { this.#invalidate('session_changed'); return; }
    if (event.authSessionResponse !== 0 || !Number.isInteger(event.state) || event.state <= 1) {
      this.#invalidate('validation_rejected'); return;
    }
    if (!this.#ticket(true)) { this.#invalidate('ticket_changed'); return; }
    if (serverIdentity(steamIdentity(event.steamID)) !== this.#serverId) {
      this.#invalidate('validator_mismatch'); return;
    }
    this.#state = 'matched';
  }

  #valid() {
    if (this.#closed || this.#state !== 'matched') return false;
    if (!this.#contextCurrent()) { this.#invalidate('session_changed'); return false; }
    if (!this.#ticket(true)) { this.#invalidate('ticket_changed'); return false; }
    return true;
  }

  snapshot() {
    const verified = this.#valid();
    return { state: this.#state, matchedTicketEvents: this.#matchedEvents,
      ignoredTicketEvents: this.#ignoredEvents, validatorMatchesPublishedServer: verified,
      closed: this.#closed };
  }

  activityForSession(session) {
    if (!this.#valid() || session?.state !== 'entered_game' || session.endedAt
        || session.host !== this.#target.host || session.port !== this.#target.port
        || session.metadata?.transportConnected !== true
        || session.metadata?.selfEntityObserved !== true
        || session.metadata?.finishLoadingObserved !== true) return null;
    return { game_id: APP_ID,
      game_ip_address: { v4: this.#target.host.split('.').reduce((value, part) => value * 256 + Number(part), 0) },
      game_port: this.#target.port, steam_id_gs: this.#serverId };
  }

  close() {
    if (this.#closed) return;
    for (const [event, listener] of Object.entries(this.#listeners)) this.#client.removeListener(event, listener);
    this.#closed = true;
    this.#state = 'closed';
    this.#client = this.#connection = this.#identity = this.#ensureCurrent = null;
    this.#ownId = this.#token = this.#serverId = null;
  }
}
