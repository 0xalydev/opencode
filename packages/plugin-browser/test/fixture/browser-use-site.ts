const port = Number(process.env.PORT ?? 43127)

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  routes: {
    "/": Response.redirect(`http://127.0.0.1:${port}/login`),
    "/login": page(
      "QA Portal Login",
      `<main>
        <h1>QA Portal</h1>
        <p>Sign in to inspect project test results.</p>
        <label>Username <input id="username" name="username" autocomplete="off" /></label>
        <button id="login">Sign in</button>
        <p id="error" role="alert" hidden>Enter the QA username.</p>
        <script>
          document.querySelector("#login").addEventListener("click", () => {
            const username = document.querySelector("#username").value.trim()
            if (!username) {
              document.querySelector("#error").hidden = false
              return
            }
            location.href = "/dashboard?user=" + encodeURIComponent(username)
          })
        </script>
      </main>`,
    ),
    "/dashboard": page(
      "QA Dashboard",
      `<main>
        <h1>QA Dashboard</h1>
        <p>Signed in as <strong id="user"></strong>.</p>
        <nav>
          <a href="/projects">Projects</a>
          <a href="/activity">Recent activity</a>
        </nav>
        <script>
          document.querySelector("#user").textContent = new URLSearchParams(location.search).get("user") ?? "unknown"
        </script>
      </main>`,
    ),
    "/activity": page(
      "Recent Activity",
      `<main>
        <h1>Recent activity</h1>
        <p>Orion deployed a documentation update.</p>
        <a href="/dashboard">Back to dashboard</a>
      </main>`,
    ),
    "/projects": page(
      "Projects",
      `<main>
        <h1>Projects</h1>
        <ul>
          <li><strong>Atlas</strong> — browser automation platform <a href="/projects/atlas">View Atlas</a></li>
          <li><strong>Orion</strong> — documentation site <a href="/projects/orion">View Orion</a></li>
          <li><strong>Nova</strong> — mobile client <a href="/projects/nova">View Nova</a></li>
        </ul>
      </main>`,
    ),
    "/projects/atlas": page(
      "Atlas Project",
      `<main>
        <h1>Atlas</h1>
        <p>Browser automation platform.</p>
        <nav>
          <a href="/projects/atlas/overview">Overview</a>
          <a href="/projects/atlas/releases">Releases</a>
          <a href="/projects/atlas/settings">Settings</a>
        </nav>
      </main>`,
    ),
    "/projects/orion": projectPlaceholder("Orion"),
    "/projects/nova": projectPlaceholder("Nova"),
    "/projects/atlas/overview": page(
      "Atlas Overview",
      `<main>
        <h1>Atlas overview</h1>
        <p>Current release: 2.4.0</p>
        <a href="/projects/atlas/test-runs">View test runs</a>
      </main>`,
    ),
    "/projects/atlas/settings": page(
      "Atlas Settings",
      `<main>
        <h1>Atlas settings</h1>
        <p>No test results are available on this page.</p>
        <a href="/projects/atlas">Back to Atlas</a>
      </main>`,
    ),
    "/projects/atlas/releases": page(
      "Atlas Releases",
      `<main>
        <h1>Atlas releases</h1>
        <ul>
          <li><a href="/projects/atlas/releases/2.4.0">Release 2.4.0</a> — current</li>
          <li><a href="/projects/atlas/releases/2.3.2">Release 2.3.2</a> — maintenance</li>
          <li><a href="/projects/atlas/releases/2.3.1">Release 2.3.1</a> — archived</li>
        </ul>
      </main>`,
    ),
    "/projects/atlas/releases/2.4.0": page(
      "Atlas Release 2.4.0",
      `<main>
        <h1>Atlas release 2.4.0</h1>
        <p>Candidate build: atlas-2.4.0-rc3</p>
        <nav>
          <a href="/projects/atlas/releases/2.4.0/notes">Release notes</a>
          <a href="/projects/atlas/releases/2.4.0/quality">Quality report</a>
          <a href="/projects/atlas/releases/2.4.0/artifacts">Artifacts</a>
        </nav>
      </main>`,
    ),
    "/projects/atlas/releases/2.3.2": releasePlaceholder("2.3.2"),
    "/projects/atlas/releases/2.3.1": releasePlaceholder("2.3.1"),
    "/projects/atlas/releases/2.4.0/notes": releaseSectionPlaceholder("Release notes"),
    "/projects/atlas/releases/2.4.0/artifacts": releaseSectionPlaceholder("Artifacts"),
    "/projects/atlas/releases/2.4.0/quality": page(
      "Atlas 2.4.0 Quality Report",
      `<main>
        <h1>Atlas 2.4.0 quality report</h1>
        <p>Select a test suite for detailed runs.</p>
        <ul>
          <li><a href="/projects/atlas/releases/2.4.0/quality/browser">Browser suite</a></li>
          <li><a href="/projects/atlas/releases/2.4.0/quality/api">API suite</a></li>
          <li><a href="/projects/atlas/releases/2.4.0/quality/mobile">Mobile suite</a></li>
        </ul>
      </main>`,
    ),
    "/projects/atlas/releases/2.4.0/quality/browser": page(
      "Atlas Browser Suite",
      `<main>
        <h1>Atlas browser suite</h1>
        <p>Runs are ordered newest first.</p>
        <table>
          <thead><tr><th>Run</th><th>Branch</th><th>Started</th><th>Result</th></tr></thead>
          <tbody>
            <tr><td><a href="/projects/atlas/test-runs/1842">Run 1842</a></td><td>main</td><td>Today 14:32</td><td>Passed</td></tr>
            <tr><td><a href="/projects/atlas/test-runs/1841">Run 1841</a></td><td>feature/search</td><td>Yesterday 19:10</td><td>Failed</td></tr>
            <tr><td><a href="/projects/atlas/test-runs/1840">Run 1840</a></td><td>main</td><td>Yesterday 08:04</td><td>Passed</td></tr>
          </tbody>
        </table>
      </main>`,
    ),
    "/projects/atlas/releases/2.4.0/quality/api": suitePlaceholder("API"),
    "/projects/atlas/releases/2.4.0/quality/mobile": suitePlaceholder("Mobile"),
    "/projects/atlas/test-runs": page(
      "Atlas Test Runs",
      `<main>
        <h1>Atlas test runs</h1>
        <table>
          <thead><tr><th>Run</th><th>Branch</th><th>Started</th><th>Result</th></tr></thead>
          <tbody>
            <tr><td><a href="/projects/atlas/test-runs/1842">Run 1842</a></td><td>main</td><td>Today 14:32</td><td>Passed</td></tr>
            <tr><td><a href="/projects/atlas/test-runs/1841">Run 1841</a></td><td>feature/search</td><td>Yesterday 19:10</td><td>Failed</td></tr>
            <tr><td><a href="/projects/atlas/test-runs/1840">Run 1840</a></td><td>main</td><td>Yesterday 08:04</td><td>Passed</td></tr>
          </tbody>
        </table>
      </main>`,
    ),
    "/projects/atlas/test-runs/1842": page(
      "Atlas Run 1842",
      `<main>
        <h1>Run 1842</h1>
        <p>Branch: main</p>
        <p>Finished today at 14:38.</p>
        <section aria-labelledby="summary">
          <h2 id="summary">Integration tests passed</h2>
          <p>128 passed, 0 failed, 3 skipped.</p>
          <p>Duration: 5 minutes 42 seconds.</p>
        </section>
      </main>`,
    ),
    "/projects/atlas/test-runs/1841": runPlaceholder("1841", "Integration tests failed"),
    "/projects/atlas/test-runs/1840": runPlaceholder("1840", "Integration tests passed"),
  },
})

