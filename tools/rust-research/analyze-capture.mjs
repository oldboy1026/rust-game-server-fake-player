import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Offline metadata only. Packet bytes, local addresses, GUIDs, account IDs,
// interface names and pcapng comments are never copied into the result.
const MAGIC = Buffer.from('00ffff00fefefefefdfdfdfd12345678', 'hex');
const A2S_TYPES = new Map([
  [0x54, 'info-request'], [0x55, 'players-request'], [0x56, 'rules-request'],
  [0x41, 'challenge'], [0x49, 'info-response'], [0x6d, 'legacy-info-response'],
  [0x44, 'players-response'], [0x45, 'rules-response'],
]);
const OFFLINE = new Map([
  [0x01, [9, 'unconnected-ping']], [0x02, [9, 'unconnected-ping-open']],
  [0x05, [1, 'open-connection-request-1']], [0x06, [1, 'open-connection-reply-1']],
  [0x07, [1, 'open-connection-request-2']], [0x08, [1, 'open-connection-reply-2']],
  [0x1c, [17, 'unconnected-pong']],
  [0x19, [2, 'incompatible-protocol-version']],
]);
const REFERENCES = {
  offlineMagicAndHandshake: 'https://github.com/facebookarchive/RakNet/blob/1a169895a900c9fc4841c556e16514182b75faf8/Source/RakPeer.cpp',
  headerAndFieldLayouts: 'https://github.com/wireshark/wireshark/blob/fe168fe75ceda882ef00271041ee8e53d7ab5dad/epan/dissectors/packet-raknet.c',
  nativeEndianCompileOption: 'https://github.com/facebookarchive/RakNet/blob/1a169895a900c9fc4841c556e16514182b75faf8/Source/RakNetDefines.h#L31',
  integerSerialization: 'https://github.com/facebookarchive/RakNet/blob/1a169895a900c9fc4841c556e16514182b75faf8/Source/BitStream.h#L1083',
};
const increment = (map, key, amount = 1) => { map[key] = (map[key] ?? 0) + amount; };
const sortedCounts = counts => Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
const round = value => Number(value.toFixed(6));
const fail = (code, offset) => { throw new Error(`${code}${offset === undefined ? '' : ` at byte ${offset}`}`); };

function ipv4Number(address) {
  if (typeof address !== 'string' || !/^(\d{1,3}\.){3}\d{1,3}$/.test(address)) return null;
  const octets = address.split('.').map(Number);
  if (octets.some(octet => octet > 255)) return null;
  return octets.reduce((number, octet) => (number * 256) + octet, 0);
}

function publicIPv4(value) {
  const a = Math.floor(value / 0x1000000);
  const b = Math.floor(value / 0x10000) & 255;
  const c = Math.floor(value / 0x100) & 255;
  return !(a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 192 && b === 0 && (c === 0 || c === 2))
    || (a === 192 && b === 88 && c === 99)
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    || (a === 203 && b === 0 && c === 113));
}

function ipv4Text(value) {
  return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.');
}

