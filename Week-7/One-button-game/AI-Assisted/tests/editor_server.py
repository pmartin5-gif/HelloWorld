"""Socket-free HTTP handler checks; uses a disposable project copy."""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('editor_server', Path(__file__).parents[1] / 'editor_server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)

class ServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.previous_root = server.ROOT
        server.ROOT = Path(self.temp.name)
        (server.ROOT / 'Songs').mkdir()
        self.chart_path = server.ROOT / server.CHART
        self.chart_path.write_text(json.dumps(dict(audio='Songs/test.m4a',duration=5,notes=[1,2,3])))
        (server.ROOT/'Songs/easy.chart.json').write_text(json.dumps(dict(audio='Songs/easy.mp3',duration=10,notes=[])))
        (server.ROOT/'Songs/hard.chart.json').write_text(json.dumps(dict(audio='Songs/hard.mp3',duration=183.96,notes=[])))
        (server.ROOT/'Songs/catalog.json').write_text(json.dumps([dict(id='medium',chart=str(server.CHART)),dict(id='easy',chart='Songs/easy.chart.json'),dict(id='hard',chart='Songs/hard.chart.json')]))
    def tearDown(self):
        server.ROOT = self.previous_root
        self.temp.cleanup()
    def request(self, method, body=None, headers=None, song=None):
        handler = server.Handler.__new__(server.Handler)
        handler.server = SimpleNamespace(server_port=8000)
        handler.path = '/api/chart' + (f'?song={song}' if song else '')
        handler.headers = {'Host':'127.0.0.1:8000','Origin':'http://127.0.0.1:8000','Content-Type':'application/json'}
        payload=json.dumps(body).encode() if body is not None else b''
        handler.headers['Content-Length']=str(len(payload))
        handler.headers.update(headers or {})
        handler.rfile=io.BytesIO(payload); handler.wfile=io.BytesIO()
        codes=[]
        handler.send_response=lambda code:codes.append(code)
        handler.send_header=lambda *args:None
        handler.end_headers=lambda:None
        getattr(handler,'do_'+method)()
        return codes[0],json.loads(handler.wfile.getvalue())
    def test_save_and_conflict(self):
        code,data=self.request('GET'); self.assertEqual(code,200)
        original=self.chart_path.read_bytes()
        code,saved=self.request('POST',dict(revision=data['revision'],notes=[1.1,2.1]))
        self.assertEqual(code,200)
        self.assertEqual(json.loads(self.chart_path.read_bytes())['notes'],[1.1,2.1])
        backups=list((server.ROOT/'Songs/.chart-backups').glob('*.json'))
        self.assertEqual(len(backups),1); self.assertEqual(backups[0].read_bytes(),original)
        code,_=self.request('POST',dict(revision=data['revision'],notes=[1.2]))
        self.assertEqual(code,409)
        code,new=self.request('GET'); self.assertEqual(new['revision'],saved['revision'])
    def test_dense_notes_save_and_reload(self):
        _,data=self.request('GET')
        notes=[1,1.001,1.0011,1.001101]
        code,saved=self.request('POST',dict(revision=data['revision'],notes=notes))
        self.assertEqual(code,200)
        _,loaded=self.request('GET')
        self.assertEqual(loaded['chart']['notes'],notes)
        self.assertEqual(loaded['revision'],saved['revision'])
    def test_songs_are_saved_independently(self):
        original=self.chart_path.read_bytes()
        code,easy=self.request('GET',song='easy')
        self.assertEqual(code,200); self.assertEqual(easy['chart']['notes'],[])
        code,saved=self.request('POST',dict(revision=easy['revision'],notes=[1,1.001]),song='easy')
        self.assertEqual(code,200)
        self.assertEqual(saved['chart']['audio'],'Songs/easy.mp3')
        self.assertEqual(self.chart_path.read_bytes(),original)
        code,_=self.request('POST',dict(revision=easy['revision'],notes=[1]),song='../../other')
        self.assertEqual(code,400)
    def test_hard_save_preserves_other_songs(self):
        medium=self.chart_path.read_bytes()
        easy=(server.ROOT/'Songs/easy.chart.json').read_bytes()
        _,hard=self.request('GET',song='hard')
        code,saved=self.request('POST',dict(revision=hard['revision'],notes=[2,2.001,180]),song='hard')
        self.assertEqual(code,200)
        self.assertEqual(saved['chart']['audio'],'Songs/hard.mp3')
        self.assertEqual(saved['chart']['notes'],[2,2.001,180])
        self.assertEqual(self.chart_path.read_bytes(),medium)
        self.assertEqual((server.ROOT/'Songs/easy.chart.json').read_bytes(),easy)
    def test_invalid_and_foreign_requests_do_not_write(self):
        _,data=self.request('GET'); original=self.chart_path.read_bytes()
        for notes in [[],[1,1],[2,1],[-1],[9],[True],[float('nan')]]:
            code,_=self.request('POST',dict(revision=data['revision'],notes=notes))
            self.assertEqual(code,400)
        code,_=self.request('POST',dict(revision=data['revision'],notes=[1]),{'Origin':'https://example.com'})
        self.assertEqual(code,403)
        code,_=self.request('GET',headers={'Host':'example.com:8000'})
        self.assertEqual(code,403)
        self.assertEqual(self.chart_path.read_bytes(),original)
        self.assertFalse((server.ROOT/'Songs/.chart-backups').exists())

if __name__=='__main__': unittest.main()
