import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Offline, aggregate metadata only. No endpoint, account, packet payload,
// authentication ticket, sequence number, timestamp or split ID is exported.
// By default payload access is limited to the first byte of an unsplit frame or
// fragment 0. Optional application-shape inspection reads lengths/field tags and
// fixed version integers, skipping all string, ID and ticket/token bodies.
const APP_NAMES = [
  'Welcome', 'Auth', 'Approved', 'Ready', 'Entities', 'EntityDestroy',
  'GroupChange', 'GroupDestroy', 'RPCMessage', 'EntityPosition',
  'ConsoleMessage', 'ConsoleCommand', 'Effect', 'DisconnectReason',
  'Tick', 'Message', 'RequestUserInformation', 'GiveUserInformation',
  'GroupEnter', 'GroupLeave', 'VoiceData', 'EAC', 'EntityFlags',
  'World', 'ConsoleReplicatedVars', 'QueueUpdate', 'SyncVar', 'PackedSyncVar',
];
const APP_HEADERS = new Map(APP_NAMES.map((name, index) => [141 + index, name]));
const SYSTEM_HEADERS = new Map([
  [0, 'connected-ping'], [3, 'connected-pong'], [9, 'connection-request'],
  [16, 'connection-request-accepted'], [19, 'new-incoming-connection'],
  [21, 'disconnection-notification'],
]);
const inc = (object, key, value = 1) => { object[key] = (object[key] ?? 0) + value; };
const fail = code => { throw new Error(code); };
const read16 = (b, offset, order) => order === 'LE' ? b.readUInt16LE(offset) : b.readUInt16BE(offset);
const read32 = (b, offset, order) => order === 'LE' ? b.readUInt32LE(offset) : b.readUInt32BE(offset);

function ipv4Number(text) {
  if (typeof text !== 'string' || !/^(\d{1,3}\.){3}\d{1,3}$/.test(text)) fail('Invalid peer IPv4');
  const octets = text.split('.').map(Number);
  if (octets.some(value => value > 255)) fail('Invalid peer IPv4');
  return octets.reduce((value, octet) => value * 256 + octet, 0);
}

export function parseConnectedDatagram(bytes, { frameOffset = 8, wordOrder = 'LE' } = {}) {
  if (!Buffer.isBuffer(bytes) || bytes.length < frameOffset || (bytes[0] & 0xe0) !== 0x80) return null;
  if (!['LE', 'BE'].includes(wordOrder) || !Number.isInteger(frameOffset) || frameOffset < 1) return null;
  const frames = [];
  let offset = frameOffset;
  while (offset < bytes.length) {
    if (offset + 3 > bytes.length) return null;
    const flags = bytes[offset], reliability = flags >>> 5, split = Boolean(flags & 0x10);
    if ((flags & 0x0f) !== 0 || reliability > 4) return null;
    const payloadBits = read16(bytes, offset + 1, wordOrder);
    if (!payloadBits) return null;
    let at = offset + 3, reliableIndex, orderingIndex, orderingChannel, splitCount, splitIndex, splitId;
    if ([2, 3, 4].includes(reliability)) {
      if (at + 3 > bytes.length) return null;
      reliableIndex = bytes.readUIntLE(at, 3); at += 3;
    }
    if ([1, 4].includes(reliability)) at += 3;
    if ([1, 3, 4].includes(reliability)) {
      if (at + 4 > bytes.length) return null;
      orderingIndex = bytes.readUIntLE(at, 3); orderingChannel = bytes[at + 3]; at += 4;
    }
    if (split) {
      if (at + 10 > bytes.length) return null;
      splitCount = read32(bytes, at, wordOrder);
      splitId = read16(bytes, at + 4, wordOrder);
      splitIndex = read32(bytes, at + 6, wordOrder);
      if (splitCount < 2 || splitCount > 65536 || splitIndex >= splitCount) return null;
      at += 10;
    }
    const payloadLength = Math.ceil(payloadBits / 8), end = at + payloadLength;
    if (end > bytes.length) return null;
    frames.push({ reliability, payloadBits, payloadLength, reliableIndex, orderingIndex,
      orderingChannel, split, splitCount, splitId, splitIndex, payloadOffset: at,
      firstByte: !split || splitIndex === 0 ? bytes[at] : undefined });
    offset = end;
  }
  return frames.length ? frames : null;
}

