use anchor_lang::prelude::*;

declare_id!("3A6PEQXB3UUrgNMEDnYYApx5B3jxwSfr7bTpjt5AEEpt");

const CONFIG_SEED: &[u8] = b"config";
const PERSON_SEED: &[u8] = b"person";
const ROLE_REQUEST_SEED: &[u8] = b"role_request";
const TOKEN_REQUEST_SEED: &[u8] = b"token_request";
const CERT_TOKEN_SEED: &[u8] = b"cert_token";
const CERTIFICATION_SEED: &[u8] = b"certification";
const GRADUATE_REQUEST_SEED: &[u8] = b"graduate_request";
const AUDIT_LOG_SEED: &[u8] = b"audit_log";

#[program]
pub mod academic_certification {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        nombre: String,
        apellido: String,
        dni: String,
    ) -> Result<()> {
        validate_nombre(&nombre)?;
        validate_apellido(&apellido)?;
        validate_dni(&dni)?;

        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.bump = ctx.bumps.config;

        let admin_person = &mut ctx.accounts.admin_person;
        admin_person.wallet = ctx.accounts.admin.key();
        admin_person.nombre = nombre.clone();
        admin_person.apellido = apellido.clone();
        admin_person.dni = dni;
        admin_person.status = PersonStatus::Activo;
        admin_person.roles = vec![Role::Admin];
        admin_person.role_data = String::new();
        admin_person.bump = ctx.bumps.admin_person;

        let now = Clock::get()?.unix_timestamp;

        emit!(AuditLogEvent {
            actor: ctx.accounts.admin.key(),
            accion: AuditAction::Initialize,
            entidad: ctx.accounts.admin_person.key(),
            motivo: String::new(),
            timestamp: now,
        });

        emit!(PersonRegisteredEvent {
            wallet: ctx.accounts.admin.key(),
            nombre,
            apellido,
            registered_by: ctx.accounts.admin.key(),
            timestamp: now,
        });

        Ok(())
    }

    pub fn register_person(
        ctx: Context<RegisterPerson>,
        nombre: String,
        apellido: String,
        dni: String,
        role_data: String,
    ) -> Result<()> {
        validate_nombre(&nombre)?;
        validate_apellido(&apellido)?;
        validate_dni(&dni)?;
        validate_role_data(&role_data)?;

        ensure_admin(&ctx.accounts.config, &ctx.accounts.authority, &ctx.accounts.authority_person)?;

        let (person_key, person_nombre, person_apellido) = {
            let person = &mut ctx.accounts.person;
            person.wallet = ctx.accounts.wallet.key();
            person.nombre = nombre;
            person.apellido = apellido;
            person.dni = dni;
            person.status = PersonStatus::Activo;
            // El alta inicial no asigna rol operativo; los roles se otorgan por flujo explícito.
            person.roles = vec![];
            person.role_data = role_data;
            person.bump = ctx.bumps.person;

            (person.key(), person.nombre.clone(), person.apellido.clone())
        };

        let now = Clock::get()?.unix_timestamp;

        emit!(AuditLogEvent {
            actor: ctx.accounts.authority.key(),
            accion: AuditAction::RegisterPerson,
            entidad: person_key,
            motivo: String::new(),
            timestamp: now,
        });

        emit!(PersonRegisteredEvent {
            wallet: ctx.accounts.wallet.key(),
            nombre: person_nombre,
            apellido: person_apellido,
            registered_by: ctx.accounts.authority.key(),
            timestamp: now,
        });

        Ok(())
    }

    pub fn request_role(
        ctx: Context<RequestRole>,
        requested_role: Role,
        nombre: String,
        apellido: String,
        dni: String,
        role_data: String,
    ) -> Result<()> {
        validate_nombre(&nombre)?;
        validate_apellido(&apellido)?;
        validate_dni(&dni)?;
        validate_role_data(&role_data)?;

        let requester_key = ctx.accounts.requester.key();
        let requester = &mut ctx.accounts.requester_person;

        let is_new_requester = requester.wallet == Pubkey::default();
        if is_new_requester {
            requester.wallet = requester_key;
            requester.status = PersonStatus::Activo;
            requester.roles = vec![];
            requester.bump = ctx.bumps.requester_person;
        }

        requester.nombre = nombre.clone();
        requester.apellido = apellido.clone();
        requester.dni = dni;
        requester.role_data = role_data;

        ensure_active(requester)?;

        require!(requested_role != Role::Admin, ErrorCode::RoleNoSolicitable);
        require!(!requester.has_role(requested_role), ErrorCode::RolYaAsignado);

        let role_request = &mut ctx.accounts.role_request;
        // Con `init_if_needed`, una cuenta recién creada queda en cero y su enum
        // `status` deserializa como `Pendiente`. Solo debemos bloquear si la cuenta
        // ya fue usada antes para esta PDA (requester/rol).
        let is_existing_request = role_request.requester != Pubkey::default();
        if is_existing_request {
            require!(
                role_request.status != RoleRequestStatus::Pendiente,
                ErrorCode::SolicitudYaPendiente
            );
        }
        role_request.requester = requester.wallet;
        role_request.requested_role = requested_role;
        role_request.status = RoleRequestStatus::Pendiente;
        role_request.rejection_reason = String::new();

        let now = Clock::get()?.unix_timestamp;
        role_request.created_at = now;
        role_request.updated_at = now;
        role_request.bump = ctx.bumps.role_request;

        if is_new_requester {
            emit!(PersonRegisteredEvent {
                wallet: requester_key,
                nombre,
                apellido,
                registered_by: requester_key,
                timestamp: now,
            });
        }

        emit!(RoleRequestedEvent {
            requester: requester.wallet,
            requested_role,
            timestamp: now,
        });

        emit!(AuditLogEvent {
            actor: ctx.accounts.requester.key(),
            accion: AuditAction::RequestRole,
            entidad: ctx.accounts.role_request.key(),
            motivo: String::new(),
            timestamp: now,
        });

        Ok(())
    }

    pub fn approve_role(ctx: Context<ResolveRoleRequest>) -> Result<()> {
        ensure_admin(&ctx.accounts.config, &ctx.accounts.admin, &ctx.accounts.admin_person)?;
        ensure_active(&ctx.accounts.target_person)?;

        let role_request = &mut ctx.accounts.role_request;
        require!(role_request.status == RoleRequestStatus::Pendiente, ErrorCode::SolicitudNoPendiente);
        require!(
            role_request.requester == ctx.accounts.target_person.wallet,
            ErrorCode::SolicitanteInvalido
        );

        let target_person = &mut ctx.accounts.target_person;
        require!(
            !target_person.has_role(role_request.requested_role),
            ErrorCode::RolYaAsignado
        );
        target_person.roles.push(role_request.requested_role);

        let now = Clock::get()?.unix_timestamp;
        role_request.status = RoleRequestStatus::Aprobada;
        role_request.rejection_reason = String::new();
        role_request.updated_at = now;

        emit!(RoleApprovedEvent {
            requester: role_request.requester,
            approved_role: role_request.requested_role,
            approver: ctx.accounts.admin.key(),
            timestamp: now,
        });

        emit!(AuditLogEvent {
            actor: ctx.accounts.admin.key(),
            accion: AuditAction::ApproveRole,
            entidad: ctx.accounts.role_request.key(),
            motivo: String::new(),
            timestamp: now,
        });

        Ok(())
    }

    pub fn reject_role(ctx: Context<ResolveRoleRequest>, motivo: String) -> Result<()> {
        validate_rejection_reason(&motivo)?;

        ensure_admin(&ctx.accounts.config, &ctx.accounts.admin, &ctx.accounts.admin_person)?;

        let role_request = &mut ctx.accounts.role_request;
        require!(role_request.status == RoleRequestStatus::Pendiente, ErrorCode::SolicitudNoPendiente);
        require!(
            role_request.requester == ctx.accounts.target_person.wallet,
            ErrorCode::SolicitanteInvalido
        );

        let now = Clock::get()?.unix_timestamp;
        role_request.status = RoleRequestStatus::Rechazada;
        role_request.rejection_reason = motivo.clone();
        role_request.updated_at = now;

        let rr_key = role_request.key();
        let reject_motivo = role_request.rejection_reason.clone();
        emit!(RoleRejectedEvent {
            requester: role_request.requester,
            rejected_role: role_request.requested_role,
            approver: ctx.accounts.admin.key(),
            reason: motivo,
            timestamp: now,
        });

        emit!(AuditLogEvent {
            actor: ctx.accounts.admin.key(),
            accion: AuditAction::RejectRole,
            entidad: rr_key,
            motivo: reject_motivo,
            timestamp: now,
        });

        Ok(())
    }

    pub fn set_status(ctx: Context<SetStatus>, status: PersonStatus, motivo: String) -> Result<()> {
        validate_change_reason(&motivo)?;

        ensure_admin(&ctx.accounts.config, &ctx.accounts.admin, &ctx.accounts.admin_person)?;

        let person = &mut ctx.accounts.target_person;
        require!(
            person.wallet != ctx.accounts.admin.key(),
            ErrorCode::AdminNoModificable
        );
        person.status = status;

        let person_wallet = person.wallet;
        let person_key = ctx.accounts.target_person.key();
        let now_ss = Clock::get()?.unix_timestamp;
        emit!(StatusChangedEvent {
            person: person_wallet,
            changed_by: ctx.accounts.admin.key(),
            status,
            reason: motivo.clone(),
            timestamp: now_ss,
        });

        emit!(AuditLogEvent {
            actor: ctx.accounts.admin.key(),
            accion: AuditAction::SetStatus,
            entidad: person_key,
            motivo,
            timestamp: now_ss,
        });

        Ok(())
    }

    pub fn update_person_admin(
        ctx: Context<UpdatePersonAdmin>,
        nombre: String,
        apellido: String,
        dni: String,
        status: PersonStatus,
        roles: Vec<Role>,
        role_data: String,
        motivo: String,
    ) -> Result<()> {
        validate_nombre(&nombre)?;
        validate_apellido(&apellido)?;
        validate_dni(&dni)?;
        validate_role_data(&role_data)?;
        validate_change_reason(&motivo)?;

        ensure_admin(&ctx.accounts.config, &ctx.accounts.admin, &ctx.accounts.admin_person)?;

        let person = &mut ctx.accounts.target_person;
        require!(
            person.wallet != ctx.accounts.admin.key(),
            ErrorCode::AdminNoModificable
        );

        validate_roles_for_person_update(&roles, &role_data)?;

        person.nombre = nombre;
        person.apellido = apellido;
        person.dni = dni;
        person.status = status;
        person.roles = roles.clone();
        person.role_data = role_data.clone();

        let now = Clock::get()?.unix_timestamp;

        emit!(PersonUpdatedEvent {
            wallet: person.wallet,
            nombre: person.nombre.clone(),
            apellido: person.apellido.clone(),
            dni: person.dni.clone(),
            status,
            roles,
            role_data,
            updated_by: ctx.accounts.admin.key(),
            timestamp: now,
        });

        emit!(AuditLogEvent {
            actor: ctx.accounts.admin.key(),
            accion: AuditAction::UpdatePerson,
            entidad: ctx.accounts.target_person.key(),
            motivo,
            timestamp: now,
        });

        Ok(())
    }

    pub fn request_tokens(
        ctx: Context<RequestTokens>,
        _id: u64,
        carrera: String,
        plan: String,
        resolucion: String,
        anio_egreso: u16,
        cantidad: u32,
    ) -> Result<()> {
        validate_carrera(&carrera)?;
        validate_plan(&plan)?;
        validate_resolucion(&resolucion)?;
        validate_anio_egreso(anio_egreso)?;
        validate_cantidad(cantidad)?;

        ensure_universidad(&ctx.accounts.solicitante_person)?;

        let tr = &mut ctx.accounts.token_request;
        tr.universidad = ctx.accounts.solicitante.key();
        tr.solicitante = ctx.accounts.solicitante.key();
        tr.carrera = carrera;
        tr.plan = plan;
        tr.resolucion = resolucion;
        tr.anio_egreso = anio_egreso;
        tr.cantidad = cantidad;
        tr.estado = TokenRequestStatus::Pendiente;
        tr.motivo_rechazo = String::new();
        let now = Clock::get()?.unix_timestamp;
        tr.created_at = now;
        tr.updated_at = now;
        tr.bump = ctx.bumps.token_request;

        let tr_key = tr.key();
        emit!(TokenRequestedEvent {
            universidad: tr.universidad,
            solicitante: tr.solicitante,
            carrera: tr.carrera.clone(),
            cantidad: tr.cantidad,
            timestamp: now,
        });

        emit!(AuditLogEvent {
            actor: ctx.accounts.solicitante.key(),
            accion: AuditAction::RequestTokens,
            entidad: tr_key,
            motivo: String::new(),
            timestamp: now,
        });

        Ok(())
    }

    pub fn approve_token_request(ctx: Context<ResolveTokenRequest>) -> Result<()> {
        ensure_ministerio(&ctx.accounts.ministerio_person)?;

        let tr = &mut ctx.accounts.token_request;
        require!(tr.estado == TokenRequestStatus::Pendiente, ErrorCode::SolicitudNoPendiente);

        let now = Clock::get()?.unix_timestamp;
        tr.estado = TokenRequestStatus::Aprobada;
        tr.updated_at = now;

        let tr_key_app = tr.key();
        emit!(TokenRequestApprovedEvent {
            universidad: tr.universidad,
            solicitante: tr.solicitante,
            cantidad: tr.cantidad,
            approver: ctx.accounts.ministerio.key(),
            timestamp: now,
        });

        emit!(AuditLogEvent {
            actor: ctx.accounts.ministerio.key(),
            accion: AuditAction::ApproveTokenRequest,
            entidad: tr_key_app,
            motivo: String::new(),
            timestamp: now,
        });

        Ok(())
    }

    pub fn reject_token_request(ctx: Context<ResolveTokenRequest>, motivo: String) -> Result<()> {
        validate_rejection_reason(&motivo)?;

        ensure_ministerio(&ctx.accounts.ministerio_person)?;

        let tr = &mut ctx.accounts.token_request;
        require!(tr.estado == TokenRequestStatus::Pendiente, ErrorCode::SolicitudNoPendiente);

        let now = Clock::get()?.unix_timestamp;
        tr.estado = TokenRequestStatus::Rechazada;
        tr.motivo_rechazo = motivo.clone();
        tr.updated_at = now;

        let tr_key_rej = tr.key();
        let rej_motivo = tr.motivo_rechazo.clone();
        emit!(TokenRequestRejectedEvent {
            universidad: tr.universidad,
            solicitante: tr.solicitante,
            rejector: ctx.accounts.ministerio.key(),
            reason: motivo,
            timestamp: now,
        });

        emit!(AuditLogEvent {
            actor: ctx.accounts.ministerio.key(),
            accion: AuditAction::RejectTokenRequest,
            entidad: tr_key_rej,
            motivo: rej_motivo,
            timestamp: now,
        });

        Ok(())
    }

    pub fn mint_token(ctx: Context<MintToken>, index: u32) -> Result<()> {
        ensure_universidad(&ctx.accounts.universidad_person)?;

        {
            let tr = &ctx.accounts.token_request;
            require!(tr.estado == TokenRequestStatus::Aprobada, ErrorCode::TokenRequestNoAprobada);
            require!(index < tr.cantidad, ErrorCode::TokenIndexInvalido);
            require!(index == tr.minted_count, ErrorCode::TokenIndexInvalido);
        }

        let token_universidad;
        let token_carrera;
        let token_request_key = ctx.accounts.token_request.key();

        {
            let tr = &mut ctx.accounts.token_request;
            token_universidad = tr.universidad;
            token_carrera = tr.carrera.clone();
            tr.minted_count = tr.minted_count.checked_add(1).unwrap();
        }

        let token = &mut ctx.accounts.cert_token;
        token.universidad = token_universidad;
        token.carrera = token_carrera.clone();
        token.estado = TokenStatus::Disponible;
        token.token_request = token_request_key;
        token.index = index;
        token.bump = ctx.bumps.cert_token;

        let ct_key = ctx.accounts.cert_token.key();
        let now_mint = Clock::get()?.unix_timestamp;
        emit!(TokenMintedEvent {
            cert_token: ct_key,
            universidad: token_universidad,
            carrera: token_carrera,
            index,
            timestamp: now_mint,
        });

        emit!(AuditLogEvent {
            actor: ctx.accounts.universidad.key(),
            accion: AuditAction::MintToken,
            entidad: ct_key,
            motivo: String::new(),
            timestamp: now_mint,
        });

        Ok(())
    }

    pub fn assign_token_to_graduate(
        ctx: Context<AssignToken>,
        nombre: String,
        apellido: String,
        dni: String,
        hash_datos: [u8; 32],
    ) -> Result<()> {
        validate_nombre(&nombre)?;
        validate_apellido(&apellido)?;
        validate_dni(&dni)?;

        ensure_universidad(&ctx.accounts.universidad_person)?;

        {
            let token = &ctx.accounts.cert_token;
            require!(token.estado == TokenStatus::Disponible, ErrorCode::TokenNoDisponible);
        }

        let carrera;
        let universidad;
        {
            let token = &ctx.accounts.cert_token;
            carrera = token.carrera.clone();
            universidad = token.universidad;
        }

        {
            let token = &mut ctx.accounts.cert_token;
            token.estado = TokenStatus::Asignado;
        }

        let cert = &mut ctx.accounts.certification;
        cert.cert_token = ctx.accounts.cert_token.key();
        cert.nombre = nombre;
        cert.apellido = apellido;
        cert.dni = dni;
        cert.carrera = carrera.clone();
        cert.universidad = universidad;
        cert.estado = CertificationStatus::Activa;
        cert.hash_datos = hash_datos;
        cert.motivo_revocacion = String::new();
        cert.bump = ctx.bumps.certification;

        let certification_key = ctx.accounts.certification.key();
        let cert_token_key = ctx.accounts.cert_token.key();

        let now_assign = Clock::get()?.unix_timestamp;
        emit!(TokenAssignedEvent {
            certification: certification_key,
            cert_token: cert_token_key,
            universidad,
            carrera,
            timestamp: now_assign,
        });

        emit!(AuditLogEvent {
            actor: ctx.accounts.universidad.key(),
            accion: AuditAction::AssignToken,
            entidad: certification_key,
            motivo: String::new(),
            timestamp: now_assign,
        });

        Ok(())
    }

    pub fn request_certification(
        ctx: Context<RequestCertification>,
        tipo: GraduateType,
        pdf_hash: [u8; 32],
        pais: Option<String>,
    ) -> Result<()> {
        ensure_active(&ctx.accounts.egresado_person)?;

        if tipo == GraduateType::Extranjero {
            require!(pais.is_some(), ErrorCode::PaisRequerido);
            let p = pais.as_ref().unwrap();
            require!(!p.trim().is_empty() && p.len() <= 80, ErrorCode::PaisInvalido);
        }

        let gr = &mut ctx.accounts.graduate_request;
        gr.wallet = ctx.accounts.egresado.key();
        gr.tipo = tipo;
        gr.pdf_hash = pdf_hash;
        gr.estado = GraduateRequestStatus::Pendiente;
        gr.motivo = String::new();
        gr.pais = pais.unwrap_or_default();
        gr.bump = ctx.bumps.graduate_request;

        let graduate_request_key = ctx.accounts.graduate_request.key();
        let gr_wallet = ctx.accounts.egresado.key();

        let now_cert = Clock::get()?.unix_timestamp;
        emit!(CertificationRequestedEvent {
            graduate_request: graduate_request_key,
            wallet: gr_wallet,
            tipo,
            timestamp: now_cert,
        });

        emit!(AuditLogEvent {
            actor: gr_wallet,
            accion: AuditAction::RequestCertification,
            entidad: graduate_request_key,
            motivo: String::new(),
            timestamp: now_cert,
        });

        Ok(())
    }

    // ── FASE 6: Ministerio ───────────────────────────────────────────────────

    pub fn approve_local_request(ctx: Context<ResolveGraduateRequest>) -> Result<()> {
        ensure_ministerio(&ctx.accounts.ministerio_person)?;

        let gr = &mut ctx.accounts.graduate_request;
        require!(gr.estado == GraduateRequestStatus::Pendiente, ErrorCode::SolicitudNoPendiente);
        require!(gr.tipo == GraduateType::Local, ErrorCode::TipoEgresoIncompatible);

        gr.estado = GraduateRequestStatus::AprobadoLocal;

        let gr_key_local = ctx.accounts.graduate_request.key();
        let now_local = Clock::get()?.unix_timestamp;
        emit!(GraduateRequestResolvedEvent {
            graduate_request: gr_key_local,
            resolver: ctx.accounts.ministerio.key(),
            nuevo_estado: GraduateRequestStatus::AprobadoLocal,
            motivo: String::new(),
            timestamp: now_local,
        });

        emit!(AuditLogEvent {
            actor: ctx.accounts.ministerio.key(),
            accion: AuditAction::ApproveLocal,
            entidad: gr_key_local,
            motivo: String::new(),
            timestamp: now_local,
        });

        Ok(())
    }

    pub fn reject_request(ctx: Context<ResolveGraduateRequest>, motivo: String) -> Result<()> {
        validate_rejection_reason(&motivo)?;
        ensure_ministerio(&ctx.accounts.ministerio_person)?;

        let gr = &mut ctx.accounts.graduate_request;
        require!(gr.estado == GraduateRequestStatus::Pendiente, ErrorCode::SolicitudNoPendiente);

        gr.estado = GraduateRequestStatus::Rechazado;
        gr.motivo = motivo.clone();

        let gr_key_rej_min = gr.key();
        let rej_min_motivo = gr.motivo.clone();
        let now_rej_min = Clock::get()?.unix_timestamp;
        emit!(GraduateRequestResolvedEvent {
            graduate_request: gr_key_rej_min,
            resolver: ctx.accounts.ministerio.key(),
            nuevo_estado: GraduateRequestStatus::Rechazado,
            motivo,
            timestamp: now_rej_min,
        });

        emit!(AuditLogEvent {
            actor: ctx.accounts.ministerio.key(),
            accion: AuditAction::RejectRequest,
            entidad: gr_key_rej_min,
            motivo: rej_min_motivo,
            timestamp: now_rej_min,
        });

        Ok(())
    }

    pub fn derive_to_cancilleria(ctx: Context<ResolveGraduateRequest>) -> Result<()> {
        ensure_ministerio(&ctx.accounts.ministerio_person)?;

        let gr = &mut ctx.accounts.graduate_request;
        require!(gr.estado == GraduateRequestStatus::Pendiente, ErrorCode::SolicitudNoPendiente);
        require!(gr.tipo == GraduateType::Extranjero, ErrorCode::TipoEgresoIncompatible);

        gr.estado = GraduateRequestStatus::DerivadoCancilleria;

        let gr_key_deriv = ctx.accounts.graduate_request.key();
        let now_deriv = Clock::get()?.unix_timestamp;
        emit!(GraduateRequestResolvedEvent {
            graduate_request: gr_key_deriv,
            resolver: ctx.accounts.ministerio.key(),
            nuevo_estado: GraduateRequestStatus::DerivadoCancilleria,
            motivo: String::new(),
            timestamp: now_deriv,
        });

        emit!(AuditLogEvent {
            actor: ctx.accounts.ministerio.key(),
            accion: AuditAction::DeriveCancilleria,
            entidad: gr_key_deriv,
            motivo: String::new(),
            timestamp: now_deriv,
        });

        Ok(())
    }

    // ── FASE 7: Cancillería ───────────────────────────────────────────────────

    pub fn approve_foreign(ctx: Context<ResolveForeignRequest>) -> Result<()> {
        ensure_cancilleria(&ctx.accounts.cancilleria_person)?;

        let gr = &mut ctx.accounts.graduate_request;
        require!(
            gr.estado == GraduateRequestStatus::DerivadoCancilleria,
            ErrorCode::SolicitudNoDerivada
        );

        gr.estado = GraduateRequestStatus::AprobadoExtranjero;

        let gr_key_afb = ctx.accounts.graduate_request.key();
        let now_afb = Clock::get()?.unix_timestamp;
        emit!(GraduateRequestResolvedEvent {
            graduate_request: gr_key_afb,
            resolver: ctx.accounts.cancilleria.key(),
            nuevo_estado: GraduateRequestStatus::AprobadoExtranjero,
            motivo: String::new(),
            timestamp: now_afb,
        });

        emit!(AuditLogEvent {
            actor: ctx.accounts.cancilleria.key(),
            accion: AuditAction::ApproveForeign,
            entidad: gr_key_afb,
            motivo: String::new(),
            timestamp: now_afb,
        });

        Ok(())
    }

    pub fn reject_foreign(ctx: Context<ResolveForeignRequest>, motivo: String) -> Result<()> {
        validate_rejection_reason(&motivo)?;
        ensure_cancilleria(&ctx.accounts.cancilleria_person)?;

        let gr = &mut ctx.accounts.graduate_request;
        require!(
            gr.estado == GraduateRequestStatus::DerivadoCancilleria,
            ErrorCode::SolicitudNoDerivada
        );

        gr.estado = GraduateRequestStatus::Rechazado;
        gr.motivo = motivo.clone();

        let gr_key_rfb = gr.key();
        let rf_motivo = gr.motivo.clone();
        let now_rfb = Clock::get()?.unix_timestamp;
        emit!(GraduateRequestResolvedEvent {
            graduate_request: gr_key_rfb,
            resolver: ctx.accounts.cancilleria.key(),
            nuevo_estado: GraduateRequestStatus::Rechazado,
            motivo,
            timestamp: now_rfb,
        });

        emit!(AuditLogEvent {
            actor: ctx.accounts.cancilleria.key(),
            accion: AuditAction::RejectForeign,
            entidad: gr_key_rfb,
            motivo: rf_motivo,
            timestamp: now_rfb,
        });

        Ok(())
    }

    // ── FASE 8: Revocación ───────────────────────────────────────────────────

    pub fn revoke_certification(ctx: Context<RevokeCertification>, motivo: String) -> Result<()> {
        validate_change_reason(&motivo)?;

        ensure_admin(&ctx.accounts.config, &ctx.accounts.admin, &ctx.accounts.admin_person)?;

        let cert = &mut ctx.accounts.certification;
        require!(cert.estado == CertificationStatus::Activa, ErrorCode::CertificacionYaRevocada);

        cert.estado = CertificationStatus::Revocada;
        cert.motivo_revocacion = motivo.clone();

        let rev_motivo = cert.motivo_revocacion.clone();
        let cert_key = ctx.accounts.certification.key();

        let now_rev = Clock::get()?.unix_timestamp;
        emit!(CertificationRevokedEvent {
            certification: cert_key,
            revoked_by: ctx.accounts.admin.key(),
            motivo,
            timestamp: now_rev,
        });

        emit!(AuditLogEvent {
            actor: ctx.accounts.admin.key(),
            accion: AuditAction::RevokeCertification,
            entidad: cert_key,
            motivo: rev_motivo,
            timestamp: now_rev,
        });

        Ok(())
    }

    // ── FASE 9: Auditória ───────────────────────────────────────────────────

    pub fn create_audit_log(
        ctx: Context<CreateAuditLog>,
        audit_seq: u64,
        accion: AuditAction,
        entidad: Pubkey,
        motivo: String,
    ) -> Result<()> {
        require!(motivo.len() <= AuditLog::MAX_MOTIVO, ErrorCode::MotivoMuyLargo);
        require!(audit_seq == ctx.accounts.config.audit_count, ErrorCode::AuditSeqInvalido);
        ensure_active(&ctx.accounts.actor_person)?;

        let now = Clock::get()?.unix_timestamp;

        let log = &mut ctx.accounts.audit_log;
        log.actor = ctx.accounts.actor.key();
        log.accion = accion;
        log.entidad = entidad;
        log.motivo = motivo.clone();
        log.timestamp = now;
        log.bump = ctx.bumps.audit_log;

        ctx.accounts.config.audit_count = ctx.accounts
            .config
            .audit_count
            .checked_add(1)
            .unwrap();

        emit!(AuditLogEvent {
            actor: ctx.accounts.actor.key(),
            accion,
            entidad,
            motivo,
            timestamp: now,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        space = ProgramConfig::LEN,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, ProgramConfig>,

    #[account(
        init,
        payer = admin,
        space = PersonAccount::LEN,
        seeds = [PERSON_SEED, admin.key().as_ref()],
        bump
    )]
    pub admin_person: Account<'info, PersonAccount>,

    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterPerson<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, ProgramConfig>,

    #[account(
        seeds = [PERSON_SEED, authority.key().as_ref()],
        bump = authority_person.bump
    )]
    pub authority_person: Account<'info, PersonAccount>,

    #[account(
        init,
        payer = authority,
        space = PersonAccount::LEN,
        seeds = [PERSON_SEED, wallet.key().as_ref()],
        bump
    )]
    pub person: Account<'info, PersonAccount>,

    /// CHECK: solo se usa como semilla PDA y para guardar la wallet en PersonAccount.
    pub wallet: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(requested_role: Role, nombre: String, apellido: String, dni: String, role_data: String)]
