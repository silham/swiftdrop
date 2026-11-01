// Owner: M7. Demo zones, pricing rules, and courier profiles (fees in LKR cents).
import type { PrismaClient } from '../src';

const ZONES = [
  { code: 'CMB', name: 'Colombo', cities: ['colombo', 'dehiwala', 'mount lavinia', 'kotte'] },
  { code: 'GMP', name: 'Gampaha', cities: ['gampaha', 'negombo', 'ja-ela', 'kadawatha'] },
  { code: 'KDY', name: 'Kandy', cities: ['kandy', 'peradeniya', 'katugastota'] },
  { code: 'GAL', name: 'Galle', cities: ['galle', 'hikkaduwa', 'unawatuna'] },
];

export async function seedZonesAndPricing(prisma: PrismaClient) {
  for (const z of ZONES) {
    await prisma.deliveryZone.upsert({ where: { code: z.code }, update: {}, create: z });
  }

  const count = await prisma.pricingRule.count();
  if (count === 0) {
    const cmb = await prisma.deliveryZone.findUniqueOrThrow({ where: { code: 'CMB' } });
    await prisma.pricingRule.createMany({
      data: [
        { name: 'Island-wide default', baseFeeCents: 45000, perKgCents: 5000, priority: 0 },
        {
          name: 'Within Colombo',
          fromZoneId: cmb.id,
          toZoneId: cmb.id,
          baseFeeCents: 30000,
          perKgCents: 3000,
          priority: 10,
        },
        {
          name: 'Large parcel surcharge',
          size: 'LARGE',
          baseFeeCents: 80000,
          perKgCents: 6000,
          priority: 5,
        },
      ],
    });
  }

  // Ensure demo couriers have active courier profiles
  const cmbZone = await prisma.deliveryZone.findUnique({ where: { code: 'CMB' } });
  const gmpZone = await prisma.deliveryZone.findUnique({ where: { code: 'GMP' } });
  const couriers = await prisma.user.findMany({ where: { role: 'COURIER' } });

  for (const c of couriers) {
    const zoneId = c.email === 'courier2@swiftdrop.test' ? gmpZone?.id : cmbZone?.id;
    await prisma.courierProfile.upsert({
      where: { userId: c.id },
      update: {},
      create: {
        userId: c.id,
        zoneId: zoneId ?? null,
        vehicleType: 'Motorcycle',
        isAvailable: true,
        maxActiveParcels: 15,
      },
    });
  }
}
