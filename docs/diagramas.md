# Diagramas Tecnicos

Este documento reúne los diagramas técnicos del sistema en formato Mermaid (renderizables en GitHub) junto con las imágenes de referencia. Cada sección resume una parte clave de la arquitectura.

## 1. Arquitectura del sistema

```mermaid
graph TB
    subgraph "Frontend (Next.js + Tailwind)"
        UI[Dashboard por Rol]
        VERIFY[Verificación Pública]
        WALLET[Wallet Adapter]
    end

    subgraph "Backend BFF (Express + TypeScript)"
        API[REST API :3001]
        SQLITE[(SQLite indexer.db)]
    end

    subgraph "Indexer (TypeScript)"
        LISTENER[Event Listener]
        HANDLERS[Handlers]
    end

    subgraph "Blockchain (Solana)"
        PROG[Programa Anchor\nacademic_certification]
        CHAIN[Solana Devnet/Localnet]
    end

    UI --> WALLET
    UI --> API
    VERIFY --> API
    WALLET --> PROG
    API --> SQLITE
    LISTENER --> CHAIN
    LISTENER --> HANDLERS
    HANDLERS --> SQLITE
    PROG --> CHAIN

    style UI fill:#0f172a,color:#fff
    style VERIFY fill:#0f172a,color:#fff
    style WALLET fill:#9945FF,color:#fff
    style API fill:#16a34a,color:#fff
    style SQLITE fill:#854d0e,color:#fff
    style LISTENER fill:#1e40af,color:#fff
    style HANDLERS fill:#1e40af,color:#fff
    style PROG fill:#9945FF,color:#fff
    style CHAIN fill:#14b8a6,color:#fff
```

![Diagrama de arquitectura](arquitectura.png)

## 2. Flujo de datos principal — Solicitud de certificación

```mermaid
sequenceDiagram
    actor Egresado
    participant Frontend
    participant Programa as Programa Anchor
    participant Solana
    participant Indexer
    participant Backend

    Egresado->>Frontend: Completa formulario + adjunta PDF
    Frontend->>Programa: request_certification(tipo, pdf_hash, pais)
    Programa->>Solana: Transacción firmada
    Solana-->>Programa: Confirmación + logs
    Programa-->>Frontend: OK
    Note over Indexer: Escucha eventos on-chain
    Solana-->>Indexer: GraduateRequestEvent
    Indexer->>Backend: Escribe en SQLite

    alt Solicitud LOCAL
        Note over Frontend: Ministerio revisa
        Frontend->>Programa: approve_local_request()
        Programa->>Solana: Transacción
        Solana-->>Indexer: CertificationIssuedEvent
        Indexer->>Backend: Actualiza DB
    else Solicitud EXTRANJERA
        Note over Frontend: Ministerio deriva
        Frontend->>Programa: derive_to_cancilleria()
        Note over Frontend: Cancillería aprueba
        Frontend->>Programa: approve_foreign()
        Programa->>Solana: Transacción
        Solana-->>Indexer: CertificationIssuedEvent
        Indexer->>Backend: Actualiza DB
    end

    Egresado->>Frontend: Consulta dashboard
    Frontend->>Backend: GET /egresado/certifications
    Backend-->>Frontend: Certificaciones emitidas
```

![Diagrama de flujo de datos](diagrama-flujo.png)

## 3. Verificación pública

```mermaid
flowchart LR
    A([Tercero]) -->|Busca por pubkey o nombre| B[Frontend /verify]
    B -->|GET /public/certifications| C[Backend API]
    C -->|Consulta SQLite| D[(indexer.db)]
    D --> C
    C --> B
    B -->|Muestra certificación + estado| A
    B -->|Compara hash_datos| E[Datos on-chain via RPC]
    E --> B
```

![Diagrama de verificación pública](verificaci%C3%B3n-p%C3%BAblica.png)

## 4. Flujo de certificación extranjera

```mermaid
stateDiagram-v2
    [*] --> Pendiente : request_certification(EXTRANJERO)
    Pendiente --> Derivada : derive_to_cancilleria()
    Pendiente --> Rechazada : reject_request(motivo)
    Derivada --> Aprobada : approve_foreign()
    Derivada --> Rechazada : reject_foreign(motivo)
    Aprobada --> Revocada : revoke_certification(motivo)
    Aprobada --> [*]
    Rechazada --> [*]
    Revocada --> [*]
```

![Diagrama de certificación extranjera](certificaci%C3%B3n-extranjera.png)