export function parseAcknowledgement(bytes, { extraTimeField = true, wordOrder = 'LE' } = {}) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 3 || !(bytes[0] & 0x80)) return null;
  const ack = Boolean(bytes[0] & 0x40), nak = !ack && Boolean(bytes[0] & 0x20);
  if (!ack && !nak) return null;
  if (!['LE', 'BE'].includes(wordOrder)) return null;
  const countOffset = 1 + (ack && extraTimeField ? 4 : 0) + (ack && (bytes[0] & 0x20) ? 4 : 0);
  if (countOffset + 2 > bytes.length) return null;
  const count = read16(bytes, countOffset, wordOrder);
  if (!count || count > Math.floor((bytes.length - countOffset - 2) / 4)) return null;
  let at = countOffset + 2;
  const records = [];
  for (let index = 0; index < count; index++) {
    if (at + 4 > bytes.length || ![0, 1].includes(bytes[at])) return null;
    const singleton = bytes[at++] === 1, minimum = bytes.readUIntLE(at, 3); at += 3;
    if (!singleton && at + 3 > bytes.length) return null;
    const maximum = singleton ? minimum : bytes.readUIntLE(at, 3);
    if (!singleton) at += 3;
    if (maximum < minimum) return null;
    records.push({ singleton, minimum, maximum });
  }
  return at === bytes.length ? { ack, nak, countOffset, records } : null;
}

function candidatePrefix(firstByte) {
  if (APP_HEADERS.has(firstByte)) return `${firstByte}.${APP_HEADERS.get(firstByte)}`;
  if (SYSTEM_HEADERS.has(firstByte)) return `${firstByte}.raknet-${SYSTEM_HEADERS.get(firstByte)}`;
  return 'other-first-byte';
}

export function inspectUserInformationShape(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 14 || bytes[0] !== 158 || bytes[1] !== 228
    || bytes.readUInt32LE(10) !== 2635) return { validShape: false };
  let offset = 14; // Skip the SteamID without reading its value.
  const readLengthAndSkip = maximum => {
    if (offset + 4 > bytes.length) fail('Invalid application shape');
    const length = bytes.readUInt32LE(offset); offset += 4;
    if (length > maximum || offset + length > bytes.length) fail('Invalid application shape');
    offset += length; return length;
  };
  try {
    const osBytes = readLengthAndSkip(512), usernameBytes = readLengthAndSkip(1024);
    const branchBytes = readLengthAndSkip(512), steamTicketBytes = readLengthAndSkip(512);
    const antiIdBytes = readLengthAndSkip(128), antiTokenBytes = readLengthAndSkip(2048);
    if (offset + 12 > bytes.length) return { validShape: false };
    const changeset = bytes.readInt32LE(offset), buildTime = bytes.readBigInt64LE(offset + 4).toString();
    offset += 12;
    const languageBytes = readLengthAndSkip(1024);
    if (offset !== bytes.length) return { validShape: false };
    return { validShape: true, lengthEncoding: 'uint32LE byte counts',
      applicationHeader: 158, connectionMarker: 228, protocol: 2635,
      payloadBytes: bytes.length, bytesConsumed: offset, trailingBytes: 0,
      osBytes, usernameBytes, branchBytes, steamTicketBytes,
      antiIdBytes, antiTokenBytes, antiIdEmpty: antiIdBytes === 0,
      antiTokenEmpty: antiTokenBytes === 0, changeset, buildTime, languageBytes };
  } catch { return { validShape: false }; }
}

