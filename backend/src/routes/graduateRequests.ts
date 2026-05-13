import { Router } from "express";
import { asyncHandler, createError } from "../middleware/errorHandler";
import { parsePagination, isValidPublicKey } from "../middleware/validation";
import {
  getDb,
  getGraduateRequestsByStatus,
  getGraduateRequestByWallet,
  type GraduateRequestRow,
} from "../db";
import {
  getDocumentAbsolutePath,
  getDocumentByWallet,
  saveGraduateRequestDocument,
} from "../graduateRequestDocuments";
import { getGraduateRequestByPubkey } from "../db";

const router = Router();

const VALID_ESTADOS = new Set([
  "Pendiente",
  "AprobadoLocal",
  "AprobadoExtranjero",
  "Rechazado",
  "DerivadoCancilleria",
]);

type GraduateRequestEnriched = GraduateRequestRow & {
  pdf_url: string | null;
  pdf_file_name: string | null;
  pdf_uploaded_at: number | null;
  titulo_nombre: string | null;
  titulo_carrera: string | null;
  titulo_institucion: string | null;
  titulo_anio: number | null;
  titulo_pais: string | null;
  titulo_observaciones: string | null;
  ministerio_derivador_wallet: string | null;
  ministerio_derivador_nombre: string | null;
  ministerio_derivador_apellido: string | null;
};

function cleanText(value: unknown, max = 200): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function getDeriveInfo(pubkey: string): {
  wallet: string | null;
  nombre: string | null;
  apellido: string | null;
} {
  const row = getDb()
    .prepare(
      `SELECT ae.actor AS wallet, p.nombre AS nombre, p.apellido AS apellido
       FROM audit_entries ae
       LEFT JOIN persons p ON p.wallet = ae.actor
       WHERE ae.entidad = ? AND ae.accion = 'DeriveCancilleria'
       ORDER BY ae.timestamp DESC, ae.id DESC
       LIMIT 1`
    )
    .get(pubkey) as { wallet: string | null; nombre: string | null; apellido: string | null } | undefined;

  return {
    wallet: row?.wallet ?? null,
    nombre: row?.nombre ?? null,
    apellido: row?.apellido ?? null,
  };
}

function enrichGraduateRequest(row: GraduateRequestRow): GraduateRequestEnriched {
  const doc = getDocumentByWallet(row.wallet);
  const derive = getDeriveInfo(row.pubkey);

  return {
    ...row,
    pdf_url: doc ? `/graduate-requests/wallet/${row.wallet}/document` : null,
    pdf_file_name: doc?.file_name ?? null,
    pdf_uploaded_at: doc?.uploaded_at ?? null,
    titulo_nombre: doc?.titulo_nombre ?? null,
    titulo_carrera: doc?.titulo_carrera ?? null,
    titulo_institucion: doc?.titulo_institucion ?? null,
    titulo_anio: doc?.titulo_anio ?? null,
    titulo_pais: doc?.titulo_pais ?? null,
    titulo_observaciones: doc?.titulo_observaciones ?? null,
    ministerio_derivador_wallet: derive.wallet,
    ministerio_derivador_nombre: derive.nombre,
    ministerio_derivador_apellido: derive.apellido,
  };
}

// GET /graduate-requests?estado=Pendiente|DerivadoCancilleria|...
router.get(
  "/",
  asyncHandler(async (req, res, next) => {
    const { limit, offset } = parsePagination(req);
    const estado = req.query.estado as string | undefined;
    if (!estado || !VALID_ESTADOS.has(estado)) {
      return next(createError("Parámetro 'estado' requerido y válido", 400));
    }
    const rows = getGraduateRequestsByStatus(estado, limit, offset).map(enrichGraduateRequest);
    res.json({ data: rows, limit, offset });
  })
);

// GET /graduate-requests/wallet/:wallet — solicitud del egresado
router.get(
  "/wallet/:wallet",
  asyncHandler(async (req, res, next) => {
    const { wallet } = req.params;
    if (!isValidPublicKey(wallet)) return next(createError("Clave pública inválida", 400));
    const row = getGraduateRequestByWallet(wallet);
    res.json({ data: row ? enrichGraduateRequest(row) : null });
  })
);

