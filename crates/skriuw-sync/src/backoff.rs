#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SyncBackoffConfig {
    pub base_delay_ms: i64,
    pub max_delay_ms: i64,
    pub jitter_seed: u64,
}

impl Default for SyncBackoffConfig {
    fn default() -> Self {
        Self {
            base_delay_ms: 1_000,
            max_delay_ms: 60 * 1_000,
            jitter_seed: 0x5b7a_11ce_9d2f_04c3,
        }
    }
}

/// Bounded exponential backoff with deterministic jitter. Server retry hints
/// extend but never shorten the computed delay so a hinted rate limit cannot
/// be undercut by a small local backoff state.
#[derive(Debug, Clone)]
pub struct SyncBackoff {
    config: SyncBackoffConfig,
    consecutive_failures: u32,
}

impl SyncBackoff {
    #[must_use]
    pub fn new(config: SyncBackoffConfig) -> Self {
        Self {
            config,
            consecutive_failures: 0,
        }
    }

    pub fn reset(&mut self) {
        self.consecutive_failures = 0;
    }

    #[must_use]
    pub fn consecutive_failures(&self) -> u32 {
        self.consecutive_failures
    }

    pub fn next_delay_ms(&mut self, server_hint_ms: Option<i64>) -> i64 {
        let exponent = self.consecutive_failures.min(16);
        self.consecutive_failures = self.consecutive_failures.saturating_add(1);
        let exponential = self
            .config
            .base_delay_ms
            .saturating_mul(1_i64 << exponent)
            .min(self.config.max_delay_ms);
        let jitter_range = (exponential / 4).max(1);
        let jitter = (splitmix(
            self.config
                .jitter_seed
                .wrapping_add(u64::from(self.consecutive_failures)),
        ) % jitter_range as u64) as i64;
        let delay = (exponential + jitter).min(self.config.max_delay_ms);
        match server_hint_ms {
            Some(hint) if hint > delay => hint.min(self.config.max_delay_ms.saturating_mul(4)),
            _ => delay,
        }
    }
}

fn splitmix(mut state: u64) -> u64 {
    state = state.wrapping_add(0x9e37_79b9_7f4a_7c15);
    state = (state ^ (state >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    state = (state ^ (state >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    state ^ (state >> 31)
}

#[cfg(test)]
mod tests {
    use super::{SyncBackoff, SyncBackoffConfig};

    fn backoff() -> SyncBackoff {
        SyncBackoff::new(SyncBackoffConfig {
            base_delay_ms: 100,
            max_delay_ms: 10_000,
            jitter_seed: 7,
        })
    }

    #[test]
    fn grows_exponentially_and_stays_bounded() {
        let mut backoff = backoff();
        let delays = (0..12)
            .map(|_| backoff.next_delay_ms(None))
            .collect::<Vec<_>>();
        assert!(delays[0] >= 100 && delays[0] < 200);
        assert!(delays[1] >= 200 && delays[1] < 400);
        assert!(delays.windows(2).take(5).all(|pair| pair[1] > pair[0]));
        assert!(delays.iter().all(|delay| *delay <= 10_000));
    }

    #[test]
    fn is_deterministic_for_a_fixed_seed() {
        let mut first = backoff();
        let mut second = backoff();
        for _ in 0..8 {
            assert_eq!(first.next_delay_ms(None), second.next_delay_ms(None));
        }
    }

    #[test]
    fn reset_returns_to_the_base_delay() {
        let mut backoff = backoff();
        for _ in 0..6 {
            backoff.next_delay_ms(None);
        }
        backoff.reset();
        assert!(backoff.next_delay_ms(None) < 200);
    }

    #[test]
    fn server_hint_extends_but_never_shortens() {
        let mut backoff = backoff();
        assert!(backoff.next_delay_ms(Some(5_000)) == 5_000);
        let mut hinted = backoff.clone();
        let unhinted = backoff.next_delay_ms(None);
        assert_eq!(hinted.next_delay_ms(Some(1)), unhinted);
        let mut capped = backoff;
        assert!(capped.next_delay_ms(Some(10_000_000)) <= 40_000);
    }
}
