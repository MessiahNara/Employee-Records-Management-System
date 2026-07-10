// API Base URL
const envApiUrl = (import.meta as any).env.VITE_API_URL as string | undefined;

// Mutable server URL that can be set dynamically
let serverBaseUrl = '';
let serverUrlPromise: Promise<string> | null = null;

async function fetchServerUrlFromElectron(): Promise<string> {
  const isBrowser = typeof window !== 'undefined';
  const isElectron = isBrowser && typeof (window as any).electron !== 'undefined';
  
  if (!isElectron) {
    return '';
  }

  try {
    // Call IPC to get server URL from main process
    const url = await (window as any).electron.getServerUrl();
    console.log('[api] Server URL from IPC:', url);
    return url;
  } catch (e) {
    console.error('[api] Error getting server URL from IPC:', e);
    return '';
  }
}

function getDefaultServerBaseUrl(): string {
  const isBrowser = typeof window !== 'undefined';
  const isElectron = isBrowser && typeof (window as any).electron !== 'undefined';

  if (isElectron) {
    // Priority 1: Check if already cached
    if (serverBaseUrl) {
      return serverBaseUrl;
    }

    // Note: localStorage 'serverUrl' is intentionally skipped here so the Electron
    // IPC always provides the canonical URL (avoids stale http:// entries overriding HTTPS).
    
    // Priority 2: Return empty - will fetch from IPC on first API call
    console.warn('[api] No server URL cached yet. Will fetch from IPC on first request.');
    return '';
  }

  if (!isBrowser) {
    return 'http://localhost:5000';
  }

  if (window.location.protocol === 'https:') {
    return window.location.origin;
  }

  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  const hostname = window.location.hostname || 'localhost';
  return `${protocol}//${hostname}:5000`;
}

function normalizeApiUrlForLan(apiUrl: string): string {
  const isBrowser = typeof window !== 'undefined';
  if (!isBrowser) {
    return apiUrl;
  }

  try {
    const parsed = new URL(apiUrl);
    const currentHost = window.location.hostname;

    const isLocalApiHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    const isRemoteClient = currentHost !== 'localhost' && currentHost !== '127.0.0.1';

    if (isLocalApiHost && isRemoteClient) {
      parsed.hostname = currentHost;
      return parsed.toString();
    }
  } catch {
    // If URL parsing fails, keep original value.
  }

  return apiUrl;
}

const normalizedEnvApiUrl = envApiUrl ? normalizeApiUrlForLan(envApiUrl) : undefined;

function getApiBaseUrl(): string {
  if (normalizedEnvApiUrl) {
    return normalizedEnvApiUrl;
  }

  // In Electron dev mode, always use the Vite proxy (relative /api path)
  // so requests go through https://192.168.2.187:5174/api -> proxied to backend.
  // This avoids direct backend calls that would fail on self-signed cert errors.
  const isBrowser = typeof window !== 'undefined';
  const isElectron = isBrowser && typeof (window as any).electron !== 'undefined';
  const isDev = isBrowser && window.location.port === '5174';

  if (isElectron && isDev) {
    return '/api';
  }

  let baseUrl = serverBaseUrl || getDefaultServerBaseUrl();
  return `${baseUrl}/api`;
}

// Async version to handle IPC fetching
async function ensureServerUrl(): Promise<void> {
  if (serverBaseUrl) {
    return; // Already have it
  }

  const isBrowser = typeof window !== 'undefined';
  const isElectron = isBrowser && typeof (window as any).electron !== 'undefined';

  if (!isElectron) {
    return; // Not Electron, using web default
  }

  if (normalizedEnvApiUrl) {
    return; // Using env config
  }

  // Fetch from IPC once and cache
  if (!serverUrlPromise) {
    serverUrlPromise = fetchServerUrlFromElectron();
  }

  serverBaseUrl = await serverUrlPromise;
  if (serverBaseUrl) {
    serverBaseUrl = serverBaseUrl.replace(/\/api\/?$/, '');
    console.log('[api] Cached server URL:', serverBaseUrl);
  }
}

