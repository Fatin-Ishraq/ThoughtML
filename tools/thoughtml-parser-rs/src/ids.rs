//! Deterministic id generation (spec §11).
//!
//! Generated link ids use `FROM-RELATION-TO`; generated stance ids use
//! `AGENT-POSTURE-TARGET`. On collision a numeric suffix starting at `-2` is
//! appended. Generation is deterministic for a given parse order.

use std::collections::HashSet;

#[derive(Debug, Default)]
pub struct IdGen {
    used: HashSet<String>,
}

impl IdGen {
    pub fn new() -> Self {
        Self::default()
    }

    /// Is this id already in use?
    pub fn contains(&self, id: &str) -> bool {
        self.used.contains(id)
    }

    /// Reserve an explicit (author-provided) id. Returns `false` if it was
    /// already in use (the caller decides whether that is an error).
    pub fn reserve(&mut self, id: &str) -> bool {
        self.used.insert(id.to_string())
    }

    /// Generate a unique id from `base`, appending `-2`, `-3`, … on collision.
    pub fn generate(&mut self, base: &str) -> String {
        if self.used.insert(base.to_string()) {
            return base.to_string();
        }
        let mut n = 2usize;
        loop {
            let candidate = format!("{base}-{n}");
            if self.used.insert(candidate.clone()) {
                return candidate;
            }
            n += 1;
        }
    }

    /// Generate a link id (`FROM-RELATION-TO`).
    pub fn link_id(&mut self, from: &str, relation: &str, to: &str) -> String {
        self.generate(&format!("{from}-{relation}-{to}"))
    }

    /// Generate a stance id (`AGENT-POSTURE-TARGET`).
    pub fn stance_id(&mut self, agent: &str, posture: &str, target: &str) -> String {
        self.generate(&format!("{agent}-{posture}-{target}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collision_suffixes() {
        let mut g = IdGen::new();
        assert_eq!(g.generate("a-b-c"), "a-b-c");
        assert_eq!(g.generate("a-b-c"), "a-b-c-2");
        assert_eq!(g.generate("a-b-c"), "a-b-c-3");
    }

    #[test]
    fn link_and_stance_ids() {
        let mut g = IdGen::new();
        assert_eq!(
            g.link_id("deploy-change", "causes", "metric-shift"),
            "deploy-change-causes-metric-shift"
        );
        assert_eq!(
            g.stance_id("team", "noticed", "metric-shift"),
            "team-noticed-metric-shift"
        );
    }
}
