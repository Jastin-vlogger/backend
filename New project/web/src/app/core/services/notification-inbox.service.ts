import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AppNotification, NotificationListResponse, NotificationUnreadCountResponse } from '../models/notification.model';

@Injectable({
  providedIn: 'root',
})
export class NotificationInboxService {
  private http = inject(HttpClient);

  list(): Observable<NotificationListResponse> {
    return this.http.get<NotificationListResponse>('notifications');
  }

  unreadCount(): Observable<NotificationUnreadCountResponse> {
    return this.http.get<NotificationUnreadCountResponse>('notifications/unread-count');
  }

  markAsRead(id: string): Observable<{ message: string; notification: AppNotification; unreadCount: number }> {
    return this.http.patch<{ message: string; notification: AppNotification; unreadCount: number }>(`notifications/${id}/read`, {});
  }
}
