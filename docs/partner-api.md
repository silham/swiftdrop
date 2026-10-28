# SwiftDrop Partner API & Webhooks Guide

Welcome to the SwiftDrop Partner API. This integration guide explains how to authenticate, create and track parcel deliveries, and handle automated real-time status webhooks.

---

## 1. Overview & Base URLs

The Partner API provides automated, high-throughput delivery booking directly from your eCommerce platform, ERP, or warehouse management system.

| Environment | Base URL |
| :--- | :--- |
| **Development / Local** | `http://localhost:8080/api/v1` |
| **Production** | `https://api.swiftdrop.lk/api/v1` |
| **Interactive OpenAPI Docs** | `http://localhost:8080/api/docs` (Tag: `merchant-api`) |

---

## 2. Authentication

All partner endpoints require an API key passed via the **`X-Api-Key`** HTTP header:

```http
X-Api-Key: sd_live_ab12cd34_dGVzdHNlY3JldGtleXZhbHVlMTIzNDU2Nzg5MDEyMzQ1Njc=
```

### Obtaining Your API Key
1. Register for a merchant account at `/merchant-signup`.
2. Once an administrator approves your account, log in at `/login` and navigate to the **API keys** portal (`/merchant/api-keys`).
3. Click **Generate Key**. Your raw key will be shown **only once**. Copy and store it in a secure secrets manager.

### Security Best Practices
- Never commit API keys to version control or expose them in client-side code.
- Keys are strictly rejected if passed in URL query parameters.
- If a key is compromised, revoke it immediately from `/merchant/api-keys` and generate a replacement.

---

## 3. Idempotency with `merchantReference`

Network timeouts and retry policies can cause duplicate order requests. SwiftDrop guarantees **strict idempotency** on `merchantReference`:

- Supply your internal order ID in the `merchantReference` field (e.g. `ORDER-10023`).
- **Initial Request**: SwiftDrop creates the delivery parcel and returns **`201 Created`**.
- **Retry / Duplicate Request**: If a parcel with the same `(merchantId, merchantReference)` already exists, SwiftDrop does not create a duplicate. It returns the existing parcel with **`200 OK`**.

---

## 4. Endpoints Reference

### 4.1 Create Parcel (Idempotent)

Create a delivery order for pickup and dropoff.

- **Method**: `POST`
- **Path**: `/merchant/parcels`
- **Headers**:
  - `Content-Type: application/json`
  - `X-Api-Key: <your-api-key>`

#### Request Body (`MerchantCreateParcelDto`):
```json
{
  "merchantReference": "ORDER-98721",
  "senderName": "Lanka Books Online",
  "senderPhone": "+94771234567",
  "pickupAddress": "123 Galle Road",
  "pickupCity": "colombo",
  "recipientName": "Kamal Perera",
  "recipientPhone": "+94779876543",
  "recipientEmail": "kamal@example.com",
  "dropoffAddress": "45 Peradeniya Road",
  "dropoffCity": "kandy",
  "size": "SMALL",
  "weightKg": 1.5,
  "description": "Hardcover textbooks"
}
```

#### Fields Description:
| Field | Type | Description |
| :--- | :--- | :--- |
| `merchantReference` | `string` | **Required.** Your unique order reference (1–64 characters). |
| `senderName` | `string` | **Required.** Origin contact or business name. |
| `senderPhone` | `string` | **Required.** Valid phone number (e.g. `+94771234567`). |
| `pickupAddress` | `string` | **Required.** Street pickup address. |
| `pickupCity` | `string` | **Required.** Pickup city name. |
| `recipientName` | `string` | **Required.** Destination recipient name. |
| `recipientPhone` | `string` | **Required.** Valid recipient mobile number. |
| `recipientEmail` | `string` | Optional. Email for automated delivery notifications. |
| `dropoffAddress` | `string` | **Required.** Street dropoff address. |
| `dropoffCity` | `string` | **Required.** Destination city name. |
| `size` | `string` | **Required.** `SMALL`, `MEDIUM`, or `LARGE`. |
| `weightKg` | `number` | **Required.** Parcel weight in kilograms (0.01 to 100.0). |
| `description` | `string` | Optional. Brief description of package contents. |

