import { expect } from "bun:test"
import { Bus } from "@opencode/core/bus"
import { Location } from "@opencode/core/location"
import { Plugin } from "@opencode/core/plugin"
import { PluginHost } from "@opencode/core/plugin/host"
import { Provider } from "@opencode/core/provider"
import { Session } from "@opencode/core/session"
import { SessionEvent } from "@opencode/core/session/event"
import { Tool } from "@opencode/core/tool"
import { OpenCodeTools } from "@opencode/core/tool/plugin/opencode"
import { Model } from "@opencode/schema/model"
import { Money } from "@opencode/schema/money"
import { SessionMessage } from "@opencode/schema/session-message"
import type { TokenUsage } from "@opencode/schema/token-usage"
import { Effect, Schema } from "effect"
import { testEffect } from "./lib/effect"
import { executeTool, toolIdentity } from "./lib/tool"
import { PluginTestLayer } from "./plugin/fixture"

const it = testEffect(PluginTestLayer)

const alpha = { id: "test/alpha", name: "Alpha", released: 300, variants: ["fast"], cost: [], status: "beta" }
const beta = { id: "other/beta", name: "Beta", released: 200, variants: [], cost: [], status: "active" }
const gamma = { id: "other/gamma", name: "Gamma Flash", released: 100, variants: [], cost: [], status: "active" }
const gammaOld = {
  id: "other/gamma-old",
  name: "Gamma Flash Old",
  released: 50,
  variants: [],
  cost: [],
  status: "active",
}

it.live("reports the latest context measurement separately from cumulative session usage", () =>
  Effect.gen(function* () {
    const fixture = yield* sessionInfoFixture
    expect(yield* fixture.get()).toMatchObject({
      sessionID: fixture.session.id,
      title: "Context info",
      directory: fixture.session.location.directory,
      agent: "build",
      model: fixture.model,
      limits: { context: 100_000, input: 80_000, output: 10_000 },
      cost: 0,
      context: { tokens: null, percent: null, remaining: null, source: "unavailable", messageID: null },
    })

    yield* fixture.record({ input: 50_000, output: 1_000, reasoning: 0, cache: { read: 0, write: 0 } })
    const messageID = yield* fixture.record({
      input: 200,
      output: 100,
      reasoning: 100,
      cache: { read: 1_500, write: 100 },
    })
    // An in-flight step has no settled usage yet; its presence must not turn the reading into zero.
    yield* fixture.bus.publish(SessionEvent.Step.Started, {
      sessionID: fixture.session.id,
      assistantMessageID: SessionMessage.ID.create(),
      agent: toolIdentity.agent,
      model: fixture.model,
    })
    expect(yield* fixture.get()).toMatchObject({
      cost: 0.2,
      context: { tokens: 2_000, percent: 2, remaining: 98_000, source: "last_completed_step", messageID },
    })

    yield* fixture.catalog.transform((editor) =>
      editor.models.update(fixture.model.providerID, fixture.model.id, (model) => {
        model.limit.context = 0
      }),
    )
    expect(yield* fixture.get({ sessionID: fixture.session.id })).toMatchObject({
      context: { tokens: 2_000, percent: null, remaining: null, source: "last_completed_step", messageID },
    })
  }),
)

it.live("invalidates context usage after compaction and a model switch", () =>
  Effect.gen(function* () {
    const fixture = yield* sessionInfoFixture
    const tokens = { input: 70_000, output: 100, reasoning: 0, cache: { read: 0, write: 0 } }
    yield* fixture.record(tokens)
    yield* fixture.bus.publish(SessionEvent.Compaction.Started, {
      sessionID: fixture.session.id,
      reason: "manual",
      recent: "",
    })
    yield* fixture.bus.publish(SessionEvent.Compaction.Ended, {
      sessionID: fixture.session.id,
      reason: "manual",
      model: fixture.model,
      text: "## Objective\n- Keep working",
      recent: "",
      tokens,
    })
    expect(yield* fixture.get()).toMatchObject({
      context: { tokens: null, percent: null, remaining: null, source: "unavailable", messageID: null },
    })

    yield* fixture.record({ ...tokens, input: 2_000 })
    const other = Model.Ref.make({ ...fixture.model, id: Model.ID.make("other") })
    yield* fixture.sessions.switchModel({ sessionID: fixture.session.id, model: other })
    expect(yield* fixture.get()).toMatchObject({
      model: other,
      limits: null,
      context: { tokens: null, percent: null, remaining: null, source: "unavailable", messageID: null },
    })
    yield* fixture.record(tokens, other)
    yield* fixture.sessions.switchModel({ sessionID: fixture.session.id, model: fixture.model })
    // Switching back must not resurrect an older sample from before the intervening model's work.
    expect(yield* fixture.get()).toMatchObject({ context: { tokens: null, source: "unavailable" } })
  }),
)

