import { app } from "@azure/functions";
import { AzureStore } from "./store";
import { createApp } from "./app";
if (!process.env.STORAGE_CONNECTION_STRING)
  throw new Error("Missing storage configuration");
const api = createApp(new AzureStore(process.env.STORAGE_CONNECTION_STRING), {
  bootstrapEmail: process.env.BOOTSTRAP_ADMIN_EMAIL,
});
app.http("api", {
  route: "{*path}",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  authLevel: "anonymous",
  handler: async (request) => {
    const result = await api.inject({
      method: request.method as "GET",
      url: new URL(request.url).pathname + new URL(request.url).search,
      headers: Object.fromEntries(request.headers.entries()),
      payload: ["GET", "HEAD"].includes(request.method)
        ? undefined
        : await request.text(),
    });
    return {
      status: result.statusCode,
      body: result.body,
      headers: Object.fromEntries(
        Object.entries(result.headers)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      ),
    };
  },
});
