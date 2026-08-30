import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { compileToolNames } from "./src/index.mjs";

// Behavior replicas are deliberately limited to the naming functions inspected
// at the pinned upstream commits recorded in the audit report.

function huggingFaceCatalog(entries) {
  const sanitize = (name) => name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  const seen = new Set();
  const definitions = [];
  const mapping = {};
  for (const { server, tool } of entries) {
    let name = sanitize(tool);
    if (name in mapping) {
      const candidate = `${name}_${sanitize(server)}`.slice(0, 64);
      if (!(candidate in mapping)) name = candidate;
      else {
        let n = 2;
        let next = `${candidate}_${n}`;
        while (n < 10 && next in mapping) {
          n += 1;
          next = `${candidate}_${n}`;
        }
        name = next.slice(0, 64);
      }
    }
    if (!seen.has(name)) {
      definitions.push(name);
      seen.add(name);
    }
    mapping[name] = { server, tool };
  }
  return { definitions, mapping };
}

function agUiNames(entries) {
  const used = new Set();
  return entries.map(({ server, tool }) => {
    const clean = (value) => value.replace(/[^a-zA-Z0-9_-]/g, "_");
    const base = `mcp__${clean(server)}__${clean(tool)}`;
    let name = base.slice(0, 64);
    for (let suffix = 1; used.has(name); suffix += 1) {
      const tail = `_${suffix}`;
      name = base.slice(0, 64 - tail.length) + tail;
    }
    used.add(name);
    return name;
  });
}

