import { getAuthState } from '../utils/mockAuth';

// API Base URL
const envApiUrl = (import.meta as any).env.VITE_API_URL as string | undefined;

// Mutable server URL that can be set dynamically
let serverBaseUrl = (typeof window !== 'undefined' ? localStorage.getItem('activeServerBaseUrl') || '' : '');
let serverUrlPromise: Promise<string> | null = null;

async function fetchServerUrlFromElectron(): Promise<string> {
  const isBrowser = typeof window !== 'undefined';
  const isElectron = isBrowser && typeof (window as any).electron !== 'undefined';
  
  if (!isElectron) {
    return localStorage.getItem('activeServerBaseUrl') || '';
  }

  try {
    // Call IPC to get server URL from main process
    const url = await (window as any).electron.getServerUrl();
    console.log('[api] Server URL from IPC:', url);
    if (url) {
      serverBaseUrl = url.replace(/\/api\/?$/, '');
      localStorage.setItem('activeServerBaseUrl', serverBaseUrl);
    }
    return url;
  } catch (e) {
    console.error('[api] Error getting server URL from IPC:', e);
    return localStorage.getItem('activeServerBaseUrl') || '';
  }
}

export async function setServerBaseUrl(url: string): Promise<boolean> {
  const isBrowser = typeof window !== 'undefined';
  const isElectron = isBrowser && typeof (window as any).electron !== 'undefined';
  
  const cleanUrl = url.replace(/\/api\/?$/, '').trim();
  if (cleanUrl) {
    serverBaseUrl = cleanUrl;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('activeServerBaseUrl', cleanUrl);
    }
  }

  if (!isElectron) {
    return true;
  }

  try {
    const result = await (window as any).electron.setServerUrl(cleanUrl);
    if (result && result.success) {
      serverBaseUrl = cleanUrl;
      serverUrlPromise = Promise.resolve(cleanUrl);
      return true;
    }
    return false;
  } catch (e) {
    console.error('[api] Error setting server URL via IPC:', e);
    return false;
  }
}

function getDefaultServerBaseUrl(): string {
  const isBrowser = typeof window !== 'undefined';
  const isElectron = isBrowser && typeof (window as any).electron !== 'undefined';

  if (serverBaseUrl) {
    return serverBaseUrl;
  }

  const stored = typeof window !== 'undefined' ? localStorage.getItem('activeServerBaseUrl') : null;
  if (stored) {
    serverBaseUrl = stored;
    return stored;
  }

  if (isElectron) {
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

export function getApiBaseUrl(): string {
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
export async function ensureServerUrl(): Promise<void> {
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

function getSessionIdHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const authUserStr = localStorage.getItem('authUser') || sessionStorage.getItem('authUser');
    if (authUserStr) {
      const authUser = JSON.parse(authUserStr);
      const headers: Record<string, string> = {};
      if (authUser?.activeSessionId) {
        headers['X-Session-Id'] = authUser.activeSessionId;
        headers['X-Logged-In-User-Id'] = authUser.id;
      }
      if (authUser?.id) {
        headers['X-User-Id'] = authUser.id;
      }
      return headers;
    }
  } catch {
    // ignore
  }
  return {};
}

async function handleResponseError(response: Response): Promise<never> {
  const status = response.status;
  let errorData: any = {};
  try {
    errorData = await response.json();
  } catch {
    errorData = { error: 'Request failed' };
  }

  if (status === 401 && (errorData.code === 'CONCURRENT_LOGIN' || errorData.error === 'Session expired')) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('authUser');
      sessionStorage.removeItem('authUser');
      window.location.reload();
    }
    throw new Error('Your session has expired because you logged in on another device.');
  }

  const errorMessage = errorData.error || errorData.message || `HTTP ${status}`;
  throw new Error(errorMessage);
}

// Generic API request handler with timeout
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<T> {
  // Ensure server URL is fetched before making request
  await ensureServerUrl();

  const API_BASE_URL = getApiBaseUrl();
  const url = `${API_BASE_URL}${endpoint}`;
  
  const timeoutMs = options.timeout || 15000; // default 15s timeout
  
  const config: RequestInit = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getSessionIdHeader(),
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
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      fetch(url, config),
      timeoutPromise
    ]);
    
    if (!response.ok) {
      await handleResponseError(response);
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
  return apiUploadWithProgress(endpoint, formData, headers);
}

