# Video Render

Read flow/07-render/README.md. Check timeline revisions before rendering. Use
scripts/video.py render and qa; confirm local flags with --help. Confirm frame count,
duration, audio and transitions. Inspect actual frames and review audio where it
changed. Keep editable sources. Do not publish videos without explicit authorization.
The toolkit provides a local capture path; web/native GPU capabilities differ.

Use [fluvie-validate](../../fluvie-validate/SKILL.md) before export; reuse a passing
check if source and dependencies have not changed.

For framework-specific mechanics, read [fluvie-render](../../fluvie-render/SKILL.md).


`video.py render` writes a freshness receipt next to a successful export;
[targeted previews](../../../tools/media_evidence/README.md) use it to verify
actual render bytes, timeline and authored composition/custom-component inputs.
The independent `measure-media` tool and pipeline QA report loudness, true peak,
black and silent stretches as facts. These measurements do not approve creative
quality or replace human audiovisual review. Excerpt feedback uses local time;
map it through previews.json before revising the composition.
