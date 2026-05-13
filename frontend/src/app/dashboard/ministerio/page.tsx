"use client";

import { useEffect, useMemo, useState } from "react";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { BASE, api, type AuditEntry, type EventRow, type GraduateRequest, type Person, type TokenRequest } from "@/lib/api";
import {
  approveLocalRequestTx,
  approveTokenRequestTx,
  deriveToCancilleriaTx,
  emitAndAssignForeignTx,
  fetchGraduateRequestDetailOnChain,
  fetchPersonIdentityOnChain,
  fetchPersonRoleDataOnChain,
  fetchTokenRequestDetailOnChain,
  rejectGraduateRequestTx,
  rejectTokenRequestTx,
} from "@/lib/solanaProgram";

type Tab = "graduacion" | "tokens" | "actividad";

type ActivityRowInfo = {
  requesterName: string;
  requesterUniversity: string;
  resolverName: string;
};

type RejectTarget =
  | { kind: "graduate"; request: GraduateRequest }
  | { kind: "token"; request: TokenRequest };

type ReadyGraduateEnrichment = {
  nombre: string | null;
  apellido: string | null;
  dni: string | null;
  tipo: string | null;
  pais: string | null;
};

function shortKey(key: string) {
  if (!key) return "";
  if (key.length <= 11) return key;
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function displayName(person: Person | null | undefined): string {
  if (!person) return "-";
  const full = `${person.nombre ?? ""} ${person.apellido ?? ""}`.trim();
  return full.length > 0 ? full : "-";
}

export default function MinisterioDashboard() {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const [tab, setTab] = useState<Tab>("graduacion");
  const [pendingGraduate, setPendingGraduate] = useState<GraduateRequest[]>([]);
  const [readyGraduate, setReadyGraduate] = useState<GraduateRequest[]>([]);
  const [peopleByWallet, setPeopleByWallet] = useState<Record<string, Person>>({});
  const [pendingGraduateOnChain, setPendingGraduateOnChain] = useState<
    Record<string, { tipo: string | null; estado: string | null; pais: string | null; motivo: string | null }>
  >({});
  const [readyGraduateEnrichment, setReadyGraduateEnrichment] = useState<Record<string, ReadyGraduateEnrichment>>({});
  const [graduateSearch, setGraduateSearch] = useState("");
  const [graduateCountryFilter, setGraduateCountryFilter] = useState("");
  const [graduateTypeFilter, setGraduateTypeFilter] = useState("");
  const [readyGraduateSearch, setReadyGraduateSearch] = useState("");
  const [pendingTokens, setPendingTokens] = useState<TokenRequest[]>([]);
  const [pendingTokenPersons, setPendingTokenPersons] = useState<Record<string, Person>>({});
  const [pendingTokenRoleDataOnChain, setPendingTokenRoleDataOnChain] = useState<Record<string, string>>({});
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [selectedTokenRequest, setSelectedTokenRequest] = useState<TokenRequest | null>(null);
  const [selectedTokenRequestDetail, setSelectedTokenRequestDetail] = useState<{
    carrera: string | null;
    plan: string | null;
    resolucion: string | null;
    anioEgreso: number | null;
    cantidad: number | null;
  } | null>(null);
  const [selectedTokenRequester, setSelectedTokenRequester] = useState<Person | null>(null);
  const [selectedTokenRequestLoading, setSelectedTokenRequestLoading] = useState(false);
  const [selectedTokenRequestError, setSelectedTokenRequestError] = useState<string | null>(null);
  const [tokenSearch, setTokenSearch] = useState("");
  const [tokenUniversityFilter, setTokenUniversityFilter] = useState("");
  const [activitySearch, setActivitySearch] = useState("");
  const [activityActionFilter, setActivityActionFilter] = useState("");
  const [selectedActivity, setSelectedActivity] = useState<AuditEntry | null>(null);
  const [selectedActivityEvents, setSelectedActivityEvents] = useState<EventRow[]>([]);
  const [selectedActivityActor, setSelectedActivityActor] = useState<Person | null>(null);
  const [selectedActivityRequester, setSelectedActivityRequester] = useState<Person | null>(null);
  const [activityInfoById, setActivityInfoById] = useState<Record<number, ActivityRowInfo>>({});
  const [selectedActivityTokenDetail, setSelectedActivityTokenDetail] = useState<{
    carrera: string | null;
    plan: string | null;
    resolucion: string | null;
    anioEgreso: number | null;
    cantidad: number | null;
  } | null>(null);
  const [selectedActivityLoading, setSelectedActivityLoading] = useState(false);
  const [selectedActivityError, setSelectedActivityError] = useState<string | null>(null);
  const [selectedActivityRequest, setSelectedActivityRequest] = useState<GraduateRequest | null>(null);
  const [selectedGraduateRequest, setSelectedGraduateRequest] = useState<GraduateRequest | null>(null);
  const [selectedGraduateRequester, setSelectedGraduateRequester] = useState<Person | null>(null);
  const [selectedGraduateEvents, setSelectedGraduateEvents] = useState<EventRow[]>([]);
  const [selectedGraduateOnChain, setSelectedGraduateOnChain] = useState<{
    tipo: string | null;
    estado: string | null;
    pais: string | null;
    motivo: string | null;
    pdfHashHex: string | null;
  } | null>(null);
  const [selectedGraduateLoading, setSelectedGraduateLoading] = useState(false);
  const [selectedGraduateError, setSelectedGraduateError] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [emitRequest, setEmitRequest] = useState<GraduateRequest | null>(null);
  const [emitRequester, setEmitRequester] = useState<Person | null>(null);
  const [emitRequestCountry, setEmitRequestCountry] = useState("");
  const [emitTokenId, setEmitTokenId] = useState(() => String(Date.now()));
  const [emitCarrera, setEmitCarrera] = useState("");
  const [emitPlan, setEmitPlan] = useState("");
  const [emitResolucion, setEmitResolucion] = useState("");
  const [emitAnio, setEmitAnio] = useState("");
  const [readyGraduateHasCertification, setReadyGraduateHasCertification] = useState<Record<string, boolean>>({});
  const [locallyIssuedWallets, setLocallyIssuedWallets] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const loadData = async (wallet: string) => {
    const [a, g, gLocal, gForeign, t, p] = await Promise.all([
      api.getAuditByActor(wallet, 30),
      api.getGraduateRequestsByStatus("Pendiente"),
      api.getGraduateRequestsByStatus("AprobadoLocal"),
      api.getGraduateRequestsByStatus("AprobadoExtranjero"),
      api.getPendingTokenRequests(),
      api.getPersons(300, 0),
    ]);
    const ministryActions = new Set(["ApproveLocal", "RejectRequest", "DeriveCancilleria", "ApproveTokenRequest", "RejectTokenRequest"]);
    const readyMap = new Map<string, GraduateRequest>();
    for (const item of [...gLocal.data, ...gForeign.data]) {
      readyMap.set(item.wallet, item);
    }
    setAudit(a.data.filter((entry) => ministryActions.has(entry.accion)));
    setPendingGraduate(g.data);
    setReadyGraduate([...readyMap.values()]);
    setPendingTokens(t.data);
    setPeopleByWallet(Object.fromEntries(p.data.map((person) => [person.wallet, person])));

    const readyWallets = [...new Set([...gLocal.data, ...gForeign.data].map((r) => r.wallet))];
    if (readyWallets.length === 0) {
      setReadyGraduateHasCertification({});
      return;
    }

    const certResults = await Promise.allSettled(
      readyWallets.map(async (w) => {
        const certs = await api.getCertificationsByEgresado(w, 1, 0);
        return { wallet: w, hasCertification: certs.data.length > 0 };
      })
    );

    const nextHasCert: Record<string, boolean> = {};
    for (const result of certResults) {
      if (result.status === "fulfilled") {
        nextHasCert[result.value.wallet] = result.value.hasCertification;
      }
    }
    setReadyGraduateHasCertification(nextHasCert);
  };

  const openTokenRequestDetail = async (request: TokenRequest) => {
    setSelectedTokenRequest(request);
    setSelectedTokenRequestDetail(null);
    setSelectedTokenRequester(null);
    setSelectedTokenRequestError(null);
    setSelectedTokenRequestLoading(true);

    const [detailResult, requesterResult] = await Promise.allSettled([
      fetchTokenRequestDetailOnChain({
        connection,
        tokenRequest: new PublicKey(request.pubkey),
      }),
      api.getPerson(request.solicitante),
    ]);

    if (detailResult.status === "fulfilled") {
      setSelectedTokenRequestDetail(detailResult.value);
    }

    if (requesterResult.status === "fulfilled") {
      setSelectedTokenRequester(requesterResult.value.data);
    }

    if (detailResult.status === "rejected" && requesterResult.status === "rejected") {
      setSelectedTokenRequestError("No se pudo cargar el detalle de la solicitud.");
    }

    setSelectedTokenRequestLoading(false);
  };

  useEffect(() => {
    if (!publicKey) {
      setLoading(false);
      setAudit([]);
      setPendingGraduate([]);
      setReadyGraduate([]);
      setPeopleByWallet({});
      setPendingGraduateOnChain({});
      setReadyGraduateEnrichment({});
      setReadyGraduateHasCertification({});
      setLocallyIssuedWallets({});
      setPendingTokens([]);
      setPendingTokenPersons({});
      setPendingTokenRoleDataOnChain({});
      return;
    }

    const wallet = publicKey.toBase58();
    loadData(wallet).finally(() => setLoading(false));
  }, [publicKey]);

  useEffect(() => {
    const walletsToFetch = pendingGraduate
      .filter((r) => !firstNonEmpty(r.pais) || !firstNonEmpty(r.tipo))
      .map((r) => r.wallet)
      .filter((wallet) => !(wallet in pendingGraduateOnChain));

    if (walletsToFetch.length === 0) return;

    let cancelled = false;
    const loadGraduateOnChain = async () => {
      const results = await Promise.all(
        walletsToFetch.map(async (wallet) => {
          try {
            const detail = await fetchGraduateRequestDetailOnChain({
              connection,
              egresadoWallet: new PublicKey(wallet),
            });
            return { wallet, detail };
          } catch {
            return { wallet, detail: null };
          }
        })
      );

      if (cancelled) return;

      const next: Record<string, { tipo: string | null; estado: string | null; pais: string | null; motivo: string | null }> = {};
      for (const item of results) {
        if (item.detail) next[item.wallet] = item.detail;
      }

      if (Object.keys(next).length > 0) {
        setPendingGraduateOnChain((prev) => ({ ...prev, ...next }));
      }
    };

    loadGraduateOnChain();
    return () => {
      cancelled = true;
    };
  }, [pendingGraduate, pendingGraduateOnChain, connection]);

  useEffect(() => {
    const walletsToFetch = readyGraduate
      .filter((r) => {
        const person = peopleByWallet[r.wallet];
        const enrichment = readyGraduateEnrichment[r.wallet];
        return !person?.dni || !person?.nombre || !person?.apellido || !enrichment?.tipo || !enrichment?.pais;
      })
      .map((r) => r.wallet)
      .filter((wallet) => !(wallet in readyGraduateEnrichment));

    if (walletsToFetch.length === 0) return;

    let cancelled = false;
    const loadReadyGraduateEnrichment = async () => {
      const results = await Promise.all(
        walletsToFetch.map(async (wallet) => {
          const [personResult, detailResult] = await Promise.allSettled([
            api.getPersonByWallet(wallet),
            fetchGraduateRequestDetailOnChain({
              connection,
              egresadoWallet: new PublicKey(wallet),
            }),
          ]);

          const person = personResult.status === "fulfilled" ? personResult.value.data : null;
          const detail = detailResult.status === "fulfilled" ? detailResult.value : null;

          return {
            wallet,
            enrichment: {
              nombre: person?.nombre ?? null,
              apellido: person?.apellido ?? null,
              dni: person?.dni ?? null,
              tipo: detail?.tipo ?? null,
              pais: detail?.pais ?? null,
            } satisfies ReadyGraduateEnrichment,
          };
        })
      );

      if (cancelled) return;

      const next: Record<string, ReadyGraduateEnrichment> = {};
      for (const item of results) {
        next[item.wallet] = item.enrichment;
      }

      if (Object.keys(next).length > 0) {
        setReadyGraduateEnrichment((prev) => ({ ...prev, ...next }));
      }
    };

    loadReadyGraduateEnrichment();
    return () => {
      cancelled = true;
    };
  }, [readyGraduate, peopleByWallet, readyGraduateEnrichment, connection]);

  useEffect(() => {
    const wallets = [
      ...new Set(
        pendingTokens
          .flatMap((r) => [r.solicitante, r.universidad])
          .filter((value): value is string => typeof value === "string" && value.length > 0)
      ),
    ];
    if (wallets.length === 0) {
      setPendingTokenPersons({});
      setPendingTokenRoleDataOnChain({});
      return;
    }

    let cancelled = false;
    const loadPersons = async () => {
      const results = await Promise.allSettled(
        wallets.map(async (wallet) => {
          const [personResult, roleDataResult] = await Promise.allSettled([
            api.getPerson(wallet),
            fetchPersonRoleDataOnChain({
              connection,
              wallet: new PublicKey(wallet),
            }),
          ]);
          return { wallet, personResult, roleDataResult };
        })
      );
      if (cancelled) return;

      const personsMap: Record<string, Person> = {};
      const roleDataMap: Record<string, string> = {};
      for (const result of results) {
        if (result.status === "fulfilled") {
          const { wallet, personResult, roleDataResult } = result.value;
          if (personResult.status === "fulfilled") {
            personsMap[personResult.value.data.wallet] = personResult.value.data;
          }
          if (roleDataResult.status === "fulfilled" && roleDataResult.value) {
            roleDataMap[wallet] = roleDataResult.value;
          }
        }
      }
      setPendingTokenPersons(personsMap);
      setPendingTokenRoleDataOnChain(roleDataMap);
    };

    loadPersons();
    return () => {
      cancelled = true;
    };
  }, [pendingTokens, connection]);

  useEffect(() => {
    if (audit.length === 0) {
      setActivityInfoById({});
      return;
    }

    let cancelled = false;

    const loadActivityInfo = async () => {
      const peopleResult = await api.getPersons(300, 0);
      const peopleByWallet = new Map(peopleResult.data.map((p) => [p.wallet, p]));

      const rows = await Promise.all(
        audit.map(async (entry) => {
          const [txResult, requestResult] = await Promise.allSettled([
            api.getTransactionBySignature(entry.signature),
            api.getGraduateRequestByPubkey(entry.entidad),
          ]);

          const events = txResult.status === "fulfilled" ? txResult.value.data : [];
          const request = requestResult.status === "fulfilled" ? requestResult.value.data : null;
          const requesterWallet = request?.wallet ?? extractRequesterFromEvents(events);
          const requesterPerson = requesterWallet ? peopleByWallet.get(requesterWallet) ?? null : null;
          const resolverPerson = peopleByWallet.get(entry.actor) ?? null;
          const isGraduateFlowAction = ["ApproveLocal", "RejectRequest", "DeriveCancilleria"].includes(entry.accion);
          const universityLabel = isGraduateFlowAction
            ? firstNonEmpty(request?.titulo_institucion, requesterPerson?.role_data, request?.titulo_pais) ?? "-"
            : firstNonEmpty(requesterPerson?.role_data, request?.titulo_institucion, request?.titulo_pais) ?? "-";

          return {
            id: entry.id,
            info: {
              requesterName: displayName(requesterPerson),
              requesterUniversity: universityLabel,
              resolverName: displayName(resolverPerson),
            },
          };
        })
      );

      if (cancelled) return;

      const map: Record<number, ActivityRowInfo> = {};
      for (const row of rows) {
        map[row.id] = row.info;
      }
      setActivityInfoById(map);
    };

    loadActivityInfo();

    return () => {
      cancelled = true;
    };
  }, [audit, connection]);

  const run = async (key: string, action: () => Promise<string>): Promise<boolean> => {
    if (!anchorWallet || !publicKey) {
      setMsg("Conecta una wallet Ministerio para operar.");
      return false;
    }
    setBusyKey(key);
    setMsg(null);
    try {
      const sig = await action();
      setMsg(`Transacción enviada: ${sig}`);
      await loadData(publicKey.toBase58());
      return true;
    } catch (e) {
      const err = e instanceof Error ? e.message : "Error en transacción";
      setMsg(err);
      return false;
    } finally {
      setBusyKey(null);
    }
  };

  const openActivityDetail = async (entry: AuditEntry) => {
    setSelectedActivity(entry);
    setSelectedActivityEvents([]);
    setSelectedActivityActor(null);
    setSelectedActivityRequester(null);
    setSelectedActivityRequest(null);
    setSelectedActivityTokenDetail(null);
    setSelectedActivityError(null);
    setSelectedActivityLoading(true);

    const [txResult, actorResult, requestResult, tokenDetailResult] = await Promise.allSettled([
      api.getTransactionBySignature(entry.signature),
      api.getPerson(entry.actor),
      api.getGraduateRequestByPubkey(entry.entidad),
      (entry.accion === "ApproveTokenRequest" || entry.accion === "RejectTokenRequest")
        ? fetchTokenRequestDetailOnChain({
            connection,
            tokenRequest: new PublicKey(entry.entidad),
          })
        : Promise.resolve(null),
    ]);

    let events: EventRow[] = [];
    if (txResult.status === "fulfilled") {
      events = txResult.value.data;
      setSelectedActivityEvents(events);
    }

    if (actorResult.status === "fulfilled") {
      setSelectedActivityActor(actorResult.value.data);
    }

    if (tokenDetailResult.status === "fulfilled" && tokenDetailResult.value) {
      setSelectedActivityTokenDetail(tokenDetailResult.value);
    }
    if (requestResult.status === "fulfilled" && requestResult.value.data) {
      setSelectedActivityRequest(requestResult.value.data);
    }

    const requesterWallet = requestResult.status === "fulfilled" && requestResult.value.data
      ? requestResult.value.data.wallet
      : extractRequesterFromEvents(events);
    if (requesterWallet) {
      try {
        const requester = await api.getPerson(requesterWallet);
        setSelectedActivityRequester(requester.data);
      } catch {
        setSelectedActivityRequester(null);
      }
    }

    if (txResult.status === "rejected" && actorResult.status === "rejected") {
      setSelectedActivityError("No se pudo cargar el detalle de la actividad.");
    }

    setSelectedActivityLoading(false);
  };

  const openGraduateRequestDetail = async (request: GraduateRequest) => {
    setSelectedGraduateRequest(request);
    setSelectedGraduateRequester(peopleByWallet[request.wallet] ?? null);
    setSelectedGraduateEvents([]);
    setSelectedGraduateOnChain(null);
    setSelectedGraduateError(null);
    setSelectedGraduateLoading(true);

    const [auditResult, onChainResult, personApiResult, personOnChainResult] = await Promise.allSettled([
      api.getAuditLog(400, 0),
      fetchGraduateRequestDetailOnChain({
        connection,
        egresadoWallet: new PublicKey(request.wallet),
      }),
      api.getPerson(request.wallet),
      fetchPersonIdentityOnChain({
        connection,
        wallet: new PublicKey(request.wallet),
      }),
    ]);

    if (personApiResult.status === "fulfilled") {
      setSelectedGraduateRequester(personApiResult.value.data);
    }

    if (personOnChainResult.status === "fulfilled" && personOnChainResult.value) {
      setSelectedGraduateRequester((prev) => {
        if (!prev) {
          return {
            wallet: request.wallet,
            nombre: personOnChainResult.value?.nombre ?? null,
            apellido: personOnChainResult.value?.apellido ?? null,
            dni: personOnChainResult.value?.dni ?? null,
            status: null,
            roles: [],
            role_data: null,
            updated_at: null,
          };
        }

        return {
          ...prev,
          nombre: prev.nombre ?? personOnChainResult.value?.nombre ?? null,
          apellido: prev.apellido ?? personOnChainResult.value?.apellido ?? null,
          dni: prev.dni ?? personOnChainResult.value?.dni ?? null,
        };
      });
    }

    if (onChainResult.status === "fulfilled") {
      setSelectedGraduateOnChain(onChainResult.value);
    }

    if (auditResult.status === "fulfilled" && request.pubkey) {
      const auditEntry = auditResult.value.data.find(
        (entry) => entry.entidad === request.pubkey && entry.accion === "RequestCertification"
      );

      if (auditEntry) {
        const txResult = await Promise.allSettled([
          api.getTransactionBySignature(auditEntry.signature),
        ]);
        if (txResult[0].status === "fulfilled") {
          setSelectedGraduateEvents(txResult[0].value.data);
        }
      }
    }

    if (auditResult.status === "rejected" && onChainResult.status === "rejected") {
      setSelectedGraduateError("No se pudo cargar el detalle completo de la solicitud.");
    }

    setSelectedGraduateLoading(false);
  };

  const ministerioPk = publicKey ? new PublicKey(publicKey.toBase58()) : null;

  const openEmitModal = (request: GraduateRequest) => {
    setEmitRequest(request);
    setEmitRequester(peopleByWallet[request.wallet] ?? null);
    setEmitRequestCountry(
      firstNonEmpty(
        request.pais,
        request.titulo_pais,
        readyGraduateEnrichment[request.wallet]?.pais,
        pendingGraduateOnChain[request.wallet]?.pais
      ) ?? ""
    );
    setEmitTokenId(String(Date.now()));
    setEmitCarrera(request.titulo_carrera ?? "");
    setEmitPlan("PLAN-EXTRANJERO");
    setEmitResolucion(request.pubkey ?? "RES-SIN-REF");
    setEmitAnio(request.titulo_anio ? String(request.titulo_anio) : "");
  };

  useEffect(() => {
    if (!emitRequest) {
      setEmitRequester(null);
      setEmitRequestCountry("");
      return;
    }

    setEmitRequestCountry(
      firstNonEmpty(
        emitRequest.pais,
        emitRequest.titulo_pais,
        readyGraduateEnrichment[emitRequest.wallet]?.pais,
        pendingGraduateOnChain[emitRequest.wallet]?.pais
      ) ?? ""
    );

    let cancelled = false;
    const loadEmitRequester = async () => {
      let requester: Person | null = peopleByWallet[emitRequest.wallet] ?? null;

      if (!requester) {
        try {
          const personResult = await api.getPersonByWallet(emitRequest.wallet);
          requester = personResult.data as Person | null;
        } catch {
          // no-op
        }
      }

      try {
        const onChain = await fetchPersonIdentityOnChain({
          connection,
          wallet: new PublicKey(emitRequest.wallet),
        });

        if (onChain) {
          requester = {
            wallet: emitRequest.wallet,
            nombre: requester?.nombre ?? onChain.nombre ?? null,
            apellido: requester?.apellido ?? onChain.apellido ?? null,
            dni: requester?.dni ?? onChain.dni ?? null,
            status: requester?.status ?? null,
            roles: requester?.roles ?? [],
            role_data: requester?.role_data ?? null,
            updated_at: requester?.updated_at ?? null,
          };
        }
      } catch {
        // no-op
      }

      if (!cancelled) {
        setEmitRequester(requester);
      }
    };

    loadEmitRequester();

    return () => {
      cancelled = true;
    };
  }, [emitRequest, peopleByWallet, readyGraduateEnrichment, pendingGraduateOnChain, connection]);

  const submitEmission = async () => {
    if (!emitRequest || !ministerioPk || !anchorWallet) return;

    const requester = emitRequester;
    if (!requester?.nombre || !requester?.apellido || !requester?.dni) {
      setMsg("No se puede emitir: faltan nombre/apellido/dni del titular.");
      return;
    }
    const requesterNombre = requester.nombre;
    const requesterApellido = requester.apellido;
    const requesterDni = requester.dni;

    if (!emitCarrera.trim() || !emitPlan.trim() || !emitResolucion.trim() || !emitAnio.trim() || !emitTokenId.trim()) {
      setMsg("Completa ID, carrera, plan, resolución y año para emitir.");
      return;
    }

    const tokenId = BigInt(emitTokenId.trim());
    const anioEgreso = Number(emitAnio.trim());
    if (!Number.isInteger(anioEgreso)) {
      setMsg("El año de egreso debe ser numérico.");
      return;
    }

    const key = `emit:${emitRequest.wallet}`;

    const ok = await run(key, () =>
      emitAndAssignForeignTx({
        connection,
        wallet: anchorWallet,
        ministerio: ministerioPk,
        id: tokenId,
        carrera: emitCarrera.trim(),
        plan: emitPlan.trim(),
        resolucion: emitResolucion.trim(),
        anioEgreso,
        nombre: requesterNombre,
        apellido: requesterApellido,
        dni: requesterDni,
        walletTitular: emitRequest.wallet,
        tipo: emitRequest.tipo,
        pais: emitRequest.pais,
      })
    );

    if (ok) {
      setLocallyIssuedWallets((prev) => ({ ...prev, [emitRequest.wallet]: true }));
      setEmitRequest(null);
    }
  };

  const confirmReject = async () => {
    if (!rejectTarget || !ministerioPk) return;
    const reason = rejectReason.trim();
    if (!reason) return;

    if (rejectTarget.kind === "graduate") {
      const request = rejectTarget.request;
      await run(`g:${request.wallet}:reject`, () => rejectGraduateRequestTx({
        connection,
        wallet: anchorWallet,
        ministerio: ministerioPk,
        egresadoWallet: new PublicKey(request.wallet),
        motivo: reason,
      }));
    } else {
      const request = rejectTarget.request;
      await run(`t:${request.pubkey}:reject`, () => rejectTokenRequestTx({
        connection,
        wallet: anchorWallet,
        ministerio: ministerioPk,
        tokenRequest: new PublicKey(request.pubkey),
        motivo: reason,
      }));
    }

    setRejectTarget(null);
    setRejectReason("");
  };

  const tokenUniversityOptions = useMemo(() => {
    const values = new Set<string>();
    for (const r of pendingTokens) {
      const requester = pendingTokenPersons[r.solicitante];
      const universityPerson = pendingTokenPersons[r.universidad];
      const university = firstNonEmpty(
        requester?.role_data,
        pendingTokenRoleDataOnChain[r.solicitante],
        universityPerson?.role_data,
        pendingTokenRoleDataOnChain[r.universidad],
        r.universidad
      );
      if (university) values.add(university);
    }
    return [...values].sort((a, b) => a.localeCompare(b, "es"));
  }, [pendingTokens, pendingTokenPersons, pendingTokenRoleDataOnChain]);

  const filteredPendingTokens = useMemo(() => {
    const q = tokenSearch.trim().toLowerCase();
    return pendingTokens.filter((r) => {
      const requester = pendingTokenPersons[r.solicitante];
      const universityPerson = pendingTokenPersons[r.universidad];
      const requesterName = requester
        ? `${requester.nombre ?? ""} ${requester.apellido ?? ""}`.trim()
        : "";
      const university = firstNonEmpty(
        requester?.role_data,
        pendingTokenRoleDataOnChain[r.solicitante],
        universityPerson?.role_data,
        pendingTokenRoleDataOnChain[r.universidad],
        r.universidad
      );

      const matchSearch =
        q.length === 0 ||
        requesterName.toLowerCase().includes(q) ||
        (r.carrera ?? "").toLowerCase().includes(q) ||
        (university ?? "").toLowerCase().includes(q);

      const matchUniversity = tokenUniversityFilter.length === 0 || university === tokenUniversityFilter;

      return matchSearch && matchUniversity;
    });
  }, [pendingTokens, pendingTokenPersons, pendingTokenRoleDataOnChain, tokenSearch, tokenUniversityFilter]);

  const graduateCountryOptions = useMemo(() => {
    const values = new Set<string>();
    for (const r of pendingGraduate) {
      const pais = firstNonEmpty(r.pais, pendingGraduateOnChain[r.wallet]?.pais);
      if (pais) values.add(pais);
    }
    return [...values].sort((a, b) => a.localeCompare(b, "es"));
  }, [pendingGraduate, pendingGraduateOnChain]);

  const graduateTypeOptions = useMemo(() => {
    const values = new Set<string>();
    for (const r of pendingGraduate) {
      const tipo = firstNonEmpty(r.tipo, pendingGraduateOnChain[r.wallet]?.tipo);
      if (tipo) values.add(tipo);
    }
    return [...values].sort((a, b) => a.localeCompare(b, "es"));
  }, [pendingGraduate, pendingGraduateOnChain]);

  const filteredPendingGraduate = useMemo(() => {
    const q = graduateSearch.trim().toLowerCase();
    return pendingGraduate.filter((r) => {
      const person = peopleByWallet[r.wallet] ?? null;
      const name = displayName(person);
      const tipo = firstNonEmpty(r.tipo, pendingGraduateOnChain[r.wallet]?.tipo);
      const pais = firstNonEmpty(r.pais, pendingGraduateOnChain[r.wallet]?.pais);

      const matchSearch =
        q.length === 0 ||
        name.toLowerCase().includes(q) ||
        r.wallet.toLowerCase().includes(q) ||
        (tipo ?? "").toLowerCase().includes(q) ||
        (pais ?? "").toLowerCase().includes(q);

      const matchCountry = graduateCountryFilter.length === 0 || pais === graduateCountryFilter;
      const matchType = graduateTypeFilter.length === 0 || tipo === graduateTypeFilter;

      return matchSearch && matchCountry && matchType;
    });
  }, [pendingGraduate, peopleByWallet, pendingGraduateOnChain, graduateSearch, graduateCountryFilter, graduateTypeFilter]);

  const filteredReadyGraduate = useMemo(() => {
    const q = readyGraduateSearch.trim().toLowerCase();
    return readyGraduate.filter((r) => {
      if (readyGraduateHasCertification[r.wallet] || locallyIssuedWallets[r.wallet]) {
        return false;
      }
      const person = peopleByWallet[r.wallet];
      const enrichment = readyGraduateEnrichment[r.wallet];
      const mergedNombre = firstNonEmpty(person?.nombre, enrichment?.nombre) ?? "";
      const mergedApellido = firstNonEmpty(person?.apellido, enrichment?.apellido) ?? "";
      const mergedDni = firstNonEmpty(person?.dni, enrichment?.dni) ?? "";
      const tipo = firstNonEmpty(r.tipo, pendingGraduateOnChain[r.wallet]?.tipo, enrichment?.tipo);
      const pais = firstNonEmpty(r.pais, pendingGraduateOnChain[r.wallet]?.pais, enrichment?.pais);
      const fullName = `${mergedNombre} ${mergedApellido}`.trim();

      return (
        q.length === 0 ||
        fullName.toLowerCase().includes(q) ||
        mergedDni.toLowerCase().includes(q) ||
        r.wallet.toLowerCase().includes(q) ||
        (tipo ?? "").toLowerCase().includes(q) ||
        (pais ?? "").toLowerCase().includes(q)
      );
    });
  }, [
    readyGraduate,
    peopleByWallet,
    readyGraduateEnrichment,
    pendingGraduateOnChain,
    readyGraduateSearch,
    readyGraduateHasCertification,
    locallyIssuedWallets,
  ]);

  const activityActions = useMemo(() => {
    return [...new Set(audit.map((entry) => entry.accion))].sort((a, b) => a.localeCompare(b, "es"));
  }, [audit]);

  const filteredAudit = useMemo(() => {
    const q = activitySearch.trim().toLowerCase();
    return audit.filter((entry) => {
      const matchAction = activityActionFilter.length === 0 || entry.accion === activityActionFilter;
      const matchSearch =
        q.length === 0 ||
        entry.accion.toLowerCase().includes(q) ||
        entry.entidad.toLowerCase().includes(q) ||
        entry.signature.toLowerCase().includes(q);
      return matchAction && matchSearch;
    });
  }, [audit, activitySearch, activityActionFilter]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-primary">Panel Ministerio</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard label="Pendientes graduación" value={pendingGraduate.length} color="yellow" />
        <StatCard label="Pendientes tokens" value={pendingTokens.length} color="green" />
        <StatCard label="Listas para emitir" value={filteredReadyGraduate.length} />
      </div>

      {(() => {
        const ministryTabs: Array<{ key: Tab; label: string; count?: number }> = [
          { key: "graduacion", label: "Solicitudes de graduación", count: pendingGraduate.length },
          { key: "tokens", label: "Solicitudes de tokens", count: pendingTokens.length },
          { key: "actividad", label: "Mi actividad" },
        ];

        return (
      <div className="border-b border-gray-200 flex gap-1 overflow-x-auto">
        {ministryTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as Tab)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap ${
              tab === t.key ? "border-b-2 border-accent text-accent" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
            {typeof t.count === "number" && t.count > 0 && (
              <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>
        );
      })()}

      {tab === "graduacion" && (
        <section>
          <h2 className="text-lg font-semibold text-primary mb-3">Pendientes del egresado</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            <input
              type="text"
              value={graduateSearch}
              onChange={(e) => setGraduateSearch(e.target.value)}
              placeholder="Filtrar por solicitante, wallet, tipo o país"
              className="min-w-[240px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <select
              value={graduateTypeFilter}
              onChange={(e) => setGraduateTypeFilter(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">Todos los tipos</option>
              {graduateTypeOptions.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            <select
              value={graduateCountryFilter}
              onChange={(e) => setGraduateCountryFilter(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">Todos los países</option>
              {graduateCountryOptions.map((country) => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Wallet</th>
                  <th className="px-4 py-3 text-left">Solicitante</th>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-left">País</th>
                  <th className="px-4 py-3 text-left">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPendingGraduate.map((r) => {
                  const key = `g:${r.wallet}`;
                  const person = peopleByWallet[r.wallet] ?? null;
                  const tipo = firstNonEmpty(r.tipo, pendingGraduateOnChain[r.wallet]?.tipo);
                  const pais = firstNonEmpty(r.pais, pendingGraduateOnChain[r.wallet]?.pais);
                  return (
                    <tr key={r.wallet}>
                      <td className="px-4 py-3 font-mono text-xs" title={r.wallet}>{shortKey(r.wallet)}</td>
                      <td className="px-4 py-3">{displayName(person)}</td>
                      <td className="px-4 py-3">{tipo ?? "-"}</td>
                      <td className="px-4 py-3">{pais ?? "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openGraduateRequestDetail(r)}
                            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >Ver detalle</button>
                          <button
                            type="button"
                            disabled={busyKey === key || !ministerioPk}
                            onClick={() => run(`${key}:approve`, () => approveLocalRequestTx({
                              connection,
                              wallet: anchorWallet,
                              ministerio: ministerioPk!,
                              egresadoWallet: new PublicKey(r.wallet),
                            }))}
                            className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                          >Aprobar local</button>
                          <button
                            type="button"
                            disabled={busyKey === key || !ministerioPk}
                            onClick={() => {
                              setRejectTarget({ kind: "graduate", request: r });
                              setRejectReason("");
                            }}
                            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                          >Rechazar</button>
                          <button
                            type="button"
                            disabled={busyKey === key || !ministerioPk}
                            onClick={() => run(`${key}:derive`, () => deriveToCancilleriaTx({
                              connection,
                              wallet: anchorWallet,
                              ministerio: ministerioPk!,
                              egresadoWallet: new PublicKey(r.wallet),
                            }))}
                            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                          >Derivar</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredPendingGraduate.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">
                      No hay solicitudes que coincidan con el filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <h2 className="text-lg font-semibold text-primary mt-6 mb-3">Aprobadas listas para emitir certificación</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            <input
              type="text"
              value={readyGraduateSearch}
              onChange={(e) => setReadyGraduateSearch(e.target.value)}
              placeholder="Filtrar por solicitante, DNI, wallet, tipo o país"
              className="min-w-[240px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Wallet</th>
                  <th className="px-4 py-3 text-left">Solicitante</th>
                  <th className="px-4 py-3 text-left">DNI</th>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-left">País</th>
                  <th className="px-4 py-3 text-left">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredReadyGraduate.map((r) => {
                  const personBase = peopleByWallet[r.wallet] ?? null;
                  const enrichment = readyGraduateEnrichment[r.wallet];
                  const person = personBase
                    ? {
                        ...personBase,
                        nombre: firstNonEmpty(personBase.nombre, enrichment?.nombre) ?? personBase.nombre,
                        apellido: firstNonEmpty(personBase.apellido, enrichment?.apellido) ?? personBase.apellido,
                        dni: firstNonEmpty(personBase.dni, enrichment?.dni) ?? personBase.dni,
                      }
                    : enrichment
                      ? {
                          wallet: r.wallet,
                          nombre: enrichment.nombre,
                          apellido: enrichment.apellido,
                          dni: enrichment.dni,
                          status: null,
                          roles: [],
                          role_data: null,
                          updated_at: null,
                        }
                      : null;
                  const tipo = firstNonEmpty(r.tipo, pendingGraduateOnChain[r.wallet]?.tipo, enrichment?.tipo);
                  const pais = firstNonEmpty(r.pais, pendingGraduateOnChain[r.wallet]?.pais, enrichment?.pais);
                  return (
                    <tr key={`ready:${r.wallet}`}>
                      <td className="px-4 py-3 font-mono text-xs" title={r.wallet}>{shortKey(r.wallet)}</td>
                      <td className="px-4 py-3">{displayName(person)}</td>
                      <td className="px-4 py-3">{person?.dni ?? enrichment?.dni ?? "-"}</td>
                      <td className="px-4 py-3">{tipo ?? "-"}</td>
                      <td className="px-4 py-3">{pais ?? "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openGraduateRequestDetail(r)}
                            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >Ver detalle</button>
                          <button
                            type="button"
                            disabled={busyKey === `emit:${r.wallet}` || !ministerioPk}
                            onClick={() => openEmitModal(r)}
                            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                          >Emitir y asignar</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredReadyGraduate.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">
                      No hay solicitudes aprobadas listas para emisión que coincidan con el filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "tokens" && (
        <section>
          <h2 className="text-lg font-semibold text-primary mb-3">Solicitudes de tokens pendientes</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            <input
              type="text"
              value={tokenSearch}
              onChange={(e) => setTokenSearch(e.target.value)}
              placeholder="Filtrar por solicitante, universidad o carrera"
              className="min-w-[240px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <select
              value={tokenUniversityFilter}
              onChange={(e) => setTokenUniversityFilter(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">Todas las universidades</option>
              {tokenUniversityOptions.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Pubkey</th>
                  <th className="px-4 py-3 text-left">Solicitante</th>
                  <th className="px-4 py-3 text-left">Universidad</th>
                  <th className="px-4 py-3 text-left">Carrera</th>
                  <th className="px-4 py-3 text-right">Cantidad</th>
                  <th className="px-4 py-3 text-left">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPendingTokens.map((r) => {
                  const key = `t:${r.pubkey}`;
                  const requester = pendingTokenPersons[r.solicitante];
                  const universityPerson = pendingTokenPersons[r.universidad];
                  const requesterName = requester
                    ? `${requester.nombre ?? "-"} ${requester.apellido ?? ""}`.trim()
                    : "-";
                  const requesterUniversity = firstNonEmpty(
                    requester?.role_data,
                    pendingTokenRoleDataOnChain[r.solicitante],
                    universityPerson?.role_data,
                    pendingTokenRoleDataOnChain[r.universidad],
                    r.universidad
                  );
                  return (
                    <tr key={r.pubkey}>
                      <td className="px-4 py-3 font-mono text-xs" title={r.pubkey}>{shortKey(r.pubkey)}</td>
                      <td className="px-4 py-3">{requesterName}</td>
                      <td className="px-4 py-3">{requesterUniversity ?? "-"}</td>
                      <td className="px-4 py-3">{r.carrera ?? "-"}</td>
                      <td className="px-4 py-3 text-right">{r.cantidad ?? 0}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openTokenRequestDetail(r)}
                            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >Ver detalle</button>
                          <button
                            type="button"
                            disabled={busyKey === key || !ministerioPk}
                            onClick={() => run(`${key}:approve`, () => approveTokenRequestTx({
                              connection,
                              wallet: anchorWallet,
                              ministerio: ministerioPk!,
                              tokenRequest: new PublicKey(r.pubkey),
                            }))}
                            className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                          >Aprobar</button>
                          <button
                            type="button"
                            disabled={busyKey === key || !ministerioPk}
                            onClick={() => {
                              setRejectTarget({ kind: "token", request: r });
                              setRejectReason("");
                            }}
                            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                          >Rechazar</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredPendingTokens.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">
                      No hay solicitudes que coincidan con el filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "actividad" && (
      <section>
        <h2 className="text-lg font-semibold text-primary mb-3">Mi actividad como Ministerio</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            type="text"
            value={activitySearch}
            onChange={(e) => setActivitySearch(e.target.value)}
            placeholder="Filtrar por acción, entidad o firma"
            className="min-w-[240px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <select
            value={activityActionFilter}
            onChange={(e) => setActivityActionFilter(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">Todas las acciones</option>
            {activityActions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <AuditTable
          entries={filteredAudit}
          loading={loading}
          onViewDetail={openActivityDetail}
          activityInfoById={activityInfoById}
        />
      </section>
      )}

      {selectedTokenRequest && (
        <TokenRequestDetailModal
          request={selectedTokenRequest}
          detail={selectedTokenRequestDetail}
          requester={selectedTokenRequester}
          loading={selectedTokenRequestLoading}
          error={selectedTokenRequestError}
          onClose={() => {
            setSelectedTokenRequest(null);
            setSelectedTokenRequestDetail(null);
            setSelectedTokenRequester(null);
            setSelectedTokenRequestLoading(false);
            setSelectedTokenRequestError(null);
          }}
        />
      )}

      {selectedGraduateRequest && (
        <GraduateRequestDetailModal
          request={selectedGraduateRequest}
          requester={selectedGraduateRequester}
          onChain={selectedGraduateOnChain}
          events={selectedGraduateEvents}
          loading={selectedGraduateLoading}
          error={selectedGraduateError}
          onClose={() => {
            setSelectedGraduateRequest(null);
            setSelectedGraduateRequester(null);
            setSelectedGraduateEvents([]);
            setSelectedGraduateOnChain(null);
            setSelectedGraduateLoading(false);
            setSelectedGraduateError(null);
          }}
        />
      )}

      {selectedActivity && (
        <ActivityDetailModal
          entry={selectedActivity}
          events={selectedActivityEvents}
          actor={selectedActivityActor}
          requester={selectedActivityRequester}
          request={selectedActivityRequest}
          tokenDetail={selectedActivityTokenDetail}
          loading={selectedActivityLoading}
          error={selectedActivityError}
          onClose={() => {
            setSelectedActivity(null);
            setSelectedActivityEvents([]);
            setSelectedActivityActor(null);
            setSelectedActivityRequester(null);
            setSelectedActivityRequest(null);
            setSelectedActivityTokenDetail(null);
            setSelectedActivityLoading(false);
            setSelectedActivityError(null);
          }}
        />
      )}

      {rejectTarget && (
        <RejectReasonModal
          title={rejectTarget.kind === "graduate" ? "Rechazar solicitud de graduación" : "Rechazar solicitud de tokens"}
          reason={rejectReason}
          onReasonChange={setRejectReason}
          onCancel={() => {
            setRejectTarget(null);
            setRejectReason("");
          }}
          onConfirm={confirmReject}
        />
      )}

      {emitRequest && (
        <IssueCertificationModal
          request={emitRequest}
          requester={emitRequester}
          requestCountry={emitRequestCountry}
          tokenId={emitTokenId}
          carrera={emitCarrera}
          plan={emitPlan}
          resolucion={emitResolucion}
          anio={emitAnio}
          onTokenIdChange={setEmitTokenId}
          onCarreraChange={setEmitCarrera}
          onPlanChange={setEmitPlan}
          onResolucionChange={setEmitResolucion}
          onAnioChange={setEmitAnio}
          onCancel={() => {
            setEmitRequest(null);
            setEmitRequester(null);
            setEmitRequestCountry("");
          }}
          onConfirm={submitEmission}
          busy={busyKey === `emit:${emitRequest.wallet}`}
        />
      )}

      {msg && <p className="text-xs break-all text-gray-700">{msg}</p>}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  const accent =
    color === "green" ? "text-green-600" :
    color === "yellow" ? "text-yellow-600" :
    "text-accent";
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <span className="text-xs text-gray-500 uppercase">{label}</span>
      <p className={`text-3xl font-bold mt-1 ${accent}`}>{value}</p>
    </div>
  );
}

function AuditTable({
  entries,
  loading,
  onViewDetail,
  activityInfoById,
}: {
  entries: AuditEntry[];
  loading: boolean;
  onViewDetail: (entry: AuditEntry) => void;
  activityInfoById: Record<number, ActivityRowInfo>;
}) {
  if (loading) return <p className="text-sm text-gray-400 animate-pulse">Cargando…</p>;
  if (entries.length === 0) {
    return <p className="text-sm text-gray-400">No hay actividad del rol Ministerio registrada aún.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
          <tr>
            <th className="px-4 py-3 text-left">Acción</th>
            <th className="px-4 py-3 text-left">Solicitante</th>
            <th className="px-4 py-3 text-left">Universidad</th>
            <th className="px-4 py-3 text-left">Resolvió</th>
            <th className="px-4 py-3 text-left">Fecha</th>
            <th className="px-4 py-3 text-left">Detalle</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {entries.map((e) => {
            const info = activityInfoById[e.id];
            return (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{e.accion}</td>
                <td className="px-4 py-3 text-gray-700">{info?.requesterName ?? "-"}</td>
                <td className="px-4 py-3 text-gray-700">{info?.requesterUniversity ?? "-"}</td>
                <td className="px-4 py-3 text-gray-700">{info?.resolverName ?? "-"}</td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                  {new Date(e.timestamp * 1000).toLocaleString("es-AR")}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onViewDetail(e)}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Ver detalle
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function parseEventData(row: EventRow): Record<string, unknown> {
  try {
    return JSON.parse(row.data) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function extractRequesterFromEvents(events: EventRow[]): string | null {
  for (const ev of events) {
    const d = parseEventData(ev);
    const raw = d.solicitante ?? d.requester ?? d.wallet;
    if (typeof raw === "string" && raw.length > 0) return raw;
  }
  return null;
}

function extractRejectReason(entry: AuditEntry, events: EventRow[]): string | null {
  if (entry.motivo && entry.motivo.trim().length > 0) return entry.motivo;
  for (const ev of events) {
    const d = parseEventData(ev);
    const reason = d.reason ?? d.motivo;
    if (typeof reason === "string" && reason.trim().length > 0) return reason;
  }
  return null;
}

function ActivityDetailModal({
  entry,
  events,
  actor,
  requester,
  request,
  tokenDetail,
  loading,
  error,
  onClose,
}: {
  entry: AuditEntry;
  events: EventRow[];
  actor: Person | null;
  requester: Person | null;
  request: GraduateRequest | null;
  tokenDetail: {
    carrera: string | null;
    plan: string | null;
    resolucion: string | null;
    anioEgreso: number | null;
    cantidad: number | null;
  } | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const rejectReason = extractRejectReason(entry, events);
  const txSlot = events[0]?.slot ?? null;
  const txBlockTime = events[0]?.block_time ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-base font-semibold text-primary">Detalle de actividad</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Cerrar
          </button>
        </div>

        <div className="max-h-[70vh] space-y-3 overflow-y-auto px-5 py-4 text-sm text-gray-700">
          {loading && <p className="animate-pulse text-gray-500">Cargando detalle...</p>}
          {error && <p className="text-red-600">{error}</p>}

          {!loading && (
            <>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                <p><strong>Acción:</strong> {entry.accion}</p>
                <p><strong>Autorizante/Rechazante:</strong> {actor?.nombre ?? "-"} {actor?.apellido ?? ""}</p>
                <p className="break-all"><strong>Wallet actor:</strong> {entry.actor}</p>
                <p><strong>Titular solicitud:</strong> {requester?.nombre ?? "-"} {requester?.apellido ?? ""}</p>
                <p className="break-all"><strong>Wallet titular:</strong> {requester?.wallet ?? "-"}</p>
                <p><strong>Universidad / institución:</strong> {request?.titulo_institucion ?? requester?.role_data ?? "-"}</p>
                <p><strong>Título:</strong> {request?.titulo_nombre ?? "-"}</p>
                <p><strong>País del título:</strong> {request?.titulo_pais ?? request?.pais ?? "-"}</p>
                <p className="break-all"><strong>Entidad (PDA):</strong> {entry.entidad}</p>
                <p className="break-all"><strong>Signature:</strong> {entry.signature}</p>
                <p><strong>Slot:</strong> {txSlot ?? "-"}</p>
                <p><strong>Fecha bloque:</strong> {txBlockTime ? new Date(txBlockTime * 1000).toLocaleString("es-AR") : "-"}</p>
                <p><strong>Fecha auditoría:</strong> {new Date(entry.timestamp * 1000).toLocaleString("es-AR")}</p>
                <p><strong>Observaciones rechazo:</strong> {rejectReason ?? "-"}</p>
              </div>

              {(entry.accion === "ApproveTokenRequest" || entry.accion === "RejectTokenRequest") && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                  <p><strong>Carrera:</strong> {tokenDetail?.carrera ?? "-"}</p>
                  <p><strong>Plan:</strong> {tokenDetail?.plan ?? "-"}</p>
                  <p><strong>Resolución:</strong> {tokenDetail?.resolucion ?? "-"}</p>
                  <p><strong>Año de egreso:</strong> {tokenDetail?.anioEgreso ?? "-"}</p>
                  <p><strong>Cantidad:</strong> {tokenDetail?.cantidad ?? "-"}</p>
                </div>
              )}

              {events.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-primary">Eventos de la transacción</p>
                  {events.map((ev) => (
                    <div key={ev.id} className="rounded-lg border border-gray-200 p-3">
                      <p className="mb-2 text-xs text-gray-500">{ev.event_type} · slot {ev.slot}</p>
                      <pre className="overflow-x-auto rounded-md bg-gray-50 p-2 text-xs text-gray-700">
                        {(() => {
                          try {
                            return JSON.stringify(JSON.parse(ev.data), null, 2);
                          } catch {
                            return ev.data;
                          }
                        })()}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TokenRequestDetailModal({
  request,
  detail,
  requester,
  loading,
  error,
  onClose,
}: {
  request: TokenRequest;
  detail: {
    carrera: string | null;
    plan: string | null;
    resolucion: string | null;
    anioEgreso: number | null;
    cantidad: number | null;
  } | null;
  requester: Person | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const carrera = request.carrera ?? detail?.carrera ?? null;
  const plan = request.plan ?? detail?.plan ?? null;
  const resolucion = request.resolucion ?? detail?.resolucion ?? null;
  const anioEgreso = request.anio_egreso ?? detail?.anioEgreso ?? null;
  const cantidad = request.cantidad ?? detail?.cantidad ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-base font-semibold text-primary">Detalle de solicitud de tokens</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Cerrar
          </button>
        </div>

        <div className="space-y-3 px-5 py-4 text-sm text-gray-700">
          {loading && <p className="animate-pulse text-gray-500">Cargando detalle...</p>}
          {error && <p className="text-red-600">{error}</p>}

          {!loading && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
              <p><strong>Solicitante:</strong> {requester?.nombre ?? "-"} {requester?.apellido ?? ""}</p>
              <p className="break-all"><strong>Wallet solicitante:</strong> {request.solicitante}</p>
              <p className="break-all"><strong>Universidad:</strong> {request.universidad}</p>
              <p><strong>Carrera:</strong> {carrera ?? "-"}</p>
              <p><strong>Plan:</strong> {plan ?? "-"}</p>
              <p><strong>Resolución:</strong> {resolucion ?? "-"}</p>
              <p><strong>Año de egreso:</strong> {anioEgreso ?? "-"}</p>
              <p><strong>Cantidad solicitada:</strong> {cantidad ?? "-"}</p>
              <p><strong>Estado:</strong> {request.estado ?? "-"}</p>
              <p className="break-all"><strong>Pubkey solicitud:</strong> {request.pubkey}</p>
              <p><strong>Actualizado:</strong> {request.updated_at ? new Date(request.updated_at * 1000).toLocaleString("es-AR") : "-"}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GraduateRequestDetailModal({
  request,
  requester,
  onChain,
  events,
  loading,
  error,
  onClose,
}: {
  request: GraduateRequest;
  requester: Person | null;
  onChain: {
    tipo: string | null;
    estado: string | null;
    pais: string | null;
    motivo: string | null;
    pdfHashHex: string | null;
  } | null;
  events: EventRow[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const tipo = firstNonEmpty(request.tipo, onChain?.tipo);
  const pais = firstNonEmpty(request.pais, onChain?.pais);
  const estado = firstNonEmpty(request.estado, onChain?.estado);
  const motivo = firstNonEmpty(request.motivo ?? null, onChain?.motivo);
  const signature = events[0]?.signature ?? null;
  const slot = events[0]?.slot ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-base font-semibold text-primary">Detalle de solicitud de graduación</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Cerrar
          </button>
        </div>

        <div className="max-h-[70vh] space-y-3 overflow-y-auto px-5 py-4 text-sm text-gray-700">
          {loading && <p className="animate-pulse text-gray-500">Cargando detalle...</p>}
          {error && <p className="text-red-600">{error}</p>}

          {!loading && (
            <>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                <p><strong>Solicitante:</strong> {displayName(requester)}</p>
                <p><strong>DNI solicitante:</strong> {requester?.dni ?? "-"}</p>
                <p className="break-all"><strong>Wallet:</strong> {request.wallet}</p>
                <p><strong>Tipo:</strong> {tipo ?? "-"}</p>
                <p><strong>País:</strong> {pais ?? "-"}</p>
                <p><strong>Estado:</strong> {estado ?? "-"}</p>
                <p><strong>Motivo/observación:</strong> {motivo ?? "-"}</p>
                <p className="break-all"><strong>Hash PDF:</strong> {onChain?.pdfHashHex ?? request.pdf_hash ?? "-"}</p>
                <p><strong>Título:</strong> {request.titulo_nombre ?? "-"}</p>
                <p><strong>Carrera título:</strong> {request.titulo_carrera ?? "-"}</p>
                <p><strong>Institución:</strong> {request.titulo_institucion ?? "-"}</p>
                <p><strong>Año título:</strong> {request.titulo_anio ?? "-"}</p>
                <p><strong>País título:</strong> {request.titulo_pais ?? "-"}</p>
                <p><strong>Observaciones:</strong> {request.titulo_observaciones ?? "-"}</p>
                <p>
                  <strong>PDF:</strong>{" "}
                  {request.pdf_url ? (
                    <a
                      href={`${BASE}${request.pdf_url}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline"
                    >
                      {request.pdf_file_name ?? "Ver PDF"}
                    </a>
                  ) : (
                    "No cargado"
                  )}
                </p>
                <p className="break-all"><strong>Pubkey solicitud:</strong> {request.pubkey ?? "-"}</p>
                <p className="break-all"><strong>Signature:</strong> {signature ?? "-"}</p>
                <p><strong>Slot:</strong> {slot ?? "-"}</p>
                <p><strong>Actualizado:</strong> {request.updated_at ? new Date(request.updated_at * 1000).toLocaleString("es-AR") : "-"}</p>
              </div>

              {events.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-primary">Eventos de la transacción</p>
                  {events.map((ev) => (
                    <div key={ev.id} className="rounded-lg border border-gray-200 p-3">
                      <p className="mb-2 text-xs text-gray-500">{ev.event_type} · slot {ev.slot}</p>
                      <pre className="overflow-x-auto rounded-md bg-gray-50 p-2 text-xs text-gray-700">
                        {(() => {
                          try {
                            return JSON.stringify(JSON.parse(ev.data), null, 2);
                          } catch {
                            return ev.data;
                          }
                        })()}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RejectReasonModal({
  title,
  reason,
  onReasonChange,
  onCancel,
  onConfirm,
}: {
  title: string;
  reason: string;
  onReasonChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onCancel}>
      <div
        className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-base font-semibold text-primary">{title}</h3>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Cerrar
          </button>
        </div>
        <div className="space-y-3 px-5 py-4 text-sm text-gray-700">
          <p>Indica un motivo de rechazo para dejar trazabilidad en auditoría.</p>
          <textarea
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
            placeholder="Describe el motivo..."
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={reason.trim().length === 0}
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
            >
              Confirmar rechazo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function IssueCertificationModal({
  request,
  requester,
  requestCountry,
  tokenId,
  carrera,
  plan,
  resolucion,
  anio,
  onTokenIdChange,
  onCarreraChange,
  onPlanChange,
  onResolucionChange,
  onAnioChange,
  onCancel,
  onConfirm,
  busy,
}: {
  request: GraduateRequest;
  requester: Person | null;
  requestCountry: string;
  tokenId: string;
  carrera: string;
  plan: string;
  resolucion: string;
  anio: string;
  onTokenIdChange: (value: string) => void;
  onCarreraChange: (value: string) => void;
  onPlanChange: (value: string) => void;
  onResolucionChange: (value: string) => void;
  onAnioChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onCancel}>
      <div
        className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-base font-semibold text-primary">Emitir y asignar certificación</h3>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Cerrar
          </button>
        </div>
        <div className="space-y-4 px-5 py-4 text-sm text-gray-700">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-1">
            <p><strong>Solicitante:</strong> {displayName(requester)}</p>
            <p><strong>DNI:</strong> {requester?.dni ?? "-"}</p>
            <p className="break-all"><strong>Wallet:</strong> {request.wallet}</p>
            <p><strong>Tipo:</strong> {request.tipo ?? "-"}</p>
            <p><strong>País:</strong> {requestCountry || request.pais || request.titulo_pais || "-"}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              value={tokenId}
              onChange={(e) => onTokenIdChange(e.target.value)}
              placeholder="ID solicitud token (u64)"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              value={anio}
              onChange={(e) => onAnioChange(e.target.value)}
              placeholder="Año egreso"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              value={carrera}
              onChange={(e) => onCarreraChange(e.target.value)}
              placeholder="Carrera"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              value={plan}
              onChange={(e) => onPlanChange(e.target.value)}
              placeholder="Plan"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              value={resolucion}
              onChange={(e) => onResolucionChange(e.target.value)}
              placeholder="Resolución"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
            />
          </div>

          <p className="text-xs text-gray-500">
            Este flujo ejecuta en cadena: solicitar token, aprobar token, acuñar y asignar al titular de la solicitud.
          </p>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
            >
              {busy ? "Procesando..." : "Emitir y asignar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
