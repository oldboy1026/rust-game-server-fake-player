import { isIP } from 'node:net';
import EMsg from 'steam-user/enums/EMsg.js';
import Schema from 'steam-user/protobufs/generated/_load.js';

const APP_ID = 252490;
const DEADLINE_MS = 30_000;
const UINT32_MAX = 0xffff_ffff;

// Read-only adapter for the pinned steam-user@5.3.0 CM request. The public
// serverQuery wrapper passes the whole server_ip object to intToString and
// assumes server_port, so it cannot safely identify this endpoint as written.
//
// Valve defines gameaddr as the GAME address, and addr as the QUERY address:
// https://partner.steamgames.com/doc/api/ISteamMatchmakingServers
// The backslash filter syntax is the one used by steam-user's serverQuery.
//
// In this package generated/_load.js merges common.json first, then overwrites
// its response type with steammessages_clientserver_gameservers.json. The
// loaded nested Server has query_port=2, auth_players=3, server_ip=4 and
// game_port=9. Verify the pinned loaded type; never interpret query_port as a
// game port or fall back to a different endpoint just to obtain a count.
function supportedSchema() {
  const response = Schema.CMsgGMSClientServerQueryResponse;
  const serverType = response?.fields?.servers?.type;
  if (serverType === '.CMsgGMSClientServerQueryResponse.Server') {
    const fields = response.nested?.Server?.fields;
    if (fields?.game_port?.id === 9 && fields?.query_port?.id === 2
      && fields?.auth_players?.id === 3 && fields?.server_ip?.id === 4) {
      return true;
    }
  }
  return false;
}

function uint32(value) {
  return Number.isInteger(value) && value >= 0 && value <= UINT32_MAX ? value : null;
}

function eresult(value) {
  return Number.isInteger(value) && value >= 0 && value <= 0x7fff_ffff ? value : null;
}

function result(status, authPlayers = null, steamResult = null, resultSource = null) {
  return { status, observedAt: new Date().toISOString(), authPlayers, eresult: steamResult, eresultSource: resultSource };
}

/**
 * Query Steam CM for the authenticated player count of one Rust GAME endpoint.
 * Uses the caller's existing online client; never logs in or changes presence.
 * ensureCurrent must synchronously throw (or return false) after the caller's
 * account/client generation changes. Every outcome resolves safe metadata;
 * no raw server list, error text, account identity or protocol header escapes.
 *
 * status=ok means exactly one requested endpoint supplied auth_players. It
 * does not establish any particular player's admission or protected session.
 */
