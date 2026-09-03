import { DateTime } from 'luxon';

export type TimelineMode = 'year' | 'month' | 'week';
export type SortDirection = 'asc' | 'desc';
export type WeekDisplayFormat = 'weekNames' | 'dateNames' | 'monthDayRange';
export type ItemLayout = 'stacked' | 'inline';
export type AccentAlternationMode = 'none' | 'year' | 'month' | 'both';

export interface TimelineRecord {
	filePath: string;
	displayName: string;
	date: DateTime;
	inlineProperties: Array<{ label: string; value: string }>;
}

export interface TimelineRow {
	kind: TimelineMode;
	label: string;
	subLabel?: string;
	year: string;
	month?: string;
	week?: string;
	monthLabel?: string;
	items: TimelineRecord[];
	empty: boolean;
}

export interface TimelineBuildOptions {
	mode: TimelineMode;
	sortDirection: SortDirection;
	itemLayout: ItemLayout;
	inlineDelimiter: string;
	widthPx: number;
	accentAlternationMode: AccentAlternationMode;
	showYearBar: boolean;
	collapseEmptyYears: boolean;
	collapseLimit: number;
	collapseEmptyMonths: boolean;
	weekDisplayFormat: WeekDisplayFormat;
}

const DEFAULT_COLLAPSE_LIMIT = 2;

function sortRecords(records: TimelineRecord[], direction: SortDirection): TimelineRecord[] {
	const sorted = [...records].sort((left, right) => {
		const dateDiff = left.date.toMillis() - right.date.toMillis();

		if (dateDiff !== 0) {
			return direction === 'asc' ? dateDiff : -dateDiff;
		}

		return direction === 'asc'
			? left.displayName.localeCompare(right.displayName)
			: right.displayName.localeCompare(left.displayName);
	});

	return sorted;
}

function reverseIfNeeded(rows: TimelineRow[], direction: SortDirection): TimelineRow[] {
	return direction === 'desc' ? [...rows].reverse() : rows;
}

function padWeek(weekNumber: number): string {
	return String(weekNumber).padStart(2, '0');
}

function monthLabel(date: DateTime): string {
	return date.toFormat('MMM');
}

function weekLabel(date: DateTime, format: WeekDisplayFormat): string {
	const weekStart = date.startOf('week');
	const weekEnd = date.endOf('week');

	if (format === 'weekNames') {
		return `W${padWeek(date.weekNumber)}`;
	}

	if (format === 'dateNames') {
		return weekStart.toFormat('yyyy-MM-dd');
	}

	const startMonth = weekStart.toFormat('MMM');
	const endMonth = weekEnd.toFormat('MMM');
	const startDay = weekStart.toFormat('d');
	const endDay = weekEnd.toFormat('d');

	if (weekStart.year === weekEnd.year && weekStart.month === weekEnd.month) {
		return `${startMonth} ${startDay}-${endDay}`;
	}

	return `${startMonth} ${startDay}-${endMonth} ${endDay}`;
}

function buildYearRows(records: TimelineRecord[], options: TimelineBuildOptions): TimelineRow[] {
	if (records.length === 0) {
		return [];
	}

	const sorted = sortRecords(records, options.sortDirection);
	const years = sorted.map((record) => record.date.year);
	const firstYear = Math.min(...years);
	const lastYear = Math.max(...years);
	const rows: TimelineRow[] = [];
	const recordsByYear = new Map<number, TimelineRecord[]>();

	for (const record of sorted) {
		const year = record.date.year;
		const list = recordsByYear.get(year) ?? [];
		list.push(record);
		recordsByYear.set(year, list);
	}

	for (let year = firstYear; year <= lastYear; year += 1) {
		const items = sortRecords(recordsByYear.get(year) ?? [], options.sortDirection);
		rows.push({
			kind: 'year',
			label: String(year),
			subLabel: '',
			year: String(year),
			items,
			empty: items.length === 0,
		});
	}

	if (!options.collapseEmptyYears) {
		return reverseIfNeeded(rows, options.sortDirection);
	}

	const collapsed: TimelineRow[] = [];
	let emptyRunStart: number | null = null;

	const flushRun = (runEnd: number) => {
		if (emptyRunStart === null) {
			return;
		}

		const runLength = runEnd - emptyRunStart;
		if (runLength >= options.collapseLimit) {
			const startYear = rows[emptyRunStart].year;
			const endYear = rows[runEnd - 1].year;
			collapsed.push({
				kind: 'year',
				label: `${startYear} - ${endYear}`,
				year: startYear,
				items: [],
				empty: true,
			});
		} else {
			for (let index = emptyRunStart; index < runEnd; index += 1) {
				collapsed.push(rows[index]);
			}
		}

		emptyRunStart = null;
	};

	rows.forEach((row, index) => {
		if (row.empty) {
			if (emptyRunStart === null) {
				emptyRunStart = index;
			}
			return;
		}

		flushRun(index);
		collapsed.push(row);
	});

	flushRun(rows.length);

	return reverseIfNeeded(collapsed, options.sortDirection);
}

