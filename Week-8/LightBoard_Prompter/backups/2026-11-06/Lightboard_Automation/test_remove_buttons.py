import contextlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import lightboard as board
import remove_buttons as migration


BASELINE = Path(__file__).parent / "history/20261105-201539-651042/after.ino"


class ButtonRemovalTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.sketch = self.root / "Sketch.ino"
        self.original = BASELINE.read_bytes()
        self.sketch.write_bytes(self.original)
        self.state = {"source_sha256": board.sha(self.original),
                      "protected_sha256": board.protected_hash(self.original.decode()),
                      "source_archive": str(BASELINE), "build": "/old-firmware",
                      "previous_source_archive": "/previous-animation.ino"}
        self.config = {"sketch": str(self.sketch), "upload_backend": "arduino-ide",
                       "ide_build": str(self.root / "build")}
        for name, value in [("ROOT", self.root), ("STATE", self.root / "state.json")]:
            patcher = patch.object(board, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        board.save_json(board.STATE, self.state)

    def test_removal_preserves_animation_and_display_foundation(self):
        source = self.original.decode()
        updated = migration.candidate(source).decode()
        a, b = board.function_span(source)
        c, d = board.function_span(updated)
        self.assertEqual(source[a:b], updated[c:d])
        self.assertEqual(source.split("// ------------------------- Buttons")[0],
                         updated.split("// ------------------------- Animation timing")[0])
        for token in ["buttonPin", "digitalRead", "DEBOUNCE", "currentScene", "effect1", "effect2"]:
            self.assertNotIn(token, board.mask_cpp(updated))
        altered = source.replace("display.display(10)", "display.display(11)")
        with self.assertRaisesRegex(RuntimeError, "reviewed original"):
            migration.candidate(altered)
        with self.assertRaisesRegex(RuntimeError, "reviewed original"):
            migration.candidate(updated)

    def prepare(self):
        with patch.object(board, "discover", return_value="/dev/test"), \
             patch.object(board, "compile_source") as compile_source, \
             patch.object(board, "upload") as upload, contextlib.redirect_stdout(io.StringIO()):
            migration.prepare(self.config)
            compile_source.assert_not_called()
            upload.assert_not_called()

    def test_prepare_abort_preserves_checkpoint_and_previous_animation(self):
        self.prepare()
        self.assertEqual(board.read_json(board.STATE), self.state)
        with contextlib.redirect_stdout(io.StringIO()):
            board.abort_ide(self.config)
        self.assertEqual(self.sketch.read_bytes(), self.original)
        self.assertEqual(board.read_json(board.STATE), self.state)

    def test_completion_requires_new_compiled_foundation_and_preserves_restore(self):
        self.prepare()
        updated = self.sketch.read_bytes()
        generated = Path(self.config["ide_build"]) / "sketch/Sketch.ino.cpp"
        generated.parent.mkdir(parents=True)
        generated.write_bytes(self.original)  # Same restState, obsolete buttons.
        log = self.root / "observed.log"
        log.write_text("Hash of data verified.\nHard resetting via RTS pin...\n")
        with self.assertRaisesRegex(RuntimeError, "different foundation"):
            migration.complete(self.config, log)
        self.assertEqual(board.read_json(board.STATE), self.state)
        generated.write_text('#include <Arduino.h>\n#line 1 "Sketch.ino"\n'
                             'void restState(unsigned long now);\nvoid setup();\nvoid loop();\n'
                             + updated.decode())
        with patch.object(board, "archive_ide_firmware", return_value="/new-firmware"), \
             contextlib.redirect_stdout(io.StringIO()):
            migration.complete(self.config, log)
        state, source = board.load_checked(self.config)
        self.assertEqual(source, updated)
        self.assertEqual(state["previous_source_archive"], "/previous-animation.ino")
        self.assertFalse(board.pending_path().exists())
        # Routine animation replacement still protects the new button-free foundation.
        replacement = board.compose(source.decode(), 'void restState(unsigned long now) { display.fillScreen(0); }')
        self.assertEqual(board.protected_hash(replacement), state["protected_sha256"])


if __name__ == "__main__":
    unittest.main()
