---
name: fluvie-generative-ai
description: Generate images, video, music, speech or sound effects through Fluvie AI, or author a VideoSpec from a prompt; use only when generation is requested.
---

# Generative AI with Fluvie

Generation is optional. Distinguish creating media assets from asking a model to
write a composition/spec. [edit-video](../edit-video/SKILL.md) retains editorial
control; [fluvie-compose](../fluvie-compose/SKILL.md) integrates approved results.
Read [native generation](references/native-generation.md) for setup and caching.

Inspect resolved `fluvie` / `fluvie_ai` versions and their source/API before adding
imports. `fluvie_ai` is optional and is not installed by this skill. Keep compatible
versions; do not upgrade the shared toolkit as a side effect of producing a video.
Use the requested provider/model and explain missing credentials or unsupported
features. Generation may send prompts/media externally and incur charges; keep
execution within the user's authorized provider, content and budget. Never print
keys or put them in Dart compositions, browser builds, manifests or Git.

## Generated media

Use Fluvie's native generative widgets/resolver when the installed version supports
the requested operation. Resolve assets before frame capture, inspect results and
retain the actual selected files and provenance. Prompt/seed alone is not a promise
of reproducible provider output. Subsequent renders should use cached files and
offline mode; a cache miss should be reported rather than cause surprise generation.

The toolkit also has `tools/fal/README.md` for explicit provider queue/download
operations. Use it when that connector is chosen or needed; do not invoke both
paths for the same asset. Its local manifest can feed ordinary file-backed media.

## Prompt-authored compositions

`fluvie_ai` also provides `VideoAuthorService` / `VideoSpec` authoring, and supported
CLI versions offer `fluvie generate`. Consult local help and
https://docs.fluvie.dev/guides/ai-and-mcp/ for the installed API. Retain editable
spec/Dart output, validate it and inspect the result. A generated story is a draft,
not approved factual content, timing or style. Do not send a local composition to a
model merely to render it.

Hand off selected local assets or validated editable code/spec, provider/model,
prompt/settings, source provenance and known limits. Store production caches and
media outside software Git, even though upstream permits committing caches.
