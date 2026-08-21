#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const args = process.argv.slice(2);

let dryRun = false;
let explicitVersion = null;

function printUsage() {
  console.log(`cache-bust.js — stamp cache-busting tokens into index.html

Usage:
  node cache-bust.js [options]

Options:
  --version, -v   Provide an explicit cache-bust token instead of generating one.
  --dry-run       Show the planned changes without writing any files.
  --help, -h      Show this help text.`);
}

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--help" || arg === "-h") {
    printUsage();
    process.exit(0);
  } else if (arg === "--dry-run") {
    dryRun = true;
  } else if (arg === "--version" || arg === "-v") {
    if (i + 1 >= args.length) {
      console.error("Error: --version requires a value.");
      process.exit(1);
    }
    explicitVersion = args[i + 1];
    i += 1;
  } else {
    console.error(`Error: unknown option "${arg}".`);
    console.error('Run with "--help" to see supported flags.');
    process.exit(1);
  }
}

function generateVersion() {
  const iso = new Date().toISOString().replace(/[-:.TZ]/g, "");
  const rand = crypto.randomBytes(3).toString("hex");
  return `${iso}-${rand}`;
}

const version = explicitVersion ?? generateVersion();
const projectRoot = __dirname;
const indexPath = path.join(projectRoot, "index.html");

if (!fs.existsSync(indexPath)) {
  console.error(`Error: index.html not found at ${indexPath}`);
  process.exit(1);
}

const originalHtml = fs.readFileSync(indexPath, "utf8");
let updatedHtml = originalHtml;
const changelog = [];

const cacheTokenPattern = /const\s+cacheBustToken\s*=\s*[^;]+;/;
if (cacheTokenPattern.test(updatedHtml)) {
  const replacement = `const cacheBustToken = "${version}";`;
  updatedHtml = updatedHtml.replace(cacheTokenPattern, replacement);
  changelog.push("cacheBustToken constant");
} else {
  console.warn(
    'Warning: could not locate "const cacheBustToken = …;" in index.html',
  );
}

function ensureFetchReference(label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const desiredPattern = new RegExp(
    `fetch\\(\\s*\`${escapedLabel}\\?v=\\$\\{cacheBustToken\\}\`\\s*\\)`,
  );
  if (desiredPattern.test(updatedHtml)) {
    return;
  }

  const genericPattern = new RegExp(
    `fetch\\(\\s*([\"'\`])${escapedLabel}(?:\\?v=[^\"'\`]*?)?\\1\\s*\\)`,
    "g",
  );

  const desiredLiteral = `fetch(\`${label}?v=\${cacheBustToken}\`)`;
  const nextHtml = updatedHtml.replace(genericPattern, desiredLiteral);

  if (nextHtml !== updatedHtml) {
    updatedHtml = nextHtml;
    changelog.push(`fetch ${label}`);
  }
}

ensureFetchReference("data.json");
ensureFetchReference("comps.json");

const indexChanged = updatedHtml !== originalHtml;

if (!dryRun && indexChanged) {
  fs.writeFileSync(indexPath, updatedHtml);
}

if (!dryRun) {
  const manifestPath = path.join(projectRoot, "cache-bust.json");
  const manifest = {
    version,
    updatedAt: new Date().toISOString(),
    indexUpdated: indexChanged,
    changes: changelog,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

console.log(`[cache-bust] version ${version}${dryRun ? " (dry run)" : ""}`);
if (changelog.length > 0) {
  console.log("Updated sections:");
  changelog.forEach((entry) => console.log(`  • ${entry}`));
} else {
  console.log("No matching references required changes.");
}
if (dryRun) {
  console.log("Dry run complete — no files were written.");
}
