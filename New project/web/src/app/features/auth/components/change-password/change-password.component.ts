import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './change-password.component.html',
  styleUrl: './change-password.component.scss',
})
export class ChangePasswordComponent implements OnInit {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);

  loading = false;

  readonly form = this.fb.group({
    currentPassword: ['', [Validators.required, Validators.minLength(6)]],
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required, Validators.minLength(6)]],
  });

  ngOnInit(): void {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/auth/login']);
      return;
    }
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { currentPassword, newPassword, confirmPassword } = this.form.getRawValue();
    if (newPassword !== confirmPassword) {
      this.notificationService.error('Password Mismatch', 'New password and confirm password must match.');
      return;
    }

    this.loading = true;
    this.authService.changePassword({
      currentPassword: currentPassword || '',
      newPassword: newPassword || '',
    }).subscribe({
      next: () => {
        const user = this.authService.getCurrentUser();
        if (user) {
          this.authService.updateStoredUser({ ...user, mustChangePassword: false });
        }
        this.notificationService.success('Password Updated', 'Your password has been changed successfully.');
        this.router.navigate(['/dashboard']);
      },
      error: (error) => {
        this.notificationService.error('Unable to Change Password', error.error?.message || 'Please try again.');
        this.loading = false;
      },
      complete: () => {
        this.loading = false;
      },
    });
  }
}