// Generic API request handler with timeout
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // Ensure server URL is fetched before making request
  await ensureServerUrl();

  const API_BASE_URL = getApiBaseUrl();
  const url = `${API_BASE_URL}${endpoint}`;
  
  const config: RequestInit = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  // Create a timeout promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      const isLocalhost = url.includes('localhost') || url.includes('127.0.0.1');
      const msg = isLocalhost
        ? 'Server connection timeout. The backend server may not be running. Please wait a moment and try again.'
        : 'Server connection timeout. Please check the Server URL in Settings and ensure the server is running.';
      reject(new Error(msg));
    }, 10000); // 10 second timeout
  });

  try {
    const response = await Promise.race([
      fetch(url, config),
      timeoutPromise
    ]);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      const errorMessage = error.error || error.message || `HTTP ${response.status}`;
      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error: any) {
    console.error('API Request Error:', error);
    
    // Enhance error message for network errors
    const errorMsg = error?.message || '';
    if (errorMsg.includes('timeout') || errorMsg.includes('Server connection')) {
      throw error; // Re-throw timeout errors as-is
    }
    
    if (errorMsg.includes('failed to fetch') || errorMsg.includes('network') || errorMsg.includes('ERR_')) {
      const isLocalhost = url.includes('localhost') || url.includes('127.0.0.1');
      if (isLocalhost) {
        throw new Error('Unable to reach the server. The backend server may not be running. Please wait a moment and try again.');
      } else {
        throw new Error(`Unable to reach the server at ${getApiBaseUrl()}. Please check the Server URL in Settings → System → Server Configuration.`);
      }
    }
    
    throw error;
  }
}

