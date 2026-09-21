import { eslintCompatPlugin } from "@oxlint/plugins";

import { localTypeNameRule } from "./rules/local-type-name.ts";
import { noSilentCatchRule } from "./rules/no-silent-catch.ts";

/** Skriuw's house conventions that no built-in Oxlint rule expresses. */
const skriuwPlugin = eslintCompatPlugin({
  meta: { name: "skriuw" },
  rules: {
    "local-type-name": localTypeNameRule,
    "no-silent-catch": noSilentCatchRule,
  },
});

export default skriuwPlugin;
