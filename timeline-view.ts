/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- Obsidian Bases exposes dynamic runtime values that cannot be fully typed. */
import { App, BasesEntry, BasesView, HoverParent, QueryController, TFile } from 'obsidian';
import { DateTime } from 'luxon';
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

function readText(value: unknown, fallback: string): string {
	if (typeof value === 'string') {
		return value.length > 0 ? value : fallback;
	}

	if (value !== null && value !== undefined) {
		const text = String(value);
		return text.length > 0 ? text : fallback;
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

function humanizePropertyLabel(propertyId: string): string {
	const base = propertyId.split('.').pop() ?? propertyId;
	if (base === 'ctime') {
		return 'created time';
	}
	if (base === 'mtime') {
		return 'modified time';
	}
	return base
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/[_-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function readPropertyDisplayName(viewConfig: BasesView['config'], propertyId: string): string {
	try {
		const displayName = viewConfig.getDisplayName(propertyId);
		const text = String(displayName).trim();
		if (text.length > 0) {
			return text;
		}
	} catch {
		// Fall back to a humanized name below.
	}

	return humanizePropertyLabel(propertyId);
}

function formatInlinePropertyValue(propertyId: string, value: unknown): string {
	if (propertyId === 'file.ctime' || propertyId === 'file.mtime') {
		const millis = typeof value === 'number' ? value : Number(value);
		if (Number.isFinite(millis)) {
			return DateTime.fromMillis(millis).toFormat('yyyy - LL - dd, hh:mm:ss a');
		}
	}

	return String(value).trim();
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
	const lines = text.split(/\r?\n/);
	const startIndex = lines.findIndex((line) => /^\s*-\s*type:\s*release-timeline\b/.test(line));
	if (startIndex === -1) {
		return [];
	}

	const startIndent = lines[startIndex].match(/^(\s*)/)?.[1] ?? '';
	const sectionLines: string[] = [];

	for (let index = startIndex; index < lines.length; index += 1) {
		const line = lines[index];
		if (index > startIndex && new RegExp(`^${startIndent}-\\s*type:\\s*`).test(line)) {
			break;
		}
		sectionLines.push(line);
	}

	const section = sectionLines.join('\n');
	const sectionLinesSplit = section.split(/\r?\n/);
	const propertyIds: string[] = [];

	for (let index = 0; index < sectionLinesSplit.length; index += 1) {
		const line = sectionLinesSplit[index];
		const match = line.match(/^(\s*)(?:order|properties):\s*(.*)$/);
		if (!match) {
			continue;
		}

		const keyIndent = match[1].length;
		const inlineValue = match[2].trim();

		if (inlineValue) {
			const cleaned = inlineValue
				.replace(/^[\[(]\s*/, '')
				.replace(/\s*[\])]$/, '');
			const pieces = cleaned.includes(',') ? cleaned.split(',') : [cleaned];
			for (const piece of pieces) {
				const candidate = piece.trim().replace(/^['"]|['"]$/g, '');
				if (candidate) {
					propertyIds.push(candidate);
				}
			}
			break;
		}

		for (let offset = index + 1; offset < sectionLinesSplit.length; offset += 1) {
			const nextLine = sectionLinesSplit[offset];
			if (!nextLine.trim()) {
				continue;
			}

			const nextIndent = nextLine.match(/^(\s*)/)?.[1].length ?? 0;
			if (nextIndent <= keyIndent) {
				break;
			}

			const itemMatch = nextLine.match(/^\s*-\s*(.+)$/);
			if (itemMatch) {
				const candidate = itemMatch[1].trim().replace(/^['"]|['"]$/g, '');
				if (candidate) {
					propertyIds.push(candidate);
				}
			}
		}

		break;
	}

	return [...new Set(propertyIds)];
}

function extractBaseEmbeds(text: string): Array<{ path: string; fragment: string }> {
	const embeds: Array<{ path: string; fragment: string }> = [];
	const pattern = /!\[\[([^\]#|]+?\.base)(?:#([^\]|]+))?(?:\|[^\]]+)?\]\]/g;

	for (const match of text.matchAll(pattern)) {
		const path = match[1]?.trim();
		if (!path) {
			continue;
		}

		embeds.push({
			path,
			fragment: (match[2] ?? '').trim(),
		});
	}

	return embeds;
}

async function readInlinePropertyIdsFromEmbedContext(app: App, activeFile: TFile, preferredViewName: string): Promise<string[]> {
	const activeText = await app.vault.cachedRead(activeFile);
	const embeds = extractBaseEmbeds(activeText);
	const preferred = preferredViewName.trim().toLowerCase();
	const orderedEmbeds = preferred
		? [
			...embeds.filter((embed) => embed.fragment.trim().toLowerCase() === preferred),
			...embeds.filter((embed) => embed.fragment.trim().toLowerCase() !== preferred),
		]
		: embeds;

	for (const embed of orderedEmbeds) {
		const resolved = app.metadataCache.getFirstLinkpathDest(embed.path, activeFile.path);
		if (!resolved || resolved.extension !== 'base') {
			continue;
		}

		const text = await app.vault.cachedRead(resolved);
		const properties = readInlinePropertyIdsFromBaseText(text);
		if (properties.length > 0) {
			return properties;
		}
	}

	return [];
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
			return entry.file.stat.ctime;
		case 'file.mtime':
			return entry.file.stat.mtime;
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
			const value = entry.getValue(candidate);
			if (value !== null && value !== undefined) {
				return value.toString();
			}
		} catch {
			// Ignore unsupported property ids and try the next candidate.
		}
	}
	/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- Re-enable after the dynamic Bases value helpers. */

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

function extractTimelineRecords(app: App, viewConfig: BasesView['config'], entries: BasesEntry[], datePropertyId: string, labelPropertyId: string, inlinePropertyIds: string[]): TimelineRecord[] {
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
				const text = value === null || value === undefined ? '' : formatInlinePropertyValue(propertyId, value);
				return text && text !== 'null' && text !== 'undefined' && text !== '[object Object]'
					? { label: readPropertyDisplayName(viewConfig, propertyId), value: text }
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

function readInlinePropertyIds(view: ReleaseTimelineBasesView): string[] {
	const ordered = view.config.getOrder();
	if (ordered.length > 0) {
		return ordered.map((propertyId) => String(propertyId));
	}

	const queryProperties = view.data.properties ?? [];
	if (queryProperties.length > 0) {
		return queryProperties.map((propertyId) => String(propertyId));
	}

	const releaseTimelineView = (view.query as { views?: Array<{ type?: string; order?: unknown; properties?: unknown }> } | undefined)?.views?.find((entry) => entry?.type === RELEASE_TIMELINE_VIEW_TYPE);
	const fromConfig = readQueryProperties(releaseTimelineView?.order ?? releaseTimelineView?.properties ?? view.config.get('order') ?? view.config.get('properties'));
	if (fromConfig.length > 0) {
		return fromConfig;
	}

	return [];
}

function resolveTimelineOptions(plugin: ReleaseTimeline, viewConfig: BasesView['config']): TimelineBuildOptions {
	const mode = normalizeMode(readString(viewConfig.get('mode'), plugin.settings.defaultTimelineMode), plugin.settings.defaultTimelineMode);
	const sortDirection = normalizeSortDirection(readString(viewConfig.get('sortDirection'), plugin.settings.defaultSortOrder), plugin.settings.defaultSortOrder);
	const itemLayout = normalizeItemLayout(readString(viewConfig.get('itemLayout'), plugin.settings.defaultItemLayout), plugin.settings.defaultItemLayout);
	const inlineDelimiter = readText(viewConfig.get('inlineDelimiter'), ', ');
	const accentAlternationMode = readAccentAlternationMode(plugin, viewConfig);
	const collapseEmptyYears = readBoolean(viewConfig.get('collapseEmptyYears'), plugin.settings.collapseEmptyYears);
	const collapseLimit = Math.max(1, readNumber(viewConfig.get('collapseLimit'), Number.parseInt(plugin.settings.collapseLimit, 10) || 2));
	const collapseEmptyWeeks = readBoolean(viewConfig.get('collapseEmptyWeeks'), plugin.settings.collapseEmptyWeeksWeeklyTimeline);
	const collapseEmptyMonths = readBoolean(viewConfig.get('collapseEmptyMonths'), plugin.settings.collapseEmptyMonthsWeeklyTimeline);
	const weekDisplayFormat = normalizeWeekDisplayFormat(readString(viewConfig.get('weekDisplayFormat'), plugin.settings.weekDisplayFormat), plugin.settings.weekDisplayFormat);
	const widthPx = Math.max(400, normalizeWidth(viewConfig.get('widthPx'), plugin.settings.defaultWidthPx));

	return {
		mode,
		sortDirection,
		itemLayout,
		inlineDelimiter,
		accentAlternationMode,
		showYearBar: readBoolean(viewConfig.get('showYearBar'), true),
		collapseEmptyYears,
		collapseLimit,
		collapseEmptyWeeks,
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

		const options = resolveTimelineOptions(this.plugin, this.config);
		const instanceId = `release-timeline-${Date.now().toString(36)}`;
		this.rootEl.dataset.releaseTimelineInstance = instanceId;
		this.rootEl.style.setProperty('--release-timeline-width', `${options.widthPx}px`);
		this.rootEl.style.setProperty('--release-timeline-max-width', `${options.widthPx}px`);
		this.rootEl.style.width = `${options.widthPx}px`;
		this.rootEl.style.maxWidth = `${options.widthPx}px`;
		const style = document.createElement('style');
		style.textContent = `
.release-timeline-bases-view[data-release-timeline-instance="${instanceId}"] {
	max-width: ${options.widthPx}px;
}
.release-timeline-bases-view[data-release-timeline-instance="${instanceId}"] .release-timeline {
	width: ${options.widthPx}px;
}
.release-timeline-bases-view[data-release-timeline-instance="${instanceId}"] .release-timeline-year-bar--primary,
.release-timeline-bases-view[data-release-timeline-instance="${instanceId}"] .release-timeline-accent-cell--primary {
	background-color: ${this.plugin.settings.accentPrimaryColor};
}
.release-timeline-bases-view[data-release-timeline-instance="${instanceId}"] .release-timeline-year-bar--alternate,
.release-timeline-bases-view[data-release-timeline-instance="${instanceId}"] .release-timeline-accent-cell--alternate {
	background-color: ${this.plugin.settings.accentAlternateColor};
}`;
		this.rootEl.appendChild(style);
		const viewName = readString(this.config.get('name'), '');
		const datePropertyId = readPropertyId(this.config, 'dateProperty', 'note.date');
		const labelPropertyId = readPropertyId(this.config, 'labelProperty', 'file.name');
		let inlineProperties = readInlinePropertyIds(this);

		if (inlineProperties.length === 0) {
			const activeFile = this.plugin.app.workspace.getActiveFile();
			if (activeFile?.extension === 'base') {
				const text = await this.plugin.app.vault.cachedRead(activeFile);
				inlineProperties = readInlinePropertyIdsFromBaseText(text);
			} else if (activeFile) {
				inlineProperties = await readInlinePropertyIdsFromEmbedContext(this.plugin.app, activeFile, viewName);
			}
		}

		const records = extractTimelineRecords(this.plugin.app, this.config, this.data.data, datePropertyId, labelPropertyId, inlineProperties);

		if (records.length === 0) {
			this.rootEl.appendChild(createErrorTable('No notes in this base contain a usable timeline date.'));
			return;
		}

		const rows = buildTimelineRows(records, options);
		this.rootEl.appendChild(renderTimelineTable(rows, {
			bulletPoints: readBoolean(this.config.get('bulletPoints'), this.plugin.settings.bulletPoints),
			itemLayout: normalizeItemLayout(readString(this.config.get('itemLayout'), this.plugin.settings.defaultItemLayout), this.plugin.settings.defaultItemLayout),
			inlineDelimiter: options.inlineDelimiter,
			accentAlternationMode: readAccentAlternationMode(this.plugin, this.config),
			showYearBar: options.showYearBar,
			mode: options.mode,
			widthPx: options.widthPx,
			instanceId,
			colors: this.plugin.settings,
			app: this.plugin.app,
			hoverParent: this,
		}));
	}
}
