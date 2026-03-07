export type QuickCommitPhase = "checking" | "staging" | "committing" | "pushing"

export type QuickCommitError =
  | "no_changes"
  | "auth"
  | "push_rejected"
  | "identity"
  | "network"
  | "unknown"

const OUTPUT_LIMIT = 4000

const includes = (value: string, parts: string[]) => parts.some((part) => value.includes(part))

export function trimQuickCommitOutput(value: string) {
  if (value.length <= OUTPUT_LIMIT) return value
  return value.slice(value.length - OUTPUT_LIMIT)
}

export function detectQuickCommitError(output: string, phase: QuickCommitPhase): QuickCommitError {
  const value = output.toLowerCase()

  if (
    includes(value, [
      "nothing to commit",
      "no changes added to commit",
      "working tree clean",
      "no staged files found",
    ])
  ) {
    return "no_changes"
  }

  if (
    includes(value, [
      "please tell me who you are",
      "unable to auto-detect email address",
      "author identity unknown",
      "committer identity unknown",
    ])
  ) {
    return "identity"
  }

  if (
    includes(value, [
      "authentication failed",
      "could not read username",
      "permission denied",
      "repository not found",
      "access denied",
      "not authorized",
      "403",
    ])
  ) {
    return "auth"
  }

  if (
    includes(value, [
      "failed to push some refs",
      "[rejected]",
      "non-fast-forward",
      "fetch first",
      "remote contains work that you do not have locally",
      "tip of your current branch is behind",
    ])
  ) {
    return "push_rejected"
  }

  if (
    includes(value, [
      "could not resolve host",
      "failed to connect",
      "connection timed out",
      "network is unreachable",
      "connection refused",
    ])
  ) {
    return "network"
  }

  if (phase === "pushing" && includes(value, ["rejected", "remote"])) {
    return "push_rejected"
  }

  return "unknown"
}
