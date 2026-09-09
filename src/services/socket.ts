import { io, Socket } from 'socket.io-client';
import { getApiBaseUrl, ensureServerUrl } from './api';

let socket: Socket | null = null;

export const initSocketClient = (): Promise<Socket | null> => {
  if (socket) return Promise.resolve(socket);

  return ensureServerUrl().then(() => {
    if (socket) return socket;

    const apiBase = getApiBaseUrl();
    const socketUrl = apiBase.replace(/\/api\/?$/, '') || window.location.origin;

    socket = io(socketUrl, {
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 8000,
      autoConnect: true,
    });

    socket.on('connect', () => {
      console.log('[socket] Connected to server:', socket?.id);
      window.dispatchEvent(new Event('systemSettingsUpdated'));
      window.dispatchEvent(new Event('inventoryUpdated'));
      window.dispatchEvent(new Event('employeeUpdated'));
    });

    socket.on('reconnect', () => {
      console.log('[socket] Reconnected to server, triggering data refresh');
      window.dispatchEvent(new Event('systemSettingsUpdated'));
      window.dispatchEvent(new Event('inventoryUpdated'));
      window.dispatchEvent(new Event('employeeUpdated'));
    });

    socket.on('disconnect', () => {
      console.log('[socket] Disconnected from server');
    });

    socket.on('connect_error', (err) => {
      console.warn('[socket] Connection error:', err.message);
    });

    socket.on('approvalsUpdated', () => {
      window.dispatchEvent(new Event('approvalsUpdated'));
    });

    socket.on('chatsUpdated', () => {
      window.dispatchEvent(new Event('chatsUpdated'));
    });

    socket.on('employeeUpdated', () => {
      window.dispatchEvent(new Event('employeeUpdated'));
    });

    socket.on('file201Updated', () => {
      window.dispatchEvent(new Event('file201Updated'));
    });

    socket.on('documentsUpdated', () => {
      window.dispatchEvent(new Event('documentsUpdated'));
    });

    socket.on('inventoryUpdated', () => {
      window.dispatchEvent(new Event('inventoryUpdated'));
    });

    socket.on('usersUpdated', () => {
      window.dispatchEvent(new Event('usersUpdated'));
    });

    socket.on('activityUpdated', () => {
      window.dispatchEvent(new Event('activityUpdated'));
    });

    socket.on('systemSettingsUpdated', () => {
      window.dispatchEvent(new Event('systemSettingsUpdated'));
    });

    const handleRestoreLogout = (data: any) => {
      console.warn('[socket] Database restore detected! Logging out active session...', data);

      const message = data?.message || 'A database restore was executed. All active accounts were logged out to synchronize live data. Please sign in again.';

      try {
        localStorage.removeItem('authUser');
        localStorage.removeItem('currentUserId');
        localStorage.removeItem('sessionId');
        sessionStorage.removeItem('authUser');
        sessionStorage.removeItem('currentUserId');
        sessionStorage.removeItem('sessionId');
        localStorage.setItem('restoreLogoutNotice', message);
        localStorage.setItem('restoreLogoutTime', new Date().toISOString());
        sessionStorage.setItem('restoreLogoutNotice', message);
      } catch (_) {}

      if (window.location.hash !== '#/login') {
        window.location.hash = '#/login';
      }
      setTimeout(() => {
        window.location.reload();
      }, 150);
    };

    socket.on('databaseRestored', handleRestoreLogout);
    socket.on('forceLogout', handleRestoreLogout);

    return socket;
  }).catch((err) => {
    console.warn('[socket] Failed to initialize:', err);
    return null;
  });
};

export const getSocket = () => socket;
