// Use the Git Credential Manager session; never print or persist credentials.
import { githubToken } from "./github-auth.mjs";
const token = githubToken();
const [method = "GET", path = "/repos/cezp/Event-QR", file] =
  process.argv.slice(2);
const body = file
  ? await (await import("node:fs/promises")).readFile(file, "utf8")
  : undefined;
const response = await fetch("https://api.github.com" + path, {
  signal: AbortSignal.timeout(30000),
  method,
  headers: {
    Authorization: "Bearer " + token,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  },
  body,
});
const data = response.status === 204 ? {} : await response.json();
if (!response.ok) {
  console.error(
    JSON.stringify({ status: response.status, message: data.message }),
  );
  process.exit(1);
}
if (path === "/repos/cezp/Event-QR")
  console.log(
    JSON.stringify({
      full_name: data.full_name,
      private: data.private,
      permissions: data.permissions,
      scopes: response.headers.get("x-oauth-scopes"),
    }),
  );
else console.log(JSON.stringify(data, null, 2));
