import { Preferences } from "@opencode/schema/preferences"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"

export const SettingsGroup = HttpApiGroup.make("server.settings")
  .add(
    HttpApiEndpoint.get("settings.list", "/api/settings", {
      success: Schema.Array(Preferences.Entry),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "settings.list",
        summary: "List preference overrides",
        description: "List explicit global preference values. Domains own their value schemas, defaults, and behavior.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("settings.get", "/api/settings/:kind/:id", {
      params: Preferences.Target.fields,
      success: Schema.NullOr(Preferences.Entry),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "settings.get",
        summary: "Get preference override",
        description:
          "Read one explicit preference override, or null when the domain default applies. An entry whose value is null is distinct from a missing override.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.put("settings.set", "/api/settings/:kind/:id", {
      params: Preferences.Target.fields,
      payload: Schema.Struct({ value: Preferences.Value }),
      success: HttpApiSchema.NoContent,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "settings.set",
        summary: "Set preference override",
        description:
          "Validate a value against its registered preference kind and persist it across all projects and sessions on this server.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.delete("settings.reset", "/api/settings/:kind/:id", {
      params: Preferences.Target.fields,
      success: HttpApiSchema.NoContent,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "settings.reset",
        summary: "Reset preference override",
        description: "Remove the explicit preference so the target follows its domain default again.",
      }),
    ),
  )
  .annotateMerge(OpenApi.annotations({ title: "settings" }))
