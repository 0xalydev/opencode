import { expect, test } from "bun:test"
import { BrowserUse } from "../src/use.js"

const snapshot = `- navigation "Main"
  - link "Documentation" [ref=e1]
  - button "Delete account" [ref=e2]
  - button "View details" [ref=e3]
  - textbox "Email" [ref=e4]
  - heading "Welcome"`

test("browser use candidates keep browse mode non-mutating", () => {
  const candidates = BrowserUse.buildCandidates(snapshot, "browse", { email: "person@example.com" })
  expect(candidates.map((candidate) => candidate.type === "click" && candidate.ref).filter(Boolean)).toEqual([
    "e1",
    "e3",
  ])
  expect(candidates.some((candidate) => candidate.type === "fill")).toBe(false)
  expect(candidates.at(-1)?.type).toBe("blocked")
})

test("interact mode exposes bounded fill and high-risk candidates", () => {
  const candidates = BrowserUse.buildCandidates(snapshot, "interact", { email: "person@example.com" })
  expect(candidates.find((candidate) => candidate.type === "click" && candidate.ref === "e2")?.highRisk).toBe(true)
  expect(candidates.find((candidate) => candidate.type === "fill")).toMatchObject({
    ref: "e4",
    input: "email",
    value: "person@example.com",
  })
})

test("form inputs only target matching accessible fields", () => {
  const candidates = BrowserUse.buildCandidates(
    '- textbox "Search providers" [ref=e1]\n- textbox "Username" [ref=e2]',
    "interact",
    { provider_name: "OpenCode", username: "qa-user" },
  )
  expect(candidates.filter((candidate) => candidate.type === "fill")).toEqual([
    {
      id: "c0",
      type: "fill",
      ref: "e2",
      input: "username",
      value: "qa-user",
      description: 'Fill - textbox "Username" [ref=e2] from input "username"',
      highRisk: false,
    },
  ])
})

test("matching form inputs are completed before click candidates", () => {
  const candidates = BrowserUse.selectCandidates(snapshot, "interact", { email: "qa@example.com" }, [], [])
  expect(candidates.map((candidate) => candidate.type)).toEqual(["fill", "blocked"])

  const fill = candidates[0]
  expect(fill?.type).toBe("fill")
  if (fill?.type !== "fill") return
  expect(
    BrowserUse.selectCandidates(snapshot, "interact", { email: "qa@example.com" }, [fill.description], []).some(
      (candidate) => candidate.type === "click",
    ),
  ).toBe(true)
})

test("candidate count respects the TypeSafe Choice limit", () => {
  const large = Array.from({ length: 400 }, (_, index) => `- link "Item ${index}" [ref=e${index + 1}]`).join("\n")
  expect(BrowserUse.buildCandidates(large, "interact", {})).toHaveLength(255)
})
