# Native generative media

Verified against upstream documentation at commit
`10e442c1bb469118516df3335547f85ec92155e6` on 2026-10-23:
https://github.com/SimonErich/fluvie/blob/10e442c1bb469118516df3335547f85ec92155e6/documentation/guides/generative-media.md
Adapted under MIT; see ../LICENSE.txt. Check resolved package APIs before use.

The web-safe `package:fluvie_ai/fluvie_ai.dart` barrel provides GenerativeImage,
GenerativeVideo, GenerativeMusic, GenerativeSpeech and GenerativeSoundFx. Examples
include image factories flux/gemini/openai, video veo, music suno and speech/SFX
eleven. Availability and provider terms can change; verify the chosen provider.

Native generation uses `package:fluvie_ai/generative.dart` (dart:io). Create
`fluvieGenerativeResolverFor()` and supply it via the render's `generative:` argument
or the `generativeResolverProvider` override, according to the resolved API.
Without a resolver, live preview may show placeholders and capture fails. Do not
place native resolver imports or provider secrets in a Flutter web client.

Provider environment names documented upstream: GEMINI_API_KEY, OPENAI_API_KEY,
BFL_API_KEY, ELEVENLABS_API_KEY and SUNO_API_KEY (sunoapi.org). Supply only the
chosen provider's credentials through the environment or GenerativeConfig.

The resolver gathers sources before the frame loop, generates/downloads media and
stores file-backed results with JSON sidecars under `.fluvie/generative/`.
`FLUVIE_GENERATIVE_CACHE_DIR` selects another location. Cache identity includes
provider, model, prompt, options and seed. Preserve cache bytes and provenance;
provider regeneration is not guaranteed identical after deletion or model changes.

Use `FLUVIE_GENERATIVE_OFFLINE=1` for repeat exports: missing cached assets fail.
`GenerativeConfig.maxGenerations` limits generation count, not a monetary budget.
Keep this production cache external/ignored under toolkit storage policy.
Generated video can carry audio; use `withAudio: false` when it would duplicate
narration or conflict with the intended mix. Generated audio belongs on the same
edited-output clock as ordinary audio.
