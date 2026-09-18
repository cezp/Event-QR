import { execFileSync } from "node:child_process";
export function githubToken() {
  let credential;
  try {
    credential = execFileSync("git", ["credential", "fill"], {
      input: "protocol=https\nhost=github.com\nusername=cezp\n\n",
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        GCM_INTERACTIVE: "never",
        GIT_TERMINAL_PROMPT: "0",
      },
      timeout: 30000,
    });
  } catch {
    throw new Error(
      "GitHub session unavailable. Sign in to the cez p repository account in Git Credential Manager.",
    );
  }
  const token = credential
    .split(/\r?\n/)
    .find((line) => line.startsWith("password="))
    ?.slice(9);
  if (!token) throw new Error("GitHub credential unavailable");
  return token;
}
