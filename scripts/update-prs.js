/**
 * update-prs.js
 *
 * Fetches the most recently MERGED pull requests authored by GITHUB_USERNAME
 * (using the GitHub Search API) and writes them into README.md between the
 * markers:
 *   <!--START_SECTION:pr-->
 *   <!--END_SECTION:pr-->
 *
 * Required environment variables (set automatically in GitHub Actions):
 *   GITHUB_TOKEN     - the built-in Actions token (or a PAT with public_repo scope)
 *   GITHUB_USERNAME  - your GitHub username (defaults to "annkitgupta48-hue")
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const GITHUB_USERNAME = process.env.GITHUB_USERNAME || "annkitgupta48-hue";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const README_PATH = path.join(__dirname, "..", "README.md");
const MAX_PRS = 5;

const START_MARKER = "<!--START_SECTION:pr-->";
const END_MARKER = "<!--END_SECTION:pr-->";

if (!GITHUB_TOKEN) {
  console.error("Missing GITHUB_TOKEN environment variable. Aborting.");
  process.exit(1);
}

function githubRequest(searchQuery) {
  const options = {
    hostname: "api.github.com",
    path: `/search/issues?q=${encodeURIComponent(searchQuery)}&sort=updated&order=desc&per_page=${MAX_PRS}`,
    method: "GET",
    headers: {
      "User-Agent": "readme-pr-updater",
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${GITHUB_TOKEN}`,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`GitHub API responded with ${res.statusCode}: ${data}`));
        }
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function formatDate(isoString) {
  const d = new Date(isoString);
  return d.toISOString().split("T")[0];
}

function buildTable(items) {
  if (!items.length) {
    return "_No merged pull requests found yet — check back soon!_";
  }

  const header = "| Repository | Pull Request | Merged On |\n|---|---|---|";
  const rows = items.map((pr) => {
    const repoFullName = pr.repository_url.split("/repos/")[1];
    const repoLink = `[${repoFullName}](https://github.com/${repoFullName})`;
    const prLink = `[${pr.title.replace(/\|/g, "\\|")}](${pr.html_url})`;
    const mergedOn = formatDate(pr.closed_at || pr.updated_at);
    return `| ${repoLink} | ${prLink} | ${mergedOn} |`;
  });

  return [header, ...rows].join("\n");
}

async function main() {
  // is:pr is:merged author:USERNAME -> only PRs opened by the user that were merged
  const query = `is:pr is:merged author:${GITHUB_USERNAME}`;
  const result = await githubRequest(query);

  const items = (result.items || []).slice(0, MAX_PRS);
  const table = buildTable(items);

  const readme = fs.readFileSync(README_PATH, "utf8");
  const startIdx = readme.indexOf(START_MARKER);
  const endIdx = readme.indexOf(END_MARKER);

  if (startIdx === -1 || endIdx === -1) {
    console.error("Could not find PR section markers in README.md");
    process.exit(1);
  }

  const before = readme.slice(0, startIdx + START_MARKER.length);
  const after = readme.slice(endIdx);

  const updated = `${before}\n${table}\n${after}`;
  fs.writeFileSync(README_PATH, updated, "utf8");

  console.log(`Updated README.md with ${items.length} merged pull request(s).`);
}

main().catch((err) => {
  console.error("Failed to update PR section:", err);
  process.exit(1);
});
