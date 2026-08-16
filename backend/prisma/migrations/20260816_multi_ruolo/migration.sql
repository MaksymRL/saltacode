-- Migration: multi_ruolo
-- Descrizione: Sostituisce il campo ruoloId (singolo) su Utente con la tabella
--              utenti_ruoli (many-to-many), permettendo a un utente di avere più ruoli.

-- ── 1. Crea la nuova tabella di join ────────────────────────────────────────
CREATE TABLE "utenti_ruoli" (
    "id"        SERIAL PRIMARY KEY,
    "utenteId"  INTEGER NOT NULL,
    "ruoloId"   INTEGER NOT NULL,
    CONSTRAINT "utenti_ruoli_utenteId_fkey"
        FOREIGN KEY ("utenteId") REFERENCES "utenti"("id") ON DELETE CASCADE,
    CONSTRAINT "utenti_ruoli_ruoloId_fkey"
        FOREIGN KEY ("ruoloId") REFERENCES "ruoli"("id"),
    CONSTRAINT "utenti_ruoli_utenteId_ruoloId_key"
        UNIQUE ("utenteId", "ruoloId")
);

-- ── 2. Migra i ruoli esistenti ───────────────────────────────────────────────
-- Copia il ruolo attuale di ogni utente nella nuova tabella
INSERT INTO "utenti_ruoli" ("utenteId", "ruoloId")
SELECT "id", "ruoloId"
FROM "utenti"
WHERE "ruoloId" IS NOT NULL;

-- ── 3. Rimuovi il vecchio campo ruoloId da utenti ───────────────────────────
ALTER TABLE "utenti"
    DROP CONSTRAINT IF EXISTS "utenti_ruoloId_fkey",
    DROP COLUMN IF EXISTS "ruoloId";

-- ── 4. Aggiorna CASCADE su utenti_aree (già esistente) ──────────────────────
-- Prisma lo gestisce tramite schema, ma assicuriamoci che esista
ALTER TABLE "utenti_aree"
    DROP CONSTRAINT IF EXISTS "utenti_aree_utenteId_fkey";
ALTER TABLE "utenti_aree"
    ADD CONSTRAINT "utenti_aree_utenteId_fkey"
        FOREIGN KEY ("utenteId") REFERENCES "utenti"("id") ON DELETE CASCADE;

-- ── 5. Aggiorna Ruolo: rimuovi la relazione diretta utenti (non più necessaria) ──
-- La tabella ruoli rimane invariata; la relazione passa per utenti_ruoli.
-- Nessuna modifica alla tabella ruoli.