export async function queryRustSteamCount(client, target, ensureCurrent) {
  const host = target?.host, port = target?.port;
  if (typeof host !== 'string' || isIP(host) !== 4
    || !Number.isInteger(port) || port < 1 || port > 65535) return result('invalid_target');
  if (typeof ensureCurrent !== 'function') return result('invalid_context');
  try { if (ensureCurrent() === false) return result('session_changed'); }
  catch { return result('session_changed'); }
  if (!client?.steamID || !client?._connection) return result('not_online');

  if (client.packageVersion !== '5.3.0' || !supportedSchema() || typeof client._send !== 'function'
    || typeof client.on !== 'function' || typeof client.removeListener !== 'function'
    || !Number.isSafeInteger(client._currentJobID) || client._currentJobID < 0
    || client._currentJobID >= Number.MAX_SAFE_INTEGER
    || typeof client._jobs?.get !== 'function' || typeof client._jobs?.delete !== 'function') {
    return result('unsupported_client');
  }

  const expectedIp = host.split('.').reduce((address, octet) => address * 256 + Number(octet), 0);
  const connection = client._connection;
  const sessionIdentity = client.steamID;
  const jobs = client._jobs;
  // _send increments and registers this ID before emitting its debug event.
  // Capture it before sending because a debug listener may send another job.
  const jobId = String(client._currentJobID + 1);
  const currentStatus = () => {
    try {
      if (ensureCurrent() === false) return 'session_changed';
      if (client._connection !== connection || client.steamID !== sessionIdentity || client._jobs !== jobs) return 'session_changed';
      if (!client.steamID || !client._connection) return 'disconnected';
      return null;
    } catch { return 'session_changed'; }
  };

  return new Promise(resolve => {
    let finished = false, deadline, generationCheck;
    const finish = (status, players = null, steamResult = null, resultSource = null) => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      clearInterval(generationCheck);
      client.removeListener('disconnected', onDisconnected);
      client.removeListener('loggedOn', onRelogged);
      client.removeListener('error', onError);
      // Remove only our own callback from the original generation's job cache.
      // Late responses cannot keep a resolved operation or return stale data.
      try { if (jobs.get(jobId) === onResponse) jobs.delete(jobId); }
      catch { /* A cleared old cache contains no live callback to retain. */ }
      resolve(result(status, players, steamResult, resultSource));
    };
    const onDisconnected = code => finish('disconnected', null, eresult(code), 'disconnect_event');
    const onRelogged = () => finish('session_changed');
    const onError = error => finish('client_error', null, eresult(error?.eresult), 'client_error');
    const onResponse = (body, header) => {
      if (finished) return;
      const state = currentStatus();
      if (state) { finish(state); return; }
      if (header?.msg !== EMsg.GMSClientServerQueryResponse) { finish('invalid_response'); return; }
      // steam-user expands header protobuf defaults. In particular eresult=2
      // can be an omitted field's default, so do not equate the decoded 2 to
      // an observed wire rejection. Preserve it with its source and use the
      // response's error + exact endpoint/count fields to classify this query.
      const code = eresult(header?.proto?.eresult);
      const source = 'steam_user_decoded_header';
      if (body === null || typeof body !== 'object' || Array.isArray(body)) { finish('invalid_response', null, code, source); return; }
      if (body.error) { finish('steam_error', null, code, source); return; }
      if (!Array.isArray(body.servers)) { finish('invalid_response', null, code, source); return; }
      const defaults = body.default_server_data !== null
        && typeof body.default_server_data === 'object' && !Array.isArray(body.default_server_data)
        ? body.default_server_data : {};
      let matches = 0, players = null;
      for (const server of body.servers) {
        if (server === null || typeof server !== 'object' || Array.isArray(server)) continue;
        const address = server.server_ip ?? defaults.server_ip;
        const gamePort = server.game_port ?? defaults.game_port;
        if (uint32(address?.v4) !== expectedIp || gamePort !== port) continue;
        matches++;
        players = uint32(server.auth_players ?? defaults.auth_players);
        if (matches > 1) break;
      }
      if (matches === 0) finish('not_found', null, code, source);
      else if (matches !== 1) finish('ambiguous_response', null, code, source);
      else if (players === null) finish('missing_count', null, code, source);
      else finish('ok', players, code, source);
    };

    client.on('disconnected', onDisconnected);
    client.on('loggedOn', onRelogged);
    client.on('error', onError);
    deadline = setTimeout(() => finish(currentStatus() ?? 'timeout'), DEADLINE_MS);
    generationCheck = setInterval(() => {
      const state = currentStatus();
      if (state) finish(state);
    }, 250);
    try {
      const state = currentStatus();
      if (state) { finish(state); return; }
      client._send(EMsg.ClientGMSServerQuery, {
        app_id: APP_ID,
        filter_text: `\\appid\\${APP_ID}\\gameaddr\\${host}:${port}`,
        max_servers: 16,
      }, onResponse);
    } catch {
      finish(currentStatus() ?? 'query_failed');
    }
  });
}

function supportedServerListSchema() {
  const response = Schema.CGameServers_GetServerList_Response;
  const fields = response?.nested?.Server?.fields;
  return response?.fields?.servers?.type === '.CGameServers_GetServerList_Response.Server'
    && fields?.addr?.id === 1 && fields?.gameport?.id === 2
    && fields?.appid?.id === 6 && fields?.players?.id === 11;
}

function serverListResult(status, players = null, queryPort = null, steamResult = null, resultSource = null) {
  return { status, observedAt: new Date().toISOString(), players, queryPort, eresult: steamResult, eresultSource: resultSource };
}

/**
 * Query the separate GameServers.GetServerList read-only Steam service.
 * Its players field has no authenticated-count guarantee; retain it separately
 * from GMS auth_players. addr contains the QUERY port, while gameport identifies
 * the requested GAME endpoint. Only its numeric count/query port can escape.
 *
 * The pinned public getServerList wrapper offers no callback cancellation and
 * drops the response header. _sendUnified passes its callback directly to _send,
 * so retain that callback and remove only its own job on every completion path.
 */
