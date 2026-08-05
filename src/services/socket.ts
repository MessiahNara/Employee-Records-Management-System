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

  socket.on('documentsUpdated', () => {
    console.log('[socket] documentsUpdated event received, dispatching locally');
    window.dispatchEvent(new Event('documentsUpdated'));
  });

  return socket;
};

export const getSocket = () => socket;
