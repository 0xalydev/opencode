import type { McpServer } from "@opencode/client/promise"

export function hasServiceNeedingAttention(statuses: Array<McpServer["status"]["status"]>) {
  return statuses.some((status) => status === "needs_auth")
}

export function hasNonBlockingServiceIssue(statuses: Array<McpServer["status"]["status"]>) {
  return statuses.some((status) => status !== "connected" && status !== "pending" && status !== "disabled")
}

export function serverStatusDotClass(input: {
  ready: boolean
  serverHealth: boolean | undefined
  attention: boolean
  issue: boolean
  connecting: boolean
}) {
  if (input.serverHealth === false) return "bg-icon-critical-base"
  if (input.connecting) return "bg-border-weak-base animate-pulse"
  if (!input.ready || input.serverHealth === undefined) return "bg-border-weak-base"
  if (input.attention) return "bg-v2-background-bg-accent"
  if (input.issue) return "bg-icon-warning-base"
  return "bg-icon-success-base"
}
