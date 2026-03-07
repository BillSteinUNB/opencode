import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { createStore } from "solid-js/store"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Show } from "solid-js"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { useServer } from "@/context/server"
import { DialogSelectServer } from "@/components/dialog-select-server"

export function ConnectionErrorPanel() {
  const dialog = useDialog()
  const globalSync = useGlobalSync()
  const language = useLanguage()
  const server = useServer()
  const [store, setStore] = createStore({
    retrying: false,
  })

  const current = () => server.current
  const currentUrl = () => current()?.http.url ?? server.name
  const currentName = () => server.name || currentUrl()

  const openServers = (intent: "switch" | "add" | "edit") =>
    dialog.show(
      () => <DialogSelectServer intent={intent} editKey={server.key} />,
      () => {
        void server.refresh()
      },
    )

  const retry = () => {
    if (store.retrying) return
    setStore("retrying", true)
    Promise.allSettled([globalSync.bootstrap(), server.refresh()]).finally(() => setStore("retrying", false))
  }

  return (
    <div class="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pt-12 pb-8">
      <div class="rounded-2xl border border-border-weak-base bg-background-strong p-5 shadow-xs-border-base">
        <div class="flex items-start gap-3">
          <div class="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-critical-weak">
            <Icon name="plug" class="text-icon-critical-base" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-18-medium text-text-strong">{language.t("connection.error.title")}</div>
            <p class="mt-1 text-14-regular text-text-weak">{language.t("connection.error.description")}</p>
          </div>
        </div>

        <div class="mt-4 rounded-xl border border-border-weak-base bg-background-base p-4">
          <div class="text-12-medium text-text-weak">{language.t("connection.error.current")}</div>
          <div class="mt-1 text-14-medium text-text-strong truncate">{currentName()}</div>
          <div class="mt-1 text-12-regular text-text-dimmed break-all">{currentUrl()}</div>
        </div>

        <div class="mt-4 rounded-xl border border-border-weak-base bg-background-base p-4">
          <div class="text-12-medium text-text-weak">{language.t("connection.error.summary")}</div>
          <div class="mt-1 text-14-regular text-text-base">{language.t("connection.error.summary.value")}</div>
        </div>

        <div class="mt-4 rounded-xl bg-surface-raised-base p-4">
          <div class="text-12-medium text-text-strong">{language.t("connection.error.next")}</div>
          <div class="mt-2 flex flex-col gap-1 text-12-regular text-text-weak">
            <div>{language.t("connection.error.next.retry")}</div>
            <div>{language.t("connection.error.next.switch")}</div>
            <div>{language.t("connection.error.next.add")}</div>
          </div>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-2">
          <Button size="large" onClick={retry} disabled={store.retrying}>
            {store.retrying ? language.t("error.page.action.checking") : language.t("connection.error.action.retry")}
          </Button>
          <Button size="large" variant="secondary" onClick={() => openServers("switch")}>
            {language.t("connection.error.action.switch")}
          </Button>
          <Button size="large" variant="ghost" onClick={() => openServers("add")}>
            {language.t("connection.error.action.add")}
          </Button>
          <Button size="large" variant="ghost" onClick={() => openServers("edit")}>
            {language.t("connection.error.action.edit")}
          </Button>
        </div>

        <Show when={current()?.http.url}>
          <p class="mt-4 text-12-regular text-text-dimmed">
            {language.t("connection.error.help.prefix")}{" "}
            <code class="rounded-sm bg-surface-raised-base px-1.5 py-0.5 text-text-secondary-base">
              opencode web --hostname 0.0.0.0
            </code>
          </p>
        </Show>
      </div>
    </div>
  )
}
