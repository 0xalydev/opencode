import { Plugin } from "@opencode/plugin"
import { Schema } from "effect"

// Public-API-only prototype for evaluating phase-aware compaction plugins.
export const PhaseCompactionPlugin = Plugin.define({
  id: "phase-compaction-prototype",
  async setup(ctx) {
    const options = Schema.decodeUnknownSync(
      Schema.Struct({
        minimumPercent: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 100 }))),
      }),
    )(ctx.options)

    await ctx.session.hook("context", (event) => {
      event.system.push({
        type: "text",
        text: "At a meaningful phase boundary, use tools.phase.checkpoint with the next action and facts to preserve. It checks context usage before requesting compaction. Continue working after the tool returns; do not checkpoint after every small step.",
      })
    })
    await ctx.session.hook("compaction", (event) => {
      event.system.push({
        type: "text",
        text: "When summarizing a phase checkpoint, preserve its next action and essential handoff facts in the checkpoint. Treat completed phases as completed work.",
      })
    })
    await ctx.tool.transform((editor) => {
      editor.namespace({ name: "phase", description: "Checkpoint completed phases of a task." })
      editor.add({
        name: "checkpoint",
        description: "Record a phase handoff and request compaction when measured context usage is high enough.",
        input: Schema.Struct({
          next: Schema.String.check(Schema.isMinLength(1)),
          preserve: Schema.Array(Schema.String),
        }),
        output: Schema.Struct({
          status: Schema.Literals(["skipped", "requested"]),
          reason: Schema.String,
          percent: Schema.NullOr(Schema.Finite),
          id: Schema.optionalKey(Schema.String),
          next: Schema.String,
          preserve: Schema.Array(Schema.String),
        }),
        options: { namespace: "phase", codemode: true, pinned: true },
        async execute(input, tool) {
          const session = await ctx.session.get({ sessionID: tool.sessionID })
          const messages = await ctx.session.context({ sessionID: tool.sessionID })
          const last = messages.findLast(
            (message) =>
              message.type === "assistant" && message.time.completed !== undefined && !message.error && message.tokens,
          )
          const selected = session.model ?? (last?.type === "assistant" ? last.model : undefined)
          const model = (await ctx.model.list()).data.find(
            (model) => model.providerID === selected?.providerID && model.id === selected?.id,
          )
          const usage =
            !session.revert &&
            last?.type === "assistant" &&
            last.model.providerID === selected?.providerID &&
            last.model.id === selected?.id
              ? last.tokens
              : undefined
          const percent =
            usage && usage.input + usage.cache.read + usage.cache.write > 0 && model && model.limit.context > 0
              ? ((usage.input + usage.cache.read + usage.cache.write + usage.output + usage.reasoning) /
                  model.limit.context) *
                100
              : null
          if (percent === null || percent < (options.minimumPercent ?? 50))
            return {
              output: {
                ...input,
                status: "skipped" as const,
                percent,
                reason: percent === null ? "Usage unavailable" : "Low context usage",
              },
            }

          const request = await ctx.session.compact({ sessionID: tool.sessionID })
          // The handoff remains in the durable tool exchange; the API has no per-request summary prompt.
          return {
            output: {
              ...input,
              status: "requested" as const,
              percent,
              id: request.id,
              reason: "Phase checkpoint admitted",
            },
          }
        },
      })
    })
  },
})
