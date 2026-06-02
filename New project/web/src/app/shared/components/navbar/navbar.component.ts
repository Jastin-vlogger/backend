import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { Router } from '@angular/router';
import { selectUser, selectUserName, selectUserRole } from '../../../store/auth/auth.selectors';
import { logout } from '../../../store/auth/auth.actions';
import { AuthService, User } from '../../../core/services/auth.service';
import { NotificationInboxService } from '../../../core/services/notification-inbox.service';
import { AppNotification } from '../../../core/models/notification.model';
import { NotificationService } from '../../../core/services/notification.service';
import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';
import { DialogModule } from 'primeng/dialog';
import { BadgeModule } from 'primeng/badge';
import { RealtimeService } from '../../../core/services/realtime.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogModule, BadgeModule],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
})
export class NavbarComponent {
  private store = inject(Store);
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private notificationInboxService = inject(NotificationInboxService);
  private notificationService = inject(NotificationService);
  private confirmDialog = inject(ConfirmDialogService);
  private realtimeService = inject(RealtimeService);
  private router = inject(Router);
  
  user$: Observable<User | null> = this.store.select(selectUser);
  userName$: Observable<string | undefined> = this.store.select(selectUserName);
  userRole$: Observable<string | undefined> = this.store.select(selectUserRole);
  readonly showNotificationPanel = signal(false);
  readonly showPasswordDialog = signal(false);
  readonly notifications = signal<AppNotification[]>([]);
  readonly unreadCount = signal(0);
  readonly changingPassword = signal(false);
  readonly showCurrentPassword = signal(false);
  readonly showNewPassword = signal(false);
  readonly showConfirmPassword = signal(false);

  readonly changePasswordForm = this.fb.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required]],
  });

  constructor() {
    this.loadNotifications();
    this.setupRealtimeListeners();
  }

  private setupRealtimeListeners(): void {
    this.realtimeService.notification$.subscribe((event: any) => {
      this.loadNotifications();
      this.notificationService.info(event.title || 'Notification', event.message || 'Activity detected');
    });
  }

  loadNotifications(): void {
    if (!this.authService.isAuthenticated()) return;

    this.notificationInboxService.list().subscribe({
      next: ({ notifications, unreadCount }) => {
        this.notifications.set(notifications);
        this.unreadCount.set(unreadCount);
      },
      error: () => {
        this.notifications.set([]);
        this.unreadCount.set(0);
      },
    });
  }

  toggleNotificationPanel(): void {
    const next = !this.showNotificationPanel();
    this.showNotificationPanel.set(next);
    if (next) {
      this.loadNotifications();
    }
  }

  openNotification(notification: AppNotification): void {
    const finishNavigation = () => {
      if (notification.entity === 'Shipment' && notification.entityId) {
        this.showNotificationPanel.set(false);
        this.router.navigate(['/shipments/track', notification.entityId]);
      }
    };

    if (notification.isRead) {
      finishNavigation();
      return;
    }

    this.notificationInboxService.markAsRead(notification._id).subscribe({
      next: ({ unreadCount }) => {
        this.notifications.update((items) =>
          items.map((item) =>
            item._id === notification._id ? { ...item, isRead: true, readAt: new Date().toISOString() } : item
          )
        );
        this.unreadCount.set(unreadCount);
        finishNavigation();
      },
      error: () => {
        finishNavigation();
      },
    });
  }

  openChangePassword(): void {
    this.showNotificationPanel.set(false);
    this.showPasswordDialog.set(true);
    this.changePasswordForm.reset();
    this.showCurrentPassword.set(false);
    this.showNewPassword.set(false);
    this.showConfirmPassword.set(false);
  }

  async submitChangePassword(): Promise<void> {
    if (this.changePasswordForm.invalid) {
      this.changePasswordForm.markAllAsTouched();
      return;
    }

    const { currentPassword, newPassword, confirmPassword } = this.changePasswordForm.getRawValue();
    if (newPassword !== confirmPassword) {
      this.notificationService.error('Password mismatch', 'New password and confirm password must match.');
      return;
    }

    const confirmed = await this.confirmDialog.ask({
      message: 'Are you sure you want to update your password?',
      header: 'Update Password',
      acceptLabel: 'Yes, Update',
      rejectLabel: 'Cancel',
      icon: 'pi pi-lock',
    });
    if (!confirmed) return;

    this.changingPassword.set(true);
    this.authService.changePassword({ currentPassword: currentPassword!, newPassword: newPassword! }).subscribe({
      next: ({ message }) => {
        this.changingPassword.set(false);
        this.showPasswordDialog.set(false);
        this.changePasswordForm.reset();
        this.notificationService.success('Password updated', message);
      },
      error: (error) => {
        this.changingPassword.set(false);
        this.notificationService.error('Password update failed', error.error?.message || 'Could not change password.');
      },
    });
  }

  formatNotificationTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Just now';
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  async onLogout(): Promise<void> {
    const confirmed = await this.confirmDialog.ask({
      message: 'Are you sure you want to log out?',
      header: 'Log Out',
      acceptLabel: 'Yes, Log Out',
      rejectLabel: 'Cancel',
      icon: 'pi pi-sign-out',
      severity: 'danger',
    });
    if (confirmed) {
      this.store.dispatch(logout());
    }
  }
}
