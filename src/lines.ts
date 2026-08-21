import { closeSync, openSync, readSync } from "node:fs";

const NL = 0x0a;
const CHUNK = 1 << 22; // 4 MiB

// Stream a file and hand back only the lines containing `needle`, decoding just
// those bytes. Two reasons this isn't `readFileSync(...).split("\n")`:
//
//  1. Session logs get big — a single Grok `updates.jsonl` can pass 900 MB, well
//     over V8's max string length, so reading one as a string throws outright.
//  2. Filtering on the raw buffer skips decoding for the ~99% of bytes that
//     can't match, which is what keeps a multi-GB scan in the seconds range.
//
// `needle` must be ASCII and must not span a line break (true for the JSON key
// probes we use). Pass an empty needle to walk every line.
export function eachLineMatching(file: string, needle: string, onLine: (line: string) => void): void {
  let fd: number;
  try {
    fd = openSync(file, "r");
  } catch {
    return;
  }
  const probe = needle ? Buffer.from(needle, "utf8") : null;
  const chunk = Buffer.allocUnsafe(CHUNK);
  let carry: Buffer = Buffer.alloc(0);
  const emitAll = (region: Buffer) => {
    let start = 0;
    for (;;) {
      const nl = region.indexOf(NL, start);
      if (nl < 0) break;
      if (nl > start) onLine(region.toString("utf8", start, nl));
      start = nl + 1;
    }
  };
  const emitMatches = (region: Buffer, p: Buffer) => {
    let from = 0;
    for (;;) {
      const hit = region.indexOf(p, from);
      if (hit < 0) break;
      const start = region.lastIndexOf(NL, hit) + 1; // -1 + 1 = 0 → start of region
      let end = region.indexOf(NL, hit);
      if (end < 0) end = region.length;
      onLine(region.toString("utf8", start, end));
      from = end + 1;
    }
  };
  try {
    for (;;) {
      const n = readSync(fd, chunk, 0, CHUNK, null);
      if (n <= 0) break;
      const region = carry.length ? Buffer.concat([carry, chunk.subarray(0, n)]) : chunk.subarray(0, n);
      const lastNl = region.lastIndexOf(NL);
      if (lastNl < 0) {
        // no complete line yet — hold the whole thing (a single huge JSON line)
        carry = Buffer.from(region);
        continue;
      }
      const complete = region.subarray(0, lastNl + 1);
      if (probe) emitMatches(complete, probe);
      else emitAll(complete);
      carry = Buffer.from(region.subarray(lastNl + 1));
    }
    if (carry.length) {
      const tail = Buffer.concat([carry, Buffer.from("\n")]);
      if (probe) emitMatches(tail, probe);
      else emitAll(tail);
    }
  } finally {
    closeSync(fd);
  }
}
