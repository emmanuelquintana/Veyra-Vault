import { Router } from 'express';
import { sendError, sendSuccess } from '../core/http.js';
import { prisma } from '../prisma.js';
import {
  isRecoveryMetadata,
  isVaultRecordPayload,
  isVaultSettingsPayload,
  toVaultDto,
  toVaultInsert,
  toVaultRecoveryUpdate,
  toVaultSettingsUpdate,
  toVaultUpdate,
} from './vault-record.js';

export const vaultRouter = Router();

vaultRouter.post('/', async (req, res) => {
  const record = (req.body as Record<string, unknown>).record;
  const settings = (req.body as Record<string, unknown>).settings;

  if (!isVaultRecordPayload(record)) {
    return sendError(res, 400, 'TG_CORE_400', 'Invalid vault record.');
  }

  if (settings && !isVaultSettingsPayload(settings)) {
    return sendError(res, 400, 'TG_CORE_400', 'Invalid vault settings.');
  }

  try {
    const settingsUpdate = isVaultSettingsPayload(settings) ? toVaultSettingsUpdate(settings) : {};
    const vault = await prisma.vault.create({
      data: {
        ...toVaultInsert(record),
        ...settingsUpdate,
      },
    });

    return sendSuccess(res, toVaultDto(vault), 'Vault created.', 201);
  } catch (error) {
    return sendError(res, 500, 'TG_CORE_500', getDatabaseErrorMessage(error));
  }
});

vaultRouter.post('/recovery/lookup', async (req, res) => {
  const identifier = (req.body as Record<string, unknown>).identifier;

  if (typeof identifier !== 'string' || identifier.trim().length < 3 || identifier.trim().length > 320) {
    return sendError(res, 400, 'TG_CORE_400', 'Invalid recovery identifier.');
  }

  const normalizedIdentifier = identifier.trim().toLowerCase();

  try {
    const vault = await prisma.vault.findFirst({
      where: {
        recoverySalt: {
          not: null,
        },
        recoveryIv: {
          not: null,
        },
        recoveryCiphertext: {
          not: null,
        },
        OR: [
          {
            recoveryEmail: normalizedIdentifier,
          },
          {
            account: {
              is: {
                OR: [
                  {
                    email: normalizedIdentifier,
                  },
                  {
                    username: normalizedIdentifier,
                  },
                ],
              },
            },
          },
        ],
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (!vault) {
      return sendError(res, 404, 'TG_CORE_404', 'Recovery vault not found.');
    }

    return sendSuccess(res, toVaultDto(vault));
  } catch (error) {
    return sendError(res, 500, 'TG_CORE_500', getDatabaseErrorMessage(error));
  }
});

vaultRouter.post('/account/lookup', async (req, res) => {
  const identifier = (req.body as Record<string, unknown>).identifier;

  if (typeof identifier !== 'string' || identifier.trim().length < 3 || identifier.trim().length > 320) {
    return sendError(res, 400, 'TG_CORE_400', 'Identificador inválido.');
  }

  const normalizedIdentifier = identifier.trim().toLowerCase();

  try {
    const vault = await prisma.vault.findFirst({
      where: {
        account: {
          is: {
            OR: [
              { email: normalizedIdentifier },
              { username: normalizedIdentifier },
            ],
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (!vault) {
      return sendError(res, 404, 'TG_CORE_404', 'No se encontró ninguna bóveda con ese correo o usuario.');
    }

    return sendSuccess(res, toVaultDto(vault));
  } catch (error) {
    return sendError(res, 500, 'TG_CORE_500', getDatabaseErrorMessage(error));
  }
});

vaultRouter.get('/:vaultId', async (req, res) => {
  const { vaultId } = req.params;

  try {
    const vault = await prisma.vault.findUnique({
      where: {
        id: vaultId,
      },
    });

    if (!vault) {
      return sendError(res, 404, 'TG_CORE_404', 'Vault not found.');
    }

    return sendSuccess(res, toVaultDto(vault));
  } catch (error) {
    return sendError(res, 500, 'TG_CORE_500', getDatabaseErrorMessage(error));
  }
});

vaultRouter.put('/:vaultId', async (req, res) => {
  const { vaultId } = req.params;
  const record = (req.body as Record<string, unknown>).record;

  if (!isVaultRecordPayload(record)) {
    return sendError(res, 400, 'TG_CORE_400', 'Invalid vault record.');
  }

  try {
    const existingVault = await prisma.vault.findUnique({
      where: {
        id: vaultId,
      },
    });

    if (!existingVault) {
      return sendError(res, 404, 'TG_CORE_404', 'Vault not found.');
    }

    const vault = await prisma.vault.update({
      where: {
        id: vaultId,
      },
      data: toVaultUpdate(record),
    });

    return sendSuccess(res, toVaultDto(vault), 'Vault updated.');
  } catch (error) {
    return sendError(res, 500, 'TG_CORE_500', getDatabaseErrorMessage(error));
  }
});

vaultRouter.put('/:vaultId/settings', async (req, res) => {
  const { vaultId } = req.params;
  const settings = (req.body as Record<string, unknown>).settings;

  if (!isVaultSettingsPayload(settings)) {
    return sendError(res, 400, 'TG_CORE_400', 'Invalid vault settings.');
  }

  try {
    const vault = await prisma.vault.update({
      where: {
        id: vaultId,
      },
      data: toVaultSettingsUpdate(settings),
    });

    return sendSuccess(res, toVaultDto(vault), 'Vault settings updated.');
  } catch (error) {
    return sendError(res, 500, 'TG_CORE_500', getDatabaseErrorMessage(error));
  }
});

vaultRouter.put('/:vaultId/recovery', async (req, res) => {
  const { vaultId } = req.params;
  const record = (req.body as Record<string, unknown>).recoveryRecord;
  const metadata = (req.body as Record<string, unknown>).metadata;

  if (!isVaultRecordPayload(record) || !isRecoveryMetadata(metadata)) {
    return sendError(res, 400, 'TG_CORE_400', 'Invalid recovery payload.');
  }

  try {
    const vault = await prisma.vault.update({
      where: {
        id: vaultId,
      },
      data: toVaultRecoveryUpdate(record, metadata),
    });

    return sendSuccess(res, toVaultDto(vault), 'Vault recovery updated.');
  } catch (error) {
    return sendError(res, 500, 'TG_CORE_500', getDatabaseErrorMessage(error));
  }
});

vaultRouter.post('/:vaultId/account', async (req, res) => {
  const { vaultId } = req.params;
  const accountId = (req.body as Record<string, unknown>).accountId;

  if (typeof accountId !== 'string' || !accountId) {
    return sendError(res, 400, 'TG_CORE_400', 'Invalid account id.');
  }

  try {
    const vault = await prisma.vault.update({
      where: {
        id: vaultId,
      },
      data: {
        accountId,
      },
    });

    return sendSuccess(res, toVaultDto(vault), 'Account attached to vault.');
  } catch (error) {
    return sendError(res, 500, 'TG_CORE_500', getDatabaseErrorMessage(error));
  }
});

function getDatabaseErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Database operation failed.';
}
