# Argument status

*Flag: `--status` (or `--compute`).*

Where [derived confidence](derived-confidence.md) asks *"how strong?"*, argument
status asks a sharper question: **"does this claim survive every attack?"** The
answer is one of three labels.

| Label | Meaning |
|-------|---------|
| `in` | accepted — every attacker is defeated |
| `out` | defeated — at least one attacker is accepted |
| `undecided` | neither — e.g. a mutual attack with no resolution |

This is the **grounded extension** from Dung's argumentation framework (1995).

## The attack graph

Only two relations count as attacks:

- `opposes` — rebuts a node.
- `undercuts` — defeats an inference.

There's no separate "defends" relation, because defense falls out for free:
defending X means attacking X's attacker. If `risk` is attacked by `port-strike`,
and `guard opposes port-strike`, then `port-strike` goes `out` and `risk` is
reinstated to `in` — automatically.

## The labelling

Computed to the **least fixpoint**:

1. Start every contested node `undecided`.
2. Repeatedly:
   - label a node `in` if *all* of its attackers are already `out`
     (a node with no attackers is `in` immediately);
   - label a node `out` if *any* attacker is `in`.
3. Stop when nothing changes.

The result is **unique and deterministic**. Nodes caught in an unbroken mutual
attack stay `undecided`.

## Worked example

From the tutorial's [`self-audit.thml`](../appendix/examples.md):

```thml
link load-test-passed supports cache-is-safe
link stale-reads opposes cache-is-safe
```

`stale-reads` has no attackers → `in`. It `opposes` `cache-is-safe`, and that
attacker is `in`, so `cache-is-safe` → **`out`**. (The `supports` edge doesn't
enter the status calculation — support isn't an attack; it feeds
[derived confidence](derived-confidence.md) instead.)

That `out` is exactly what the [conflict report](conflicts.md) compares against
the agent's authored 0.9.

## Where it appears

`argument_status` is set on every focus and link that takes part in the attack
graph:

```json
{ "type": "focus", "id": "cache-is-safe", "argument_status": "out" }
```

It reads as a node colour/badge in the playground's Argument lens.
