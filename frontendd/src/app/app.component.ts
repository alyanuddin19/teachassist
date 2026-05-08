import { Component, OnInit } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {
  constructor(
    private router: Router,
    private themeService: ThemeService
  ) {}

  ngOnInit(): void {
    localStorage.clear();
    sessionStorage.clear();
    this.themeService.initializeTheme();

    if (this.router.url !== '/login') {
      this.router.navigate(['/login']);
      return;
    }

    this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart && event.url === '/login') {
        sessionStorage.removeItem('lastActiveRoute');
      }
    });
  }
}
