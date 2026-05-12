import { Router } from "express";
import { asyncHandler, createError } from "../middleware/errorHandler";
import { allowedBodyFields, parsePagination, isValidPublicKey, sanitizeStringParam } from "../middleware/validation";
import { generalLimiter, strictLimiter } from "../middleware/rateLimiter";
import {
  getAllPersons,
  getPersonByWallet,
  getPersonsByRole,
  updatePersonIdentity,
} from "../db";

const router = Router();

// GET /persons — listado paginado
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { limit, offset } = parsePagination(req);
    const persons = getAllPersons(limit, offset);
    res.json({ data: persons, limit, offset });
  })
);

// GET /persons/role/:role — filtrar por rol
router.get(
  "/role/:role",
  asyncHandler(async (req, res, next) => {
    const role = sanitizeStringParam(req.params.role, 20);
    if (!role) return next(createError("Rol inválido", 400));
    const validRoles = ["Admin", "Universidad", "Ministerio", "Cancilleria", "Egresado"];
    if (!validRoles.includes(role)) return next(createError("Rol no reconocido", 400));
    const { limit, offset } = parsePagination(req);
    const persons = getPersonsByRole(role, limit, offset);
    res.json({ data: persons, limit, offset });
  })
);

// GET /persons/:pubkey — detalle de una persona por wallet
router.get(
  "/:pubkey",
  generalLimiter,
  asyncHandler(async (req, res, next) => {
    const { pubkey } = req.params;
    if (!isValidPublicKey(pubkey)) return next(createError("Clave pública inválida", 400));
    const person = getPersonByWallet(pubkey);
    if (!person) return next(createError("Persona no encontrada", 404));
    res.json({ data: person });
  })
);

// PUT /persons/:pubkey — actualizar datos de identidad (nombre, apellido, DNI)
router.put(
  "/:pubkey",
  strictLimiter,
  allowedBodyFields("nombre", "apellido", "dni"),
  asyncHandler(async (req, res, next) => {
    const { pubkey } = req.params;
    if (!isValidPublicKey(pubkey)) return next(createError("Clave pública inválida", 400));
    
    const { nombre, apellido, dni } = req.body as Record<string, unknown>;
    
    const updated = updatePersonIdentity(
      pubkey,
      typeof nombre === "string" ? nombre : undefined,
      typeof apellido === "string" ? apellido : undefined,
      typeof dni === "string" ? dni : undefined
    );
    
    if (!updated) return next(createError("Persona no encontrada", 404));
    res.json({ data: updated });
  })
);

// POST /persons/bootstrap — deshabilitado: el alta debe firmarla la wallet solicitante o el admin conectado
router.post(
  "/bootstrap",
  strictLimiter,
  allowedBodyFields("wallet", "nombre", "apellido", "dni", "roleData"),
  asyncHandler(async (_req, _res, next) => {
    return next(
      createError(
        "Ruta deshabilitada: el alta de persona debe ejecutarse con una transacción firmada por la wallet solicitante o por la wallet admin conectada.",
        410
      )
    );
  })
);

export default router;
