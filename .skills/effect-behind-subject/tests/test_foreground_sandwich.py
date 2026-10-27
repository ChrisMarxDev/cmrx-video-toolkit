import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import foreground_sandwich


class Completed:
    def __init__(self, payload):
        self.stdout = json.dumps(payload)


def media(duration="4.0", width=1920, height=1080, rate="30/1", pixel_format="yuv420p"):
    return {"streams": [{"codec_type": "video", "duration": duration, "width": width,
                         "height": height, "r_frame_rate": rate, "pix_fmt": pixel_format}]}


class ForegroundSandwichTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name) / "base.mp4"
        self.cutout = Path(self.temp.name) / "cutout.mov"
        self.base.touch()
        self.cutout.touch()

    def runner(self, payloads):
        items = iter(payloads)
        return lambda *_args, **_kwargs: Completed(next(items))

    def test_ready_alpha_cutout_with_dimension_warning(self):
        result = foreground_sandwich.inspect_pair(
            self.base,
            self.cutout,
            run=self.runner([media(), media(width=810, height=456, pixel_format="yuva444p10le")]),
        )
        self.assertTrue(result["ready"])
        self.assertTrue(result["cutout"]["has_alpha"])
        self.assertEqual(result["layer_order"], ["base clip", "content", "alpha cutout"])
        self.assertTrue(result["warnings"])

    def test_rejects_opaque_or_misaligned_cutout(self):
        result = foreground_sandwich.inspect_pair(
            self.base,
            self.cutout,
            tolerance=0.05,
            run=self.runner([media(), media(duration="4.3")]),
        )
        self.assertFalse(result["ready"])
        self.assertEqual(len(result["errors"]), 2)

    def test_accepts_alpha_mode_tag(self):
        tagged = media()
        tagged["streams"][0]["tags"] = {"alpha_mode": "1"}
        result = foreground_sandwich.inspect_pair(self.base, self.cutout, run=self.runner([media(), tagged]))
        self.assertTrue(result["ready"])

    def test_missing_input_is_reported_before_ffprobe(self):
        with self.assertRaisesRegex(ValueError, "does not exist"):
            foreground_sandwich.inspect_pair(self.base, self.cutout.with_name("missing.mov"))


if __name__ == "__main__":
    unittest.main()
