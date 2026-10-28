/**
 * Dev helper for demos (M8): a merchant webhook receiver that logs what SwiftDrop sends and checks
 * the signature. Add `?status=503` to the endpoint URL to simulate a failing merchant
 * (retries → DEAD), `?status=410` for a permanent 4xx (FAILED, no retry).
 *
 *   docker compose exec api pnpm exec tsx ../worker/scripts/webhook-echo.ts
 *   # endpoint URL (from other containers): http://api:4200/hook
 */
/* eslint-disable no-console */
import { createServer } from 'node:http';
import { verifySignature } from '../src/consumers/webhooks/signature';

const PORT = Number(process.env.ECHO_PORT ?? 4200);
const SECRET = process.env.DEMO_WEBHOOK_SECRET ?? 'whsec_demo';

createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString();
    const url = new URL(req.url ?? '/', 'http://echo');
    const status = Number(url.searchParams.get('status') ?? 200);
    const signature = String(req.headers['x-swiftdrop-signature'] ?? '');
    let summary = '(unparseable body)';
    try {
      const event = JSON.parse(body);
      summary = `${event.eventType} parcel=${event.data?.trackingNumber} status=${event.data?.newStatus ?? '-'}`;
    } catch {
      // keep the placeholder
    }
    console.log(
      `[echo] ${new Date().toISOString()} event=${req.headers['x-swiftdrop-event-id']} ${summary} ` +
        `signature=${verifySignature([SECRET], body, signature) ? 'VALID' : 'INVALID'} -> ${status}`,
    );
    res.statusCode = status;
    res.end();
  });
}).listen(PORT, () => console.log(`[echo] listening on :${PORT} (secret "${SECRET}")`));
