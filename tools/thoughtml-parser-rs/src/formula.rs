//! Formula expressions for computed quantities (spec §4.8, Phase 8).
//!
//! A focus may state `= <expr>` instead of (or beside) an authored `quantity`;
//! the expression is evaluated over other foci's quantities into a *computed*
//! quantity — an opt-in second reading, kept separate from the authored numbers
//! rather than a program the document runs.
//!
//! The evaluator carries a dimensional [`Signature`](crate::units::Signature)
//! through every operation: `+`/`-` require matching dimensions, `*`/`/` derive
//! new ones, so the arithmetic is unit-checked. Grammar:
//!
//! ```text
//! expr    := term (('+' | '-') term)*
//! term    := unary (('*' | '/') unary)*
//! unary   := '-' unary | primary
//! primary := number [unit] | ident '(' expr (',' expr)* ')'   (min/max)
//!          | ident | '(' expr ')'
//! ```
//!
//! A bare number is dimensionless; `500 USD` is an inline quantity literal (simple
//! units only — a compound `a/b` literal collides with division, so model those
//! as a focus). An `ident` is a reference to another focus by id; `min`/`max` are
//! the only functions. Pure: no I/O, references resolved through a caller-supplied
//! closure.

use crate::lex::is_identifier;
use crate::units::{self, Signature};

// --- Tokens ---------------------------------------------------------------

#[derive(Debug, Clone, PartialEq)]
enum Token {
    Num(f64),
    Ident(String),
    Plus,
    Minus,
    Star,
    Slash,
    LParen,
    RParen,
    Comma,
}

/// Tokenize a formula source. A `-` binds into an identifier only between
/// id-characters (so `a-b` is one id but `a - b` is subtraction).
fn tokenize(src: &str) -> Result<Vec<Token>, String> {
    let chars: Vec<char> = src.chars().collect();
    let mut toks = Vec::new();
    let mut i = 0;
    let is_ident_char = |c: char| c.is_ascii_alphanumeric() || c == '%';
    while i < chars.len() {
        let c = chars[i];
        if c.is_whitespace() {
            i += 1;
            continue;
        }
        match c {
            '+' => {
                toks.push(Token::Plus);
                i += 1;
            }
            '-' => {
                toks.push(Token::Minus);
                i += 1;
            }
            '*' => {
                toks.push(Token::Star);
                i += 1;
            }
            '/' => {
                toks.push(Token::Slash);
                i += 1;
            }
            '(' => {
                toks.push(Token::LParen);
                i += 1;
            }
            ')' => {
                toks.push(Token::RParen);
                i += 1;
            }
            ',' => {
                toks.push(Token::Comma);
                i += 1;
            }
            _ if c.is_ascii_digit() || c == '.' => {
                let start = i;
                while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.') {
                    i += 1;
                }
                let s: String = chars[start..i].iter().collect();
                let n = s
                    .parse::<f64>()
                    .map_err(|_| format!("invalid number `{s}`"))?;
                toks.push(Token::Num(n));
            }
            _ if c.is_ascii_alphabetic() || c == '%' => {
                let start = i;
                i += 1;
                while i < chars.len() {
                    if is_ident_char(chars[i]) {
                        i += 1;
                    } else if chars[i] == '-'
                        && i + 1 < chars.len()
                        && is_ident_char(chars[i + 1])
                    {
                        i += 1; // a hyphen inside an id (kebab-case)
                    } else {
                        break;
                    }
                }
                toks.push(Token::Ident(chars[start..i].iter().collect()));
            }
            _ => return Err(format!("unexpected character `{c}`")),
        }
    }
    Ok(toks)
}