it.live("reports an unknown compaction target through the plugin host", () =>
  Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    const sessions = yield* Session.Service
    const location = yield* Location.Service
    const registry = yield* Tool.Service
    const pluginHost = yield* PluginHost.make(plugins)
    yield* OpenCodeTools.Plugin.effect(pluginHost)
    const session = yield* sessions.create({ location: Location.Ref.make({ directory: location.directory }) })

    const result = yield* executeTool(registry, {
      sessionID: session.id,
      ...toolIdentity,
      call: {
        type: "tool-call",
        id: "call-compact-missing",
        name: "execute",
        input: { code: 'return await tools.opencode.session_compact({ sessionID: "ses_missing" })' },
      },
    })

    expect(result).toMatchObject({
      metadata: { error: true },
      content: [{ type: "text", text: "Unable to request compaction of session ses_missing" }],
    })
    expect(yield* sessions.inbox(session.id)).toEqual([])
  }),
)

it.effect("groups available models by provider with paging", () =>
  Effect.gen(function* () {
    const catalog = yield* Provider.Service
    const plugins = yield* Plugin.Service
    const sessions = yield* Session.Service
    const location = yield* Location.Service
    const pluginHost = yield* PluginHost.make(plugins)
    yield* catalog.transform((editor) => {
      editor.update(Provider.ID.make("other"), (provider) => {
        provider.name = "Other Provider"
      })
      editor.models.update(Provider.ID.make("test"), Model.ID.make("alpha"), (model) => {
        model.name = "Alpha"
        model.time.released = 300
        model.variants = [{ id: Model.VariantID.make("fast") }]
        model.status = "beta"
      })
      editor.models.update(Provider.ID.make("other"), Model.ID.make("beta"), (model) => {
        model.name = "Beta"
        model.time.released = 200
      })
      editor.models.update(Provider.ID.make("other"), Model.ID.make("gamma"), (model) => {
        model.name = "Gamma Flash"
        model.time.released = 100
        model.family = Model.Family.make("gamma")
      })
      editor.models.update(Provider.ID.make("other"), Model.ID.make("gamma-old"), (model) => {
        model.name = "Gamma Flash Old"
        model.time.released = 50
        model.family = Model.Family.make("gamma")
      })
      editor.models.update(Provider.ID.make("other"), Model.ID.make("disabled"), (model) => {
        model.time.released = 400
        model.enabled = false
      })
    })
    yield* OpenCodeTools.Plugin.effect(pluginHost)
    // The caller runs on `test`, which sorts first despite `other` coming earlier alphabetically.
    const session = yield* sessions.create({
      location: Location.Ref.make({ directory: location.directory }),
      model: Model.Ref.make({ providerID: Provider.ID.make("test"), id: Model.ID.make("alpha") }),
    })
    const registry = yield* Tool.Service
    const run = (input: Record<string, unknown>) =>
      executeTool(registry, {
        sessionID: session.id,
        ...toolIdentity,
        call: {
          type: "tool-call",
          id: `call-${JSON.stringify(input)}`,
          name: "execute",
          input: { code: `return await tools.opencode.models(${JSON.stringify(input)})` },
        },
      }).pipe(Effect.map((result) => JSON.parse(result.content?.[0]?.type === "text" ? result.content[0].text : "")))

    // Grouped by provider, newest first within each, disabled models excluded.
    expect(yield* run({})).toEqual({
      providers: [
        { id: "test", name: "test", models: [alpha] },
        { id: "other", name: "Other Provider", models: [beta, gamma] },
      ],
      total: 3,
      next: null,
    })

    // Paging slices the ordered list, so a page can end inside a provider group.
    expect(yield* run({ limit: 2 })).toEqual({
      providers: [
        { id: "test", name: "test", models: [alpha] },
        { id: "other", name: "Other Provider", models: [beta] },
      ],
      total: 3,
      next: 2,
    })
    expect(yield* run({ limit: 2, offset: 2 })).toEqual({
      providers: [{ id: "other", name: "Other Provider", models: [gamma] }],
      total: 3,
      next: null,
    })

    expect(yield* run({ provider: "other provider" })).toMatchObject({ total: 2, providers: [{ id: "other" }] })
    expect(yield* run({ provider: "test" })).toEqual({
      providers: [{ id: "test", name: "test", models: [alpha] }],
      total: 1,
      next: null,
    })

    // Every word of the query must appear somewhere in the reference or display name, ignoring case.
    expect(yield* run({ query: "GAMMA" })).toEqual({
      providers: [{ id: "other", name: "Other Provider", models: [gamma] }],
      total: 1,
      next: null,
    })
    expect(yield* run({ query: "test/" })).toMatchObject({ total: 1, providers: [{ id: "test" }] })
    expect(yield* run({ query: "other flash" })).toMatchObject({ total: 1, providers: [{ models: [gamma] }] })
    expect(yield* run({ query: "gamma beta" })).toEqual({ providers: [], total: 0, next: null })

    // Only the newest model of each family is listed unless `all` is set; the query is applied first.
    expect(yield* run({ all: true })).toMatchObject({
      total: 4,
      providers: [{ id: "test" }, { id: "other", models: [beta, gamma, gammaOld] }],
    })
    expect(yield* run({ query: "old" })).toMatchObject({ total: 1, providers: [{ models: [gammaOld] }] })
    expect(yield* run({ provider: "other", query: "alpha" })).toEqual({ providers: [], total: 0, next: null })
  }),
)