// GET /graduate-requests/pubkey/:pubkey — solicitud por pubkey (para auditoría)
router.get(
  "/pubkey/:pubkey",
  asyncHandler(async (req, res, next) => {
    const { pubkey } = req.params;
    if (!isValidPublicKey(pubkey)) return next(createError("Clave pública inválida", 400));
    const row = getGraduateRequestByPubkey(pubkey);
    res.json({ data: row ? enrichGraduateRequest(row) : null });
  })
);

// GET /graduate-requests/wallet/:wallet/document — descarga PDF persistido
router.get(
  "/wallet/:wallet/document",
  asyncHandler(async (req, res, next) => {
    const { wallet } = req.params;
    if (!isValidPublicKey(wallet)) return next(createError("Clave pública inválida", 400));

    const doc = getDocumentByWallet(wallet);
    if (!doc) return next(createError("No existe documento para esa solicitud", 404));

    const filePath = getDocumentAbsolutePath(doc.disk_name);
    res.setHeader("Content-Type", doc.mime_type || "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=\"${doc.file_name || "titulo.pdf"}\"`);
    res.sendFile(filePath);
  })
);

// POST /graduate-requests/documents — persistencia del PDF y datos del título
router.post(
  "/documents",
  asyncHandler(async (req, res, next) => {
    const wallet = cleanText(req.body?.wallet, 64);
    const pdfBase64 = cleanText(req.body?.pdf_base64, 20_000_000);
    const pdfHash = cleanText(req.body?.pdf_hash, 128).toLowerCase();
    const fileName = cleanText(req.body?.file_name, 180);
    const mimeType = cleanText(req.body?.mime_type, 80) || "application/pdf";

    const tituloNombre = cleanText(req.body?.titulo_nombre, 180);
    const tituloCarrera = cleanText(req.body?.titulo_carrera, 180);
    const tituloInstitucion = cleanText(req.body?.titulo_institucion, 180);
    const tituloPais = cleanText(req.body?.titulo_pais, 100);
    const tituloObservaciones = cleanText(req.body?.titulo_observaciones, 400);
    const tituloAnioRaw = req.body?.titulo_anio;
    const tituloAnio =
      typeof tituloAnioRaw === "number"
        ? tituloAnioRaw
        : Number.parseInt(cleanText(tituloAnioRaw, 4), 10);

    if (!isValidPublicKey(wallet)) return next(createError("Wallet inválida", 400));
    if (!pdfBase64) return next(createError("PDF requerido", 400));
    if (!pdfHash || !/^[0-9a-f]{64}$/.test(pdfHash)) {
      return next(createError("Hash PDF inválido", 400));
    }
    if (mimeType !== "application/pdf") {
      return next(createError("Solo se admite application/pdf", 400));
    }
    if (!tituloNombre || !tituloCarrera || !tituloInstitucion) {
      return next(createError("Datos del título incompletos", 400));
    }
    if (!Number.isFinite(tituloAnio) || tituloAnio < 1900 || tituloAnio > 2100) {
      return next(createError("Año del título inválido", 400));
    }

    const row = getGraduateRequestByWallet(wallet);
    if (!row) return next(createError("No existe solicitud de graduación para la wallet", 404));

    if (row.pdf_hash && row.pdf_hash.toLowerCase() !== pdfHash) {
      return next(createError("El hash enviado no coincide con el hash registrado de la solicitud", 409));
    }

    saveGraduateRequestDocument({
      wallet,
      pubkey: row.pubkey,
      pdfHash,
      fileName,
      mimeType,
      pdfBase64,
      tituloNombre,
      tituloCarrera,
      tituloInstitucion,
      tituloAnio,
      tituloPais,
      tituloObservaciones,
    });

    const updated = getGraduateRequestByWallet(wallet);
    res.json({ data: updated ? enrichGraduateRequest(updated) : null });
  })
);

export default router;