export function inspectReadyShape(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes[0] !== 144) return { validShape: false };
  // Read Protobuf tags and byte lengths. Values of strings, bytes, booleans and
  // integer fields are skipped and never copied to this result.
  function fields(buffer, clientInfo = false) {
    let offset = 0;
    const tags = {}, lengths = {}, nested = [];
    const varint = () => {
      let value = 0n;
      for (let index = 0; index < 10; index++) {
        if (offset >= buffer.length) fail('Invalid protobuf shape');
        const byte = buffer[offset++];
        if (index === 9 && byte > 1) fail('Invalid protobuf shape');
        value |= BigInt(byte & 0x7f) << BigInt(index * 7);
        if (!(byte & 0x80)) return value;
      }
      fail('Invalid protobuf shape');
    };
    while (offset < buffer.length) {
      const tag = varint();
      if (tag < 8n || tag > 0xffffffffn) fail('Invalid protobuf shape');
      const number = Number(tag >> 3n), wire = Number(tag & 7n);
      inc(tags, `${number}.wire${wire}`);
      if (wire === 0) varint();
      else if (wire === 1) offset += 8;
      else if (wire === 5) offset += 4;
      else if (wire === 2) {
        const length = Number(varint());
        if (!Number.isSafeInteger(length) || length > buffer.length - offset) fail('Invalid protobuf shape');
        inc(lengths, `${number}.bytes${length}`);
        if (!clientInfo && number === 1) nested.push(fields(buffer.subarray(offset, offset + length), true));
        offset += length;
      } else fail('Invalid protobuf shape');
      if (offset > buffer.length) fail('Invalid protobuf shape');
    }
    return { tags, lengths, nested };
  }
  try {
    const shape = fields(bytes.subarray(1)), clientInfoFieldShapes = {};
    for (const item of shape.nested) inc(clientInfoFieldShapes, JSON.stringify({ tags: item.tags, lengths: item.lengths }));
    return { validShape: true, applicationHeader: 144, payloadBytes: bytes.length,
      protobufBytes: bytes.length - 1, bytesConsumed: bytes.length, trailingBytes: 0,
      topLevelFields: shape.tags, topLevelByteLengthFrequencies: shape.lengths,
      clientInfoEntries: shape.nested.length,
      clientInfoFieldShapes: Object.entries(clientInfoFieldShapes).map(([shapeJson, count]) => ({ ...JSON.parse(shapeJson), count })) };
  } catch { return { validShape: false }; }
}

function emptyDirection() {
  return {
    packetKinds: {}, datagramFlags: {}, datagramFrameCounts: {}, reliability: {},
    orderingChannels: {}, framePayloadByteLengths: {}, frames: 0, splitFrames: 0,
    nonByteAlignedFrames: 0, uniqueReliableFrames: 0, repeatedReliableFrames: 0,
    repeatedReliableFramesWithDifferentMetadata: 0,
    candidateUnsplitFirstBytes: {}, candidateUniqueReliableUnsplitFirstBytes: {},
    candidateCompleteSplitFirstBytes: {},
    acknowledgement: { validPackets: 0, invalidPackets: 0, legacyLayoutValidPackets: 0,
      recordCountFrequencies: {}, singletonRecords: 0, rangeRecords: 0,
      recordsWithSomePreviouslyCapturedOppositeDatagram: 0,
      packetsWithSomePreviouslyCapturedOppositeDatagram: 0,
      packetsWithMatchingEchoField: 0, oversizedRangesNotExpanded: 0 },
    negativeAcknowledgement: { validPackets: 0, invalidPackets: 0, recordCountFrequencies: {} },
    sequenceProgression: {},
  };
}

