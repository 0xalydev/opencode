export * as OpenCodeTools from "./opencode.js"

import { SystemPart, ToolFailure } from "@opencode/ai"
import type { Context } from "@opencode/plugin/effect/plugin"
import type { SessionHooks } from "@opencode/plugin/effect/session"
import { Agent } from "@opencode/schema/agent"
import { Model } from "@opencode/schema/model"
import { AbsolutePath } from "@opencode/schema/schema"
import { Session } from "@opencode/schema/session"
import { SessionMessage } from "@opencode/schema/session-message"
import { TokenUsage } from "@opencode/schema/token-usage"
import { Effect, Schema } from "effect"

export const SessionInfoInput = Schema.Struct({
  sessionID: Schema.optionalKey(Session.ID).annotate({ description: "Omit to inspect the current session." }),
})

const SessionInfoOutput = Schema.Struct({
  sessionID: Session.ID,
  parentID: Schema.NullOr(Session.ID),
  title: Schema.NullOr(Schema.String),
  directory: AbsolutePath,
  agent: Schema.NullOr(Agent.ID),
  model: Schema.NullOr(Model.Ref),
  limits: Schema.NullOr(Model.Info.fields.limit).annotate({
    description: "Model token limits. Null when the model is unavailable in this Location's catalog.",
  }),
  cost: Session.Info.fields.cost.annotate({ description: "Cumulative session cost in USD." }),
  context: Schema.Struct({
    tokens: Schema.NullOr(Schema.Finite),
    percent: Schema.NullOr(Schema.Finite),
    remaining: Schema.NullOr(Schema.Finite),
    source: Schema.Literals(["last_completed_step", "unavailable"]),
    messageID: Schema.NullOr(SessionMessage.ID),
  }).annotate({
    description:
      "Latest completed step's input (including cache), output, and reasoning tokens; excludes subsequent messages and tool results. Not cumulative usage. Null values mean unknown, including after compaction or a model switch until fresh usage is recorded. Percentage and remaining tokens use limits.context.",
  }),
})

export const RenameInput = Schema.Struct({
  sessionID: Schema.optionalKey(Session.ID).annotate({ description: "Omit to rename the current session." }),
  title: Schema.String.check(Schema.isMinLength(1)).annotate({ description: "New session title." }),
})

const RenameOutput = Schema.Struct({ sessionID: Session.ID, title: Schema.String })

export const MoveInput = Schema.Struct({
  sessionID: Schema.optionalKey(Session.ID).annotate({ description: "Omit to move the current session." }),
  directory: AbsolutePath.check(Schema.isMinLength(1)).annotate({
    description: "Destination directory, relative to the target session's directory or absolute. Supports ~.",
  }),
})

const MoveOutput = Schema.Struct({ sessionID: Session.ID, directory: AbsolutePath })

export const CompactInput = Schema.Struct({
  sessionID: Schema.optionalKey(Session.ID).annotate({ description: "Omit to compact the current session." }),
})

const CompactOutput = Schema.Struct({ sessionID: Session.ID, id: SessionMessage.ID })

export const ModelsInput = Schema.Struct({
  query: Schema.optionalKey(Schema.String).annotate({
    description: "Text to search for in model names and IDs.",
  }),
  provider: Schema.optionalKey(Schema.String).annotate({
    description: "Provider ID or name to filter by. Try your own provider first.",
  }),
  all: Schema.optionalKey(Schema.Boolean).annotate({
    description: "Include older versions of each model family. By default only the newest version is listed.",
  }),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))).annotate({
    description: "Maximum number of models to return. Defaults to 20.",
  }),
  offset: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))).annotate({
    description: "Number of models to skip, for paging through results.",
  }),
})

const ModelEntry = Schema.Struct({
  id: Schema.String.annotate({ description: "providerID/modelID" }),
  name: Schema.String,
  released: Model.Info.fields.time.fields.released.annotate({
    description: "Release date as a Unix timestamp in milliseconds, or 0 when unknown.",
  }),
  variants: Schema.Array(Model.VariantID),
  cost: Model.Info.fields.cost.annotate({ description: "Pricing in USD per million tokens." }),
  status: Model.Info.fields.status,
})

