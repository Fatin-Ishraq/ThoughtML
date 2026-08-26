# DSH Pier adapter

Registers DeepSeek Harness as a custom Pier agent so the three study conditions
(`D`, `M`, `T`) can run against DeepSWE tasks in sandboxed containers.

| file | role |
|---|---|
| `dsh_agent.py` | the adapter |
| `selftest.py` | offline checks; no container, model call, or credential needed |
| `verify_extraction.py` | recomputes reported metrics from raw logs and fails on any mismatch |

```bash
<pier-venv>/bin/python selftest.py
python3 verify_extraction.py --job <jobs-dir>
```

## Study runs

Use [`../case-study-01/run_case_study.py`](../case-study-01/run_case_study.py).
It refuses to start unless the model matches the pin in `protocol.md` §5.

## Development runs on another provider

Cheap iteration — on the harness, the state guidance, or a new task — should not
burn the study budget. The adapter supports any provider in `PROVIDER_PROFILES`;
today that is `deepseek-official` (built-in DSH plugin) and `openrouter` (served
by DSH's generic `llm-pi-ai` multi-provider adapter).

**These are development runs, not study data.** Anything other than the pinned
`deepseek-official/deepseek-v4-flash` is labelled automatically: the agent name
gains a `-dev` suffix, and the metrics metadata records
`run_class: "development"`. The study runner rejects them outright.

Put the key in a gitignored env file — `study/dsh/.env` already is:

```
OPENROUTER_API_KEY=...
```

Then launch Pier directly. The model id may itself contain a slash; only the
first slash separates provider from model:

```bash
pier run -p /root/deep-swe/tasks/<task-id> \
  --agent-import-path dsh_agent:DshAgent \
  --ak condition=T \
  --ak thoughtml_binary=/root/tml-bin/thoughtml \
  --ak context_window=200000 \
  -m openrouter/<vendor>/<model> \
  --env docker --memory ignore \
  --env-file study/dsh/.env \
  -o /root/devruns -q
```

`context_window` and `max_tokens` are optional but matter for a model newer than
the shipped pi-ai catalog: the route declares it explicitly, because a model the
route does not configure fails with `UNKNOWN_MODEL` before any request.

To shorten a probe rather than run a whole task, add
`--agent-timeout-multiplier 0.11` (~10 minutes). On the cattrs task the agent's
first *modifying* action lands around tool call 39, so a probe shorter than that
cannot observe the first required checkpoint.

## Adding a provider

Add an entry to `PROVIDER_PROFILES` in `dsh_agent.py` with its credential
variable, its API host for the network allowlist, and its `pi_ai_route` (`None`
if DSH ships a dedicated plugin for it). The allowlist is what keeps the agent
off the open internet — DeepSWE publishes reference solutions on GitHub — so a
new provider must name its host and nothing else.
