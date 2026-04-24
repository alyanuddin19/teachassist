import { Component, OnInit } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {
  constructor(private router: Router) {}

  ngOnInit(): void {
    localStorage.clear();
    sessionStorage.clear();

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
