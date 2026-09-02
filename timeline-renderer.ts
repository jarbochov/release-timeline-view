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

function createCell(tag: 'th' | 'td', text: string, className: string): HTMLTableCellElement {
	const cell = document.createElement(tag);
	cell.className = className;
	cell.textContent = text;
	return cell;
}

export function createErrorTable(message: string): HTMLTableElement {
	const table = document.createElement('table');
	table.classList.add('release-timeline', 'release-timeline-error');

	const tbody = document.createElement('tbody');
	const row = document.createElement('tr');
	const cell = document.createElement('td');
	cell.setAttribute('colspan', '4');
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

function createItemCell(records: TimelineRecord[], bulletPoints: boolean, itemLayout: 'stacked' | 'inline', accentColor: string, app: App, hoverParent: HoverParent): HTMLTableCellElement {
	const cell = document.createElement('td');
	cell.classList.add('release-timeline-items');
	cell.style.backgroundColor = 'var(--background-primary)';
	cell.style.boxShadow = `inset 0.8rem 0 0 ${accentColor}`;
	cell.style.paddingLeft = '0.8rem';

	if (records.length === 0) {
		cell.classList.add('is-empty');
		cell.textContent = '—';
		return cell;
	}

	if (itemLayout === 'stacked') {
		const list = document.createElement('ul');
		list.classList.add('release-timeline-list');
		list.classList.toggle('has-bullets', bulletPoints);
		list.classList.toggle('no-bullets', !bulletPoints);

		for (const record of records) {
			const li = document.createElement('li');
			li.appendChild(createTimelineLink(record, app, hoverParent));
			list.appendChild(li);
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

function createSingleItemRow(record: TimelineRecord | null, accentColor: string, app: App, hoverParent: HoverParent): HTMLTableCellElement {
	const cell = document.createElement('td');
	cell.classList.add('release-timeline-items');
	cell.style.backgroundColor = 'var(--background-primary)';
	cell.style.boxShadow = `inset 0.8rem 0 0 ${accentColor}`;
	cell.style.paddingLeft = '0.8rem';

	if (!record) {
		cell.classList.add('is-empty');
		cell.textContent = '—';
		return cell;
	}

	cell.appendChild(createTimelineLink(record, app, hoverParent));
	return cell;
}

function getPalette(colors: ReleaseTimelineSettings, kind: TimelineRow['kind']): [string, string] {
	if (kind === 'month') {
		return [colors.monthExistingColor, colors.monthEmptyColor];
	}

	if (kind === 'week') {
		return [colors.weekExistingColor, colors.weekEmptyColor];
	}

	return [colors.yearExistingColor, colors.yearEmptyColor];
}

function getAccentColor(palette: [string, string], index: number): string {
	return index % 2 === 0 ? palette[0] : palette[1];
}

function rowCountForMonth(row: TimelineRow, itemLayout: 'stacked' | 'inline'): number {
	if (itemLayout === 'stacked') {
		return Math.max(row.items.length, 1);
	}

	return 1;
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

	const tbody = document.createElement('tbody');
	const yearGroups = groupRowsByYear(rows);
	let monthIndex = 0;

	yearGroups.forEach((yearGroup, yearGroupIndex) => {
		const yearRowSpan = yearGroup.reduce((sum, row) => sum + rowCountForMonth(row, options.itemLayout), 0);
		const palette = getPalette(options.colors, yearGroup[0].kind);
		let yearCellDrawn = false;

		yearGroup.forEach((row) => {
			const monthRows = rowCountForMonth(row, options.itemLayout);
			const accentColor = getAccentColor(palette, options.colorAlternationBy === 'year' ? yearGroupIndex : monthIndex);
			monthIndex += 1;

			const monthLabel = row.kind === 'year' ? '' : (row.subLabel ?? row.monthLabel ?? row.label);
			const itemRows = options.itemLayout === 'stacked' ? (row.items.length > 0 ? row.items : [null]) : [row.items[0] ?? null];

			itemRows.forEach((itemRecord, itemIndex) => {
				const tr = document.createElement('tr');
				tr.classList.add('release-timeline-row', `release-timeline-row--${row.kind}`);
				if (row.empty) {
					tr.classList.add('is-empty');
				}

				if (!yearCellDrawn) {
					const yearCell = createCell('th', row.year, 'release-timeline-period release-timeline-period--year');
					yearCell.scope = 'row';
					yearCell.rowSpan = yearRowSpan;
					yearCell.dataset.releaseKind = row.kind;
					yearCell.dataset.state = row.empty ? 'empty' : 'existing';
					yearCell.style.setProperty('--release-timeline-accent', accentColor);
					yearCell.style.color = accentColor;
					yearCell.style.paddingRight = '0.85rem';
					tr.appendChild(yearCell);
					yearCellDrawn = true;
				}

				if (itemIndex === 0) {
					const monthCell = createCell('th', monthLabel, 'release-timeline-period release-timeline-period--secondary');
					monthCell.scope = 'row';
					monthCell.rowSpan = monthRows;
					monthCell.dataset.releaseKind = row.kind;
					monthCell.dataset.state = row.empty ? 'empty' : 'existing';
					monthCell.style.setProperty('--release-timeline-accent', accentColor);
					monthCell.style.paddingRight = '0.75rem';
					tr.appendChild(monthCell);

					const accentCell = document.createElement('td');
					accentCell.classList.add('release-timeline-accent-cell');
					accentCell.rowSpan = monthRows;
					accentCell.style.backgroundColor = accentColor;
					tr.appendChild(accentCell);
				}

				const itemCell = options.itemLayout === 'stacked'
					? createSingleItemRow(itemRecord, accentColor, options.app, options.hoverParent)
					: createItemCell(row.items, options.bulletPoints, options.itemLayout, accentColor, options.app, options.hoverParent);

				tr.appendChild(itemCell);
				tbody.appendChild(tr);
			});
		});
	});

	table.appendChild(tbody);
	return table;
}
