//! Diagnostics with source line numbers (spec §16: "report diagnostics with
//! source line numbers").

use serde::Serialize;
use std::fmt;

/// Severity of a diagnostic.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Error,
    Warning,
}

impl fmt::Display for Severity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Severity::Error => write!(f, "error"),
            Severity::Warning => write!(f, "warning"),
        }
    }
}

/// A single diagnostic message tied to a 1-based source line.
#[derive(Debug, Clone, Serialize)]
pub struct Diagnostic {
    pub severity: Severity,
    /// 1-based source line number, or 0 when not line-specific.
    pub line: usize,
    pub message: String,
}

impl Diagnostic {
    pub fn error(line: usize, message: impl Into<String>) -> Self {
        Diagnostic {
            severity: Severity::Error,
            line,
            message: message.into(),
        }
    }

    pub fn warning(line: usize, message: impl Into<String>) -> Self {
        Diagnostic {
            severity: Severity::Warning,
            line,
            message: message.into(),
        }
    }
}

impl fmt::Display for Diagnostic {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.line > 0 {
            write!(f, "{}:{}: {}", self.line, self.severity, self.message)
        } else {
            write!(f, "{}: {}", self.severity, self.message)
        }
    }
}

/// A collection of diagnostics accumulated during parsing/validation.
#[derive(Debug, Clone, Default, Serialize)]
pub struct Diagnostics {
    pub items: Vec<Diagnostic>,
}

impl Diagnostics {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn error(&mut self, line: usize, message: impl Into<String>) {
        self.items.push(Diagnostic::error(line, message));
    }

    pub fn warning(&mut self, line: usize, message: impl Into<String>) {
        self.items.push(Diagnostic::warning(line, message));
    }

    pub fn has_errors(&self) -> bool {
        self.items.iter().any(|d| d.severity == Severity::Error)
    }

    pub fn has_warnings(&self) -> bool {
        self.items.iter().any(|d| d.severity == Severity::Warning)
    }

    pub fn extend(&mut self, other: Diagnostics) {
        self.items.extend(other.items);
    }
}
