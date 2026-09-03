/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- Obsidian's DOM and workspace helpers are loosely typed at runtime. */
import { App, HoverParent, TFile } from 'obsidian';
import { AccentAlternationMode, TimelineRecord, TimelineRow } from './timeline-core';
import type { ReleaseTimelineSettings } from './settings';

export interface TimelineRenderOptions {
	bulletPoints: boolean;
	itemLayout: 'stacked' | 'inline';
	inlineDelimiter: string;
	accentAlternationMode: AccentAlternationMode;
	showYearBar: boolean;
	widthPx: number;
	instanceId: string;
	colors: ReleaseTimelineSettings;
	app: App;
	hoverParent: HoverParent;
}

function createDetachedHost(): HTMLElement {
	const host = document.body.createDiv();
	host.detach();
	return host;
}

function createCell(tag: 'th' | 'td', text: string, className: string): HTMLTableCellElement {
	return createDetachedHost().createEl(tag, { cls: className, text });
}

export function createErrorTable(message: string, columnCount = 5): HTMLTableElement {
	const table = createDetachedHost().createEl('table', { cls: ['release-timeline', 'release-timeline-error'] });
	const tbody = table.createEl('tbody');
	const row = tbody.createEl('tr');
	row.createEl('td', { attr: { colspan: String(columnCount) }, text: message });
	return table;
}

