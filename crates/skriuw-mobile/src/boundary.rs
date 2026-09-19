use std::panic::{AssertUnwindSafe, catch_unwind};

use crate::error::{MobileError, panic_detail};

/// Runs one exported call so a panic becomes a typed error instead of
/// unwinding into JNI or the Swift runtime, where it is undefined behaviour.
///
/// This is the second line of defence; the facade itself is written not to
/// panic. It only holds where the library is built with `panic = "unwind"`,
/// and the workspace release profile sets `panic = "abort"` — so
/// `scripts/build-android.sh` overrides it back, and any other build of this
/// crate for a device must do the same.
pub(crate) fn guarded<T>(call: impl FnOnce() -> Result<T, MobileError>) -> Result<T, MobileError> {
    match catch_unwind(AssertUnwindSafe(call)) {
        Ok(result) => result,
        Err(payload) => Err(MobileError::internal(panic_detail(payload))),
    }
}

#[cfg(test)]
mod tests {
    use super::{MobileError, guarded};

    #[test]
    fn a_panic_never_leaves_the_boundary() {
        let result = guarded::<()>(|| panic!("storage thread exploded"));
        match result {
            Err(MobileError::Internal { detail }) => {
                assert_eq!(detail, "storage thread exploded");
            }
            other => panic!("expected an internal error, got {other:?}"),
        }
    }

    #[test]
    fn results_pass_through_untouched() {
        assert_eq!(guarded(|| Ok(7)).expect("call must succeed"), 7);
        assert!(matches!(
            guarded::<()>(|| Err(MobileError::Closed)),
            Err(MobileError::Closed)
        ));
    }
}
