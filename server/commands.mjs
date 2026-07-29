import { createHash, randomUUID } from 'node:crypto';
import { ApiError, assert } from './errors.mjs';
import {
  commandNames,
  notificationCommandNames,
  pushCommandNames,
  timeOffCommandNames,
  validateCommand,
  validateIdempotencyKey
} from './validation.mjs';

const DATABASE_ERROR_STATUS = Object.freeze({
  TENANT_CONTEXT_INVALID: 401,
  TENANT_CONTEXT_KEY_INVALID: 401,
  TENANT_CONTEXT_SIGNATURE_INVALID: 401,
  TENANT_CONTEXT_EXPIRED: 401,
  TENANT_CONTEXT_REPLAYED: 401,
  IDENTITY_ACCESS_DENIED: 403,
  WORKSPACE_ACCESS_DENIED: 403,
  SESSION_INVALID: 401,
  COMMAND_FORBIDDEN: 403,
  COMMAND_INVALID: 400,
  EMPLOYEE_SCOPE_VIOLATION: 403,
  LEAVE_QUOTA_EXCEEDED: 409,
  ATTENDANCE_NOT_CLOCKED_IN: 409,
  REVISION_CONFLICT: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  TIME_OFF_REQUEST_NOT_FOUND: 404,
  TIME_OFF_REQUEST_ALREADY_PROCESSED: 409,
  NOTIFICATION_NOT_FOUND: 404,
  PUSH_SUBSCRIPTION_CONFLICT: 409,
  PUSH_SUBSCRIPTION_NOT_FOUND: 404,
  PUSH_RATE_LIMITED: 429,
  PUSH_DELIVERY_NOT_FOUND: 404
});

