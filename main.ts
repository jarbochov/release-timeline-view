/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- Obsidian's Bases APIs are loosely typed at runtime. */
import { Notice, Plugin } from 'obsidian';
import { ReleaseTimelineBasesView, RELEASE_TIMELINE_VIEW_TYPE } from './timeline-view';
import { DEFAULT_SETTINGS, ReleaseTimelineSettingTab, ReleaseTimelineSettings } from './settings';

export default class ReleaseTimeline extends Plugin {
	settings: ReleaseTimelineSettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new ReleaseTimelineSettingTab(this.app, this));
		this.registerReleaseTimelineView();
	}

	onunload() {
		// Bases view lifecycle is managed by Obsidian.
	}

	private registerReleaseTimelineView() {
		const registered = this.registerBasesView(RELEASE_TIMELINE_VIEW_TYPE, {
			name: 'Release Timeline View',
			icon: 'lucide-calendar-range',
			factory: (controller, containerEl) => new ReleaseTimelineBasesView(controller, containerEl, this),
			options: (config) => {
				const shouldShowDelimiter = () => config.get('itemLayout') === 'inline';

				return [
					{
						type: 'dropdown',
						key: 'mode',
						displayName: 'Timeline mode',
						default: this.settings.defaultTimelineMode,
						options: {
							year: 'Year',
							month: 'Month',
							week: 'Week',
						},
					},
					{
						type: 'property',
						key: 'dateProperty',
						displayName: 'Date property',
						default: 'note.date',
					},
					{
						type: 'property',
						key: 'labelProperty',
						displayName: 'Label property',
						default: 'file.name',
					},
					{
						type: 'dropdown',
						key: 'sortDirection',
						displayName: 'Sort direction',
						default: this.settings.defaultSortOrder,
						options: {
							asc: 'Ascending',
							desc: 'Descending',
						},
					},
					{
						type: 'dropdown',
						key: 'itemLayout',
						displayName: 'Item layout',
						default: this.settings.defaultItemLayout,
						options: {
							stacked: 'Stacked',
							inline: 'Inline with delimiter',
						},
					},
					{
						type: 'text',
						key: 'inlineDelimiter',
						displayName: 'Inline delimiter',
						placeholder: ', ',
						default: ', ',
						shouldHide: () => !shouldShowDelimiter(),
					},
					{
						type: 'dropdown',
						key: 'accentAlternationMode',
						displayName: 'Accent alternation',
						default: this.settings.accentAlternationMode,
						options: {
							none: 'None',
							year: 'Year only',
							month: 'Month/week only',
							both: 'Year and month/week',
						},
					},
					{
						type: 'toggle',
						key: 'showYearBar',
						displayName: 'Show year bar',
						default: true,
					},
					{
						type: 'slider',
						key: 'widthPx',
						displayName: 'Width (px)',
						default: this.settings.defaultWidthPx,
						min: 400,
						max: 1600,
						step: 25,
					},
					{
						type: 'toggle',
						key: 'bulletPoints',
						displayName: 'Bullet points in stacked layout',
						default: this.settings.bulletPoints,
					},
					{
						type: 'group',
						displayName: 'Collapse settings',
						items: [
							{
								type: 'toggle',
								key: 'collapseEmptyYears',
								displayName: 'Collapse empty years',
								default: this.settings.collapseEmptyYears,
							},
							{
								type: 'text',
								key: 'collapseLimit',
								displayName: 'Year collapse limit',
								placeholder: '2',
								default: this.settings.collapseLimit,
							},
							{
								type: 'toggle',
								key: 'collapseEmptyWeeks',
								displayName: 'Collapse empty weeks',
								default: this.settings.collapseEmptyWeeksWeeklyTimeline,
							},
							{
								type: 'toggle',
								key: 'collapseEmptyMonths',
								displayName: 'Collapse empty months',
								default: this.settings.collapseEmptyMonthsWeeklyTimeline,
							},
						],
					},
					{
						type: 'dropdown',
						key: 'weekDisplayFormat',
						displayName: 'Week formatting',
						default: this.settings.weekDisplayFormat,
						options: {
							weekNames: 'Week names: W15',
							dateNames: 'Date names: 2025-08-19',
							monthDayRange: 'Date range: Feb 13-20',
						},
					},
				];
			},
		});

		if (!registered) {
			new Notice('Release Timeline View requires Bases to be enabled in Obsidian 1.10 or newer.');
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- Re-enable after the plugin class scope. */
