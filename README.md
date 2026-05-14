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
- Red objetivo de entrega: Devnet
- Program ID localnet/devnet (configurado):
  - `3A6PEQXB3UUrgNMEDnYYApx5B3jxwSfr7bTpjt5AEEpt`
- Estado despliegue Devnet: exitoso
- Transacción de deploy (signature):
  - `5Gms5drp9y7duFh1iK7Sz6vmRijXeWe75TBYSQdPyw4RAxrjuBcXtaxx5juu14rD2AiEqHcvFBpvMtnHYkfWhj5i`
- Explorer (Devnet): https://explorer.solana.com/tx/5Gms5drp9y7duFh1iK7Sz6vmRijXeWe75TBYSQdPyw4RAxrjuBcXtaxx5juu14rD2AiEqHcvFBpvMtnHYkfWhj5i?cluster=devnet
- Solscan (Devnet): https://solscan.io/tx/5Gms5drp9y7duFh1iK7Sz6vmRijXeWe75TBYSQdPyw4RAxrjuBcXtaxx5juu14rD2AiEqHcvFBpvMtnHYkfWhj5i?cluster=devnet

## Casos de Uso
1. Solicitud de certificacion local o extranjera por Egresado.
2. Resolucion de solicitudes por Ministerio/Cancilleria.
3. Emision y asignacion de certificaciones.
4. Verificacion publica por pubkey e identidad.
5. Consulta de actividad y auditoria por transaccion.

## Capturas de Pantalla
Ver carpeta [screenshots](screenshots). Incluye la evidencia de deploy en Devnet en `06-sol-explorer-transaccion-devnet.png`.

## Diagramas Tecnicos
Ver [docs/diagramas.md](docs/diagramas.md).

## Video Demostracion
PENDIENTE: agregar enlace cuando se grabe.

```markdown
## 🎬 Video Demo

<p align="center">
  <a href="https://youtu.be/xzbMdvabSyE">
    <img src="https://img.youtube.com/vi/xzbMdvabSyE/hqdefault.jpg" 
         alt="CertAcademica Demo"
         width="700">
  </a>
</p>

<p align="center">
  Presentación oficial del Trabajo Final de Máster — CertAcademica
</p>
```

## Innovaciones Implementadas
- Emision y asignacion de certificacion extranjera en una sola firma.
- Mejora de UX por rol con detalle contextual de actividad.
- Verificacion publica sin necesidad de wallet conectada.
- Landing comercial/responsiva con acceso directo a verificacion.

## Uso de Herramientas de IA

El desarrollo de este proyecto contó con asistencia intensiva de herramientas de IA a lo largo de todo el ciclo:

**GitHub Copilot (MCP integrado en VS Code)**
- Utilizado como agente de desarrollo dentro de VS Code via Model Context Protocol (MCP).
- El agente ejecutó herramientas MCP para leer/escribir archivos, correr comandos de terminal, buscar referencias en el codebase y aplicar ediciones multi-archivo de forma coordinada.
- Flujo típico: prompt en lenguaje natural → el agente planifica tareas → usa herramientas MCP (`read_file`, `replace_string_in_file`, `run_in_terminal`, `grep_search`) → valida cambios → hace commit.
- Ejemplos concretos: depuración del indexador de eventos, diseño de queries SQLite con fallback de DNI, refactor del panel de auditoría, generación de tests de integración.

**ChatGPT**
- Consultas puntuales sobre patrones de Anchor (PDAs, seeds, CPI), diseño de flujos de certificación y revisión de lógica de negocio.

**Comprensión del código generado**
- Todo el código generado o sugerido por IA fue revisado, adaptado al dominio y validado mediante tests antes de integrarse al repositorio.

## Autor
- Nombre: Matias Alejandro Banchio
- Email: mabanchio@gmail.com
- LinkedIn: [linkedin.com/in/ab-tech](https://www.linkedin.com/in/ab-tech/)

## Licencia
MIT. Ver archivo [LICENSE](LICENSE).
