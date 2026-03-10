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
  writeResultOutput
} from './lib/incremental-files.mjs';
import { runToolWithFallback } from './lib/run-tool-with-fallback.mjs';

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown']);
const MARKDOWN_PATHSPECS = [':(glob)**/*.md', ':(glob)**/*.markdown'];
const STATE_SUBPATH = ['.copilot-hooks', 'markdownlint-cli2-state.json'];

function isMarkdownFile(filePath) {
  return MARKDOWN_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isExistingMarkdownFile(filePath) {
  if (!isMarkdownFile(filePath) || !fs.existsSync(filePath)) {
    return false;
  }

  return fs.statSync(filePath).isFile();
}

function listDirtyMarkdownFiles(repoRoot) {
  return listDirtyFiles(repoRoot, MARKDOWN_PATHSPECS, isExistingMarkdownFile);
}

function runMarkdownlint(cwd, args) {
  return runToolWithFallback({
    cwd,
    directCommand: 'markdownlint-cli2',
    directArgs: args,
    fallbackCommand: 'npx',
    fallbackArgs: ['--yes', 'markdownlint-cli2', ...args],
    missingMessage: 'markdownlint-cli2 is not available. Install it globally or make `npx` available.'
  });
}

function fixAndLintMarkdownFiles(repoRoot, files) {
  runMarkdownlint(repoRoot, ['--fix', ...files]);
  const lintResult = runMarkdownlint(repoRoot, files);
  if ((lintResult.status ?? 1) !== 0) {
    writeResultOutput(lintResult);
  }
  return lintResult.status ?? 1;
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
  const dirtyMarkdownFiles = listDirtyMarkdownFiles(repoRoot);
  const changedMarkdownFiles = getChangedFiles(repoRoot, dirtyMarkdownFiles, previousSignatures);

  if (changedMarkdownFiles.length === 0) {
    saveState(stateFilePath, repoRoot, dirtyMarkdownFiles);
    return;
  }

  process.exitCode = fixAndLintMarkdownFiles(repoRoot, changedMarkdownFiles);
  const currentDirtyMarkdownFiles = listDirtyMarkdownFiles(repoRoot);
  saveState(stateFilePath, repoRoot, currentDirtyMarkdownFiles);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
