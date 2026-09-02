import { buildSync } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const tempDir = mkdtempSync(path.join(os.tmpdir(), 'release-timeline-smoke-'));
const bundlePath = path.join(tempDir, 'timeline-core-test.cjs');

try {
	buildSync({
		entryPoints: [path.join(repoRoot, 'timeline-core.ts')],
		bundle: true,
		format: 'cjs',
		platform: 'node',
		target: 'node18',
		outfile: bundlePath,
	});

	const core = await import(pathToFileURL(bundlePath).href);

	assert.equal(core.parseTimelineDate('2022')?.year, 2022);
	assert.equal(core.parseTimelineDate('2022-12')?.month, 12);

	const records = [
		{ filePath: 'alpha.md', displayName: 'Alpha', date: core.parseTimelineDate('2020-01-01') },
		{ filePath: 'beta.md', displayName: 'Beta', date: core.parseTimelineDate('2023-03-15') },
		{ filePath: 'gamma.md', displayName: 'Gamma', date: core.parseTimelineDate('2023-05-03') },
	].filter((record) => record.date);

	const yearRows = core.buildTimelineRows(records, {
		mode: 'year',
		sortDirection: 'asc',
		collapseEmptyYears: true,
		collapseLimit: 1,
		collapseEmptyMonths: true,
		weekDisplayFormat: 'dateNames',
	});
	assert.equal(yearRows.length, 3);
	assert.equal(yearRows[0].label, '2020');
	assert.equal(yearRows[1].label, '2021 - 2022');
	assert.equal(yearRows[2].label, '2023');

	const monthRows = core.buildTimelineRows(records, {
		mode: 'month',
		sortDirection: 'asc',
		collapseEmptyYears: true,
		collapseLimit: 1,
		collapseEmptyMonths: true,
		weekDisplayFormat: 'dateNames',
	});
	assert.equal(monthRows.some((row) => row.label === '2023 / Mar'), true);

	const weekRows = core.buildTimelineRows(records, {
		mode: 'week',
		sortDirection: 'asc',
		collapseEmptyYears: true,
		collapseLimit: 1,
		collapseEmptyMonths: true,
		weekDisplayFormat: 'weekNames',
	});
	assert.equal(weekRows.length > 0, true);

	console.log('Smoke test passed.');
} finally {
	rmSync(tempDir, { recursive: true, force: true });
}
