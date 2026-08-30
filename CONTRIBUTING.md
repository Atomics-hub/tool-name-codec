# Contributing

Issues and focused pull requests are welcome.

Before opening a change:

1. Explain the provider, runtime, or migration behavior being changed.
2. Link the authoritative specification or a reproducible failure.
3. Add a regression test that would fail without the change.
4. Run `npm run verify`.

Existing profile IDs are immutable compatibility contracts. Provider changes require a new dated or versioned profile rather than silently changing old output.