const sessionInfoFixture = Effect.gen(function* () {
  const bus = yield* Bus.Service
  const catalog = yield* Provider.Service
  const plugins = yield* Plugin.Service
  const sessions = yield* Session.Service
  const location = yield* Location.Service
  const registry = yield* Tool.Service
  const pluginHost = yield* PluginHost.make(plugins)
  yield* OpenCodeTools.Plugin.effect(pluginHost)
  const model = Model.Ref.make({ providerID: Provider.ID.make("test"), id: Model.ID.make("alpha") })
  yield* catalog.transform((editor) =>
    editor.models.update(model.providerID, model.id, (model) => {
      model.limit = { context: 100_000, input: 80_000, output: 10_000 }
    }),
  )
  const session = yield* sessions.create({
    title: "Context info",
    model,
    location: Location.Ref.make({ directory: location.directory }),
  })
  return {
    bus,
    catalog,
    sessions,
    session,
    model,
    get: (input: { sessionID?: string } = {}) =>
      executeTool(registry, {
        sessionID: session.id,
        ...toolIdentity,
        call: {
          type: "tool-call",
          id: "call-session-info",
          name: "execute",
          input: { code: `return await tools.opencode.session_info(${JSON.stringify(input)})` },
        },
      }).pipe(
        Effect.map((result) => {
          expect(result.metadata?.error).not.toBe(true)
          return Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown))(
            result.content?.[0]?.type === "text" ? result.content[0].text : "",
          )
        }),
      ),
    record: Effect.fn(function* (tokens: TokenUsage.Info, selected = model) {
      const assistantMessageID = SessionMessage.ID.create()
      yield* bus.publish(SessionEvent.Step.Started, {
        sessionID: session.id,
        assistantMessageID,
        agent: toolIdentity.agent,
        model: selected,
      })
      yield* bus.publish(SessionEvent.Step.Ended, {
        sessionID: session.id,
        assistantMessageID,
        finish: "stop",
        cost: Money.USD.make(0.1),
        tokens,
      })
      return assistantMessageID
    }),
  }
})
