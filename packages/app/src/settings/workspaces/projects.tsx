import { For, Show, createEffect, createMemo, on, type Component } from "solid-js"
import { createStore } from "solid-js/store"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { TextInput } from "@opencode/ui/text-input"
import { useLanguage } from "@/runtime/i18n/language"
import { useGlobal } from "@/runtime/server/runtime"
import { ServerConnection } from "@/runtime/server/registry"
import { displayName, homeProjectDirectories } from "@/shell/layout/helpers"
import { ProjectIcon } from "@/shell/layout/project-icon"
import type { LocalProject } from "@/shell/state/layout"
import { useDirectoryPicker } from "@/workspaces/selection/picker"
import { addProjects } from "@/home/projects/add"
import { settingsProjects } from "../servers/inventory"
import { SettingsSearchEmpty } from "../search-empty"
import { ProjectOptions } from "./project-options"
import "@/settings/search.css"
import "@/settings/settings.css"

export const SettingsProjects: Component<{
  server: ServerConnection.Any
  onOpenProject: (project: LocalProject) => void
}> = (props) => {
  const language = useLanguage()
  const global = useGlobal()
  const pickDirectory = useDirectoryPicker()
  const [store, setStore] = createStore({
    filter: "",
    menu: undefined as string | undefined,
    overflow: { start: false, end: false },
  })
  let search: HTMLInputElement | undefined
  const updateOverflow = () => {
    if (!search) return
    const offset = Math.abs(search.scrollLeft)
    setStore("overflow", {
      start: offset > 1,
      end: search.scrollWidth - search.clientWidth - offset > 1,
    })
  }
  createEffect(on(() => store.filter, updateOverflow))
  const context = createMemo(() => global.ensureServerCtx(props.server))
  const projects = createMemo(() => settingsProjects(context()))
  const searchable = createMemo(() => projects().length > 7)
  const filtered = createMemo(() => {
    const query = searchable() ? store.filter.trim().toLowerCase() : ""
    return query ? projects().filter((project) => displayName(project).toLowerCase().includes(query)) : projects()
  })
  createEffect(() => {
    if (!searchable()) setStore("filter", "")
  })
  const addProject = () =>
    pickDirectory({
      server: props.server,
      title: language.t("command.project.open"),
      multiple: true,
      onSelect: (result) => {
        const directories = homeProjectDirectories(result)
        const directory = addProjects(context(), directories)
        if (!directory) return
        if (directories.length > 1) return
        const project = context()
          .projects.list()
          .find((item) => item.worktree === directory)
        if (!project) return
        props.onOpenProject(project)
      },
    })

  return (
    <>
      <div class="settings-tab-header" classList={{ "settings-tab-header--stacked": searchable() }}>
        <div class="settings-tab-header-row">
          <div class="flex flex-col gap-1">
            <h2 class="settings-tab-title">{language.t("settings.projects.title")}</h2>
            <span class="text-11-regular text-v2-text-text-muted">{language.t("settings.projects.description")}</span>
          </div>
          <Show when={projects().length > 0}>
            <Button variant="ghost-muted" icon="plus" onClick={addProject}>
              {language.t("home.project.add")}
            </Button>
          </Show>
        </div>
        <Show when={searchable()}>
          <div class="settings-tab-search settings-projects-search">
            <TextInput
              ref={(element) => {
                search = element
                createResizeObserver(element, updateOverflow)
              }}
              type="search"
              appearance="base"
              leadingIcon={<Icon name="magnifying-glass" size="small" />}
              value={store.filter}
              data-overflow-start={store.overflow.start}
              data-overflow-end={store.overflow.end}
              onScroll={updateOverflow}
              onInput={(event) => setStore("filter", event.currentTarget.value)}
              placeholder={language.t("settings.projects.search.placeholder")}
              aria-label={language.t("settings.projects.search.placeholder")}
              showClearButton={!!store.filter}
              clearIcon="circle-xmark"
              onClearClick={() => {
                setStore("filter", "")
                search?.focus({ preventScroll: true })
              }}
              spellcheck={false}
              autocorrect="off"
              autocomplete="off"
              autocapitalize="off"
            />
          </div>
        </Show>
      </div>

      <div class="settings-tab-body">
        <Show
          when={filtered().length > 0}
          fallback={
            <Show
              when={!store.filter.trim() && projects().length === 0}
              fallback={
                <Show
                  when={store.filter.trim()}
                  fallback={
                    <div class="py-12 text-center text-v2-text-text-muted text-13-regular">
                      {language.t("settings.projects.empty")}
                    </div>
                  }
                >
                  <div class="settings-projects-empty">
                    <SettingsSearchEmpty query={store.filter} />
                  </div>
                </Show>
              }
            >
              <div class="flex flex-col items-center gap-2 py-12 text-center">
                <Icon name="folder" size="large" class="mb-2 text-v2-icon-icon-muted" />
                <div class="text-13-medium text-v2-text-text-base">
                  {language.t("settings.projects.empty.title")}
                </div>
                <div class="text-13-regular text-v2-text-text-muted">
                  {language.t("settings.projects.empty.description")}
                </div>
                <Button variant="neutral" icon="plus" class="mt-6" onClick={addProject}>
                  {language.t("home.project.add")}
                </Button>
              </div>
            </Show>
          }
        >
          <div role="list" class="settings-project-list">
            <For each={filtered()}>
              {(project) => (
                <div class="settings-project-row-shell">
                  <div
                    role="listitem"
                    data-component="settings-project-card"
                    data-menu={store.menu === project.worktree ? "true" : undefined}
                    class="settings-project-card"
                  >
                    <button
                      type="button"
                      aria-label={displayName(project)}
                      class="flex h-full min-w-0 flex-1 items-center gap-2 rounded-[4px] bg-transparent text-start focus-visible:outline-none focus-visible:[box-shadow:inset_0_0_0_1px_var(--v2-border-border-focus)]"
                      onClick={() => props.onOpenProject(project)}
                    >
                      <ProjectIcon project={project} class="shrink-0" />
                      <bdi class="truncate text-[13px] font-[530] leading-5 tracking-[-0.04px] text-v2-text-text-base">
                        {displayName(project)}
                      </bdi>
                    </button>
                    <ProjectOptions
                      server={props.server}
                      project={project}
                      open={store.menu === project.worktree}
                      onOpenChange={(open) => setStore("menu", open ? project.worktree : undefined)}
                      onEdit={() => props.onOpenProject(project)}
                    />
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </>
  )
}
