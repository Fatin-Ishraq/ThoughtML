## What this changes

<!-- The why, not just the what. -->

## Checklist

- [ ] `cargo fmt --all -- --check`, Clippy, and `cargo test -p thoughtml --all-features` pass
- [ ] `npm test` and `npm run build` pass (if the playground changed)
- [ ] `npm run build:viewer` and the viewer-freshness test pass (if shared viewer code changed)
- [ ] Examples still parse strict-clean (the conformance guard)
- [ ] Docs are updated and `mdbook build docs` passes when behavior or language changed
