# Profiles, imports, namespaces

> **Advanced.** These features let ThoughtML scale beyond a single document and a
> single vocabulary. They're fully implemented and tested, but most documents
> never need them — reach for them when you do.

## Profiles — custom vocabulary

The core vocabulary (kinds, relations, postures, fields) is deliberately small.
A **profile** lets a document's *dialect* declare extra terms so strict
validation accepts them instead of warning.

```thml
profile risk-analysis
  kinds risk, mitigation
  relations aggravates
  postures flags
  fields likelihood

# now these are first-class in this document:
focus port-strike
  kind risk

link weak-monitoring aggravates port-strike

ops flags port-strike
  likelihood high
```

A profile declares four list-valued fields — `kinds`, `relations`, `fields`,
`postures` — and any term it lists stops triggering the "unknown kind/relation/
field/posture" warnings. The bundled
[`threat-model.thml`](../appendix/examples.md) is a complete example. The
profile itself is recorded as a `Profile` object (document metadata, not a
referenceable node).

## Imports — multiple documents

A document can pull in another and reference its records under a **namespace**:

```thml
import shared-defs as base

link my-plan depends-on base.capacity-budget
```

- `import <name> as <ns>` makes the records of document `<name>` available under
  the prefix `<ns>.`.
- A reference like `base.capacity-budget` resolves to the `capacity-budget`
  record in the imported `shared-defs` document.
- Imports resolve **recursively** (an imported doc may import others), and import
  **cycles** are detected, reported, and broken.

### How imports are resolved

Imports are a *project-level* concern — the host has to supply the other
documents' sources:

- **CLI:** when an entry file contains `import` lines, the parser reads the
  sibling files `<name>.thml` from the entry's directory.
- **Playground:** the project workspace resolves imports against the sibling
  `.thml` files currently open. It can connect to a real directory (where the
  browser supports directory access), open a portable selection of files, or
  load the bundled six-file Snake project.

Every id and structural reference from an imported document is prefixed with the
namespace, so two documents can use the same local id without collision. The
bundled [`compliance-rollout.thml`](../appendix/examples.md) (which imports
`control-library.thml`) must be run as a project to resolve — open it in the
playground, or run it through the CLI from the examples directory.

### Provenance in the unified graph

Project compilation produces a source map beside the canonical model. Every
authored or desugared object records the module and source line that produced it.
The playground uses that map to label imported nodes, jump from a Reasoning Card
to the exact editor location, and qualify diagnostics; live and standalone
viewers keep the location as read-only provenance.

An imported conclusion used by another module is a compact gateway in the
unified graph. If it has supporting ancestry inside its own module, a subtle
stacked-node marker appears. Select it and choose **Expand reasoning** to reveal
that same-module ancestry in place; **Collapse reasoning** folds it back into the
project overview. Expansion does not reparse or alter the document—it is a view
over the already merged canonical graph.

> **v1 limitations.** References *inside a `formula` string* are not namespace-
> rewritten, and agent names stay global (not prefixed).
