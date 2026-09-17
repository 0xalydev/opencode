import { describe, expect, test } from "bun:test"
import {
  hasNonBlockingServiceIssue,
  hasServiceNeedingAttention,
  serverStatusDotClass,
  serviceStatusDotClass,
  summaryStatus,
} from "./indicator"

describe("serverStatusDotClass", () => {
  test("uses the success token while the server and services are healthy", () => {
    expect(
      serverStatusDotClass({ ready: true, serverHealth: true, attention: false, issue: false, connecting: false }),
    ).toBe("bg-icon-success-base")
  })

  test("uses the attention token when a service needs attention", () => {
    expect(
      serverStatusDotClass({ ready: true, serverHealth: true, attention: true, issue: true, connecting: false }),
    ).toBe("bg-v2-background-bg-accent")
  })

  test("uses the warning token for non-blocking issues", () => {
    expect(
      serverStatusDotClass({ ready: true, serverHealth: true, attention: false, issue: true, connecting: false }),
    ).toBe("bg-icon-warning-base")
  })

  test("uses the critical token when the server is down", () => {
    expect(
      serverStatusDotClass({ ready: true, serverHealth: false, attention: false, issue: false, connecting: false }),
    ).toBe("bg-icon-critical-base")
    expect(
      serverStatusDotClass({ ready: true, serverHealth: false, attention: false, issue: true, connecting: true }),
    ).toBe("bg-icon-critical-base")
  })

  test("pulses the neutral dot while reconnecting", () => {
    expect(
      serverStatusDotClass({ ready: true, serverHealth: true, attention: false, issue: false, connecting: true }),
    ).toBe("bg-border-weak-base animate-pulse")
  })

  test("stays neutral before status is ready", () => {
    expect(
      serverStatusDotClass({ ready: false, serverHealth: true, attention: false, issue: false, connecting: false }),
    ).toBe("bg-border-weak-base")
    expect(
      serverStatusDotClass({
        ready: false,
        serverHealth: undefined,
        attention: false,
        issue: false,
        connecting: false,
      }),
    ).toBe("bg-border-weak-base")
  })
})

describe("service status", () => {
  test("detects MCP failures and authentication needs", () => {
    expect(hasNonBlockingServiceIssue(["failed"])).toBe(true)
    expect(hasNonBlockingServiceIssue(["needs_auth"])).toBe(true)
    expect(hasNonBlockingServiceIssue(["connected", "pending", "disabled"])).toBe(false)
    expect(hasServiceNeedingAttention(["needs_auth"])).toBe(true)
    expect(hasServiceNeedingAttention(["failed", "connected", "pending", "disabled"])).toBe(false)
  })

  test("shows a dot only for noteworthy MCP states", () => {
    expect(serviceStatusDotClass(["needs_auth"])).toBe("bg-v2-background-bg-accent")
    expect(serviceStatusDotClass(["failed"])).toBe("bg-icon-warning-base")
    expect(serviceStatusDotClass(["connected", "pending", "disabled"])).toBeUndefined()
  })

  test("marks the summary trigger only for errors and attention", () => {
    expect(summaryStatus({ ready: true, serverHealth: true, mcp: ["connected"], connecting: false }).noteworthy).toBe(
      false,
    )
    expect(summaryStatus({ ready: true, serverHealth: true, mcp: ["needs_auth"], connecting: false })).toMatchObject({
      noteworthy: true,
      mcp: "bg-v2-background-bg-accent",
    })
    expect(summaryStatus({ ready: true, serverHealth: false, mcp: [], connecting: false })).toMatchObject({
      noteworthy: true,
      server: "bg-icon-critical-base",
    })
  })
})
