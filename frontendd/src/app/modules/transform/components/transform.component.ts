import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { TransformService } from '../services/transform.service';

@Component({
  selector: 'app-transform',
  templateUrl: './transform.component.html',
  styleUrls: ['./transform.screen.css']
})
export class TransformComponent implements OnInit, OnDestroy {
  showRecords = false;
  private subscriptions = new Subscription();

  constructor(private transformService: TransformService) {}

  ngOnInit(): void {
    if (sessionStorage.getItem('transform:openRecords') === 'true') {
      this.showRecords = true;
      sessionStorage.removeItem('transform:openRecords');
    }
    this.subscriptions.add(
      this.transformService.openRecords$.subscribe(() => {
        this.showRecords = true;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  toggleRecords(): void {
    this.showRecords = !this.showRecords;
  }

  closeRecords(): void {
    this.showRecords = false;
  }
}
