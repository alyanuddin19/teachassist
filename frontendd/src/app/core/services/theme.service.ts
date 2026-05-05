import { Injectable } from '@angular/core';

export type AppTheme = 'light' | 'dark';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly storageKey = 'appTheme';
  private currentTheme: AppTheme = 'light';

  initializeTheme(): void {
    const stored = this.getStoredTheme();
    this.applyTheme(stored);
  }

  toggleTheme(): void {
    this.applyTheme(this.currentTheme === 'dark' ? 'light' : 'dark');
  }

  isDarkMode(): boolean {
    return this.currentTheme === 'dark';
  }

  getTheme(): AppTheme {
    return this.currentTheme;
  }

  private getStoredTheme(): AppTheme {
    if (typeof localStorage === 'undefined') {
      return 'light';
    }

    const stored = localStorage.getItem(this.storageKey);
    return stored === 'dark' ? 'dark' : 'light';
  }

  private applyTheme(theme: AppTheme): void {
    this.currentTheme = theme;
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('theme-dark', theme === 'dark');
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.storageKey, theme);
    }
  }
}
