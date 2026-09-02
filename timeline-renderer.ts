import { TimelineRecord, TimelineRow } from './timeline-core';

export interface TimelineRenderOptions {
	bulletPoints: boolean;
}

export function createErrorTable(message: string): HTMLTableElement {
	const table = document.createElement('table');
	table.classList.add('release-timeline', 'release-timeline-error');

	const tbody = document.createElement('tbody');
	const row = document.createElement('tr');
	const cell = document.createElement('td');
	cell.setAttribute('colspan', '2');
	cell.textContent = message;
	row.appendChild(cell);
	tbody.appendChild(row);
	table.appendChild(tbody);

	return table;
}

function createTimelineLink(record: TimelineRecord): HTMLAnchorElement {
	const link = document.createElement('a');
	link.classList.add('internal-link');
	link.dataset.href = record.filePath;
	link.textContent = record.displayName;
	return link;
}

function createEntryCell(records: TimelineRecord[], bulletPoints: boolean): HTMLTableCellElement {
	const cell = document.createElement('td');
	cell.classList.add('release-timeline-items');

	if (records.length === 0) {
		cell.classList.add('is-empty');
		cell.textContent = '—';
		return cell;
	}

	if (bulletPoints && records.length > 1) {
		const list = document.createElement('ul');
		list.classList.add('release-timeline-list');

		for (const record of records) {
			const item = document.createElement('li');
			item.appendChild(createTimelineLink(record));
			list.appendChild(item);
		}

		cell.appendChild(list);
		return cell;
	}

	const fragment = document.createDocumentFragment();
	records.forEach((record, index) => {
		if (index > 0) {
			fragment.appendChild(document.createTextNode(bulletPoints ? ' • ' : ', '));
		}
		fragment.appendChild(createTimelineLink(record));
	});
	cell.appendChild(fragment);

	return cell;
}

export function renderTimelineTable(rows: TimelineRow[], options: TimelineRenderOptions): HTMLTableElement {
	if (rows.length === 0) {
		return createErrorTable('No matching notes were found for this timeline.');
	}

	const table = document.createElement('table');
	table.classList.add('release-timeline', 'release-timeline-bases');

	const thead = document.createElement('thead');
	const headerRow = document.createElement('tr');
	const periodHeader = document.createElement('th');
	periodHeader.scope = 'col';
	periodHeader.textContent = 'Period';
	const notesHeader = document.createElement('th');
	notesHeader.scope = 'col';
	notesHeader.textContent = 'Notes';

	headerRow.appendChild(periodHeader);
	headerRow.appendChild(notesHeader);
	thead.appendChild(headerRow);
	table.appendChild(thead);

	const tbody = document.createElement('tbody');

	rows.forEach((row) => {
		const tr = document.createElement('tr');
		tr.classList.add('release-timeline-row', `release-timeline-row--${row.kind}`);
		if (row.empty) {
			tr.classList.add('is-empty');
		}

		const periodCell = document.createElement('th');
		periodCell.scope = 'row';
		periodCell.classList.add('release-timeline-period', `release-timeline-period--${row.kind}`);
		if (row.empty) {
			periodCell.classList.add('year-nonexisting');
		} else {
			periodCell.classList.add('year-existing');
		}
		periodCell.textContent = row.label;

		tr.appendChild(periodCell);
		tr.appendChild(createEntryCell(row.items, options.bulletPoints));
		tbody.appendChild(tr);
	});

	table.appendChild(tbody);

	return table;
}
