# Design and invariants

## Identity layers

The package keeps three values separate:

1. `id`: a stable identity selected by the host.
2. `sourceName` plus optional `namespace`: the route used by the source protocol.
3. `wireName`: the bounded name exposed to the model provider.

Conflating those layers creates the common failure where sanitizing a name fixes provider validation but breaks source dispatch.

## Readable allocation

`readable-v1` preserves a legal, unique source spelling when possible. Any sanitization, truncation, collision, reservation, or historical conflict allocates a readable stem plus an expandable Base32 SHA-256 suffix. The whole active, retired, and reserved namespace is checked before an alias is accepted.

Readable aliases require the previous manifest to remain stable as a catalog grows. That is an explicit state contract rather than an undocumented property of insertion order.

## Stateless allocation

`stable-hash-v1` always uses the complete Base32 SHA-256 digest of the JSON-encoded tuple `[id, namespace, sourceName]`. It fails if the bounded profile cannot contain the full digest or if the complete alias conflicts with historical/reserved state.

This makes unrelated catalog growth irrelevant without claiming that history itself is stateless. Retired-name protection still requires a manifest.

## Tombstones

When an ID disappears, its entry remains in the manifest with `status: "retired"`. `lookupWire()` can inspect it, while `fromWire()` intentionally cannot dispatch it. A different identity never receives that alias.

An identical ID, namespace, and source name may reactivate its historical alias. The package cannot inspect the application behavior behind that identity; callers must mint a new ID when behavior changes incompatibly.

## Versioned profiles

Provider constraints change. Profile identifiers therefore behave like wire-format versions. Changing a regex or maximum in place would make the same manifest option produce different aliases after an upgrade, so an altered contract receives a new profile ID.

## Bounded work

Catalog entries, historical entries, source strings, reserved names, diagnostic arrays, and serialized identity fields are bounded before expensive hashing or allocation. Invalid manifests are normalized into a known shape and public output is deeply frozen.
