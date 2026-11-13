# Editing and execution contracts

## Document authority

`apps/local-editor/src/workspace.ts` is the sole document acceptance authority.
`operations.ts` defines the discriminated operations shared by HTTP, CLI, MCP and
app-agent tools. Existing single-operation HTTP routes remain compatible and
return the accepted project. They use the same dispatcher as the batch endpoint.
Whole-document replacement remains an explicit `project` operation.

`POST /api/operations` takes:

```json
{
  "revision": 7,
  "operationId": "scene-intro-1",
  "actor": "agent",
  "label": "Shorten the introduction",
  "operations": [
    {"type": "clip", "id": "presenter", "patch": {"duration": 3}},
    {"type": "clip", "id": "title", "patch": {"duration": 3}}
  ]
}
```

All 1–100 operations run on a copy and validate before one acceptance, revision
increment and undo step. A failed operation accepts nothing. A successful response
is `{project, receipt, replayed}`. The receipt records operation ID, actor, label,
base/resulting revision, timestamp and a request signature. Repeating an identical
request ID returns its receipt and the **current** project without editing again;
different input with that ID rejects. The most recent 500 receipts persist with
workspace state across restarts; older retries fail the monotonic revision check.
Context exposes the latest 20 receipts. Undo/redo also record receipts and support
retry IDs. Actor is diagnostic metadata, not an authorization identity.

Conflict errors include `code`, base/current revision where applicable and recovery
information. Keep external file edits: the watcher validates/reconciles them, but
revision equality is not filesystem cross-process compare-and-swap. Atomic batches
cover the document only, not Dart edits, imported media, plugins' host side effects,
or external services. Source history is separate from timeline undo.

Desktop exposes `editor_batch`; standalone MCP exposes `apply_editor_operations`;
the CLI accepts `batch FILE`. Both providers use the desktop tool contract. Reads,
selection and preview-only controls stay usable during agent work; structural
manual mutations retain the runtime lock.

## Media representations

`asset.path` remains the full-resolution **render input**. Compatible footage is
an exact copy; other imports may normalize codec, frame rate, orientation and HDR
color. `asset.media` v1 describes original and render representations with portable
paths, SHA-256 identities, dimensions, duration, frame rate, rotation and transfer.
Its mapping records resampling, baked orientation and HDR-to-SDR conversion.
`provenance.originalFile` remains supported. Legacy projects without `media` retain
their existing render path; absence does not imply the recording was unmodified.

`.editor/playback-proxies` is disposable monitoring media, not a document asset or
export input. Full-resolution export does not promise original-recording HDR,
codec or frame-rate preservation. Original-source export needs deliberate mapping;
never implement it by substituting a path.

## Render jobs

`apps/local-editor/src/render-contract.mjs` shares input identities, capture,
fingerprinting, job descriptors, status projection and cancellation requests.
FFmpeg and Flutter/Fluvie keep their separate execution engines and artifact formats.

Jobs record a v1 input manifest and engine identity. Inputs are copied (with
copy-on-write where supported) and byte-checked; rendering reads captured media,
not mutable project media. Desktop captures authored sources and records generated
harness/dispatcher identities in `input-manifest.json`. Semantic fingerprints omit
revision/comments, include media and source content plus engine/template identity,
and are computed from captured inputs. The desktop checks engine identity again
before accepting completion. Filesystem snapshots are not an OS-wide transaction:
concurrent changes detected during capture reject and require a retry.

Native worker access stays read-only for captured source/media. The Mac worker
uses snapshot media, not the live project's media folder. Old exports stay readable;
old preview receipts refresh once because they cannot prove the new identity.
Frequent UI/job-poll responses contain manifest summaries; full manifests remain
in job receipts and snapshot files. Snapshots consume disk; copy-on-write reduces physical copies where supported.

## Built-in extension contracts

`apps/local-editor/src/extensions.ts` validates API v1 and per-capability version 1:
`render` (boxes), `commands` (document command), `validation` (validateClip, throws
on invalid clips), and `inspection` (browser UI). Existing v1 manifests infer their
legacy capabilities. Duplicate extension IDs, clip-kind owners, command IDs,
unsupported versions and missing hooks reject before registration. Video and
Flutter graphics are reserved built-in kinds. Arbitrary Dart authoring and the
snapshot-generated graphics dispatcher remain independent of this extension seam.

These modules run **inside the service with host privileges**. This is a trusted
built-in/module contract, not a third-party isolation or installation system.

## Runtime and adapters

`project-runtime.mjs` is a pure projection: ownership, allowed actions and reasons
come from existing lifecycle owners. UI and `editor_context` receive that same
projection; mutation handlers enforce the relevant preconditions. Job projections
normalize legacy cancellation spellings while existing job payloads stay compatible.
There is no new global store.

The desktop's `document-service.mjs` owns editor transport and structured failures;
`media-routes.mjs` handles authenticated media transport and proxy status;
`provider-routes.mjs` owns provider HTTP orchestration; `render-service.mjs` reserves
manual exports and releases that reservation on success or failure. Media caches
and execution remain in their existing services. The HTTP server composes these
adapters rather than becoming another acceptance authority.
