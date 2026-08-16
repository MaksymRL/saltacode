/**
 * Seed iniziale per il database Saltacode.
 *
 * Crea:
 * - 4 ruoli: SUPERADMIN, ADMIN, ACCOGLIENZA, OPERATORE
 * - 2 aree: "CAF CISL" (CA) e "Patronato INAS" (PA)
 * - 3 servizi per CAF, 2 per Patronato
 * - 1 SuperAdmin
 * - 1 Admin per CAF, 1 Admin per Patronato
 * - 2 Accoglienza (1 per area)
 * - 4 Operatori (2 per area)
 *
 * Per eseguire:
 *   npm run db:seed
 *   oppure: npx prisma db seed
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const BCRYPT_COST = 10; // più basso per velocizzare il seed in dev

// ── Colori per il terminale ────────────────────────────────────────────────
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

async function hash(password: string) {
  return bcrypt.hash(password, BCRYPT_COST);
}

async function main() {
  console.log(bold('\n🌱 Saltacode Seed — avvio\n'));

  // ── 1. Ruoli ──────────────────────────────────────────────────────────────
  const ruoliData = ['SUPERADMIN', 'ADMIN', 'ACCOGLIENZA', 'OPERATORE'];
  const ruoli: Record<string, { id: number; nome: string }> = {};

  for (const nome of ruoliData) {
    const r = await prisma.ruolo.upsert({
      where: { nome },
      update: {},
      create: { nome },
    });
    ruoli[nome] = r;
  }
  console.log(green('✅ Ruoli:'), ruoliData.join(', '));

  // ── 2. Aree ───────────────────────────────────────────────────────────────
  const areaCaf = await prisma.area.upsert({
    where: { prefisso: 'CA' },
    update: {},
    create: { nome: 'CAF CISL', prefisso: 'CA', attiva: true },
  });

  const areaPatronato = await prisma.area.upsert({
    where: { prefisso: 'PA' },
    update: {},
    create: { nome: 'Patronato INAS', prefisso: 'PA', attiva: true },
  });

  console.log(green('✅ Aree:'), `${areaCaf.nome} (${areaCaf.prefisso}), ${areaPatronato.nome} (${areaPatronato.prefisso})`);

  // ── 3. Servizi ────────────────────────────────────────────────────────────
  const serviziCaf = [
    { nome: '730 / Dichiarazione dei Redditi', lettera: 'A' },
    { nome: 'ISEE / Dichiarazione Patrimoniale', lettera: 'B' },
    { nome: 'IMU / Tributi Locali', lettera: 'C' },
  ];

  const serviziPatronato = [
    { nome: 'Pensione / Pratiche INPS', lettera: 'A' },
    { nome: 'Invalidità / Disabilità', lettera: 'B' },
  ];

  for (const s of serviziCaf) {
    await prisma.servizio.upsert({
      where: { areaId_lettera: { areaId: areaCaf.id, lettera: s.lettera } },
      update: {},
      create: { areaId: areaCaf.id, nome: s.nome, lettera: s.lettera, attivo: true },
    });
  }

  for (const s of serviziPatronato) {
    await prisma.servizio.upsert({
      where: { areaId_lettera: { areaId: areaPatronato.id, lettera: s.lettera } },
      update: {},
      create: { areaId: areaPatronato.id, nome: s.nome, lettera: s.lettera, attivo: true },
    });
  }

  console.log(green('✅ Servizi CAF:'), serviziCaf.map(s => `${areaCaf.prefisso}${s.lettera} - ${s.nome}`).join(', '));
  console.log(green('✅ Servizi Patronato:'), serviziPatronato.map(s => `${areaPatronato.prefisso}${s.lettera} - ${s.nome}`).join(', '));

  // ── 4. Utenti ─────────────────────────────────────────────────────────────
  // ruoli è un array: un utente può avere più ruoli
  const utenti = [
    {
      username: 'superadmin', cognome: 'Admin', nome: 'Super',
      password: 'Admin@Saltacode1',
      ruoli: ['SUPERADMIN'],
      aree: [areaCaf.id, areaPatronato.id],
    },
    {
      username: 'amrossi', cognome: 'Rossi', nome: 'Anna Maria',
      password: 'Admin@CafCisl1',
      ruoli: ['ADMIN'],
      aree: [areaCaf.id],
    },
    {
      username: 'gbianchi', cognome: 'Bianchi', nome: 'Giuseppe',
      password: 'Admin@Patronato1',
      ruoli: ['ADMIN'],
      aree: [areaPatronato.id],
    },
    {
      username: 'lverdi', cognome: 'Verdi', nome: 'Laura',
      password: 'Accoglienza@1!',
      ruoli: ['ACCOGLIENZA'],
      aree: [areaCaf.id],
    },
    {
      username: 'mferrari', cognome: 'Ferrari', nome: 'Marco',
      password: 'Accoglienza@2!',
      ruoli: ['ACCOGLIENZA'],
      aree: [areaPatronato.id],
    },
    {
      username: 'frusso', cognome: 'Russo', nome: 'Francesca',
      password: 'Operatore@1!',
      ruoli: ['OPERATORE'],
      aree: [areaCaf.id],
    },
    {
      username: 'pconti', cognome: 'Conti', nome: 'Paolo',
      password: 'Operatore@2!',
      ruoli: ['OPERATORE'],
      aree: [areaCaf.id],
    },
    {
      username: 'sricci', cognome: 'Ricci', nome: 'Sara',
      password: 'Operatore@3!',
      ruoli: ['OPERATORE'],
      aree: [areaPatronato.id],
    },
    {
      username: 'aesposito', cognome: 'Esposito', nome: 'Antonio',
      password: 'Operatore@4!',
      ruoli: ['OPERATORE'],
      aree: [areaPatronato.id],
    },
    // Utente multi-ruolo di esempio: Admin CAF che può anche fare l'Operatore
    {
      username: 'multitest', cognome: 'Test', nome: 'Multi',
      password: 'MultiRuolo@1!',
      ruoli: ['ADMIN', 'OPERATORE', 'ACCOGLIENZA'],
      aree: [areaCaf.id],
    },
  ];

  console.log('\n' + bold('👤 Utenti creati:'));

  for (const u of utenti) {
    const passwordHash = await hash(u.password);

    const ruoliDB = await prisma.ruolo.findMany({ where: { nome: { in: u.ruoli } } });

    const utente = await prisma.utente.upsert({
      where: { username: u.username },
      update: {},
      create: {
        username: u.username,
        cognome: u.cognome,
        nome: u.nome,
        passwordHash,
        mustChangePwd: true,
        stato: 'ATTIVO',
        utentiRuoli: {
          create: ruoliDB.map((r) => ({ ruoloId: r.id })),
        },
        utentiAree: {
          create: u.aree.map((areaId) => ({ areaId })),
        },
      },
    });

    const areeNomi = u.aree
      .map((id) => id === areaCaf.id ? areaCaf.nome : areaPatronato.nome)
      .join(', ');

    console.log(
      `  ${green('•')} ${bold(utente.username.padEnd(14))}` +
      ` ${yellow(u.ruoli.join('+').padEnd(20))}` +
      ` pwd: ${bold(u.password)}` +
      `  [${areeNomi}]`
    );
  }

  // ── Riepilogo finale ──────────────────────────────────────────────────────
  console.log('\n' + bold('═══════════════════════════════════════════════════'));
  console.log(bold('🎉 Seed completato! Credenziali di accesso:'));
  console.log(bold('═══════════════════════════════════════════════════'));

  const rows = [
    ['Ruoli', 'Username', 'Password', 'Area'],
    ['---', '---', '---', '---'],
    ['SUPERADMIN', 'superadmin', 'Admin@Saltacode1', 'Tutte'],
    ['ADMIN', 'amrossi', 'Admin@CafCisl1', 'CAF CISL'],
    ['ADMIN', 'gbianchi', 'Admin@Patronato1', 'Patronato INAS'],
    ['ACCOGLIENZA', 'lverdi', 'Accoglienza@1!', 'CAF CISL'],
    ['ACCOGLIENZA', 'mferrari', 'Accoglienza@2!', 'Patronato INAS'],
    ['OPERATORE', 'frusso', 'Operatore@1!', 'CAF CISL'],
    ['OPERATORE', 'pconti', 'Operatore@2!', 'CAF CISL'],
    ['OPERATORE', 'sricci', 'Operatore@3!', 'Patronato INAS'],
    ['OPERATORE', 'aesposito', 'Operatore@4!', 'Patronato INAS'],
    ['ADMIN+OP+ACC (multi)', 'multitest', 'MultiRuolo@1!', 'CAF CISL'],
  ];

  for (const row of rows) {
    console.log(
      `  ${row[0]!.padEnd(14)} ${row[1]!.padEnd(14)} ${row[2]!.padEnd(20)} ${row[3]!}`
    );
  }

  console.log('\n' + yellow('⚠️  Tutti gli utenti devono cambiare la password al primo accesso.'));
  console.log(bold('═══════════════════════════════════════════════════\n'));
}

main()
  .catch((e) => {
    console.error('\n❌ Seed fallito:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
