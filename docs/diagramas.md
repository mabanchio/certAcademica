# Diagramas Tecnicos

Este documento reúne las imágenes finales incluidas en la entrega. Cada una resume una parte clave del sistema y puede usarse directamente en la memoria, el README o la presentación.

## 1. Arquitectura del sistema

![Diagrama de arquitectura](arquitectura.png)

Este diagrama muestra la arquitectura general de la plataforma y cómo se conectan el frontend, el backend, el indexador, la base de datos y la capa on-chain de Solana. Sirve para entender el reparto de responsabilidades entre componentes.

## 2. Flujo de datos principal

![Diagrama de flujo de datos](diagrama-flujo.png)

Este diagrama resume el recorrido de una solicitud de certificación desde el egresado hasta la emisión y verificación final. Es útil para explicar el proceso extremo a extremo y el rol de cada actor.

## 3. Verificación pública

![Diagrama de verificación pública](verificaci%C3%B3n-p%C3%BAblica.png)

Este diagrama describe cómo un tercero puede verificar un certificado sin wallet, usando la consulta pública y la validación contra los datos indexados y el estado on-chain.

## 4. Certificación extranjera

![Diagrama de certificación extranjera](certificaci%C3%B3n-extranjera.png)

Este diagrama muestra el recorrido específico de las solicitudes de títulos extranjeros, incluyendo la intervención del Ministerio y la Cancillería según corresponda.

## Referencia técnica en Mermaid

Los diagramas anteriores son las piezas de entrega final. Si necesitas una versión editable o regenerar las imágenes, puedes usar esta referencia textual:

### Arquitectura

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

### Flujo de datos

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
