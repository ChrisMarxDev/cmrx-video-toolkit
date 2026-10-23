# Video Render

Read flow/07-render/README.md. Check timeline revisions before rendering. Use
scripts/video.py render and qa; confirm local flags with --help. Confirm frame count,
duration, audio and transitions. Inspect actual frames and review audio where it
changed. Keep editable sources. Do not publish videos without explicit authorization.
The toolkit provides a local capture path; web/native GPU capabilities differ.

Use [fluvie-validate](../../fluvie-validate/SKILL.md) before export; reuse a passing
check if source and dependencies have not changed.

For framework-specific mechanics, read [fluvie-render](../../fluvie-render/SKILL.md).