#### cURL Example:
```bash
curl -X POST http://localhost:8080/api/v1/merchant/parcels \
  -H "X-Api-Key: sd_live_ab12cd34_dGVzdHNlY3JldA..." \
  -H "Content-Type: application/json" \
  -d '{
    "merchantReference": "ORDER-98721",
    "senderName": "Lanka Books Online",
    "senderPhone": "+94771234567",
    "pickupAddress": "123 Galle Road",
    "pickupCity": "colombo",
    "recipientName": "Kamal Perera",
    "recipientPhone": "+94779876543",
    "dropoffAddress": "45 Peradeniya Road",
    "dropoffCity": "kandy",
    "size": "SMALL",
    "weightKg": 1.5
  }'
```

#### Response (`201 Created` or `200 OK` on idempotent retry):
```json
{
  "id": "cm3a4b5c60000abcde1234567",
  "trackingNumber": "SD100000001",
  "status": "CREATED",
  "senderName": "Lanka Books Online",
  "pickupAddress": "123 Galle Road",
  "pickupCity": "colombo",
  "recipientName": "Kamal Perera",
  "dropoffAddress": "45 Peradeniya Road",
  "dropoffCity": "kandy",
  "size": "SMALL",
  "weightKg": 1.5,
  "feeCents": 45000,
  "currency": "LKR",
  "createdAt": "2026-10-28T06:00:00.000Z",
  "deliveredAt": null
}
```

---

### 4.2 List Own Parcels

Retrieve a paginated list of deliveries created by your merchant account.

- **Method**: `GET`
- **Path**: `/merchant/parcels?page=1&pageSize=20`
- **Headers**: `X-Api-Key: <your-api-key>`

#### cURL Example:
```bash
curl -X GET "http://localhost:8080/api/v1/merchant/parcels?page=1&pageSize=10" \
  -H "X-Api-Key: sd_live_ab12cd34_dGVzdHNlY3JldA..."
```

#### Response (`200 OK`):
```json
{
  "data": [
    {
      "id": "cm3a4b5c60000abcde1234567",
      "trackingNumber": "SD100000001",
      "status": "IN_TRANSIT",
      "senderName": "Lanka Books Online",
      "pickupAddress": "123 Galle Road",
      "pickupCity": "colombo",
      "recipientName": "Kamal Perera",
      "dropoffAddress": "45 Peradeniya Road",
      "dropoffCity": "kandy",
      "size": "SMALL",
      "weightKg": 1.5,
      "feeCents": 45000,
      "currency": "LKR",
      "createdAt": "2026-10-28T06:00:00.000Z",
      "deliveredAt": null
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 10,
    "total": 42
  }
}
```

---

### 4.3 Get Parcel by Tracking Number

Retrieve full details for an individual parcel.

- **Method**: `GET`
- **Path**: `/merchant/parcels/:trackingNumber`
- **Headers**: `X-Api-Key: <your-api-key>`

#### cURL Example:
```bash
curl -X GET http://localhost:8080/api/v1/merchant/parcels/SD100000001 \
  -H "X-Api-Key: sd_live_ab12cd34_dGVzdHNlY3JldA..."
```

#### Response (`200 OK`):
```json
{
  "id": "cm3a4b5c60000abcde1234567",
  "trackingNumber": "SD100000001",
  "status": "OUT_FOR_DELIVERY",
  "senderName": "Lanka Books Online",
  "pickupAddress": "123 Galle Road",
  "pickupCity": "colombo",
  "recipientName": "Kamal Perera",
  "dropoffAddress": "45 Peradeniya Road",
  "dropoffCity": "kandy",
  "size": "SMALL",
  "weightKg": 1.5,
  "feeCents": 45000,
  "currency": "LKR",
  "createdAt": "2026-10-28T06:00:00.000Z",
  "deliveredAt": null
}
```

*Note: If the parcel does not belong to your merchant account, the API returns `404 Not Found`.*

---

## 5. Standard Error Format

All API errors return standard RFC-compliant JSON bodies:

```json
{
  "error": {
    "code": "INVALID_API_KEY",
    "message": "Missing or invalid API key",
    "details": null,
    "requestId": "req_cm3xyz123"
  }
}
```

