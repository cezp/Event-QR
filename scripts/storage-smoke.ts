import { randomUUID } from "node:crypto";
import { TableClient } from "@azure/data-tables";
import { AzureStore, Conflict } from "../server/store";
const connection = process.env.STORAGE_CONNECTION_STRING;
if (!connection) throw new Error("Missing storage configuration");
const store = new AzureStore(connection);
const client = TableClient.fromConnectionString(connection, "eventqr");
const partition = "smoke-" + randomUUID();
try {
  await store.commit(partition, [
    { key: "record", create: true, value: { status: "before" } },
    { key: "audit", create: true, value: { action: "test" } },
  ]);
  const initial = await store.get<{ status: string }>(partition, "record");
  if (initial?.value.status !== "before")
    throw new Error("Read verification failed");
  await store.commit(partition, [
    { key: "record", version: initial.version, value: { status: "after" } },
    { key: "audit2", create: true, value: { action: "updated" } },
  ]);
  let conflict = false;
  try {
    await store.commit(partition, [
      { key: "record", version: initial.version, value: { status: "stale" } },
    ]);
  } catch (e) {
    if (e instanceof Conflict) conflict = true;
    else throw e;
  }
  if (!conflict) throw new Error("ETag concurrency guard failed");
  const rows = await store.list(partition);
  if (rows.length !== 3) throw new Error("Transaction verification failed");
  console.log(
    "Azure Table Storage: atomic writes, readback, query and ETag conflict passed.",
  );
} finally {
  // Only these newly created synthetic rows in the unique test partition.
  for (const key of ["record", "audit", "audit2"]) {
    try {
      await client.deleteEntity(partition, key);
    } catch (e) {
      if ((e as { statusCode?: number }).statusCode !== 404) throw e;
    }
  }
}
