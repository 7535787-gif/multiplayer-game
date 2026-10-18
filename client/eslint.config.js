import js from "@eslint/js";
import prettier from "eslint-config-prettier";

export default [
  js.configs.recommended,
  prettier,

  {
    files: ["**/*.js"],

    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",

      globals: {
        window: "readonly", document: "readonly", console: "readonly", DOMException: "readonly", Image: "readonly",
        performance: "readonly", requestAnimationFrame: "readonly",
        location: "readonly", URL: "readonly", URLSearchParams: "readonly",
        TextEncoder: "readonly", TextDecoder: "readonly", WebSocket: "readonly",
        CustomEvent: "readonly", Event: "readonly", EventTarget: "readonly",
        setTimeout: "readonly", clearTimeout: "readonly", setInterval: "readonly",
        clearInterval: "readonly", AbortController: "readonly", AbortSignal: "readonly",
        fetch: "readonly", process: "readonly", Buffer: "readonly",
        __dirname: "readonly", __filename: "readonly", globalThis: "readonly",
      },
    },

    rules: {},
  },

  {
    ignores: ["dist/**", "node_modules/**"],
  },
];
