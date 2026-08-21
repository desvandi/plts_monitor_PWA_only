// =============================================================================
// STRICT ESLint config — PLTS Monitor PWA
// -----------------------------------------------------------------------------
// Unlike the reference Remote-Relay PWA (which disabled 25+ rules), this
// config RESTORES all recommended rules to "error" / "warn" so that genuine
// bugs (unused vars, exhaustive deps, no-explicit-any, etc.) fail the build.
// =============================================================================

import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "public/sw.js",
      "scripts/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // TypeScript — STRICT (restored vs reference which disabled these)
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/no-unused-disable-directive": "error",

      // React — STRICT
      "react-hooks/exhaustive-deps": "error",
      "react/no-unescaped-entities": "warn",
      "react/display-name": "warn",
      "react/prop-types": "off", // TS-only project

      // Next.js
      "@next/next/no-img-element": "warn",
      "@next/next/no-html-link-for-pages": "warn",

      // General — STRICT
      "prefer-const": "error",
      "no-unused-vars": "off", // TS rule covers this
      "no-console": [
        "warn",
        { allow: ["warn", "error"] },
      ],
      "no-debugger": "error",
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-irregular-whitespace": "error",
      "no-case-declarations": "warn",
      "no-fallthrough": "error",
      "no-mixed-spaces-and-tabs": "error",
      "no-redeclare": "error",
      "no-unreachable": "error",
      "no-useless-escape": "warn",
    },
  },
];

export default eslintConfig;
