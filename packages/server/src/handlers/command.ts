import { Command } from "@opencode/core/command"
import { Plugin } from "@opencode/core/plugin"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const CommandHandler = HttpApiBuilder.group(Api, "server.command", (handlers) =>
  handlers.handle("command.list", () =>
    Effect.gen(function* () {
      yield* Plugin.awaitActivation
      return yield* response(Command.Service.use((command) => command.list()))
    }),
  ),
)