console.log(server.url.href)

function page(title: string, body: string) {
  return new Response(
    `<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${title}</title>
          <style>
            body { font: 16px system-ui; margin: 0; background: #f5f7fb; color: #172033; }
            main { width: min(760px, calc(100% - 48px)); margin: 48px auto; padding: 32px; background: white; border-radius: 16px; box-shadow: 0 12px 40px #1d2b4f18; }
            nav, label { display: flex; gap: 16px; margin: 20px 0; }
            label { flex-direction: column; max-width: 320px; }
            input, button { font: inherit; padding: 10px 12px; }
            button { width: fit-content; cursor: pointer; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border-bottom: 1px solid #d8deea; padding: 12px; text-align: left; }
            a { color: #3157c8; }
          </style>
        </head>
        <body>${body}</body>
      </html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  )
}

function projectPlaceholder(name: string) {
  return page(
    `${name} Project`,
    `<main><h1>${name}</h1><p>This project has no relevant Atlas test data.</p><a href="/projects">Back to projects</a></main>`,
  )
}

function runPlaceholder(id: string, result: string) {
  return page(
    `Atlas Run ${id}`,
    `<main><h1>Run ${id}</h1><h2>${result}</h2><a href="/projects/atlas/test-runs">Back to test runs</a></main>`,
  )
}

function releasePlaceholder(version: string) {
  return page(
    `Atlas Release ${version}`,
    `<main><h1>Atlas release ${version}</h1><p>This is not the current release.</p><a href="/projects/atlas/releases">Back to releases</a></main>`,
  )
}

function releaseSectionPlaceholder(section: string) {
  return page(
    `Atlas ${section}`,
    `<main><h1>${section}</h1><p>This section does not contain test suite results.</p><a href="/projects/atlas/releases/2.4.0">Back to release</a></main>`,
  )
}

function suitePlaceholder(suite: string) {
  return page(
    `Atlas ${suite} Suite`,
    `<main><h1>${suite} suite</h1><p>This suite does not contain browser integration results.</p><a href="/projects/atlas/releases/2.4.0/quality">Back to quality report</a></main>`,
  )
}
