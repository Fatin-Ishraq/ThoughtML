# Current Goal

Implement `BaseConverter.partial_structure(obj, cl) -> PartialResult` in the cattrs repo (/app), on a new branch from main, with everything committed.

## Evidence

- Repo is cattrs, src layout at /app/src/cattrs; Python 3.12.12; uv + pytest available; cattrs resolves to /app/src/cattrs/__init__.py.
- `BaseConverter` in src/cattrs/converters.py (slots class); `Converter` adds `forbid_extra_keys`, `use_alias`, etc.
- `_compat.adapted_fields(cl)` gives attrs-style Attributes for attrs+dataclasses (resolves PEP 563); Attribute has .name/.type/.default(NOTHING)/.init/.alias.
- TypedDict helpers in gen/typeddicts.py: `_adapted_fields(cl)`, `_required_keys(cl)` (3.10-safe), `get_notrequired_base(t)` unwraps NotRequired/Required.
- cattrs TypedDict structuring copies input (`res = o.copy()`) so extra keys are preserved for TypedDicts; attrs classes ignore extra keys.
- detailed_validation semantics in gen code: per-field exceptions get `AttributeValidationNote`, collected into `ClassValidationError("While structuring " + cl.__name__, errors, cl)`; non-detailed raises the raw first exception.
- errors.py has ForbiddenExtraKeysError(message, cl, extra_fields), ClassValidationError, AttributeValidationNote.
- converter.get_structure_hook(t) returns a hook and may raise StructureHandlerNotFoundError.

Requirements from user request:

- `PartialResult` fields: `value` (partial object or None), `is_complete`, `structured_fields` (frozenset of field names), `failed_fields` (frozenset), `errors` (Exception or None), `error_map` (field name -> Exception).
- Fields absent from input are failed, not structured.
- Failed fields with defaults use defaults as fallback; required fields without defaults make `value` None.
- Nested attrs/dataclass fields recurse partially: nested partial value used + parent field marked failed; if nested value None entirely -> normal field failure.
- Collections (List/Dict) atomic: any element failure fails whole field.
- `PartialResult.refine(data)` -> new PartialResult fixing failed fields with new data, preserving structured ones.
- init=False fields excluded from both frozensets.
- forbid_extra_keys: extra keys make is_complete False but value still produced.
- Respect detailed_validation; support attrs classes, dataclasses, TypedDicts.
- Export `PartialResult`; add top-level `partial_structure`; new branch from main; commit everything.

## Current Hypothesis

- New module `src/cattrs/partial.py`: `PartialResult` (attrs frozen, Generic[T]) + core function `partial_structure(converter, obj, cl)`; converters.py imports it (one-way dep, no cycle).
- PartialResult stores private `_converter`, `_cl`, `_input` (excluded from eq/repr) to power `refine(data)` = re-run partial_structure on `{**input, **data}`.
- Field loop: skip init=False; absent -> failed (+KeyError in error_map); present -> try hook; on failure recurse only when type (Annotated-unwrapped) `has()` attrs/dataclass and nested.value not None -> use nested.value, mark failed, error_map[name]=nested.errors; else normal failure (default fallback via constructor omission; required-no-default => value None).
- Construction: attrs/dataclass via cl(**kwargs) using alias-or-name; TypedDict via input copy minus failed keys plus structured keys. Any required-field failure => value=None (uniform across kinds).
- errors: detailed_validation=True -> ClassValidationError group with AttributeValidationNotes; False -> first raw exception, no notes. All fields always attempted so error_map is fully populated.
- forbid_extra_keys via getattr(converter, "forbid_extra_keys", False): extras -> ForbiddenExtraKeysError appended, is_complete=False, value still built.
- is_complete = no failed fields AND no errors AND value produced.

## Superseded

- None.

## Actions and Results

- Explored repo; read converters.py, _compat.py, errors.py, gen/typeddicts.py, __init__.py, HISTORY.md, docs/tests layout.
- Verified tooling: python 3.12.12, uv, pytest present.
- First ledger commit rejected for non-exact section names; resubmitted with canonical sections.

## Unresolved

- Minor ambiguity (TypedDict required-key failure => None vs partial dict) resolved by literal spec reading: value None.

## Next Action

- Create branch, write partial.py, wire into converters.py + __init__.py, add tests, docs entry, HISTORY entry; run pytest + lint.

## Uncertainty

- Exact hidden-test expectations for edge cases (e.g., TypedDict required-missing => None vs partial dict); chose the literal reading of the spec wording.
