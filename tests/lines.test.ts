import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eachLineMatching } from "../src/lines.js";

function write(name: string, content: string): string {
  const file = join(mkdtempSync(join(tmpdir(), "ccmap-lines-")), name);
  writeFileSync(file, content);
  return file;
}

function collect(file: string, needle: string): string[] {
  const out: string[] = [];
  eachLineMatching(file, needle, (l) => out.push(l));
  return out;
}

test("returns only matching lines, whole and in order", () => {
  const file = write("a.jsonl", ["no", "yes-1 NEEDLE", "no", "yes-2 NEEDLE tail"].join("\n") + "\n");
  assert.deepEqual(collect(file, "NEEDLE"), ["yes-1 NEEDLE", "yes-2 NEEDLE tail"]);
});

test("an empty needle walks every non-empty line", () => {
  const file = write("b.jsonl", "a\nb\n\nc\n");
  assert.deepEqual(collect(file, ""), ["a", "b", "c"]);
});

test("a final line without a trailing newline is still seen", () => {
  const file = write("c.jsonl", "x\nlast NEEDLE");
  assert.deepEqual(collect(file, "NEEDLE"), ["last NEEDLE"]);
});

test("a line matching twice is emitted once", () => {
  const file = write("d.jsonl", "NEEDLE and NEEDLE again\n");
  assert.deepEqual(collect(file, "NEEDLE"), ["NEEDLE and NEEDLE again"]);
});

test("lines survive chunk boundaries, including multi-byte text", () => {
  // The reader works in 4 MiB chunks; build a file several chunks long so that
  // matches, newlines and multi-byte characters all land mid-chunk somewhere.
  const filler = "。".repeat(1000); // 3 bytes each → boundaries fall inside a character
  const lines: string[] = [];
  const expected: string[] = [];
  for (let i = 0; i < 3000; i++) {
    const line = i % 250 === 0 ? `${i} NEEDLE 中文 ${filler}` : `${i} plain ${filler}`;
    lines.push(line);
    if (line.includes("NEEDLE")) expected.push(line);
  }
  // one line by itself larger than a whole chunk
  const huge = "HUGE NEEDLE " + "x".repeat(5 << 20);
  lines.push(huge);
  expected.push(huge);
  const file = write("e.jsonl", lines.join("\n") + "\n");
  assert.deepEqual(collect(file, "NEEDLE"), expected);
});

test("a missing file yields nothing rather than throwing", () => {
  assert.deepEqual(collect(join(tmpdir(), "ccmap-nope", "missing.jsonl"), "x"), []);
});
