import { describe, expect, test } from "bun:test"
import { detectQuickCommitError, trimQuickCommitOutput } from "./quick-commit-helpers"

describe("detectQuickCommitError", () => {
  test("detects missing changes", () => {
    expect(detectQuickCommitError("nothing to commit, working tree clean", "committing")).toBe("no_changes")
  })

  test("detects git identity issues", () => {
    expect(detectQuickCommitError("Author identity unknown\nPlease tell me who you are.", "committing")).toBe(
      "identity",
    )
  })

  test("detects auth failures", () => {
    expect(detectQuickCommitError("remote: Repository not found.\nfatal: Authentication failed", "pushing")).toBe(
      "auth",
    )
  })

  test("detects push rejection", () => {
    expect(
      detectQuickCommitError("! [rejected] main -> main (non-fast-forward)\nfailed to push some refs", "pushing"),
    ).toBe("push_rejected")
  })

  test("detects network failures", () => {
    expect(detectQuickCommitError("fatal: Could not resolve host: github.com", "pushing")).toBe("network")
  })
})

describe("trimQuickCommitOutput", () => {
  test("keeps the tail of long output", () => {
    const value = "a".repeat(4500)
    expect(trimQuickCommitOutput(value)).toHaveLength(4000)
    expect(trimQuickCommitOutput(value)).toBe(value.slice(500))
  })
})
