# Exact-artifact acceptance

Record PASS, FAIL or NOT TESTED for each case, with candidate hash, app/runtime
versions, macOS version and CPU. Mock provider suites and signing checks are useful
but do not satisfy real account/GPU coverage. Use a fresh macOS account, clean test
Mac or equivalent environment with no developer toolchain/profile dependencies.
For the final run, download the actual release candidate in a browser; locally built
files alone do not exercise quarantine/Gatekeeper behavior. Do not strip quarantine
or disable system security to make the production acceptance pass.

| Flow | Required outcome |
| --- | --- |
| Install/open | Mount DMG, drag to Applications, eject, launch from Applications with no terminal; expected developer identity; no missing-runtime stack traces |
| Provider onboarding | Starts disconnected; Connect provisions the selected official engine, guides browser login, lists models and completes one real subscribed turn; no preinstalled CLI |
| Fresh workspace | Choose folder, cancel safely, then create workspace + visible project under projects/; shared assets/skills/instructions are in that workspace |
| Script-first | Start empty, collaborate on script.md, close/reopen with chat/context intact |
| Real import | User-approved original or synthetic test video, 20s excerpt where useful; preserve source quality, thumbnails, waveform and normal seeking |
| Arbitrary code | Agent authors a new Flutter/Dart graphic or shader with new source, adds it as a separate timeline layer, validates and renders; not a template switch |
| Single player | Graphics and footage appear together; timeline seeking, minor cuts, trims, audio and timed comment payloads work; no separate conflicting preview video |
| Export | Encoded duration/resolution/audio match manifest; decoded inspection verifies actual frames; clips remain editable after export |
| Agent lifecycle | Queue turns, cancel rendering, resolve/reopen a comment, switch project tabs during work; interrupt/relaunch does not silently repeat writes |
| Workspace portability | Open a copied/cloned workspace at a different path without caches/provider state; scripts, media, clips, comments, chats, skills and shared assets remain usable |
| Boundaries | Generated worker cannot read account files, edit originals or silently acquire network access; chosen macOS adapter has meaningful containment tests |
| Friends' environment | Native file dialogs, microphone/other permissions if used, GPU and offline/error paths behave on supported macOS/CPU; no Homebrew/SDK/Pub-cache assumptions |
| Real installed artifact | All above works from the signed installation with normal launch PATH, not from the repository or build shell |

Never use the user's normal credentials in automated fixtures. Real subscription
login is an explicit user action through the app; do independent offline tests while
waiting. Real publishing services are outside release acceptance unless separately
authorized: fixture MCP/HTTP connections suffice for testing the connection broker.

Retain redacted logs and selected frames/screenshots in the task cache; keep media
and private test reports outside public Git/release assets. Report any GPU, runtime
provisioning, unsupported CPU or minimum-OS limitation in release notes. Automatic
project Git sync and global creative libraries are not existing product features.