function buildMonthRows(records: TimelineRecord[], options: TimelineBuildOptions): TimelineRow[] {
	if (records.length === 0) {
		return [];
	}

	const sorted = sortRecords(records, options.sortDirection);
	const monthDates = sorted.map((record) => record.date.startOf('month'));
	const firstMonth = monthDates.reduce((min, month) => (month.toMillis() < min.toMillis() ? month : min), monthDates[0]);
	const lastMonth = monthDates.reduce((max, month) => (month.toMillis() > max.toMillis() ? month : max), monthDates[0]);
	const rows: TimelineRow[] = [];
	const recordsByMonth = new Map<string, TimelineRecord[]>();

	for (const record of sorted) {
		const key = record.date.toFormat('yyyy-MM');
		const list = recordsByMonth.get(key) ?? [];
		list.push(record);
		recordsByMonth.set(key, list);
	}

	for (let month = firstMonth; month.toMillis() <= lastMonth.toMillis(); month = month.plus({ months: 1 })) {
		const key = month.toFormat('yyyy-MM');
		const items = sortRecords(recordsByMonth.get(key) ?? [], options.sortDirection);

		rows.push({
			kind: 'month',
			label: `${month.year} / ${monthLabel(month)}`,
			subLabel: monthLabel(month),
			year: String(month.year),
			month: key,
			monthLabel: monthLabel(month),
			items,
			empty: items.length === 0,
		});
	}

	const visibleRows = options.collapseEmptyMonths ? rows.filter((row) => !row.empty) : rows;
	return reverseIfNeeded(visibleRows, options.sortDirection);
}

function buildWeekRows(records: TimelineRecord[], options: TimelineBuildOptions): TimelineRow[] {
	if (records.length === 0) {
		return [];
	}

	const sorted = sortRecords(records, options.sortDirection);
	const weekDates = sorted.map((record) => record.date.startOf('week'));
	const firstWeek = weekDates.reduce((min, week) => (week.toMillis() < min.toMillis() ? week : min), weekDates[0]);
	const lastWeek = weekDates.reduce((max, week) => (week.toMillis() > max.toMillis() ? week : max), weekDates[0]);
	const rows: TimelineRow[] = [];
	const recordsByWeek = new Map<string, TimelineRecord[]>();

	for (const record of sorted) {
		const weekStart = record.date.startOf('week');
		const key = `${weekStart.weekYear}-W${padWeek(weekStart.weekNumber)}`;
		const list = recordsByWeek.get(key) ?? [];
		list.push(record);
		recordsByWeek.set(key, list);
	}

	for (let week = firstWeek; week.toMillis() <= lastWeek.toMillis(); week = week.plus({ weeks: 1 })) {
		const weekKey = `${week.weekYear}-W${padWeek(week.weekNumber)}`;
		const anchor = week.plus({ days: 3 });
		const items = sortRecords(recordsByWeek.get(weekKey) ?? [], options.sortDirection);
		const weekText = weekLabel(anchor, options.weekDisplayFormat);

		rows.push({
			kind: 'week',
			label: `${anchor.year} / ${monthLabel(anchor)} / ${weekText}`,
			subLabel: weekText,
			year: String(anchor.year),
			month: `${anchor.year}-${String(anchor.month).padStart(2, '0')}`,
			monthLabel: monthLabel(anchor),
			week: weekKey,
			items,
			empty: items.length === 0,
		});
	}

	if (!options.collapseEmptyMonths) {
		return reverseIfNeeded(rows, options.sortDirection);
	}

	const collapsedMonths: TimelineRow[] = [];
	let currentMonth = rows[0].month;
	let monthGroup: TimelineRow[] = [];

	const flushMonthGroup = () => {
		if (monthGroup.length === 0) {
			return;
		}

		const totalItems = monthGroup.reduce((sum, row) => sum + row.items.length, 0);
		if (totalItems === 0) {
			collapsedMonths.push({
				kind: 'month',
				label: `${monthGroup[0].year} / ${monthGroup[0].monthLabel ?? ''}`.trim(),
				year: monthGroup[0].year,
				month: currentMonth ?? monthGroup[0].month,
				monthLabel: monthGroup[0].monthLabel,
				items: [],
				empty: true,
			});
		} else {
			collapsedMonths.push(...monthGroup);
		}

		monthGroup = [];
	};

	for (const row of rows) {
		if (row.month !== currentMonth) {
			flushMonthGroup();
			currentMonth = row.month;
		}

		monthGroup.push(row);
	}

	flushMonthGroup();

	// Clean up empty month labels after the collapse step.
	for (const row of collapsedMonths) {
		if (row.empty && row.kind === 'month') {
			const [year, monthValue] = (row.month ?? '').split('-');
			if (year && monthValue) {
				const monthDate = DateTime.fromObject({ year: Number(year), month: Number(monthValue), day: 1 });
				row.monthLabel = monthLabel(monthDate);
				row.label = `${year} / ${row.monthLabel}`;
			}
		}
	}

	return reverseIfNeeded(collapsedMonths, options.sortDirection);
}

export function buildTimelineRows(records: TimelineRecord[], options: TimelineBuildOptions): TimelineRow[] {
	if (records.length === 0) {
		return [];
	}

	switch (options.mode) {
		case 'year':
			return buildYearRows(records, {
				...options,
				collapseLimit: Number.isFinite(options.collapseLimit) ? options.collapseLimit : DEFAULT_COLLAPSE_LIMIT,
			});
		case 'month':
			return buildMonthRows(records, options);
		case 'week':
			return buildWeekRows(records, options);
	}
}

export function parseTimelineDate(input: unknown): DateTime | null {
	if (input === null || input === undefined) {
		return null;
	}

	if (input instanceof DateTime) {
		return input.isValid ? input : null;
	}

	const text = String(input).trim();
	if (!text) {
		return null;
	}

	if (/^\d{4}$/.test(text)) {
		return DateTime.fromObject({ year: Number(text), month: 1, day: 1 });
	}

	if (/^\d{4}-\d{2}$/.test(text)) {
		const parsed = DateTime.fromISO(`${text}-01`);
		return parsed.isValid ? parsed : null;
	}

	const parsed = DateTime.fromISO(text);
	if (parsed.isValid) {
		return parsed;
	}

	const parsedDate = DateTime.fromJSDate(new Date(text));
	return parsedDate.isValid ? parsedDate : null;
}
