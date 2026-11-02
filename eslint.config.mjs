// Lint: real bugs are errors (undefined names, unreachable code, duplicate keys); unused code warns.
import globals from "globals";

export default [
  { ignores: ["app/vendor/**", "bansuri-mastery/tools/**", "_site/**", "node_modules/**", "site/**", "docs/**", ".claude/**"] },
  {
    files: ["app/js/**/*.js", "sw.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: { ...globals.browser, ...globals.serviceworker } },
    rules: {
      "no-undef": "error", "no-unreachable": "error", "no-dupe-keys": "error", "no-dupe-args": "error", "no-redeclare": "error",
      "no-self-assign": "error", "no-unsafe-finally": "error", "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
      "no-constant-condition": ["error", { checkLoops: false }], "use-isnan": "error", "valid-typeof": "error",
    },
  },
  {
    files: ["tests/**/*.mjs", "scripts/**/*.mjs", "eslint.config.mjs"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: { ...globals.node, ...globals.browser } },
    rules: { "no-undef": "error", "no-unreachable": "error", "no-dupe-keys": "error" },
  },
];
