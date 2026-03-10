import { runCommand } from './incremental-files.mjs';

export function runToolWithFallback({
  cwd,
  directCommand,
  directArgs,
  fallbackCommand,
  fallbackArgs,
  missingMessage
}) {
  const direct = runCommand(directCommand, directArgs, cwd);
  if (!direct.error) {
    return direct;
  }

  if (direct.error.code !== 'ENOENT') {
    throw direct.error;
  }

  const fallback = runCommand(fallbackCommand, fallbackArgs, cwd);
  if (!fallback.error) {
    return fallback;
  }

  if (fallback.error.code === 'ENOENT') {
    return {
      status: 1,
      stdout: '',
      stderr: `${missingMessage}\n`
    };
  }

  throw fallback.error;
}
