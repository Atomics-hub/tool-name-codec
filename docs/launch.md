# Launch kit

## Positioning

**One sentence:** Stable, collision-safe tool names across MCP, OpenAI, Anthropic, and Gemini.

**Problem sentence:** A sanitizer can make one name legal; it cannot keep an evolving multi-server catalog unique, reversible, migration-safe, and stable across stored transcripts.

**Category:** MCP tool-name normalization, function-calling name compatibility, collision-safe aliasing, and reverse routing.

## Search vocabulary

Use these phrases naturally in documentation and integration material:

- MCP tool name invalid OpenAI
- MCP tool name collision
- duplicate tool names across MCP servers
- function name exceeds 64 characters
- sanitize MCP tool names
- map model tool name to original MCP tool
- stable AI tool aliases
- OpenAI Anthropic Gemini tool-name compatibility

## Short announcement

MCP tool names can be valid at discovery and invalid—or ambiguous—when flattened into a model provider. I built `tool-name-codec`, a zero-dependency catalog compiler for stable OpenAI, Anthropic, Gemini, and MCP-compatible names. It handles post-sanitization collisions, exact reverse routing, migrations, reserved names, and retired-alias tombstones instead of pretending `sanitize(name)` is reversible.

## Technical announcement

`tool-name-codec` compiles an evolving tool catalog into a bounded provider namespace. Existing readable aliases remain stable when a manifest is carried forward; a stateless full-SHA-256 mode is available when persistence is impossible. Every output is checked against a versioned provider profile, every model-facing alias maps back to the caller-owned identity and original source route, and removed aliases remain non-dispatchable tombstones. The package is zero-dependency, dual ESM/CommonJS, typed, and tested across Node, browsers, workers, Bun, and Deno.

## Integration proof targets

The launch should prioritize code, not generic promotion:

1. A multi-server MCP example that exposes two colliding source names and dispatches both correctly.
2. A Vercel AI SDK-style tool-record example showing model-facing keys and source-owned execution closures.
3. An existing-alias migration example that preserves a production spelling and reports conflicts without touching stored transcripts.
4. Small, source-faithful comparison fixtures documenting order dependence, catalog-growth churn, and non-injective truncation in common local strategies.

External outreach should only target repositories with an exact name-allocation or reverse-routing seam. Do not post generic promotional issues.
