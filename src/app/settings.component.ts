import { Component } from '@angular/core';
import { SETTINGS_SECTIONS, SettingsSection, SettingsField } from './data';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
})
export class Settings {
  sections = SETTINGS_SECTIONS;
  activeSection = 'general';

  currentSection(): SettingsSection | undefined {
    return this.sections.find(s => s.key === this.activeSection);
  }

  toggleField(_section: SettingsSection, _field: SettingsField): void {
    _field.value = !_field.value;
  }

  sectionHint(key: string): string {
    const hints: Record<string, string> = {
      general: 'Basic application and company-wide configuration',
      warehouse: 'Default warehouse behavior and automation rules',
      notifications: 'Control when and how you receive operational alerts',
      security: 'Authentication, session and access control policies',
      system: 'Display, language and user interface preferences',
    };
    return hints[key] ?? '';
  }
}
