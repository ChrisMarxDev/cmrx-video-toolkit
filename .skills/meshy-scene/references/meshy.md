# Meshy tasks

Run `python3 /path/to/meshy-scene/scripts/meshy.py --help`. Commands work from an
asset workspace; request and receipt paths are explicit. This is a small REST
adapter, not an SDK or background service. It does not install Meshy's CLI/MCP.

## Generate and refine

Write a JSON request file, for example `preview-request.json`:

```json
{"mode":"preview","prompt":"A friendly humanoid robot with clearly separated arms and legs","pose_mode":"a-pose","should_remesh":true,"target_polycount":30000,"target_formats":["glb"]}
```

The provider default model is deliberately not hardcoded. Inspect current model
availability before generation; record an explicit `ai_model` if reproducibility
of the generation configuration matters. AI output itself is not deterministic.

```sh
python3 /path/to/meshy-scene/scripts/meshy.py submit text-to-3d --request preview-request.json --receipt preview.json
python3 /path/to/meshy-scene/scripts/meshy.py status --receipt preview.json --wait 60
```

Exit 0 means success, 2 means still pending, 1 means error/terminal failure. Repeat
`status`, never `submit`, to resume. Inspect the successful preview before refining.
Write `refine-request.json` using the accepted preview ID:

```json
{"mode":"refine","preview_task_id":"PREVIEW_TASK_ID","enable_pbr":true}
```

Submit it with the same `text-to-3d` kind and a new receipt. Text preview is
untextured; rig the successfully refined result, not the preview. `image-to-3d`
is also supported: use its documented `image_url` payload and verify texturing.
`remesh` accepts its documented payload when geometry needs reduction.

## Rig and animate

Use a textured humanoid with clear limbs, facing +Z. Keep below 300,000 faces as a
conservative rigging input target; a face-count check alone does not prove suitable
topology. The web app's quadruped and Smart Rig options are not promises about the
Rigging API. Static props need no rig.

```json
{"input_task_id":"REFINED_TASK_ID","height_meters":1.7}
```

Submit as `rigging`, then poll its receipt. For an external model use the API's
`model_url` (public HTTPS URL or supported data URI). Upload only authorized assets.
The rig result may already include walk/run clips; reuse them before buying another.

For a preset motion, obtain actual IDs from the current animation library; do not
guess an ID from its name. Submit as `animations`:

```json
{"rig_task_id":"RIG_TASK_ID","action_id":92}
```

`92` is the documentation's example ID, not a promised action name. Alternatively
use `action_ids` for multiple separate clips in one file. For prompted motion,
submit `text-to-motion` with `{"prompt":"a character waving","duration":3}`,
poll, then submit `animations` with `rig_task_id` and `motion_task_id`. The raw
Text to Motion FBX/BVH is not an animated character GLB. Retarget through the
Animation API (biped only) or an appropriate DCC tool before importing into Scene.

## Download

After success, download the GLB field appropriate to the task:

```sh
python3 /path/to/meshy-scene/scripts/meshy.py download --receipt animated.json --field result.animation_glb_url --output character.glb
```

Other field paths: `model_urls.glb` for generation/remesh;
`result.rigged_character_glb_url` for a rig;
`result.basic_animations.walking_glb_url` for the default skinned walk. Download the
character with its skin, not an armature-only file. Inspect the actual saved task
response when a field is absent rather than silently selecting a different asset.

Download refreshes the task first, checks the GLB container and refuses overwrite.
Expired assets must be handled explicitly; the helper never pays to regenerate.
Keep receipt files private: they contain requests and signed URLs, but never the
API key. Add license/account entitlement information separately before publishing.

## Failure and resumption

Each submit reserves a new receipt before its single POST. No paid POST is retried
automatically, including 429/5xx. If a response is lost, the receipt remains
`submission: unknown`. Look up the task in Meshy history; when positively matched,
add its `task_id` and set `submission: accepted`, then run `status`. Do not delete
the receipt and blindly resubmit. A definitive rejection can be corrected and
submitted with a new receipt after confirming no job exists.

Status failures preserve the prior receipt. Connection errors and HTTP codes are
reported without echoing secrets/URLs. Use the provider dashboard for detailed
rejection diagnostics. Polling waits are bounded; Ctrl-C stops local polling only.
No task cancellation or deletion is performed.

## Primary references

Verified 2026-10-26; consult these for current fields, costs and restrictions:

- [Text to 3D](https://docs.meshy.ai/en/api/text-to-3d)
- [Image to 3D](https://docs.meshy.ai/en/api/image-to-3d)
- [Remesh](https://docs.meshy.ai/en/api/remesh)
- [Rigging](https://docs.meshy.ai/en/api/rigging)
- [Animation and library](https://docs.meshy.ai/en/api/animation)
- [Text to Motion](https://docs.meshy.ai/en/api/text-to-motion)
- [Web rigging](https://docs.meshy.ai/en/webapp/guides/3d-model/rigging)
