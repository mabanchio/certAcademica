import { Connection, PublicKey, Logs } from "@solana/web3.js";
import { EventParser, BorshCoder } from "@coral-xyz/anchor";
import { IDL } from "./idl";
import { config } from "./config";
import { getDb } from "./db";
import { handleEvent } from "./handlers";

const PROGRAM_ID = new PublicKey(config.programId);
type ProgramAccounts = Awaited<ReturnType<Connection["getProgramAccounts"]>>;

// Intenta cargar el IDL compilado por `anchor build`; si no existe usa el
// IDL interno. Esto garantiza que el indexador funcione en cualquier etapa.
function loadCoder(): BorshCoder {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const builtIdl = require("../../target/idl/academic_certification.json");
    return new BorshCoder(builtIdl);
  } catch {
    return new BorshCoder(IDL as never);
  }
}

export class Listener {
  private connection: Connection;
  private parser: EventParser;
  private coder: BorshCoder;
  private wsSubId: number | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastProcessedSlot = config.startSlot;

  constructor() {
    this.connection = new Connection(config.rpcUrl, {
      wsEndpoint: config.wsUrl,
      commitment: "confirmed",
    });
    this.coder = loadCoder();
    this.parser = new EventParser(PROGRAM_ID, this.coder);
  }

  // ── Inicio ───────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    console.log(`[Listener] Conectando a ${config.rpcUrl} | programa ${config.programId}`);
    await this.bootstrapAdminFromConfig();
    const programAccounts = await this.connection.getProgramAccounts(PROGRAM_ID, {
      commitment: "confirmed",
    });
    console.log(`[Listener] Cuentas del programa detectadas: ${programAccounts.length}`);
    await this.bootstrapPersonsFromChain(programAccounts);
    await this.bootstrapCertificationsFromChain(programAccounts);
    await this.syncHistorical();
    this.subscribeWs();
    this.startPollFallback();
  }

  stop(): void {
    if (this.wsSubId !== null) {
      this.connection.removeOnLogsListener(this.wsSubId);
      this.wsSubId = null;
    }
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  // ── Sincronización histórica al arrancar ─────────────────────────────────

  private async bootstrapAdminFromConfig(): Promise<void> {
    try {
      const db = getDb();
      const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
      const accountInfo = await this.connection.getAccountInfo(configPda, "confirmed");
      if (!accountInfo?.data) {
        console.log("[Listener] ProgramConfig no encontrado aún; admin no bootstrapeado.");
        return;
      }

      const decoded = this.coder.accounts.decode("ProgramConfig", accountInfo.data) as
        | { admin?: { toBase58?: () => string } | string }
        | undefined;
      const adminValue = decoded?.admin;
      const adminWallet =
        typeof adminValue === "string"
          ? adminValue
          : adminValue?.toBase58?.();

      if (!adminWallet) return;

      db.prepare(`
        INSERT INTO persons (wallet, status, roles, updated_at)
        VALUES (?, 'Activo', ?, ?)
        ON CONFLICT(wallet) DO UPDATE SET
          status = 'Activo',
          roles = excluded.roles,
          updated_at = excluded.updated_at
      `).run(adminWallet, JSON.stringify(["Admin"]), Date.now());

      console.log(`[Listener] Bootstrap admin detectado: ${adminWallet}`);
    } catch (err) {
      console.warn("[Listener] No se pudo bootstrapear admin desde ProgramConfig:", err);
    }
  }

  private async bootstrapPersonsFromChain(accounts?: ProgramAccounts): Promise<void> {
    try {
      const db = getDb();
      const sourceAccounts =
        accounts ??
        (await this.connection.getProgramAccounts(PROGRAM_ID, {
          commitment: "confirmed",
        }));

      const upsertPerson = db.prepare(`
        INSERT INTO persons (wallet, nombre, apellido, dni, status, roles, role_data, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(wallet) DO UPDATE SET
          nombre = excluded.nombre,
          apellido = excluded.apellido,
          dni = excluded.dni,
          status = excluded.status,
          roles = excluded.roles,
          role_data = excluded.role_data,
          updated_at = excluded.updated_at
      `);

      let count = 0;
      const now = Date.now();

      for (const acc of sourceAccounts) {
        try {
          const person = this.coder.accounts.decode("PersonAccount", acc.account.data) as {
            wallet: { toBase58?: () => string } | string;
            nombre?: string;
            apellido?: string;
            dni?: string;
            status?: unknown;
            roles?: unknown[];
            roleData?: string;
            role_data?: string;
          };

          const wallet =
            typeof person.wallet === "string"
              ? person.wallet
              : person.wallet?.toBase58?.();

          if (!wallet) continue;

          const status = this.enumName(person.status);
          const roles = Array.isArray(person.roles)
            ? person.roles.map((r) => this.enumName(r)).filter(Boolean)
            : [];

          upsertPerson.run(
            wallet,
            person.nombre ?? "",
            person.apellido ?? "",
            person.dni ?? "",
            status || "Activo",
            JSON.stringify(roles),
            person.roleData ?? person.role_data ?? "",
            now
          );

          count++;
        } catch {
          // No era una PersonAccount, se ignora.
        }
      }

      console.log(`[Listener] Bootstrap de persons desde on-chain: ${count} cuenta(s).`);
    } catch (err) {
      console.warn("[Listener] No se pudo bootstrapear persons desde on-chain:", err);
    }
  }

  private async bootstrapCertificationsFromChain(accounts?: ProgramAccounts): Promise<void> {
    try {
      const db = getDb();
      const sourceAccounts =
        accounts ??
        (await this.connection.getProgramAccounts(PROGRAM_ID, { commitment: "confirmed" }));
      const now = Date.now();
      let count = 0;

      for (const acc of sourceAccounts) {
        try {
          const cert = this.coder.accounts.decode("Certification", acc.account.data) as {
            certToken?: unknown;
            nombre?: string;
            apellido?: string;
            dni?: string;
            carrera?: string;
            anioEgreso?: number;
            universidad?: unknown;
            estado?: unknown;
            hashDatos?: number[] | Uint8Array;
            motivoRevocacion?: string;
            bump?: number;
          };

          const certToken = this.asBase58(cert.certToken);
          const universidad = this.asBase58(cert.universidad);
          if (!certToken || !universidad) continue;

          const estado = this.enumName(cert.estado);
          const hashDatos = cert.hashDatos
            ? Buffer.from(cert.hashDatos as number[]).toString("hex")
            : null;

          db.prepare(`
            INSERT OR REPLACE INTO certifications
              (pubkey, cert_token, nombre, apellido, dni, carrera, anio_egreso, universidad, estado, hash_datos, motivo_revocacion, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            acc.pubkey.toBase58(),
            certToken,
            cert.nombre ?? null,
            cert.apellido ?? null,
            cert.dni ?? null,
            cert.carrera ?? null,
            cert.anioEgreso ?? null,
            universidad,
            estado || null,
            hashDatos,
            cert.motivoRevocacion ?? null,
            now
          );
          count++;
        } catch {
          // No era una Certification, se ignora.
        }
      }

      console.log(`[Listener] Bootstrap de certifications desde on-chain: ${count} cuenta(s).`);
    } catch (err) {
      console.warn("[Listener] No se pudo bootstrapear certifications desde on-chain:", err);
    }
  }

  private enumName(value: unknown): string {
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
      const keys = Object.keys(value as object);
      if (keys.length > 0) {
        const k = keys[0] ?? "";
        return k ? k.charAt(0).toUpperCase() + k.slice(1) : "";
      }
    }
    return String(value ?? "");
  }

  private asBase58(value: unknown): string | null {
    if (typeof value === "string" && value.length > 0) return value;
    if (value && typeof (value as { toBase58?: () => string }).toBase58 === "function") {
      return (value as { toBase58: () => string }).toBase58();
    }
    return null;
  }

  private async hydratePersonFromChain(wallet: string): Promise<void> {
    try {
      const db = getDb();
      const walletPk = new PublicKey(wallet);
      const [personPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("person"), walletPk.toBuffer()],
        PROGRAM_ID
      );

      const accountInfo = await this.connection.getAccountInfo(personPda, "confirmed");
      if (!accountInfo?.data) return;

      const person = this.coder.accounts.decode("PersonAccount", accountInfo.data) as {
        wallet: { toBase58?: () => string } | string;
        nombre?: string;
        apellido?: string;
        dni?: string;
        status?: unknown;
        roles?: unknown[];
        roleData?: string;
        role_data?: string;
      };

      const personWallet = this.asBase58(person.wallet) ?? wallet;
      const status = this.enumName(person.status) || "Activo";
      const roles = Array.isArray(person.roles)
        ? person.roles.map((r) => this.enumName(r)).filter(Boolean)
        : [];

      db.prepare(`
        INSERT INTO persons (wallet, nombre, apellido, dni, status, roles, role_data, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(wallet) DO UPDATE SET
          nombre = excluded.nombre,
          apellido = excluded.apellido,
          dni = excluded.dni,
          status = excluded.status,
          roles = excluded.roles,
          role_data = excluded.role_data,
          updated_at = excluded.updated_at
      `).run(
        personWallet,
        person.nombre ?? "",
        person.apellido ?? "",
        person.dni ?? "",
        status,
        JSON.stringify(roles),
        person.roleData ?? person.role_data ?? "",
        Date.now()
      );
    } catch (err) {
      console.warn(`[Listener] No se pudo hidratar persona ${wallet} desde on-chain:`, err);
    }
  }

  private async hydratePersonsFromEvents(events: Array<{ name: string; data: unknown }>): Promise<void> {
    const wallets = new Set<string>();
    for (const event of events) {
      if (event.name !== "RoleRequestedEvent" && event.name !== "PersonRegisteredEvent") continue;
      const data = event.data as { requester?: unknown; wallet?: unknown };
      const wallet = this.asBase58(data.requester) ?? this.asBase58(data.wallet);
      if (wallet) wallets.add(wallet);
    }

    if (wallets.size === 0) return;
    await Promise.all([...wallets].map((wallet) => this.hydratePersonFromChain(wallet)));
  }

  private async syncHistorical(): Promise<void> {
    console.log("[Listener] Iniciando sync histórico...");
    const db = getDb();
    const lastSig = db
      .prepare("SELECT signature FROM processed_sigs ORDER BY slot DESC LIMIT 1")
      .get() as { signature: string } | undefined;

    let beforeSig: string | undefined = undefined;
    let processed = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const sigs = await this.connection.getSignaturesForAddress(PROGRAM_ID, {
        limit: 100,
        before: beforeSig,
        until: lastSig?.signature,
      });

      if (sigs.length === 0) break;

      for (const sigInfo of sigs) {
        if (!sigInfo.err) {
          await this.processTx(sigInfo.signature, sigInfo.slot, sigInfo.blockTime ?? null);
          processed++;
        }
      }

      beforeSig = sigs[sigs.length - 1].signature;

      // Si devolvió menos de 100 ya no hay más páginas
      if (sigs.length < 100) break;
    }

    console.log(`[Listener] Sync histórico completado: ${processed} transacciones procesadas.`);
  }

  // ── WebSocket: escucha eventos en tiempo real ────────────────────────────

  private subscribeWs(): void {
    this.wsSubId = this.connection.onLogs(
      PROGRAM_ID,
      async (logs: Logs) => {
        if (logs.err) return;
        try {
          const tx = await this.connection.getTransaction(logs.signature, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
          });
          const slot = tx?.slot ?? 0;
          const blockTime = tx?.blockTime ?? null;
          await this.processTx(logs.signature, slot, blockTime, tx?.meta?.logMessages ?? null);
        } catch (err) {
          console.error("[Listener] Error procesando tx via WS:", err);
        }
      },
      "confirmed"
    );
    console.log("[Listener] WebSocket activo.");
  }

  // ── Polling: fallback por si el WebSocket pierde conexión ────────────────

  private startPollFallback(): void {
    this.pollTimer = setInterval(async () => {
      try {
        const sigs = await this.connection.getSignaturesForAddress(PROGRAM_ID, {
          limit: 25,
        });
        const db = getDb();
        const validSignatures = sigs.filter((s) => !s.err).map((s) => s.signature);
        if (validSignatures.length === 0) return;

        const placeholders = validSignatures.map(() => "?").join(",");
        const seenRows = db
          .prepare(`SELECT signature FROM processed_sigs WHERE signature IN (${placeholders})`)
          .all(...validSignatures) as Array<{ signature: string }>;
        const seen = new Set(seenRows.map((r) => r.signature));

        for (const sigInfo of sigs) {
          if (sigInfo.err) continue;
          if (!seen.has(sigInfo.signature)) {
            await this.processTx(sigInfo.signature, sigInfo.slot, sigInfo.blockTime ?? null);
          }
        }
      } catch (err) {
        console.error("[Listener] Error en polling:", err);
      }
    }, config.pollIntervalMs);
  }

  // ── Procesamiento individual de transacción ──────────────────────────────

  private async processTx(
    signature: string,
    slot: number,
    blockTime: number | null,
    logMessages?: readonly string[] | null
  ): Promise<void> {
    const db = getDb();

    const alreadyProcessed = db
      .prepare("SELECT 1 FROM processed_sigs WHERE signature = ?")
      .get(signature);
    if (alreadyProcessed) return;

    try {
      let logs = logMessages ?? null;
      if (!logs) {
        const tx = await this.connection.getTransaction(signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });
        logs = tx?.meta?.logMessages ?? null;
      }

      if (!logs) {
        this.markProcessed(signature, slot);
        return;
      }

      const events = [...this.parser.parseLogs(Array.from(logs))];
      await this.hydratePersonsFromEvents(events as Array<{ name: string; data: unknown }>);

      const insertEvent = db.prepare(`
        INSERT OR IGNORE INTO events (signature, slot, block_time, event_type, data, processed_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const now = Date.now();

      const processAll = db.transaction(() => {
        for (const event of events) {
          const data = JSON.stringify(event.data, (_, v) =>
            typeof v === "bigint" ? v.toString() : v
          );
          insertEvent.run(signature, slot, blockTime, event.name, data, now);
          handleEvent(event.name, event.data, signature);
        }
        this.markProcessed(signature, slot);
      });

      processAll();

      if (events.length > 0) {
        console.log(`[Listener] ${signature.slice(0, 8)}... → ${events.length} evento(s)`);
      }
    } catch (err) {
      console.error(`[Listener] Error procesando ${signature}:`, err);
    }
  }

  private markProcessed(signature: string, slot: number): void {
    getDb()
      .prepare(
        "INSERT OR IGNORE INTO processed_sigs (signature, slot, processed_at) VALUES (?, ?, ?)"
      )
      .run(signature, slot, Date.now());
    this.lastProcessedSlot = Math.max(this.lastProcessedSlot, slot);
  }
}
