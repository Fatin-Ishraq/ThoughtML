//! Unit classification for authored quantities (spec §4.7, Phase 7).
//!
//! Maps a unit token to a *dimension* and, where the unit is convertible, a
//! factor to that dimension's base unit. Physical dimensions (time, information)
//! convert freely; currencies and bare counts are distinct *per unit* (no
//! cross-conversion — there are no FX rates here, and `users` ≠ `requests`);
//! compound `a/b` units are kept opaque as rates. Pure data, no I/O.
//!
//! For the formula layer (Phase 8) it also provides true *dimensional analysis*:
//! a [`Signature`] is a vector of base-dimension exponents, so `+`/`-` can
//! require matching dimensions and `*`/`/` can derive new ones (a `USD/instance`
//! times an `instance` is `USD`). [`to_base`] converts a value+unit into its
//! base-unit magnitude and signature; [`signature_unit`] renders a signature
//! back to a display unit.

use std::collections::BTreeMap;

/// A dimensional signature: base-dimension key → integer exponent. Empty is
/// dimensionless. Keys are the canonical dimension strings (`time`,
/// `information`, `currency:USD`, `count:users`); `ratio` is dimensionless.
pub type Signature = BTreeMap<String, i32>;

/// Time units → seconds.
const TIME: &[(&str, f64)] = &[
    ("ns", 1e-9),
    ("us", 1e-6),
    ("µs", 1e-6),
    ("ms", 1e-3),
    ("s", 1.0),
    ("sec", 1.0),
    ("secs", 1.0),
    ("min", 60.0),
    ("mins", 60.0),
    ("h", 3600.0),
    ("hr", 3600.0),
    ("hrs", 3600.0),
    ("d", 86_400.0),
    ("day", 86_400.0),
    ("days", 86_400.0),
];

/// Information units → bytes (decimal SI and binary IEC).
const INFORMATION: &[(&str, f64)] = &[
    ("B", 1.0),
    ("byte", 1.0),
    ("bytes", 1.0),
    ("KB", 1e3),
    ("MB", 1e6),
    ("GB", 1e9),
    ("TB", 1e12),
    ("PB", 1e15),
    ("KiB", 1024.0),
    ("MiB", 1_048_576.0),
    ("GiB", 1_073_741_824.0),
    ("TiB", 1_099_511_627_776.0),
];

/// Recognized ISO-4217-style currency codes. Each is its own dimension — there
/// are no exchange rates in v0.2, so `USD` and `EUR` never mix.
const CURRENCIES: &[&str] = &[
    "USD", "EUR", "GBP", "JPY", "CNY", "INR", "CAD", "AUD", "CHF", "BRL", "SGD", "KRW",
];

/// Classify a unit into `(dimension, factor_to_base, base_unit)`. A `Some` factor
/// means the value is convertible: `value * factor` gives it in `base_unit`.
pub fn classify_unit(unit: &str) -> (String, Option<f64>, String) {
    if unit == "%" {
        return ("ratio".to_string(), Some(0.01), "1".to_string());
    }
    if let Some((_, f)) = TIME.iter().find(|(u, _)| *u == unit) {
        return ("time".to_string(), Some(*f), "s".to_string());
    }
    if let Some((_, f)) = INFORMATION.iter().find(|(u, _)| *u == unit) {
        return ("information".to_string(), Some(*f), "B".to_string());
    }
    if CURRENCIES.contains(&unit) {
        return (format!("currency:{unit}"), None, unit.to_string());
    }
    // A compound `a/b` unit (req/s, USD/mo, MB/s) is an opaque rate for now.
    if unit.contains('/') {
        return ("rate".to_string(), None, unit.to_string());
    }
    // Anything else is a bare count of some thing (users, requests, items): its
    // own dimension, comparable only to the same unit.
    (format!("count:{unit}"), None, unit.to_string())
}

/// Convert a value + unit into its magnitude in base units and its dimensional
/// [`Signature`]. Handles a single compound `a/b` unit by converting each side
/// and subtracting the denominator's exponents — so `0.02 USD/GB` becomes
/// `2e-11` with signature `{currency:USD: 1, information: -1}`, and multiplying
/// by `4000 GB` lands back on `80 USD`.
pub fn to_base(value: f64, unit: &str) -> (f64, Signature) {
    if let Some((num, den)) = unit.split_once('/') {
        let (nv, ns) = base_simple(value, num);
        let (dv, ds) = base_simple(1.0, den);
        let mut sig = ns;
        for (k, e) in ds {
            *sig.entry(k).or_insert(0) -= e;
        }
        sig.retain(|_, e| *e != 0);
        let v = if dv != 0.0 { nv / dv } else { f64::INFINITY };
        return (v, sig);
    }
    base_simple(value, unit)
}

/// `to_base` for a non-compound unit: apply the conversion factor and produce a
/// single-dimension signature (empty for the dimensionless `ratio`).
fn base_simple(value: f64, unit: &str) -> (f64, Signature) {
    let (dim, factor, _base) = classify_unit(unit);
    let v = value * factor.unwrap_or(1.0);
    let mut sig = Signature::new();
    if dim != "ratio" {
        sig.insert(dim, 1);
    }
    (v, sig)
}

/// The display symbol for a base-dimension key: `time`→`s`, `information`→`B`,
/// `currency:USD`→`USD`, `count:req`→`req`.
fn dim_symbol(key: &str) -> String {
    match key {
        "time" => "s".to_string(),
        "information" => "B".to_string(),
        _ => key
            .strip_prefix("count:")
            .or_else(|| key.strip_prefix("currency:"))
            .unwrap_or(key)
            .to_string(),
    }
}

