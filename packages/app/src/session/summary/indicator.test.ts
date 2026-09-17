import { describe, expect, test } from "bun:test"
import { hasNonBlockingServiceIssue, hasServiceNeedingAttention, serverStatusDotClass } from "./indicator"

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
})