export function analyzeRaknetFrames(data, { peer, port = 28015, inspectApplicationShapes = false } = {}) {
  if (!Buffer.isBuffer(data)) fail('Input must be a Buffer');
  const peerNumber = ipv4Number(peer);
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail('Invalid peer UDP port');
  const result = {
    schemaVersion: 1,
    scope: 'Offline Ethernet/IPv4 UDP packets matching a caller-supplied peer and port; aggregate metadata only.',
    capture: { enhancedPacketBlocks: 0, matchingPackets: 0, malformedNetworkPackets: 0,
      truncatedMatchingPackets: 0, fragmentedIpv4PacketsSkipped: 0, unsupportedLinkPacketsSkipped: 0 },
    observedLayout: {
      data: 'flags:u8 | source-system-time-low32:u32LE | datagram-sequence:u24LE | frames',
      ack: 'flags:u8 | source-system-time-low32:u32LE | optional-AS:4 bytes when flag 0x20 | count:u16LE | records',
      nak: 'flags:u8 | count:u16LE | records',
      frame: 'flags:u8 | payload-bit-length:u16LE | reliability fields | optional split fields | payload',
      reliableAndOrderingIndices: 'u24LE; ordering channel u8',
      split: 'count:u32LE | id:u16LE | index:u32LE',
      ackRecord: 'singleton:u8 (0 or 1) | minimum:u24LE | maximum:u24LE when singleton=0',
      extraFieldMeaning: 'Four bytes are exactly echoed from a referenced data datagram in observed ACKs, matching upstream INCLUDE_TIMESTAMP_WITH_DATAGRAMS=1 sourceSystemTime serialization.',
    },
    references: {
      timestampLayout: 'https://github.com/facebookarchive/RakNet/blob/1a169895a900c9fc4841c556e16514182b75faf8/Source/ReliabilityLayer.cpp#L110',
      timestampCompileOption: 'https://github.com/facebookarchive/RakNet/blob/1a169895a900c9fc4841c556e16514182b75faf8/Source/ReliabilityLayer.h#L40',
      acknowledgementRanges: 'https://github.com/facebookarchive/RakNet/blob/1a169895a900c9fc4841c556e16514182b75faf8/Source/DS_RangeList.h',
      applicationHeaderMap: 'rust-research/protocol-map.json',
    },
    directions: { inbound: emptyDirection(), outbound: emptyDirection() },
    layoutComparison: { observedDataLayoutValid: 0, observedDataLayoutInvalid: 0,
      upstreamFrameOffset4BigEndianValid: 0, frameOffset8BigEndianValid: 0,
      observedAckLayoutValid: 0, upstreamAckLayoutBigEndianValid: 0,
      upstreamAckLayoutLittleEndianValid: 0 },
    splitGroups: { groups: 0, completeGroups: 0, incompleteGroups: 0,
      conflictingGroups: 0, duplicateFragmentMetadata: 0, expectedFragmentCounts: {},
      completePayloadByteLengths: {} },
    privacy: {
      emittedData: 'Aggregate counts, length frequencies, known first-byte candidate labels, constant layouts and opt-in application structure/version integers only.',
      omittedData: 'No endpoints, local ports, account values, raw bytes, payload text, authentication contents, packet timestamps, sequence values or split IDs.',
      payloadRead: inspectApplicationShapes
        ? 'First-byte classification plus opt-in outbound unsplit GiveUserInformation length/version fields and Ready protobuf tags/lengths; all ID, string, ticket and token body values are skipped.'
        : 'At most the first byte of each unsplit frame or split fragment 0; remaining payload bytes are skipped by length.',
    },
    limitations: [
      'Candidate first-byte labels use the existing static Rust header map (enum + 140); body values and authenticity are not established.',
      'Noninitial split fragments are never interpreted as message headers. Split completeness is based on indices and lengths, without concatenating payloads.',
      'Repeated reliable-frame counts compare transport metadata only; payload identity is not checked.',
      'Packets may include capture-component duplicates and retransmissions; raw counts are preserved.',
      'Only Ethernet, unfragmented IPv4 UDP, and pcapng enhanced packet blocks are inspected.',
      'ACK echo comparison covers previously captured opposite datagrams with ranges up to 65,536 entries; earlier or missing packets are not inferred.',
      'Optional outbound application shapes require an unsplit frame. Their length checks establish structure only; skipped contents are not validated.',
      'No measured source-time unit, Steam authentication, EAC state, decryption, replayability or successful independent player connection is established.',
    ],
  };
  if (inspectApplicationShapes) result.applicationShapes = {
    scope: 'Outbound unsplit GiveUserInformation and Ready metadata only; no strings, IDs or authentication bodies.',
    giveUserInformation: [], ready: [],
  };
  const datagrams = new Map(), sequenceState = new Map(), reliableFrames = new Map(), splitGroups = new Map();
  const generations = new Map();

  function inspect(bytes, direction, privateSocket) {
    const directionResult = result.directions[direction];
    if (!bytes.length) { inc(directionResult.packetKinds, 'empty'); return; }
    if (bytes[0] === 0x05 && bytes.length >= 18
      && bytes.subarray(1, 17).equals(Buffer.from('00ffff00fefefefefdfdfdfd12345678', 'hex'))) {
      generations.set(privateSocket, (generations.get(privateSocket) ?? 0) + 1);
    }
    const generation = generations.get(privateSocket) ?? 0;
    const connectionKey = `${sectionNumber}|${privateSocket}|${generation}`;
    const directionKey = `${connectionKey}|${direction}`;
    const oppositeKey = `${connectionKey}|${direction === 'inbound' ? 'outbound' : 'inbound'}`;
    if ((bytes[0] & 0xe0) === 0x80) {
      inc(directionResult.packetKinds, 'data');
      inc(directionResult.datagramFlags, `0x${bytes[0].toString(16).padStart(2, '0')}`);
      const frames = parseConnectedDatagram(bytes);
      if (parseConnectedDatagram(bytes, { frameOffset: 4, wordOrder: 'BE' })) result.layoutComparison.upstreamFrameOffset4BigEndianValid++;
      if (parseConnectedDatagram(bytes, { frameOffset: 8, wordOrder: 'BE' })) result.layoutComparison.frameOffset8BigEndianValid++;
      if (!frames) { result.layoutComparison.observedDataLayoutInvalid++; return; }
      result.layoutComparison.observedDataLayoutValid++;
      const sequence = bytes.readUIntLE(5, 3), echoValue = bytes.readUInt32LE(1);
      if (sequenceState.has(directionKey)) {
        const difference = (sequence - sequenceState.get(directionKey) + 0x1000000) % 0x1000000;
        inc(directionResult.sequenceProgression, difference === 0 ? 'repeated' : difference === 1 ? 'next'
          : difference < 0x800000 ? 'forwardGap' : 'backwardOrReordered');
      }
      sequenceState.set(directionKey, sequence);
      datagrams.set(`${directionKey}|${sequence}`, echoValue);
      inc(directionResult.datagramFrameCounts, String(frames.length));
      for (const frame of frames) {
        directionResult.frames++;
        inc(directionResult.reliability, String(frame.reliability));
        inc(directionResult.framePayloadByteLengths, String(frame.payloadLength));
        if (frame.payloadBits % 8) directionResult.nonByteAlignedFrames++;
        if (frame.orderingChannel !== undefined) inc(directionResult.orderingChannels, String(frame.orderingChannel));
        if (!frame.split) inc(directionResult.candidateUnsplitFirstBytes, candidatePrefix(frame.firstByte));
        if (inspectApplicationShapes && direction === 'outbound' && !frame.split && [158, 144].includes(frame.firstByte)) {
          const payload = bytes.subarray(frame.payloadOffset, frame.payloadOffset + frame.payloadLength);
          const key = frame.firstByte === 158 ? 'giveUserInformation' : 'ready';
          result.applicationShapes[key].push(frame.firstByte === 158 ? inspectUserInformationShape(payload) : inspectReadyShape(payload));
        }
        if (frame.reliableIndex !== undefined) {
          const reliableKey = `${directionKey}|${frame.reliableIndex}`;
          const metadata = `${frame.reliability}|${frame.payloadBits}|${frame.orderingIndex}|${frame.orderingChannel}|${frame.splitCount}|${frame.splitId}|${frame.splitIndex}|${frame.firstByte}`;
          if (!reliableFrames.has(reliableKey)) {
            reliableFrames.set(reliableKey, metadata); directionResult.uniqueReliableFrames++;
            if (!frame.split) inc(directionResult.candidateUniqueReliableUnsplitFirstBytes, candidatePrefix(frame.firstByte));
          } else {
            directionResult.repeatedReliableFrames++;
            if (reliableFrames.get(reliableKey) !== metadata) directionResult.repeatedReliableFramesWithDifferentMetadata++;
          }
        }
        if (frame.split) {
          directionResult.splitFrames++;
          const splitKey = `${directionKey}|${frame.splitId}`;
          let group = splitGroups.get(splitKey);
          if (!group) {
            group = { count: frame.splitCount, fragments: new Map(), direction, conflict: false };
            splitGroups.set(splitKey, group);
          }
          if (group.count !== frame.splitCount) group.conflict = true;
          const fragmentMetadata = `${frame.payloadBits}|${frame.firstByte}`;
          if (group.fragments.has(frame.splitIndex)) {
            result.splitGroups.duplicateFragmentMetadata++;
            if (group.fragments.get(frame.splitIndex).metadata !== fragmentMetadata) group.conflict = true;
          } else group.fragments.set(frame.splitIndex, { metadata: fragmentMetadata, length: frame.payloadLength });
          if (frame.splitIndex === 0) group.firstByte = frame.firstByte;
        }
      }
    } else if ((bytes[0] & 0xc0) === 0xc0 || (bytes[0] & 0xe0) === 0xa0) {
      const isAck = Boolean(bytes[0] & 0x40), label = isAck ? 'ack' : 'nak';
      inc(directionResult.packetKinds, label);
      const decoded = parseAcknowledgement(bytes);
      const stat = directionResult[isAck ? 'acknowledgement' : 'negativeAcknowledgement'];
      if (!decoded) { stat.invalidPackets++; return; }
      stat.validPackets++;
      inc(stat.recordCountFrequencies, String(decoded.records.length));
      if (!isAck) return;
      result.layoutComparison.observedAckLayoutValid++;
      if (parseAcknowledgement(bytes, { extraTimeField: false, wordOrder: 'BE' })) {
        result.layoutComparison.upstreamAckLayoutBigEndianValid++; stat.legacyLayoutValidPackets++;
      }
      if (parseAcknowledgement(bytes, { extraTimeField: false, wordOrder: 'LE' })) result.layoutComparison.upstreamAckLayoutLittleEndianValid++;
      let captured = false, echoMatched = false;
      for (const record of decoded.records) {
        stat[record.singleton ? 'singletonRecords' : 'rangeRecords']++;
        if (record.maximum - record.minimum >= 65536) { stat.oversizedRangesNotExpanded++; continue; }
        let recordCaptured = false;
        for (let sequence = record.minimum; sequence <= record.maximum; sequence++) {
          const key = `${oppositeKey}|${sequence}`;
          if (datagrams.has(key)) {
            captured = recordCaptured = true;
            if (datagrams.get(key) === bytes.readUInt32LE(1)) echoMatched = true;
          }
        }
        if (recordCaptured) stat.recordsWithSomePreviouslyCapturedOppositeDatagram++;
      }
      if (captured) stat.packetsWithSomePreviouslyCapturedOppositeDatagram++;
      if (echoMatched) stat.packetsWithMatchingEchoField++;
    } else inc(directionResult.packetKinds, 'offline-or-other');
  }

  let offset = 0, little = true, haveSection = false, interfaces = [], sectionNumber = -1;
  while (offset < data.length) {
    if (offset + 12 > data.length) fail('Truncated pcapng block header');
    const isSection = data.readUInt32LE(offset) === 0x0a0d0d0a;
    if (isSection) {
      const magic = data.readUInt32LE(offset + 8);
      if (magic === 0x1a2b3c4d) little = true;
      else if (magic === 0x4d3c2b1a) little = false;
      else fail('Invalid pcapng byte order');
    } else if (!haveSection) fail('Missing pcapng section');
    const order = little ? 'LE' : 'BE', type = read32(data, offset, order), length = read32(data, offset + 4, order);
    if (length < 12 || length % 4 || offset + length > data.length
      || read32(data, offset + length - 4, order) !== length) fail('Invalid pcapng block length');
    const body = offset + 8, bodyLength = length - 12;
    if (isSection) {
      if (length < 28) fail('Short pcapng section');
      haveSection = true; interfaces = []; sectionNumber++;
      // Section-specific socket state must not be joined across captures.
      generations.clear(); datagrams.clear(); sequenceState.clear(); reliableFrames.clear();
    } else if (type === 1) {
      if (bodyLength < 8) fail('Short pcapng interface');
      interfaces.push(read16(data, body, order));
    } else if (type === 6) {
      if (bodyLength < 20) fail('Short enhanced packet block');
      result.capture.enhancedPacketBlocks++;
      const linkType = interfaces[read32(data, body, order)], capturedLength = read32(data, body + 12, order);
      if (capturedLength > bodyLength - 20) fail('Invalid captured packet length');
      if (linkType !== 1) { result.capture.unsupportedLinkPacketsSkipped++; offset += length; continue; }
      const frame = data.subarray(body + 20, body + 20 + capturedLength);
      if (frame.length < 14) { result.capture.malformedNetworkPackets++; offset += length; continue; }
      let etherType = frame.readUInt16BE(12), ip = 14, vlanCount = 0;
      while ([0x8100, 0x88a8, 0x9100].includes(etherType) && vlanCount++ < 8 && ip + 4 <= frame.length) {
        etherType = frame.readUInt16BE(ip + 2); ip += 4;
      }
      if (etherType !== 0x0800) { offset += length; continue; }
      if (ip + 20 > frame.length) { result.capture.malformedNetworkPackets++; offset += length; continue; }
      const ihl = (frame[ip] & 15) * 4, ipLength = frame.readUInt16BE(ip + 2), udp = ip + ihl;
      if ((frame[ip] >>> 4) !== 4 || ihl < 20 || ipLength < ihl) {
        result.capture.malformedNetworkPackets++; offset += length; continue;
      }
      if (frame.readUInt16BE(ip + 6) & 0x3fff) { result.capture.fragmentedIpv4PacketsSkipped++; offset += length; continue; }
      if (frame[ip + 9] !== 17) { offset += length; continue; }
      if (udp + 8 > frame.length) { result.capture.malformedNetworkPackets++; offset += length; continue; }
      const source = frame.readUInt32BE(ip + 12), destination = frame.readUInt32BE(ip + 16);
      const sourcePort = frame.readUInt16BE(udp), destinationPort = frame.readUInt16BE(udp + 2);
      const inbound = source === peerNumber && sourcePort === port;
      const outbound = destination === peerNumber && destinationPort === port;
      if (!inbound && !outbound) { offset += length; continue; }
      result.capture.matchingPackets++;
      const udpLength = frame.readUInt16BE(udp + 4);
      if (udpLength < 8 || udpLength > ipLength - ihl) result.capture.malformedNetworkPackets++;
      else if (udp + udpLength > frame.length) result.capture.truncatedMatchingPackets++;
      else inspect(frame.subarray(udp + 8, udp + udpLength), inbound ? 'inbound' : 'outbound',
        `${inbound ? destination : source}|${inbound ? destinationPort : sourcePort}`);
    }
    offset += length;
  }
  for (const group of splitGroups.values()) {
    result.splitGroups.groups++;
    inc(result.splitGroups.expectedFragmentCounts, String(group.count));
    if (group.conflict) result.splitGroups.conflictingGroups++;
    if (!group.conflict && group.fragments.size === group.count && group.firstByte !== undefined) {
      result.splitGroups.completeGroups++;
      const bytes = [...group.fragments.values()].reduce((sum, fragment) => sum + fragment.length, 0);
      inc(result.splitGroups.completePayloadByteLengths, String(bytes));
      inc(result.directions[group.direction].candidateCompleteSplitFirstBytes, candidatePrefix(group.firstByte));
    } else result.splitGroups.incompleteGroups++;
  }
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  let input, output, peer, port = 28015, inspectApplicationShapes = false;
  for (let index = 0; index < args.length; index++) {
    const option = args[index];
    if (option === '--help' || option === '-h') {
      console.log('Usage: node analyze-raknet-frames.mjs <capture.pcapng> --peer <IPv4> [--port <UDP port>] [--inspect-application-shapes] [--out <safe-summary.json>]');
      return;
    }
    if (option === '--inspect-application-shapes') { inspectApplicationShapes = true; continue; }
    if (['--peer', '--port', '--out'].includes(option)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) fail('Missing option value');
      if (option === '--peer') peer = value;
      if (option === '--port') port = Number(value);
      if (option === '--out') output = value;
    } else if (option.startsWith('-') || input) fail('Unknown option or extra input');
    else input = option;
  }
  if (!input || !peer) fail('Capture path and peer IPv4 are required; use --help');
  if (output && resolve(input).toLowerCase() === resolve(output).toLowerCase()) fail('Output must differ from input');
  const result = analyzeRaknetFrames(await readFile(input), { peer, port, inspectApplicationShapes });
  const json = JSON.stringify(result, null, 2) + '\n';
  if (output) {
    await mkdir(dirname(resolve(output)), { recursive: true }); await writeFile(output, json, 'utf8');
    console.log(`Safe frame summary written: ${result.capture.matchingPackets} matching packets; ${result.layoutComparison.observedDataLayoutValid} complete data layouts.`);
  } else process.stdout.write(json);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`Offline frame analysis failed: ${error.code ?? error.message}`); process.exitCode = 1;
  });
}
