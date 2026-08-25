import { io, Socket } from 'socket.io-client';
import { getApiBaseUrl, ensureServerUrl } from './api';

let socket: Socket | null = null;

export const initSocketClient = async () => {
  if (socket) return socket;

  await ensureServerUrl();
  const apiBase = getApiBaseUrl(); 
  const socketUrl = apiBase.replace(/\/api\/?$/, '') || window.location.origin;

  socket = io(socketUrl, {
    transports: ['websocket'],
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

  // Proxy server events to local window events so existing components auto-refresh!
  socket.on('approvalsUpdated', () => {
    console.log('[socket] approvalsUpdated event received, dispatching locally');
    window.dispatchEvent(new Event('approvalsUpdated'));
  });

  socket.on('chatsUpdated', () => {
    console.log('[socket] chatsUpdated event received, dispatching locally');
    window.dispatchEvent(new Event('chatsUpdated'));
  });

  socket.on('employeeUpdated', () => {
    console.log('[socket] employeeUpdated event received, dispatching locally');
    window.dispatchEvent(new Event('employeeUpdated'));
  });

  socket.on('file201Updated', () => {
    console.log('[socket] file201Updated event received, dispatching locally');
    window.dispatchEvent(new Event('file201Updated'));
  });

  socket.on('documentsUpdated', () => {
    console.log('[socket] documentsUpdated event received, dispatching locally');
    window.dispatchEvent(new Event('documentsUpdated'));
  });

  socket.on('inventoryUpdated', () => {
    console.log('[socket] inventoryUpdated event received, dispatching locally');
    window.dispatchEvent(new Event('inventoryUpdated'));
  });

  socket.on('usersUpdated', () => {
    console.log('[socket] usersUpdated event received, dispatching locally');
    window.dispatchEvent(new Event('usersUpdated'));
  });

  socket.on('activityUpdated', () => {
    console.log('[socket] activityUpdated event received, dispatching locally');
    window.dispatchEvent(new Event('activityUpdated'));
  });

  socket.on('systemSettingsUpdated', () => {
    console.log('[socket] systemSettingsUpdated event received, dispatching locally');
    window.dispatchEvent(new Event('systemSettingsUpdated'));
  });

  return socket;
};

export const getSocket = () => socket;
