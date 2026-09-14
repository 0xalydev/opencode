import { Catalog } from "@opencode/core/catalog"
import { Plugin } from "@opencode/core/plugin"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const ModelHandler = HttpApiBuilder.group(Api, "server.model", (handlers) =>
  Effect.gen(function* () {
    return handlers
      .handle(
        "model.list",
        Effect.fn(function* () {
          yield* Plugin.awaitActivation
          const catalog = yield* Catalog.Service
          return yield* response(catalog.model.available())
        }),
      )
      .handle(
        "model.default",
        Effect.fn(function* () {
          yield* Plugin.awaitActivation
          const catalog = yield* Catalog.Service
          return yield* response(catalog.model.default())
        }),
      )
  }),
)