const ModelsOutput = Schema.Struct({
  providers: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      models: Schema.Array(ModelEntry).annotate({ description: "Newest first." }),
    }),
  ).annotate({ description: "Matching models grouped by provider. Your own provider comes first." }),
  total: Schema.Int.annotate({ description: "Number of matching models across all pages." }),
  next: Schema.NullOr(Schema.Int).annotate({ description: "Offset of the next page, or null on the last page." }),
})

export const Plugin = {
  id: "opencode.tools",
  effect: Effect.fn("OpenCodeTools.Plugin")(function* (ctx: Context) {
    const hook = (event: SessionHooks["context"]) =>
      Effect.sync(() => {
        event.system.push(
          SystemPart.make(
            "When you create a worktree outside the current working directory and intend to use it as your primary working directory, consider using `execute` to call `tools.opencode.session_move` and make the worktree the session's working directory.",
          ),
        )
      })
    yield* ctx.session.hook("context", hook)
    yield* ctx.session.hook("compaction", hook)
    yield* ctx.session.hook("generate", hook)
    yield* ctx.tool
      .transform((draft) => {
        draft.namespace({
          name: "opencode",
          description:
            "Tools for managing OpenCode itself, such as working with sessions and searching the available models.",
        })
        draft.add({
          name: "session_info",
          description:
            "Get session identity, model limits, cost, and the latest measured context usage. Omit sessionID for the current session. Check this before deciding to compact; low usage generally does not warrant compaction. Usage excludes work since the source message; unavailable does not mean zero.",
          input: SessionInfoInput,
          output: SessionInfoOutput,
          options: { namespace: "opencode", codemode: true, pinned: true },
          execute: (input, context) =>
            Effect.gen(function* () {
              const sessionID = input.sessionID ?? context.sessionID
              const session = yield* ctx.session.get({ sessionID })
              const messages = yield* ctx.session.context({ sessionID })
              const latest = messages.findLast((message) => message.type === "assistant")
              const model = session.model ?? latest?.model
              const limits =
                session.location.directory === ctx.location.directory &&
                session.location.workspaceID === ctx.location.workspaceID
                  ? (yield* ctx.model.list()).data.find(
                      (item) => item.providerID === model?.providerID && item.id === model?.id,
                    )?.limit
                  : undefined
              const last = messages.findLast(
                (message) =>
                  message.type === "assistant" &&
                  message.time.completed !== undefined &&
                  !message.error &&
                  message.tokens !== undefined &&
                  message.tokens.input + message.tokens.cache.read + message.tokens.cache.write > 0,
              )
              const measured =
                !session.revert &&
                last?.type === "assistant" &&
                last.model.providerID === model?.providerID &&
                last.model.id === model?.id
                  ? last
                  : undefined
              const tokens = measured?.tokens ? TokenUsage.total(measured.tokens) : null
              const capacity = limits && limits.context > 0 ? limits.context : undefined
              return {
                output: {
                  sessionID,
                  parentID: session.parentID ?? null,
                  title: session.title ?? null,
                  directory: session.location.directory,
                  agent: session.agent ?? (sessionID === context.sessionID ? context.agent : latest?.agent) ?? null,
                  model: model ?? null,
                  limits: limits ?? null,
                  cost: session.cost,
                  context: {
                    tokens,
                    percent: tokens !== null && capacity ? Math.round((tokens / capacity) * 1000) / 10 : null,
                    remaining: tokens !== null && capacity ? Math.max(0, capacity - tokens) : null,
                    source: tokens === null ? ("unavailable" as const) : ("last_completed_step" as const),
                    messageID: measured?.id ?? null,
                  },
                },
              }
            }).pipe(Effect.mapError((error) => new ToolFailure({ message: "Unable to get session info", error }))),
        })
        draft.add({
          name: "session_rename",
          description:
            "Rename a session, or omit sessionID to rename the current session. Use a short, specific title that summarizes the work being done.",
          input: RenameInput,
          output: RenameOutput,
          options: { namespace: "opencode", codemode: true },
          execute: (input, context) => {
            const sessionID = input.sessionID ?? context.sessionID
            const title = input.title.trim()
            if (!title) return Effect.fail(new ToolFailure({ message: "Session title must not be empty" }))
            return ctx.session.update({ sessionID, title }).pipe(
              Effect.as({
                output: { sessionID, title },
                content: `Renamed session ${sessionID} to ${title}.`,
              }),
              Effect.mapError((error) => new ToolFailure({ message: `Unable to rename session ${sessionID}`, error })),
            )
          },
        })
        draft.add({
          name: "session_move",
          description:
            "Move a session to another directory, or omit sessionID to move the current session. The current session moves at the next safe boundary; do not run destination-dependent tools in the same execute call.",
          input: MoveInput,
          output: MoveOutput,
          options: { namespace: "opencode", codemode: true, pinned: true },
          execute: (input, context) =>
            Effect.gen(function* () {
              const sessionID = input.sessionID ?? context.sessionID
              yield* ctx.session.move({
                sessionID,
                directory: input.directory,
                delivery: "steer",
              })
              return {
                output: { sessionID, directory: input.directory },
                content: `Moved session ${sessionID} to ${input.directory}.`,
              }
            }).pipe(
              Effect.mapError(
                (error) => new ToolFailure({ message: `Unable to move session to ${input.directory}`, error }),
              ),
            ),
        })
        draft.add({
          name: "session_compact",
          description:
            "Request compaction of a session, or omit sessionID to compact the current session. Check session_info first; avoid compaction at low context usage unless the user explicitly requests it. Returns after the request is admitted; compaction runs at the next step boundary, after current tool calls finish.",
          input: CompactInput,
          output: CompactOutput,
          options: { namespace: "opencode", codemode: true, pinned: true },
          execute: (input, context) => {
            const sessionID = input.sessionID ?? context.sessionID
            return ctx.session.compact({ sessionID, delivery: "steer" }).pipe(
              Effect.map((request) => ({
                output: { sessionID, id: request.id },
                content: `Requested compaction of session ${sessionID}. It will run at the next step boundary.`,
              })),
              Effect.mapError(
                (error) => new ToolFailure({ message: `Unable to request compaction of session ${sessionID}`, error }),
              ),
            )
          },
        })
        draft.add({
          name: "models",
          description:
            "Search the models available to use. Use this to turn a model name the user mentions into an exact reference before running a subagent on it. Check your own provider first.",
          input: ModelsInput,
          output: ModelsOutput,
          options: { namespace: "opencode", codemode: true },
          execute: (input, context) =>
            Effect.gen(function* () {
              const offset = input.offset ?? 0
              const limit = input.limit ?? 20
              const own = (yield* ctx.session.get({ sessionID: context.sessionID })).model?.providerID
              const terms = input.query?.toLowerCase().split(/\s+/).filter(Boolean) ?? []
              const names = new Map((yield* ctx.provider.list()).data.map((provider) => [provider.id, provider.name]))
              const provider = input.provider?.toLowerCase()
              const matching = (yield* ctx.model.list()).data
                .filter(
                  (model) =>
                    provider === undefined ||
                    model.providerID.toLowerCase() === provider ||
                    names.get(model.providerID)?.toLowerCase() === provider,
                )
                .filter((model) => {
                  const text = `${model.providerID}/${model.id} ${model.name}`.toLowerCase()
                  return terms.every((term) => text.includes(term))
                })
                .toSorted(
                  (left, right) =>
                    Number(right.providerID === own) - Number(left.providerID === own) ||
                    left.providerID.localeCompare(right.providerID) ||
                    right.time.released - left.time.released,
                )
                .filter((model, index, sorted) => {
                  if (input.all || model.family === undefined) return true
                  return (
                    sorted.findIndex(
                      (other) => other.providerID === model.providerID && other.family === model.family,
                    ) === index
                  )
                })
              const page = matching.slice(offset, offset + limit)
              const providers = Array.from(new Set(page.map((model) => model.providerID))).map((id) => ({
                id,
                name: names.get(id) ?? id,
                models: page
                  .filter((model) => model.providerID === id)
                  .map((model) => ({
                    id: `${model.providerID}/${model.id}`,
                    name: model.name,
                    released: model.time.released,
                    variants: model.variants.map((variant) => variant.id),
                    cost: model.cost,
                    status: model.status,
                  })),
              }))
              return {
                output: {
                  providers,
                  total: matching.length,
                  next: offset + limit < matching.length ? offset + limit : null,
                },
              }
            }).pipe(Effect.mapError((error) => new ToolFailure({ message: "Unable to list models", error }))),
        })
      })
      .pipe(Effect.orDie)
  }),
}
