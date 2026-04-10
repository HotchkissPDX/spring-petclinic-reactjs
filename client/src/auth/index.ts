import { url } from '../util';

export interface IAuthUser {
  username: string;
  roles: string[];
}

let currentUser: IAuthUser | null = null;

export async function login(username: string, password: string): Promise<IAuthUser | null> {
  const response = await fetch(url('api/auth/login'), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password })
  });

  if (response.ok) {
    currentUser = await response.json();
    return currentUser;
  }
  currentUser = null;
  return null;
}

export async function logout(): Promise<void> {
  await fetch(url('api/auth/logout'), {
    method: 'POST',
    credentials: 'include'
  });
  currentUser = null;
}

export function getCurrentUser(): IAuthUser | null {
  return currentUser;
}

export async function checkSession(): Promise<IAuthUser | null> {
  const response = await fetch(url('api/auth/me'), {
    credentials: 'include'
  });

  if (response.ok) {
    currentUser = await response.json();
    return currentUser;
  }
  currentUser = null;
  return null;
}

export function isAuthenticated(): boolean {
  return currentUser !== null;
}

export function hasRole(role: string): boolean {
  if (!currentUser) return false;
  return currentUser.roles.indexOf(role) !== -1;
}
