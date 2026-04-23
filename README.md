# Veyra Vault

Veyra es un administrador de contraseñas con frontend React, backend Express y base de datos Supabase Postgres gestionada con Prisma.

## Estructura

```text
src/
  app/        Experiencia React principal y estilos globales
  assets/     Iconos y favicon
  config/     Identidad de marca y constantes compartidas
  domain/     Tipos del dominio de bóveda
  services/   Cliente HTTP del frontend
server/
  accounts/   CRUD de usuario y avatar Base64
  core/       Respuestas API, errores y metadata
  vaults/     Rutas de bóveda, preferencias y recuperación
prisma/
  migrations/ Migraciones aplicadas a Supabase
  schema.prisma
```

## Comandos

```bash
npm install
npm run db:deploy
npm run dev:api
npm run dev
npm run build
```

## Configuración

1. Copia `.env.example` a `.env`.
2. Rellena `DATABASE_URL` y `DIRECT_URL` con los connection strings de Supabase.
3. Ejecuta `npm run db:deploy` para aplicar migraciones en Supabase.
4. Usa `npm run db:studio` si quieres inspeccionar la base con Prisma Studio.

## Seguridad

- La bóveda se cifra en el navegador con AES-GCM 256.
- La clave se deriva de la contraseña maestra con PBKDF2-SHA-256 y 310,000 rondas.
- La contraseña maestra no se manda al backend y no se guarda.
- Supabase guarda el registro cifrado, tema, recuperación y perfil.
- El avatar se guarda como Base64 en `accounts.avatar_url`.
- Los Excel exportados incluyen contraseñas visibles; úsalos como archivos temporales.

## API

Todas las rutas responden con:

```json
{
  "code": "TG_CORE_200",
  "message": "Success",
  "traceId": "uuid",
  "data": {},
  "metadata": {
    "page": 1,
    "pageSize": 0,
    "total": 0,
    "totalPages": 0
  }
}
```