pub struct RequestRole<'info> {
    #[account(
        init_if_needed,
        payer = requester,
        space = PersonAccount::LEN,
        seeds = [PERSON_SEED, requester.key().as_ref()],
        bump
    )]
    pub requester_person: Account<'info, PersonAccount>,

    #[account(
        init_if_needed,
        payer = requester,
        space = RoleRequest::LEN,
        seeds = [ROLE_REQUEST_SEED, requester.key().as_ref(), &[requested_role as u8]],
        bump
    )]
    pub role_request: Account<'info, RoleRequest>,

    #[account(mut)]
    pub requester: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResolveRoleRequest<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, ProgramConfig>,

    #[account(
        seeds = [PERSON_SEED, admin.key().as_ref()],
        bump = admin_person.bump
    )]
    pub admin_person: Account<'info, PersonAccount>,

    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(mut)]
    pub role_request: Account<'info, RoleRequest>,

    #[account(
        mut,
        seeds = [PERSON_SEED, target_person.wallet.as_ref()],
        bump = target_person.bump
    )]
    pub target_person: Account<'info, PersonAccount>,
}

#[derive(Accounts)]
pub struct SetStatus<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, ProgramConfig>,

    #[account(
        seeds = [PERSON_SEED, admin.key().as_ref()],
        bump = admin_person.bump
    )]
    pub admin_person: Account<'info, PersonAccount>,

    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [PERSON_SEED, target_person.wallet.as_ref()],
        bump = target_person.bump
    )]
    pub target_person: Account<'info, PersonAccount>,
}

