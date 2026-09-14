import { Effect, Schema } from "effect"
import { Protocol } from "../route/protocol.js"
import { LLMRequest } from "../schema/index.js"
import { AnthropicMessages } from "./anthropic-messages.js"
import { ProviderShared } from "./shared.js"
import type { ZAIChat } from "./zai-chat.js"

export type OptionsInput = {
  readonly effort?: ZAIChat.ReasoningEffort
  readonly thinking?: { readonly type: "enabled" | "adaptive" | "disabled" | (string & {}) }
}

const Options = Schema.Struct({
  effort: Schema.optional(Schema.String),
  thinking: Schema.optional(Schema.Struct({ type: Schema.String })),
})
const Body = Schema.Struct({
  ...AnthropicMessages.AnthropicMessagesBody.fields,
  thinking: Options.fields.thinking,
})

export const protocol = Protocol.withBody(AnthropicMessages.protocol, {
  id: "zai-messages",
  schema: Body,
  from: Effect.fn("ZAIMessages.fromRequest")(function* (request, fromBase) {
    const options = yield* ProviderShared.validateWith(Schema.decodeUnknownEffect(Options))(
      request.providerOptions ?? {},
    )
    // Z.AI accepts enabled thinking without Anthropic's mandatory token budget.
    const body = yield* fromBase(
      LLMRequest.update(request, {
        providerOptions: { ...request.providerOptions, thinking: undefined },
      }),
    )
    return { ...body, thinking: options.thinking }
  }),
})

export * as ZAIMessages from "./zai-messages.js"