// FormData upload with progress
async function apiUploadWithProgress<T>(
  endpoint: string,
  formData: FormData,
  headers: Record<string, string> = {},
  onProgress?: (progressEvent: ProgressEvent) => void
): Promise<T> {
  await ensureServerUrl();
  const API_BASE_URL = getApiBaseUrl();
  const url = `${API_BASE_URL}${endpoint}`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    if (onProgress) {
      xhr.upload.addEventListener('progress', onProgress);
    }
    
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch (e) {
          resolve(xhr.responseText as any);
        }
      } else {
        let errorData: any = {};
        try {
          errorData = JSON.parse(xhr.responseText);
        } catch (e) {
          errorData = { error: 'Upload failed' };
        }
        reject(new Error(errorData.error || errorData.message || `HTTP ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'));
    });
    
    xhr.addEventListener('abort', () => {
      reject(new Error('Upload aborted'));
    });

    xhr.open('POST', url);
    const finalHeaders = {
      ...getSessionIdHeader(),
      ...headers,
    };
    
    for (const [key, value] of Object.entries(finalHeaders)) {
      xhr.setRequestHeader(key, value);
    }
    
    xhr.send(formData);
  });
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
export function getAbsoluteUrl(relativePath: string | undefined): string | undefined {
  if (!relativePath) return undefined;
  if (relativePath.startsWith('http')) return relativePath;
  const baseUrl = getServerBaseUrl();
  const sep = (baseUrl.endsWith('/') || relativePath.startsWith('/')) ? '' : '/';
  return `${baseUrl}${sep}${relativePath}`;
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
    page?: number;
    limit?: number;
  }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.appointmentStatus) params.append('appointmentStatus', filters.appointmentStatus);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.filter_type) params.append('filter_type', filters.filter_type);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());
    
    const query = params.toString();
    const result = await apiRequest<any>(`/employees${query ? `?${query}` : ''}`);
    
    // Check if result is paginated (has data and total)
    let employees = Array.isArray(result) ? result : (result.data || []);
    const total = Array.isArray(result) ? result.length : (result.total || 0);

    // Map backend fields to frontend fields
    const mappedEmployees = employees.map((emp: any) => {
      const rawAoType = String(emp.aoType || '').trim().toLowerCase();
      const aoType = rawAoType === 'detailed'
        ? 'Detailed'
        : rawAoType === 'designated'
        ? 'Designated'
        : emp.isDetailed === true
        ? 'Detailed'
        : emp.designatedPositionFunction || emp.designatedOrderFrom || emp.designatedOrderTo
        ? 'Designated'
        : '';

      return {
        ...emp,
        officeHospitalName: emp.officeName,
        positionFunction: emp.position,
        reasonForSeparation: emp.reasonOfSeparation,
        profilePicture: getAbsoluteUrl(emp.profilePicture),
        aoType,
      };
    });

    if (filters?.page && filters?.limit) {
      return { data: mappedEmployees, total };
    }
    return mappedEmployees;
  },
  getById: async (id: string) => {
    const employee = await apiRequest<any>(`/employees/${id}`);
    // Map backend fields to frontend fields (same logic as getAll)
    const rawAoType = String(employee.aoType || '').trim().toLowerCase();
    const aoType = rawAoType === 'detailed'
      ? 'Detailed'
      : rawAoType === 'designated'
      ? 'Designated'
      : employee.isDetailed === true
      ? 'Detailed'
      : employee.designatedPositionFunction || employee.designatedOrderFrom || employee.designatedOrderTo
      ? 'Designated'
      : '';
    return {
      ...employee,
      officeHospitalName: employee.officeName,
      positionFunction: employee.position,
      reasonForSeparation: employee.reasonOfSeparation,
      profilePicture: getAbsoluteUrl(employee.profilePicture),
      aoType,
    };
  },
  create: async (data: any, userId?: string, userName?: string) => {
    const headers: any = { 'Content-Type': 'application/json' };
    if (userId) headers['X-User-Id'] = userId;
    if (userName) headers['X-User-Name'] = userName;
    
    const res = await apiRequest<any>('/employees', {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('employeeUpdated'));
    }
    return res;
  },
  update: async (id: string, data: any, userId?: string, userName?: string, approvalToken?: string) => {
    const headers: any = { 'Content-Type': 'application/json' };
    if (userId) headers['X-User-Id'] = userId;
    if (userName) headers['X-User-Name'] = userName;
    if (approvalToken) headers['X-Superadmin-Approval-Token'] = approvalToken;
    
    const res = await apiRequest<any>(`/employees/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data),
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('employeeUpdated'));
    }
    return res;
  },
  partialUpdate: async (id: string, data: any, userId?: string, userName?: string, approvalToken?: string) => {
    const headers: any = { 'Content-Type': 'application/json' };
    if (userId) headers['X-User-Id'] = userId;
    if (userName) headers['X-User-Name'] = userName;
    if (approvalToken) headers['X-Superadmin-Approval-Token'] = approvalToken;
    
    const res = await apiRequest<any>(`/employees/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(data),
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('employeeUpdated'));
    }
    return res;
  },
  delete: async (id: string, userId?: string, userName?: string, authorizingUserId?: string, authorizingUserName?: string, approvalToken?: string) => {
    const headers: any = { 'Content-Type': 'application/json' };
    if (userId) headers['X-User-Id'] = userId;
    if (userName) headers['X-User-Name'] = userName;
    if (authorizingUserId) headers['X-Authorizing-User-Id'] = authorizingUserId;
    if (authorizingUserName) headers['X-Authorizing-User-Name'] = authorizingUserName;
    if (approvalToken) headers['X-Superadmin-Approval-Token'] = approvalToken;
    
    const res = await apiRequest<void>(`/employees/${id}`, {
      method: 'DELETE',
      headers,
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('employeeUpdated'));
    }
    return res;
  },
  bulkDelete: async (ids: string[], userId?: string, userName?: string, employeeNames?: Array<{ firstName: string; lastName: string }>, authorizingUserId?: string, authorizingUserName?: string, approvalToken?: string) => {
    const headers: any = { 'Content-Type': 'application/json' };
    if (userId) headers['X-User-Id'] = userId;
    if (userName) headers['X-User-Name'] = userName;
    if (authorizingUserId) headers['X-Authorizing-User-Id'] = authorizingUserId;
    if (authorizingUserName) headers['X-Authorizing-User-Name'] = authorizingUserName;
    if (approvalToken) headers['X-Superadmin-Approval-Token'] = approvalToken;
    
    const res = await apiRequest<{ deletedCount: number }>('/employees/bulk-delete', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids, employeeNames }),
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('employeeUpdated'));
    }
    return res;
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
  getStats: () => apiRequest<any>('/employees/stats'),
  deleteReportEntries: (ids: string[]) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const currentUser = getAuthState();
    if (currentUser?.id) headers['X-User-Id'] = currentUser.id;
    if (currentUser?.lastName) headers['X-User-Name'] = `${currentUser.lastName}, ${currentUser.firstName}`;
    
    return apiRequest<any>('/employees/delete-report-entries', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids }),
    });
  },
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
  upload: async (
    file: File,
    data: {
      employeeId: string;
      employeeName: string;
      category: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      aoNumber?: string;
      aoYear?: string;
      aoType?: string;
      detailedTo?: string;
      detailedDivision?: string;
      detailedFunction?: string;
      detailedDate?: string;
      detailedOrderFrom?: string;
      detailedOrderTo?: string;
      designatedPositionFunction?: string;
      designatedOrderFrom?: string;
      designatedOrderTo?: string;
      recalledFrom?: string;
      recalledTo?: string;
      recalledOrderFrom?: string;
      recalledOrderTo?: string;
      appointmentFrom?: string;
      appointmentTo?: string;
      autoRename?: boolean;
      replace?: boolean;
      compressionLevel?: string;
    },
    userId?: string,
    userName?: string,
    onProgress?: (e: ProgressEvent) => void
  ) => {
    const formData = new FormData();
    // Fields must come before the file so multer can read them in destination/filename callbacks
    formData.append('employeeId', data.employeeId);
    formData.append('employeeName', data.employeeName);
    formData.append('category', data.category);
    formData.append('fileName', data.fileName);
    formData.append('fileSize', String(data.fileSize));
    formData.append('mimeType', data.mimeType);
    if (data.aoNumber) formData.append('aoNumber', data.aoNumber);
    if (data.aoYear) formData.append('aoYear', data.aoYear);
    if (data.aoType) formData.append('aoType', data.aoType);
    if (data.detailedTo) formData.append('detailedTo', data.detailedTo);
    if (data.detailedDivision) formData.append('detailedDivision', data.detailedDivision);
    if (data.detailedFunction) formData.append('detailedFunction', data.detailedFunction);
    if (data.detailedDate) formData.append('detailedDate', data.detailedDate);
    if (data.detailedOrderFrom) formData.append('detailedOrderFrom', data.detailedOrderFrom);
    if (data.detailedOrderTo) formData.append('detailedOrderTo', data.detailedOrderTo);
    if (data.designatedPositionFunction) formData.append('designatedPositionFunction', data.designatedPositionFunction);
    if (data.designatedOrderFrom) formData.append('designatedOrderFrom', data.designatedOrderFrom);
    if (data.designatedOrderTo) formData.append('designatedOrderTo', data.designatedOrderTo);
    if (data.recalledFrom) formData.append('recalledFrom', data.recalledFrom);
    if (data.recalledTo) formData.append('recalledTo', data.recalledTo);
    if (data.recalledOrderFrom) formData.append('recalledOrderFrom', data.recalledOrderFrom);
    if (data.recalledOrderTo) formData.append('recalledOrderTo', data.recalledOrderTo);
    if (data.appointmentFrom) formData.append('appointmentFrom', data.appointmentFrom);
    if (data.appointmentTo) formData.append('appointmentTo', data.appointmentTo);
    if (data.autoRename !== undefined) formData.append('autoRename', String(data.autoRename));
    if (data.replace !== undefined) formData.append('replace', String(data.replace));
    if (data.compressionLevel) formData.append('compressionLevel', data.compressionLevel);
    formData.append('file', file);

    const headers: Record<string, string> = {};
    if (userId) headers['X-User-Id'] = userId;
    if (userName) headers['X-User-Name'] = userName;

    const res = await apiUploadWithProgress<any>('/documents', formData, headers, onProgress);
    // Note: dispatchEvent was removed here to prevent glitching on bulk uploads. 
    // The calling hook should handle refreshing when appropriate.
    return res;
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
  delete: async (id: string, userId?: string, userName?: string, authorizingUserId?: string, authorizingUserName?: string, approvalToken?: string) => {
    const headers: any = {};
    if (userId) headers['X-User-Id'] = userId;
    if (userName) headers['X-User-Name'] = userName;
    if (authorizingUserId) headers['X-Authorizing-User-Id'] = authorizingUserId;
    if (authorizingUserName) headers['X-Authorizing-User-Name'] = authorizingUserName;
    if (approvalToken) headers['X-Superadmin-Approval-Token'] = approvalToken;
    
    const res = await apiRequest<void>(`/documents/${id}`, {
      method: 'DELETE',
      headers,
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('employeeUpdated'));
      window.dispatchEvent(new Event('documentsUpdated'));
    }
    return res;
  },
  bulkDelete: async (ids: string[], userId?: string, userName?: string, documentNames?: Array<{ fileName: string; category: string }>, authorizingUserId?: string, authorizingUserName?: string, approvalToken?: string) => {
    const headers: any = { 'Content-Type': 'application/json' };
    if (userId) headers['X-User-Id'] = userId;
    if (userName) headers['X-User-Name'] = userName;
    if (authorizingUserId) headers['X-Authorizing-User-Id'] = authorizingUserId;
    if (authorizingUserName) headers['X-Authorizing-User-Name'] = authorizingUserName;
    if (approvalToken) headers['X-Superadmin-Approval-Token'] = approvalToken;
    
    const res = await apiRequest<{ deletedCount: number; deletedFiles: number }>('/documents/bulk-delete', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids, documentNames }),
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('employeeUpdated'));
      window.dispatchEvent(new Event('documentsUpdated'));
    }
    return res;
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
  get: () => apiRequest<{ idleTimeout: number | null; autoRename: boolean; appointmentStatuses: string[]; officeNames: string[]; positions: string[]; recordLocations?: string[]; dispositionProvisions?: string[]; itemNumbers?: string[]; divisions?: string[]; classificationCategories?: string[]; subCategories?: string[]; aoYears?: string[]; reasonsForSeparation?: string[] }>('/system-settings'),
  update: (data: { idleTimeout?: number | null; autoRename?: boolean }, userRole: string) => 
    apiRequest<{ idleTimeout: number | null; autoRename: boolean; message: string }>('/system-settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': userRole,
      },
      body: JSON.stringify(data),
    }),
  updateDropdownOptions: (
    options: { appointmentStatuses?: string[]; officeNames?: string[]; positions?: string[]; recordLocations?: string[]; dispositionProvisions?: string[]; itemNumbers?: string[]; prdsGrds?: string[]; divisions?: string[]; classificationCategories?: string[]; subCategories?: string[]; aoYears?: string[]; reasonsForSeparation?: string[] },
    userRole: string
  ) =>
    apiRequest<{ appointmentStatuses: string[]; officeNames: string[]; positions: string[]; recordLocations?: string[]; dispositionProvisions?: string[]; itemNumbers?: string[]; prdsGrds?: string[]; divisions?: string[]; classificationCategories?: string[]; subCategories?: string[]; aoYears: string[]; reasonsForSeparation: string[]; message: string }>(
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
  getMyRequests: (userId: string) => apiRequest<any[]>(`/approvals/my-requests?userId=${encodeURIComponent(userId)}`),
  submit: async (data: {
    requestedBy: string;
    requestedByName: string;
    action: string;
    entityType: string;
    entityId: string;
    entityName?: string;
    payload: any;
  }) => {
    const res = await apiRequest<any>('/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('approvalsUpdated'));
    }
    return res;
  },
  approve: async (id: string, credentials: { username: string; password: string }) => {
    const res = await apiRequest<any>(`/approvals/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('approvalsUpdated'));
    }
    return res;
  },
  reject: async (id: string, reason?: string) => {
    const res = await apiRequest<any>(`/approvals/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('approvalsUpdated'));
    }
    return res;
  },
  remove: async (id: string) => {
    const res = await apiRequest<any>(`/approvals/${id}`, { method: 'DELETE' });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('approvalsUpdated'));
    }
    return res;
  },
};

// Health check
export const healthCheck = () => apiRequest<{ status: string; message: string; version?: string }>('/health');

// 201 File Borrow/Return API
export const file201Api = {
  getAllLogs: () =>
    apiRequest<any[]>('/file201/logs/all'),

  getAllTransferredLogs: () =>
    apiRequest<any[]>('/file201/logs/transferred'),

  getHistory: (employeeId: string) =>
    apiRequest<any[]>(`/file201/${encodeURIComponent(employeeId)}/history`),

  getActive: (employeeId: string) =>
    apiRequest<any | null>(`/file201/${encodeURIComponent(employeeId)}/active`),

  getActiveRsp: (employeeId: string) =>
    apiRequest<any | null>(`/file201/${encodeURIComponent(employeeId)}/active-rsp`),

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

  transferRsp: (employeeId: string, data: {
    receivedBy: string;
    releasedBy: string;
    receivedPosition?: string;
    receivedOffice?: string;
    purpose?: string;
    fileCondition?: string;
    remarks?: string;
  }) =>
    apiRequest<any>(`/file201/${encodeURIComponent(employeeId)}/transfer-rsp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  returnRsp: (employeeId: string, data: {
    logId?: string;
    returnedByName: string;
    receivedBy: string;
    fileCondition?: string;
    remarks?: string;
  }) =>
    apiRequest<any>(`/file201/${encodeURIComponent(employeeId)}/return-rsp`, {
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

  deleteLogs: (ids: string[]) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const currentUser = getAuthState();
    if (currentUser?.id) headers['X-User-Id'] = currentUser.id;
    if (currentUser?.lastName) headers['X-User-Name'] = `${currentUser.lastName}, ${currentUser.firstName}`;
    
    return apiRequest<any>('/file201/delete-logs', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids }),
    });
  },
};

