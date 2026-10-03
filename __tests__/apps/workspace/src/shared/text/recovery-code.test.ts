import assert from "node:assert/strict";
import { test } from "vitest";
import { normalizeRecoveryCodeInput, recoveryCodeLooksComplete } from "@/shared/text/recovery-code";

test("typed recovery codes are regrouped and bounded", () => {
  assert.equal(
    normalizeRecoveryCodeInput("0123456789abcdefghjkmnpqrstvwxyz"),
    "0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ",
  );
  assert.equal(normalizeRecoveryCodeInput("  0123 4567  "), "0123-4567");
  assert.equal(
    normalizeRecoveryCodeInput("0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ-EXTRA").length,
    39,
  );
});

test("only a complete code enables the unlock action", () => {
  assert.equal(recoveryCodeLooksComplete("0123-4567"), false);
  assert.equal(recoveryCodeLooksComplete("0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ"), true);
});
