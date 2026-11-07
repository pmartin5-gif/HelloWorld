import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import lightboard as board


ORIGINAL = '''// Pins and faces must stay untouched.\r
void effect1(unsigned long now) { }\r
void restState(unsigned long now) {\r
  const char *s = "} // not a comment";\r
  const char *r = R"tag({ raw braces })tag";\r
  /* } */ auto draw = []() { };\r
}\r
void setup() { /* keep this */ }\r
'''
CANDIDATE = 'void restState(unsigned long now) { display.fillScreen(0); }'


class BoundaryTests(unittest.TestCase):
    def test_nested_braces_comments_strings_raw_literals_and_crlf(self):
        start, end = board.function_span(ORIGINAL)
        changed = board.compose(ORIGINAL, CANDIDATE)
        self.assertEqual(changed, ORIGINAL[:start] + CANDIDATE + ORIGINAL[end:])
        self.assertEqual(board.protected_hash(changed), board.protected_hash(ORIGINAL))

    def test_other_definitions_directives_and_ambiguous_functions_rejected(self):
        for candidate in [CANDIDATE + '\nvoid setup() {}',
                          '#include <WiFi.h>\n' + CANDIDATE,
                          CANDIDATE + '\n' + CANDIDATE,
                          'void restState(unsigned long now) {']:
            with self.subTest(candidate=candidate), self.assertRaises(ValueError):
                board.validate_function(candidate)

    def test_runtime_changes_rejected_but_harmless_literals_allowed(self):
        for call in ['delay(100);', 'display.showBuffer();',
                     'timerAlarmWrite(timer, 1, true);', 'while(true) {}',
                     'Serial.println("hello");', 'pinMode(16, OUTPUT);']:
            with self.subTest(call=call), self.assertRaises(ValueError):
                board.validate_function('void restState(unsigned long now) {' + call + '}')
        board.validate_function('void restState(unsigned long now) { const char *s="delay(10)"; }')


class DeliveryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.sketch = self.root / 'Sketch.ino'
        self.sketch.write_bytes(ORIGINAL.encode())
        self.state = self.root / 'state.json'
        board.save_json(self.state, {
            'source_sha256': board.sha(ORIGINAL.encode()),
            'protected_sha256': board.protected_hash(ORIGINAL),
            'source_archive': str(self.sketch),
            'build': '/previous-build'
        })
        self.config = {'sketch': str(self.sketch)}
        for name, value in [('ROOT', self.root), ('STATE', self.state)]:
            p = patch.object(board, name, value)
            p.start()
            self.addCleanup(p.stop)

    def deploy(self):
        with contextlib.redirect_stdout(io.StringIO()):
            board.deploy(self.config, CANDIDATE, 'A test prompt', 'Test')

    def test_compile_failure_never_changes_source_or_uploads(self):
        with patch.object(board, 'discover', return_value='/dev/test'), \
             patch.object(board, 'compile_source', side_effect=RuntimeError('compile failed')), \
             patch.object(board, 'upload') as upload:
            with self.assertRaises(RuntimeError):
                self.deploy()
            upload.assert_not_called()
        self.assertEqual(self.sketch.read_bytes(), ORIGINAL.encode())

    def test_upload_failure_restores_source_and_uploads_recovery(self):
        with patch.object(board, 'discover', return_value='/dev/reconnected'), \
             patch.object(board, 'compile_source', return_value='/new-build'), \
             patch.object(board, 'upload', side_effect=[RuntimeError('upload failed'), None]) as upload:
            with self.assertRaisesRegex(RuntimeError, 'previous firmware uploaded successfully'):
                self.deploy()
            self.assertEqual(upload.call_count, 2)
            self.assertEqual(upload.call_args.args[1], '/previous-build')
        self.assertEqual(self.sketch.read_bytes(), ORIGINAL.encode())

    def test_success_rediscovers_port_and_preserves_protected_bytes(self):
        with patch.object(board, 'discover', side_effect=['/dev/old', '/dev/new']), \
             patch.object(board, 'compile_source', return_value='/new-build'), \
             patch.object(board, 'upload') as upload:
            self.deploy()
            self.assertEqual(upload.call_args.args[2], '/dev/new')
        self.assertEqual(board.protected_hash(self.sketch.read_bytes().decode()),
                         board.protected_hash(ORIGINAL))
        state = json.loads(self.state.read_text())
        self.assertEqual(state['build'], '/new-build')
        self.assertEqual(state['source_sha256'], board.sha(self.sketch.read_bytes()))

    def test_external_edits_stop_deployment(self):
        self.sketch.write_bytes((ORIGINAL + '// outside edit').encode())
        with patch.object(board, 'compile_source') as compile_source:
            with self.assertRaisesRegex(RuntimeError, 'outside restState changed'):
                self.deploy()
            compile_source.assert_not_called()

    def test_disconnected_board_never_changes_source(self):
        with patch.object(board, 'discover', side_effect=RuntimeError('disconnected')), \
             patch.object(board, 'compile_source') as compile_source:
            with self.assertRaises(RuntimeError):
                self.deploy()
            compile_source.assert_not_called()
        self.assertEqual(self.sketch.read_bytes(), ORIGINAL.encode())

    def test_device_identity_not_fixed_port(self):
        config = {'arduino_cli': 'cli', 'arduino_config': 'config',
                  'usb_identity': {'vid': '0x10c4', 'pid': '0xea60', 'serialNumber': '0001'}}
        inventory = {'detected_ports': [
            {'port': {'protocol': 'serial', 'address': '/dev/wrong', 'properties': {'vid': 'other'}}},
            {'port': {'protocol': 'serial', 'address': '/dev/new-name',
                      'properties': {'vid': '0x10C4', 'pid': '0xEA60', 'serialNumber': '0001'}}}
        ]}
        with patch.object(board.subprocess, 'run') as run:
            run.return_value.stdout = json.dumps(inventory)
            self.assertEqual(board.discover(config), '/dev/new-name')
            inventory['detected_ports'].append(inventory['detected_ports'][1])
            run.return_value.stdout = json.dumps(inventory)
            with self.assertRaises(RuntimeError):
                board.discover(config)

    def test_ide_prepare_complete_and_pending_guard(self):
        self.config['upload_backend'] = 'arduino-ide'
        with patch.object(board, 'discover', return_value='/dev/new'), \
             patch.object(board, 'compile_source') as compile_source, \
             patch.object(board, 'upload') as upload:
            self.deploy()
            upload.assert_not_called()
            compile_source.assert_not_called()
            self.assertTrue(board.pending_path().exists())
            with self.assertRaisesRegex(RuntimeError, 'pending IDE upload'):
                self.deploy()
        log = self.root / 'observed.log'
        log.write_text('Compiling...')
        with self.assertRaisesRegex(RuntimeError, 'lacks successful flash'):
            board.complete_ide(self.config, log)
        self.assertTrue(board.pending_path().exists())
        log.write_text('Hash of data verified.\nHard resetting via RTS pin...\n')
        with contextlib.redirect_stdout(io.StringIO()), \
             patch.object(board, 'archive_ide_firmware', return_value='/ide-firmware'):
            board.complete_ide(self.config, log)
        self.assertFalse(board.pending_path().exists())
        self.assertEqual(board.read_json(self.state)['build'], '/ide-firmware')

    def test_ide_abort_restores_source(self):
        self.config['upload_backend'] = 'arduino-ide'
        with patch.object(board, 'discover', return_value='/dev/new'), \
             patch.object(board, 'compile_source', return_value='/new-build'):
            self.deploy()
        with contextlib.redirect_stdout(io.StringIO()):
            board.abort_ide(self.config)
        self.assertEqual(self.sketch.read_bytes(), ORIGINAL.encode())
        self.assertFalse(board.pending_path().exists())

    def test_cli_build_cache_is_reused_but_firmware_archives_are_separate(self):
        sketch_dir=self.root/'Working'
        sketch_dir.mkdir()
        self.sketch=sketch_dir/'Working.ino'
        self.sketch.write_text(ORIGINAL)
        self.config.update(sketch=str(self.sketch),fqbn='esp32:esp32:esp32')
        calls=[]
        def compiler(config,args,log):
            calls.append(args)
            output=Path(args[args.index('--output-dir')+1])
            output.mkdir(parents=True)
            (output/'Working.ino.bin').write_bytes(b'firmware'+str(len(calls)).encode())
        with patch.object(board,'run_cli',side_effect=compiler):
            first=board.compile_source(self.config,ORIGINAL.encode(),board.new_run())
            second=board.compile_source(self.config,CANDIDATE.encode(),board.new_run())
        self.assertNotEqual(first,second)
        self.assertEqual(calls[0][calls[0].index('--build-path')+1],
                         calls[1][calls[1].index('--build-path')+1])
        self.assertEqual(Path(first,'Working.ino.bin').read_bytes(),b'firmware1')

    def test_archive_ide_firmware_validates_source_and_preserves_snapshot(self):
        build=self.root/'ide-cache'
        (build/'sketch').mkdir(parents=True)
        self.config.update(ide_build=str(build),fqbn='esp32:esp32:esp32')
        board.save_json(build/'build.options.json',{
            'sketchLocation':str(self.sketch.parent),'fqbn':'esp32:esp32:esp32:CPUFreq=240'})
        generated=build/'sketch'/'Sketch.ino.cpp'
        generated.write_text('#include <Arduino.h>\n'+CANDIDATE)
        for name in ['Sketch.ino.bin','Sketch.ino.bootloader.bin','Sketch.ino.partitions.bin']:
            (build/name).write_bytes(b'123')
        run=board.new_run()
        output=board.archive_ide_firmware(self.config,CANDIDATE.encode(),run,
                                        'Wrote 3 bytes at 0x00010000')
        (build/'Sketch.ino.bin').write_bytes(b'changed')
        self.assertEqual(Path(output,'Sketch.ino.bin').read_bytes(),b'123')
        generated.write_text('void restState(unsigned long now) {wrong();}')
        with self.assertRaisesRegex(RuntimeError,'different restState'):
            board.archive_ide_firmware(self.config,CANDIDATE.encode(),run,'Wrote 3 bytes at 0x00010000')

    def test_ide_compile_failure_can_restore_without_upload_or_second_compile(self):
        self.config['upload_backend']='arduino-ide'
        with patch.object(board,'discover',return_value='/dev/new'), \
             patch.object(board,'compile_source') as compile_source, \
             patch.object(board,'upload') as upload:
            self.deploy()
            # IDE has rejected the candidate: no success log, no flash.
            log=self.root/'failed.log'
            log.write_text('Compilation error: expected semicolon')
            with self.assertRaises(RuntimeError): board.complete_ide(self.config,log)
            with contextlib.redirect_stdout(io.StringIO()): board.abort_ide(self.config)
            compile_source.assert_not_called()
            upload.assert_not_called()
        self.assertEqual(self.sketch.read_bytes(),ORIGINAL.encode())

    def test_unchanged_upload_preserves_previous_animation_pointer(self):
        state=board.read_json(self.state)
        state['previous_source_archive']='/previous-animation.ino'
        board.finish_state(state,ORIGINAL.encode(),'/new-build',self.root)
        self.assertEqual(board.read_json(self.state)['previous_source_archive'],
                         '/previous-animation.ino')


if __name__ == '__main__':
    unittest.main()
