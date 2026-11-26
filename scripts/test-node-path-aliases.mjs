import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const sourceRoot = resolve(fileURLToPath(new URL("../src/", import.meta.url)));
const extensions = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith("@/")) return nextResolve(specifier, context);

    const mappedPath = resolve(sourceRoot, specifier.slice(2));
    const relativePath = relative(sourceRoot, mappedPath);
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      return nextResolve(specifier, context);
    }

    const candidates = extname(mappedPath)
      ? [mappedPath]
      : [mappedPath, ...extensions.map((extension) => mappedPath + extension), ...extensions.map((extension) => resolve(mappedPath, "index" + extension))];
    const target = candidates.find(existsSync);
    return target
      ? nextResolve(pathToFileURL(target).href, context)
      : nextResolve(specifier, context);
  },
});