#[derive(Accounts)]
pub struct UpdatePersonAdmin<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, ProgramConfig>,

    #[account(
        seeds = [PERSON_SEED, admin.key().as_ref()],
        bump = admin_person.bump
    )]
    pub admin_person: Account<'info, PersonAccount>,

    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [PERSON_SEED, target_person.wallet.as_ref()],
        bump = target_person.bump
    )]
    pub target_person: Account<'info, PersonAccount>,
}

#[derive(Accounts)]
#[instruction(_id: u64)]
pub struct RequestTokens<'info> {
    #[account(
        seeds = [PERSON_SEED, solicitante.key().as_ref()],
        bump = solicitante_person.bump
    )]
    pub solicitante_person: Account<'info, PersonAccount>,

    #[account(
        init,
        payer = solicitante,
        space = TokenRequest::LEN,
        seeds = [TOKEN_REQUEST_SEED, solicitante.key().as_ref(), &_id.to_le_bytes()],
        bump
    )]
    pub token_request: Account<'info, TokenRequest>,

    #[account(mut)]
    pub solicitante: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResolveTokenRequest<'info> {
    #[account(
        seeds = [PERSON_SEED, ministerio.key().as_ref()],
        bump = ministerio_person.bump
    )]
    pub ministerio_person: Account<'info, PersonAccount>,

    #[account(mut)]
    pub ministerio: Signer<'info>,

    #[account(mut)]
    pub token_request: Account<'info, TokenRequest>,
}

