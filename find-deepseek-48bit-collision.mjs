import { createHash } from "node:crypto";

// DeepSeek's publicToolName() retains 12 hexadecimal SHA-256 characters after
// lossy normalization. These raw names all normalize to the same underscore
// stem, so a digest collision is also a public-name collision. This is a
// bounded birthday probe, not a claim that normal tool catalogs are this large.
const SYMBOLS = [".", "/", ":", " "];
const NAME_WIDTH = 13;
const SAMPLE_COUNT = 2 ** 25;
const BUCKET_COUNT = 2 ** 24;
const serverName = process.argv[2] ?? "collision-probe";

const heads = new Int32Array(BUCKET_COUNT);
heads.fill(-1);
const lows = new Uint32Array(SAMPLE_COUNT);
const next = new Int32Array(SAMPLE_COUNT);

function rawName(index) {
  let value = index;
  let name = "tool";
  for (let position = 0; position < NAME_WIDTH; position += 1) {
    name += SYMBOLS[value & 3];
    value = Math.floor(value / 4);
  }
  return name;
}

const started = performance.now();
for (let index = 0; index < SAMPLE_COUNT; index += 1) {
  const name = rawName(index);
  const digest = createHash("sha256").update(`${serverName}\0${name}`).digest();
  const high = digest.readUIntBE(0, 3);
  const low = digest.readUIntBE(3, 3);
  for (let prior = heads[high]; prior !== -1; prior = next[prior]) {
    if (lows[prior] === low) {
      const priorName = rawName(prior);
      const suffix = digest.subarray(0, 6).toString("hex");
      const normalized = `mcp__${serverName}__${name}`.replace(
        /[^A-Za-z0-9_-]/g,
        "_",
      );
      const publicName = `${normalized.slice(0, 64 - 12 - 1)}_${suffix}`;
      console.log(
        JSON.stringify(
          {
            found: true,
            serverName,
            firstIndex: prior,
            secondIndex: index,
            firstRawName: priorName,
            secondRawName: name,
            suffix,
            publicName,
            tested: index + 1,
            elapsedMs: performance.now() - started,
          },
          null,
          2,
        ),
      );
      process.exit(0);
    }
  }
  lows[index] = low;
  next[index] = heads[high];
  heads[high] = index;
}

console.log(
  JSON.stringify(
    {
      found: false,
      serverName,
      tested: SAMPLE_COUNT,
      elapsedMs: performance.now() - started,
    },
    null,
    2,
  ),
);
