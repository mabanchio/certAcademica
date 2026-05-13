# Manual de Usuario

## 1. Acceso General
1. Abrir la aplicacion frontend.
2. Para operativa interna, conectar wallet Solana.
3. Para consulta publica, ir a `/verify` sin wallet.

## 2. Flujos por Rol

### Egresado
1. Completar formulario de solicitud de certificacion.
2. Adjuntar evidencia documental (PDF).
3. Firmar transaccion.
4. Revisar estado y actividad en su dashboard.

### Ministerio
1. Revisar solicitudes de graduacion y tokens.
2. Aprobar, rechazar o derivar con motivo.
3. Emitir certificacion cuando corresponda.
4. Consultar actividad y detalle por transaccion.

### Cancilleria
1. Revisar solicitudes derivadas para titulos extranjeros.
2. Aprobar o rechazar con motivo.
3. Ver historial de actividad y eventos.

### Universidad
1. Solicitar/gestionar tokens de certificacion.
2. Emitir y asignar certificaciones.
3. Revisar certificaciones emitidas y actividad.

## 3. Verificacion Publica
1. Ir a la pagina `/verify`.
2. Buscar por pubkey o identidad.
3. Abrir detalle y revisar estado del certificado.

## 4. Buenas Practicas
- Verificar red y wallet antes de firmar.
- Completar motivos en rechazos para trazabilidad.
- No compartir claves privadas.

## 5. Resolucion de Problemas
- Si no carga el dashboard: reconectar wallet y refrescar.
- Si no aparece una emision reciente: esperar indexador y recargar.
- Si falla backend: revisar variables de entorno y logs.
