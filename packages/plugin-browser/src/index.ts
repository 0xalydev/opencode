import { Plugin } from "@opencode/plugin/effect"
import { Effect } from "effect"
import { BrowserConnection } from "./connection.js"
import { BrowserTools } from "./tools.js"
import { BrowserUse } from "./use.js"

export default Plugin.define({
  id: "opencode.browser",
  effect: (ctx) =>
    Effect.gen(function* () {
      const connection = yield* BrowserConnection.make(ctx)
      yield* BrowserTools.register(ctx, connection)
      yield* BrowserUse.register(ctx)
    }),
})
