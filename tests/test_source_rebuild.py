"""A cold source rebuild must restore active corrections and deployed-capture audits."""
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


PROJECT = Path(__file__).resolve().parent.parent


def read_data(path):
    return json.loads(path.read_text(encoding='utf-8').split('window.HERO_DATA = ', 1)[1].strip().removesuffix(';'))


class SourceRebuildTests(unittest.TestCase):
    def test_cold_rebuild_restores_corrected_data_and_full_capture_audit(self):
        expected = read_data(PROJECT / 'data.js')
        with tempfile.TemporaryDirectory(prefix='.source-rebuild-', dir=PROJECT) as directory:
            isolated = Path(directory).resolve()
            self.assertTrue(isolated.is_relative_to(PROJECT.resolve()))
            shutil.copytree(PROJECT / 'source', isolated / 'source',
                            ignore=shutil.ignore_patterns('__pycache__'))
            # No active data.js or generated review is available to bootstrap from.
            (isolated / 'source' / 'milestone-review' / 'review.json').unlink(missing_ok=True)
            result = subprocess.run([sys.executable, '-X', 'utf8',
                                     str(isolated / 'source' / 'extract_data.py')],
                                    cwd=isolated, capture_output=True, text=True,
                                    encoding='utf-8', timeout=120)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            rebuilt = read_data(isolated / 'data.js')
            for key in ('heroes', 'stats', 'milestoneLevels'):
                self.assertEqual(rebuilt[key], expected[key], key)
            review = json.loads((isolated / 'source' / 'milestone-review' / 'review.json').read_text(encoding='utf-8'))
            captures = review['additionalCalibrationEvidence']
            self.assertGreater(captures['captureCount'], 0)
            self.assertNotIn('status', captures)  # No deferred audit can escape a full rebuild.
            for capture in captures['captures']:
                self.assertEqual(capture['matchingFields'], capture['observedMilestones'])
                self.assertEqual(capture['models']['compoundedGrandMasters']['matchingMilestones'],
                                 capture['observedMilestones'])
            standalone = json.loads((isolated / 'source' / 'milestone-review' / 'calibration-captures-review.json').read_text(encoding='utf-8'))
            self.assertEqual(captures, standalone)


if __name__ == '__main__':
    unittest.main()
