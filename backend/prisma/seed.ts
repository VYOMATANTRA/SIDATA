import prisma from '../src/utils/prisma.js';

async function main() {
  console.log('Memulai proses seeding...');

  const roleUser = await prisma.role.upsert({
    where: { name: 'user' },
    update: {},
    create: {
      name: 'user',
    },
  });

  const roleAdmin = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: {
      name: 'admin',
    },
  });

  // Seed sample RT Leaders (RT 01 - RT 05)
  const rt1 = await prisma.rtLeader.upsert({
    where: { rtNumber: 1 },
    update: {},
    create: {
      rtNumber: 1,
      name: 'Bambang Supriyanto',
      phone: '081234567801',
      phoneIsWhatsapp: true,
      alamat: 'Jl. Mulawarman No. 12, RT 01, Manggar',
    },
  });

  const rt2 = await prisma.rtLeader.upsert({
    where: { rtNumber: 2 },
    update: {},
    create: {
      rtNumber: 2,
      name: 'Hj. Siti Aminah',
      phone: '081234567802',
      phoneIsWhatsapp: true,
      alamat: 'Jl. Pemuda RT 02, Manggar',
    },
  });

  const rt3 = await prisma.rtLeader.upsert({
    where: { rtNumber: 3 },
    update: {},
    create: {
      rtNumber: 3,
      name: 'Ahmad Dahlan',
      phone: '081234567803',
      phoneIsWhatsapp: false,
      alamat: 'Jl. Pantai Manggar RT 03',
    },
  });

  // Seed sample Spatial Points (Ketua RT points + Bank Sampah Unit)
  const pointRt1 = await prisma.spatialPoint.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Pos RT 01 Kelurahan Manggar',
      type: 'ketua_rt',
      latitude: -1.2235,
      longitude: 116.9521,
      metadata: {
        keterangan: 'Posyandu dan Sekretariat RT 01',
      },
    },
  });

  await prisma.spatialPointRt.upsert({
    where: {
      pointId_rtNumber: {
        pointId: pointRt1.id,
        rtNumber: 1,
      },
    },
    update: {},
    create: {
      pointId: pointRt1.id,
      rtNumber: 1,
    },
  });

  const pointBankSampah = await prisma.spatialPoint.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'Bank Sampah Sejahtera Manggar',
      type: 'bank_sampah',
      latitude: -1.225,
      longitude: 116.955,
      metadata: {
        jadwal: 'Sabtu & Minggu 09.00 - 15.00 WITA',
        pengelola: 'Ibu Rahmawati',
      },
    },
  });

  // Bank Sampah covers RT 1, RT 2, RT 3
  for (const rtNum of [1, 2, 3]) {
    await prisma.spatialPointRt.upsert({
      where: {
        pointId_rtNumber: {
          pointId: pointBankSampah.id,
          rtNumber: rtNum,
        },
      },
      update: {},
      create: {
        pointId: pointBankSampah.id,
        rtNumber: rtNum,
      },
    });
  }

  console.log('seeding selesai');
  console.log({ roleUser, roleAdmin, sampleRt: [rt1.rtNumber, rt2.rtNumber, rt3.rtNumber] });
}

main()
  .catch((e) => {
    console.error('Error saat seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
