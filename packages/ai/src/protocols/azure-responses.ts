import { Effect, Schema } from "effect"
import { Protocol } from "../route/protocol.js"
import { OpenAIResponses } from "./openai-responses.js"

export const Body = OpenAIResponses.OpenAIResponsesBody.mapFields((fields) => ({
  ...fields,
  input: Schema.Array(
    Schema.Union([
      Schema.Struct({ type: Schema.Literal("message"), role: Schema.tag("system"), content: Schema.String }),
      Schema.Struct({ type: Schema.Literal("message"), role: Schema.tag("developer"), content: Schema.String }),
      OpenAIResponses.OpenAIResponsesInputItem,
    ]),
  ),
}))
export type Body = typeof Body.Type

export const protocol = Protocol.withBody(OpenAIResponses.protocol, {
  id: "azure-responses",
  schema: Body,
  from: Effect.fn("AzureResponses.fromRequest")(function* (request, fromBase) {
    const body = yield* fromBase(request)
    return {
      ...body,
      input: body.input.map((item) => {
        if (("type" in item && item.type !== undefined && item.type !== "message") || !("role" in item)) return item
        if ((item.role === "system" || item.role === "developer") && typeof item.content === "string")
          return { type: "message" as const, role: item.role, content: item.content }
        if (item.role === "user" && Array.isArray(item.content)) return { ...item, type: "message" as const }
        return item
      }),
    }
  }),
})

export const AzureResponses = { Body, protocol } as const
