import { login, logout, getCurrentUser, checkSession, isAuthenticated, hasRole } from '../../../src/auth';

const fetchMock: any = global.fetch;

const adminUser = {
  username: 'admin',
  roles: ['ROLE_OWNER_ADMIN', 'ROLE_VET_ADMIN', 'ROLE_ADMIN']
};

describe('auth module', () => {
  beforeEach(async () => {
    fetchMock.mockResponse('', { status: 204 });
    try { await logout(); } catch (e) {}
    fetchMock.mockClear();
    fetchMock.mockResponse('');
  });

  describe('login', () => {
    it('should call POST /api/auth/login with credentials', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(adminUser), { status: 200 });

      await login('admin', 'admin');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [callUrl, callOpts] = fetchMock.mock.calls[0];
      expect(callUrl).toContain('/api/auth/login');
      expect(callOpts.method).toBe('POST');
      expect(callOpts.credentials).toBe('include');
      expect(JSON.parse(callOpts.body)).toEqual({ username: 'admin', password: 'admin' });
    });

    it('should store user on successful login', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(adminUser), { status: 200 });

      const user = await login('admin', 'admin');

      expect(user).not.toBeNull();
      expect(user.username).toBe('admin');
      expect(user.roles).toContain('ROLE_ADMIN');
      expect(getCurrentUser()).toEqual(user);
      expect(isAuthenticated()).toBe(true);
    });

    it('should return null on failed login', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({ message: 'Invalid' }), { status: 401 });

      const user = await login('admin', 'wrong');

      expect(user).toBeNull();
      expect(getCurrentUser()).toBeNull();
      expect(isAuthenticated()).toBe(false);
    });
  });

  describe('logout', () => {
    it('should call POST /api/auth/logout and clear user', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(adminUser), { status: 200 });
      await login('admin', 'admin');
      fetchMock.mockClear();

      fetchMock.mockResponseOnce('', { status: 204 });
      await logout();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [callUrl, callOpts] = fetchMock.mock.calls[0];
      expect(callUrl).toContain('/api/auth/logout');
      expect(callOpts.method).toBe('POST');
      expect(callOpts.credentials).toBe('include');
      expect(getCurrentUser()).toBeNull();
      expect(isAuthenticated()).toBe(false);
    });
  });

  describe('checkSession', () => {
    it('should call GET /api/auth/me and store user', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(adminUser), { status: 200 });

      const user = await checkSession();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [callUrl, callOpts] = fetchMock.mock.calls[0];
      expect(callUrl).toContain('/api/auth/me');
      expect(callOpts.credentials).toBe('include');
      expect(user).not.toBeNull();
      expect(user.username).toBe('admin');
      expect(getCurrentUser()).toEqual(user);
    });

    it('should return null when no session exists', async () => {
      fetchMock.mockResponseOnce('', { status: 401 });

      const user = await checkSession();

      expect(user).toBeNull();
      expect(isAuthenticated()).toBe(false);
    });
  });

  describe('hasRole', () => {
    it('should return true for a role the user has', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(adminUser), { status: 200 });
      await login('admin', 'admin');

      expect(hasRole('ROLE_ADMIN')).toBe(true);
      expect(hasRole('ROLE_OWNER_ADMIN')).toBe(true);
    });

    it('should return false for a role the user does not have', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(adminUser), { status: 200 });
      await login('admin', 'admin');

      expect(hasRole('ROLE_NONEXISTENT')).toBe(false);
    });

    it('should return false when not authenticated', () => {
      expect(hasRole('ROLE_ADMIN')).toBe(false);
    });
  });
});
