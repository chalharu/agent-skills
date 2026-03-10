#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  getChangedFiles,
  getRepoRoot,
  listDirtyFiles,
  loadState,
  readStdin,
  resolveStateFilePath,
  saveState,
  toRelativeRepoPath,
  writeResultOutput
} from './lib/incremental-files.mjs';
import { runToolWithFallback } from './lib/run-tool-with-fallback.mjs';

const SCRIPT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx']);
const SCRIPT_PATHSPECS = [
  ':(glob)**/*.js',
  ':(glob)**/*.mjs',
  ':(glob)**/*.cjs',
  ':(glob)**/*.jsx',
  ':(glob)**/*.ts',
  ':(glob)**/*.mts',
  ':(glob)**/*.cts',
  ':(glob)**/*.tsx'
];
const STATE_SUBPATH = ['.copilot-hooks', 'biome-oxlint-state.json'];

function isScriptFile(filePath) {
  return SCRIPT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isExistingScriptFile(filePath) {
  if (!isScriptFile(filePath) || !fs.existsSync(filePath)) {
    return false;
  }

  return fs.statSync(filePath).isFile();
}

function listDirtyScriptFiles(repoRoot) {
  return listDirtyFiles(repoRoot, SCRIPT_PATHSPECS, isExistingScriptFile);
}

function toRelativePaths(repoRoot, files) {
  return files.map((filePath) => toRelativeRepoPath(repoRoot, filePath));
}

function runBiome(cwd, args) {
  return runToolWithFallback({
    cwd,
    directCommand: 'biome',
    directArgs: args,
    fallbackCommand: 'npx',
    fallbackArgs: ['--yes', '@biomejs/biome', ...args],
    missingMessage: 'Biome is not available. Install `biome` or make `npx --yes @biomejs/biome` available.'
  });
}

function runOxlint(cwd, args) {
  return runToolWithFallback({
    cwd,
    directCommand: 'oxlint',
    directArgs: args,
    fallbackCommand: 'npx',
    fallbackArgs: ['--yes', 'oxlint', ...args],
    missingMessage: 'Oxlint is not available. Install `oxlint` or make `npx --yes oxlint` available.'
  });
}

function applyAutomaticFixes(repoRoot, files) {
  const relativePaths = toRelativePaths(repoRoot, files);
  runBiome(repoRoot, ['check', '--write', ...relativePaths]);
  runOxlint(repoRoot, ['--fix', ...relativePaths]);
  runBiome(repoRoot, ['check', '--write', ...relativePaths]);
}

function reportRemainingIssues(repoRoot, files) {
  const relativePaths = toRelativePaths(repoRoot, files);
  const biomeResult = runBiome(repoRoot, ['check', ...relativePaths]);
  const oxlintResult = runOxlint(repoRoot, relativePaths);
  let exitCode = 0;

  if ((biomeResult.status ?? 1) !== 0) {
    process.stderr.write('Biome reported unresolved issues:\n');
    writeResultOutput(biomeResult);
    exitCode = biomeResult.status ?? 1;
  }

  if ((oxlintResult.status ?? 1) !== 0) {
    if (exitCode !== 0) {
      process.stderr.write('\n');
    }
    process.stderr.write('Oxlint reported unresolved issues:\n');
    writeResultOutput(oxlintResult);
    exitCode = exitCode || (oxlintResult.status ?? 1);
  }

  return exitCode;
}

async function main() {
  const rawInput = await readStdin();
  if (rawInput.trim() === '') {
    return;
  }

  const input = JSON.parse(rawInput);
  if (input.toolResult?.resultType === 'denied') {
    return;
  }

  const cwd = typeof input.cwd === 'string' && input.cwd !== '' ? input.cwd : process.cwd();
  const repoRoot = getRepoRoot(cwd);
  const stateFilePath = resolveStateFilePath(repoRoot, STATE_SUBPATH);
  const previousSignatures = loadState(stateFilePath);
  const dirtyScriptFiles = listDirtyScriptFiles(repoRoot);
  const changedScriptFiles = getChangedFiles(repoRoot, dirtyScriptFiles, previousSignatures);

  if (changedScriptFiles.length === 0) {
    saveState(stateFilePath, repoRoot, dirtyScriptFiles);
    return;
  }

  applyAutomaticFixes(repoRoot, changedScriptFiles);
  process.exitCode = reportRemainingIssues(repoRoot, changedScriptFiles);
  const currentDirtyScriptFiles = listDirtyScriptFiles(repoRoot);
  saveState(stateFilePath, repoRoot, currentDirtyScriptFiles);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
