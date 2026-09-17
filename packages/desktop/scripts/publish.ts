#!/usr/bin/env bun

import { Script } from "@opencode/script"
import { $ } from "bun"
import path from "node:path"

const dryRun = process.argv.includes("--dry-run")
if (!Script.release) {
  console.log("skipped desktop publication without a release")
  process.exit(0)
}
const repo = process.env.GH_REPO
if (!repo) throw new Error("GH_REPO is required")
const directory = process.env.OPENCODE_DESKTOP_DIST
if (!directory) throw new Error("OPENCODE_DESKTOP_DIST is required")
const tag = `v${Script.version}`
const files = (
  await Array.fromAsync(
    new Bun.Glob("*.{exe,blockmap,dmg,zip,AppImage,deb,rpm,app.tar.gz}").scan({ cwd: directory, absolute: true }),
  )
).sort()
if (!files.length) throw new Error("No desktop release files found")

if (dryRun) {
  console.log(`dry-run GitHub release: ${repo}/${tag}`)
  process.exit(0)
}

await $`gh release upload ${tag} ${files} --clobber --repo ${repo}`
await $`bun ${path.join(import.meta.dir, "finalize-latest-json.ts")}`
await $`bun ${path.join(import.meta.dir, "finalize-latest-yml.ts")}`
await $`gh release edit ${tag} --draft=false --repo ${repo}`