/// Render a signature as a display unit: `{currency:USD:1}`→`USD`,
/// `{time:1}`→`s`, `{count:req:1, time:-1}`→`req/s`, empty→`` (dimensionless).
pub fn signature_unit(sig: &Signature) -> String {
    if sig.is_empty() {
        return String::new();
    }
    let mut num = Vec::new();
    let mut den = Vec::new();
    for (k, &e) in sig {
        let sym = dim_symbol(k);
        let term = if e.abs() == 1 {
            sym
        } else {
            format!("{sym}^{}", e.abs())
        };
        if e > 0 {
            num.push(term);
        } else {
            den.push(term);
        }
    }
    let n = if num.is_empty() {
        "1".to_string()
    } else {
        num.join("·")
    };
    if den.is_empty() {
        n
    } else {
        format!("{n}/{}", den.join("·"))
    }
}

/// A canonical dimension string for a signature, mirroring Phase-7 dimensions
/// where possible: empty→`dimensionless`, a lone exponent-1 key→that key, else a
/// compound `k^e·…` string.
pub fn signature_dimension(sig: &Signature) -> String {
    if sig.is_empty() {
        return "dimensionless".to_string();
    }
    if sig.len() == 1 {
        let (k, &e) = sig.iter().next().unwrap();
        if e == 1 {
            return k.clone();
        }
    }
    sig.iter()
        .map(|(k, e)| if *e == 1 { k.clone() } else { format!("{k}^{e}") })
        .collect::<Vec<_>>()
        .join("·")
}

/// Choose a human-friendly display unit for a base magnitude in a single
/// convertible dimension (v0.2, Phase 9): returns `(factor, unit)` such that
/// `display_value = base_value / factor`. For `{information:1}` and `{time:1}` it
/// scales to the largest unit that keeps the value ≥ 1 (so `8e9 B` reads as
/// `8 GB`); for any other signature it leaves the value in base units (factor 1).
pub fn pick_display(sig: &Signature, magnitude: f64) -> (f64, String) {
    const INFO: &[(&str, f64)] = &[
        ("PB", 1e15), ("TB", 1e12), ("GB", 1e9), ("MB", 1e6), ("KB", 1e3), ("B", 1.0),
    ];
    const TIME: &[(&str, f64)] = &[
        ("d", 86_400.0), ("h", 3600.0), ("min", 60.0), ("s", 1.0),
        ("ms", 1e-3), ("us", 1e-6), ("ns", 1e-9),
    ];
    let ladder = if is_single(sig, "information") {
        INFO
    } else if is_single(sig, "time") {
        TIME
    } else {
        return (1.0, signature_unit(sig));
    };
    // Largest unit the magnitude reaches; fall back to the smallest (base) unit.
    let pick = ladder
        .iter()
        .find(|(_, f)| magnitude >= *f)
        .copied()
        .unwrap_or_else(|| *ladder.last().unwrap());
    (pick.1, pick.0.to_string())
}

/// Whether `sig` is exactly one occurrence of `dim` at exponent +1.
fn is_single(sig: &Signature, dim: &str) -> bool {
    sig.len() == 1 && sig.get(dim) == Some(&1)
}

#[cfg(test)]
mod tests {
    use super::{classify_unit, pick_display, signature_unit, to_base, Signature};

    #[test]
    fn physical_dimensions_convert() {
        assert_eq!(classify_unit("ms"), ("time".into(), Some(1e-3), "s".into()));
        assert_eq!(classify_unit("GB"), ("information".into(), Some(1e9), "B".into()));
        assert_eq!(classify_unit("%"), ("ratio".into(), Some(0.01), "1".into()));
    }

    #[test]
    fn currency_count_and_rate_are_opaque() {
        assert_eq!(classify_unit("USD"), ("currency:USD".into(), None, "USD".into()));
        assert_eq!(classify_unit("users"), ("count:users".into(), None, "users".into()));
        assert_eq!(classify_unit("req/s"), ("rate".into(), None, "req/s".into()));
    }

    #[test]
    fn to_base_handles_compound_units() {
        // 0.02 USD/GB → 2e-11 with {currency:USD:1, information:-1}.
        let (v, sig) = to_base(0.02, "USD/GB");
        assert!((v - 2e-11).abs() < 1e-20);
        assert_eq!(sig.get("currency:USD"), Some(&1));
        assert_eq!(sig.get("information"), Some(&-1));
        assert_eq!(signature_unit(&sig), "USD/B");
    }

    #[test]
    fn pick_display_humanizes_convertible_dimensions() {
        let info: Signature = [("information".to_string(), 1)].into_iter().collect();
        // 8e9 bytes reads as 8 GB; 1.2 s stays seconds; currency is left alone.
        assert_eq!(pick_display(&info, 8e9), (1e9, "GB".to_string()));
        let time: Signature = [("time".to_string(), 1)].into_iter().collect();
        assert_eq!(pick_display(&time, 1.2), (1.0, "s".to_string()));
        let usd: Signature = [("currency:USD".to_string(), 1)].into_iter().collect();
        assert_eq!(pick_display(&usd, 2240.0), (1.0, "USD".to_string()));
    }

    #[test]
    fn rate_times_its_denominator_cancels() {
        // 180 USD/instance × 12 instance = 2160 USD (signatures cancel).
        let (rate, rsig) = to_base(180.0, "USD/instance");
        let (count, csig) = to_base(12.0, "instance");
        let mut prod = rsig.clone();
        for (k, e) in csig {
            *prod.entry(k).or_insert(0) += e;
        }
        prod.retain(|_, e| *e != 0);
        assert_eq!(rate * count, 2160.0);
        assert_eq!(signature_unit(&prod), "USD");
    }
}
