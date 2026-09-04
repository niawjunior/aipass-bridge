# Security

This tool drives a browser that is logged into your AiPASS account. It never
reads or forwards a credential — the real request runs as ordinary page
JavaScript inside your own tab, and Chrome attaches the session cookie itself —
but anything that can reach the bridge can *spend* that account. Treat the
bridge port the way you would treat a password.

## Reporting

Open a [security advisory](https://github.com/niawjunior/aipass-bridge/security/advisories/new),
or email the maintainer if you would rather not file publicly. Please do not open
a normal issue for something exploitable.

## If you cloned or forked before 2 Sep 2026

**Update.** Every copy taken before commit
[`8cad676`](https://github.com/niawjunior/aipass-bridge/commit/8cad676)
(2026-09-02, 21:55 +07) has a bridge that any website could drive.

The bridge answered every request with `access-control-allow-origin: *` and
`access-control-allow-private-network: true` — the second being exactly the
opt-in Chrome's Private Network Access check requires before a public page may
reach `127.0.0.1` — with no authentication and no `Host` validation. Any page you
had open in that browser could therefore:

- send messages on your AiPASS account and read the replies,
- list your conversation titles,
- read any `*.log` file the process could open, through a path traversal in `/logs`,
- kill the browser, restart the bridge, and reload the extension.

Binding to `127.0.0.1` did not help: the path in was the browser, not the network.

Fixed in [#5](https://github.com/niawjunior/aipass-bridge/pull/5):

- CORS is **off** by default. The CLIs ignore CORS and the extension reaches the
  bridge with host-permission privilege, so neither ever needed it. Set
  `AIPASS_CORS_ORIGIN` only if you deliberately want a browser page to call it.
- The `Host` header is validated against a loopback allowlist, which closes DNS
  rebinding.
- The process-control routes (`/logs`, `/restart`, `/browser/restart`,
  `/ext/reload`, `/tab/reload`) are off unless `AIPASS_ADMIN=1`, which the Docker
  deployment sets and a laptop does not.
- The `/logs` name is allowlisted rather than interpolated.

```bash
git pull                      # a clone
# a fork: merge upstream/main, or re-fork
```

Then restart the bridge and reload the extension.

## Running it safely

- **Keep the bridge on `127.0.0.1`.** It has no authentication of its own.
- **Do not expose the noVNC desktop.** In the headless deployment it is a live
  view of a browser logged into your account. Reach it over an SSH tunnel; if you
  must expose it, set a strong `noVNC_PASSWORD` first.
- **Do not set `AIPASS_CORS_ORIGIN` to `*`.** That reopens exactly the hole above.
- **`AIPASS_ADMIN=1` grants process control** to anything that can reach the port.
  It exists for the container.

## Known limits, not bugs

- Every message appears in your account's chat history. This drives the real
  product.
- The agent's `--allow-run` executes shell commands in the project root. It is off
  by default for that reason.
- Remote image URLs are fetched server-side behind a private-address guard. The
  guard understands IPv4 in every spelling the URL parser leaves (integer, hex,
  octal and IPv4-mapped IPv6 forms) and re-checks every redirect hop. A bare
  domain name that *resolves* to a private address is still not detected — do
  not point it at URLs you do not trust.
