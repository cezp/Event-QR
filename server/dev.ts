import { FileStore } from "./store";
import { createApp } from "./app";
import { seed } from "../scripts/seed";
if (process.env.WEBSITE_INSTANCE_ID || process.env.NODE_ENV === "production")
  throw new Error("Development server cannot run in production");
const store = await new FileStore(
  process.env.LOCAL_DATA_PATH || ".local/data.json",
).load();
await seed(store);
const api = createApp(store, {
  local: true,
  principal: (req) => {
    // Explicit development-only login. The production bundle never imports this file.
    const match = req.headers.cookie?.match(/dev_staff=([^;]+)/);
    if (!match) return undefined;
    const email = decodeURIComponent(match[1]);
    return {
      userId: "local-" + email,
      userDetails: email,
      identityProvider: "aad",
      userRoles: ["authenticated"],
    };
  },
});
api.get("/.auth/login/aad", async (_req, reply) =>
  reply
    .header(
      "Set-Cookie",
      "dev_staff=admin%40example.test; HttpOnly; SameSite=Lax; Path=/",
    )
    .redirect("/"),
);
api.get("/.auth/logout", async (_req, reply) =>
  reply.header("Set-Cookie", "dev_staff=; Max-Age=0; Path=/").redirect("/"),
);
await api.listen({ port: Number(process.env.PORT || 7071), host: "127.0.0.1" });
console.log(
  "Local API ready on http://127.0.0.1:7071 (fictional development data)",
);
