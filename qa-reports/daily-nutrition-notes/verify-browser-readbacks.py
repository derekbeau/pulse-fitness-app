"""Compare literal isolated browser-fixture readbacks; never accesses a database."""
import json
from pathlib import Path

root = Path(__file__).resolve().parent
paths = sorted(root.glob('browser-readback-*.json'))
assert len(paths) == 6, len(paths)
reads = [json.loads(path.read_text()) for path in paths]
baseline = reads[0]
for path, read in zip(paths, reads):
    for key in ['preview', 'state', 'analytics', 'quality', 'integrity']:
        assert read[key] == baseline[key], (path.name, key)
    for table, rows in baseline['facts'].items():
        if table != 'nutrition_logs':
            assert read['facts'][table] == rows, (path.name, table)
    by_id = {row['id']: row for row in read['facts']['nutrition_logs']}
    for row in baseline['facts']['nutrition_logs']:
        actual = dict(by_id[row['id']])
        if row['user_id'] == 'fictional-notes-owner':
            actual['notes'] = row['notes']
        assert actual == row, (path.name, 'original log', row['id'])
    for day in ['2026-09-03', '2026-09-04']:
        energy = day + '/energy-adherence'
        assert read['api'][energy] == baseline['api'][energy], (path.name, energy)
        summary_path = day + '/summary'
        summary = dict(read['api'][summary_path])
        summary['notes'] = baseline['api'][summary_path]['notes']
        assert summary == baseline['api'][summary_path], (path.name, summary_path)
        detail = read['api'][day]
        note = detail['log']['notes'] if detail else None
        assert read['api'][summary_path]['notes'] == note
        context = read['api']['logging-context?date=' + day]
        assert context['today']['nutrition'] == detail
        assert context['today']['summary']['notes'] == note
        week = read['api']['week-summary?date=2026-09-03T12:00:00.000Z']
        indicator = next(row for row in week if row['date'] == day)
        assert indicator['hasNote'] == (note is not None)
        assert 'notes' not in indicator
    week_key = 'week-summary?date=2026-09-03T12:00:00.000Z'
    assert [{**row, 'hasNote': False} for row in read['api'][week_key]] == [{**row, 'hasNote': False} for row in baseline['api'][week_key]]
    print(path.name, 'PASS: meals/items/food usage/targets/weights/status/timestamps/energy/quality/analytics/preview identity and note-reader parity')
assert reads[2] == reads[1], 'Injected persistence failure must leave every captured fact unchanged'
assert reads[4]['api']['2026-09-03']['log']['notes'] is None
assert reads[4]['api']['2026-09-04']['log']['notes'] is None
empty_logs = [next(row for row in read['facts']['nutrition_logs'] if row['user_id'] == 'fictional-notes-owner' and row['date'] == '2026-09-04') for read in reads[3:]]
assert all({**row, 'notes': None} == {**empty_logs[0], 'notes': None} for row in empty_logs)
assert baseline['api']['2026-09-04/energy-adherence']['dataState'] == 'missing'
assert baseline['integrity']['foreignKeys'] == []
assert baseline['integrity']['quickCheck'] == [{'quick_check': 'ok'}]
print('PASS: failure rollback byte-equivalent; both cleared notes SQL NULL; note-only row timestamps/status stable; missing energy remains missing; database integrity clean')
print('PREVIEW_ID:', baseline['preview']['id'])
print('DATA_FINGERPRINT:', baseline['preview']['dataFingerprint'])
