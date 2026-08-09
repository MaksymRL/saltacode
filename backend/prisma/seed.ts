/**
 * Seed iniziale per il database Saltacode.
 *
 * Crea:
 * - 4 ruoli: SUPERADMIN, ADMIN, ACCOGLIENZA, OPERATORE
 * - 1 area di esempio: "CAF CISL" con prefisso "CA"
 * - 1 utente SUPERADMIN con credenziali di default
 * - 2 servizi di esempio
 *
 * Per eseguire:
 *   npx prisma db seed
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const BCRYPT_COST = 12;

async function main() {
  console.log('🌱 Starting seed...');

  // ─── Ruoli ───────────────────────────────────────────────────────────────
  const ruoli = await Promise.all(
    ['SUPERADMIN', 'ADMIN', 'ACCOGLIENZA', 'OPERATORE'].map((nome) =>
      prisma.ruolo.upsert({
        where: { nome },
        update: {},
        create: { nome },
      })
    )
  );

  const ruoloMap = new Map(ruoli.map((r) => [r.nome, r]));
  console.log('✅ Ruoli creati:', ruoli.map((r) => r.nome).join(', '));

  // ─── Area di esempio ─────────────────────────────────────────────────────
  const areaCaf = await prisma.area.upsert({
    where: { prefisso: 'CA' },
    update: {},
    create: {
      nome: 'CAF CISL',
      prefisso: 'CA',
      attiva: true,
    },
  });
  console.log(`✅ Area creata: ${areaCaf.nome} (${areaCaf.prefisso})`);

  // ─── Servizi di esempio ──────────────────────────────────────────────────
  const servizio1 = await prisma.servizio.upsert({
    where: { areaId_lettera: { areaId: areaCaf.id, lettera: 'A' } },
    update: {},
    create: {
      areaId: areaCaf.id,
      nome: '730 / Dichiarazione dei Redditi',
      lettera: 'A',
      attivo: true,
    },
  });

  const servizio2 = await prisma.servizio.upsert({
    where: { areaId_lettera: { areaId: areaCaf.id, lettera: 'B' } },
    update: {},
    create: {
      areaId: areaCaf.id,
      nome: 'ISEE / Dichiarazione Patrimoniale',
      lettera: 'B',
      attivo: true,
    },
  });

  console.log(`✅ Servizi creati: ${servizio1.nome}, ${servizio2.nome}`);

  // ─── SuperAdmin ──────────────────────────────────────────────────────────
  const superAdminPassword = 'Admin@Saltacode1';
  const passwordHash = await bcrypt.hash(superAdminPassword, BCRYPT_COST);

  const superAdmin = await prisma.utente.upsert({
    where: { username: 'superadmin' },
    update: {},
    create: {
      username: 'superadmin',
      cognome: 'Admin',
      nome: 'Super',
      passwordHash,
      ruoloId: ruoloMap.get('SUPERADMIN')!.id,
      mustChangePwd: true,
      utentiAree: {
        create: [{ areaId: areaCaf.id }],
      },
    },
  });

  console.log(`✅ SuperAdmin creato: username="${superAdmin.username}" password="${superAdminPassword}"`);

  // ─── Utente Admin di esempio ─────────────────────────────────────────────
  const adminPassword = 'Admin@12345!';
  const adminHash = await bcrypt.hash(adminPassword, BCRYPT_COST);

  const adminUtente = await prisma.utente.upsert({
    where: { username: 'amrossi' },
    update: {},
    create: {
      username: 'amrossi',
      cognome: 'Rossi',
      nome: 'Anna Maria',
      passwordHash: adminHash,
      ruoloId: ruoloMap.get('ADMIN')!.id,
      mustChangePwd: true,
      utentiAree: {
        create: [{ areaId: areaCaf.id }],
      },
    },
  });

  console.log(`✅ Admin creato: username="${adminUtente.username}" password="${adminPassword}"`);

  console.log('\n🎉 Seed completato con successo!');
  console.log('\n📋 Credenziali di accesso:');
  console.log(`   SuperAdmin → username: superadmin  password: ${superAdminPassword}`);
  console.log(`   Admin      → username: amrossi     password: ${adminPassword}`);
  console.log('\n⚠️  Cambiare le password al primo accesso!');
}

main()
  .catch((e) => {
    console.error('❌ Seed fallito:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
