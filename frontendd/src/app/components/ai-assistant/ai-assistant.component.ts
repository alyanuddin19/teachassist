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
  @Input() contextHint = '';

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

  onComposerEnter(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.shiftKey) {
      return;
    }

    keyboardEvent.preventDefault();
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

    const pageContext = this.buildPageContext();

    this.api.chatWithPromptGeneratorAi({
      message,
      history,
      role: this.role,
      page: this.page,
      context: pageContext
    }).subscribe({
      next: (res) => {
        this.sending = false;
        this.messages = [...this.messages, { role: 'assistant', content: this.normalizeAssistantReply(res.reply) }];
      },
      error: (err) => {
        this.sending = false;
        this.error = err.error?.detail || 'AI assistant is unavailable right now.';
      }
    });
  }

  private normalizeAssistantReply(content: string): string {
    const normalized = (content || '')
      .replace(/\r/g, '')
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^\s*[-*]\s+/gm, '• ')
      .replace(/^\s*>\s?/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return normalized || 'I am here to help.';
  }

  private buildPageContext(): string {
    if (typeof document === 'undefined') {
      return this.contextHint || '';
    }

    const textFrom = (selector: string, limit = 12): string[] => {
      return Array.from(document.querySelectorAll<HTMLElement>(selector))
        .map((element) => (element.innerText || element.textContent || '').trim())
        .filter(Boolean)
        .filter((value, index, array) => array.indexOf(value) === index)
        .slice(0, limit);
    };

    const headings = textFrom('main h1, main h2, main h3, .content h1, .content h2, .content h3', 10);
    const chips = textFrom('.meta-chip, .tag-chip, .status-chip, .section-kicker, .prompt-label, .config-label', 18);
    const buttons = textFrom('main button, .content button', 16)
      .filter((label) => !['AI', 'Send', 'Close'].includes(label))
      .slice(0, 12);

    const fields = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('main input, main textarea, main select, .content input, .content textarea, .content select'))
      .map((field) => {
        const aria = field.getAttribute('aria-label')?.trim() || '';
        const placeholder = field.getAttribute('placeholder')?.trim() || '';
        const name = field.getAttribute('name')?.trim() || '';
        const label = aria || placeholder || name;
        const rawValue = field instanceof HTMLSelectElement ? field.selectedOptions?.[0]?.text || field.value : field.value;
        const value = (rawValue || '').trim();
        if (!label || !value || field.type === 'password') {
          return '';
        }
        return `${label}: ${value}`;
      })
      .filter(Boolean)
      .filter((value, index, array) => array.indexOf(value) === index)
      .slice(0, 10);

    const route = typeof window !== 'undefined' ? `${window.location.pathname}${window.location.hash || ''}` : '';
    const parts = [
      this.contextHint ? `Context hint: ${this.contextHint}` : '',
      route ? `Route: ${route}` : '',
      this.page ? `Named page: ${this.page}` : '',
      headings.length ? `Visible headings: ${headings.join(' | ')}` : '',
      chips.length ? `Visible status and labels: ${chips.join(' | ')}` : '',
      fields.length ? `Current form and selected values: ${fields.join(' | ')}` : '',
      buttons.length ? `Visible actions: ${buttons.join(' | ')}` : ''
    ].filter(Boolean);

    return parts.join('\n').slice(0, 2200);
  }
}
