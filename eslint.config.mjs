import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/app/layout.tsx"],
    rules: {
      "@next/next/no-page-custom-font": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "test-results/**",
    "next-env.d.ts",
    // Vendor sample assets bundled with tilesets are not part of the app code.
    "public/Tailes/**/sample maps*/**",
    // Tiled/source assets under public are not application TypeScript.
    "public/map/**/*.tsx",
    "public/map/**/*.js",
  ]),
]);

export default eslintConfig;