// Activity/Calendar API
export const activityApi = {
  getAll: () => apiRequest<any[]>('/activities'),
  create: (data: {
    title: string;
    dateFrom: string;
    dateTo?: string;
    timeFrom?: string;
    timeTo?: string;
    location: string;
    category: string;
    description: string;
  }) =>
    apiRequest<any>('/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiRequest<any>(`/activities/${id}`, {
      method: 'DELETE',
    }),
};

// Chat API
export const chatsApi = {
  getMessages: (recipientId: string) => apiRequest<any[]>(`/chats?recipientId=${recipientId}`),
  getUnreadCounts: () => apiRequest<Record<string, number>>('/chats/unread'),
  getRecentContacts: () => apiRequest<any[]>('/chats/recent'),
  getGroups: () => apiRequest<any[]>('/chats/groups'),
  createGroup: (data: { id?: string; name: string; creatorId?: string; creatorName?: string; memberIds: string[] }) =>
    apiRequest<any>('/chats/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  addGroupMembers: (groupId: string, memberIds: string[]) =>
    apiRequest<any>(`/chats/groups/${groupId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberIds }),
    }),
  removeGroupMember: (groupId: string, memberId: string) =>
    apiRequest<any>(`/chats/groups/${groupId}/members/${memberId}`, {
      method: 'DELETE',
    }),
  deleteGroup: (groupId: string) =>
    apiRequest<any>(`/chats/groups/${groupId}`, {
      method: 'DELETE',
    }),
  sendMessage: (recipientId: string, content: string) =>
    apiRequest<any>('/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientId, content }),
    }),
  deleteConversation: (recipientId: string) =>
    apiRequest<any>(`/chats/${recipientId}`, {
      method: 'DELETE',
    }),
};

// Yellow Box API
export const yellowBoxesApi = {
  getAll: () => apiRequest<any[]>('/yellow-boxes'),
  getById: (id: string) => apiRequest<any>(`/yellow-boxes/${id}`),
  create: (data: { boxLabel: string; office: string; type: string; color?: string }) =>
    apiRequest<any>('/yellow-boxes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  update: (id: string, data: { boxLabel: string; office: string; type: string; color?: string }) =>
    apiRequest<any>(`/yellow-boxes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    apiRequest<any>(`/yellow-boxes/${id}`, {
      method: 'DELETE',
    }),
  addEmployee: (id: string, employeeId: string) =>
    apiRequest<any>(`/yellow-boxes/${id}/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId }),
    }),
  removeEmployee: (id: string, employeeId: string) =>
    apiRequest<any>(`/yellow-boxes/${id}/employees/${employeeId}`, {
      method: 'DELETE',
    }),
  bulkAddEmployees: (id: string, employeeIds: string[]) =>
    apiRequest<any>(`/yellow-boxes/${id}/employees/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeIds }),
    }),
  bulkRemoveEmployees: (id: string, employeeIds: string[]) =>
    apiRequest<any>(`/yellow-boxes/${id}/employees/bulk-remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeIds }),
    }),
};

// Inventory & Appraisal API
export const inventoryApi = {
  getAll: () => apiRequest<any[]>('/inventory'),
  getById: (id: string) => apiRequest<any>(`/inventory/${id}`),
  create: (data: any) =>
    apiRequest<any>('/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  update: (id: string, data: any) =>
    apiRequest<any>(`/inventory/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  delete: (id: string, token?: string) => {
    const headers: Record<string, string> = {};
    if (token) headers['x-approval-token'] = token;
    return apiRequest<any>(`/inventory/${id}`, {
      method: 'DELETE',
      headers,
    });
  },
  bulkDelete: (ids: string[], token?: string) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['x-approval-token'] = token;
    return apiRequest<any>('/inventory/bulk-delete', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids }),
    });
  },
  getDisposalHistory: async () => {
    const history = await apiRequest<any[]>('/inventory/disposal-history');
    return history.map(item => ({
      ...item,
      attachmentUrl: getAbsoluteUrl(item.attachmentUrl) || item.attachmentUrl,
    }));
  },
  updateDisposalHistoryStatus: (logIds: string[], newStatus: 'Completed' | 'Decline') =>
    apiRequest<any>('/inventory/disposal-history/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logIds, newStatus }),
    }),
  deleteDisposalHistory: (id: string, year?: string) =>
      apiRequest<any>(`/inventory/disposal-history/${id}${year ? `?year=${year}` : ''}`, { method: 'DELETE' }),
  bulkDeleteDisposalHistory: (ids: string[]) =>
      apiRequest<any>('/inventory/disposal-history/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }),
  logDisposal: (data: {
    recordId: string;
    seriesTitle: string;
    division?: string;
    classificationCategory?: string;
    subCategory?: string;
    disposedYears: string;
    previousInclusiveDates: string;
    newInclusiveDates: string;
    disposedBy?: string;
  }) =>
    apiRequest<any>('/inventory/disposal-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  uploadAttachment: async (file: File): Promise<{ attachmentUrl: string; attachmentName: string }> => {
    const formData = new FormData();
    formData.append('attachment', file);
    const url = `${getApiBaseUrl()}/inventory/upload-attachment`;
    const response = await fetch(url, { method: 'POST', body: formData });
    if (!response.ok) throw new Error('Failed to upload proof document');
    const result = await response.json();
    return { ...result, attachmentUrl: getAbsoluteUrl(result.attachmentUrl) || result.attachmentUrl };
  },
  getRequests: async () => {
    const requests = await apiRequest<any[]>('/inventory/requests');
    return requests.map(req => ({
      ...req,
      attachmentUrl: getAbsoluteUrl(req.attachmentUrl) || req.attachmentUrl,
    }));
  },
  createRequest: (data: { requestType: 'Storage' | 'Disposal'; recordIds: string[]; recordsSummary?: any[]; reason: string; attachmentUrl?: string; attachmentName?: string }) =>
    apiRequest<any>('/inventory/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  rejectRequest: (id: string, rejectionReason?: string) =>
    apiRequest<any>(`/inventory/requests/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rejectionReason }),
    }),
  confirmRequest: (id: string, adminReason?: string) =>
    apiRequest<any>(`/inventory/requests/${id}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminReason }),
    }),
};