// --- AST ------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq)]
enum Op {
    Add,
    Sub,
    Mul,
    Div,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Func {
    Min,
    Max,
}

#[derive(Debug, Clone)]
enum Expr {
    /// A dimensionless number literal.
    Num(f64),
    /// An inline quantity literal: `500 USD`.
    Quantity(f64, String),
    /// A reference to another focus by id.
    Ref(String),
    Neg(Box<Expr>),
    Bin(Op, Box<Expr>, Box<Expr>),
    Call(Func, Vec<Expr>),
}

/// A parsed, ready-to-evaluate formula.
pub struct Formula {
    expr: Expr,
}

fn func_of(name: &str) -> Option<Func> {
    match name {
        "min" => Some(Func::Min),
        "max" => Some(Func::Max),
        _ => None,
    }
}

// --- Parser ---------------------------------------------------------------

struct Parser {
    toks: Vec<Token>,
    pos: usize,
}

impl Parser {
    fn peek(&self) -> Option<&Token> {
        self.toks.get(self.pos)
    }

    fn next(&mut self) -> Option<Token> {
        let t = self.toks.get(self.pos).cloned();
        if t.is_some() {
            self.pos += 1;
        }
        t
    }

    fn expect(&mut self, t: Token, what: &str) -> Result<(), String> {
        if self.peek() == Some(&t) {
            self.pos += 1;
            Ok(())
        } else {
            Err(format!("expected {what}"))
        }
    }

    fn parse_expr(&mut self) -> Result<Expr, String> {
        let mut left = self.parse_term()?;
        while let Some(op) = match self.peek() {
            Some(Token::Plus) => Some(Op::Add),
            Some(Token::Minus) => Some(Op::Sub),
            _ => None,
        } {
            self.pos += 1;
            let right = self.parse_term()?;
            left = Expr::Bin(op, Box::new(left), Box::new(right));
        }
        Ok(left)
    }

    fn parse_term(&mut self) -> Result<Expr, String> {
        let mut left = self.parse_unary()?;
        while let Some(op) = match self.peek() {
            Some(Token::Star) => Some(Op::Mul),
            Some(Token::Slash) => Some(Op::Div),
            _ => None,
        } {
            self.pos += 1;
            let right = self.parse_unary()?;
            left = Expr::Bin(op, Box::new(left), Box::new(right));
        }
        Ok(left)
    }

    fn parse_unary(&mut self) -> Result<Expr, String> {
        if self.peek() == Some(&Token::Minus) {
            self.pos += 1;
            return Ok(Expr::Neg(Box::new(self.parse_unary()?)));
        }
        self.parse_primary()
    }

