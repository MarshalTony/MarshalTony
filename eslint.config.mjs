import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { rules: { "@typescript-eslint/no-explicit-any": "off" } },
  // @react-pdf/renderer's <Image> is not an HTML image and takes no alt text.
  { files: ["src/server/reports/**", "src/app/api/pdf/**"], rules: { "jsx-a11y/alt-text": "off" } },
  { ignores: [".next/**", "node_modules/**", "storage/**"] },
];
