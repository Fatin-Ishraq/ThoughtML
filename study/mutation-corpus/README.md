# Mutation corpora

- `development/` contains the five documents used for the discarded 2026-08-21
  implementation pilot. Their results were seen; they are permanently
  inadmissible for the registered headline.
- `registered-clean/` contains the separately authored held-out corpus. The
  mutation runner refuses to touch it without an authoritative frozen manifest.

Both are disjoint from `examples/` and are not used as prompts in Experiments 0,
1, or 5. Every source file must pass:

```powershell
thoughtml check FILE --lint --strict
thoughtml --strict --strict-provenance FILE
```

The mutation generator records each source hash, operator, class, mutated span,
and applicable checker modes. Development-pilot output is preserved under
`study/runs/pilot-mutations-20260821/`. Registered output will go under
`study/runs/mutations/`; source files remain unchanged.
