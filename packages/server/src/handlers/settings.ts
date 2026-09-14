import { Preferences } from "@opencode/core/preferences"
import { InvalidRequestError } from "@opencode/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder, HttpApiSchema } from "effect/unstable/httpapi"
import { Api } from "../api"

export const SettingsHandler = HttpApiBuilder.group(Api, "server.settings", (handlers) =>
  Effect.gen(function* () {
    const preferences = yield* Preferences.Service
    return handlers
      .handle("settings.list", () => preferences.list())
      .handle("settings.get", (ctx) =>
        preferences
          .get(ctx.params)
          .pipe(Effect.map((value) => (value === undefined ? null : { target: ctx.params, value }))),
      )
      .handle("settings.set", (ctx) =>
        preferences.set(ctx.params, ctx.payload.value).pipe(
          Effect.catchTag(
            "Preferences.InvalidValue",
            (error) => new InvalidRequestError({ message: error.message, field: "value" }),
          ),
          Effect.as(HttpApiSchema.NoContent.make()),
        ),
      )
      .handle("settings.reset", (ctx) =>
        preferences.reset(ctx.params).pipe(Effect.as(HttpApiSchema.NoContent.make())),
      )
  }),
)
