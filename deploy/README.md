# Fase 16 - Deploy

Este documento define un despliegue progresivo: Devnet -> Testnet -> Mainnet.

## 1) Requisitos previos

- Solana CLI y Anchor CLI instalados.
- Wallet de despliegue configurada en `~/.config/solana/id.json`.
- Fondos suficientes (SOL de la red objetivo).
- Variables de entorno copiadas desde `deploy/env/<network>/*.env.example` a los `.env` reales de cada servicio.

## 2) Pre-flight (obligatorio antes de desplegar)

```bash
npm --prefix backend test
npm test
npm --prefix backend run build
npm --prefix indexer run build
npm --prefix frontend run build
```

## 3) Deploy del programa Anchor

### Devnet

```bash
npm run deploy:program:devnet
```

### Testnet

```bash
npm run deploy:program:testnet
```

### Mainnet

```bash
npm run deploy:program:mainnet
```

Nota: en testnet/mainnet actualiza `PROGRAM_ID` en los `.env` de backend/indexer/frontend con la address resultante del deploy.

## 4) Configurar indexador

1. Copiar `deploy/env/<network>/indexer.env.example` a `indexer/.env`.
2. Ajustar `START_SLOT`:
- `0` para reconstrucción completa.
- Slot reciente para despliegue incremental.
3. Ejecutar:

```bash
cd indexer
npm run start
```

## 5) Levantar backend

1. Copiar `deploy/env/<network>/backend.env.example` a `backend/.env`.
2. Verificar `DB_PATH` y `CORS_ORIGINS`.
3. Ejecutar:

```bash
cd backend
npm run start
```

## 6) Levantar frontend

1. Copiar `deploy/env/<network>/frontend.env.example` a `frontend/.env.local`.
2. Verificar `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_PROGRAM_ID`, `NEXT_PUBLIC_CLUSTER`.
3. Ejecutar:

```bash
cd frontend
npm run build
npm run start
```

## 7) Checklist de smoke test por entorno

- `/health` responde 200 en backend.
- `/verify` valida una certificacion conocida.
- Frontend conecta wallet y consulta backend.
- Indexador registra eventos nuevos en DB.
- Flujo completo E2E en red objetivo.

## 8) Promocion entre redes

- Promover a Testnet solo si Devnet pasa smoke + regresion.
- Promover a Mainnet solo si Testnet pasa smoke + monitoreo estable.
- Mantener backups de DB del indexador en cada promocion.
