<div align="center">

<img width="420" alt="aipass bridge" src="https://github.com/user-attachments/assets/e79fbcbb-0a47-494a-af70-b315586fe3a7" />

# aipass bridge

**Make AiPASS great again — now with a terminal.**

[AiPASS](https://aipass.go.th/) gives every Thai citizen free access to 30+ pro AI models.
It only speaks one language though: a chat box. This puts it in your terminal, your
editor, and any OpenAI-compatible tool — and lets it read and write your local files.

[![test](https://github.com/niawjunior/aipass-bridge/actions/workflows/test.yml/badge.svg)](https://github.com/niawjunior/aipass-bridge/actions/workflows/test.yml)

</div>

---

## What it does

```
your terminal ──▶ OpenAI-compatible API on localhost:8787 ──▶ a real logged-in AiPASS tab
```

- **Chat from the terminal**, streaming, with web search and sources.
- **Every model the account can pick** — 33 of them, including the image, video
  and music generators, grouped the way the web UI groups them.
- **Generate images** — pick an image model, get a PNG
  ([example](aipass-bridge/README.md#a-worked-example)).
- **Attach documents** — `--file report.pdf`, and ask about it.
- **Video and music too** — Seedance, Veo and Lyria, saved to disk like images
  ([clip](aipass-bridge/README.md#video-from-a-real-run)). Video is a polled job
  upstream, not a stream, and the bridge hides that difference.
- **Edit local files** — an agent that reads, searches, and edits a project you point it at.
- **See what it costs** — the credit pool, in the popup and after every agent run.
- **Drop-in OpenAI endpoint** — point the `openai` SDK, or any tool that takes a base URL, at it.
- **Run it headless** on a server so it stays up without your laptop.

**No credential ever leaves your browser.** The real request runs as ordinary page
JavaScript inside your own logged-in tab, so Chrome attaches the session cookie
itself. The bridge never sees it, and nothing is written to disk.

## Quick start

```bash
npm run dev
```

Then load the extension — `chrome://extensions` → Developer mode → **Load unpacked**
→ select `aipass-bridge/extension` — and open a [de.aipass.net/chat](https://de.aipass.net/chat)
tab. The extension popup should read **Connected**.

```bash
npm run doctor                                     # is every link working?
npm run setup-assistant                            # one-time: the agent's assistant
npm run chat -- "ช่วยสรุปข่าว AI วันนี้"         # chat, streaming
npm run chat -- "แมวน่ารัก" --model gpt-image-2   # generate an image
npm run chat -- "summarise this" --file report.pdf # ask about a document
npm run chat -- "a street at night" --model seedance-2.0-mini  # generate a video
npm run agent -- "add a /health route" --root .    # edit local files (dry run)
npm run models                                     # everything, by category
npm run credits                                    # what is left of the pool
```

Note the `--` before a script's own flags: `npm run chat --new` is npm's flag,
`npm run chat -- --new` is the script's. Every command takes `-- --help`.

If something is not working, `npm run doctor` walks the chain and names the one
thing to fix:

```
✓ bridge         responding
✗ extension      no tab attached
                 → open https://de.aipass.net/chat and leave it open
– login          skipped — nothing attached to ask
```

Use it from code like any OpenAI endpoint:

```python
from openai import OpenAI
client = OpenAI(base_url="http://127.0.0.1:8787/v1", api_key="sk-dummy")
```

## Docs

**→ [Full documentation](aipass-bridge/README.md)** — setup, the coding assistant
and its action set, conversations, models, generating images / video / music,
credits, configuration, troubleshooting, and tests.

**→ [Headless deployment](aipass-bridge/deploy/README.md)** — Docker + noVNC, for
running it 24/7 on a server.

## Notes

This drives **your own** AiPASS account through a browser you are already signed in
to. It does not bypass authentication, scrape, or share anything — it gives a great
free service the developer interface it was missing. Be reasonable with it, and keep
your bridge on localhost.

Built on Node with no runtime dependencies, plus an MV3 Chrome extension.
`npm run dev:next` still starts the Next.js app that this repo was scaffolded from.

## Security

The bridge has no authentication of its own — keep it on `127.0.0.1`. Anything
that can reach the port can spend the account's credits.

**If you cloned or forked before 2 Sep 2026, update.** Copies taken before
[`8cad676`](https://github.com/niawjunior/aipass-bridge/commit/8cad676) have a
bridge that any website you visited could drive. See [SECURITY.md](SECURITY.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The short version: check
`git config user.email` before you commit, run `npm test`, and list every file
you touched — including the incidental ones.

## Credits

- [**astrathezero**](https://github.com/astrathezero) — the headless Docker
  deployment, image upload, and the offscreen keepalive that stops the service
  worker being evicted with no tab open.
- [**meatasit**](https://github.com/meatasit) — Windows path resolution in the
  test harness, and the two CLI bugs it uncovered.

## License

[MIT](LICENSE). Contributions are welcome and are taken under the same terms.
