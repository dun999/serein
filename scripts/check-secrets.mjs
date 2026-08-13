import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const listed = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
).split("\0").filter(Boolean);

const forbiddenNames = [
  /^\.env(?:\..+)?$/,
  /^\.npmrc$/,
  /\.(?:pem|p12|pfx|jks|key)$/i,
];
const allowedEnvironmentExamples = new Set([".env.example", "extension/.env.example"]);
const findings = [];

for (const file of listed) {
  const name = basename(file);
  if (forbiddenNames.some((pattern) => pattern.test(name)) && !allowedEnvironmentExamples.has(file)) {
    findings.push(`${file}: secret-bearing file type must not be committed`);
    continue;
  }

  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(line)) {
      findings.push(`${file}:${index + 1}: private-key material`);
    }
    if (/\b(?:ghp|github_pat)_[A-Za-z0-9_]{30,}\b/.test(line)) {
      findings.push(`${file}:${index + 1}: GitHub token`);
    }
    if (/\bAKIA[0-9A-Z]{16}\b/.test(line)) {
      findings.push(`${file}:${index + 1}: AWS access key`);
    }
    const assignment = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*(?:PRIVATE_KEY|API_SECRET|MNEMONIC|XRPL_SEED)[A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
    if (assignment && !allowedEnvironmentExamples.has(file)) {
      const value = assignment[2].replace(/^['"]|['"]$/g, "");
      const placeholder = !value || /^(?:<.+>|changeme|example|test|dummy)$/i.test(value) || value.includes("$");
      if (!placeholder) findings.push(`${file}:${index + 1}: non-placeholder ${assignment[1]}`);
    }
  });
}

if (findings.length > 0) {
  console.error("Secret scan failed:\n" + findings.map((finding) => `- ${finding}`).join("\n"));
  process.exit(1);
}

console.log(`Secret scan passed (${listed.length} publishable files checked).`);
