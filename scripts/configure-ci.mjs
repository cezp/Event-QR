import { githubToken } from "./github-auth.mjs";
const token = githubToken();
async function github(method, path, body) {
  const response = await fetch(
    "https://api.github.com/repos/cezp/Event-QR" + path,
    {
      method,
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok)
    throw new Error(
      "GitHub " +
        response.status +
        " " +
        path +
        " " +
        (await response.json()).message,
    );
}
await github("PUT", "/environments/production", {
  deployment_branch_policy: {
    protected_branches: false,
    custom_branch_policies: true,
  },
});
const branchResponse = await fetch(
  "https://api.github.com/repos/cezp/Event-QR/environments/production/deployment-branch-policies",
  {
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
    },
  },
);
const branches = await branchResponse.json();
if (!branches.branch_policies?.some((p) => p.name === "main"))
  await github("POST", "/environments/production/deployment-branch-policies", {
    name: "main",
    type: "branch",
  });
const variables = {
  AZURE_CLIENT_ID: process.env.DEPLOY_CLIENT_ID,
  AZURE_TENANT_ID: process.env.DEPLOY_TENANT_ID,
  AZURE_SUBSCRIPTION_ID: process.env.DEPLOY_SUBSCRIPTION_ID,
  AZURE_RESOURCE_GROUP: "rg-eventy-samychswoich",
  AZURE_STATIC_WEB_APP: "swa-eventy-samychswoich",
  AZURE_STORAGE_ACCOUNT: "steventyeeoovkwklf4gi",
  BOOTSTRAP_ADMIN_EMAIL: "cpytka@samychswoich.pl",
  SITE_URL: "https://zealous-coast-032818a03.3.azurestaticapps.net",
};
for (const [name, value] of Object.entries(variables)) {
  if (!value) throw new Error("Missing " + name);
  const existing = await fetch(
    "https://api.github.com/repos/cezp/Event-QR/actions/variables/" + name,
    {
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
      },
    },
  );
  await github(
    existing.ok ? "PATCH" : "POST",
    "/actions/variables" + (existing.ok ? "/" + name : ""),
    { name, value },
  );
  console.log("Configured " + name);
}
console.log("Production environment allows deployments from main only.");
