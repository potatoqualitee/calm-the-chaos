#!/usr/bin/env node
/*
 * Pre-commit secret scanner (zero dependencies).
 *
 * Scans the STAGED content of changed files for high-signal credential
 * patterns (API keys, tokens, private keys, JWTs). Exits non-zero and blocks
 * the commit if anything matches.
 *
 * Bypass options:
 *   - Add the comment  allowlist-secret  on the same line as a false positive.
 *   - Run  git commit --no-verify  to skip the hook entirely (use sparingly).
 *
 * Run manually against staged files:  node scripts/check-secrets.cjs
 */
'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

// This scanner's own path — never scan it, or it flags its own patterns.
const SELF = 'scripts/check-secrets.cjs';

// Files/dirs we never scan (built output, deps, binaries).
const SKIP_DIRS = ['node_modules/', 'dist/', '.git/'];
const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf',
  '.crx', '.pem', '.zip', '.gz', '.woff', '.woff2', '.ttf', '.eot',
  '.map', '.min.js', '.lock',
]);
// Lockfiles carry long base64 integrity hashes — noisy, and not secrets.
const SKIP_BASENAMES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']);

// Each rule: high-signal patterns that indicate a real leaked credential.
const RULES = [
  { name: 'AWS access key id',       re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Anthropic API key',       re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'OpenRouter API key',      re: /\bsk-or-v1-[A-Za-z0-9]{20,}/ },
  { name: 'OpenAI API key',          re: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b/ },
  { name: 'GitHub token',            re: /\bgh[posur]_[A-Za-z0-9]{36,}\b/ },
  { name: 'Google API key',          re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Slack token',             re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'Stripe secret key',       re: /\bsk_live_[A-Za-z0-9]{20,}/ },
  { name: 'Google OAuth secret',     re: /\bGOCSPX-[A-Za-z0-9_-]{20,}/ },
  { name: 'Private key block',       re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/ },
  { name: 'JSON Web Token',          re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  {
    name: 'Hardcoded secret assignment',
    re: /(?:api[_-]?key|apikey|secret|access[_-]?token|auth[_-]?token|client[_-]?secret|passwd|password)["']?\s*[:=]\s*["'][A-Za-z0-9/_+=-]{16,}["']/i,
  },
];

function git(args) {
  return execFileSync('git', args, { encoding: 'buffer' });
}

function stagedFiles() {
  const out = execFileSync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACM', '-z'],
    { encoding: 'utf8' }
  );
  return out.split('\0').filter(Boolean);
}

function shouldSkip(file) {
  const norm = file.replace(/\\/g, '/');
  if (norm === SELF) return true;
  if (SKIP_DIRS.some((d) => norm.startsWith(d) || norm.includes('/' + d))) return true;
  if (SKIP_BASENAMES.has(path.basename(norm))) return true;
  const ext = path.extname(norm).toLowerCase();
  if (SKIP_EXT.has(ext)) return true;
  if (norm.endsWith('.min.js')) return true;
  return false;
}

function stagedContent(file) {
  // Read the staged blob (":path"), not the working-tree file.
  try {
    return git(['show', `:${file}`]);
  } catch {
    return null;
  }
}

function looksBinary(buf) {
  // Heuristic: a NUL byte in the first 8KB means binary.
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

function main() {
  let files;
  try {
    files = stagedFiles();
  } catch (err) {
    console.error('check-secrets: could not list staged files:', err.message);
    process.exit(0); // Don't block commits if git plumbing fails.
  }

  const findings = [];

  for (const file of files) {
    if (shouldSkip(file)) continue;
    const buf = stagedContent(file);
    if (!buf || looksBinary(buf)) continue;

    const lines = buf.toString('utf8').split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (/allowlist-secret/i.test(line)) return; // explicit opt-out
      for (const rule of RULES) {
        if (rule.re.test(line)) {
          findings.push({
            file,
            line: idx + 1,
            rule: rule.name,
            text: line.trim().slice(0, 120),
          });
        }
      }
    });
  }

  if (findings.length === 0) {
    process.exit(0);
  }

  console.error('\n\x1b[41m\x1b[97m COMMIT BLOCKED: possible secret(s) detected \x1b[0m\n');
  for (const f of findings) {
    console.error(`  \x1b[91m✗\x1b[0m ${f.rule}`);
    console.error(`    ${f.file}:${f.line}`);
    console.error(`    \x1b[90m${f.text}\x1b[0m\n`);
  }
  console.error('If these are false positives, add the comment  \x1b[1mallowlist-secret\x1b[0m  on the line,');
  console.error('or bypass the hook with  \x1b[1mgit commit --no-verify\x1b[0m  (use sparingly).\n');
  process.exit(1);
}

main();
