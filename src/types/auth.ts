export interface MockUser {
  id: string;
  username: string;
  email: string;
  password: string;
  role: UserRole;
  name: string;
}

export type UserRole = 'admin' | 'staff' | 'viewer';

export interface LoginFormData {
  username: string;
  password: string;
  rememberMe: boolean;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: MockUser | null;
}
