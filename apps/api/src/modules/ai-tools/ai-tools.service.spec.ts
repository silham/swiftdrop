import { HttpStatus } from '@nestjs/common';
import type { Role } from '@swiftdrop/contracts';
import { AppError } from '../../common/errors/app-error';
import { AiToolsService, formatMoney } from './ai-tools.service';

const user = (role: Role) => ({ id: `u-${role}`, email: `${role}@x.test`, role });

describe('AiToolsService (unit)', () => {
  const parcels = {
    getPublicTracking: jest.fn(),
    findByTrackingNumber: jest.fn(),
  };
  const pricing = { estimate: jest.fn(), listZones: jest.fn() };
  const bookings = { listMine: jest.fn(), getMine: jest.fn(), create: jest.fn() };
  const courier = { listAssigned: jest.fn(), updateStatus: jest.fn() };
  const svc = new AiToolsService(
    parcels as never,
    pricing as never,
    bookings as never,
    {} as never,
    courier as never,
    {} as never,
    {} as never,
  );
  const names = (role: Role | null) => svc.toolsFor(role ? user(role) : null).map((t) => t.name);

  beforeEach(() => jest.clearAllMocks());

  it('gives anonymous callers only the public tools', () => {
    expect(names(null).sort()).toEqual(['estimate_fee', 'list_service_areas', 'track_parcel']);
  });

  it.each<[Role, string[], string[]]>([
    ['CUSTOMER', ['book_delivery', 'get_my_parcel'], ['assign_parcel', 'list_my_deliveries']],
    ['MERCHANT', ['list_my_orders'], ['book_delivery', 'courier_workload']],
    ['COURIER', ['update_delivery_status'], ['list_my_parcels', 'assign_parcel']],
    ['DISPATCHER', ['assign_parcel', 'delivery_report'], ['book_delivery']],
    ['ADMIN', ['courier_workload'], ['update_delivery_status']],
  ])('%s gets its own tools and not others', (role, has, hasNot) => {
    const list = names(role);
    expect(list).toEqual(expect.arrayContaining([...has, 'track_parcel']));
    for (const n of hasNot) expect(list).not.toContain(n);
  });

  it('refuses a tool the role does not have, without running it', async () => {
    const out = await svc.execute('update_delivery_status', {}, user('CUSTOMER'));
    expect(out).toEqual({ ok: false, text: 'Unknown tool: update_delivery_status' });
    expect(courier.updateStatus).not.toHaveBeenCalled();
  });

  it('reports invalid input per field', async () => {
    const out = await svc.execute('track_parcel', { trackingNumber: 'x' }, null);
    expect(out.ok).toBe(false);
    expect(out.text).toContain('trackingNumber');
  });

  it('normalises the tracking number before calling the service', async () => {
    parcels.getPublicTracking.mockResolvedValue({ status: 'CREATED' });
    const out = await svc.execute('track_parcel', { trackingNumber: ' sd100000001 ' }, null);
    expect(parcels.getPublicTracking).toHaveBeenCalledWith('SD100000001');
    expect(out).toMatchObject({ ok: true, data: { status: 'CREATED' } });
  });

  it('passes business errors through and hides unexpected ones', async () => {
    parcels.getPublicTracking.mockRejectedValueOnce(
      new AppError('NOT_FOUND', 'Parcel not found', HttpStatus.NOT_FOUND),
    );
    expect(await svc.execute('track_parcel', { trackingNumber: 'SD100000009' }, null)).toEqual({
      ok: false,
      text: 'Parcel not found',
    });
    parcels.getPublicTracking.mockRejectedValueOnce(new Error('connection string with password'));
    const hidden = await svc.execute('track_parcel', { trackingNumber: 'SD100000009' }, null);
    expect(hidden.ok).toBe(false);
    expect(hidden.text).not.toContain('password');
  });

  it('validates write tools with the endpoint DTO before calling the service', async () => {
    const out = await svc.execute(
      'book_delivery',
      {
        senderName: 'A',
        senderPhone: 'not-a-phone',
        pickupAddress: 'x',
        pickupCity: 'colombo',
        recipientName: 'B',
        recipientPhone: '+94770000000',
        dropoffAddress: '12 Road',
        dropoffCity: 'kandy',
        size: 'SMALL',
        weightKg: 1,
      },
      user('CUSTOMER'),
    );
    expect(out.ok).toBe(false);
    expect(out.text).toMatch(/senderName|senderPhone|pickupAddress/);
    expect(bookings.create).not.toHaveBeenCalled();
  });

  it('looks up the parcel and lets the courier service enforce ownership', async () => {
    parcels.findByTrackingNumber.mockResolvedValue({ id: 'p1' });
    courier.updateStatus.mockResolvedValue({ status: 'PICKED_UP' });
    const u = user('COURIER');
    const out = await svc.execute(
      'update_delivery_status',
      { trackingNumber: 'SD100000002', status: 'PICKED_UP' },
      u,
    );
    expect(out.ok).toBe(true);
    expect(courier.updateStatus).toHaveBeenCalledWith(
      u,
      'p1',
      expect.objectContaining({ status: 'PICKED_UP' }),
    );
  });

  it('only lists active zones for service areas', async () => {
    pricing.listZones.mockResolvedValue([
      { name: 'Western', cities: ['colombo'], isActive: true },
      { name: 'Closed', cities: ['nowhere'], isActive: false },
    ]);
    const out = await svc.execute('list_service_areas', {}, null);
    expect(out.data).toEqual([{ zone: 'Western', cities: ['colombo'] }]);
  });

  it('formats money from cents', () => {
    expect(formatMoney(55000, 'LKR')).toBe('LKR 550.00');
  });
});
