import { BasesEntry, BasesView, QueryController } from 'obsidian';
import type ReleaseTimeline from './main';
import { buildTimelineRows, parseTimelineDate, TimelineBuildOptions, TimelineRecord, TimelineMode, SortDirection, WeekDisplayFormat } from './timeline-core';
import { createErrorTable, renderTimelineTable } from './timeline-renderer';

export const RELEASE_TIMELINE_VIEW_TYPE = 'release-timeline';

function readBoolean(value: unknown, fallback: boolean): boolean {
	if (typeof value === 'boolean') {
		return value;
	}

	if (typeof value === 'string') {
		return value.toLowerCase() === 'true';
	}

	return fallback;
}

function readString(value: unknown, fallback: string): string {
	if (typeof value === 'string' && value.trim().length > 0) {
		return value;
	}

	return fallback;
}

function normalizeMode(value: string, fallback: TimelineMode): TimelineMode {
	return value === 'year' || value === 'month' || value === 'week' ? value : fallback;
}

function normalizeSortDirection(value: string, fallback: SortDirection): SortDirection {
	return value === 'asc' || value === 'desc' ? value : fallback;
}

function normalizeWeekDisplayFormat(value: string, fallback: WeekDisplayFormat): WeekDisplayFormat {
	return value === 'weekNames' || value === 'dateNames' ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === 'string') {
		const parsed = Number.parseInt(value, 10);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}

	return fallback;
}

function readPropertyId(config: BasesView['config'], key: string, fallback: string): string {
	const propertyId = config.getAsPropertyId(key);
	if (propertyId) {
		return propertyId;
	}

	const raw = config.get(key);
	return typeof raw === 'string' && raw.trim().length > 0 ? raw : fallback;
}

function readRecordLabel(entry: BasesEntry, propertyId: string): string {
	const value = entry.getValue(propertyId);
	if (value && !value.isEmpty()) {
		const text = value.toString().trim();
		if (text.length > 0) {
			return text;
		}
	}

	return entry.file.basename;
}

function extractTimelineRecords(entries: BasesEntry[], datePropertyId: string, labelPropertyId: string): TimelineRecord[] {
	const records: TimelineRecord[] = [];

	for (const entry of entries) {
		const value = entry.getValue(datePropertyId);
		const date = parseTimelineDate(value?.toString());
		if (!date) {
			continue;
		}

		records.push({
			filePath: entry.file.path,
			displayName: readRecordLabel(entry, labelPropertyId),
			date,
		});
	}

	return records;
}

function resolveTimelineOptions(plugin: ReleaseTimeline, viewConfig: BasesView['config']): TimelineBuildOptions {
	const mode = normalizeMode(readString(viewConfig.get('mode'), plugin.settings.defaultTimelineMode), plugin.settings.defaultTimelineMode);
	const sortDirection = normalizeSortDirection(readString(viewConfig.get('sortDirection'), plugin.settings.defaultSortOrder), plugin.settings.defaultSortOrder);
	const collapseEmptyYears = readBoolean(viewConfig.get('collapseEmptyYears'), plugin.settings.collapseEmptyYears);
	const collapseLimit = Math.max(1, readNumber(viewConfig.get('collapseLimit'), Number.parseInt(plugin.settings.collapseLimit, 10) || 2));
	const collapseEmptyMonths = readBoolean(viewConfig.get('collapseEmptyMonths'), plugin.settings.collapseEmptyMonthsWeeklyTimeline);
	const weekDisplayFormat = normalizeWeekDisplayFormat(readString(viewConfig.get('weekDisplayFormat'), plugin.settings.weekDisplayFormat), plugin.settings.weekDisplayFormat);

	return {
		mode,
		sortDirection,
		collapseEmptyYears,
		collapseLimit,
		collapseEmptyMonths,
		weekDisplayFormat,
	};
}

export class ReleaseTimelineBasesView extends BasesView {
	readonly type = RELEASE_TIMELINE_VIEW_TYPE;

	private readonly plugin: ReleaseTimeline;
	private readonly rootEl: HTMLElement;

	constructor(controller: QueryController, parentEl: HTMLElement, plugin: ReleaseTimeline) {
		super(controller);
		this.plugin = plugin;
		this.rootEl = parentEl.createDiv('release-timeline-bases-view');
	}

	public onDataUpdated(): void {
		this.rootEl.empty();

		const options = resolveTimelineOptions(this.plugin, this.config);
		const datePropertyId = readPropertyId(this.config, 'dateProperty', 'note.date');
		const labelPropertyId = readPropertyId(this.config, 'labelProperty', 'file.name');
		const records = extractTimelineRecords(this.data.data, datePropertyId, labelPropertyId);

		if (records.length === 0) {
			this.rootEl.appendChild(createErrorTable('No notes in this base contain a usable timeline date.'));
			return;
		}

		const rows = buildTimelineRows(records, options);
		this.rootEl.appendChild(renderTimelineTable(rows, { bulletPoints: readBoolean(this.config.get('bulletPoints'), this.plugin.settings.bulletPoints) }));
	}
}