function stableJson(value) {
  if (value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function requestHash(commandName, input) {
  return createHash('sha256').update(`${commandName}\n${stableJson(input)}`, 'utf8').digest('hex');
}

function withBootstrapRevision(result, roleVisibleTimeOff = null, notificationRevision = null) {
  if (!result || result.ok !== true || !result.data || typeof result.data !== 'object' || Array.isArray(result.data)) {
    return result;
  }
  const sync = result.data.sync && typeof result.data.sync === 'object' && !Array.isArray(result.data.sync)
    ? result.data.sync
    : {};
  const canonical = {
    workspaceId: result.workspaceId ?? null,
    role: result.role ?? null,
    employeeId: result.employeeId ?? null,
    currentUser: result.currentUser ?? null,
    data: {
      ...result.data,
      sync: { ...sync, revision: 0 }
    },
    roleVisibleTimeOff,
    notificationRevision
  };
  const revision = Number.parseInt(
    createHash('sha256').update(stableJson(canonical), 'utf8').digest('hex').slice(0, 12),
    16
  );
  return {
    ...result,
    data: {
      ...result.data,
      sync: { ...sync, revision }
    }
  };
}

function translateDatabaseError(error) {
  if (error instanceof ApiError) return error;
  if (error?.code === 'P0001' && DATABASE_ERROR_STATUS[error.message]) {
    return new ApiError(DATABASE_ERROR_STATUS[error.message], error.message, 'Authorization or command validation failed.');
  }
  if (error?.code === '23505') return new ApiError(409, 'RESOURCE_CONFLICT', 'The requested resource already exists.');
  if (error?.code === '23503') return new ApiError(404, 'RELATED_RESOURCE_NOT_FOUND', 'A related resource was not found.');
  if (error?.code === '23514') return new ApiError(400, 'COMMAND_INVALID', 'Command values violate a data constraint.');
  if (['22007', '22008', '22P02', '22023'].includes(error?.code)) {
    return new ApiError(400, 'COMMAND_INVALID', 'Command values are invalid.');
  }
  if (error?.code === '42501') return new ApiError(403, 'DATABASE_ACCESS_DENIED', 'Database access was denied.');
  return error;
}

function internalInput(commandName, validated, idFactory, clock) {
  if (commandName === 'employees.create') {
    return { ...validated, generatedId: `e_${idFactory().replaceAll('-', '')}` };
  }
  if (commandName === 'shifts.create') return { ...validated, generatedId: idFactory() };
  if (commandName === 'attendance.clock-in') {
    return { ...validated, generatedId: idFactory(), occurredAt: clock().toISOString() };
  }
  if (commandName === 'attendance.clock-out') return { ...validated, occurredAt: clock().toISOString() };
  if (commandName === 'schedule-leave-requests.submit' || commandName === 'leave-requests.submit') {
    return validated.requestId ? validated : { ...validated, generatedId: idFactory() };
  }
  return validated;
}

async function databaseCall(pool, sql, parameters) {
  try {
    const result = await pool.query(sql, parameters);
    return result.rows[0]?.result;
  } catch (error) {
    throw translateDatabaseError(error);
  }
}

function notificationSchemaUnavailable(error) {
  return error?.code === '42883';
}

export function createCommandService({ pool, tenantContextSigner, clock = () => new Date(), idFactory = randomUUID }) {
  assert(pool && typeof pool.query === 'function', 500, 'DATABASE_CONFIG_INVALID', 'Database pool is required.');
  assert(tenantContextSigner && typeof tenantContextSigner.sign === 'function',
    500, 'TENANT_CONTEXT_CONFIG_INVALID', 'Tenant context signer is required.');

  function context(identity, workspaceId, purpose) {
    return tenantContextSigner.sign({ identity, workspaceId, purpose });
  }

  async function readRoleVisibleState(identity, workspaceId) {
    const bootstrapContext = context(identity, workspaceId, 'read');
    const bootstrap = await databaseCall(pool,
      'SELECT app_private.api_bootstrap($1, $2, $3) AS result',
      [bootstrapContext.payload, bootstrapContext.signature, bootstrapContext.keyId]);
    const timeOffContext = context(identity, workspaceId, 'read');
    const timeOff = await databaseCall(pool,
      'SELECT app_private.api_list_time_off_requests($1, $2, $3) AS result',
      [timeOffContext.payload, timeOffContext.signature, timeOffContext.keyId]);
    const notificationContext = context(identity, workspaceId, 'read');
    let notificationRevision = null;
    try {
      notificationRevision = await databaseCall(pool,
        'SELECT app_private.api_notification_revision($1, $2, $3) AS result',
        [notificationContext.payload, notificationContext.signature, notificationContext.keyId]);
    } catch (error) {
      if (!notificationSchemaUnavailable(error)) throw error;
    }
    return {
      bootstrap: withBootstrapRevision(bootstrap, timeOff, notificationRevision),
      timeOff,
      notificationRevision
    };
  }

  return Object.freeze({
    async establishSession({ identity, workspaceId }) {
      const signed = context(identity, workspaceId, 'establish');
      return databaseCall(pool,
        'SELECT app_private.api_establish_session($1, $2, $3) AS result',
        [signed.payload, signed.signature, signed.keyId]);
    },

    async logout({ identity, workspaceId }) {
      const signed = context(identity, workspaceId, 'logout');
      return databaseCall(pool,
        'SELECT app_private.api_logout_session($1, $2, $3) AS result',
        [signed.payload, signed.signature, signed.keyId]);
    },

    async execute({ identity, workspaceId, commandName, input, idempotencyKey, requestId }) {
      assert(commandNames.includes(commandName), 404, 'COMMAND_NOT_FOUND', 'Command was not found.');
      validateIdempotencyKey(idempotencyKey);
      const validated = validateCommand(commandName, input);
      const signed = context(identity, workspaceId, 'command');
      const prepared = internalInput(commandName, validated, idFactory, clock);
      const databaseFunction = timeOffCommandNames.includes(commandName)
        ? 'app_private.api_execute_time_off_command'
        : notificationCommandNames.includes(commandName)
          ? 'app_private.api_execute_notification_command'
          : pushCommandNames.includes(commandName)
            ? 'app_private.api_execute_push_command'
            : 'app_private.api_execute_command';
      try {
        return await databaseCall(pool,
          `SELECT ${databaseFunction}(
            $1, $2, $3, $4, $5::jsonb, $6, $7, $8
          ) AS result`,
          [signed.payload, signed.signature, signed.keyId, commandName, JSON.stringify(prepared),
            idempotencyKey, requestHash(commandName, validated), requestId]);
      } catch (error) {
        if ((notificationCommandNames.includes(commandName) || pushCommandNames.includes(commandName))
          && notificationSchemaUnavailable(error)) {
          const pushCommand = pushCommandNames.includes(commandName);
          throw new ApiError(503,
            pushCommand ? 'WEB_PUSH_UNAVAILABLE' : 'NOTIFICATION_CENTER_UNAVAILABLE',
            pushCommand ? 'Web Push is not enabled.' : 'Notification Center is not enabled.');
        }
        throw error;
      }
    },

    async listEmployees({ identity, workspaceId }) {
      const signed = context(identity, workspaceId, 'read');
      return databaseCall(pool,
        'SELECT app_private.api_list_employees($1, $2, $3) AS result',
        [signed.payload, signed.signature, signed.keyId]);
    },

    async bootstrap({ identity, workspaceId }) {
      return (await readRoleVisibleState(identity, workspaceId)).bootstrap;
    },

    async bootstrapRevision({ identity, workspaceId }) {
      const { bootstrap } = await readRoleVisibleState(identity, workspaceId);
      return {
        ok: true,
        workspaceId: bootstrap.workspaceId,
        revision: bootstrap.data.sync.revision
      };
    },

    async listTimeOffRequests({ identity, workspaceId }) {
      const signed = context(identity, workspaceId, 'read');
      return databaseCall(pool,
        'SELECT app_private.api_list_time_off_requests($1, $2, $3) AS result',
        [signed.payload, signed.signature, signed.keyId]);
    },

    async listNotifications({ identity, workspaceId }) {
      const signed = context(identity, workspaceId, 'read');
      try {
        return await databaseCall(pool,
          'SELECT app_private.api_list_notifications($1, $2, $3) AS result',
          [signed.payload, signed.signature, signed.keyId]);
      } catch (error) {
        if (notificationSchemaUnavailable(error)) {
          return { ok: true, workspaceId, items: [], unreadCount: 0, available: false };
        }
        throw error;
      }
    },

    async pushStatus({ identity, workspaceId }) {
      const signed = context(identity, workspaceId, 'read');
      try {
        return await databaseCall(pool,
          'SELECT app_private.api_push_status($1, $2, $3) AS result',
          [signed.payload, signed.signature, signed.keyId]);
      } catch (error) {
        if (notificationSchemaUnavailable(error)) {
          return { ok: true, workspaceId, activeSubscriptionCount: 0, available: false };
        }
        throw error;
      }
    }
  });
}