function distribution(values, boundaries) {
  if (!values.length) return { count: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = p => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
  const counts = Array(boundaries.length + 1).fill(0);
  for (const value of values) {
    let index = 0;
    while (index < boundaries.length && value > boundaries[index]) index++;
    counts[index]++;
  }
  return {
    count: values.length, min: round(sorted[0]), max: round(sorted.at(-1)),
    mean: round(values.reduce((sum, value) => sum + value, 0) / values.length),
    p50: round(percentile(0.5)), p90: round(percentile(0.9)),
    p95: round(percentile(0.95)), p99: round(percentile(0.99)),
    histogram: counts.map((count, index) => ({
      greaterThan: index ? boundaries[index - 1] : null,
      lessThanOrEqual: index < boundaries.length ? boundaries[index] : null, count,
    })),
  };
}

function offlineHeader(payload) {
  if (!payload.length) return null;
  const format = OFFLINE.get(payload[0]);
  return format && payload.length >= format[0] + MAGIC.length
    && payload.subarray(format[0], format[0] + MAGIC.length).equals(MAGIC) ? format[1] : null;
}

function handshakeFields(payload, state) {
  const mtuInterpretations = offset => ({ mtuFieldInterpretations: {
    bigEndian: payload.readUInt16BE(offset), littleEndian: payload.readUInt16LE(offset),
    byteOrderVerified: false } });
  const id = payload[0];
  if (id === 0x05) {
    delete state.serverSecurity;
    return payload.length >= 18 ? { layoutStatus: 'standard-prefix-compatible',
      protocolVersionByte: payload[17] } : { layoutStatus: 'truncated-standard-prefix' };
  }
  if (id === 0x19) return { layoutStatus: 'standard-prefix-compatible', protocolVersionByte: payload[1] };
  if (id === 0x06) {
    if (payload.length < 26 || payload[25] > 1) return { layoutStatus: 'unsupported-standard-layout' };
    const security = payload[25] === 1;
    // Skip GUID, then (when security is set) cookie and 64-byte public key.
    const mtuOffset = security ? 94 : 26;
    if (payload.length !== mtuOffset + 2) return { layoutStatus: 'unsupported-standard-length',
      raknetSecurityFlagSet: security };
    state.serverSecurity = security;
    return { layoutStatus: 'standard-field-offsets-compatible', raknetSecurityFlagSet: security,
      ...mtuInterpretations(mtuOffset) };
  }
  if (id === 0x07) {
    if (state.serverSecurity === undefined) return { layoutStatus: 'not-decoded-without-prior-reply-1' };
    let addressOffset = 17;
    let challengePresent;
    if (state.serverSecurity) {
      // Four cookie bytes, then an explicit uint8 challenge-present field.
      if (payload.length < 22 || payload[21] > 1) return { layoutStatus: 'unsupported-standard-layout' };
      challengePresent = payload[21] === 1;
      addressOffset = 22 + (challengePresent ? 64 : 0);
    }
    // Only the standard IPv4 system-address width is used for field offsets.
    // The encoded address and its port are deliberately neither decoded nor emitted.
    if (payload.length !== addressOffset + 17 || payload[addressOffset] !== 4) {
      return { layoutStatus: 'unsupported-standard-length-or-address-format' };
    }
    return { layoutStatus: 'standard-field-offsets-compatible', encodedAddressVersion: 4,
      ...mtuInterpretations(addressOffset + 7),
      ...(challengePresent === undefined ? {} : { challengePresent }) };
  }
  if (id === 0x08) {
    // GUID occupies 17..24, IPv4 system address 25..31, MTU 32..33,
    // and a BitStream boolean occupies the top bit of byte 34.
    if (payload.length < 35 || payload[25] !== 4 || ![0, 0x80].includes(payload[34])) {
      return { layoutStatus: 'unsupported-standard-layout' };
    }
    const security = payload[34] === 0x80;
    if (payload.length !== (security ? 163 : 35)) return { layoutStatus: 'unsupported-standard-length' };
    return { layoutStatus: 'standard-field-offsets-compatible', encodedAddressVersion: 4,
      ...mtuInterpretations(32), raknetSecurityFlagSet: security };
  }
  return null;
}

function ackRecordLayout(payload, recordOffset, littleEndian) {
  if (payload.length < recordOffset + 6) return false;
  const records = littleEndian ? payload.readUInt16LE(recordOffset) : payload.readUInt16BE(recordOffset);
  if (!records || records > Math.floor((payload.length - recordOffset - 2) / 4)) return false;
  let offset = recordOffset + 2;
  for (let record = 0; record < records; record++) {
    if (offset >= payload.length) return false;
    offset += payload[offset] ? 4 : 7;
    if (offset > payload.length) return false;
  }
  return offset === payload.length;
}

function classifyUdp(payload, inspectRaknet, versions) {
  if (payload.length >= 5 && payload.readUInt32LE(0) === 0xffffffff) {
    const type = A2S_TYPES.get(payload[4]);
    return type ? `a2s.single.${type}.header-compatible` : 'a2s.single-prefix-compatible';
  }
  if (payload.length >= 8 && payload.readUInt32LE(0) === 0xfffffffe) {
    return 'a2s.split-prefix-compatible';
  }
  if (!inspectRaknet || !payload.length) return 'unclassified';
  const offline = offlineHeader(payload);
  if (offline) {
    if (payload[0] === 0x05 && payload.length >= 18) increment(versions, String(payload[17]));
    return `raknet.${offline}.header-compatible`;
  }
  const valid = Boolean(payload[0] & 0x80), ack = Boolean(payload[0] & 0x40);
  const nak = !ack && Boolean(payload[0] & 0x20);
  if (valid && !ack && !nak && payload.length >= 4) return 'raknet.datagram.header-compatible';
  const recordOffset = ack && (payload[0] & 0x20) ? 5 : 1;
  const prefixLabel = valid && (ack || nak) && payload.length >= 3
    ? `raknet.${ack ? 'ack' : 'nak'}-prefix.header-compatible` : 'unclassified';
  if (valid && (ack || nak) && payload.length >= recordOffset + 6) {
    // ACK/NAK: uint16 count, then singleton/range records. Upstream can disable
    // endian swapping at compile time, so try both word orders independently.
    // Sequence numbers are skipped, never returned or treated as authenticated.
    const big = ackRecordLayout(payload, recordOffset, false);
    const small = ackRecordLayout(payload, recordOffset, true);
    if (big || small) return `raknet.${ack ? 'ack' : 'nak'}-record-layout.${big && small
      ? 'both-endian' : big ? 'big-endian' : 'little-endian'}.header-compatible`;
  }
  return prefixLabel;
}

function classifyTcp(payload) {
  if (payload.length >= 5 && payload[0] >= 20 && payload[0] <= 23
      && payload[1] === 3 && payload[2] <= 4 && payload.readUInt16BE(3) <= 18432) {
    return 'tls.record-header-compatible';
  }
  return 'unclassified';
}

export function analyzePcapng(data, { localIps = [], gameHost } = {}) {
  if (!Buffer.isBuffer(data)) fail('Input must be a Buffer');
  const localNumbers = localIps.map(ipv4Number);
  if (!localNumbers.length || localNumbers.some(value => value === null)) fail('At least one valid local IPv4 address is required');
  const locals = new Set(localNumbers);
  const gameNumber = gameHost === undefined ? null : ipv4Number(gameHost);
  if (gameHost !== undefined && gameNumber === null) fail('Invalid game host IPv4 address');
  const counts = {
    enhancedPacketBlocks: 0, capturedFrameBytes: 0, originalFrameBytes: 0,
    truncatedCapturePackets: 0, capturedLengthExceedsOriginal: 0,
    unknownInterfacePackets: 0, ipv4Packets: 0, ipv6UnsupportedPackets: 0,
    arpPackets: 0, otherEtherTypePackets: 0, unsupportedLinkTypePackets: 0,
    fragmentedIpv4UnsupportedPackets: 0, udpPackets: 0, tcpPackets: 0,
    otherIpv4ProtocolPackets: 0, truncatedNetworkPackets: 0,
    publicPeerPackets: 0, nonPublicPeerPackets: 0,
    unmatchedLocalAddressPackets: 0, bothEndpointsLocalPackets: 0,
  };
  const malformed = {}, blockTypes = {}, protocols = {}, firstBytes = {}, versions = {};
  const interfaces = [], sections = [], flows = new Map(), handshakeEvents = [], handshakeStates = new Map();
  let omittedHandshakeEvents = 0;
  let currentInterfaces = [], little = true, sectionIndex = -1, offset = 0;
  let firstTime = null, lastTime = null;
  const markMalformed = (iface, reason) => { increment(malformed, reason); iface.malformedFrames++; };

  function packet(frame, iface, timestamp, originalLength) {
    iface.packetCount++;
    iface.capturedFrameBytes += frame.length;
    iface.originalFrameBytes += originalLength;
    if (frame.length < originalLength) iface.truncatedCapturePackets++;
    if (firstTime === null || timestamp < firstTime) firstTime = timestamp;
    if (lastTime === null || timestamp > lastTime) lastTime = timestamp;
    if (iface.linkType !== 1) { counts.unsupportedLinkTypePackets++; return; }
    if (frame.length < 14) { markMalformed(iface, 'short-ethernet-header'); return; }
    let etherType = frame.readUInt16BE(12), ipOffset = 14, vlans = 0;
    while ([0x8100, 0x88a8, 0x9100].includes(etherType)) {
      if (++vlans > 8) { markMalformed(iface, 'excess-vlan-depth'); return; }
      if (frame.length < ipOffset + 4) { markMalformed(iface, 'short-vlan-header'); return; }
      etherType = frame.readUInt16BE(ipOffset + 2);
      ipOffset += 4;
    }
    if (vlans) iface.vlanPackets++;
    if (etherType === 0x86dd) { counts.ipv6UnsupportedPackets++; return; }
    if (etherType === 0x0806) { counts.arpPackets++; return; }
    if (etherType !== 0x0800) { counts.otherEtherTypePackets++; return; }
    counts.ipv4Packets++;
    if (frame.length < ipOffset + 20) { markMalformed(iface, 'short-ipv4-header'); return; }
    const ihl = (frame[ipOffset] & 15) * 4, ipLength = frame.readUInt16BE(ipOffset + 2);
    if ((frame[ipOffset] >>> 4) !== 4 || ihl < 20 || ipLength < ihl) {
      markMalformed(iface, 'invalid-ipv4-header'); return;
    }
    if (frame.length < ipOffset + ihl) { markMalformed(iface, 'short-ipv4-options'); return; }
    if (ipOffset + ipLength > frame.length) counts.truncatedNetworkPackets++;
    if (frame.readUInt16BE(ipOffset + 6) & 0x3fff) {
      counts.fragmentedIpv4UnsupportedPackets++; return;
    }
    const transport = frame[ipOffset + 9];
    if (transport !== 6 && transport !== 17) { counts.otherIpv4ProtocolPackets++; return; }
    const protocol = transport === 17 ? 'UDP' : 'TCP';
    counts[transport === 17 ? 'udpPackets' : 'tcpPackets']++;
    const at = ipOffset + ihl, end = Math.min(frame.length, ipOffset + ipLength);
    const minimum = transport === 17 ? 8 : 20;
    if (end - at < minimum) { markMalformed(iface, `short-${protocol.toLowerCase()}-header`); return; }
    let payloadAt, payloadEnd, payloadLength;
    if (transport === 17) {
      const udpLength = frame.readUInt16BE(at + 4);
      if (udpLength < 8 || udpLength > ipLength - ihl) { markMalformed(iface, 'invalid-udp-length'); return; }
      payloadAt = at + 8;
      payloadEnd = Math.min(end, at + udpLength);
      payloadLength = udpLength - 8;
    } else {
      const headerLength = (frame[at + 12] >>> 4) * 4;
      if (headerLength < 20 || headerLength > ipLength - ihl) { markMalformed(iface, 'invalid-tcp-header-length'); return; }
      if (at + headerLength > end) { markMalformed(iface, 'short-tcp-options'); return; }
      payloadAt = at + headerLength;
      payloadEnd = end;
      payloadLength = ipLength - ihl - headerLength;
    }
    const source = frame.readUInt32BE(ipOffset + 12), destination = frame.readUInt32BE(ipOffset + 16);
    const sourceLocal = locals.has(source), destinationLocal = locals.has(destination);
    if (sourceLocal && destinationLocal) { counts.bothEndpointsLocalPackets++; return; }
    if (!sourceLocal && !destinationLocal) { counts.unmatchedLocalAddressPackets++; return; }
    const remote = sourceLocal ? destination : source;
    if (!publicIPv4(remote) || locals.has(remote)) { counts.nonPublicPeerPackets++; return; }
    counts.publicPeerPackets++;
    const direction = sourceLocal ? 'outbound' : 'inbound';
    const remotePort = frame.readUInt16BE(at + (sourceLocal ? 2 : 0));
    const peer = ipv4Text(remote), key = `${protocol}|${peer}|${remotePort}|${direction}`;
    let flow = flows.get(key);
    if (!flow) {
      flow = { protocol, peerAddress: peer, peerPort: remotePort, direction,
        matchesGameHost: gameNumber !== null && remote === gameNumber,
        packetCount: 0, originalFrameBytes: 0, capturedFrameBytes: 0,
        ipBytes: 0, declaredTransportPayloadBytes: 0, capturedTransportPayloadBytes: 0,
        truncatedCapturePackets: 0, outOfOrderTimestamps: 0,
        lengths: [], times: [], udpFirstByteFrequencies: {}, recognizableHeaders: {} };
      flows.set(key, flow);
    }
    flow.packetCount++;
    flow.originalFrameBytes += originalLength;
    flow.capturedFrameBytes += frame.length;
    flow.ipBytes += ipLength;
    flow.declaredTransportPayloadBytes += payloadLength;
    flow.capturedTransportPayloadBytes += payloadEnd - payloadAt;
    if (frame.length < originalLength) flow.truncatedCapturePackets++;
    if (flow.times.length && timestamp < flow.times.at(-1)) flow.outOfOrderTimestamps++;
    flow.times.push(timestamp);
    flow.lengths.push(originalLength);
    const payload = frame.subarray(payloadAt, payloadEnd);
    let label;
    if (transport === 17) {
      if (payload.length) {
        const byte = `0x${payload[0].toString(16).padStart(2, '0')}`;
        increment(firstBytes, byte);
        increment(flow.udpFirstByteFrequencies, byte);
      }
      const inspectRaknet = gameNumber === null || remote === gameNumber;
      label = classifyUdp(payload, inspectRaknet, versions);
      if (inspectRaknet && offlineHeader(payload) && [0x05, 0x06, 0x07, 0x08, 0x19].includes(payload[0])) {
        // Use the local socket only as a private in-memory state key; never emit it.
        const localPort = frame.readUInt16BE(at + (sourceLocal ? 0 : 2));
        const stateKey = `${sectionIndex}|${localPort}|${peer}|${remotePort}`;
        let state = handshakeStates.get(stateKey);
        if (!state) { state = {}; handshakeStates.set(stateKey, state); }
        const fields = handshakeFields(payload, state);
        if (handshakeEvents.length < 1000) handshakeEvents.push({ timestamp,
          enhancedPacketIndex: counts.enhancedPacketBlocks, peerAddress: peer, peerPort: remotePort,
          direction, type: offlineHeader(payload), evidence: 'standard-magic-and-header-compatible',
          udpPayloadBytes: payload.length, ipPacketBytes: ipLength, ...fields });
        else omittedHandshakeEvents++;
      }
    } else label = classifyTcp(payload);
    increment(protocols, label);
    increment(flow.recognizableHeaders, label);
  }

  while (offset < data.length) {
    if (offset + 12 > data.length) fail('Truncated pcapng block header', offset);
    const sectionHeader = data.readUInt32LE(offset) === 0x0a0d0d0a;
    if (sectionHeader) {
      const bom = data.readUInt32LE(offset + 8);
      if (bom === 0x1a2b3c4d) little = true;
      else if (bom === 0x4d3c2b1a) little = false;
      else fail('Invalid pcapng section byte order magic', offset);
    } else if (sectionIndex < 0) fail('Missing pcapng section header', offset);
    const u16 = at => little ? data.readUInt16LE(at) : data.readUInt16BE(at);
    const u32 = at => little ? data.readUInt32LE(at) : data.readUInt32BE(at);
    const i64 = at => little ? data.readBigInt64LE(at) : data.readBigInt64BE(at);
    const type = u32(offset), length = u32(offset + 4);
    if (length < 12 || length % 4) fail('Invalid pcapng block length', offset);
    if (offset + length > data.length) fail('Truncated pcapng block', offset);
    if (u32(offset + length - 4) !== length) fail('Mismatched pcapng block trailer', offset);
    increment(blockTypes, `0x${type.toString(16).padStart(8, '0')}`);
    const body = offset + 8, bodyEnd = offset + length - 4;
    if (sectionHeader) {
      if (length < 28) fail('Short pcapng section header', offset);
      sectionIndex++;
      currentInterfaces = [];
      sections.push({ index: sectionIndex, byteOrder: little ? 'little-endian' : 'big-endian',
        version: `${u16(body + 4)}.${u16(body + 6)}` });
    } else if (type === 1) {
      if (length < 20) fail('Short pcapng interface description', offset);
      const iface = { sectionIndex, interfaceId: currentInterfaces.length,
        linkType: u16(body), snapshotLength: u32(body + 4),
        timestampResolution: { base: 10, exponent: 6 }, timestampOffsetSeconds: 0n,
        packetCount: 0, capturedFrameBytes: 0, originalFrameBytes: 0,
        truncatedCapturePackets: 0, malformedFrames: 0, vlanPackets: 0 };
      for (let option = body + 8; option < bodyEnd;) {
        if (option + 4 > bodyEnd) fail('Truncated pcapng interface option', offset);
        const code = u16(option), size = u16(option + 2);
        option += 4;
        if (code === 0) { if (size) fail('Invalid pcapng end option', offset); break; }
        if (option + Math.ceil(size / 4) * 4 > bodyEnd) fail('Invalid pcapng interface option length', offset);
        if (code === 9) {
          if (size !== 1) fail('Invalid pcapng timestamp resolution option', offset);
          iface.timestampResolution = { base: data[option] & 0x80 ? 2 : 10, exponent: data[option] & 0x7f };
        }
        if (code === 14) {
          if (size !== 8) fail('Invalid pcapng timestamp offset option', offset);
          iface.timestampOffsetSeconds = i64(option);
        }
        option += Math.ceil(size / 4) * 4;
      }
      currentInterfaces.push(iface);
      interfaces.push(iface);
    } else if (type === 6) {
      if (length < 32) fail('Short pcapng enhanced packet block', offset);
      const interfaceId = u32(body), capturedLength = u32(body + 12), originalLength = u32(body + 16);
      if (body + 20 + Math.ceil(capturedLength / 4) * 4 > bodyEnd) fail('Packet data exceeds pcapng block', offset);
      counts.enhancedPacketBlocks++;
      counts.capturedFrameBytes += capturedLength;
      counts.originalFrameBytes += originalLength;
      if (capturedLength < originalLength) counts.truncatedCapturePackets++;
      if (capturedLength > originalLength) counts.capturedLengthExceedsOriginal++;
      const iface = currentInterfaces[interfaceId];
      if (!iface) { counts.unknownInterfacePackets++; offset += length; continue; }
      const ticks = (BigInt(u32(body + 4)) << 32n) | BigInt(u32(body + 8));
      const resolution = BigInt(iface.timestampResolution.base) ** BigInt(iface.timestampResolution.exponent);
      const timestamp = (ticks * 1000000000n / resolution) + iface.timestampOffsetSeconds * 1000000000n;
      packet(data.subarray(body + 20, body + 20 + capturedLength), iface, timestamp, originalLength);
    }
    offset += length;
  }
  if (sectionIndex < 0) fail('Empty input is not a pcapng file');
  const flowResults = [...flows.values()].map(flow => {
    flow.times.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    const intervals = flow.times.slice(1).map((time, index) => Number(time - flow.times[index]) / 1000000);
    const { lengths, times, ...summary } = flow;
    return { ...summary,
      firstPacketSecondsFromCaptureStart: round(Number(times[0] - firstTime) / 1000000000),
      lastPacketSecondsFromCaptureStart: round(Number(times.at(-1) - firstTime) / 1000000000),
      originalFrameLengthBytes: distribution(lengths, [64, 128, 256, 512, 1024, 1500, 9000]),
      packetIntervalMilliseconds: distribution(intervals, [0, 1, 5, 10, 20, 50, 100, 500, 1000]),
      udpFirstByteFrequencies: sortedCounts(flow.udpFirstByteFrequencies),
      recognizableHeaders: sortedCounts(flow.recognizableHeaders),
    };
  }).sort((a, b) => b.packetCount - a.packetCount || a.peerAddress.localeCompare(b.peerAddress)
    || a.peerPort - b.peerPort || a.direction.localeCompare(b.direction));
  return {
    schemaVersion: 1, format: 'pcapng', inputBytes: data.length,
    privacy: { payloadIncluded: false, localAddressesIncluded: false, localPortsIncluded: false,
      identityFieldsDecoded: false, pcapngTextOptionsIncluded: false },
    analysis: { localAddressesProvided: locals.size, gameHostFilterProvided: gameNumber !== null,
      raknetHeaderCandidateScope: gameNumber === null ? 'all public UDP peers' : 'provided game host only',
      packetIntervalOrder: 'timestamp sorted per public peer, port, transport and direction',
      timestampPrecision: 'integer nanoseconds; sub-nanosecond resolutions rounded down',
      byteDefinition: 'original/captured frame lengths from EPB; no claim of physical wire overhead' },
    sections, interfaces: interfaces.map(({ timestampOffsetSeconds, ...iface }) => iface),
    durationSeconds: firstTime === null ? 0 : round(Number(lastTime - firstTime) / 1000000000),
    counts, malformedFrames: sortedCounts(malformed), blockTypes: sortedCounts(blockTypes),
    unsupportedPacketBlocks: { obsoletePacketBlocks: blockTypes['0x00000002'] ?? 0,
      simplePacketBlocks: blockTypes['0x00000003'] ?? 0 },
    recognizableHeaders: sortedCounts(protocols), udpFirstByteFrequencies: sortedCounts(firstBytes),
    raknetOpenRequest1VersionByteFrequencies: sortedCounts(versions),
    raknetHandshakeEvents: handshakeEvents.map(({ timestamp, ...event }) => ({ ...event,
      secondsFromCaptureStart: round(Number(timestamp - firstTime) / 1000000000) })),
    omittedHandshakeEvents, protocolReferences: REFERENCES,
    flows: flowResults,
    limitations: [
      'Only Ethernet (including VLAN), unfragmented IPv4 UDP/TCP enhanced packet blocks are decoded.',
      'IPv6, non-Ethernet links, fragmented IPv4 and obsolete/simple packet blocks are counted but not decoded.',
      'Flows omit peers that are local, private, reserved or not associated with a supplied local address.',
      'Header-compatible labels are candidates, not proof of protocol, authenticated session or valid packet contents.',
      'ACK/NAK prefix compatibility does not establish record layout; record-layout labels require the standard boundary checks.',
      'ACK/NAK record-count word orders are independent candidates; matching boundaries do not verify sequence ranges or a session.',
      'RakNet payloads, reliability frames, encryption and Rust application messages are not decoded or reassembled.',
      'Handshake fields require standard offline magic and compatible layouts; GUIDs, addresses, cookies and proofs are skipped.',
      'RakNet security flags concern transport security, not Rust EAC configuration or authentication status.',
      'MTU fields expose both byte-order interpretations; upstream compile options do not establish how this Rust library was built.',
      'TLS labels inspect an individual TCP segment prefix; TCP streams are not reassembled or decrypted.',
      'UDP first-byte frequencies are one-byte numeric counts only, not application message IDs.',
      'No deduplication or retransmission diagnosis; pktmon component duplicates may affect counts.',
      'No access to pre-capture traffic, process memory, authentication tickets or capture-tool drop counters.',
    ],
  };
}

async function main() {
  const args = process.argv.slice(2), localIps = [];
  let input, output, gameHost;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node analyze-capture.mjs <capture.pcapng> --local-ip <IPv4[,IPv4...]> [--game-host <IPv4>] [--out <summary.json>]');
      return;
    }
    if (['--local-ip', '--game-host', '--out'].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) fail('Missing option value');
      if (arg === '--local-ip') localIps.push(...value.split(','));
      else if (arg === '--game-host') gameHost = value;
      else output = value;
    } else if (arg.startsWith('-') || input) fail('Unknown option or extra input');
    else input = arg;
  }
  if (!input) fail('Input pcapng path is required; use --help');
  if (output && (process.platform === 'win32'
    ? resolve(input).toLowerCase() === resolve(output).toLowerCase()
    : resolve(input) === resolve(output))) fail('Output must differ from input');
  const result = analyzePcapng(await readFile(input), { localIps, gameHost });
  const json = JSON.stringify(result, null, 2) + '\n';
  if (output) {
    await mkdir(dirname(resolve(output)), { recursive: true });
    await writeFile(output, json, 'utf8');
    console.log(`Safe capture summary written: ${result.counts.enhancedPacketBlocks} enhanced packet blocks, ${result.flows.length} public peer/direction groups.`);
  } else process.stdout.write(json);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Node filesystem error messages contain filenames; do not echo those.
    console.error(`Capture analysis failed: ${error.code ?? error.message}`);
    process.exitCode = 1;
  });
}