function createTimelineLink(parent: HTMLElement, record: TimelineRecord, app: App, hoverParent: HoverParent): HTMLAnchorElement {
	const link = parent.createEl('a', {
		cls: 'internal-link',
		text: record.displayName,
		attr: { href: '#' },
	});
	link.dataset.href = record.filePath;
	link.addEventListener('click', (event) => {
		event.preventDefault();
		void (async () => {
			const file = app.vault.getAbstractFileByPath(record.filePath);
			if (file instanceof TFile) {
				await app.workspace.getLeaf(true).openFile(file);
			}
		})();
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

function appendInlineProperties(container: HTMLElement, record: TimelineRecord): void {
	if (record.inlineProperties.length === 0) {
		return;
	}

	const props = container.createDiv({ cls: 'release-timeline-inline-properties' });

	record.inlineProperties.forEach((entry) => {
		const prop = props.createDiv({ cls: 'release-timeline-inline-property' });
		prop.createDiv({ cls: 'release-timeline-inline-property-label', text: entry.label });
		prop.createDiv({ cls: 'release-timeline-inline-property-value', text: entry.value });
	});
}

function createNoteContent(record: TimelineRecord, bulletPoints: boolean, app: App, hoverParent: HoverParent): HTMLSpanElement {
	const wrapper = createDetachedHost().createSpan({ cls: 'release-timeline-note-content' });
	const titleRow = wrapper.createSpan({ cls: 'release-timeline-note-title-row' });
	if (bulletPoints) {
		titleRow.createSpan({ cls: 'release-timeline-bullet', text: '•' });
	}
	createTimelineLink(titleRow, record, app, hoverParent);
	appendInlineProperties(wrapper, record);
	return wrapper;
}

function createItemCell(records: TimelineRecord[], bulletPoints: boolean, itemLayout: 'stacked' | 'inline', inlineDelimiter: string, app: App, hoverParent: HoverParent): HTMLTableCellElement {
	const cell = createDetachedHost().createEl('td', { cls: ['release-timeline-items', 'release-timeline-items--base'] });

	if (records.length === 0) {
		cell.classList.add('is-empty');
		cell.textContent = '—';
		return cell;
	}

	if (itemLayout === 'stacked') {
		const list = cell.createEl('ul', { cls: ['release-timeline-list', bulletPoints ? 'has-bullets' : 'no-bullets'] });

		for (const record of records) {
			const li = list.createEl('li');
			li.appendChild(createNoteContent(record, bulletPoints, app, hoverParent));
		}

		return cell;
	}

	records.forEach((record, index) => {
		if (index > 0) {
			cell.appendChild(document.createTextNode(inlineDelimiter));
		}
		cell.appendChild(createNoteContent(record, bulletPoints, app, hoverParent));
	});
	return cell;
}

function createSingleItemRow(record: TimelineRecord | null, bulletPoints: boolean, app: App, hoverParent: HoverParent): HTMLTableCellElement {
	const cell = createDetachedHost().createEl('td', { cls: ['release-timeline-items', 'release-timeline-items--base'] });

	if (!record) {
		cell.classList.add('is-empty');
		cell.textContent = '—';
		return cell;
	}

	cell.appendChild(createNoteContent(record, bulletPoints, app, hoverParent));
	return cell;
}

function getPalette(colors: ReleaseTimelineSettings): [string, string] {
	return [colors.accentPrimaryColor, colors.accentAlternateColor];
}

function getAccentColor(palette: [string, string], index: number, alternationEnabled: boolean): string {
	return alternationEnabled && index % 2 === 1 ? palette[1] : palette[0];
}

function rowCountForMonth(row: TimelineRow, itemLayout: 'stacked' | 'inline'): number {
	if (itemLayout === 'stacked') {
		return Math.max(row.items.length, 1);
	}

	return 1;
}

function rowCountWithGap(row: TimelineRow, itemLayout: 'stacked' | 'inline', isLastRow: boolean): number {
	return rowCountForMonth(row, itemLayout) + (isLastRow ? 0 : 1);
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
		return createErrorTable('No matching notes were found for this timeline.', options.showYearBar ? 5 : 4);
	}

	const table = createDetachedHost().createEl('table', { cls: ['release-timeline', 'release-timeline-bases'] });
	table.dataset.releaseTimelineInstance = options.instanceId;
	table.dataset.itemLayout = options.itemLayout;
	table.dataset.accentAlternationMode = options.accentAlternationMode;
	table.dataset.showYearBar = String(options.showYearBar);
	table.style.width = `${options.widthPx}px`;
	table.style.maxWidth = `${options.widthPx}px`;

	const tbody = table.createEl('tbody');
	const yearGroups = groupRowsByYear(rows);
	let monthIndex = 0;
	const columnCount = options.showYearBar ? 5 : 4;

	yearGroups.forEach((yearGroup, yearGroupIndex) => {
		const yearRowSpan = yearGroup.reduce((sum, row, index) => sum + rowCountWithGap(row, options.itemLayout, index === yearGroup.length - 1), 0);
		const yearPalette = getPalette(options.colors);
		const monthPalette = getPalette(options.colors);
		let yearCellDrawn = false;

		yearGroup.forEach((row, rowIndex) => {
			const monthRows = rowCountForMonth(row, options.itemLayout);
			const yearAccentColor = getAccentColor(yearPalette, yearGroupIndex, options.accentAlternationMode === 'year' || options.accentAlternationMode === 'both');
			const monthAccentColor = getAccentColor(monthPalette, monthIndex, options.accentAlternationMode === 'month' || options.accentAlternationMode === 'both');
			monthIndex += 1;
			const yearAccentClass = yearAccentColor === options.colors.accentAlternateColor ? 'alternate' : 'primary';
			const monthAccentClass = monthAccentColor === options.colors.accentAlternateColor ? 'alternate' : 'primary';

			const monthLabel = row.kind === 'year' ? '' : (row.subLabel ?? row.monthLabel ?? row.label);
			const itemRows = options.itemLayout === 'stacked' ? (row.items.length > 0 ? row.items : [null]) : [row.items[0] ?? null];

			itemRows.forEach((itemRecord, itemIndex) => {
				const tr = tbody.createEl('tr', { cls: ['release-timeline-row', `release-timeline-row--${row.kind}`] });
				if (row.empty) {
					tr.classList.add('is-empty');
				}

				if (!yearCellDrawn) {
					const yearCell = createCell('th', row.year, 'release-timeline-period release-timeline-period--year');
					yearCell.scope = 'row';
					yearCell.rowSpan = yearRowSpan;
					yearCell.dataset.releaseKind = row.kind;
					yearCell.dataset.state = row.empty ? 'empty' : 'existing';
					yearCell.setCssStyles({ paddingRight: '6px' });
					tr.appendChild(yearCell);

					if (options.showYearBar) {
						const yearBarCell = tr.createEl('td', { cls: ['release-timeline-year-bar', `release-timeline-year-bar--${yearAccentClass}`] });
						yearBarCell.rowSpan = yearRowSpan;
					}

					yearCellDrawn = true;
				}

				if (itemIndex === 0) {
					const monthCell = createCell('th', monthLabel, 'release-timeline-period release-timeline-period--secondary');
					monthCell.scope = 'row';
					monthCell.rowSpan = monthRows;
					monthCell.dataset.releaseKind = row.kind;
					monthCell.dataset.state = row.empty ? 'empty' : 'existing';
					monthCell.setCssStyles({ paddingLeft: '6px', paddingRight: '8px' });
					tr.appendChild(monthCell);
				}

				const accentCell = tr.createEl('td', { cls: ['release-timeline-accent-cell', `release-timeline-accent-cell--${monthAccentClass}`] });
				tr.appendChild(accentCell);

				const itemCell = options.itemLayout === 'stacked'
					? createSingleItemRow(itemRecord, options.bulletPoints, options.app, options.hoverParent)
					: createItemCell(row.items, options.bulletPoints, options.itemLayout, options.inlineDelimiter, options.app, options.hoverParent);

				tr.appendChild(itemCell);
				tbody.appendChild(tr);
			});

			if (rowIndex < yearGroup.length - 1) {
				const gapRow = tbody.createEl('tr', { cls: ['release-timeline-row', 'release-timeline-row--gap', 'release-timeline-row--month-gap'] });
				gapRow.createEl('td', { cls: 'release-timeline-gap', attr: { colspan: String(columnCount) } });
			}
		});

		if (yearGroupIndex < yearGroups.length - 1) {
			const gapRow = tbody.createEl('tr', { cls: ['release-timeline-row', 'release-timeline-row--gap', 'release-timeline-row--year-gap'] });
			gapRow.createEl('td', { cls: 'release-timeline-gap', attr: { colspan: String(columnCount) } });
		}
	});

	return table;
}
/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- Re-enable after the renderer helpers. */
