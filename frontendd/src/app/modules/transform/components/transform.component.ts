import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-transform',
  templateUrl: './transform.component.html',
  styleUrls: ['./transform.screen.css']
})
export class TransformComponent implements OnInit {
  showRecords = false;

  ngOnInit(): void {
    if (sessionStorage.getItem('transform:openRecords') === 'true') {
      this.showRecords = true;
      sessionStorage.removeItem('transform:openRecords');
    }
  }

  toggleRecords(): void {
    this.showRecords = !this.showRecords;
  }

  closeRecords(): void {
    this.showRecords = false;
  }
}
