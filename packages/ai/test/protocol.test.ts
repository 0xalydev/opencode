import { describe, expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import { LLM } from "../src/index.js"
import { OpenAIChat } from "../src/protocols/openai-chat.js"
import { Protocol } from "../src/route.js"
import { LanguageModel } from "../src/schema/index.js"

describe("Protocol.withBody", () => {
  const BaseBody = Schema.Struct({ prompt: Schema.String })
  const ExtendedBody = Schema.Struct({ ...BaseBody.fields, priority: Schema.String })
  const stream = {
    event: Schema.String,
    initial: () => undefined,
    step: () => Effect.succeed([undefined, []] as const),
  }
  const base = Protocol.make({
    id: "base",
    body: {
      schema: BaseBody,
      from: (request) => Effect.succeed({ prompt: String(request.model.id) }),
    },
    stream,
    supportsEffortUpdates: () => true,
  })

  test("derives a typed body while retaining the response protocol", async () => {
    const derived = Protocol.withBody(base, {
      schema: ExtendedBody,
      from: (request, fromBase) => fromBase(request).pipe(Effect.map((body) => ({ ...body, priority: "high" }))),
    })
    const model = LanguageModel.make({
      id: "model",
      provider: "test",
      route: OpenAIChat.route,
    })

    expect(await Effect.runPromise(derived.body.from(LLM.request({ model, prompt: "Hello" })))).toEqual({
      prompt: "model",
      priority: "high",
    })
    expect(derived.stream).toBe(stream)
    expect(derived.supportsEffortUpdates).toBe(base.supportsEffortUpdates)
  })
})