// FormData upload handler (no Content-Type header — browser sets multipart boundary)
async function apiUpload<T>(
  endpoint: string,
  formData: FormData,
  headers: Record<string, string> = {}
): Promise<T> {
  // Ensure server URL is fetched before making request
  await ensureServerUrl();

  const API_BASE_URL = getApiBaseUrl();
  const url = `${API_BASE_URL}${endpoint}`;
  try {
    const response = await fetch(url, { method: 'POST', headers, body: formData });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || error.message || `HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error: any) {
    console.error('API Upload Error:', error);
    throw error;
  }
}

export function getServerBaseUrl(): string {
  // In Electron dev mode, use the current origin (Vite dev server) so
  // upload/file URLs are relative to the proxy which forwards to the backend.
  const isBrowser = typeof window !== 'undefined';
  const isElectron = isBrowser && typeof (window as any).electron !== 'undefined';
  const isDev = isBrowser && window.location.port === '5174';

  if (isElectron && isDev) {
    return window.location.origin; // https://192.168.2.187:5174
  }

  if (serverBaseUrl) {
    return serverBaseUrl;
  }

  return getDefaultServerBaseUrl();
}

// Helper function to convert relative URLs to absolute URLs
function getAbsoluteUrl(relativePath: string | undefined): string | undefined {
  if (!relativePath) return undefined;
  if (relativePath.startsWith('http')) return relativePath;
  return `${getServerBaseUrl()}${relativePath}`;
}

// User API
export const userApi = {
  getAll: async () => {
    const users = await apiRequest<any[]>('/users');
    
    // Convert relative profile picture URLs to absolute URLs
    return users.map(user => ({
      ...user,
      profilePicture: getAbsoluteUrl(user.profilePicture),
    }));
  },
  getById: async (id: string) => {
    const user = await apiRequest<any>(`/users/${id}`);
    
    // Convert relative profile picture URL to absolute URL
    return {
      ...user,
      profilePicture: getAbsoluteUrl(user.profilePicture),
    };
  },
  create: (data: any) => apiRequest<any>('/users', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any, currentUserId?: string, approvalToken?: string) => {
    const headers: any = { 'Content-Type': 'application/json' };
    if (currentUserId) headers['X-User-Id'] = currentUserId;
    if (approvalToken) headers['X-Superadmin-Approval-Token'] = approvalToken;

    return apiRequest<any>(`/users/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data),
    });
  },
  partialUpdate: (id: string, data: any, currentUserId?: string, approvalToken?: string) => {
    const headers: any = { 'Content-Type': 'application/json' };
    if (currentUserId) headers['X-User-Id'] = currentUserId;
    if (approvalToken) headers['X-Superadmin-Approval-Token'] = approvalToken;

    return apiRequest<any>(`/users/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(data),
    });
  },
  delete: (id: string, approvalToken?: string) => {
    const headers: any = { 'Content-Type': 'application/json' };
    if (approvalToken) headers['X-Superadmin-Approval-Token'] = approvalToken;
    return apiRequest<void>(`/users/${id}`, { method: 'DELETE', headers });
  },
  login: (username: string, password: string) => 
    (async () => {
      console.log('[api] Login ->', `${getApiBaseUrl()}/users/login`);
      const user = await apiRequest<any>('/users/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      return {
        ...user,
        profilePicture: getAbsoluteUrl(user.profilePicture),
      };
    })(),
  verifyPassword: (username: string, password: string, currentUserId: string) => 
    apiRequest<{ valid: boolean; user: any; approvalToken?: string }>('/users/verify-password', {
      method: 'POST',
      body: JSON.stringify({ username, password, currentUserId }),
    }),
  uploadProfilePicture: async (userId: string, file: File): Promise<{ profilePicture: string }> => {
    const formData = new FormData();
    formData.append('profilePicture', file);

    const url = `${getApiBaseUrl()}/users/${userId}/profile-picture`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(error.error || error.message || `HTTP ${response.status}`);
      }

      const result = await response.json();
      
      // Convert relative URL to absolute URL
      return {
        profilePicture: getAbsoluteUrl(result.profilePicture) || result.profilePicture,
      };
    } catch (error: any) {
      console.error('Profile picture upload error:', error);
      throw error;
    }
  },
  removeProfilePicture: async (userId: string): Promise<void> => {
    return apiRequest<void>(`/users/${userId}/profile-picture`, {
      method: 'DELETE',
    });
  },
  updateIdleTimeout: (userId: string, idleTimeout: number | null) => 
    apiRequest<any>(`/users/${userId}/idle-timeout`, {
      method: 'PATCH',
      body: JSON.stringify({ idleTimeout }),
    }),
  getIdleTimeout: (userId: string) => 
    apiRequest<{ idleTimeout: number | null }>(`/users/${userId}/idle-timeout`),
};

// Employee API
export const employeeApi = {
  getAll: async (filters?: { 
    status?: string; 
    workLocation?: string; 
    appointmentStatus?: string;
    search?: string;
    filter_type?: 'first_name' | 'middle_name' | 'last_name' | 'all';
  }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.appointmentStatus) params.append('appointmentStatus', filters.appointmentStatus);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.filter_type) params.append('filter_type', filters.filter_type);
    
    const query = params.toString();
    const employees = await apiRequest<any[]>(`/employees${query ? `?${query}` : ''}`);
    
    // Map backend fields to frontend fields
    return employees.map(emp => ({
      ...emp,
      officeHospitalName: emp.officeName,
      positionFunction: emp.position,
      reasonForSeparation: emp.reasonOfSeparation,
      profilePicture: getAbsoluteUrl(emp.profilePicture),
    }));
  },
  getById: async (id: string) => {
    const employee = await apiRequest<any>(`/employees/${id}`);
    // Map backend fields to frontend fields
    return {
      ...employee,
      officeHospitalName: employee.officeName,
      positionFunction: employee.position,
      reasonForSeparation: employee.reasonOfSeparation,
      profilePicture: getAbsoluteUrl(employee.profilePicture),
    };
  },
  create: (data: any, userId?: string, userName?: string) => {
    const headers: any = { 'Content-Type': 'application/json' };
    if (userId) headers['X-User-Id'] = userId;
    if (userName) headers['X-User-Name'] = userName;
    
    return apiRequest<any>('/employees', {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
  },
  update: (id: string, data: any, userId?: string, userName?: string, approvalToken?: string) => {
    const headers: any = { 'Content-Type': 'application/json' };
    if (userId) headers['X-User-Id'] = userId;
    if (userName) headers['X-User-Name'] = userName;
    if (approvalToken) headers['X-Superadmin-Approval-Token'] = approvalToken;
    
    return apiRequest<any>(`/employees/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data),
    });
  },
  partialUpdate: (id: string, data: any, userId?: string, userName?: string, approvalToken?: string) => {
    const headers: any = { 'Content-Type': 'application/json' };
    if (userId) headers['X-User-Id'] = userId;
    if (userName) headers['X-User-Name'] = userName;
    if (approvalToken) headers['X-Superadmin-Approval-Token'] = approvalToken;
    
    return apiRequest<any>(`/employees/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(data),
    });
  },
  delete: (id: string, userId?: string, userName?: string, authorizingUserId?: string, authorizingUserName?: string, approvalToken?: string) => {
    const headers: any = { 'Content-Type': 'application/json' };
    if (userId) headers['X-User-Id'] = userId;
    if (userName) headers['X-User-Name'] = userName;
    if (authorizingUserId) headers['X-Authorizing-User-Id'] = authorizingUserId;
    if (authorizingUserName) headers['X-Authorizing-User-Name'] = authorizingUserName;
    if (approvalToken) headers['X-Superadmin-Approval-Token'] = approvalToken;
    
    return apiRequest<void>(`/employees/${id}`, {
      method: 'DELETE',
      headers,
    });
  },
  bulkDelete: (ids: string[], userId?: string, userName?: string, employeeNames?: Array<{ firstName: string; lastName: string }>, authorizingUserId?: string, authorizingUserName?: string, approvalToken?: string) => {
    const headers: any = { 'Content-Type': 'application/json' };
    if (userId) headers['X-User-Id'] = userId;
    if (userName) headers['X-User-Name'] = userName;
    if (authorizingUserId) headers['X-Authorizing-User-Id'] = authorizingUserId;
    if (authorizingUserName) headers['X-Authorizing-User-Name'] = authorizingUserName;
    if (approvalToken) headers['X-Superadmin-Approval-Token'] = approvalToken;
    
    return apiRequest<{ deletedCount: number }>('/employees/bulk-delete', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids, employeeNames }),
    });
  },
  syncImport: (
    employees: any[],
    userId?: string,
    userName?: string,
    authorizingUserId?: string,
    authorizingUserName?: string,
    approvalToken?: string
  ) => {
    const headers: any = { 'Content-Type': 'application/json' };
    if (userId) headers['X-User-Id'] = userId;
    if (userName) headers['X-User-Name'] = userName;
    if (authorizingUserId) headers['X-Authorizing-User-Id'] = authorizingUserId;
    if (authorizingUserName) headers['X-Authorizing-User-Name'] = authorizingUserName;
    if (approvalToken) headers['X-Superadmin-Approval-Token'] = approvalToken;

    return apiRequest<{ upsertedCount: number; insertedCount: number; updatedCount: number; message: string }>('/employees/sync-import', {
      method: 'POST',
      headers,
      body: JSON.stringify({ employees }),
    });
  },
  getStats: () => apiRequest<any>('/employees/stats/summary'),
  uploadProfilePicture: async (employeeId: string, file: File): Promise<{ profilePicture: string }> => {
    const formData = new FormData();
    formData.append('profilePicture', file);
    const url = `${getApiBaseUrl()}/employees/${employeeId}/profile-picture`;
    const response = await fetch(url, { method: 'POST', body: formData });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || error.message || `HTTP ${response.status}`);
    }
    const result = await response.json();
    return { profilePicture: getAbsoluteUrl(result.profilePicture) || result.profilePicture };
  },
  removeProfilePicture: (employeeId: string) =>
    apiRequest<void>(`/employees/${employeeId}/profile-picture`, { method: 'DELETE' }),
};

// Document API
export const documentApi = {
  getAll: (filters?: { employeeId?: string; category?: string; fromDate?: string; toDate?: string }) => {
    const params = new URLSearchParams();
    if (filters?.employeeId) params.append('employeeId', filters.employeeId);
    if (filters?.category) params.append('category', filters.category);
    if (filters?.fromDate) params.append('fromDate', filters.fromDate);
    if (filters?.toDate) params.append('toDate', filters.toDate);
    
    const query = params.toString();
    return apiRequest<any[]>(`/documents${query ? `?${query}` : ''}`);
  },
  getById: (id: string) => apiRequest<any>(`/documents/${id}`),
  getByEmployee: (employeeId: string) => apiRequest<any[]>(`/documents/employee/${employeeId}`),
  create: (data: any, userId?: string, userName?: string) => {
    const headers: any = { 'Content-Type': 'application/json' };
    if (userId) headers['X-User-Id'] = userId;
    if (userName) headers['X-User-Name'] = userName;
    
    return apiRequest<any>('/documents', {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
  },
  upload: (file: File, data: { employeeId: string; employeeName: string; category: string; fileName: string; fileSize: number; mimeType: string }, userId?: string, userName?: string) => {
    const formData = new FormData();
    // Fields must come before the file so multer can read them in destination/filename callbacks
    formData.append('employeeId', data.employeeId);
    formData.append('employeeName', data.employeeName);
    formData.append('category', data.category);
    formData.append('fileName', data.fileName);
    formData.append('fileSize', String(data.fileSize));
    formData.append('mimeType', data.mimeType);
    formData.append('file', file);

    const headers: Record<string, string> = {};
    if (userId) headers['X-User-Id'] = userId;
    if (userName) headers['X-User-Name'] = userName;

    return apiUpload<any>('/documents', formData, headers);
  },
  update: (id: string, data: any, userId?: string, approvalToken?: string) => {
    const headers: any = { 'Content-Type': 'application/json' };
    if (userId) headers['X-User-Id'] = userId;
    if (approvalToken) headers['X-Superadmin-Approval-Token'] = approvalToken;

    return apiRequest<any>(`/documents/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data),
    });
  },
  delete: (id: string, userId?: string, userName?: string, authorizingUserId?: string, authorizingUserName?: string, approvalToken?: string) => {
    const headers: any = {};
    if (userId) headers['X-User-Id'] = userId;
    if (userName) headers['X-User-Name'] = userName;
    if (authorizingUserId) headers['X-Authorizing-User-Id'] = authorizingUserId;
    if (authorizingUserName) headers['X-Authorizing-User-Name'] = authorizingUserName;
    if (approvalToken) headers['X-Superadmin-Approval-Token'] = approvalToken;
    
    return apiRequest<void>(`/documents/${id}`, {
      method: 'DELETE',
      headers,
    });
  },
  bulkDelete: (ids: string[], userId?: string, userName?: string, documentNames?: Array<{ fileName: string; category: string }>, authorizingUserId?: string, authorizingUserName?: string, approvalToken?: string) => {
    const headers: any = { 'Content-Type': 'application/json' };
    if (userId) headers['X-User-Id'] = userId;
    if (userName) headers['X-User-Name'] = userName;
    if (authorizingUserId) headers['X-Authorizing-User-Id'] = authorizingUserId;
    if (authorizingUserName) headers['X-Authorizing-User-Name'] = authorizingUserName;
    if (approvalToken) headers['X-Superadmin-Approval-Token'] = approvalToken;
    
    return apiRequest<{ deletedCount: number; deletedFiles: number }>('/documents/bulk-delete', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids, documentNames }),
    });
  },
  getStats: () => apiRequest<any>('/documents/stats/summary'),
};

