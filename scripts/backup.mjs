import { TableClient } from "@azure/data-tables";
import { execFileSync } from "node:child_process";
import { writeFile, mkdir, rm } from "node:fs/promises";
const connection = process.env.STORAGE_CONNECTION_STRING;
if (!connection) throw new Error("Missing storage configuration");
const client = TableClient.fromConnectionString(connection, "eventqr");
const rows = [];
for await (const row of client.listEntities())
  rows.push({
    partitionKey: row.partitionKey,
    rowKey: row.rowKey,
    data: row.data,
  });
await mkdir(".local", { recursive: true });
const file = ".local/backup.json";
const name =
  "eventqr-" + new Date().toISOString().replaceAll(":", "-") + ".json";
try {
  await writeFile(
    file,
    JSON.stringify({ format: 1, createdAt: new Date().toISOString(), rows }),
    { mode: 0o600 },
  );
  execFileSync(
    process.platform === "win32" ? "az.cmd" : "az",
    [
      "storage",
      "blob",
      "upload",
      "--container-name",
      "backups",
      "--name",
      name,
      "--file",
      file,
      "--overwrite",
      "false",
      "--output",
      "none",
    ],
    {
      env: { ...process.env, AZURE_STORAGE_CONNECTION_STRING: connection },
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    },
  );
  console.log("Private backup completed (" + rows.length + " records).");
} finally {
  await rm(file, { force: true });
}