#[derive(Accounts)]
pub struct RequestCertification<'info> {
    #[account(
        seeds = [PERSON_SEED, egresado.key().as_ref()],
        bump = egresado_person.bump
    )]
    pub egresado_person: Account<'info, PersonAccount>,

    #[account(
        init,
        payer = egresado,
        space = GraduateRequest::LEN,
        seeds = [GRADUATE_REQUEST_SEED, egresado.key().as_ref()],
        bump
    )]
    pub graduate_request: Account<'info, GraduateRequest>,

    #[account(mut)]
    pub egresado: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResolveGraduateRequest<'info> {
    #[account(
        seeds = [PERSON_SEED, ministerio.key().as_ref()],
        bump = ministerio_person.bump
    )]
    pub ministerio_person: Account<'info, PersonAccount>,

    #[account(mut)]
    pub ministerio: Signer<'info>,

    #[account(
        mut,
        seeds = [GRADUATE_REQUEST_SEED, graduate_request.wallet.as_ref()],
        bump = graduate_request.bump
    )]
    pub graduate_request: Account<'info, GraduateRequest>,
}

#[derive(Accounts)]
pub struct ResolveForeignRequest<'info> {
    #[account(
        seeds = [PERSON_SEED, cancilleria.key().as_ref()],
        bump = cancilleria_person.bump
    )]
    pub cancilleria_person: Account<'info, PersonAccount>,

    #[account(mut)]
    pub cancilleria: Signer<'info>,

    #[account(
        mut,
        seeds = [GRADUATE_REQUEST_SEED, graduate_request.wallet.as_ref()],
        bump = graduate_request.bump
    )]
    pub graduate_request: Account<'info, GraduateRequest>,
}

