import { App, PluginSettingTab, Setting } from 'obsidian';
import type ReleaseTimeline from './main';
import { AccentAlternationMode, ItemLayout, SortDirection, TimelineMode, WeekDisplayFormat } from './timeline-core';

export interface ReleaseTimelineSettings {
	defaultTimelineMode: TimelineMode;
	defaultSortOrder: SortDirection;
	defaultItemLayout: ItemLayout;
	accentAlternationMode: AccentAlternationMode;
	defaultWidthPx: number;
	collapseEmptyYears: boolean;
	bulletPoints: boolean;
	collapseLimit: string;
	collapseEmptyMonthsWeeklyTimeline: boolean;
	weekDisplayFormat: WeekDisplayFormat;
	accentPrimaryColor: string;
	accentAlternateColor: string;
}

export const DEFAULT_SETTINGS: ReleaseTimelineSettings = {
	defaultTimelineMode: 'year',
	defaultSortOrder: 'desc',
	defaultItemLayout: 'stacked',
	accentAlternationMode: 'both',
	defaultWidthPx: 900,
	collapseEmptyYears: false,
	bulletPoints: true,
	collapseLimit: '2',
	collapseEmptyMonthsWeeklyTimeline: true,
	weekDisplayFormat: 'dateNames',
	accentPrimaryColor: '#0BDA51',
	accentAlternateColor: '#5E6C7A',
};

export class ReleaseTimelineSettingTab extends PluginSettingTab {
	plugin: ReleaseTimeline;

	constructor(app: App, plugin: ReleaseTimeline) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h3', { text: 'Default view settings' });

		new Setting(containerEl)
			.setName('Default timeline mode')
			.setDesc('Used when creating a new Release Timeline view.')
			.addDropdown((dropdown) => {
				dropdown.addOption('year', 'Year');
				dropdown.addOption('month', 'Month');
				dropdown.addOption('week', 'Week');
				dropdown.setValue(this.plugin.settings.defaultTimelineMode);
				dropdown.onChange(async (value: TimelineMode) => {
					this.plugin.settings.defaultTimelineMode = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Default sort order')
			.setDesc('Used when a view does not specify a sort direction.')
			.addDropdown((dropdown) => {
				dropdown.addOption('asc', 'Ascending');
				dropdown.addOption('desc', 'Descending');
				dropdown.setValue(this.plugin.settings.defaultSortOrder);
				dropdown.onChange(async (value: SortDirection) => {
					this.plugin.settings.defaultSortOrder = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Default item layout')
			.setDesc('Controls whether multiple items in a period stack vertically or appear inline.')
			.addDropdown((dropdown) => {
				dropdown.addOption('stacked', 'Stacked');
				dropdown.addOption('inline', 'Inline with delimiter');
				dropdown.setValue(this.plugin.settings.defaultItemLayout);
				dropdown.onChange(async (value: ItemLayout) => {
					this.plugin.settings.defaultItemLayout = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Accent alternation')
			.setDesc('Controls whether the accent colors alternate by year, month/week, both, or not at all.')
			.addDropdown((dropdown) => {
				dropdown.addOption('none', 'None');
				dropdown.addOption('year', 'Year only');
				dropdown.addOption('month', 'Month/week only');
				dropdown.addOption('both', 'Year and month/week');
				dropdown.setValue(this.plugin.settings.accentAlternationMode);
				dropdown.onChange(async (value: AccentAlternationMode) => {
					this.plugin.settings.accentAlternationMode = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Default width')
			.setDesc('Sets the timeline width in pixels.')
			.addSlider((slider) => {
				slider.setLimits(400, 1600, 25);
				slider.setValue(this.plugin.settings.defaultWidthPx);
				slider.setDynamicTooltip();
				slider.onChange(async (value) => {
					this.plugin.settings.defaultWidthPx = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Bullet points')
			.setDesc('Makes multi-item periods easier to scan.')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.bulletPoints);
				toggle.onChange(async (value) => {
					this.plugin.settings.bulletPoints = value;
					await this.plugin.saveSettings();
				});
			});

		containerEl.createEl('h3', { text: 'Year defaults' });

		new Setting(containerEl)
			.setName('Collapse empty years')
			.setDesc('Long runs of empty years can be compressed into a single range row.')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.collapseEmptyYears);
				toggle.onChange(async (value) => {
					this.plugin.settings.collapseEmptyYears = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Minimum number of empty years to collapse')
			.addText((text) =>
				text
					.setPlaceholder('2')
					.setValue(this.plugin.settings.collapseLimit)
					.onChange(async (value) => {
						this.plugin.settings.collapseLimit = value;
						await this.plugin.saveSettings();
					}),
			);

		containerEl.createEl('h3', { text: 'Week defaults' });

		new Setting(containerEl)
			.setName('Collapse empty months')
			.setDesc('Months without entries are reduced to a single row in week mode.')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.collapseEmptyMonthsWeeklyTimeline);
				toggle.onChange(async (value) => {
					this.plugin.settings.collapseEmptyMonthsWeeklyTimeline = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Week formatting')
			.addDropdown((dropdown) => {
				dropdown.addOption('weekNames', 'Week names: W15');
				dropdown.addOption('dateNames', 'Date names: 2025-08-19');
				dropdown.addOption('monthDayRange', 'Date range: Feb 13-20');
				dropdown.setValue(this.plugin.settings.weekDisplayFormat);
				dropdown.onChange(async (value: WeekDisplayFormat) => {
					this.plugin.settings.weekDisplayFormat = value;
					await this.plugin.saveSettings();
				});
			});

		containerEl.createEl('h3', { text: 'Timeline colors' });

		new Setting(containerEl)
			.setName('Primary accent')
			.setDesc('Main color used for accent bars.')
			.addColorPicker((picker) => {
				picker.setValue(this.plugin.settings.accentPrimaryColor);
				picker.onChange(async (value) => {
					this.plugin.settings.accentPrimaryColor = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Alternate accent')
			.setDesc('Secondary color used when alternating accents.')
			.addColorPicker((picker) => {
				picker.setValue(this.plugin.settings.accentAlternateColor);
				picker.onChange(async (value) => {
					this.plugin.settings.accentAlternateColor = value;
					await this.plugin.saveSettings();
				});
			});
	}
}
