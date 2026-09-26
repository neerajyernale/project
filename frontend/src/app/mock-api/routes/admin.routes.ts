import { ALL_PERMISSIONS, Role, Settings, TokenResponse, User } from '@wms/core';
import { ApiException, DbUser, conflict, notFound, unauthorized } from '../mock-types';
import { Ctx, MockServer } from '../mock-server';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function registerAdminRoutes(s: MockServer): void {
  const toUser = (u: DbUser): User => {
    const { password: _password, ...rest } = u;
    return { ...rest, roleName: s.db.roles.find((r) => r.id === u.roleId)?.name ?? 'Unknown' };
  };
  const toRole = (r: Role | Omit<Role, 'userCount'>): Role => ({
    ...r,
    userCount: s.db.users.filter((u) => u.roleId === r.id).length,
  });

  // ------------------------------------------------------------------ auth

  s.on(
    'POST',
    '/auth/login',
    (ctx) => {
      const email = s.str(ctx.body['email']).toLowerCase();
      const password = typeof ctx.body['password'] === 'string' ? (ctx.body['password'] as string) : '';
      s.validate([
        [EMAIL_RE.test(email), 'email', 'Enter a valid email address.'],
        [password.length > 0, 'password', 'Enter your password.'],
      ]);
      const user = s.db.users.find((u) => u.email.toLowerCase() === email);
      // Same message for unknown user and wrong password, so accounts cannot be enumerated.
      if (!user || user.password !== password) throw unauthorized('The email or password is incorrect.');
      if (user.status !== 'ACTIVE') throw unauthorized('This account is disabled. Contact your administrator.');
      const rememberMe = ctx.body['rememberMe'] === true;
      const session = s.openSession(user, rememberMe);
      s.cookieJar.set(session.refreshToken, rememberMe);
      user.lastLoginAt = s.nowIso();
      const res: TokenResponse = { accessToken: session.accessToken, expiresIn: session.expiresIn, user: s.sessionUser(user) };
      return res;
    },
    { public: true, status: 200 },
  );

  s.on(
    'POST',
    '/auth/refresh',
    () => {
      const cookie = s.cookieJar.get();
      if (!cookie) throw unauthorized('No active session.');
      try {
        const rotated = s.rotateSession(cookie);
        s.cookieJar.set(rotated.refreshToken, true);
        const res: TokenResponse = { accessToken: rotated.accessToken, expiresIn: rotated.expiresIn, user: s.sessionUser(rotated.user) };
        return res;
      } catch (e) {
        s.cookieJar.clear();
        throw e;
      }
    },
    { public: true, status: 200 },
  );

  s.on(
    'POST',
    '/auth/logout',
    (ctx) => {
      const auth = ctx.header('Authorization');
      s.endSession(s.cookieJar.get(), auth?.startsWith('Bearer ') ? auth.slice(7) : null);
      s.cookieJar.clear();
      return undefined;
    },
    { public: true },
  );

  s.on('GET', '/auth/me', (ctx) => s.sessionUser(ctx.user));

  s.on(
    'POST',
    '/auth/change-password',
    (ctx) => {
      const current = String(ctx.body['currentPassword'] ?? '');
      const next = String(ctx.body['newPassword'] ?? '');
      const min = s.db.settings.security.passwordMinLength;
      if (ctx.user.password !== current) {
        throw new ApiException(422, 'Validation failed', 'Current password is incorrect.', [
          { field: 'currentPassword', code: 'mismatch', message: 'Current password is incorrect.' },
        ]);
      }
      s.validate([
        [next.length >= min, 'newPassword', `Use at least ${min} characters.`],
        [next !== current, 'newPassword', 'Choose a password you have not used here.'],
      ]);
      ctx.user.password = next;
      s.log('admin', 'info', 'Password changed', ctx.user.email, null, ctx.user.name);
      return undefined;
    },
    { status: 204 },
  );

  // ------------------------------------------------------------------ users

  s.on(
    'GET',
    '/users',
    (ctx) => {
      const q = ctx.query.get('q');
      const roleId = ctx.query.get('roleId');
      const status = ctx.query.get('status');
      const warehouseId = ctx.query.get('warehouseId');
      const rows = s.db.users
        .filter((u) => s.matchesQ(q, u.name, u.email))
        .filter((u) => !roleId || u.roleId === roleId)
        .filter((u) => s.inList(u.status, status))
        .filter((u) => !warehouseId || u.warehouseIds.length === 0 || u.warehouseIds.includes(warehouseId))
        .map(toUser);
      return s.paginate(rows, ctx.query, 'name,asc');
    },
    { permission: 'users:view' },
  );

  /** People who can do a job in a warehouse (e.g. `?permission=picking:edit&warehouseId=wh-mum`), for assignment. */
  s.on('GET', '/users/staff', (ctx) => {
    const roleName = ctx.query.get('role');
    const permission = ctx.query.get('permission');
    const warehouseId = ctx.query.get('warehouseId');
    return s.db.users
      .filter((u) => u.status === 'ACTIVE')
      .filter((u) => !roleName || s.db.roles.find((r) => r.id === u.roleId)?.name === roleName)
      .filter((u) => !permission || s.permissionsOf(u).includes(permission))
      .filter((u) => !warehouseId || u.warehouseIds.length === 0 || u.warehouseIds.includes(warehouseId))
      .map((u) => ({ id: u.id, name: u.name }));
  });

  const validateUser = (ctx: Ctx, existing?: DbUser) => {
    const name = s.str(ctx.body['name']);
    const email = s.str(ctx.body['email']).toLowerCase();
    const roleId = s.str(ctx.body['roleId']);
    const warehouseIds = Array.isArray(ctx.body['warehouseIds']) ? (ctx.body['warehouseIds'] as string[]) : [];
    s.validate([
      [name.length >= 2, 'name', 'Enter the full name.'],
      [EMAIL_RE.test(email), 'email', 'Enter a valid email address.'],
      [!!s.db.roles.find((r) => r.id === roleId), 'roleId', 'Choose a role.'],
      [warehouseIds.every((id) => s.db.warehouses.some((w) => w.id === id)), 'warehouseIds', 'Unknown warehouse.'],
    ]);
    if (s.db.users.some((u) => u.email.toLowerCase() === email && u.id !== existing?.id)) {
      throw new ApiException(422, 'Validation failed', 'Email already in use.', [
        { field: 'email', code: 'duplicate', message: 'A user with this email already exists.' },
      ]);
    }
    return { name, email, roleId, warehouseIds };
  };

  s.on(
    'POST',
    '/users',
    (ctx) => {
      const v = validateUser(ctx);
      const user: DbUser = {
        id: s.nextId('usr'),
        ...v,
        status: 'ACTIVE',
        lastLoginAt: null,
        // Mock only: invited users sign in with the demo password until email invites exist.
        password: 'Wms360!demo',
        version: 1,
      };
      s.db.users.push(user);
      s.log('admin', 'info', `User ${user.name} invited`, `${user.email} · ${toUser(user).roleName}`, null, s.actor(ctx));
      return toUser(user);
    },
    { permission: 'users:create' },
  );

  s.on(
    'PUT',
    '/users/:id',
    (ctx) => {
      const user = s.db.users.find((u) => u.id === ctx.params['id']);
      if (!user) throw notFound('User');
      s.checkVersion(user.version, ctx.body);
      const v = validateUser(ctx, user);
      if (user.id === ctx.user.id && v.roleId !== user.roleId) {
        throw conflict('You cannot change your own role. Ask another administrator.');
      }
      Object.assign(user, v, { version: user.version + 1 });
      s.log('admin', 'info', `User ${user.name} updated`, toUser(user).roleName, null, s.actor(ctx));
      return toUser(user);
    },
    { permission: 'users:edit' },
  );

  for (const [action, status] of [['disable', 'DISABLED'], ['enable', 'ACTIVE']] as const) {
    s.on(
      'POST',
      `/users/:id/${action}`,
      (ctx) => {
        const user = s.db.users.find((u) => u.id === ctx.params['id']);
        if (!user) throw notFound('User');
        if (user.id === ctx.user.id) throw conflict('You cannot disable your own account.');
        user.status = status;
        user.version++;
        if (status === 'DISABLED') s.db.sessions = s.db.sessions.filter((x) => x.userId !== user.id);
        s.log('admin', status === 'DISABLED' ? 'warning' : 'success', `User ${user.name} ${action}d`, user.email, null, s.actor(ctx));
        return toUser(user);
      },
      { permission: 'users:edit', status: 200 },
    );
  }

  // ------------------------------------------------------------------ roles

  s.on('GET', '/roles', () => s.db.roles.map(toRole), { permission: 'users:view' });

  const validateRole = (ctx: Ctx, id?: string) => {
    const name = s.str(ctx.body['name']);
    const description = s.str(ctx.body['description']);
    const permissions = Array.isArray(ctx.body['permissions']) ? (ctx.body['permissions'] as string[]) : [];
    s.validate([
      [name.length >= 2, 'name', 'Enter a role name.'],
      [!s.db.roles.some((r) => r.name.toLowerCase() === name.toLowerCase() && r.id !== id), 'name', 'A role with this name exists.'],
      [permissions.every((p) => ALL_PERMISSIONS.includes(p)), 'permissions', 'Unknown permission.'],
    ]);
    return { name, description, permissions };
  };

  s.on(
    'POST',
    '/roles',
    (ctx) => {
      const v = validateRole(ctx);
      const role = { id: s.nextId('role'), ...v, system: false };
      s.db.roles.push(role);
      s.log('admin', 'info', `Role ${role.name} created`, `${role.permissions.length} permissions`, null, s.actor(ctx));
      return toRole(role);
    },
    { permission: 'users:create' },
  );

  s.on(
    'PUT',
    '/roles/:id',
    (ctx) => {
      const role = s.db.roles.find((r) => r.id === ctx.params['id']);
      if (!role) throw notFound('Role');
      const v = validateRole(ctx, role.id);
      if (role.system && role.name === 'Admin' && !v.permissions.includes('users:edit')) {
        throw conflict('The Admin role must keep user management, or nobody could manage access.');
      }
      Object.assign(role, role.system ? { description: v.description, permissions: v.permissions } : v);
      s.log('admin', 'warning', `Permissions changed for ${role.name}`, `${role.permissions.length} permissions`, null, s.actor(ctx));
      return toRole(role);
    },
    { permission: 'users:edit' },
  );

  s.on(
    'DELETE',
    '/roles/:id',
    (ctx) => {
      const role = s.db.roles.find((r) => r.id === ctx.params['id']);
      if (!role) throw notFound('Role');
      if (role.system) throw conflict('Built-in roles cannot be deleted.');
      if (s.db.users.some((u) => u.roleId === role.id)) throw conflict('Reassign the users in this role before deleting it.');
      s.db.roles = s.db.roles.filter((r) => r.id !== role.id);
      return undefined;
    },
    { permission: 'users:delete' },
  );

  // ------------------------------------------------------------------ settings

  s.on('GET', '/settings', () => s.db.settings, { permission: 'settings:view' });

  s.on(
    'PUT',
    '/settings',
    (ctx) => {
      s.checkVersion(s.db.settings.version, ctx.body);
      const next = ctx.body as unknown as Settings;
      const sec = next.security;
      const cidr = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
      const badIp = (sec?.ipAllowlist ?? '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .find((l) => !cidr.test(l));
      s.validate([
        [s.str(next.general?.companyName).length >= 2, 'general.companyName', 'Enter the company name.'],
        [!!s.db.warehouses.find((w) => w.id === next.operations?.defaultWarehouseId), 'operations.defaultWarehouseId', 'Choose a warehouse.'],
        [!badIp, 'security.ipAllowlist', `"${badIp}" is not an IP address or CIDR range.`],
      ]);
      s.db.settings = { ...next, version: s.db.settings.version + 1 };
      s.log('admin', 'info', 'Settings updated', 'Workspace configuration', null, s.actor(ctx));
      return s.db.settings;
    },
    { permission: 'settings:edit' },
  );

  // ------------------------------------------------------------------ notifications

  // Per user: only their warehouses and permissions; read state is theirs alone.
  s.on('GET', '/notifications', (ctx) => {
    const list = s.notificationsFor(ctx.user);
    const me = ctx.user.id;
    return {
      unread: list.filter((n) => !n.readBy.includes(me)).length,
      items: list.slice(0, 30).map(({ readBy, warehouseId: _w, permission: _p, ...n }) => ({ ...n, read: readBy.includes(me) })),
    };
  });

  s.on(
    'POST',
    '/notifications/:id/read',
    (ctx) => {
      const n = s.notificationsFor(ctx.user).find((x) => x.id === ctx.params['id']);
      if (!n) throw notFound('Notification');
      if (!n.readBy.includes(ctx.user.id)) n.readBy.push(ctx.user.id);
      return undefined;
    },
    { status: 204 },
  );

  s.on(
    'POST',
    '/notifications/read-all',
    (ctx) => {
      s.notificationsFor(ctx.user).forEach((n) => !n.readBy.includes(ctx.user.id) && n.readBy.push(ctx.user.id));
      return undefined;
    },
    { status: 204 },
  );
}
