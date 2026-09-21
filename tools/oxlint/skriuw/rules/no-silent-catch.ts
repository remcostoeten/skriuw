import { defineRule } from "@oxlint/plugins";

/** Require every catch block to handle, log, or explicitly `noop()` the error it receives. */
export const noSilentCatchRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow catch blocks without statements; comments do not count as handling the error.",
    },
    messages: {
      silentCatch:
        "Handle or log this error. To swallow it deliberately, call `noop()` from `@/shared/lib/noop`.",
    },
  },
  create(context) {
    return {
      CatchClause(node) {
        if (node.body.body.length > 0) return;
        context.report({ node: node.body, messageId: "silentCatch" });
      },
    };
  },
});
