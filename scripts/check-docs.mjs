#!/usr/bin/env node

import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertAllowedOptions, parseOptionPairs, reportCliError } from "./lib/cli-options.mjs";

const ENTRY_FILES = [
  "README.md", "AGENTS.md", "CONTRIBUTING.md", "SECURITY.md",
  "docs/README.md", "docs/try-tabellio.md", "docs/getting-started.md",
  "docs/operate-and-release.md", "docs/harness.md", "docs/historical/README.md",
  ".github/pull_request_template.md", "templates/pull_request_template.md",
  ".github/ISSUE_TEMPLATE/bug.yml", ".github/ISSUE_TEMPLATE/feature.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
];
const ONBOARDING_FILES = ["README.md", "AGENTS.md", "CONTRIBUTING.md", "docs/README.md", "docs/try-tabellio.md", "docs/getting-started.md"];

export async function checkDocs(repoRoot) {
  const root = resolve(repoRoot);
  const errors = [];
  const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  for (const entry of ENTRY_FILES) {
    if (!(await exists(join(root, entry)))?.isFile()) errors.push(`${entry}: missing required entry file`);
  }
  const files = await markdownFiles(root);
  const documents = new Map(await Promise.all(files.map(async (path) => [path, await readFile(path, "utf8")])));
  for (const [path, text] of documents) {
    const name = relative(root, path);
    checkSize(text, name, errors);
    if (ONBOARDING_FILES.includes(name)) checkVersions(text, name, version, errors);
    await checkLinks(path, text, root, documents, errors);
  }
  const native = documents.get(join(root, ".github/pull_request_template.md"));
  const packaged = documents.get(join(root, "templates/pull_request_template.md"));
  checkTemplates(native, packaged, errors);
  return { filesChecked: files.length, errors };
}

function checkSize(text, name, errors) {
  const limit = name === "README.md" ? 150 : /(^|\/)AGENTS\.md$/.test(name) ? 100 : undefined;
  const lines = text.trimEnd().split(/\r?\n/).length;
  if (limit && lines > limit) errors.push(`${name}: ${lines} lines exceeds limit ${limit}`);
}

function checkTemplates(native, packaged, errors) {
  if (native !== undefined && packaged !== undefined && native !== packaged) {
    errors.push(".github/pull_request_template.md: differs from templates/pull_request_template.md");
  }
}

async function exists(path) {
  try {
    return await stat(path);
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
    return undefined;
  }
}

async function markdownFiles(root) {
  const result = [];
  async function walk(directory, recursive) {
    if (!(await exists(directory))?.isDirectory()) return;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isFile() && entry.name.endsWith(".md")) result.push(path);
      if (recursive && entry.isDirectory()) await walk(path, true);
    }
  }
  await walk(root, false);
  for (const directory of ["docs", "examples", "reports", "templates", ".github"]) await walk(join(root, directory), true);
  return result.sort();
}

function checkVersions(text, name, version, errors) {
  for (const line of text.split(/\r?\n/)) {
    const installation = /\bnpm\s+(?:install|i|add)\b/.test(line) ? line.match(/@intelip\/tabellio(?:@([^\s`"']+))?/) : null;
    if (installation && installation[1] !== version) errors.push(`${name}: installation version must be ${version}, found ${installation[1] ?? "unpinned"}`);
    for (const match of line.matchAll(/--expect-version\s+["']?([^\s`"']+)/g)) {
      if (match[1] !== version) errors.push(`${name}: expected installation version must be ${version}, found ${match[1]}`);
    }
  }
}

function withoutFences(text) {
  let fence;
  const lines = [];
  for (const line of text.split(/\r?\n/)) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if (!fence && marker) fence = marker[1];
    else if (fence && marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
    else if (!fence) lines.push(line);
  }
  return lines.join("\n");
}

function destinations(text) {
  const prose = withoutFences(text).replace(/`+[^`\n]*`+/g, "");
  const links = [];
  for (const pattern of [
    /!?\[[^\]\n]*\]\(\s*(<[^>\n]+>|(?:\\.|[^()\s]|\([^()\n]*\))+)(?:\s+["'][^\n]*?["'])?\s*\)/g,
    /^\s{0,3}\[[^\]\n]+\]:\s*(<[^>\n]+>|\S+)/gm,
    /\b(?:href|src)=["']([^"']+)["']/g,
  ]) for (const match of prose.matchAll(pattern)) links.push(match[1].replace(/^<|>$/g, "").replace(/\\([\\()[\] ])/g, "$1"));
  return links;
}

function anchors(text) {
  const result = new Set();
  const counts = new Map();
  const prose = withoutFences(text);
  for (const match of prose.matchAll(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const slug = match[1].replace(/<[^>]*>/g, "").toLowerCase().replace(/[^\p{L}\p{N}_\- ]/gu, "").replace(/ /g, "-");
    const count = counts.get(slug) ?? 0;
    result.add(count ? `${slug}-${count}` : slug);
    counts.set(slug, count + 1);
  }
  for (const match of prose.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) result.add(match[1]);
  return result;
}

async function checkLinks(path, text, root, documents, errors) {
  for (const link of destinations(text)) {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(link)) continue;
    let target;
    let anchor;
    try {
      ({ target, anchor } = resolveDestination(link, path, root));
    } catch {
      errors.push(`${relative(root, path)}: malformed local link ${link}`);
      continue;
    }
    if (!(await exists(target))) errors.push(`${relative(root, path)}: broken local link ${link}`);
    else if (anchor && target.endsWith(".md")) {
      const targetText = documents.get(target) ?? await readFile(target, "utf8");
      if (!anchors(targetText).has(anchor)) errors.push(`${relative(root, path)}: missing local heading ${link}`);
    }
  }
}

function resolveDestination(link, path, root) {
  const [destination, fragment] = link.split("#", 2);
  const decoded = decodeURIComponent(destination.split("?", 1)[0]);
  const target = !decoded ? path : decoded.startsWith("/") ? join(root, decoded) : resolve(dirname(path), decoded);
  return { target, anchor: fragment && decodeURIComponent(fragment) };
}

async function main() {
  const options = parseOptionPairs(process.argv.slice(2), "docs:check");
  assertAllowedOptions(options, ["repo"]);
  const result = await checkDocs(options.repo ?? process.cwd());
  if (result.errors.length) {
    console.error(result.errors.join("\n"));
    process.exitCode = 1;
  } else console.log(`Documentation checks passed (${result.filesChecked} Markdown files).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(reportCliError);