| HTTP Status | Error Code | Meaning |
| :--- | :--- | :--- |
| `400 Bad Request` | `BAD_REQUEST` | Validation failed or unexpected payload fields provided (e.g. attempting to pass `merchantId` in request body). |
| `401 Unauthorized` | `INVALID_API_KEY` | Missing, formatted incorrectly, or revoked `X-Api-Key` header. |
| `403 Forbidden` | `MERCHANT_NOT_APPROVED` | Merchant account is `PENDING`, `REJECTED`, or `SUSPENDED`. |
| `404 Not Found` | `NOT_FOUND` | Parcel not found or belongs to another merchant. |
| `429 Too Many Requests` | `THROTTLED` | Rate limit exceeded. |

---

## 6. Webhook Notifications

Configure HTTP endpoints in the **Webhooks** dashboard (`/merchant/webhooks`) to receive live events when parcel statuses update.

### 6.1 Webhook HTTP Headers

Every POST request sent from SwiftDrop to your webhook URL includes:

| Header | Description |
| :--- | :--- |
| `X-SwiftDrop-Event-Id` | Unique ID of the event (use for idempotency deduplication). |
| `X-SwiftDrop-Event-Type` | The event name (e.g. `parcel.status_changed`). |
| `X-SwiftDrop-Signature` | Cryptographic signature formatted as `t=<unix_timestamp>,v1=<hex_hmac>`. |

### 6.2 Sample Webhook Payload
```json
{
  "eventId": "evt_cm3001abc",
  "eventType": "parcel.status_changed",
  "occurredAt": "2026-10-28T06:30:00.000Z",
  "version": 1,
  "data": {
    "parcelId": "cm3a4b5c60000abcde1234567",
    "trackingNumber": "SD100000001",
    "fromStatus": "PICKED_UP",
    "toStatus": "IN_TRANSIT",
    "deliveryAttempts": 0,
    "failureReason": null
  }
}
```

---

## 7. Webhook Signature Verification

To guarantee that webhook payloads originate from SwiftDrop and were not tampered with, verify the **`X-SwiftDrop-Signature`** header using your endpoint's signing secret.

### Verification Algorithm:
1. Extract the timestamp `t` and signature `v1` from `X-SwiftDrop-Signature`.
2. Ensure `t` is within an acceptable time window (e.g., 5 minutes) to prevent replay attacks.
3. Compute the HMAC-SHA256 of `${t}.${rawBody}` using your endpoint's secret.
4. Compare your computed digest with `v1` using constant-time comparison.

### Production Node.js Verification Snippet:
```typescript
import * as crypto from 'crypto';

interface VerifyWebhookOptions {
  /** The raw unparsed request body string or Buffer */
  rawBody: string | Buffer;
  /** Value of the X-SwiftDrop-Signature header */
  signatureHeader: string;
  /** Signing secret provided when creating the webhook */
  secret: string;
  /** Maximum allowable age of the request in seconds (default: 300) */
  toleranceSeconds?: number;
}

export function verifySwiftDropSignature({
  rawBody,
  signatureHeader,
  secret,
  toleranceSeconds = 300,
}: VerifyWebhookOptions): boolean {
  if (!signatureHeader) return false;

  // 1. Parse header: t=<timestamp>,v1=<signature>
  const parts = signatureHeader.split(',');
  const tPart = parts.find((p) => p.startsWith('t='));
  const v1Part = parts.find((p) => p.startsWith('v1='));

  if (!tPart || !v1Part) return false;

  const timestamp = parseInt(tPart.slice(2), 10);
  const signature = v1Part.slice(3);

  if (isNaN(timestamp)) return false;

  // 2. Check tolerance window to prevent replay attacks
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return false;
  }

  // 3. Compute expected HMAC-SHA256 of `${timestamp}.${rawBody}`
  const payloadToSign = `${timestamp}.${typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payloadToSign)
    .digest('hex');

  // 4. Timing-safe comparison
  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  const actualBuf = Buffer.from(signature, 'utf8');

  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
```

### Express / NestJS Usage Example:
```typescript
app.post('/api/webhooks/swiftdrop', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-swiftdrop-signature'] as string;
  const rawBody = req.body;

  const isValid = verifySwiftDropSignature({
    rawBody,
    signatureHeader: signature,
    secret: process.env.SWIFTDROP_WEBHOOK_SECRET!,
  });

  if (!isValid) {
    return res.status(401).send('Invalid signature');
  }

  const event = JSON.parse(rawBody.toString('utf8'));
  console.log('Received valid event:', event.eventType, event.data.trackingNumber);

  return res.status(200).send('OK');
});
```

