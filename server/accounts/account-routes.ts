import { Router } from 'express';
import { PaginationMetadata } from '../core/pagination-metadata.js';
import { ApiResponseBuilder } from '../core/api-response-builder.js';
import { sendError, sendSuccess } from '../core/http.js';
import { prisma } from '../prisma.js';

export const accountRouter = Router();

type AccountPayload = {
  username: string;
  email: string;
  displayName: string;
  avatarUrl: string;
};

const maxAvatarLength = 750_000;

function isAccountPayload(value: unknown): value is AccountPayload {
  if (!value || typeof value !== 'object') return false;
  const account = value as Record<string, unknown>;
  return (
    typeof account.username === 'string' &&
    account.username.trim().length >= 3 &&
    account.username.trim().length <= 80 &&
    typeof account.email === 'string' &&
    account.email.trim().length >= 5 &&
    account.email.trim().length <= 320 &&
    typeof account.displayName === 'string' &&
    account.displayName.trim().length <= 120 &&
    typeof account.avatarUrl === 'string' &&
    isAvatarPayload(account.avatarUrl)
  );
}

function isAvatarPayload(value: string) {
  const avatar = value.trim();

  if (!avatar) return true;
  if (avatar.length > maxAvatarLength) return false;

  return (
    /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(avatar) ||
    /^https:\/\/\S+$/i.test(avatar)
  );
}

function toAccountDto(account: {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: account.id,
    username: account.username,
    email: account.email,
    displayName: account.displayName ?? '',
    avatarUrl: account.avatarUrl ?? '',
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

function toAccountData(payload: AccountPayload) {
  return {
    username: payload.username.trim().toLowerCase(),
    email: payload.email.trim().toLowerCase(),
    displayName: payload.displayName.trim() || null,
    avatarUrl: payload.avatarUrl.trim() || null,
  };
}

accountRouter.get('/', async (req, res) => {
  const page = Math.max(Number(req.query.page ?? 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize ?? 20), 1), 100);

  try {
    const [accounts, total] = await Promise.all([
      prisma.account.findMany({
        orderBy: {
          updatedAt: 'desc',
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.account.count(),
    ]);
    const metadata = new PaginationMetadata({
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    });

    return res.json(
      ApiResponseBuilder.create()
        .traceId(String(res.locals.traceId ?? ''))
        .data(accounts.map(toAccountDto))
        .metadata(metadata)
        .build(),
    );
  } catch (error) {
    return sendError(res, 500, 'TG_CORE_500', getDatabaseErrorMessage(error));
  }
});

accountRouter.post('/', async (req, res) => {
  const payload = (req.body as Record<string, unknown>).account;

  if (!isAccountPayload(payload)) {
    return sendError(res, 400, 'TG_CORE_400', 'Invalid account payload.');
  }

  try {
    const account = await prisma.account.create({
      data: toAccountData(payload),
    });

    return sendSuccess(res, toAccountDto(account), 'Account created.', 201);
  } catch (error) {
    return sendError(res, 500, 'TG_CORE_500', getDatabaseErrorMessage(error));
  }
});

accountRouter.get('/:accountId', async (req, res) => {
  const { accountId } = req.params;

  try {
    const account = await prisma.account.findUnique({
      where: {
        id: accountId,
      },
    });

    if (!account) {
      return sendError(res, 404, 'TG_CORE_404', 'Account not found.');
    }

    return sendSuccess(res, toAccountDto(account));
  } catch (error) {
    return sendError(res, 500, 'TG_CORE_500', getDatabaseErrorMessage(error));
  }
});

accountRouter.put('/:accountId', async (req, res) => {
  const { accountId } = req.params;
  const payload = (req.body as Record<string, unknown>).account;

  if (!isAccountPayload(payload)) {
    return sendError(res, 400, 'TG_CORE_400', 'Invalid account payload.');
  }

  try {
    const account = await prisma.account.update({
      where: {
        id: accountId,
      },
      data: toAccountData(payload),
    });

    return sendSuccess(res, toAccountDto(account), 'Account updated.');
  } catch (error) {
    return sendError(res, 500, 'TG_CORE_500', getDatabaseErrorMessage(error));
  }
});

accountRouter.delete('/:accountId', async (req, res) => {
  const { accountId } = req.params;

  try {
    const account = await prisma.account.delete({
      where: {
        id: accountId,
      },
    });

    return sendSuccess(res, toAccountDto(account), 'Account deleted.');
  } catch (error) {
    return sendError(res, 500, 'TG_CORE_500', getDatabaseErrorMessage(error));
  }
});

function getDatabaseErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Database operation failed.';
}
