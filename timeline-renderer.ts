import { App, HoverParent, TFile } from 'obsidian';
import { TimelineRecord, TimelineRow } from './timeline-core';
import type { ReleaseTimelineSettings } from './settings';

export interface TimelineRenderOptions {
	bulletPoints: boolean;
	itemLayout: 'stacked' | 'inline';
	colorAlternationBy: 'year' | 'month';
	widthPx: number;
	colors: ReleaseTimelineSettings;
	app: App;
	hoverParent: HoverParent;
}

export function createErrorTable(message: string): HTMLTableElement {
	const table = document.createElement('table');
	table.classList.add('release-timeline', 'release-timeline-error');

	const tbody = document.createElement('tbody');
	const row = document.createElement('tr');
	const cell = document.createElement('td');
	cell.setAttribute('colspan', '3');
	cell.textContent = message;
	row.appendChild(cell);
	tbody.appendChild(row);
	table.appendChild(tbody);

	return table;
}

function createTimelineLink(record: TimelineRecord, app: App, hoverParent: HoverParent): HTMLAnchorElement {
	const link = document.createElement('a');
	link.classList.add('internal-link');
	link.dataset.href = record.filePath;
	link.textContent = record.displayName;
	link.href = '#';
	link.addEventListener('click', async (event) => {
		event.preventDefault();
		const file = app.vault.getAbstractFileByPath(record.filePath);
		if (file instanceof TFile) {
			await app.workspace.getLeaf(true).openFile(file);
		}
	});
	link.addEventListener('mouseover', (event) => {
		app.workspace.trigger('hover-link', {
			event,
			source: 'release-timeline',
			hoverParent,
			targetEl: link,
			linktext: record.filePath,
			sourcePath: record.filePath,
		});
	});
	return link;
}

function createEntryCell(records: TimelineRecord[], bulletPoints: boolean, itemLayout: 'stacked' | 'inline', app: App, hoverParent: HoverParent): HTMLTableCellElement {
	const cell = document.createElement('td');
	cell.classList.add('release-timeline-items');

	if (records.length === 0) {
		cell.classList.add('is-empty');
		cell.textContent = '—';
		return cell;
	}

	if (itemLayout === 'stacked' && records.length > 1) {
		const list = document.createElement('ul');
		list.classList.add('release-timeline-list');
		list.classList.toggle('has-bullets', bulletPoints);
		list.classList.toggle('no-bullets', !bulletPoints);

		for (const record of records) {
			const item = document.createElement('li');
			item.appendChild(createTimelineLink(record, app, hoverParent));
			list.appendChild(item);
		}

		cell.appendChild(list);
		return cell;
	}

	const fragment = document.createDocumentFragment();
	records.forEach((record, index) => {
		if (index > 0) {
			fragment.appendChild(document.createTextNode(', '));
		}
		fragment.appendChild(createTimelineLink(record, app, hoverParent));
	});
	cell.appendChild(fragment);

	return cell;
}

function getModePalette(colors: ReleaseTimelineSettings, mode: TimelineRow['kind']): [string, string] {
	if (mode === 'month') {
		return [colors.monthExistingColor, colors.monthEmptyColor];
	}

	if (mode === 'week') {
		return [colors.weekExistingColor, colors.weekEmptyColor];
	}

	return [colors.yearExistingColor, colors.yearEmptyColor];
}

function getAccentColor(palette: [string, string], index: number): string {
	return index % 2 === 0 ? palette[0] : palette[1];
}

function buildPeriodCell(label: string, kind: TimelineRow['kind'], empty: boolean, accentColor: string, rowSpan?: number): HTMLTableCellElement {
	const cell = document.createElement('th');
	cell.scope = 'row';
	cell.classList.add('release-timeline-period', `release-timeline-period--${kind}`);
	cell.dataset.releaseKind = kind;
	cell.dataset.state = empty ? 'empty' : 'existing';
	cell.style.setProperty('--release-timeline-accent', accentColor);
	cell.textContent = label;

	if (rowSpan && rowSpan > 1) {
		cell.rowSpan = rowSpan;
	}

	return cell;
}

function groupRowsByYear(rows: TimelineRow[]): TimelineRow[][] {
	const groups: TimelineRow[][] = [];
	let currentYear: string | null = null;
	let currentGroup: TimelineRow[] = [];

	for (const row of rows) {
		if (currentYear !== null && row.year !== currentYear) {
			groups.push(currentGroup);
			currentGroup = [];
		}

		currentYear = row.year;
		currentGroup.push(row);
	}

	if (currentGroup.length > 0) {
		groups.push(currentGroup);
	}

	return groups;
}

export function renderTimelineTable(rows: TimelineRow[], options: TimelineRenderOptions): HTMLTableElement {
	if (rows.length === 0) {
		return createErrorTable('No matching notes were found for this timeline.');
	}

	const table = document.createElement('table');
	table.classList.add('release-timeline', 'release-timeline-bases');
	table.dataset.itemLayout = options.itemLayout;
	table.dataset.colorAlternation = options.colorAlternationBy;
	table.style.width = `${options.widthPx}px`;
	table.style.maxWidth = '100%';

	const thead = document.createElement('thead');
	const headerRow = document.createElement('tr');
	const yearHeader = document.createElement('th');
	yearHeader.scope = 'col';
	yearHeader.textContent = 'Year';
	const monthHeader = document.createElement('th');
	monthHeader.scope = 'col';
	monthHeader.textContent = rows[0].kind === 'week' ? 'Week' : 'Month';
	const notesHeader = document.createElement('th');
	notesHeader.scope = 'col';
	notesHeader.textContent = 'Notes';

	headerRow.appendChild(yearHeader);
	headerRow.appendChild(monthHeader);
	headerRow.appendChild(notesHeader);
	thead.appendChild(headerRow);
	table.appendChild(thead);

	const tbody = document.createElement('tbody');
	const yearGroups = groupRowsByYear(rows);
	const palette = getModePalette(options.colors, rows[0].kind);
	let flatIndex = 0;

	yearGroups.forEach((groupRows, groupIndex) => {
		groupRows.forEach((row, rowIndex) => {
			const tr = document.createElement('tr');
			tr.classList.add('release-timeline-row', `release-timeline-row--${row.kind}`);
			if (row.empty) {
				tr.classList.add('is-empty');
			}

			const accentIndex = options.colorAlternationBy === 'year' ? groupIndex : flatIndex;
			const accentColor = getAccentColor(palette, accentIndex);

			if (rowIndex === 0) {
				const yearCell = buildPeriodCell(row.year, row.kind, row.empty, accentColor, groupRows.length);
				tr.appendChild(yearCell);
			}

			const monthLabel = row.subLabel ?? '';
			const monthCell = buildPeriodCell(monthLabel, row.kind, row.empty, accentColor);
			monthCell.classList.add('release-timeline-period--secondary');
			tr.appendChild(monthCell);
			tr.appendChild(createEntryCell(row.items, options.bulletPoints, options.itemLayout, options.app, options.hoverParent));

			tbody.appendChild(tr);
			flatIndex += 1;
		});
	});

	table.appendChild(tbody);

	return table;
}