// Audit API
export const auditApi = {
  getAll: (filters?: { action?: string; entity?: string; userId?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (filters?.action) params.append('action', filters.action);
    if (filters?.entity) params.append('entity', filters.entity);
    if (filters?.userId) params.append('userId', filters.userId);
    if (filters?.limit) params.append('limit', filters.limit.toString());
    
    const query = params.toString();
    return apiRequest<any[]>(`/audit${query ? `?${query}` : ''}`);
  },
  getById: (id: string) => apiRequest<any>(`/audit/${id}`),
  getByEntity: (entityId: string) => apiRequest<any[]>(`/audit/entity/${entityId}`),
  getStats: () => apiRequest<any>('/audit/stats/summary'),
  create: (data: { userId: string; action: string; entity: string; entityId: string; details: string; metadata?: any }) =>
    apiRequest<any>('/audit', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  createBulkImport: (userId: string, userName: string, employees: Array<{ firstName: string; lastName: string }>) =>
    apiRequest<any>('/audit/bulk-import', {
      method: 'POST',
      body: JSON.stringify({ userId, userName, employees }),
    }),
};

// System Settings API
export const systemSettingsApi = {
  get: () => apiRequest<{ idleTimeout: number | null; appointmentStatuses: string[]; officeNames: string[]; positions: string[] }>('/system-settings'),
  update: (idleTimeout: number | null, userRole: string) => 
    apiRequest<{ idleTimeout: number | null; message: string }>('/system-settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': userRole,
      },
      body: JSON.stringify({ idleTimeout }),
    }),
  updateDropdownOptions: (
    options: { appointmentStatuses?: string[]; officeNames?: string[]; positions?: string[] },
    userRole: string
  ) =>
    apiRequest<{ appointmentStatuses: string[]; officeNames: string[]; positions: string[]; message: string }>(
      '/system-settings/dropdown-options',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': userRole,
        },
        body: JSON.stringify(options),
      }
    ),
};

