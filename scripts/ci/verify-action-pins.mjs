// Verifies every `uses:` reference in .github/workflows/*.yml is pinned to a full 40-hex commit SHA with a `# vX.Y.Z` tag comment, and
// (unless --offline) that the tag still resolves to exactly that SHA on github.com via `git ls-remote` (peeled `^{}` entry preferred
// for annotated tags). Exit 1 on any unpinned, mismatched or unresolvable reference. Never guesses a SHA.
//   node scripts/ci/verify-action-pins.mjs [--offline]
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function findUses(text) {
  const out = [];
  text.split("\n").forEach((line, i) => {
    const m = line.match(/^\s*(?:-\s*)?uses:\s*(\S+)(?:\s*#\s*(\S+))?\s*$/);
    if (m) out.push({ line: i + 1, ref: m[1], comment: m[2] ?? null });
  });
  return out;
}

export function classify({ ref, comment }) {
  if (ref.startsWith("./") || ref.startsWith("docker://")) return { ok: false, why: `local/docker reference "${ref}" is not a pinned action` };
  const m = ref.match(/^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(\/[^@]*)?@(.+)$/);
  if (!m) return { ok: false, why: `cannot parse "${ref}"` };
  const [, repo, , version] = m;
  if (!/^[0-9a-f]{40}$/.test(version)) return { ok: false, why: `${repo} is pinned to "${version}", not a full 40-hex commit SHA` };
  if (!comment || !/^v\d+(\.\d+){0,2}$/.test(comment)) return { ok: false, why: `${repo}@${version.slice(0, 7)} has no "# vX.Y.Z" tag comment` };
  return { ok: true, repo, sha: version, tag: comment };
}

function remoteSha(repo, tag) {
  const r = spawnSync("git", ["ls-remote", `https://github.com/${repo}.git`, `refs/tags/${tag}`, `refs/tags/${tag}^{}`], { encoding: "utf8", timeout: 90000 });
  if (r.status !== 0) return { error: (r.stderr || "git ls-remote failed").trim().split("\n")[0] };
  const rows = r.stdout.trim().split("\n").filter(Boolean).map((l) => l.split(/\s+/));
  const peeled = rows.find((x) => x[1] === `refs/tags/${tag}^{}`);
  const plain = rows.find((x) => x[1] === `refs/tags/${tag}`);
  const hit = peeled ?? plain;
  return hit ? { sha: hit[0] } : { error: `tag ${tag} not found upstream` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const offline = process.argv.includes("--offline");
  const dir = path.join(root, ".github/workflows");
  let bad = 0, n = 0;
  for (const f of fs.readdirSync(dir).filter((x) => /\.ya?ml$/.test(x))) {
    for (const u of findUses(fs.readFileSync(path.join(dir, f), "utf8"))) {
      n++;
      const c = classify(u);
      if (!c.ok) { console.log(`FAIL  ${f}:${u.line}  ${c.why}`); bad++; continue; }
      if (offline) { console.log(`PASS  ${f}:${u.line}  ${c.repo}@${c.sha} # ${c.tag} (format only; upstream NOT checked)`); continue; }
      const r = remoteSha(c.repo, c.tag);
      if (r.error) { console.log(`FAIL  ${f}:${u.line}  ${c.repo} ${c.tag}: ${r.error}`); bad++; }
      else if (r.sha !== c.sha) { console.log(`FAIL  ${f}:${u.line}  ${c.repo} ${c.tag} resolves upstream to ${r.sha}, workflow pins ${c.sha}`); bad++; }
      else console.log(`PASS  ${f}:${u.line}  ${c.repo} ${c.tag} == ${c.sha} (verified against github.com)`);
    }
  }
  if (n === 0) { console.log("FAIL  no uses: references found"); bad++; }
  console.log(bad ? `${bad} problem(s)` : offline ? `${n} action reference(s) format-checked (upstream NOT checked)` : `${n} action reference(s) verified against github.com`);
  process.exit(bad ? 1 : 0);
}
