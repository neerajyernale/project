import { CookieJar, MockServer } from './mock-server';
import { Db } from './mock-types';
import { SCHEMA_VERSION, emptyDb, seed } from './mock-seed';
import { registerAdminRoutes } from './routes/admin.routes';
import { registerCatalogRoutes } from './routes/catalog.routes';
import { registerFulfillmentRoutes } from './routes/fulfillment.routes';
import { registerInboundRoutes } from './routes/inbound.routes';
import { registerInsightRoutes } from './routes/insights.routes';
import { registerInventoryRoutes } from './routes/inventory.routes';
import { registerWarehouseRoutes } from './routes/warehouse.routes';

const DB_KEY = 'wms360.mock.db';
const COOKIE_KEY = 'wms360.mock.refresh-cookie';

/** Builds a server with every route registered, over the given database. */
export function buildServer(db: Db, onChange?: (db: Db) => void): MockServer {
  const server = new MockServer(db, onChange);
  registerAdminRoutes(server);
  registerWarehouseRoutes(server);
  registerCatalogRoutes(server);
  registerInventoryRoutes(server);
  registerInboundRoutes(server);
  registerFulfillmentRoutes(server);
  registerInsightRoutes(server);
  return server;
}

/** A freshly seeded server (used by tests and by "reset demo data"). */
export function seededServer(onChange?: (db: Db) => void): MockServer {
  const server = buildServer(emptyDb(), onChange);
  seed(server);
  return server;
}

function safeStorage(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Refresh "cookie": persistent when "remember me" was ticked, otherwise per browser session. */
function storageCookieJar(): CookieJar {
  const local = safeStorage('local');
  const session = safeStorage('session');
  return {
    get: () => session?.getItem(COOKIE_KEY) ?? local?.getItem(COOKIE_KEY) ?? null,
    set: (token, persistent) => {
      const keepLocal = persistent || !!local?.getItem(COOKIE_KEY);
      session?.removeItem(COOKIE_KEY);
      local?.removeItem(COOKIE_KEY);
      (keepLocal ? local : session)?.setItem(COOKIE_KEY, token);
    },
    clear: () => {
      session?.removeItem(COOKIE_KEY);
      local?.removeItem(COOKIE_KEY);
    },
  };
}

/** The browser singleton: loads the persisted database, or seeds a new one. */
export function browserServer(): MockServer {
  const storage = safeStorage('local');
  const persist = (db: Db) => {
    try {
      storage?.setItem(DB_KEY, JSON.stringify(db));
    } catch (e) {
      console.warn('[mock-api] could not persist demo data', e);
    }
  };

  let db: Db | null = null;
  try {
    const raw = storage?.getItem(DB_KEY);
    const parsed = raw ? (JSON.parse(raw) as Db) : null;
    db = parsed && parsed.schema === SCHEMA_VERSION ? parsed : null;
  } catch {
    db = null;
  }

  const server = db ? buildServer(db, persist) : seededServer(persist);
  server.cookieJar = storageCookieJar();
  if (!db) persist(server.db);
  // Reads don't persist (too costly per request); save session activity when the page goes away.
  window.addEventListener('pagehide', () => persist(server.db));
  return server;
}

export function resetBrowserData(): void {
  const storage = safeStorage('local');
  storage?.removeItem(DB_KEY);
  storage?.removeItem(COOKIE_KEY);
  safeStorage('session')?.removeItem(COOKIE_KEY);
}