#[derive(Accounts)]
pub struct RevokeCertification<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, ProgramConfig>,

    #[account(
        seeds = [PERSON_SEED, admin.key().as_ref()],
        bump = admin_person.bump
    )]
    pub admin_person: Account<'info, PersonAccount>,

    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [CERTIFICATION_SEED, certification.cert_token.as_ref()],
        bump = certification.bump
    )]
    pub certification: Account<'info, Certification>,
}

// ─── FASE 9: CreateAuditLog context ─────────────────────────────────────────

#[derive(Accounts)]
#[instruction(audit_seq: u64)]
pub struct CreateAuditLog<'info> {
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, ProgramConfig>,

    #[account(
        seeds = [PERSON_SEED, actor.key().as_ref()],
        bump = actor_person.bump
    )]
    pub actor_person: Account<'info, PersonAccount>,

    #[account(
        init,
        payer = actor,
        space = AuditLog::LEN,
        seeds = [AUDIT_LOG_SEED, actor.key().as_ref(), &audit_seq.to_le_bytes()],
        bump
    )]
    pub audit_log: Account<'info, AuditLog>,

    #[account(mut)]
    pub actor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AssignToken<'info> {
    #[account(
        seeds = [PERSON_SEED, universidad.key().as_ref()],
        bump = universidad_person.bump
    )]
    pub universidad_person: Account<'info, PersonAccount>,

    #[account(
        mut,
        seeds = [CERT_TOKEN_SEED, cert_token.token_request.as_ref(), &cert_token.index.to_le_bytes()],
        bump = cert_token.bump
    )]
    pub cert_token: Account<'info, CertificationToken>,

    #[account(
        init,
        payer = universidad,
        space = Certification::LEN,
        seeds = [CERTIFICATION_SEED, cert_token.key().as_ref()],
        bump
    )]
    pub certification: Account<'info, Certification>,

    #[account(mut)]
    pub universidad: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(index: u32)]
