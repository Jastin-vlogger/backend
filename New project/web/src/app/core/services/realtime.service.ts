import { Injectable, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class RealtimeService {
  private socket: Socket;
  public connected = signal(false);
  private notificationSubject = new Subject<any>();
  public notification$ = this.notificationSubject.asObservable();

  constructor() {
    const env = environment as typeof environment & { socketUrl?: string };
    const socketUrl = env.socketUrl || env.apiUrl.replace(/\/api\/v1\/?$/, '');

    this.socket = io(socketUrl, {
      withCredentials: true,
      transports: ['polling', 'websocket']
    });

    this.socket.on('connect', () => {
      console.log('🔗 Admin Realtime connected');
      this.connected.set(true);
      this.socket.emit('join_room', 'admin');
    });

    this.socket.on('disconnect', () => {
      this.connected.set(false);
    });

    // Listen for new schedule submissions from suppliers
    this.socket.on('SCHEDULE_SUBMITTED', (data: any) => {
      console.log('⚡ New schedule submitted:', data);
      this.notificationSubject.next(data);
    });

    // Listen for general notifications
    this.socket.on('NOTIFICATION', (data: any) => {
      console.log('🔔 Notification received:', data);
      this.notificationSubject.next(data);
    });
  }

  emit(event: string, data: any) {
    this.socket.emit(event, data);
  }
}
