import { createSimpleContext } from "@opencode-ai/ui/context"
import { showToast } from "@opencode-ai/ui/toast"
import { onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { useGlobalSDK } from "./global-sdk"
import { useLanguage } from "./language"
import { useServer } from "./server"
import { detectQuickCommitError, type QuickCommitError, type QuickCommitPhase, trimQuickCommitOutput } from "./quick-commit-helpers"

const RESET_MS = 8000

type QuickCommitStatus = "idle" | "running" | "success" | "error"

const initial = {
  status: "idle" as QuickCommitStatus,
  phase: undefined as QuickCommitPhase | undefined,
  directory: "",
  branch: "",
  message: "",
  fileCount: 0,
  output: "",
  error: undefined as QuickCommitError | undefined,
}

type GitRunResult = {
  exitCode: number
  output: string
}

function lastLine(value: string) {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  return lines.at(-1)
}

export const { use: useQuickCommit, provider: QuickCommitProvider } = createSimpleContext({
  name: "QuickCommit",
  init: () => {
    const globalSDK = useGlobalSDK()
    const language = useLanguage()
    const server = useServer()
    const [store, setStore] = createStore(initial)
    let timer: ReturnType<typeof setTimeout> | undefined

    const clearTimer = () => {
      if (!timer) return
      clearTimeout(timer)
      timer = undefined
    }

    const resetLater = () => {
      clearTimer()
      timer = setTimeout(() => setStore(initial), RESET_MS)
    }

    const setPhase = (phase: QuickCommitPhase) => {
      setStore("status", "running")
      setStore("phase", phase)
      setStore("error", undefined)
    }

    const describeError = (error: QuickCommitError, output: string) => {
      if (error === "no_changes") {
        return {
          title: language.t("quickCommit.toast.noChanges.title"),
          description: language.t("quickCommit.toast.noChanges.description"),
        }
      }

      if (error === "identity") {
        return {
          title: language.t("quickCommit.toast.identity.title"),
          description: language.t("quickCommit.toast.identity.description"),
        }
      }

      if (error === "auth") {
        return {
          title: language.t("quickCommit.toast.auth.title"),
          description: language.t("quickCommit.toast.auth.description"),
        }
      }

      if (error === "push_rejected") {
        return {
          title: language.t("quickCommit.toast.pushRejected.title"),
          description: language.t("quickCommit.toast.pushRejected.description"),
        }
      }

      if (error === "network") {
        return {
          title: language.t("quickCommit.toast.network.title"),
          description: language.t("quickCommit.toast.network.description"),
        }
      }

      return {
        title: language.t("quickCommit.toast.failed.title"),
        description: lastLine(output) ?? language.t("quickCommit.toast.failed.description"),
      }
    }

    const connectPty = (input: { directory: string; ptyID: string }) =>
      new Promise<GitRunResult>((resolve, reject) => {
        const current = server.current
        if (!current) {
          reject(new Error("Server unavailable"))
          return
        }

        const url = new URL(globalSDK.url + `/pty/${input.ptyID}/connect`)
        url.searchParams.set("directory", input.directory)
        url.searchParams.set("cursor", "0")
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
        url.username = current.http.username ?? ""
        url.password = current.http.password ?? ""

        let settled = false
        let output = ""
        const socket = new WebSocket(url)

        const cleanup = () => {
          off()
          socket.removeEventListener("message", onMessage)
          socket.removeEventListener("close", onClose)
          socket.removeEventListener("error", onError)
          if (socket.readyState !== WebSocket.CLOSED && socket.readyState !== WebSocket.CLOSING) socket.close()
        }

        const finish = (next: () => void) => {
          if (settled) return
          settled = true
          cleanup()
          next()
        }

        const off = globalSDK.event.on(input.directory, (event) => {
          if (event.type !== "pty.exited") return
          if (event.properties.id !== input.ptyID) return
          finish(() => resolve({ exitCode: event.properties.exitCode, output }))
        })

        const onMessage = (event: MessageEvent) => {
          if (typeof event.data !== "string") return
          output = trimQuickCommitOutput(output + event.data)
        }

        const onClose = (event: CloseEvent) => {
          if (settled || event.code === 1000) return
          finish(() => reject(new Error(`WebSocket closed unexpectedly: ${event.code}`)))
        }

        const onError = () => {
          if (settled) return
          finish(() => reject(new Error("WebSocket connection failed")))
        }

        socket.addEventListener("message", onMessage)
        socket.addEventListener("close", onClose)
        socket.addEventListener("error", onError)
      })

    const runGitStep = async (input: {
      directory: string
      title: string
      args: string[]
    }) => {
      const client = globalSDK.createClient({
        directory: input.directory,
        throwOnError: true,
      })
      const pty = await client.pty.create({
        title: input.title,
        command: "git",
        args: input.args,
      })
      const id = pty.data?.id
      if (!id) throw new Error("Failed to create PTY")

      return connectPty({
        directory: input.directory,
        ptyID: id,
      }).catch((error) =>
        client.pty.remove({ ptyID: id }).catch(() => undefined).then(() => Promise.reject(error)),
      )
    }

    const fail = (input: {
      phase: QuickCommitPhase
      output: string
      error?: QuickCommitError
    }) => {
      const error = input.error ?? detectQuickCommitError(input.output, input.phase)
      const message = describeError(error, input.output)
      setStore("status", "error")
      setStore("phase", input.phase)
      setStore("output", input.output)
      setStore("error", error)
      showToast({
        variant: "error",
        title: message.title,
        description: message.description,
      })
      resetLater()
      return false
    }

    onCleanup(clearTimer)

    return {
      get state() {
        return store
      },
      running() {
        return store.status === "running"
      },
      async run(input: { directory: string; message: string; branch?: string }) {
        if (store.status === "running") return false

        clearTimer()
        setStore({
          ...initial,
          status: "running",
          phase: "checking",
          directory: input.directory,
          branch: input.branch ?? "",
          message: input.message,
        })

        showToast({
          title: language.t("quickCommit.toast.started.title"),
          description: language.t("quickCommit.toast.started.description"),
        })

        const client = globalSDK.createClient({
          directory: input.directory,
          throwOnError: true,
        })

        const files = await client.file.status().then((result) => result.data ?? []).catch(() => [])
        if (files.length === 0) {
          return fail({
            phase: "checking",
            output: "",
            error: "no_changes",
          })
        }

        setStore("fileCount", files.length)

        setPhase("staging")
        const staging = await runGitStep({
          directory: input.directory,
          title: "Quick Commit: git add -A",
          args: ["add", "-A"],
        }).catch((error) =>
          fail({
            phase: "staging",
            output: error instanceof Error ? error.message : String(error),
          }),
        )
        if (!staging) return false
        if (staging.exitCode !== 0) return fail({ phase: "staging", output: staging.output })

        setPhase("committing")
        const committing = await runGitStep({
          directory: input.directory,
          title: "Quick Commit: git commit",
          args: ["commit", "-m", input.message],
        }).catch((error) =>
          fail({
            phase: "committing",
            output: error instanceof Error ? error.message : String(error),
          }),
        )
        if (!committing) return false
        if (committing.exitCode !== 0) return fail({ phase: "committing", output: committing.output })

        setPhase("pushing")
        const pushing = await runGitStep({
          directory: input.directory,
          title: "Quick Commit: git push",
          args: ["push"],
        }).catch((error) =>
          fail({
            phase: "pushing",
            output: error instanceof Error ? error.message : String(error),
          }),
        )
        if (!pushing) return false
        if (pushing.exitCode !== 0) return fail({ phase: "pushing", output: pushing.output })

        setStore("status", "success")
        setStore("phase", undefined)
        setStore("output", pushing.output)
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("quickCommit.toast.success.title"),
          description: language.t("quickCommit.toast.success.description", {
            branch: input.branch ?? language.t("quickCommit.branch.unknown"),
          }),
        })
        resetLater()
        return true
      },
    }
  },
})