pub struct MintToken<'info> {
    #[account(
        seeds = [PERSON_SEED, universidad.key().as_ref()],
        bump = universidad_person.bump
    )]
    pub universidad_person: Account<'info, PersonAccount>,

    #[account(mut)]
    pub token_request: Account<'info, TokenRequest>,

    #[account(
        init,
        payer = universidad,
        space = CertificationToken::LEN,
        seeds = [CERT_TOKEN_SEED, token_request.key().as_ref(), &index.to_le_bytes()],
        bump
    )]
    pub cert_token: Account<'info, CertificationToken>,

    #[account(mut)]
    pub universidad: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct ProgramConfig {
    pub admin: Pubkey,
    pub audit_count: u64,
    pub bump: u8,
}

impl ProgramConfig {
    pub const LEN: usize = 8 + 32 + 8 + 1;
}

#[account]
pub struct PersonAccount {
    pub wallet: Pubkey,
    pub nombre: String,
    pub apellido: String,
    pub dni: String,
    pub status: PersonStatus,
    pub roles: Vec<Role>,
    pub role_data: String,
    pub bump: u8,
}

impl PersonAccount {
    pub const MAX_NOMBRE: usize = 80;
    pub const MAX_APELLIDO: usize = 80;
    pub const MAX_DNI: usize = 20;
    pub const MAX_ROLE_DATA: usize = 256;
    pub const MAX_ROLES: usize = 5;

    pub const LEN: usize = 8
        + 32
        + (4 + Self::MAX_NOMBRE)
        + (4 + Self::MAX_APELLIDO)
        + (4 + Self::MAX_DNI)
        + 1
        + (4 + Self::MAX_ROLES)
        + (4 + Self::MAX_ROLE_DATA)
        + 1;

    pub fn has_role(&self, role: Role) -> bool {
        self.roles.iter().any(|r| *r == role)
    }
}

#[account]
pub struct RoleRequest {
    pub requester: Pubkey,
    pub requested_role: Role,
    pub status: RoleRequestStatus,
    pub rejection_reason: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
}

impl RoleRequest {
    pub const MAX_REASON: usize = 240;