const backupApi = {
  list: () => apiRequest<{ success: boolean; backups: any[]; liveRecordCounts: any; schedule: any }>('/backup/list'),
  create: (data: { createdBy?: string; type?: string }) =>
    apiRequest<{ success: boolean; message: string; backup: any }>('/backup/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      timeout: 120000,
    }),
  restore: (data: { filename: string; superadminPassword: string; username?: string }) =>
    apiRequest<{ success: boolean; message: string; safetyBackup: string; restoredFrom: string }>('/backup/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      timeout: 300000,
    }),
  delete: (filename: string) =>
    apiRequest<{ success: boolean; message: string }>(`/backup/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    }),
  getSchedule: () => apiRequest<{ success: boolean; schedule: any }>('/backup/schedule'),
  saveSchedule: (data: any) =>
    apiRequest<{ success: boolean; message: string; schedule: any }>('/backup/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  upload: async (file: File) => {
    const formData = new FormData();
    formData.append('backupFile', file);
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/backup/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to upload backup file');
    }
    return response.json();
  },
  getDownloadUrl: async (filename: string) => {
    const baseUrl = getApiBaseUrl();
    return `${baseUrl}/backup/download/${encodeURIComponent(filename)}`;
  },
};

export default {
  user: userApi,
  employee: employeeApi,
  document: documentApi,
  audit: auditApi,
  systemSettings: systemSettingsApi,
  file201: file201Api,
  approvals: approvalApi,
  activities: activityApi,
  chats: chatsApi,
  yellowBoxes: yellowBoxesApi,
  inventory: inventoryApi,
  backup: backupApi,
  healthCheck,
};