    fn parse_primary(&mut self) -> Result<Expr, String> {
        match self.next() {
            Some(Token::Num(n)) => {
                // An identifier immediately after a number is its unit.
                if let Some(Token::Ident(u)) = self.peek() {
                    let u = u.clone();
                    self.pos += 1;
                    Ok(Expr::Quantity(n, u))
                } else {
                    Ok(Expr::Num(n))
                }
            }
            Some(Token::Ident(name)) => {
                if let (Some(func), Some(&Token::LParen)) = (func_of(&name), self.peek()) {
                    self.pos += 1; // consume '('
                    let mut args = vec![self.parse_expr()?];
                    while self.peek() == Some(&Token::Comma) {
                        self.pos += 1;
                        args.push(self.parse_expr()?);
                    }
                    self.expect(Token::RParen, "`)` to close the call")?;
                    Ok(Expr::Call(func, args))
                } else {
                    Ok(Expr::Ref(name))
                }
            }
            Some(Token::LParen) => {
                let e = self.parse_expr()?;
                self.expect(Token::RParen, "`)`")?;
                Ok(e)
            }
            Some(t) => Err(format!("unexpected `{t:?}` in expression")),
            None => Err("unexpected end of formula".to_string()),
        }
    }
}

/// Parse a formula source into a [`Formula`], or a human-readable error.
pub fn parse(src: &str) -> Result<Formula, String> {
    let toks = tokenize(src)?;
    if toks.is_empty() {
        return Err("empty formula".to_string());
    }
    let mut p = Parser { toks, pos: 0 };
    let expr = p.parse_expr()?;
    if p.pos != p.toks.len() {
        return Err("unexpected trailing tokens in formula".to_string());
    }
    Ok(Formula { expr })
}

// --- Evaluation -----------------------------------------------------------

fn merge(a: &Signature, b: &Signature, sub: bool) -> Signature {
    let mut out = a.clone();
    for (k, e) in b {
        let v = out.entry(k.clone()).or_insert(0);
        *v += if sub { -e } else { *e };
    }
    out.retain(|_, e| *e != 0);
    out
}

impl Formula {
    /// Evaluate to a base-unit magnitude and dimensional signature. `resolve`
    /// supplies a referenced focus's `(base_value, signature)` or an error
    /// explaining why it can't be used (unknown, or has no quantity).
    pub fn eval(
        &self,
        resolve: &dyn Fn(&str) -> Result<(f64, Signature), String>,
    ) -> Result<(f64, Signature), String> {
        eval(&self.expr, resolve)
    }
}

fn eval(
    e: &Expr,
    resolve: &dyn Fn(&str) -> Result<(f64, Signature), String>,
) -> Result<(f64, Signature), String> {
    match e {
        Expr::Num(n) => Ok((*n, Signature::new())),
        Expr::Quantity(n, u) => Ok(units::to_base(*n, u)),
        Expr::Ref(id) => resolve(id),
        Expr::Neg(inner) => {
            let (v, s) = eval(inner, resolve)?;
            Ok((-v, s))
        }
        Expr::Bin(op, a, b) => {
            let (va, sa) = eval(a, resolve)?;
            let (vb, sb) = eval(b, resolve)?;
            match op {
                Op::Add | Op::Sub => {
                    if sa != sb {
                        return Err(format!(
                            "cannot {} quantities of different dimensions ({} and {})",
                            if *op == Op::Add { "add" } else { "subtract" },
                            units::signature_dimension(&sa),
                            units::signature_dimension(&sb),
                        ));
                    }
                    let v = if *op == Op::Add { va + vb } else { va - vb };
                    Ok((v, sa))
                }
                Op::Mul => Ok((va * vb, merge(&sa, &sb, false))),
                Op::Div => {
                    if vb == 0.0 {
                        return Err("division by zero".to_string());
                    }
                    Ok((va / vb, merge(&sa, &sb, true)))
                }
            }
        }
        Expr::Call(func, args) => {
            if args.is_empty() {
                return Err("min/max needs at least one argument".to_string());
            }
            let mut best: Option<(f64, Signature)> = None;
            for a in args {
                let (v, s) = eval(a, resolve)?;
                match &best {
                    None => best = Some((v, s)),
                    Some((bv, bs)) => {
                        if &s != bs {
                            return Err(format!(
                                "min/max needs matching dimensions ({} and {})",
                                units::signature_dimension(bs),
                                units::signature_dimension(&s),
                            ));
                        }
                        let take = match func {
                            Func::Min => v < *bv,
                            Func::Max => v > *bv,
                        };
                        if take {
                            best = Some((v, s));
                        }
                    }
                }
            }
            Ok(best.unwrap())
        }
    }
}

/// The focus ids a formula references — every identifier that is not a unit
/// (i.e. not immediately after a number) nor a function name. Used by validation
/// for reference resolution and connectivity (a formula links a focus to its
/// inputs). Returns empty on a tokenizer error; the eval pass reports those.
pub fn referenced_ids(src: &str) -> Vec<String> {
    let Ok(toks) = tokenize(src) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for (i, t) in toks.iter().enumerate() {
        let Token::Ident(name) = t else { continue };
        // A unit sits right after a number.
        if matches!(i.checked_sub(1).and_then(|j| toks.get(j)), Some(Token::Num(_))) {
            continue;
        }
        // A function name is followed by `(`.
        if func_of(name).is_some() && toks.get(i + 1) == Some(&Token::LParen) {
            continue;
        }
        if is_identifier(name) && !out.contains(name) {
            out.push(name.clone());
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    /// A resolver from a fixed table of `id → (value, unit)`.
    fn table<'a>(
        pairs: &'a [(&'a str, f64, &'a str)],
    ) -> impl Fn(&str) -> Result<(f64, Signature), String> + 'a {
        move |id: &str| {
            pairs
                .iter()
                .find(|(n, _, _)| *n == id)
                .map(|(_, v, u)| units::to_base(*v, u))
                .ok_or_else(|| format!("unknown reference `{id}`"))
        }
    }

    fn eval_str(src: &str, pairs: &[(&str, f64, &str)]) -> Result<(f64, String), String> {
        let f = parse(src)?;
        let (v, s) = f.eval(&table(pairs))?;
        Ok((v, units::signature_unit(&s)))
    }

    #[test]
    fn sums_same_dimension() {
        let (v, u) = eval_str("a + b", &[("a", 2160.0, "USD"), ("b", 80.0, "USD")]).unwrap();
        assert_eq!((v, u.as_str()), (2240.0, "USD"));
    }

    #[test]
    fn converts_within_a_dimension() {
        // 200 ms + 1 s = 1.2 s.
        let (v, u) = eval_str("a + b", &[("a", 200.0, "ms"), ("b", 1.0, "s")]).unwrap();
        assert!((v - 1.2).abs() < 1e-9);
        assert_eq!(u, "s");
    }

    #[test]
    fn rejects_mixed_dimensions() {
        let err = eval_str("a + b", &[("a", 1.0, "USD"), ("b", 1.0, "ms")]).unwrap_err();
        assert!(err.contains("different dimensions"), "{err}");
    }

    #[test]
    fn rate_times_count_cancels_units() {
        let (v, u) = eval_str(
            "cost-per-instance * instances",
            &[("cost-per-instance", 180.0, "USD/instance"), ("instances", 12.0, "instance")],
        )
        .unwrap();
        assert_eq!((v, u.as_str()), (2160.0, "USD"));
    }

    #[test]
    fn ratio_comes_out_dimensionless() {
        // (revenue - cost) / revenue → a bare ratio.
        let (v, u) = eval_str(
            "(revenue - cost) / revenue",
            &[("revenue", 50000.0, "USD"), ("cost", 2240.0, "USD")],
        )
        .unwrap();
        assert!((v - 0.9552).abs() < 1e-9);
        assert_eq!(u, "");
    }

    #[test]
    fn scalar_and_percent_literals() {
        // base * (1 - 10%) = base * 0.9.
        let (v, _u) = eval_str("base * (1 - 10%)", &[("base", 200.0, "USD")]).unwrap();
        assert!((v - 180.0).abs() < 1e-9);
    }

    #[test]
    fn inline_quantity_literal() {
        let (v, u) = eval_str("base + 500 USD", &[("base", 1000.0, "USD")]).unwrap();
        assert_eq!((v, u.as_str()), (1500.0, "USD"));
    }

    #[test]
    fn min_max_functions() {
        let (v, _) = eval_str("max(a, b)", &[("a", 3.0, "instance"), ("b", 7.0, "instance")]).unwrap();
        assert_eq!(v, 7.0);
    }

    #[test]
    fn division_by_zero_errors() {
        assert!(eval_str("a / b", &[("a", 1.0, "USD"), ("b", 0.0, "USD")]).is_err());
    }

    #[test]
    fn unknown_reference_errors() {
        assert!(eval_str("ghost + 1", &[]).unwrap_err().contains("ghost"));
    }

    #[test]
    fn referenced_ids_skips_units_and_functions() {
        let ids = referenced_ids("max(cost-per-instance * instances, 500 USD) - buffer");
        assert_eq!(ids, vec!["cost-per-instance", "instances", "buffer"]);
    }

    #[test]
    fn kebab_ids_vs_subtraction() {
        // `a-b` is one id; `a - b` is subtraction of two.
        assert_eq!(referenced_ids("a-b"), vec!["a-b"]);
        assert_eq!(referenced_ids("a - b"), vec!["a", "b"]);
    }

    #[test]
    fn parse_errors_are_reported() {
        assert!(parse("a +").is_err());
        assert!(parse("* a").is_err());
        assert!(parse("(a + b").is_err());
    }

    // Keep BTreeMap import used even if the table helper changes.
    #[allow(dead_code)]
    fn _sig() -> Signature {
        BTreeMap::new()
    }
}
