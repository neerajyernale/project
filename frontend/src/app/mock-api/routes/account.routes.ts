import { CycleCount } from '@wms/core';
import { ApiException, DbCycleCount, DbUser, conflict, notFound, unauthorized } from '../mock-types';
import { Ctx, MockServer } from '../mock-server';

/**
 * Mock versions of the account-lifecycle, two-factor, audit and cycle-count endpoints, so the demo
 * (no backend) shows every screen. Emails are not sent: the link is written to the browser console.
 */
export function registerAccountRoutes(s: MockServer): void {
  const INVALID_LINK = 'This link is invalid or has expired. Ask for a new one.';

  const issueLink = (user: DbUser, purpose: 'INVITE' | 'PASSWORD_RESET', ttlMs: number): string => {
    s.db.userTokens.forEach((t) => t.userId === user.id && t.purpose === purpose && (t.used = true));
    const token = s.token();
    s.db.userTokens.push({ token, userId: user.id, purpose, expiresAt: s.now().getTime() + ttlMs, used: false });
    const path = purpose === 'INVITE' ? 'accept-invite' : 'reset-password';
    console.info(`[mock-api] email to ${user.email}: ${location.origin}/${path}?token=${token}`);
    return token;
  };

  const redeem = (ctx: Ctx, purpose: 'INVITE' | 'PASSWORD_RESET'): { user: DbUser; password: string } => {
    const t = s.db.userTokens.find((x) => x.token === ctx.body['token'] && x.purpose === purpose);
    if (!t || t.used || t.expiresAt < s.now().getTime()) throw unauthorized(INVALID_LINK);
    const user = s.db.users.find((u) => u.id === t.userId);
    if (!user) throw unauthorized(INVALID_LINK);
    const password = typeof ctx.body['password'] === 'string' ? (ctx.body['password'] as string) : '';
    const min = s.db.settings.security.passwordMinLength;
    s.validate([[password.length >= min, 'password', `Use at least ${min} characters.`]]);
    t.used = true;
    return { user, password };
  };

  // ------------------------------------------------------------------ links

  s.on(
    'POST',
    '/auth/forgot-password',
    (ctx) => {
      const email = s.str(ctx.body['email']).toLowerCase();
      const user = s.db.users.find((u) => u.email.toLowerCase() === email && u.status === 'ACTIVE');
      if (user) {
        issueLink(user, 'PASSWORD_RESET', 60 * 60 * 1000);
        s.audit('PASSWORD_RESET_REQUESTED', user, '');
      }
      // null (not undefined) keeps the 202: the answer never reveals whether the email exists.
      return null;
    },
    { public: true, status: 202 },
  );

  s.on(
    'POST',
    '/auth/reset-password',
    (ctx) => {
      const { user, password } = redeem(ctx, 'PASSWORD_RESET');
      user.password = password;
      s.db.sessions = s.db.sessions.filter((x) => x.userId !== user.id);
      s.audit('PASSWORD_RESET', user, 'All sessions signed out');
      return undefined;
    },
    { public: true, status: 204 },
  );

  s.on(
    'POST',
    '/auth/accept-invite',
    (ctx) => {
      const { user, password } = redeem(ctx, 'INVITE');
      if (user.status !== 'INVITED') throw conflict('This invitation was already accepted. Sign in instead.');
      user.password = password;
      user.status = 'ACTIVE';
      s.audit('INVITATION_ACCEPTED', user, user.email);
      return undefined;
    },
    { public: true, status: 204 },
  );

  s.on(
    'POST',
    '/users/:id/resend-invite',
    (ctx) => {
      const user = s.db.users.find((u) => u.id === ctx.params['id']);
      if (!user) throw notFound('User');
      if (user.status !== 'INVITED') throw conflict(`${user.name} has already accepted the invitation.`);
      issueLink(user, 'INVITE', 72 * 60 * 60 * 1000);
      s.audit('USER_INVITED', ctx.user, `Invitation sent again to ${user.email}`);
      return undefined;
    },
    { permission: 'users:create', status: 204 },
  );

  // ------------------------------------------------------------------ two-factor

  const code = (ctx: Ctx): string => {
    const c = s.str(ctx.body['code']);
    if (!/^\d{6}$/.test(c)) {
      throw new ApiException(422, 'Validation failed', 'That code is not valid.', [
        { field: 'code', code: 'invalid', message: 'That code is not valid. Enter the current code from your authenticator app.' },
      ]);
    }
    return c;
  };

  s.on('POST', '/auth/mfa/setup', (ctx) => {
    if (ctx.user.mfaEnabled) throw conflict('Two-factor sign-in is already on. Turn it off first to set up a new authenticator.');
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const secret = Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * 32)]).join('');
    ctx.user.mfaSecret = secret;
    return { secret, otpauthUri: `otpauth://totp/WMS360:${encodeURIComponent(ctx.user.email)}?secret=${secret}&issuer=WMS360&algorithm=SHA1&digits=6&period=30` };
  }, { status: 200 });

  s.on(
    'POST',
    '/auth/mfa/enable',
    (ctx) => {
      if (!ctx.user.mfaSecret) throw conflict('Start the setup first.');
      code(ctx);
      ctx.user.mfaEnabled = true;
      s.audit('MFA_ENABLED', ctx.user, '');
      return undefined;
    },
    { status: 204 },
  );

  s.on(
    'POST',
    '/auth/mfa/disable',
    (ctx) => {
      if (!ctx.user.mfaEnabled) throw conflict('Two-factor sign-in is not on.');
      if (s.db.settings.security.twoFactor) throw conflict('Two-factor sign-in is required in this workspace.');
      code(ctx);
      ctx.user.mfaEnabled = false;
      ctx.user.mfaSecret = null;
      s.audit('MFA_DISABLED', ctx.user, '');
      return undefined;
    },
    { status: 204 },
  );

  s.on(
    'POST',
    '/users/:id/mfa/reset',
    (ctx) => {
      const user = s.db.users.find((u) => u.id === ctx.params['id']);
      if (!user) throw notFound('User');
      user.mfaEnabled = false;
      user.mfaSecret = null;
      s.db.sessions = s.db.sessions.filter((x) => x.userId !== user.id);
      s.audit('MFA_RESET', ctx.user, `Reset by an administrator for ${user.email}`);
      return undefined;
    },
    { permission: 'users:edit', status: 204 },
  );

  // ------------------------------------------------------------------ audit

  s.on(
    'GET',
    '/audit',
    (ctx) => {
      const actions = ctx.query.get('action');
      const q = ctx.query.get('q');
      const from = ctx.query.get('from');
      const to = ctx.query.get('to');
      const rows = s.db.audit
        .filter((a) => !actions || actions.split(',').includes(a.action))
        .filter((a) => s.matchesQ(q, a.actorEmail, a.detail))
        .filter((a) => !from || a.at >= from)
        .filter((a) => !to || a.at.slice(0, 10) <= to);
      return s.paginate(rows, ctx.query, 'at,desc');
    },
    { permission: 'users:view' },
  );

  // ------------------------------------------------------------------ cycle counts

  const toCount = (c: DbCycleCount): CycleCount => {
    const variance = c.lines.filter((l) => l.countedQty !== null && l.variance !== 0);
    return {
      ...c,
      warehouseName: s.warehouse(c.warehouseId).name,
      lineCount: c.lines.length,
      varianceLines: variance.length,
      netVariance: c.lines.reduce((a, l) => a + l.variance, 0),
    };
  };

  const findCount = (ctx: Ctx): DbCycleCount => {
    const c = s.db.cycleCounts.find((x) => x.id === ctx.params['id']);
    if (!c) throw notFound('Cycle count');
    s.assertWarehouseAccess(ctx, c.warehouseId);
    return c;
  };

  const expect = (c: DbCycleCount, ...states: CycleCount['status'][]) => {
    if (!states.includes(c.status)) throw conflict(`Count ${c.number} is ${c.status.toLowerCase()}; this action is not allowed now.`);
  };

  s.on(
    'GET',
    '/cycle-counts',
    (ctx) => {
      const inScope = s.warehouseFilter(ctx);
      const status = ctx.query.get('status');
      const rows = s.db.cycleCounts.filter((c) => inScope(c.warehouseId)).filter((c) => s.inList(c.status, status)).map(toCount);
      return s.paginate(rows, ctx.query, 'createdAt,desc');
    },
    { permission: 'inventory:view' },
  );

  s.on('GET', '/cycle-counts/:id', (ctx) => toCount(findCount(ctx)), { permission: 'inventory:view' });

  s.on(
    'POST',
    '/cycle-counts',
    (ctx) => {
      const warehouseId = s.str(ctx.body['warehouseId']);
      const zoneId = s.str(ctx.body['zoneId']) || null;
      s.validate([[s.db.warehouses.some((w) => w.id === warehouseId), 'warehouseId', 'Choose a warehouse.']]);
      s.assertWarehouseAccess(ctx, warehouseId);
      const binIds = new Set(s.db.bins.filter((b) => b.warehouseId === warehouseId && (!zoneId || b.zoneId === zoneId)).map((b) => b.id));
      const balances = s.db.balances.filter((b) => binIds.has(b.binId) && b.onHand > 0);
      if (!balances.length) throw conflict('There is no stock to count in this area.');
      const c: DbCycleCount = {
        id: s.nextId('cc'),
        number: s.nextNumber('ccNo', 'CC', 1001),
        warehouseId,
        zoneId,
        status: 'OPEN',
        note: s.str(ctx.body['note']),
        lines: balances.map((b, i) => {
          const p = s.product(b.productId);
          return { lineNo: i, balanceId: b.id, binId: b.binId, binCode: s.bin(b.binId).code, productId: p.id, sku: p.sku, productName: p.name, expectedQty: b.onHand, countedQty: null, variance: 0 };
        }),
        countedBy: null,
        countedAt: null,
        approvedBy: null,
        approvedAt: null,
        createdAt: s.nowIso(),
      };
      s.db.cycleCounts.push(c);
      s.log('inventory', 'info', `Cycle count ${c.number} started`, `${c.lines.length} bin lines`, warehouseId, s.actor(ctx));
      return toCount(c);
    },
    { permission: 'inventory:edit' },
  );

  s.on(
    'POST',
    '/cycle-counts/:id/counts',
    (ctx) => {
      const c = findCount(ctx);
      expect(c, 'OPEN', 'COUNTED');
      const raw = Array.isArray(ctx.body['lines']) ? (ctx.body['lines'] as { lineNo: number; countedQty: number }[]) : [];
      s.validate([[raw.every((l) => Number.isInteger(Number(l.countedQty)) && Number(l.countedQty) >= 0), 'lines', 'Counts cannot be negative.']]);
      for (const l of raw) {
        const line = c.lines[Number(l.lineNo)];
        if (!line) throw new ApiException(422, 'Validation failed', `Unknown line ${l.lineNo}.`, [{ field: 'lines', code: 'invalid', message: `Unknown line ${l.lineNo}.` }]);
        line.countedQty = Number(l.countedQty);
        line.variance = line.countedQty - line.expectedQty;
      }
      if (c.lines.every((l) => l.countedQty !== null)) {
        c.status = 'COUNTED';
        c.countedBy = s.actor(ctx);
        c.countedAt = s.nowIso();
      }
      return toCount(c);
    },
    { permission: 'inventory:edit', status: 200 },
  );

  s.on(
    'POST',
    '/cycle-counts/:id/approve',
    (ctx) => {
      const c = findCount(ctx);
      expect(c, 'COUNTED');
      let adjusted = 0;
      for (const l of c.lines) {
        if (!l.variance) continue;
        const b = s.db.balances.find((x) => x.id === l.balanceId);
        if (!b) continue;
        s.adjust(b, l.variance, 'Cycle count correction', c.number, s.actor(ctx));
        adjusted++;
      }
      c.status = 'APPROVED';
      c.approvedBy = s.actor(ctx);
      c.approvedAt = s.nowIso();
      const net = c.lines.reduce((a, l) => a + l.variance, 0);
      s.log('inventory', adjusted ? 'warning' : 'success', `Cycle count ${c.number} approved`, `${adjusted} of ${c.lines.length} lines adjusted · net ${net > 0 ? '+' : ''}${net}`, c.warehouseId, s.actor(ctx));
      new Set(c.lines.map((l) => l.productId)).forEach((p) => s.checkLowStock(c.warehouseId, p));
      return toCount(c);
    },
    { permission: 'inventory:approve', status: 200 },
  );

  s.on(
    'POST',
    '/cycle-counts/:id/cancel',
    (ctx) => {
      const c = findCount(ctx);
      expect(c, 'OPEN', 'COUNTED');
      c.status = 'CANCELLED';
      return toCount(c);
    },
    { permission: 'inventory:edit', status: 200 },
  );
}