function fnvBase36(name) {
  let hash = 2166136261;
  for (let index = 0; index < name.length; index += 1) {
    hash = Math.imul(hash ^ name.charCodeAt(index), 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

function qwenName(name) {
  if (name.length <= 63 && /^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) return name;
  let normalized = name.replace(/[^A-Za-z0-9_-]/g, "_");
  if (!/^[A-Za-z]/.test(normalized)) normalized = `tool_${normalized}`;
  const suffix = `_${fnvBase36(name)}`;
  return normalized.slice(0, 63 - suffix.length) + suffix;
}

function findQwenCollision(limit = 500_000) {
  const fixed = "a".repeat(55);
  const seen = new Map();
  let state = 0x6d2b79f5;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  for (let index = 0; index < limit; index += 1) {
    const name = `${fixed}.${next().toString(36)}${next().toString(36)}${index.toString(36)}`;
    const hash = fnvBase36(name);
    const prior = seen.get(hash);
    if (prior && qwenName(prior) === qwenName(name))
      return [prior, name, qwenName(name)];
    seen.set(hash, name);
  }
  return undefined;
}

function n8nAlias(identity, normalized) {
  // The exact digest is irrelevant to this probe; n8n hashes every member of a
  // newly colliding group, so the prior plain alias necessarily changes.
  return `${normalized.slice(0, 55)}_${fnvBase36(identity).slice(0, 8)}`;
}

function openClawServerNames(names) {
  const used = new Set();
  return names.map((raw) => {
    const fragment = raw.trim().replace(/[^A-Za-z0-9_-]/g, "-");
    const normalized = /^[A-Za-z]/.test(fragment || "mcp")
      ? fragment || "mcp"
      : `mcp-${fragment}`;
    const base = normalized.slice(0, 30);
    let candidate = base;
    for (let n = 2; used.has(candidate.toLowerCase()); n += 1) {
      const suffix = `-${n}`;
      candidate = `${base.slice(0, Math.max(1, 30 - suffix.length))}${suffix}`;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

function openAiBatchAliases(entries) {
  const safe = (value, fallback) => {
    const cleaned = [...value]
      .map((char) =>
        /^[\x00-\x7F]$/.test(char) && /[A-Za-z0-9_-]/.test(char) ? char : "_",
      )
      .join("")
      .replace(/^[_-]+|[_-]+$/g, "");
    return cleaned || fallback;
  };
  const candidates = entries.map(({ server, tool }) => {
    const base = `mcp_${safe(server, "server")}__${safe(tool, "tool")}`;
    return { server, tool, base, seed: `${server}\0${tool}` };
  });
  const counts = new Map();
  for (const { base } of candidates)
    counts.set(base, (counts.get(base) ?? 0) + 1);
  const shorten = (base, seed, forceHash) => {
    if (!forceHash && base.length <= 64) return base;
    const suffix = `_${createHash("sha1").update(seed).digest("hex").slice(0, 8)}`;
    return `${base.slice(0, 64 - suffix.length).replace(/[_-]+$/g, "") || "mcp"}${suffix}`;
  };
  return candidates.map(({ base, seed }) =>
    shorten(base, seed, counts.get(base) > 1),
  );
}

const long = "x".repeat(64);
const hf = huggingFaceCatalog([
  { server: "alpha", tool: long },
  { server: "beta", tool: `${long}.different` },
]);
assert.deepEqual(hf.definitions, [long]);
assert.deepEqual(hf.mapping[long], {
  server: "beta",
  tool: `${long}.different`,
});

const pair = [
  { server: "srv", tool: "a.b" },
  { server: "srv", tool: "a/b" },
];
const agForward = agUiNames(pair);
const agReverseByTool = Object.fromEntries(
  agUiNames([...pair].reverse()).map((name, index) => [
    [...pair].reverse()[index].tool,
    name,
  ]),
);
assert.notEqual(agForward[0], agReverseByTool[pair[0].tool]);

const n8nBefore = "srv_a_b";
const n8nAfter = n8nAlias(JSON.stringify(["srv", "a.b"]), n8nBefore);
assert.notEqual(n8nBefore, n8nAfter);

const openClawPair = ["a.b", "a/b"];
const openClawForward = openClawServerNames(openClawPair);
const openClawReverseByServer = Object.fromEntries(
  openClawServerNames([...openClawPair].reverse()).map((name, index) => [
    [...openClawPair].reverse()[index],
    name,
  ]),
);
assert.notEqual(openClawForward[0], openClawReverseByServer[openClawPair[0]]);

const openAiBefore = openAiBatchAliases([{ server: "srv", tool: "a.b" }])[0];
const openAiAfter = openAiBatchAliases([
  { server: "srv", tool: "a.b" },
  { server: "srv", tool: "a/b" },
]);
assert.notEqual(openAiBefore, openAiAfter[0]);

const qwenCollision = findQwenCollision();
assert.ok(
  qwenCollision,
  "expected a deterministic 32-bit birthday collision within the probe budget",
);

const oursBefore = compileToolNames([
  { id: "dot", namespace: "srv", name: "a.b" },
]);
const oursAfter = compileToolNames(
  [
    { id: "dot", namespace: "srv", name: "a.b" },
    { id: "slash", namespace: "srv", name: "a/b" },
  ],
  { previousManifest: oursBefore.manifest },
);
assert.equal(oursAfter.toWire("dot"), oursBefore.toWire("dot"));
assert.notEqual(oursAfter.toWire("dot"), oursAfter.toWire("slash"));

console.log(
  JSON.stringify(
    {
      huggingFace: {
        exposedDefinitions: hf.definitions.length,
        inputTools: 2,
        overwrittenRoute: hf.mapping[long],
      },
      agUi: {
        forward: Object.fromEntries(
          pair.map((entry, index) => [entry.tool, agForward[index]]),
        ),
        reverse: agReverseByTool,
      },
      n8n: { before: n8nBefore, afterCollisionIntroduced: n8nAfter },
      openClaw: {
        forward: Object.fromEntries(
          openClawPair.map((server, index) => [server, openClawForward[index]]),
        ),
        reverse: openClawReverseByServer,
      },
      openAiAgents: {
        before: openAiBefore,
        afterCollisionIntroduced: openAiAfter,
      },
      qwen: {
        first: qwenCollision[0],
        second: qwenCollision[1],
        sharedAlias: qwenCollision[2],
      },
      codec: {
        before: oursBefore.toWire("dot"),
        after: oursAfter.toWire("dot"),
        added: oursAfter.toWire("slash"),
      },
    },
    null,
    2,
  ),
);
