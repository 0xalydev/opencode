import { afterAll, describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { CodeMode, Web } from "../src/index.js"

const seen: Array<{ method: string; path: string; headers: Record<string, string>; body: string }> = []
const other = Bun.serve({
  port: 0,
  fetch: (request) => {
    seen.push({ method: request.method, path: new URL(request.url).pathname, headers: {}, body: "" })
    return new Response("other")
  },
})
const server = Bun.serve({
  port: 0,
  fetch: async (request) => {
    const url = new URL(request.url)
    seen.push({
      method: request.method,
      path: url.pathname,
      headers: Object.fromEntries(request.headers),
      body: await request.text(),
    })
    switch (url.pathname) {
      case "/json":
        return Response.json({ hello: "world" }, { headers: { "X-Custom": "yes" } })
      case "/text":
        return new Response("plain text", { status: 201, statusText: "Created" })
      case "/bytes":
        return new Response(new Uint8Array([1, 2, 3]))
      case "/bad-json":
        return new Response("{oops", { headers: { "content-type": "application/json" } })
      case "/redirect":
        return Response.redirect(`${url.origin}/json`, 302)
      case "/redirect-post":
        return Response.redirect(`${url.origin}/text`, 307)
      case "/redirect-away":
        return Response.redirect(`${other.url.origin}/leaked`, 302)
      case "/redirect-loop":
        return Response.redirect(`${url.origin}/redirect-loop`, 302)
      case "/big":
        return new Response("x".repeat(2048))
      case "/big-chunked": {
        const stream = new ReadableStream({
          start(controller) {
            for (let i = 0; i < 4; i++) controller.enqueue(new Uint8Array(1024))
            controller.close()
          },
        })
        return new Response(stream)
      }
      case "/slow":
        await Bun.sleep(300)
        return new Response("late")
      default:
        return new Response("not found", { status: 404 })
    }
  },
})
afterAll(() => {
  server.stop(true)
  other.stop(true)
})

const origin = server.url.origin
const runtime = CodeMode.make({ extensions: [Web.make({ allow: [origin], methods: ["GET", "POST"] })] })

const value = async (code: string, target = runtime) => {
  const result = await Effect.runPromise(target.execute(code))
  if (!result.ok) throw new Error(`expected success, got ${result.error.kind}: ${result.error.message}`)
  return result.value
}

const failure = async (code: string, target = runtime) => {
  const result = await Effect.runPromise(target.execute(code))
  if (result.ok) throw new Error(`expected failure, got value ${JSON.stringify(result.value)}`)
  return result.error.message
}

describe("fetch", () => {
  test("GET json with status, headers, and body readers", async () => {
    expect(
      await value(`
        const res = await fetch("${origin}/json")
        return [res.status, res.ok, res.redirected, res.url, res.headers.get("X-Custom"), res.headers.has("content-type"), await res.json(), await res.text()]
      `),
    ).toEqual([200, true, false, `${origin}/json`, "yes", true, { hello: "world" }, '{"hello":"world"}'])
  })

  test("status text, bytes, and header entries", async () => {
    expect(
      await value(`
        const res = await fetch(new URL("${origin}/text"))
        const bytes = await (await fetch("${origin}/bytes")).bytes()
        return [res.status, res.statusText, await res.text(), [...bytes], bytes instanceof Uint8Array, res.headers.entries().some(([name]) => name === "content-type")]
      `),
    ).toEqual([201, "Created", "plain text", [1, 2, 3], true, true])
  })

  test("POST with headers and each body kind", async () => {
    seen.length = 0
    await value(`
      await fetch("${origin}/text", { method: "post", headers: { "X-A": "1" }, body: "hello" })
      await fetch("${origin}/text", { method: "POST", headers: [["X-B", "2"]], body: new Uint8Array([104, 105]) })
      await fetch("${origin}/text", { method: "POST", body: new URLSearchParams({ q: "x y" }) })
    `)
    expect(seen.map((request) => [request.method, request.body])).toEqual([
      ["POST", "hello"],
      ["POST", "hi"],
      ["POST", "q=x+y"],
    ])
    expect(seen[0].headers["x-a"]).toBe("1")
    expect(seen[1].headers["x-b"]).toBe("2")
    expect(seen[2].headers["content-type"]).toContain("application/x-www-form-urlencoded")
  })

  test("a JSON parse failure is a catchable SyntaxError", async () => {
    expect(
      await value(`
        try { await (await fetch("${origin}/bad-json")).json() } catch (e) { return [e instanceof SyntaxError, e.message.length > 0] }
      `),
    ).toEqual([true, true])
  })

  test("a non-2xx response is returned, not thrown", async () => {
    expect(await value(`const res = await fetch("${origin}/missing"); return [res.ok, res.status]`)).toEqual([
      false,
      404,
    ])
  })

  test("fetch is not a tool call", async () => {
    const limited = CodeMode.make({ extensions: [Web.make({ allow: [origin] })], limits: { maxToolCalls: 0 } })
    const result = await Effect.runPromise(limited.execute(`return (await fetch("${origin}/json")).status`))
    expect(result.ok).toBe(true)
    expect(result.toolCalls).toEqual([])
  })
})

describe("policy", () => {
  test("origins outside the allow list are refused before any request is made", async () => {
    seen.length = 0
    expect(await failure(`await fetch("${other.url.origin}/leaked")`)).toContain(
      `request to ${other.url.origin}/leaked is not an allowed origin. Allowed: ${origin}.`,
    )
    expect(await failure(`await fetch("file:///etc/passwd")`)).toContain("must use http or https")
    expect(await failure(`await fetch("not a url")`)).toContain('"not a url" is not a valid URL')
    expect(await failure(`await fetch(42)`)).toContain("first argument must be a URL string or URL")
    expect(seen).toEqual([])
  })

  test("* allows every origin", async () => {
    const open = CodeMode.make({ extensions: [Web.make({ allow: ["*"] })] })
    expect(await value(`return (await fetch("${other.url.origin}/")).status`, open)).toBe(200)
  })

  test("methods default to GET and HEAD", async () => {
    const readOnly = CodeMode.make({ extensions: [Web.make({ allow: [origin] })] })
    expect(await failure(`await fetch("${origin}/text", { method: "POST" })`, readOnly)).toContain(
      "method POST is not allowed. Allowed: GET, HEAD.",
    )
    expect(await failure(`await fetch("${origin}/text", { method: "DELETE" })`)).toContain(
      "method DELETE is not allowed. Allowed: GET, POST.",
    )
  })

  test("init keys and shapes that mean nothing here are rejected by name", async () => {
    expect(await failure(`await fetch("${origin}/json", { signal: 1 })`)).toContain(
      "init.signal is not supported here; only method, headers, and body are.",
    )
    expect(await failure(`await fetch("${origin}/json", { credentials: "include" })`)).toContain("init.credentials")
    expect(await failure(`await fetch("${origin}/json", "GET")`)).toContain("init must be an object")
    expect(await failure(`await fetch("${origin}/json", { headers: "X: 1" })`)).toContain("init.headers must be")
    expect(await failure(`await fetch("${origin}/json", { method: "POST", body: { a: 1 } })`)).toContain(
      "init.body must be a string, Uint8Array, or URLSearchParams.",
    )
  })

  test("redirects are followed within the allow list and reported", async () => {
    expect(
      await value(`const res = await fetch("${origin}/redirect"); return [res.redirected, res.url, await res.json()]`),
    ).toEqual([true, `${origin}/json`, { hello: "world" }])
    seen.length = 0
    expect(
      await value(
        `const res = await fetch("${origin}/redirect-post", { method: "POST", body: "keep" }); return res.status`,
      ),
    ).toBe(201)
    expect(seen.map((request) => [request.path, request.method, request.body])).toEqual([
      ["/redirect-post", "POST", "keep"],
      ["/text", "POST", "keep"],
    ])
  })

  test("a redirect to a disallowed origin is refused and never requested", async () => {
    seen.length = 0
    expect(await failure(`await fetch("${origin}/redirect-away")`)).toContain(
      `redirect to ${other.url.origin}/leaked is not an allowed origin`,
    )
    expect(seen.map((request) => request.path)).toEqual(["/redirect-away"])
  })

  test("redirect loops stop", async () => {
    expect(await failure(`await fetch("${origin}/redirect-loop")`)).toContain("redirected more than 5 times")
  })

  test("oversized bodies are refused, declared or streamed", async () => {
    const small = CodeMode.make({ extensions: [Web.make({ allow: [origin], maxBodyBytes: 1024 })] })
    expect(await failure(`await fetch("${origin}/big")`, small)).toContain("exceeds 1024 bytes")
    expect(await failure(`await fetch("${origin}/big-chunked")`, small)).toContain("exceeds 1024 bytes")
    expect(await value(`return (await fetch("${origin}/json")).status`, small)).toBe(200)
  })

  test("slow requests time out", async () => {
    const quick = CodeMode.make({ extensions: [Web.make({ allow: [origin], timeoutMs: 50 })] })
    expect(await failure(`await fetch("${origin}/slow")`, quick)).toContain("timed out after 50ms")
  })
})

test("the signature names the global and its shape", () => {
  expect(Web.signature).toStartWith("fetch(url: string | URL, init?:")
})
