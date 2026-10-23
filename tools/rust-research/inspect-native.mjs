import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';

// Read PE tables as bytes. This script never loads or executes the DLL.
const [input, output] = process.argv.slice(2);
if (!input) throw new Error('Usage: node inspect-native.mjs <dll-path> [output.json]');
const data = await readFile(input);
function range(offset, size) {
  if (!Number.isSafeInteger(offset) || offset < 0 || size < 0 || offset + size > data.length) throw new Error('PE table is outside the file');
  return offset;
}
const u16 = at => data.readUInt16LE(range(at, 2));
const u32 = at => data.readUInt32LE(range(at, 4));
function string(at) {
  range(at, 1);
  const end = data.indexOf(0, at);
  if (end < 0 || end - at > 4096) throw new Error('Invalid PE string');
  return data.toString('ascii', at, end);
}
if (u16(0) !== 0x5a4d) throw new Error('Missing DOS signature');
const pe = u32(0x3c);
if (u32(pe) !== 0x4550) throw new Error('Missing PE signature');
const machine = u16(pe + 4), sectionCount = u16(pe + 6), optionalSize = u16(pe + 20);
const optional = pe + 24, magic = u16(optional);
if (![0x10b, 0x20b].includes(magic)) throw new Error('Unsupported PE format');
range(optional, optionalSize);
const directories = optional + (magic === 0x20b ? 112 : 96);
const directoryCount = u32(optional + (magic === 0x20b ? 108 : 92));
const headerSize = u32(optional + 60);
const sections = [];
if (sectionCount > 96) throw new Error('Unreasonable PE section count');
for (let index = 0; index < sectionCount; index++) {
  const at = optional + optionalSize + index * 40;
  range(at, 40);
  sections.push({ virtualSize: u32(at + 8), address: u32(at + 12), size: u32(at + 16), offset: u32(at + 20) });
}
function rva(value) {
  if (value < headerSize) return range(value, 1);
  const section = sections.find(item => value >= item.address && value < item.address + Math.max(item.virtualSize, item.size));
  if (!section || value - section.address >= section.size) throw new Error('RVA has no file-backed section');
  return range(section.offset + value - section.address, 1);
}
function directory(index) {
  if (index >= directoryCount || directories + index * 8 + 8 > optional + optionalSize) return { address: 0, size: 0 };
  return { address: u32(directories + index * 8), size: u32(directories + index * 8 + 4) };
}
const exportDir = directory(0), importDir = directory(1), certificateDir = directory(4);
const exports = [], imports = [];
if (exportDir.address) {
  const at = rva(exportDir.address);
  range(at, 40);
  const count = u32(at + 24);
  if (count > 100000) throw new Error('Unreasonable export count');
  const names = rva(u32(at + 32));
  range(names, count * 4);
  for (let index = 0; index < count; index++) exports.push(string(rva(u32(names + index * 4))));
}
if (importDir.address) {
  const at = rva(importDir.address);
  for (let index = 0; index < Math.min(Math.floor(importDir.size / 20), 1024); index++) {
    const entry = at + index * 20;
    range(entry, 20);
    if (data.subarray(entry, entry + 20).every(value => value === 0)) break;
    imports.push(string(rva(u32(entry + 12))));
  }
}
const result = {
  observedAt: new Date().toISOString(), file: basename(input), bytes: data.length,
  sha256: createHash('sha256').update(data).digest('hex'),
  inspection: 'Static PE header/import/export reads only; DLL not loaded or executed.',
  machine: `0x${machine.toString(16)}`, architecture: machine === 0x8664 ? 'x64' : machine === 0x14c ? 'x86' : 'other',
  peFormat: magic === 0x20b ? 'PE32+' : 'PE32',
  hasCertificateTable: Boolean(certificateDir.address && certificateDir.size),
  importedLibraries: imports, namedExports: exports,
};
if (output) await writeFile(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
