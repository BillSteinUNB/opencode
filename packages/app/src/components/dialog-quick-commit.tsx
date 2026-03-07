import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Spinner } from "@opencode-ai/ui/spinner"
import { TextField } from "@opencode-ai/ui/text-field"
import { createResource, createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useGlobalSDK } from "@/context/global-sdk"
import { useLanguage } from "@/context/language"
import { useQuickCommit } from "@/context/quick-commit"

export function DialogQuickCommit(props: { directory: string; branch?: string }) {
  const dialog = useDialog()
  const globalSDK = useGlobalSDK()
  const language = useLanguage()
  const quickCommit = useQuickCommit()
  const [store, setStore] = createStore({
    message: "",
    error: "",
  })

  const [files] = createResource(
    () => props.directory,
    (directory) =>
      globalSDK
        .createClient({
          directory,
          throwOnError: true,
        })
        .file.status()
        .then((result) => result.data ?? [])
        .catch(() => []),
  )

  const count = createMemo(() => files()?.length ?? 0)
  const preview = createMemo(() => (files() ?? []).slice(0, 4))
  const canSubmit = createMemo(() => !!store.message.trim() && count() > 0 && !quickCommit.running())

  const submit = () => {
    if (!store.message.trim()) {
      setStore("error", language.t("quickCommit.form.message.required"))
      return
    }

    if (count() === 0) {
      setStore("error", language.t("quickCommit.form.files.empty"))
      return
    }

    void quickCommit.run({
      directory: props.directory,
      message: store.message.trim(),
      branch: props.branch,
    })
    dialog.close()
  }

  return (
    <Dialog title={language.t("quickCommit.dialog.title")} class="w-full max-w-[480px] mx-auto">
      <div class="flex flex-col gap-4 px-1">
        <div class="rounded-md border border-border-weak-base bg-surface-raised-base p-3">
          <div class="text-12-medium text-text-strong">{language.t("quickCommit.dialog.branch")}</div>
          <div class="mt-1 text-14-regular text-text-base">
            {props.branch ?? language.t("quickCommit.branch.unknown")}
          </div>
          <div class="mt-3 text-12-medium text-text-strong">{language.t("quickCommit.dialog.files")}</div>
          <Show
            when={!files.loading}
            fallback={
              <div class="mt-2 flex items-center gap-2 text-12-regular text-text-weak">
                <Spinner class="size-4" />
                <span>{language.t("quickCommit.dialog.loading")}</span>
              </div>
            }
          >
            <Show
              when={count() > 0}
              fallback={<div class="mt-1 text-12-regular text-text-weak">{language.t("quickCommit.form.files.empty")}</div>}
            >
              <div class="mt-1 text-14-regular text-text-base">
                {language.t("quickCommit.dialog.filesCount", { count: count() })}
              </div>
              <div class="mt-2 flex flex-col gap-1">
                <For each={preview()}>
                  {(file) => <div class="text-12-regular text-text-weak truncate">{file.path}</div>}
                </For>
                <Show when={count() > preview().length}>
                  <div class="text-12-regular text-text-dimmed">
                    {language.t("quickCommit.dialog.filesMore", { count: count() - preview().length })}
                  </div>
                </Show>
              </div>
            </Show>
          </Show>
        </div>

        <TextField
          label={language.t("quickCommit.form.message.label")}
          value={store.message}
          multiline
          autofocus
          error={store.error}
          validationState={store.error ? "invalid" : "valid"}
          placeholder={language.t("quickCommit.form.message.placeholder")}
          onChange={(value) => setStore({ message: value, error: "" })}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.isComposing) return
            event.preventDefault()
            if (!canSubmit()) return
            submit()
          }}
        />

        <div class="flex items-center justify-end gap-2">
          <Button variant="ghost" size="large" onClick={dialog.close}>
            {language.t("common.cancel")}
          </Button>
          <Button size="large" icon="github" disabled={!canSubmit()} onClick={submit}>
            {language.t("quickCommit.dialog.action")}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