// Approval Queue API
export const approvalApi = {
  getPending: () => apiRequest<any[]>('/approvals?status=pending'),
  getAll: () => apiRequest<any[]>('/approvals?status=all'),
  getPendingCount: () => apiRequest<{ count: number }>('/approvals/pending-count'),
  submit: (data: {
    requestedBy: string;
    requestedByName: string;
    action: string;
    entityType: string;
    entityId: string;
    entityName?: string;
    payload: any;
  }) => apiRequest<any>('/approvals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  approve: (id: string, credentials: { username: string; password: string }) =>
    apiRequest<any>(`/approvals/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    }),
  reject: (id: string, reason?: string) =>
    apiRequest<any>(`/approvals/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    }),
  remove: (id: string) =>
    apiRequest<any>(`/approvals/${id}`, { method: 'DELETE' }),
};

// Health check
export const healthCheck = () => apiRequest<{ status: string; message: string }>('/health');

// 201 File Borrow/Return API
export const file201Api = {
  getHistory: (employeeId: string) =>
    apiRequest<any[]>(`/file201/${encodeURIComponent(employeeId)}/history`),

  getActive: (employeeId: string) =>
    apiRequest<any | null>(`/file201/${encodeURIComponent(employeeId)}/active`),

  borrow: (employeeId: string, data: {
    borrowerName: string;
    borrowerPosition?: string;
    borrowerOffice?: string;
    purpose?: string;
    expectedReturnDate?: string;
    releasedBy?: string;
  }) =>
    apiRequest<any>(`/file201/${encodeURIComponent(employeeId)}/borrow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  returnFile: (employeeId: string, data: {
    borrowLogId?: string;
    fileCondition?: string;
    remarks?: string;
    returnedByName?: string;
    receivedBy?: string;
  }) =>
    apiRequest<any>(`/file201/${encodeURIComponent(employeeId)}/return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  clearHistory: (employeeId: string) =>
    apiRequest<any>(`/file201/${encodeURIComponent(employeeId)}/clear`, {
      method: 'DELETE',
    }),

  updateCondition: (employeeId: string, data: {
    returnedByName: string;
    receivedBy: string;
    fileCondition: string;
    remarks?: string;
  }) =>
    apiRequest<any>(`/file201/${encodeURIComponent(employeeId)}/update-condition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
};

export default {
  user: userApi,
  employee: employeeApi,
  document: documentApi,
  audit: auditApi,
  systemSettings: systemSettingsApi,
  file201: file201Api,
  approvals: approvalApi,
  healthCheck,
};
