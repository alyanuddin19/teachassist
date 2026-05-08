import { Component, Input } from '@angular/core';
import { ApiService } from '../../core/services/api.service';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

@Component({
  selector: 'app-ai-assistant',
  templateUrl: './ai-assistant.component.html',
  styleUrls: ['./ai-assistant.component.css']
})
export class AiAssistantComponent {
  @Input() role = 'teacher';
  @Input() page = 'dashboard';
  @Input() title = 'Ask AI';

  open = false;
  sending = false;
  draft = '';
  error = '';
  messages: ChatMessage[] = [
    {
      role: 'assistant',
      content: 'Hi. I can help you use this dashboard, explain workflows, or help draft academic content.'
    }
  ];

  constructor(private api: ApiService) {}

  toggle(): void {
    this.open = !this.open;
    this.error = '';
  }

  onComposerEnter(event: KeyboardEvent): void {
    if (event.shiftKey) {
      return;
    }

    event.preventDefault();
    this.send();
  }

  close(): void {
    this.open = false;
    this.error = '';
  }

  send(): void {
    const message = this.draft.trim();
    if (!message || this.sending) {
      return;
    }

    this.messages = [...this.messages, { role: 'user', content: message }];
    this.draft = '';
    this.sending = true;
    this.error = '';

    const history = this.messages
      .filter((item) => item.content.trim())
      .slice(-10)
      .map((item) => ({ role: item.role, content: item.content }));

    this.api.chatWithPromptGeneratorAi({
      message,
      history,
      role: this.role,
      page: this.page
    }).subscribe({
      next: (res) => {
        this.sending = false;
        this.messages = [...this.messages, { role: 'assistant', content: res.reply }];
      },
      error: (err) => {
        this.sending = false;
        this.error = err.error?.detail || 'AI assistant is unavailable right now.';
      }
    });
  }
}
