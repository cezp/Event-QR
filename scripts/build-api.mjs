import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
await mkdir("api-dist", { recursive: true });
await build({
  entryPoints: ["server/functions.ts"],
  outfile: "api-dist/index.cjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  external: ["@azure/functions", "@azure/data-tables", "fastify"],
});
await writeFile(
  "api-dist/package.json",
  JSON.stringify(
    {
      name: "event-qr-api",
      version: "1.0.0",
      main: "index.cjs",
      engines: { node: "22.x" },
      dependencies: {
        "@azure/functions": "^4.7.2",
        "@azure/data-tables": "^13.3.1",
        fastify: "^5.6.0",
      },
    },
    null,
    2,
  ),
);
await writeFile(
  "api-dist/host.json",
  JSON.stringify(
    { version: "2.0", logging: { logLevel: { default: "Warning" } } },
    null,
    2,
  ),
);
