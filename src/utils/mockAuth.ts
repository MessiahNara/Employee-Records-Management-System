import { MockUser } from '../types/auth';

// Mock user database (frontend only)
export const mockUsers: MockUser[] = [
  {
    id: 'user-1',
    username: 'superadmin',
    email: 'superadmin@recordms.com',
    password: 'superadmin',
    role: 'admin',
    name: 'Super Admin',
  },
  {
    id: 'user-2',
    username: 'admin',
    email: 'admin@recordms.com',
    password: 'admin',
    role: 'admin',
    name: 'Admin User',
  },
  {
    id: 'user-3',
    username: 'staff',
    email: 'staff@recordms.com',
    password: 'staff',
    role: 'staff',
    name: 'Staff User',
  },
  {
    id: 'user-4',
    username: 'viewer',
    email: 'viewer@recordms.com',
    password: 'viewer',
    role: 'viewer',
    name: 'Viewer User',
  },
];

// Mock authentication function - accepts username or email
export const authenticateUser = (
  usernameOrEmail: string,
  password: string
): MockUser | null => {
  const user = mockUsers.find(
    (u) => (u.username === usernameOrEmail || u.email === usernameOrEmail) && u.password === password
  );
  return user || null;
};

// Save auth state to localStorage
export const saveAuthState = (user: any, rememberMe: boolean) => {
  if (rememberMe) {
    localStorage.setItem('authUser', JSON.stringify(user));
  } else {
    sessionStorage.setItem('authUser', JSON.stringify(user));
  }
};

// Get auth state from storage
export const getAuthState = (): any | null => {
  const localUser = localStorage.getItem('authUser');
  const sessionUser = sessionStorage.getItem('authUser');
  
  if (localUser) {
    return JSON.parse(localUser);
  }
  if (sessionUser) {
    return JSON.parse(sessionUser);
  }
  return null;
};

// Clear auth state
export const clearAuthState = () => {
  localStorage.removeItem('authUser');
  sessionStorage.removeItem('authUser');
};
