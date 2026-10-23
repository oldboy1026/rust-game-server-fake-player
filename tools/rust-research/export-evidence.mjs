import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const output = new URL('../../rust-research/', import.meta.url);
const read = async name => (await readFile(new URL(name, import.meta.url), 'utf8')).replace(/^\uFEFF/, '');
const modules = JSON.parse(await read('original-metadata.json'));
const sdkEnums = JSON.parse(await read('sdk-enums.json'));
const module = name => modules.find(x => x.assembly === name);
const type = (assembly, name) => module(assembly).types.find(x => x.name === name);
const ilCache = new Map();
async function method(assembly, identifier) {
  if (!ilCache.has(assembly)) ilCache.set(assembly, (await read(`original-${assembly}.il.txt`)).split(/^METHOD /m));
  const body = ilCache.get(assembly).find(x => x.split('\n')[0].includes(identifier));
  assert(body, `Missing method ${identifier}`);
  return { body, signature: body.split('\n')[0].trim(), token: `0x${Number(body.split('\n')[0].match(/TOKEN (\d+)/)[1]).toString(16)}`, textSha256: createHash('sha256').update(body).digest('hex') };
}
const auth = await method('Assembly-CSharp.dll', 'ServerMgr::OnGiveUserInformation(');
assert(auth.body.includes('ldc.i4 2635') && auth.body.includes('ldc.i4 228'));
const packet = await method('Facepunch.Network.dll', 'Network.NetWrite::PacketID(');
assert(packet.body.includes('ldc.i4 140'));
const credentials = sdkEnums.find(x => x.name.endsWith('.ExternalCredentialType'));
assert.equal(credentials.values.find(x => x.name === 'SteamAppTicket').value, 1);

const messages = type('Facepunch.Network.dll', 'Network.Message/Type').fields
  .filter(x => Number.isInteger(x.constant) && !['First', 'Last', 'Count'].includes(x.name))
  .map(x => ({ name: x.name, enumValue: x.constant, applicationHeaderByte: x.constant + 140, applicationHeaderHex: `0x${(x.constant + 140).toString(16).toUpperCase()}` }));
const states = type('Facepunch.Network.dll', 'Network.Connection/State').fields.filter(x => x.constant !== null).map(x => ({ name: x.name, value: x.constant }));
const schemas = {
  PlayerTick: [
    { number: 1, name: 'inputState', type: 'InputMessage', wireType: 2, requiredByFullSerializer: true },
    { number: 2, name: 'position', type: 'UnityEngine.Vector3', wireType: 2 },
    { number: 4, name: 'modelState', type: 'ModelState', wireType: 2, requiredByFullSerializer: true },
    { number: 5, name: 'activeItem', type: 'ItemId/uint64', wireType: 0 },
    { number: 6, name: 'eyePos', type: 'UnityEngine.Vector3', wireType: 2 },
    { number: 7, name: 'parentID', type: 'NetworkableId/uint64', wireType: 0 },
    { number: 8, name: 'deltaMs', type: 'uint32', wireType: 0 },
  ],
  InputMessage: [
    { number: 1, name: 'buttons', type: 'int32', wireType: 0 },
    { number: 2, name: 'aimAngles', type: 'UnityEngine.Vector3', wireType: 2 },
    { number: 3, name: 'mouseDelta', type: 'UnityEngine.Vector3', wireType: 2 },
  ],
  'ProtoBuf.ClientReady': [
    { number: 1, name: 'clientInfo', type: 'ProtoBuf.ClientReady/ClientInfo', wireType: 2, repeated: true },
    { number: 2, name: 'globalNetworking', type: 'bool', wireType: 0 },
    { number: 3, name: 'party', type: 'ProtoBuf.PartyData', wireType: 2 },
  ],
  'ProtoBuf.ClientReady/ClientInfo': [
    { number: 1, name: 'name', type: 'string', wireType: 2 },
    { number: 2, name: 'value', type: 'string', wireType: 2 },
  ],
};
for (const [name, fields] of Object.entries(schemas)) {
  const definition = type('Rust.Data.dll', name);
  assert(definition, `Missing schema ${name}`);
  const serialize = await method('Rust.Data.dll', `${name}::Serialize(BufferStream,${name})`);
  for (const field of fields) {
    assert(definition.fields.some(x => x.name === field.name));
    const tag = (field.number << 3) | field.wireType;
    const constant = tag < 9 ? `ldc.i4.${tag}` : `ldc.i4.s ${tag}`;
    assert(serialize.body.includes(constant), `Missing tag ${name}.${field.name}`);
  }
}

