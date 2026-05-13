# CertAcademica - TFM

## Descripcion
CertAcademica es una plataforma de certificacion academica sobre Solana orientada a la trazabilidad y verificacion publica de credenciales. El sistema integra programa on-chain, backend API, indexador de eventos y frontend web para cubrir el ciclo completo: solicitud, validacion, emision y consulta.

La solucion permite que distintos actores institucionales (Ministerio, Cancilleria, Universidad y Egresado) operen por rol con firma de wallet, manteniendo auditabilidad y verificacion de integridad mediante hashes y eventos on-chain.

## Problema que Resuelve
Los procesos tradicionales de certificacion academica suelen ser lentos, poco trazables y complejos de verificar por terceros. Esto incrementa riesgo de fraude documental y friccion operativa entre actores institucionales.

Este proyecto aborda ese problema con una arquitectura hibrida: evidencia de operaciones y estados en blockchain, y almacenamiento off-chain para documentos pesados y datos sensibles. De esta forma se logra verificabilidad, trazabilidad y mejor experiencia de consulta para usuarios e instituciones.

## Tecnologias Utilizadas
- Blockchain: Solana
- Programa on-chain: Rust + Anchor
- Backend: Node.js + Express + TypeScript
- Frontend: Next.js + React + Tailwind
- Base de datos: SQLite (indexador/backend)
- IA/Herramientas: GitHub Copilot, ChatGPT

## Arquitectura del Sistema
Ver diagrama y detalle tecnico en [docs/diagramas.md](docs/diagramas.md).

## Instalacion y Configuracion
### Requisitos Previos
- Node.js v18+
- npm
- Rust + Anchor CLI
- Solana CLI
- Wallet Solana (ej. Phantom, Backpack)

### Instalacion de Dependencias
```bash
# Dependencias raiz
npm install

# Backend
cd backend && npm install

# Frontend
cd frontend && npm install

# Indexador
cd ../indexer && npm install
```

### Configuracion
1. Copiar archivos de ejemplo de entorno donde corresponda (ej. `backend/.env.example` a `backend/.env`).
2. Configurar variables de entorno (RPC, puertos, rutas DB).
3. Compilar el programa Anchor:
```bash
anchor build
```

### Ejecucion
```bash
# Backend
cd backend && npm run dev

# Frontend
cd frontend && npm run dev

# Indexador
cd indexer && npm run dev
```

## Programa Solana Desplegado
- Red: Localnet / Devnet (segun configuracion)
- Program ID (Anchor.toml localnet):
  - `3A6PEQXB3UUrgNMEDnYYApx5B3jxwSfr7bTpjt5AEEpt`
- Explorador: Solana Explorer / Solscan

## Casos de Uso
1. Solicitud de certificacion local o extranjera por Egresado.
2. Resolucion de solicitudes por Ministerio/Cancilleria.
3. Emision y asignacion de certificaciones.
4. Verificacion publica por pubkey e identidad.
5. Consulta de actividad y auditoria por transaccion.

## Capturas de Pantalla
Ver carpeta [screenshots](screenshots). Se incluyen placeholders de entrega y nombres recomendados.

## Diagramas Tecnicos
Ver [docs/diagramas.md](docs/diagramas.md).

## Video Demostracion
PENDIENTE: agregar enlace cuando se grabe.

```markdown
## Video Demostracion
🎥 [Ver demostracion](PEGAR_LINK_LOOM_O_YOUTUBE_AQUI)
```

## Innovaciones Implementadas
- Emision y asignacion de certificacion extranjera en una sola firma.
- Mejora de UX por rol con detalle contextual de actividad.
- Verificacion publica sin necesidad de wallet conectada.
- Landing comercial/responsiva con acceso directo a verificacion.

## Uso de Herramientas de IA
Se utilizo asistencia de IA para soporte de desarrollo, depuracion, documentacion y refactor puntual de frontend/backend.

## Autor
- Nombre: Matias (completar apellido)
- Email: PENDIENTE
- LinkedIn: PENDIENTE

## Licencia
MIT. Ver archivo [LICENSE](LICENSE).
