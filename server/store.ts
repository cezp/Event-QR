import { TableClient, odata } from "@azure/data-tables";
import { randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
export interface Row<T = unknown> {
  value: T;
  version: string;
}
export interface Write {
  key: string;
  value: unknown;
  version?: string;
  create?: boolean;
}
export class Conflict extends Error {}
export interface Store {
  get<T>(partition: string, key: string): Promise<Row<T> | undefined>;
  list<T>(partition: string, prefix?: string): Promise<Row<T>[]>;
  commit(partition: string, writes: Write[]): Promise<void>;
}
export class MemoryStore implements Store {
  protected rows: Record<string, Row> = {};
  async get<T>(p: string, k: string) {
    return structuredClone(this.rows[p + "/" + k]) as Row<T> | undefined;
  }
  async list<T>(p: string, prefix = "") {
    return structuredClone(
      Object.entries(this.rows)
        .filter(([k]) => k.startsWith(p + "/" + prefix))
        .map(([, r]) => r),
    ) as Row<T>[];
  }
  async commit(p: string, writes: Write[]) {
    for (const w of writes) {
      const current = this.rows[p + "/" + w.key];
      if (
        (w.create && current) ||
        (w.version && current?.version !== w.version)
      )
        throw new Conflict("Dane zostały zmienione. Odśwież profil.");
    }
    for (const w of writes)
      this.rows[p + "/" + w.key] = {
        value: structuredClone(w.value),
        version: randomUUID(),
      };
  }
}
export class FileStore extends MemoryStore {
  private queue = Promise.resolve();
  constructor(private path: string) {
    super();
  }
  async load() {
    try {
      this.rows = JSON.parse(await readFile(this.path, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    return this;
  }
  override async commit(p: string, writes: Write[]) {
    const next = this.queue.then(async () => {
      const previous = structuredClone(this.rows);
      try {
        await super.commit(p, writes);
        await mkdir(dirname(this.path), { recursive: true });
        await writeFile(this.path + ".tmp", JSON.stringify(this.rows), {
          mode: 0o600,
        });
        await rename(this.path + ".tmp", this.path);
      } catch (e) {
        this.rows = previous;
        throw e;
      }
    });
    this.queue = next.catch(() => {});
    return next;
  }
}
export class AzureStore implements Store {
  private client: TableClient;
  constructor(connectionString: string) {
    this.client = TableClient.fromConnectionString(connectionString, "eventqr");
  }
  async get<T>(p: string, k: string): Promise<Row<T> | undefined> {
    try {
      const r = await this.client.getEntity<{ data: string }>(p, k);
      return { value: JSON.parse(r.data), version: r.etag! };
    } catch (e) {
      if ((e as { statusCode?: number }).statusCode === 404) return undefined;
      throw e;
    }
  }
  async list<T>(p: string, prefix = ""): Promise<Row<T>[]> {
    const result: Row<T>[] = [];
    for await (const r of this.client.listEntities<{ data: string }>({
      queryOptions: {
        filter: "PartitionKey eq '" + p.replaceAll("'", "''") + "'",
      },
    })) {
      if (r.rowKey?.startsWith(prefix))
        result.push({ value: JSON.parse(r.data), version: r.etag! });
    }
    return result;
  }
  async commit(p: string, writes: Write[]) {
    try {
      await this.client.submitTransaction(
        writes.map((w) => {
          const entity = {
            partitionKey: p,
            rowKey: w.key,
            data: JSON.stringify(w.value),
          };
          if (w.create) return ["create", entity];
          if (!w.version) throw new Error("Azure updates must include an ETag");
          return ["update", entity, "Replace", { etag: w.version }];
        }),
      );
    } catch (e) {
      if ([409, 412].includes((e as { statusCode?: number }).statusCode || 0))
        throw new Conflict("Dane zostały zmienione. Odśwież profil.");
      throw e;
    }
  }
}