const factSpecs = [
  ['Facepunch.Network.dll', 'Network.Server::OnNewConnection(Network.Connection)', 'After transport admission, the server sends RequestUserInformation.'],
  ['Facepunch.Network.dll', 'Network.NetWrite::PacketID(', 'The application message header is the enum value plus 140; it is not a raw UDP packet identifier.'],
  ['Assembly-CSharp.dll', 'ServerMgr::OnGiveUserInformation(', 'The server validates the application connection marker and protocol, and reads Steam and anti-cheat identity data.'],
  ['Assembly-CSharp.dll', 'ConnectionAuth/<AuthorisationRoutine>d__6::MoveNext()', 'The authentication coroutine runs Steam, EAC and additional server admission checks before queue admission.'],
  ['Assembly-CSharp.dll', 'Auth_Steam/<Run>d__1::MoveNext()', 'The Steam platform session is started using the supplied Steam ID and token.'],
  ['Assembly-CSharp.dll', 'Auth_EAC/<Run>d__0::MoveNext()', 'EAC registration and authentication progress are separate from the Steam session.'],
  ['Assembly-CSharp.dll', 'ServerMgr::JoinGame(', 'Approval includes world data and the selected network encryption level.'],
  ['Assembly-CSharp.dll', 'ServerMgr::ClientReady(', 'ClientReady is a Protobuf message and advances a welcoming connection into the connected state.'],
  ['Assembly-CSharp.dll', 'BasePlayer::OnReceivedTick(', 'PlayerTick is deserialized with ProtoDelta using the previous received tick.'],
  ['Rust.Data.dll', 'PlayerTick::Serialize(BufferStream,PlayerTick)', 'Full PlayerTick includes input, position, model state, identifiers and time delta.'],
  ['Rust.Data.dll', 'ProtoBuf.ClientReady::Serialize(BufferStream,ProtoBuf.ClientReady)', 'ClientReady has clientInfo, globalNetworking and party fields.'],
  ['Assembly-CSharp-firstpass.dll', 'EOS::Login(', 'The common EOS login wrapper selects ExternalCredentialType.SteamAppTicket (1). This is not proof of a successful client login.'],
  ['Assembly-CSharp-firstpass.dll', 'EOS::CopyIdToken(', 'EOS identity token issuance uses the Connect interface and a ProductUserId.'],
  ['Assembly-CSharp.dll', 'EACServer::DoStartup()', 'The protected server initializes an EOS AntiCheatServer session and sets its registration timeout to 20 seconds.'],
  ['Assembly-CSharp.dll', 'EACServer::OnJoinGame(', 'The protected path registers a client handle and the claimed ProductUserId with the EOS AntiCheatServer interface.'],
  ['Assembly-CSharp.dll', 'EACServer::OnClientAuthStatusChanged(', 'Local and remote authentication callbacks are distinct; remote completion starts identity-token verification.'],
  ['Assembly-CSharp.dll', 'EACServer::OnVerifyIdToken(', 'When identity-token verification is enforced, failed verification or a mismatch between AccountId and the Steam user ID results in rejection.'],
  ['Assembly-CSharp.dll', 'EACServer::IsAuthenticated(', 'This helper checks for RemoteAuthComplete (2). It is not the only admission gate; strict-auth configuration affects earlier progression.'],
  ['Assembly-CSharp.dll', 'EACServer::OnMessageReceived(', 'EAC payloads are passed to the official ReceiveMessageFromClient interface.'],
  ['Assembly-CSharp.dll', 'EACServer::Encrypt(', 'A server network-protection path uses EOS ProtectMessage; actual target encryption configuration was not read.'],
  ['Assembly-CSharp.dll', 'EACServer::Decrypt(', 'The corresponding network-protection path uses EOS UnprotectMessage.'],
  ['Assembly-CSharp.dll', 'EACServer::OnStartLoading(', 'The EAC network-active state is adjusted for loading.'],
  ['Assembly-CSharp.dll', 'EACServer::OnFinishLoading(', 'The EAC network-active state is adjusted when loading finishes.'],
  ['Facepunch.Raknet.dll', 'Facepunch.Network.Raknet.Client::Connect(', 'Rust includes a RakNet client wrapper that calls the native transport; the complete native handshake was not reconstructed.'],
];
const facts = [];
for (const [assembly, identifier, finding] of factSpecs) {
  const found = await method(assembly, identifier);
  facts.push({ assembly, method: found.signature.replace(/ TOKEN \d+$/, ''), metadataToken: found.token, inspectedILTextSha256: found.textSha256, finding, evidenceKind: 'static analysis, not successful player login' });
}