export async function queryRustSteamServerListCount(client, target, ensureCurrent) {
  const host = target?.host, port = target?.port;
  if (typeof host !== 'string' || isIP(host) !== 4
    || !Number.isInteger(port) || port < 1 || port > 65535) return serverListResult('invalid_target');
  if (typeof ensureCurrent !== 'function') return serverListResult('invalid_context');
  try { if (ensureCurrent() === false) return serverListResult('session_changed'); }
  catch { return serverListResult('session_changed'); }
  if (!client?.steamID || !client?._connection) return serverListResult('not_online');
  if (client.packageVersion !== '5.3.0' || !supportedServerListSchema()
    || typeof client._sendUnified !== 'function' || typeof client._send !== 'function'
    || typeof client.on !== 'function' || typeof client.removeListener !== 'function'
    || !Number.isSafeInteger(client._currentJobID) || client._currentJobID < 0
    || client._currentJobID >= Number.MAX_SAFE_INTEGER
    || typeof client._jobs?.get !== 'function' || typeof client._jobs?.delete !== 'function') {
    return serverListResult('unsupported_client');
  }

  const connection = client._connection;
  const sessionIdentity = client.steamID;
  const jobs = client._jobs;
  const jobId = String(client._currentJobID + 1);
  const currentStatus = () => {
    try {
      if (ensureCurrent() === false) return 'session_changed';
      if (client._connection !== connection || client.steamID !== sessionIdentity || client._jobs !== jobs) return 'session_changed';
      if (!client.steamID || !client._connection) return 'disconnected';
      return null;
    } catch { return 'session_changed'; }
  };

  return new Promise(resolve => {
    let finished = false, deadline, generationCheck;
    const finish = (status, players = null, queryPort = null, steamResult = null, resultSource = null) => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      clearInterval(generationCheck);
      client.removeListener('disconnected', onDisconnected);
      client.removeListener('loggedOn', onRelogged);
      client.removeListener('error', onError);
      try { if (jobs.get(jobId) === onResponse) jobs.delete(jobId); }
      catch { /* A cleared old cache contains no live callback to retain. */ }
      resolve(serverListResult(status, players, queryPort, steamResult, resultSource));
    };
    const onDisconnected = code => finish('disconnected', null, null, eresult(code), 'disconnect_event');
    const onRelogged = () => finish('session_changed');
    const onError = error => finish('client_error', null, null, eresult(error?.eresult), 'client_error');
    const onResponse = (body, header) => {
      if (finished) return;
      const state = currentStatus();
      if (state) { finish(state); return; }
      if (header?.msg !== EMsg.ServiceMethodResponse
        || header?.proto?.target_job_name !== 'GameServers.GetServerList#1') {
        finish('invalid_response'); return;
      }
      const code = eresult(header?.proto?.eresult);
      const source = 'steam_user_decoded_header';
      if (body === null || typeof body !== 'object' || Array.isArray(body)
        || !Array.isArray(body.servers)) {
        finish('invalid_response', null, null, code, source); return;
      }
      let matches = 0, players = null, queryPort = null;
      for (const server of body.servers) {
        if (server === null || typeof server !== 'object' || Array.isArray(server)) continue;
        if (server.gameport !== port || typeof server.addr !== 'string') continue;
        if (server.appid !== null && server.appid !== undefined && server.appid !== APP_ID) continue;
        const address = /^([0-9.]+):([0-9]{1,5})$/.exec(server.addr);
        if (!address || address[1] !== host) continue;
        const candidatePort = Number(address[2]);
        if (candidatePort < 1 || candidatePort > 65535) continue;
        matches++;
        // players is int32 in this service, and omitted values remain unknown.
        players = Number.isInteger(server.players) && server.players >= 0
          && server.players <= 0x7fff_ffff ? server.players : null;
        queryPort = candidatePort;
        if (matches > 1) break;
      }
      // As with the GMS diagnostic, preserve the decoded header result rather
      // than treating an omitted/default eresult=2 as a proven wire rejection.
      if (matches === 0) finish('not_found', null, null, code, source);
      else if (matches !== 1) finish('ambiguous_response', null, null, code, source);
      else if (players === null) finish('missing_count', null, queryPort, code, source);
      else finish('ok', players, queryPort, code, source);
    };

    client.on('disconnected', onDisconnected);
    client.on('loggedOn', onRelogged);
    client.on('error', onError);
    deadline = setTimeout(() => finish(currentStatus() ?? 'timeout'), DEADLINE_MS);
    generationCheck = setInterval(() => {
      const state = currentStatus();
      if (state) finish(state);
    }, 250);
    try {
      const state = currentStatus();
      if (state) { finish(state); return; }
      client._sendUnified('GameServers.GetServerList#1', {
        filter: `\\appid\\${APP_ID}\\gameaddr\\${host}:${port}`,
        limit: 16,
      }, onResponse);
    } catch { finish(currentStatus() ?? 'query_failed'); }
  });
}
