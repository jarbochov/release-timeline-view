import { App, BasesEntry, BasesView, HoverParent, QueryController } from 'obsidian';
import type ReleaseTimeline from './main';
import { buildTimelineRows, parseTimelineDate, AccentAlternationMode, ItemLayout, TimelineBuildOptions, TimelineRecord, TimelineMode, SortDirection, WeekDisplayFormat } from './timeline-core';
import { createErrorTable, renderTimelineTable } from './timeline-renderer';

export const RELEASE_TIMELINE_VIEW_TYPE = 'release-timeline';

function readBoolean(value: unknown, fallback: boolean): boolean {
	if (typeof value === 'boolean') {
		return value;
	}

	if (value !== null && value !== undefined) {
		const text = String(value).trim().toLowerCase();
		if (text === 'true') {
			return true;
		}
		if (text === 'false') {
			return false;
		}
	}

	return fallback;
}

function readString(value: unknown, fallback: string): string {
	if (typeof value === 'string') {
		const text = value.trim();
		if (text.length > 0) {
			return text;
		}
	}

	if (value !== null && value !== undefined) {
		const text = String(value).trim();
		if (text.length > 0 && text !== '[object Object]') {
			return text;
		}
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
	return value === 'weekNames' || value === 'dateNames' || value === 'monthDayRange' ? value : fallback;
}

function normalizeItemLayout(value: string, fallback: ItemLayout): ItemLayout {
	return value === 'stacked' || value === 'inline' ? value : fallback;
}

function normalizeAccentAlternationMode(value: string, fallback: AccentAlternationMode): AccentAlternationMode {
	return value === 'none' || value === 'year' || value === 'month' || value === 'both' ? value : fallback;
}

function normalizeLegacyColorAlternation(value: string): 'year' | 'month' {
	return value === 'month' ? 'month' : 'year';
}

function readAccentAlternationMode(plugin: ReleaseTimeline, viewConfig: BasesView['config']): AccentAlternationMode {
	const newValue = normalizeAccentAlternationMode(
		readString(viewConfig.get('accentAlternationMode'), plugin.settings.accentAlternationMode),
		plugin.settings.accentAlternationMode,
	);

	if (newValue !== plugin.settings.accentAlternationMode || viewConfig.get('accentAlternationMode') !== undefined) {
		return newValue;
	}

	const legacyDirection = normalizeLegacyColorAlternation(
		readString(viewConfig.get('colorAlternationBy'), 'year'),
	);
	const legacyEnabled = readBoolean(viewConfig.get('alternateAccentColors'), plugin.settings.accentAlternationMode !== 'none');

	if (!legacyEnabled) {
		return 'none';
	}

	return legacyDirection === 'year' ? 'year' : 'month';
}

function normalizePropertyId(value: string): string | null {
	const text = value.trim();
	if (!text) {
		return null;
	}
	return text.replace(/^(note|file|formula)\./, '');
}

function humanizePropertyLabel(propertyId: string): string {
	const base = propertyId.split('.').pop() ?? propertyId;
	return base
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/[_-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function readQueryProperties(value: unknown): string[] {
	if (!value) {
		return [];
	}

	const propertyIds: string[] = [];

	const rawItems: unknown[] = Array.isArray(value)
		? value
		: typeof value === 'object'
			? Object.keys(value as Record<string, unknown>)
			: [];

	for (const item of rawItems) {
		if (typeof item === 'string') {
			const trimmed = item.trim();
			if (trimmed) {
				propertyIds.push(trimmed);
			}
			continue;
		}

		if (item && typeof item === 'object') {
			const record = item as Record<string, unknown>;
			const candidate = String(record.id ?? record.propertyId ?? record.key ?? record.value ?? '').trim();
			if (candidate) {
				propertyIds.push(candidate);
			}
		}
	}

	return [...new Set(propertyIds)];
}

function readInlinePropertyIdsFromBaseText(text: string): string[] {
	const timelineViewMatch = text.match(/^\s*-\s*type:\s*release-timeline\b[\s\S]*?(?=^\s*-\s*type:|$)/m);
	if (!timelineViewMatch) {
		return [];
	}

	const section = timelineViewMatch[0];
	const propertySectionMatch = section.match(/^\s*(?:order|properties):\s*([\s\S]*?)(?=^\s*\w+:\s*|$)/m);
	if (!propertySectionMatch) {
		return [];
	}

	const matches = propertySectionMatch[1].match(/^\s*-\s*(.+)$/gm) ?? [];
	return readQueryProperties(matches.map((line) => line.replace(/^\s*-\s*/, '')));
}

function normalizeWidth(value: unknown, fallback: number): number {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}

	if (value !== null && value !== undefined) {
		const parsed = Number.parseInt(String(value), 10);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}

	return fallback;
}

function readNumber(value: unknown, fallback: number): number {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}

	if (value !== null && value !== undefined) {
		const parsed = Number.parseInt(String(value), 10);
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
	const rawProperty = prefix === 'note' ? rest.join('.') : propertyId;

	const cache = app.metadataCache.getFileCache(entry.file);
	if (cache?.frontmatter && Object.prototype.hasOwnProperty.call(cache.frontmatter, rawProperty)) {
		return cache.frontmatter[rawProperty];
	}

	return null;
}

function readFileValue(entry: BasesEntry, propertyId: string): unknown {
	switch (propertyId) {
		case 'file.name':
		case 'file.basename':
		case 'file.fullname':
			return entry.file.basename;
		case 'file.path':
			return entry.file.path;
		case 'file.folder':
			return entry.file.parent?.path ?? '';
		case 'file.ext':
			return entry.file.extension;
		case 'file.size':
			return entry.file.stat.size;
		case 'file.ctime':
			return new Date(entry.file.stat.ctime).toISOString().slice(0, 10);
		case 'file.mtime':
			return new Date(entry.file.stat.mtime).toISOString().slice(0, 10);
		default:
			return null;
	}
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

		if (prefix === 'file') {
			const fileValue = readFileValue(entry, candidate);
			if (fileValue !== null && fileValue !== undefined) {
				return fileValue;
			}
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
		if (text.length > 0 && text !== 'null' && text !== 'undefined' && text !== '[object Object]') {
			return text;
		}
	}

	return entry.file.basename;
}

function extractTimelineRecords(app: App, entries: BasesEntry[], datePropertyId: string, labelPropertyId: string, inlinePropertyIds: string[]): TimelineRecord[] {
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

		const inlineProperties = inlinePropertyIds
			.filter((propertyId) => propertyId !== datePropertyId && propertyId !== labelPropertyId)
			.map((propertyId) => {
				const value = readEntryValue(app, entry, propertyId);
				const text = value === null || value === undefined ? '' : String(value).trim();
				return text && text !== 'null' && text !== 'undefined' && text !== '[object Object]'
					? { label: humanizePropertyLabel(propertyId), value: text }
					: null;
			})
			.filter((property): property is { label: string; value: string } => property !== null);

		records.push({
			filePath: entry.file.path,
			displayName: readRecordLabel(app, entry, labelPropertyId),
			date,
			inlineProperties,
		});
	}

	return records;
}

function resolveTimelineOptions(plugin: ReleaseTimeline, viewConfig: BasesView['config']): TimelineBuildOptions {
	const mode = normalizeMode(readString(viewConfig.get('mode'), plugin.settings.defaultTimelineMode), plugin.settings.defaultTimelineMode);
	const sortDirection = normalizeSortDirection(readString(viewConfig.get('sortDirection'), plugin.settings.defaultSortOrder), plugin.settings.defaultSortOrder);
	const itemLayout = normalizeItemLayout(readString(viewConfig.get('itemLayout'), plugin.settings.defaultItemLayout), plugin.settings.defaultItemLayout);
	const accentAlternationMode = readAccentAlternationMode(plugin, viewConfig);
	const collapseEmptyYears = readBoolean(viewConfig.get('collapseEmptyYears'), plugin.settings.collapseEmptyYears);
	const collapseLimit = Math.max(1, readNumber(viewConfig.get('collapseLimit'), Number.parseInt(plugin.settings.collapseLimit, 10) || 2));
	const collapseEmptyMonths = readBoolean(viewConfig.get('collapseEmptyMonths'), plugin.settings.collapseEmptyMonthsWeeklyTimeline);
	const weekDisplayFormat = normalizeWeekDisplayFormat(readString(viewConfig.get('weekDisplayFormat'), plugin.settings.weekDisplayFormat), plugin.settings.weekDisplayFormat);
	const widthPx = Math.max(400, normalizeWidth(viewConfig.get('widthPx'), plugin.settings.defaultWidthPx));

	return {
		mode,
		sortDirection,
		itemLayout,
		accentAlternationMode,
		showYearBar: readBoolean(viewConfig.get('showYearBar'), true),
		collapseEmptyYears,
		collapseLimit,
		collapseEmptyMonths,
		weekDisplayFormat,
		widthPx,
	};
}

export class ReleaseTimelineBasesView extends BasesView implements HoverParent {
	readonly type = RELEASE_TIMELINE_VIEW_TYPE;

	private readonly plugin: ReleaseTimeline;
	private readonly rootEl: HTMLElement;

	constructor(controller: QueryController, parentEl: HTMLElement, plugin: ReleaseTimeline) {
		super(controller);
		this.plugin = plugin;
		this.rootEl = parentEl.createDiv('release-timeline-bases-view');
	}

	public async onDataUpdated(): Promise<void> {
		this.rootEl.empty();
		this.rootEl.style.setProperty('max-width', `${this.plugin.settings.defaultWidthPx}px`);

		const options = resolveTimelineOptions(this.plugin, this.config);
		const datePropertyId = readPropertyId(this.config, 'dateProperty', 'note.date');
		const labelPropertyId = readPropertyId(this.config, 'labelProperty', 'file.name');
		const releaseTimelineView = (this.query as { views?: Array<{ type?: string; order?: unknown; properties?: unknown }> } | undefined)?.views?.find((view) => view?.type === RELEASE_TIMELINE_VIEW_TYPE);
		let inlineProperties = readQueryProperties(releaseTimelineView?.order ?? releaseTimelineView?.properties ?? this.config.get('order') ?? this.config.get('properties') ?? this.query?.properties);

		if (inlineProperties.length === 0) {
			const activeFile = this.plugin.app.workspace.getActiveFile();
			if (activeFile?.extension === 'base') {
				const text = await this.plugin.app.vault.cachedRead(activeFile);
				inlineProperties = readInlinePropertyIdsFromBaseText(text);
			}
		}

		const records = extractTimelineRecords(this.plugin.app, this.data.data, datePropertyId, labelPropertyId, inlineProperties);

		if (records.length === 0) {
			this.rootEl.appendChild(createErrorTable('No notes in this base contain a usable timeline date.'));
			return;
		}

		const rows = buildTimelineRows(records, options);
		this.rootEl.appendChild(renderTimelineTable(rows, {
			bulletPoints: readBoolean(this.config.get('bulletPoints'), this.plugin.settings.bulletPoints),
			itemLayout: normalizeItemLayout(readString(this.config.get('itemLayout'), this.plugin.settings.defaultItemLayout), this.plugin.settings.defaultItemLayout),
			accentAlternationMode: readAccentAlternationMode(this.plugin, this.config),
			showYearBar: options.showYearBar,
			widthPx: options.widthPx,
			colors: this.plugin.settings,
			app: this.plugin.app,
			hoverParent: this,
		}));
	}
}