const sourceRecords = [];
const sourceDir = new URL('./sources/', import.meta.url);
for (const name of await readdir(sourceDir)) {
  if (!name.endsWith('.meta.json')) continue;
  const record = JSON.parse(await readFile(new URL(name, sourceDir), 'utf8'));
  sourceRecords.push({ ...record, usedAsEvidence: record.status === 200 && record.id !== 'steam-server-query', note: record.retrievalUrl.includes('r.jina.ai') ? 'Official public documentation read through a third-party text renderer; snapshot hash identifies retrieved text.' : record.id === 'steam-server-query' ? 'Direct retrieval returned an access challenge rather than the requested article; excluded.' : record.status !== 200 ? 'Retrieval failed; excluded from factual conclusions.' : 'Public resource retrieved successfully.' });
}
const manifest = {
  generatedAt: new Date().toISOString(),
  scope: 'Research of Rust protocol 2635 and official EAC/EOS session requirements. No authenticated Rust player connection has been established.',
  provenance: {
    source: 'Steam anonymous dedicated-server subscription, app 258550, public branch, Windows',
    depots: [{ depotId: 258551, manifestId: '93946663446561466' }, { depotId: 258554, manifestId: '2507054976021021832' }],
    downloaderVersion: 'SteamRE DepotDownloader 3.4.0',
    downloadedCompressedBytes: 4575232,
    modules: modules.map(({ assembly, size, sha256, mvid }) => ({ assembly, size, sha256, mvid })),
  },
  facts,
  excludedConclusions: [
    'A2S secure/VAC flags do not establish the EAC enforcement settings.',
    'Matching protocol 2635 does not establish identical client/server build IDs or byte-for-byte identity with the target.',
    'SDK availability and valid EOS identity alone do not establish a valid protected EAC client session.',
    'The listed message and schema facts are partial and do not constitute a complete playable Rust client.',
  ],
};
const protocol = {
  rustProtocol: 2635, provenance: 'Current unmodified dedicated-server assemblies; details in evidence.json',
  evidenceLevel: 'Static server-side analysis. Transport and successful player authentication have not been exercised.',
  connectionMarker: 228, applicationHeaderOffset: 140, messages, connectionStates: states,
  schemas,
  userInformationReadOrder: [
    { name: 'connectionMarker', type: 'uint8', expected: 228 },
    { name: 'userid', type: 'uint64' }, { name: 'protocol', type: 'uint32', expected: 2635 },
    { name: 'os', type: 'length-prefixed UTF-8 string', maxDecodedCharacters: 128 },
    { name: 'username', type: 'length-prefixed UTF-8 string', maxDecodedCharacters: 256 },
    { name: 'branch', type: 'length-prefixed UTF-8 string', maxDecodedCharacters: 128, condition: 'Reader attempts this when at least four bytes remain at this point.' },
    { name: 'token', type: 'length-prefixed bytes', maxBytes: 512, sensitive: true },
    { name: 'anticheatId', type: 'length-prefixed raw UTF-8 string', maxBytes: 128 },
    { name: 'anticheatToken', type: 'length-prefixed raw UTF-8 string', maxBytes: 2048, sensitive: true },
    { name: 'clientChangeset', type: 'int32' }, { name: 'clientBuildTime', type: 'int64' },
    { name: 'language', type: 'length-prefixed UTF-8 string', maxDecodedCharacters: 256 },
  ],
  sdkEnums: sdkEnums.filter(x => !x.name.endsWith('.AntiCheatCommonClientType')),
  gaps: ['Full native RakNet transport compatibility', 'Complete outer packet framing and reliability behavior', 'Client-side EOS and EAC initialization for the Rust product', 'Client-side protected runtime and EAC opaque message generation', 'All entity/snapshot and delta-message schemas', 'Observed timing, reconnection and successful admission validation'],
};
await writeFile(new URL('evidence.json', output), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(new URL('protocol-map.json', output), JSON.stringify(protocol, null, 2) + '\n');
await writeFile(new URL('sources.json', output), JSON.stringify(sourceRecords, null, 2) + '\n');
console.log(JSON.stringify({ modules: modules.length, staticFacts: facts.length, messages: messages.length, schemas: Object.keys(schemas).length, sourceRecords: sourceRecords.length, playerLoginEstablished: false }));
