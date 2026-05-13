# Diagramas Tecnicos

## Diagrama de Arquitectura (Mermaid)

```mermaid
graph LR
  subgraph Frontend
    UI[Next.js Dashboard]
    Verify[Modulo Verificacion Publica]
  end

  subgraph Backend
    API[Express API]
    Docs[Almacenamiento Off-chain\nPDF y metadatos]
  end

  subgraph Indexador
    Listener[Listener de eventos]
    DB[(SQLite)]
  end

  subgraph Blockchain
    Program[Programa Anchor]
    Solana[Solana Cluster]
  end

  UI --> API
  Verify --> API
  API --> DB
  API --> Docs
  Listener --> Solana
  Listener --> DB
  API --> Program
  Program --> Solana
```

## Flujo de Datos (Solicitud y Emision)

```mermaid
sequenceDiagram
  participant E as Egresado
  participant F as Frontend
  participant P as Programa Anchor
  participant B as Backend API
  participant I as Indexador
  participant D as SQLite
  participant V as Verificador Publico

  E->>F: Solicita certificacion (firma wallet)
  F->>P: request_certification
  P-->>I: Emite eventos on-chain
  I->>D: Persiste eventos y estados

  F->>B: Sube PDF y metadatos (off-chain)
  B->>D: Guarda referencias y hash

  Note over F,P: Ministerio/Cancilleria resuelven segun tipo
  F->>P: aprobar/rechazar/derivar
  P-->>I: Nuevos eventos
  I->>D: Actualiza estado

  F->>P: Emision y asignacion de certificacion
  P-->>I: Evento de certificacion emitida
  I->>D: Indexa certificacion final

  V->>F: Abre modulo de verificacion publica
  F->>B: Consulta por pubkey o identidad
  B->>D: Recupera datos indexados
  B->>P: Contrasta estado/hash on-chain
  B-->>F: Resultado de verificacion
```

## Exportables de Entrega
- PENDIENTE: Exportar este contenido a `docs/arquitectura.png`.
- PENDIENTE: Exportar este contenido a `docs/diagrama-flujo.png`.