    pub const LEN: usize = 8 + 32 + 1 + 1 + (4 + Self::MAX_REASON) + 8 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    Admin,
    Universidad,
    Ministerio,
    Cancilleria,
    Egresado,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum PersonStatus {
    Activo,
    Inactivo,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum RoleRequestStatus {
    Pendiente,
    Aprobada,
    Rechazada,
}

#[event]
pub struct RoleRequestedEvent {
    pub requester: Pubkey,
    pub requested_role: Role,
    pub timestamp: i64,
}

#[event]
pub struct RoleApprovedEvent {
    pub requester: Pubkey,
    pub approved_role: Role,
    pub approver: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct RoleRejectedEvent {
    pub requester: Pubkey,
    pub rejected_role: Role,
    pub approver: Pubkey,
    pub reason: String,
    pub timestamp: i64,
}

#[event]
pub struct StatusChangedEvent {
    pub person: Pubkey,
    pub changed_by: Pubkey,
    pub status: PersonStatus,
    pub reason: String,
    pub timestamp: i64,
}

#[event]
pub struct PersonUpdatedEvent {
    pub wallet: Pubkey,
    pub nombre: String,
    pub apellido: String,
    pub dni: String,
    pub status: PersonStatus,
    pub roles: Vec<Role>,
    pub role_data: String,
    pub updated_by: Pubkey,
    pub timestamp: i64,
}

fn ensure_active(person: &PersonAccount) -> Result<()> {
    require!(person.status == PersonStatus::Activo, ErrorCode::PersonaInactiva);
    Ok(())
}

fn ensure_admin(config: &ProgramConfig, signer: &Signer, person: &PersonAccount) -> Result<()> {
    require!(signer.key() == config.admin, ErrorCode::NoEsAdmin);
    ensure_active(person)?;
    require!(person.has_role(Role::Admin), ErrorCode::NoEsAdmin);
    Ok(())
}

fn validate_nombre(nombre: &str) -> Result<()> {
    require!(!nombre.trim().is_empty(), ErrorCode::NombreInvalido);
    require!(
        nombre.len() <= PersonAccount::MAX_NOMBRE,
        ErrorCode::NombreInvalido
    );
    Ok(())
}

fn validate_apellido(apellido: &str) -> Result<()> {
    require!(!apellido.trim().is_empty(), ErrorCode::ApellidoInvalido);
    require!(
        apellido.len() <= PersonAccount::MAX_APELLIDO,
        ErrorCode::ApellidoInvalido
    );
    Ok(())
}

fn validate_dni(dni: &str) -> Result<()> {
    require!(!dni.trim().is_empty(), ErrorCode::DniInvalido);
    require!(dni.len() <= PersonAccount::MAX_DNI, ErrorCode::DniInvalido);
    Ok(())
}

fn validate_role_data(role_data: &str) -> Result<()> {
    require!(
        role_data.len() <= PersonAccount::MAX_ROLE_DATA,
        ErrorCode::RoleDataInvalida
    );
    Ok(())
}

fn validate_roles_for_person_update(roles: &[Role], role_data: &str) -> Result<()> {
    require!(roles.len() <= PersonAccount::MAX_ROLES, ErrorCode::RolesInvalidos);

    let mut has_universidad = false;
    let mut has_cancilleria = false;

    for (i, role) in roles.iter().enumerate() {
        require!(*role != Role::Admin, ErrorCode::RolesInvalidos);
        if *role == Role::Universidad {
            has_universidad = true;
        }
        if *role == Role::Cancilleria {
            has_cancilleria = true;
        }
        for other in roles.iter().skip(i + 1) {
            require!(*other != *role, ErrorCode::RolesInvalidos);
        }
    }

    if has_universidad || has_cancilleria {
        require!(!role_data.trim().is_empty(), ErrorCode::RoleDataInvalida);
    }

    Ok(())
}

fn validate_rejection_reason(reason: &str) -> Result<()> {
    require!(!reason.trim().is_empty(), ErrorCode::MotivoRequerido);
    require!(reason.len() <= RoleRequest::MAX_REASON, ErrorCode::MotivoMuyLargo);
    Ok(())
}

fn validate_change_reason(reason: &str) -> Result<()> {
    require!(!reason.trim().is_empty(), ErrorCode::MotivoRequerido);
    require!(reason.len() <= RoleRequest::MAX_REASON, ErrorCode::MotivoMuyLargo);
    Ok(())
}

#[error_code]
pub enum ErrorCode {
    #[msg("La persona se encuentra inactiva")]
    PersonaInactiva,
    #[msg("La cuenta no tiene permisos de administrador")]
    NoEsAdmin,
    #[msg("El rol solicitado no se puede solicitar")]
    RoleNoSolicitable,
    #[msg("La persona ya tiene ese rol")]
    RolYaAsignado,
    #[msg("La solicitud no esta en estado pendiente")]
    SolicitudNoPendiente,
    #[msg("Ya existe una solicitud pendiente para ese rol")]
    SolicitudYaPendiente,
    #[msg("El solicitante no coincide con la solicitud")]
    SolicitanteInvalido,
    #[msg("Nombre invalido")]
    NombreInvalido,
    #[msg("Apellido invalido")]
    ApellidoInvalido,
    #[msg("DNI invalido")]
    DniInvalido,
    #[msg("Role data invalida")]
    RoleDataInvalida,
    #[msg("Roles invalidos")]
    RolesInvalidos,
    #[msg("El motivo es obligatorio")]
    MotivoRequerido,
    #[msg("El motivo excede la longitud maxima")]
    MotivoMuyLargo,
    #[msg("No se puede modificar el estado de la cuenta admin")]
    AdminNoModificable,
    #[msg("No tiene rol Universidad")]
    NoEsUniversidad,
    #[msg("No tiene rol Ministerio")]
    NoEsMinisterio,
    #[msg("Carrera invalida")]
    CarreraInvalida,
    #[msg("Plan de estudios invalido")]
    PlanInvalido,
    #[msg("Resolucion invalida")]
    ResolucionInvalida,
    #[msg("Anio de egreso invalido, debe estar entre 1950 y 2100")]
    AnioEgresoInvalido,
    #[msg("La cantidad debe ser mayor a cero")]
    CantidadInvalida,
    #[msg("La solicitud de tokens no esta aprobada")]
    TokenRequestNoAprobada,
    #[msg("Indice de token invalido o fuera de rango")]
    TokenIndexInvalido,
    #[msg("El token no esta disponible para asignar")]
    TokenNoDisponible,
    #[msg("El pais es requerido para egresados extranjeros")]
    PaisRequerido,
    #[msg("El pais indicado es invalido")]
    PaisInvalido,
    #[msg("La operacion es incompatible con el tipo de egreso")]
    TipoEgresoIncompatible,
    #[msg("La solicitud no esta derivada a Cancilleria")]
    SolicitudNoDerivada,
    #[msg("No tiene rol Cancilleria")]
    NoEsCancilleria,
    #[msg("La certificacion ya se encuentra revocada")]
    CertificacionYaRevocada,
    #[msg("El numero de secuencia de auditoria es invalido")]
    AuditSeqInvalido,
}

// ─── FASE 8: RevokeCertification context ───────────────────────────────────

#[event]
pub struct CertificationRevokedEvent {
    pub certification: Pubkey,
    pub revoked_by: Pubkey,
    pub motivo: String,
    pub timestamp: i64,
}

// ─── FASE 4: Certification ───────────────────────────────────────────────────

#[account]
pub struct Certification {
    pub cert_token: Pubkey,
    pub nombre: String,
    pub apellido: String,
    pub dni: String,
    pub carrera: String,
    pub universidad: Pubkey,
    pub estado: CertificationStatus,
    pub hash_datos: [u8; 32],
    pub motivo_revocacion: String,
    pub bump: u8,
}

impl Certification {
    pub const MAX_NOMBRE: usize = 80;
    pub const MAX_APELLIDO: usize = 80;
    pub const MAX_DNI: usize = 20;
    pub const MAX_CARRERA: usize = 120;
    pub const MAX_MOTIVO: usize = 240;

    pub const LEN: usize = 8
        + 32                          // cert_token
        + (4 + Self::MAX_NOMBRE)
        + (4 + Self::MAX_APELLIDO)
        + (4 + Self::MAX_DNI)
        + (4 + Self::MAX_CARRERA)
        + 32                          // universidad
        + 1                           // estado
        + 32                          // hash_datos
        + (4 + Self::MAX_MOTIVO)
        + 1;                          // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum CertificationStatus {
    Activa,
    Revocada,
}

#[event]
pub struct TokenAssignedEvent {
    pub certification: Pubkey,
    pub cert_token: Pubkey,
    pub universidad: Pubkey,
    pub carrera: String,
    pub timestamp: i64,
}

// ─── FASE 5: GraduateRequest ─────────────────────────────────────────────────

#[account]
pub struct GraduateRequest {
    pub wallet: Pubkey,
    pub tipo: GraduateType,
    pub pdf_hash: [u8; 32],
    pub estado: GraduateRequestStatus,
    pub motivo: String,
    pub pais: String,
    pub bump: u8,
}

impl GraduateRequest {
    pub const MAX_MOTIVO: usize = 240;
    pub const MAX_PAIS: usize = 80;

    pub const LEN: usize = 8
        + 32          // wallet
        + 1           // tipo
        + 32          // pdf_hash
        + 1           // estado
        + (4 + Self::MAX_MOTIVO)
        + (4 + Self::MAX_PAIS)
        + 1;          // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum GraduateType {
    Local,
    Extranjero,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum GraduateRequestStatus {
    Pendiente,
    AprobadoLocal,
    AprobadoExtranjero,
    Rechazado,
    DerivadoCancilleria,
}

#[event]
pub struct CertificationRequestedEvent {
    pub graduate_request: Pubkey,
    pub wallet: Pubkey,
    pub tipo: GraduateType,
    pub timestamp: i64,
}

#[event]
pub struct GraduateRequestResolvedEvent {
    pub graduate_request: Pubkey,
    pub resolver: Pubkey,
    pub nuevo_estado: GraduateRequestStatus,
    pub motivo: String,
    pub timestamp: i64,
}

#[account]
pub struct CertificationToken {
    pub universidad: Pubkey,
    pub carrera: String,
    pub estado: TokenStatus,
    pub token_request: Pubkey,
    pub index: u32,
    pub bump: u8,
}

impl CertificationToken {
    pub const MAX_CARRERA: usize = 120;

    pub const LEN: usize = 8
        + 32
        + (4 + Self::MAX_CARRERA)
        + 1
        + 32
        + 4
        + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum TokenStatus {
    Disponible,
    Asignado,
}

#[event]
pub struct TokenMintedEvent {
    pub cert_token: Pubkey,
    pub universidad: Pubkey,
    pub carrera: String,
    pub index: u32,
    pub timestamp: i64,
}

// ─── FASE 2: TokenRequest ────────────────────────────────────────────────────

#[account]
pub struct TokenRequest {
    pub universidad: Pubkey,
    pub solicitante: Pubkey,
    pub carrera: String,
    pub plan: String,
    pub resolucion: String,
    pub anio_egreso: u16,
    pub cantidad: u32,
    pub estado: TokenRequestStatus,
    pub motivo_rechazo: String,
    pub minted_count: u32,
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
}

impl TokenRequest {
    pub const MAX_CARRERA: usize = 120;
    pub const MAX_PLAN: usize = 80;
    pub const MAX_RESOLUCION: usize = 80;
    pub const MAX_MOTIVO: usize = 240;

    pub const LEN: usize = 8
        + 32
        + 32
        + (4 + Self::MAX_CARRERA)
        + (4 + Self::MAX_PLAN)
        + (4 + Self::MAX_RESOLUCION)
        + 2
        + 4
        + 1
        + (4 + Self::MAX_MOTIVO)
        + 4   // minted_count
        + 8
        + 8
        + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum TokenRequestStatus {
    Pendiente,
    Aprobada,
    Rechazada,
}

#[event]
pub struct TokenRequestedEvent {
    pub universidad: Pubkey,
    pub solicitante: Pubkey,
    pub carrera: String,
    pub cantidad: u32,
    pub timestamp: i64,
}

#[event]
pub struct TokenRequestApprovedEvent {
    pub universidad: Pubkey,
    pub solicitante: Pubkey,
    pub cantidad: u32,
    pub approver: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct TokenRequestRejectedEvent {
    pub universidad: Pubkey,
    pub solicitante: Pubkey,
    pub rejector: Pubkey,
    pub reason: String,
    pub timestamp: i64,
}

fn ensure_universidad(person: &PersonAccount) -> Result<()> {
    require!(person.status == PersonStatus::Activo, ErrorCode::PersonaInactiva);
    require!(person.has_role(Role::Universidad), ErrorCode::NoEsUniversidad);
    Ok(())
}

fn ensure_ministerio(person: &PersonAccount) -> Result<()> {
    require!(person.status == PersonStatus::Activo, ErrorCode::PersonaInactiva);
    require!(person.has_role(Role::Ministerio), ErrorCode::NoEsMinisterio);
    Ok(())
}

fn ensure_cancilleria(person: &PersonAccount) -> Result<()> {
    require!(person.status == PersonStatus::Activo, ErrorCode::PersonaInactiva);
    require!(person.has_role(Role::Cancilleria), ErrorCode::NoEsCancilleria);
    Ok(())
}

fn validate_carrera(carrera: &str) -> Result<()> {
    require!(!carrera.trim().is_empty(), ErrorCode::CarreraInvalida);
    require!(carrera.len() <= TokenRequest::MAX_CARRERA, ErrorCode::CarreraInvalida);
    Ok(())
}

fn validate_plan(plan: &str) -> Result<()> {
    require!(!plan.trim().is_empty(), ErrorCode::PlanInvalido);
    require!(plan.len() <= TokenRequest::MAX_PLAN, ErrorCode::PlanInvalido);
    Ok(())
}

fn validate_resolucion(resolucion: &str) -> Result<()> {
    require!(!resolucion.trim().is_empty(), ErrorCode::ResolucionInvalida);
    require!(resolucion.len() <= TokenRequest::MAX_RESOLUCION, ErrorCode::ResolucionInvalida);
    Ok(())
}

fn validate_anio_egreso(anio: u16) -> Result<()> {
    require!(anio >= 1950 && anio <= 2100, ErrorCode::AnioEgresoInvalido);
    Ok(())
}

fn validate_cantidad(cantidad: u32) -> Result<()> {
    require!(cantidad > 0, ErrorCode::CantidadInvalida);
    Ok(())
}

// ─── FASE 9: AuditLog ───────────────────────────────────────────────────

#[account]
pub struct AuditLog {
    pub actor: Pubkey,
    pub accion: AuditAction,
    pub entidad: Pubkey,
    pub motivo: String,
    pub timestamp: i64,
    pub bump: u8,
}

impl AuditLog {
    pub const MAX_MOTIVO: usize = 240;

    pub const LEN: usize = 8
        + 32          // actor
        + 1           // accion
        + 32          // entidad
        + (4 + Self::MAX_MOTIVO)
        + 8           // timestamp
        + 1;          // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum AuditAction {
    Initialize,
    RegisterPerson,
    RequestRole,
    ApproveRole,
    RejectRole,
    SetStatus,
    RequestTokens,
    ApproveTokenRequest,
    RejectTokenRequest,
    MintToken,
    AssignToken,
    RequestCertification,
    ApproveLocal,
    RejectRequest,
    DeriveCancilleria,
    ApproveForeign,
    RejectForeign,
    RevokeCertification,
    UpdatePerson,
    CreateAuditLog,
}

#[event]
pub struct AuditLogEvent {
    pub actor: Pubkey,
    pub accion: AuditAction,
    pub entidad: Pubkey,
    pub motivo: String,
    pub timestamp: i64,
}

#[event]
pub struct PersonRegisteredEvent {
    pub wallet: Pubkey,
    pub nombre: String,
    pub apellido: String,
    pub registered_by: Pubkey,
    pub timestamp: i64,
}
