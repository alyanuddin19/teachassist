import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface LiveSheetMessage {
  teacher: string;
  department: string;
  section: string;
  total_marks: number;
  student_count: number;
  selected_options: Record<string, string>;
  time: string;
}

@Injectable({ providedIn: 'root' })
export class WebsocketService {
  private socket?: WebSocket;
  readonly messages$ = new Subject<LiveSheetMessage>();

  connect() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }

    this.socket = new WebSocket('ws://localhost:8000/ws');
    this.socket.onmessage = (event) => {
      this.messages$.next(JSON.parse(event.data) as LiveSheetMessage);
    };
  }

  disconnect() {
    this.socket?.close();
    this.socket = undefined;
  }
}
