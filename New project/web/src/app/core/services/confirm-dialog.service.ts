import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  /** Main question shown in the dialog */
  message: string;
  /** Dialog header title */
  header?: string;
  /** Label for the confirm button (default: "Yes, Save") */
  acceptLabel?: string;
  /** Label for the cancel button (default: "Cancel") */
  rejectLabel?: string;
  /** Icon class for the dialog (default: "pi pi-exclamation-triangle") */
  icon?: string;
  /** Severity colour for the accept button: "primary" | "danger" | "warning" */
  severity?: 'primary' | 'danger' | 'warning';
}

export interface ConfirmState extends ConfirmOptions {
  visible: boolean;
  resolve: ((confirmed: boolean) => void) | null;
}

/**
 * Global confirmation dialog service.
 *
 * Usage:
 *   const confirmed = await this.confirmDialog.ask({ message: 'Save changes?' });
 *   if (!confirmed) return;
 *   // proceed with save
 */
@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  readonly state = signal<ConfirmState>({
    visible: false,
    message: '',
    header: 'Confirm',
    acceptLabel: 'Yes',
    rejectLabel: 'Cancel',
    icon: 'pi pi-question-circle',
    severity: 'primary',
    resolve: null,
  });

  /**
   * Show a confirmation dialog and return a promise that resolves to
   * `true` (user clicked Yes) or `false` (user clicked Cancel / closed).
   */
  ask(options: ConfirmOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.state.set({
        visible: true,
        message: options.message,
        header: options.header ?? 'Confirm',
        acceptLabel: options.acceptLabel ?? 'Yes',
        rejectLabel: options.rejectLabel ?? 'Cancel',
        icon: options.icon ?? 'pi pi-question-circle',
        severity: options.severity ?? 'primary',
        resolve,
      });
    });
  }

  /** Called by the global dialog component when the user clicks Yes */
  accept(): void {
    const current = this.state();
    current.resolve?.(true);
    this.state.update((s) => ({ ...s, visible: false, resolve: null }));
  }

  /** Called by the global dialog component when the user clicks Cancel or closes */
  reject(): void {
    const current = this.state();
    current.resolve?.(false);
    this.state.update((s) => ({ ...s, visible: false, resolve: null }));
  }
}
