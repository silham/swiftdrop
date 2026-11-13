// Owner: M4. A few demo parcels in different statuses, each with consistent status history.
// SD100000002 is on the road with courier1 (ACTIVE assignment); SD100000003 was delivered by courier1
// (COMPLETED assignment + a proof-of-delivery record, without a photo file in object storage).
import type { ParcelStatus, PrismaClient } from '../src';

const PATHS: Record<string, ParcelStatus[]> = {
  SD100000001: ['CREATED'],
  SD100000002: ['CREATED', 'PICKED_UP', 'IN_TRANSIT'],
  SD100000003: ['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'],
};

export async function seedParcels(prisma: PrismaClient) {
  const customer = await prisma.user.findUniqueOrThrow({
    where: { email: 'customer@swiftdrop.test' },
  });
  const cmb = await prisma.deliveryZone.findUniqueOrThrow({ where: { code: 'CMB' } });
  const kdy = await prisma.deliveryZone.findUniqueOrThrow({ where: { code: 'KDY' } });

  for (const [trackingNumber, path] of Object.entries(PATHS)) {
    const exists = await prisma.parcel.findUnique({ where: { trackingNumber } });
    if (exists) continue;
    const status = path[path.length - 1];
    await prisma.parcel.create({
      data: {
        trackingNumber,
        status,
        customerId: customer.id,
        senderName: 'Nimali Customer',
        senderPhone: '+94770000001',
        pickupAddress: '12 Galle Road',
        pickupCity: 'colombo',
        pickupZoneId: cmb.id,
        recipientName: 'Test Recipient',
        recipientPhone: '+94770000002',
        dropoffAddress: '5 Temple Street',
        dropoffCity: 'kandy',
        dropoffZoneId: kdy.id,
        size: 'SMALL',
        weightKg: 1.5,
        // What the seeded pricing rules give for colombo → kandy, SMALL, 1.5 kg (55000, weight rounds up).
        feeCents: 55000,
        deliveryAttempts: path.filter((s) => s === 'OUT_FOR_DELIVERY').length,
        deliveredAt: status === 'DELIVERED' ? new Date() : null,
        statusHistory: {
          create: path.map((to, i) => ({
            fromStatus: i === 0 ? null : path[i - 1],
            toStatus: to,
            actorRole: 'SYSTEM',
            note: 'seed',
          })),
        },
      },
    });
  }

  await seedAssignments(prisma);
}

/** Courier work for the demo parcels. Safe to re-run: each step skips what already exists. */
async function seedAssignments(prisma: PrismaClient) {
  const courier = await prisma.user.findUniqueOrThrow({
    where: { email: 'courier1@swiftdrop.test' },
  });
  const dispatcher = await prisma.user.findUniqueOrThrow({
    where: { email: 'dispatcher@swiftdrop.test' },
  });

  const inTransit = await prisma.parcel.findUniqueOrThrow({
    where: { trackingNumber: 'SD100000002' },
  });
  const delivered = await prisma.parcel.findUniqueOrThrow({
    where: { trackingNumber: 'SD100000003' },
  });

  if (!(await prisma.courierAssignment.findFirst({ where: { parcelId: inTransit.id } }))) {
    await prisma.courierAssignment.create({
      data: {
        parcelId: inTransit.id,
        courierId: courier.id,
        assignedById: dispatcher.id,
        status: 'ACTIVE',
      },
    });
  }

  if (!(await prisma.courierAssignment.findFirst({ where: { parcelId: delivered.id } }))) {
    await prisma.courierAssignment.create({
      data: {
        parcelId: delivered.id,
        courierId: courier.id,
        assignedById: dispatcher.id,
        status: 'COMPLETED',
        completedAt: delivered.deliveredAt ?? new Date(),
      },
    });
  }

  await prisma.proofOfDelivery.upsert({
    where: { parcelId: delivered.id },
    update: {},
    create: {
      parcelId: delivered.id,
      courierId: courier.id,
      recipientName: 'Test Recipient',
      notes: 'seed',
      // No photo: object storage is not part of the seed, so the photo view shows "not available".
    },
  });
}
