// MAIN world. Runs as ordinary page JavaScript, so the fetch below is a real
// first-party request and the browser attaches the session cookie itself —
// nothing here ever reads or forwards a credential.
(() => {
  // Reloading the extension leaves this script running with stale code, and a
  // plain "already loaded" guard would block the replacement forever. Each
  // injection claims a higher generation; older copies stand down.
  const GEN = (window.__aipassBridgeGen ?? 0) + 1;
  window.__aipassBridgeGen = GEN;

  const TAG = '__aipass_bridge';
  // How often a submitted video job is polled. The web client sits in the same
  // range; a 4-second clip takes roughly a hundred seconds to render.
  const POLL_MS = 2000;
  // What the video job's error codes actually mean.
  const VIDEO_ERROR_HINTS = {
    provider_content_policy:
      "the video provider's safety filter rejected the prompt or image. It is "
      + 'strict about recognisable real faces, public figures, copyrighted '
      + 'characters, violence and sensitive subjects; a crowd scene is often '
      + 'enough. Rewrite the prompt and try again, but note the attempt may still '
      + 'have counted against the video quota',
    contentPolicyViolation: 'the prompt was rejected by a content filter before it reached the model',
    quotaExceeded: 'the account has used its video generations for this period — npm run credits shows the count',
    conflictActive: 'another video job is still running on this conversation',
  };
  const inflight = new Map();
  // How many bytes of media may be carried back inline as a data URI; above
  // this it goes back as a link. The bridge accepts an extension post up to
  // 128 MB, and base64 costs a third on top, so every cap here fits through.
  // This only applies to a same-origin URL that needs this page's cookie: a
  // *generated* image, video or music clip comes back as a signed
  // storage.googleapis.com link that anything can fetch, and is passed straight
  // through.
  const INLINE_CAP = {
    image: 5 * 1024 * 1024,
    audio: 25 * 1024 * 1024,
    video: 50 * 1024 * 1024,
    file: 10 * 1024 * 1024,
  };

  // image/png -> image, video/mp4 -> video, audio/wav -> audio. Anything else
  // is a file, which the bridge renders as a link rather than an image tag.
  const mediaKind = (mediaType) => {
    const t = String(mediaType || '').toLowerCase();
    if (t.startsWith('image/')) return 'image';
    if (t.startsWith('video/')) return 'video';
    if (t.startsWith('audio/')) return 'audio';
    return '';
  };
  // Frames that legitimately carry nothing we need.
  const QUIET_FRAMES = new Set([
    'start', 'start-step', 'finish-step', 'text-start', 'text-end',
    'reasoning-start', 'reasoning-end', 'tool-input-delta', 'message-metadata',
  ]);

  const reply = (msg) => window.postMessage({ [TAG]: 'res', ...msg }, window.location.origin);

  // Read-only GET against one of the app's own loaders. Confined to /loaders/
  // so a compromised bridge cannot turn this into a general request forwarder.
  async function runLoader(job) {
    try {
      if (!/^\/loaders\/[A-Za-z0-9._~-]+(\.data)?(\?|$)/.test(job.url)) {
        throw new Error(`refusing non-loader path: ${job.url}`);
      }
      const res = await fetch(job.url, { credentials: 'include', headers: { accept: '*/*' } });
      if (!res.ok) throw new Error(`aipass returned ${res.status} ${res.statusText}`);
      reply({ jobId: job.jobId, kind: 'loader', raw: await res.text() });
    } catch (err) {
      reply({ jobId: job.jobId, kind: 'loader', message: String(err?.message ?? err) });
    }
  }

  // Creating a conversation is a form post to the route the chat page itself
  // uses. The server derives the id from clientCreateRequestId, taking its
  // first sixteen hex characters.
  async function runCreate(job) {
    try {
      // A temporary chat is a different intent and takes no first message: the
      // server mints the conversation itself and marks it isTemporary, so it
      // never lands in the account's history and expires on its own.
      const params = job.temporary
        ? new URLSearchParams({ intent: 'create-temporary-chat' })
        : new URLSearchParams({
            message: job.message,
            folderId: '',
            modelId: job.modelId,
            intent: 'create-conversation',
            clientCreateRequestId: job.requestId,
          });
      // Bind to a custom assistant when one is configured. The field name comes
      // from the bridge so it can be corrected without touching the extension.
      if (job.assistant && job.assistantField) params.set(job.assistantField, job.assistant);
      const res = await fetch('/chat.data', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', accept: '*/*' },
        body: params.toString(),
      });
      if (!res.ok) throw new Error(`aipass returned ${res.status} ${res.statusText}`);
      reply({ jobId: job.jobId, kind: 'loader', raw: await res.text() });
    } catch (err) {
      reply({ jobId: job.jobId, kind: 'loader', message: String(err?.message ?? err) });
    }
  }

  function dataUrlToBlob(dataUrl) {
    const arr = dataUrl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  async function uploadFileHelper(blob, filename, contentType, conversationId, modelId, signal) {
    const initRes = await fetch('/actions/upload-file/initiate', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId,
        filename,
        contentFilename: filename,
        contentType,
        sizeBytes: blob.size,
        ...(modelId ? { modelId } : {})
      }),
      signal
    });
    if (!initRes.ok) {
      const errText = await initRes.text().catch(() => '');
      throw new Error(`upload initiate failed: ${initRes.status} ${errText}`);
    }
    const initData = await initRes.json();
    if (initData.error) throw new Error(initData.error);
    if (!initData.uploadUrl || !initData.uploadToken || !initData.storageKey) {
      throw new Error('invalid upload initiate response');
    }

    const putHeaders = { 'Content-Type': contentType };
    if (initData.sizeBytes != null) {
      putHeaders['x-goog-content-length-range'] = `${initData.sizeBytes},${initData.sizeBytes}`;
      putHeaders['x-goog-if-generation-match'] = '0';
    }
    const putRes = await fetch(initData.uploadUrl, {
      method: 'PUT',
      headers: putHeaders,
      body: blob,
      signal
    });
    if (!putRes.ok && putRes.status !== 412) {
      throw new Error(`direct upload PUT failed: ${putRes.status}`);
    }

    const confirmRes = await fetch('/actions/upload-file/confirm', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadToken: initData.uploadToken
      }),
      signal
    });
    if (!confirmRes.ok) {
      const errText = await confirmRes.text().catch(() => '');
      throw new Error(`upload confirm failed: ${confirmRes.status} ${errText}`);
    }
    const confirmData = await confirmRes.json();
    if (confirmData.error) throw new Error(confirmData.error);

    return {
      storageKey: confirmData.storageKey || initData.storageKey,
      downloadUrl: confirmData.downloadUrl || confirmData.url || initData.downloadUrl || initData.url || ''
    };
  }

  async function run(job) {
    const controller = new AbortController();
    inflight.set(job.jobId, controller);

    // Deltas arrive in tiny pieces; batching keeps the hop back to the bridge
    // from turning into hundreds of POSTs per response.
    let buffer = [];
    const flush = () => {
      if (!buffer.length) return;
      reply({ jobId: job.jobId, kind: 'chunk', parts: buffer });
      buffer = [];
    };
    const ticker = setInterval(flush, 40);
    // Anything that is part of the answer, as opposed to a status line. Counted
    // because a stream can only be safely reattached before the first one: a
    // resume replays from the start, which would duplicate whatever was already
    // sent on.
    let emitted = 0;
    const CONTENT = new Set(['text', 'reasoning', 'image', 'video', 'audio', 'file']);
    const push = (kind, text, filename) => {
      if (!text) return;
      if (CONTENT.has(kind)) emitted++;
      buffer.push({ kind, text, ...(filename ? { filename } : {}) });
    };

    try {
      // Process parts: upload any image blobs and get their storageKey
      const processedParts = [];
      if (Array.isArray(job.parts) && job.parts.length > 0) {
        for (const p of job.parts) {
          if (p.type === 'image' || p.type === 'file') {
            const rawUrl = p.image || p.url || p.data || '';
            // Images default to jpeg because that is what a bare data: URI
            // usually is; anything else must declare what it is.
            let mediaType = p.mediaType || (p.type === 'image' ? 'image/jpeg' : 'application/octet-stream');
            let blob = null;
            // Only data: URIs are accepted here. The bridge resolves remote
            // image URLs to data URIs server-side (behind an SSRF guard), so the
            // extension is never asked to fetch an arbitrary URL with the user's
            // cookies.
            if (rawUrl.startsWith('data:')) {
              blob = dataUrlToBlob(rawUrl);
              mediaType = blob.type || mediaType;
            }
            if (blob) {
              const ext = (mediaType.split('/')[1] || 'jpeg').replace(/^jpeg$/, 'jpg');
              const filename = p.filename || `${p.type === 'image' ? 'image' : 'attachment'}.${ext}`;
              push('status', `[upload] uploading ${filename} (${(blob.size / 1024).toFixed(1)} KB)...`);
              const uploadRes = await uploadFileHelper(
                blob,
                filename,
                mediaType,
                job.conversationId,
                job.modelId,
                controller.signal
              );
              processedParts.push({
                type: 'file',
                mediaType,
                filename,
                url: uploadRes.storageKey,
                storageKey: uploadRes.storageKey,
              });
            }
          } else {
            processedParts.push({
              type: 'text',
              text: typeof p.text === 'string' ? p.text : String(p),
            });
          }
        }
      } else {
        processedParts.push({ type: 'text', text: job.text });
      }

      const body = JSON.stringify({
        modelId: job.modelId,
        // The image models take this; the chat models ignore it. The web UI
        // offers 1:1, 3:4 and 4:3.
        imageAspectRatio: job.aspectRatio || '1:1',
        // A temporary conversation has to be told so on every turn, not just at
        // creation — the web client sends this same flag with each message.
        ...(job.temporary ? { isTemporary: true } : {}),
        // The levels a model advertises in thinkingConfig.supportedLevels —
        // low | medium | high, and max on Claude Opus. The bridge validates.
        ...(job.thinkingLevel ? { thinkingLevel: job.thinkingLevel } : {}),
        // A style preset for an image model, by id; tone and format apply to any
        // model and travel as the codes the output-styles loader publishes.
        ...(job.imageStyleId ? { imageStyleId: job.imageStyleId } : {}),
        ...(job.outputTone ? { outputTone: job.outputTone } : {}),
        ...(job.outputFormat ? { outputFormat: job.outputFormat } : {}),
        messages: [{
          id: crypto.randomUUID(),
          role: 'user',
          metadata: { modelId: job.modelId },
          parts: processedParts,
        }],
      });

      const res = await fetch(`/actions/send-message/${encodeURIComponent(job.conversationId)}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', accept: '*/*' },
        body,
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = (await res.text().catch(() => '')).slice(0, 500);
        // A bare HTML error means an edge proxy blocked us before the app saw
        // the request; these headers say which one.
        const forensics = ['server', 'via', 'cf-ray', 'retry-after']
          .map((h) => [h, res.headers.get(h)])
          .filter(([, v]) => v)
          .map(([h, v]) => `${h}=${v}`)
          .join(' ');
        throw new Error(
          `aipass returned ${res.status} ${res.statusText} [${body.length} bytes]` +
          `${forensics ? ` {${forensics}}` : ''}${detail ? ` — ${detail}` : ''}`
        );
      }

      let reader = res.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      let finishReason = 'stop';
      const toolNames = new Map();
      const sources = [];
      const seenUnknown = new Set();
      // The generation runs on the server, so losing the socket does not stop
      // it — the answer is produced and nobody is listening. The app exposes the
      // same reattach the Vercel AI SDK calls reconnectToStream, and this uses
      // it: a broken read resumes rather than failing a job already being paid
      // for. Deliberately narrow — see resume() for why it only fires before any
      // content has been sent on.
      let resumes = 0;
      const resume = async () => {
        // Only before the first content frame. After that a replay would arrive
        // as a second copy of the answer, which is worse than the failure.
        if (emitted > 0 || resumes >= 2) return false;
        resumes++;
        try {
          const again = await fetch(`/actions/resume-stream/${encodeURIComponent(job.conversationId)}`, {
            credentials: 'include', headers: { accept: '*/*' }, signal: controller.signal,
          });
          if (!again.ok || !again.body) return false;
          reader = again.body.getReader();
          push('status', `[stream] reattached after losing the connection (${resumes})`);
          return true;
        } catch { return false; }
      };

      for (;;) {
        let value, done;
        try {
          ({ value, done } = await reader.read());
        } catch (err) {
          if (controller.signal.aborted) throw err;
          if (await resume()) continue;
          throw err;
        }
        if (done) break;
        pending += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line.
        let cut;
        while ((cut = pending.search(/\r?\n\r?\n/)) !== -1) {
          const frame = pending.slice(0, cut);
          pending = pending.slice(cut + pending.slice(cut).match(/^\r?\n\r?\n/)[0].length);

          const data = frame
            .split(/\r?\n/)
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).trim())
            .join('\n');
          if (!data || data === '[DONE]') continue;

          let evt;
          try { evt = JSON.parse(data); } catch { continue; }

          // Server-side tools (web_search, media generation) run upstream and
          // stream their progress here. Dropping these frames silently makes a
          // long search look like a hang.
          switch (evt.type) {
            case 'text-delta':
              push('text', evt.delta);
              break;
            case 'reasoning-delta':
              push('reasoning', evt.delta ?? evt.text);
              break;
            case 'tool-input-start':
              toolNames.set(evt.toolCallId, evt.toolName);
              break;
            case 'tool-input-available':
              toolNames.set(evt.toolCallId, evt.toolName);
              push('status', `[${evt.toolName}] ${JSON.stringify(evt.input ?? {})}`);
              break;
            case 'tool-output-available': {
              const name = toolNames.get(evt.toolCallId) ?? 'tool';
              const size = typeof evt.output === 'string' ? evt.output.length : JSON.stringify(evt.output ?? '').length;
              push('status', `[${name}] returned ${size} chars`);
              break;
            }
            // Generated media — an image, a video, a music clip — all arrive as
            // a file part. Its URL is usually same-origin and needs the session
            // cookie, which only this page has, so it is fetched here and handed
            // back as a data URI. Anything already absolute, or too big to
            // carry, goes back as a plain URL instead.
            case 'file': {
              const d = evt.data ?? {};
              // Music comes back with `url`; video has no `url` at all, only
              // `snapshotUrl` beside `storageKey` and `filename`. Reading just
              // `url` dropped every generated video on the floor.
              const url = evt.url ?? evt.snapshotUrl ?? d.url ?? d.snapshotUrl ?? '';
              if (!url) break;
              const mediaType = evt.mediaType ?? d.mediaType ?? '';
              const filename = evt.filename ?? d.filename ?? '';
              // The kind decides how the client renders it: an mp4 in an image
              // tag is a broken image, not a video.
              const kind = mediaKind(mediaType) || (/^data:/i.test(url) ? mediaKind(url.slice(5)) : '') || 'file';
              if (/^data:/i.test(url)) { push(kind, url, filename); break; }
              // Say what arrived before any fetching. A generation takes about a
              // minute, and this is the first sign the caller gets that it
              // produced something.
              push('status', `[${kind}] ${mediaType || 'unknown type'}`);
              let carried = '';
              if (!/^https?:\/\//i.test(url) || url.startsWith(location.origin)) {
                try {
                  const r = await fetch(url, { credentials: 'include', signal: controller.signal });
                  const blob = await r.blob();
                  const cap = INLINE_CAP[kind] ?? INLINE_CAP.file;
                  push('status', `[${kind}] ${(blob.size / 1048576).toFixed(2)} MB`);
                  if (blob.size <= cap) {
                    carried = await new Promise((resolve, reject) => {
                      const fr = new FileReader();
                      fr.onload = () => resolve(String(fr.result));
                      fr.onerror = () => reject(fr.error);
                      fr.readAsDataURL(blob);
                    });
                  } else {
                    // This branch is same-origin only, so the link it falls back
                    // to does need the session cookie. Say so.
                    push('status', `[${kind}] over the ${(cap / 1048576).toFixed(0)} MB inline limit — sending the link, which needs a logged-in browser`);
                  }
                } catch (err) {
                  push('status', `[${kind}] could not read it here (${err?.message ?? err}), sending the link`);
                }
              }
              push(kind, carried || new URL(url, location.origin).href, filename);
              break;
            }
            case 'source-url':
              if (evt.url && !sources.some((x) => x.url === evt.url)) sources.push({ url: evt.url, title: evt.title });
              break;
            // The search itself reports its results on one frame carrying every
            // link at once. Without this the frame fell through to the unknown
            // handler, which printed its whole JSON body into the answer — and
            // sonar, which sends only this frame and no source-url, listed its
            // sources with blank titles.
            case 'data-web_search_results': {
              for (const link of evt.data?.links ?? evt.links ?? []) {
                if (!link?.url) continue;
                const found = sources.find((x) => x.url === link.url);
                if (found) found.title ??= link.title;
                else sources.push({ url: link.url, title: link.title, domain: link.domain });
              }
              break;
            }
            case 'error':
              throw new Error(evt.errorText ?? evt.message ?? 'stream error');
            case 'finish':
              finishReason = evt.finishReason ?? finishReason;
              break;
            default:
              // Known-boring frames carry no content. Anything else is either a
              // protocol change or a shape we have never seen — say so once,
              // rather than returning an empty answer and no clue why.
              if (!QUIET_FRAMES.has(evt.type) && !seenUnknown.has(evt.type)) {
                seenUnknown.add(evt.type);
                push('status', `[frame] unhandled "${evt.type}" — ${JSON.stringify(evt).slice(0, 300)}`);
              }
              break;
          }
        }
      }

      if (sources.length) {
        push('status', `sources:\n${sources.map((x) => {
          const label = x.title || x.domain || new URL(x.url, location.origin).hostname;
          return `  - ${label} ${x.url}`;
        }).join('\n')}`);
      }
      flush();
      reply({ jobId: job.jobId, kind: 'done', finishReason });
    } catch (err) {
      flush();
      if (err?.name === 'AbortError') reply({ jobId: job.jobId, kind: 'done', finishReason: 'stop' });
      else reply({ jobId: job.jobId, kind: 'error', message: String(err?.message ?? err) });
    } finally {
      clearInterval(ticker);
      inflight.delete(job.jobId);
    }
  }

  // Video is a different protocol from everything else here. Chat, images and
  // music stream back from /actions/send-message; video is submitted as a job
  // to /actions/video-generation, then polled until it reports completed. The
  // web client does exactly this, and there is no streaming variant of it.
  async function runVideo(job) {
    const controller = new AbortController();
    inflight.set(job.jobId, controller);
    const buffer = [];
    const push = (kind, text, filename) => { if (text) buffer.push({ kind, text, ...(filename ? { filename } : {}) }); };
    const flush = () => { if (buffer.length) { reply({ jobId: job.jobId, kind: 'chunk', parts: buffer.splice(0) }); } };
    let jobId = '';
    try {
      const body = {
        conversationId: job.conversationId,
        prompt: job.text,
        provider: job.provider,
        modelId: job.modelId,
        // Only what the caller actually set. The app omits each of these the
        // same way rather than sending a default of its own.
        ...(job.aspectRatio ? { aspectRatio: job.aspectRatio } : {}),
        ...(job.stylePreprompt ? { stylePreprompt: job.stylePreprompt } : {}),
        ...(job.resolution ? { resolution: job.resolution } : {}),
        ...(job.duration !== undefined ? { duration: job.duration } : {}),
        ...(job.cameraFixed !== undefined ? { cameraFixed: job.cameraFixed } : {}),
        ...(job.generateAudio !== undefined ? { generateAudio: job.generateAudio } : {}),
      };
      const res = await fetch('/actions/video-generation', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = (await res.text().catch(() => '')).slice(0, 500);
        // The route validates the body as a whole and says only "Invalid
        // request body", so name the fields that were sent — the offender is
        // one of them, and otherwise there is nothing to go on.
        const sent = Object.entries(body)
          .filter(([k]) => k !== 'prompt')
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(' ');
        throw new Error(`video-generation returned ${res.status}: ${detail} — sent ${sent}`);
      }
      const started = await res.json();
      if (started?.error) throw new Error(String(started.error));
      jobId = started?.jobId;
      if (!jobId) throw new Error('video-generation returned no jobId');
      // The model can be switched server-side when the requested one is busy.
      if (started.autoSwitched && started.modelId) {
        push('status', `[video] switched to ${started.modelId}`);
      }
      push('status', `[video] job ${jobId} accepted`);
      flush();

      const url = `/actions/video-generation?conversationId=${encodeURIComponent(job.conversationId)}&jobId=${encodeURIComponent(jobId)}`;
      let lastProgress = -1;
      for (;;) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (controller.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        const poll = await fetch(url, { credentials: 'include', signal: controller.signal });
        if (!poll.ok) throw new Error(`polling returned ${poll.status}`);
        const state = await poll.json();
        // Progress is not monotonic and can be absent; only say something when
        // it actually moves, or the caller gets a status line every two seconds.
        if (typeof state.progress === 'number' && state.progress !== lastProgress) {
          lastProgress = state.progress;
          push('status', `[video] ${state.progress}%`);
          flush();
        }
        if (state.status === 'completed') {
          const videoUrl = state.videoUrl ?? state.url;
          if (!videoUrl) throw new Error('the job completed without a video url');
          push('video', videoUrl, `${jobId}.mp4`);
          flush();
          reply({ jobId: job.jobId, kind: 'done', finishReason: 'stop' });
          return;
        }
        if (state.status === 'failed' || state.error) {
          const code = String(state.error ?? 'video generation failed');
          // The codes are terse and the web UI expands them in Thai. A caller in
          // a terminal gets neither, so the actionable part is spelled out here.
          throw new Error(`${code}${VIDEO_ERROR_HINTS[code] ? ` — ${VIDEO_ERROR_HINTS[code]}` : ''}`);
        }
      }
    } catch (err) {
      // A job left running keeps burning the account's video quota, so cancel
      // it on the way out rather than abandoning it.
      if (jobId) {
        fetch('/actions/video-generation', {
          method: 'POST', credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ _action: 'cancel', conversationId: job.conversationId, jobId }),
        }).then((r) => r.body?.cancel()).catch(() => {});
      }
      if (err?.name === 'AbortError') reply({ jobId: job.jobId, kind: 'done', finishReason: 'stop' });
      else reply({ jobId: job.jobId, kind: 'error', message: String(err?.message ?? err) });
    } finally {
      inflight.delete(job.jobId);
    }
  }

  // Creating a custom assistant, the way /ai-assistant/new does it: a draft is
  // minted first, patched with the fields, then confirmed. The path and the
  // intents are fixed here rather than taken from the job — the bridge can ask
  // for an assistant, it cannot ask this page to post anywhere it likes.
  const ASSISTANT_ACTION = '/actions/ai-assistant-actions';
  const ASSISTANT_START_CHAT = '/actions/ai-assistant-start-chat';
  // `delete` is here so a mistake can be cleaned up from the CLI that made it.
  // pin, unpin, track-usage and deleteFile exist upstream and are deliberately
  // left out until something needs them.
  const ASSISTANT_INTENTS = new Set(['createDraft', 'patchAssistant', 'confirmAssistant', 'delete']);

  async function postAssistant(fields, signal) {
    if (!ASSISTANT_INTENTS.has(fields.intent)) throw new Error(`refusing intent: ${fields.intent}`);
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined || v === null) continue;
      // `tag` repeats rather than being a list, the same as the form does it.
      if (Array.isArray(v)) v.forEach((one) => form.append(k, String(one)));
      else form.append(k, String(v));
    }
    const res = await fetch(ASSISTANT_ACTION, {
      method: 'POST', credentials: 'include', body: form, signal,
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* the route can answer with a redirect body */ }
    if (!res.ok) throw new Error(`${fields.intent} returned ${res.status}: ${text.slice(0, 300)}`);
    if (data?.error) throw new Error(`${fields.intent}: ${JSON.stringify(data.error).slice(0, 300)}`);
    return data ?? {};
  }

  // Starting a bound chat is its own route and takes one field. It is what
  // removes copying a conversation id out of the address bar.
  async function startAssistantChat(assistantId, signal) {
    const form = new FormData();
    form.append('aiAssistantId', assistantId);
    const res = await fetch(ASSISTANT_START_CHAT, { method: 'POST', credentials: 'include', body: form, signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`start-chat returned ${res.status}: ${text.slice(0, 300)}`);
    let data = null;
    try { data = JSON.parse(text); } catch { /* may answer with a redirect body */ }
    // The id can arrive under several names, or only inside a redirect target.
    const id = data?.conversationId ?? data?.id ?? data?.conversation?.id
      ?? (text.match(/\/chat\/([A-Za-z0-9]{8,})/) ?? [])[1];
    if (!id) throw new Error(`start-chat returned no conversation: ${text.slice(0, 300)}`);
    return id;
  }

  async function runAssistant(job) {
    const controller = new AbortController();
    inflight.set(job.jobId, controller);
    try {
      if (job.op === 'start-chat') {
        const conversationId = await startAssistantChat(job.assistantId, controller.signal);
        return void reply({ jobId: job.jobId, kind: 'assistant', assistantId: job.assistantId, conversationId });
      }
      if (job.op === 'delete') {
        await postAssistant({ intent: 'delete', assistantId: job.assistantId }, controller.signal);
        return void reply({ jobId: job.jobId, kind: 'assistant', assistantId: job.assistantId, deleted: true });
      }
      const draft = await postAssistant({ intent: 'createDraft' }, controller.signal);
      const assistantId = draft.assistantId ?? draft.id ?? draft.data?.assistantId;
      if (!assistantId) throw new Error(`createDraft returned no assistantId: ${JSON.stringify(draft).slice(0, 300)}`);

      await postAssistant({
        intent: 'patchAssistant',
        assistantId,
        assistantName: job.name,
        detail: job.detail,
        character: job.character,
        type: job.type,
        model: job.model,
        tag: job.tags,
      }, controller.signal);

      const confirmed = await postAssistant({ intent: 'confirmAssistant', assistantId }, controller.signal);
      reply({ jobId: job.jobId, kind: 'assistant', assistantId, raw: JSON.stringify(confirmed).slice(0, 2000) });
    } catch (err) {
      reply({ jobId: job.jobId, kind: 'assistant', message: String(err?.message ?? err) });
    } finally {
      inflight.delete(job.jobId);
    }
  }

  window.addEventListener('message', (event) => {
    if (window.__aipassBridgeGen !== GEN) return; // superseded by a newer injection
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg[TAG] === 'req') {
      const fn = msg.job.kind === 'loader' ? runLoader
        : msg.job.kind === 'create' ? runCreate
        : msg.job.kind === 'video' ? runVideo
        : msg.job.kind === 'assistant' ? runAssistant
        : run;
      fn(msg.job);
    }
    else if (msg[TAG] === 'abort') inflight.get(msg.jobId)?.abort();
  });

  reply({ kind: 'page-ready' });
})();
