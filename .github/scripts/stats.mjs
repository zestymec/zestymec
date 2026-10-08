// Builds assets/stats.svg from the GitHub API. Runs in Actions (GITHUB_TOKEN) or locally.
import { writeFileSync, mkdirSync } from "node:fs";

const user = process.env.USERNAME || "zestymec";
const token = process.env.GITHUB_TOKEN;
const headers = { "User-Agent": "profile-stats", Accept: "application/vnd.github+json", ...(token && { Authorization: `Bearer ${token}` }) };

const get = async (url) => {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
};

const profile = await get(`https://api.github.com/users/${user}`);
let repos = [];
for (let page = 1; ; page++) {
  const batch = await get(`https://api.github.com/users/${user}/repos?per_page=100&type=owner&page=${page}`);
  repos = repos.concat(batch);
  if (batch.length < 100) break;
}
const own = repos.filter((r) => !r.fork);
const stars = own.reduce((n, r) => n + r.stargazers_count, 0);
const forks = own.reduce((n, r) => n + r.forks_count, 0);

const langs = {};
for (const r of own) if (r.language) langs[r.language] = (langs[r.language] || 0) + 1;
const langTotal = Object.values(langs).reduce((a, b) => a + b, 0) || 1;
const topLangs = Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 5);

let contribs = null;
if (token) {
  try {
    const q = `query($u:String!){user(login:$u){contributionsCollection{contributionCalendar{totalContributions}}}}`;
    const r = await fetch("https://api.github.com/graphql", { method: "POST", headers, body: JSON.stringify({ query: q, variables: { u: user } }) });
    contribs = (await r.json()).data.user.contributionsCollection.contributionCalendar.totalContributions;
  } catch {}
}

const colors = ["#38BDF8", "#A78BFA", "#F472B6", "#34D399", "#FBBF24"];
const tiles = [
  ["Public repos", profile.public_repos],
  ["Stars earned", stars],
  ["Forks", forks],
  ["Followers", profile.followers],
  ...(contribs != null ? [["Contributions (1y)", contribs]] : []),
];
const tile = ([label, val], i) => {
  const x = 40 + (i % 2) * 190, y = 90 + Math.floor(i / 2) * 78;
  return `<g transform="translate(${x},${y})"><rect width="172" height="62" rx="12" fill="#0F1535" stroke="#2A2F6B"/><text x="16" y="30" class="v">${val}</text><text x="16" y="49" class="l">${label}</text></g>`;
};
const bars = topLangs.map(([name, n], i) => {
  const pct = Math.round((n / langTotal) * 100), y = 100 + i * 48;
  return `<g transform="translate(470,${y})"><text class="b">${name}</text><text x="310" text-anchor="end" class="l">${pct}%</text><rect y="10" width="310" height="10" rx="5" fill="#161B3D"/><rect y="10" width="${Math.max(8, 3.1 * pct)}" height="10" rx="5" fill="${colors[i]}"/></g>`;
}).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 860 360" width="860" height="360" role="img" aria-labelledby="t d">
<title id="t">GitHub stats for ${profile.name || user}</title>
<desc id="d">${profile.public_repos} public repositories, ${stars} stars, ${forks} forks, ${profile.followers} followers. Top languages: ${topLangs.map(([n]) => n).join(", ")}.</desc>
<style>text{font-family:'Segoe UI',Ubuntu,Arial,sans-serif}.h{font-size:20px;font-weight:700;fill:#E2E8F0}.v{font-size:24px;font-weight:700;fill:#38BDF8}.l{font-size:12px;fill:#94A3B8}.b{font-size:13px;font-weight:600;fill:#E2E8F0}</style>
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#070B22"/><stop offset="1" stop-color="#140B2E"/></linearGradient></defs>
<rect width="860" height="360" rx="18" fill="url(#bg)" stroke="#2A2F6B"/>
<text x="40" y="56" class="h">GitHub stats</text><text x="470" y="56" class="h">Top languages</text>
${tiles.map(tile).join("")}${bars}
</svg>`;

mkdirSync("assets", { recursive: true });
writeFileSync("assets/stats.svg", svg);
console.log({ repos: profile.public_repos, stars, forks, followers: profile.followers, topLangs, contribs });
