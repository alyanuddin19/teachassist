import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  initializeTheme(): void {
    this.applyLightTheme();
  }

  isDarkMode(): boolean {
    return false;
  }

  private applyLightTheme(): void {
    if (typeof document !== 'undefined') {
      document.body.classList.remove('theme-dark');
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('appTheme');
    }
  }
}
