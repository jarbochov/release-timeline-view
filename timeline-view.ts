import { App, BasesEntry, BasesView, QueryController } from 'obsidian';
import type ReleaseTimeline from './main';
import { buildTimelineRows, parseTimelineDate, ItemLayout, TimelineBuildOptions, TimelineRecord, TimelineMode, SortDirection, WeekDisplayFormat } from './timeline-core';
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

function normalizeItemLayout(value: string, fallback: ItemLayout): ItemLayout {
	return value === 'stacked' || value === 'inline' ? value : fallback;
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

function getPropertyCandidates(propertyId: string): string[] {
	const candidates = new Set<string>([propertyId]);
	const stripped = propertyId.replace(/^(note|file|formula)\./, '');
	candidates.add(stripped);
	return [...candidates];
}

function readFrontmatterValue(app: App, entry: BasesEntry, propertyId: string): unknown {
	const [prefix, ...rest] = propertyId.split('.');
	const rawProperty = rest.join('.');

	if (prefix === 'file') {
		return entry.file.basename;
	}

	const cache = app.metadataCache.getFileCache(entry.file);
	if (cache?.frontmatter && Object.prototype.hasOwnProperty.call(cache.frontmatter, rawProperty)) {
		return cache.frontmatter[rawProperty];
	}

	return null;
}

function readEntryValue(app: App, entry: BasesEntry, propertyId: string): unknown {
	for (const candidate of getPropertyCandidates(propertyId)) {
		const [prefix] = candidate.split('.');
		if (prefix === 'note' || prefix === '') {
			const frontmatterValue = readFrontmatterValue(app, entry, candidate);
			if (frontmatterValue !== null && frontmatterValue !== undefined) {
				return frontmatterValue;
			}
		}

		if (prefix === 'file' && candidate === 'file.name') {
			return entry.file.basename;
		}

		try {
			const value = entry.getValue(candidate as Parameters<BasesEntry['getValue']>[0]);
			if (value !== null && value !== undefined) {
				return value.toString();
			}
		} catch (error) {
			// Ignore unsupported property ids and try the next candidate.
		}
	}

	return null;
}

function readRecordLabel(app: App, entry: BasesEntry, propertyId: string): string {
	const value = readEntryValue(app, entry, propertyId);
	if (value !== null && value !== undefined) {
		const text = String(value).trim();
		if (text.length > 0) {
			return text;
		}
	}

	return entry.file.basename;
}

function extractTimelineRecords(app: App, entries: BasesEntry[], datePropertyId: string, labelPropertyId: string): TimelineRecord[] {
	const records: TimelineRecord[] = [];

	for (const entry of entries) {
		let date = null;
		for (const candidate of getPropertyCandidates(datePropertyId)) {
			const value = readEntryValue(app, entry, candidate);
			date = parseTimelineDate(value);
			if (date) {
				break;
			}
		}

		if (!date) {
			continue;
		}

		records.push({
			filePath: entry.file.path,
			displayName: readRecordLabel(app, entry, labelPropertyId),
			date,
		});
	}

	return records;
}

function resolveTimelineOptions(plugin: ReleaseTimeline, viewConfig: BasesView['config']): TimelineBuildOptions {
	const mode = normalizeMode(readString(viewConfig.get('mode'), plugin.settings.defaultTimelineMode), plugin.settings.defaultTimelineMode);
	const sortDirection = normalizeSortDirection(readString(viewConfig.get('sortDirection'), plugin.settings.defaultSortOrder), plugin.settings.defaultSortOrder);
	const itemLayout = normalizeItemLayout(readString(viewConfig.get('itemLayout'), plugin.settings.defaultItemLayout), plugin.settings.defaultItemLayout);
	const collapseEmptyYears = readBoolean(viewConfig.get('collapseEmptyYears'), plugin.settings.collapseEmptyYears);
	const collapseLimit = Math.max(1, readNumber(viewConfig.get('collapseLimit'), Number.parseInt(plugin.settings.collapseLimit, 10) || 2));
	const collapseEmptyMonths = readBoolean(viewConfig.get('collapseEmptyMonths'), plugin.settings.collapseEmptyMonthsWeeklyTimeline);
	const weekDisplayFormat = normalizeWeekDisplayFormat(readString(viewConfig.get('weekDisplayFormat'), plugin.settings.weekDisplayFormat), plugin.settings.weekDisplayFormat);

	return {
		mode,
		sortDirection,
		itemLayout,
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
		const records = extractTimelineRecords(this.plugin.app, this.data.data, datePropertyId, labelPropertyId);

		if (records.length === 0) {
			this.rootEl.appendChild(createErrorTable('No notes in this base contain a usable timeline date.'));
			return;
		}

		const rows = buildTimelineRows(records, options);
		this.rootEl.appendChild(renderTimelineTable(rows, {
			bulletPoints: readBoolean(this.config.get('bulletPoints'), this.plugin.settings.bulletPoints),
			itemLayout: normalizeItemLayout(readString(this.config.get('itemLayout'), this.plugin.settings.defaultItemLayout), this.plugin.settings.defaultItemLayout),
			colors: this.plugin.settings,
		}));
	}
}
