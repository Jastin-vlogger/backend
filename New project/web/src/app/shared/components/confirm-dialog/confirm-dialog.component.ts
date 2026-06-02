import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, DialogModule],
  template: `
    @if (svc.state().visible) {
      <div
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
        (click)="onBackdropClick($event)">
        <div
          class="confirm-dialog-card"
          role="alertdialog"
          aria-modal="true"
          [attr.aria-labelledby]="'confirm-header'"
          [attr.aria-describedby]="'confirm-message'"
          (click)="$event.stopPropagation()">

          <!-- Header -->
          <div class="confirm-dialog-header">
            <i [class]="svc.state().icon + ' confirm-dialog-icon'"></i>
            <h2 id="confirm-header" class="confirm-dialog-title">{{ svc.state().header }}</h2>
          </div>

          <!-- Message -->
          <p id="confirm-message" class="confirm-dialog-message">{{ svc.state().message }}</p>

          <!-- Actions -->
          <div class="confirm-dialog-actions">
            <button
              type="button"
              class="confirm-btn-cancel"
              (click)="svc.reject()">
              {{ svc.state().rejectLabel }}
            </button>
            <button
              type="button"
              class="confirm-btn-accept"
              [class.is-danger]="svc.state().severity === 'danger'"
              [class.is-warning]="svc.state().severity === 'warning'"
              (click)="svc.accept()">
              {{ svc.state().acceptLabel }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .confirm-dialog-card {
      background: white;
      border-radius: 1.5rem;
      border: 1px solid #e2e8f0;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
      padding: 2rem;
      width: min(92vw, 26rem);
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .confirm-dialog-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .confirm-dialog-icon {
      font-size: 1.25rem;
      color: #3b82f6;
      flex-shrink: 0;
    }

    .confirm-dialog-title {
      font-size: 1rem;
      font-weight: 900;
      color: #0f172a;
      letter-spacing: -0.01em;
    }

    .confirm-dialog-message {
      font-size: 0.875rem;
      color: #475569;
      line-height: 1.6;
    }

    .confirm-dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      padding-top: 0.5rem;
    }

    .confirm-btn-cancel {
      padding: 0.625rem 1.25rem;
      border-radius: 0.75rem;
      border: 1px solid #e2e8f0;
      background: white;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #64748b;
      cursor: pointer;
      transition: all 0.15s;
    }
    .confirm-btn-cancel:hover {
      background: #f8fafc;
      border-color: #cbd5e1;
    }

    .confirm-btn-accept {
      padding: 0.625rem 1.25rem;
      border-radius: 0.75rem;
      border: 1px solid transparent;
      background: #1e293b;
      font-size: 0.75rem;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: white;
      cursor: pointer;
      transition: all 0.15s;
    }
    .confirm-btn-accept:hover {
      background: #0f172a;
    }
    .confirm-btn-accept.is-danger {
      background: #dc2626;
    }
    .confirm-btn-accept.is-danger:hover {
      background: #b91c1c;
    }
    .confirm-btn-accept.is-warning {
      background: #d97706;
    }
    .confirm-btn-accept.is-warning:hover {
      background: #b45309;
    }
  `],
})
export class ConfirmDialogComponent {
  readonly svc = inject(ConfirmDialogService);

  onBackdropClick(event: MouseEvent): void {
    // Clicking the backdrop = reject
    this.svc.reject();
  }
}
