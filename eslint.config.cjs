module.exports = [
  {
    ignores: ["**/node_modules/**", "**/dist/**"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { browser: true, es2021: true },
    },
    plugins: {
      react: require("eslint-plugin-react"),
    },
    rules: {
      "no-unused-vars": "warn",
      "react/prop-types": "off"
    },
    settings: {
      react: {
        version: "detect"
      }
    }
  }
];
