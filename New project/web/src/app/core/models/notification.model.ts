export interface AppNotification {
  _id: string;
  type: string;
  title: string;
  message: string;
  entity?: string;
  entityId?: string;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  notifications: AppNotification[];
  unreadCount: number;
}

export interface NotificationUnreadCountResponse {
  unreadCount: number;
}
