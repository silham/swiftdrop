# Demo script (about 15 minutes)

One story from booking to delivery, then the merchant integration and the admin view. Everything runs
on the Docker stack at **http://localhost:8080**. The password for every demo account is `Password123!`.

**Before you start**

- `make up`, then `make ps` until api, web and worker are healthy.
- Open Mailpit (http://localhost:8025) in a second window, and keep it visible.
- Use a normal window for the customer and dispatcher, and a second browser profile (or a private window) for the courier, so both sessions stay signed in.
- Dev login on `/login` is a shortcut; for the demo, sign in with the real form so the session is real.

| Account                   | Role       | Used in step |
| ------------------------- | ---------- | ------------ |
| customer@swiftdrop.test   | Customer   | 2, 5         |
| dispatcher@swiftdrop.test | Dispatcher | 3            |
| courier1@swiftdrop.test   | Courier    | 4            |
| merchant@swiftdrop.test   | Merchant   | 6            |
| admin@swiftdrop.test      | Admin      | 7            |

## 1. Public tracking (1 min)

1. Open `/` and use **Track a parcel**. Enter `SD100000002` (in transit) and `SD100000003` (delivered).
2. Point out: timeline with timestamps, and **no names, phone numbers or addresses** on a public page.
3. Enter a made-up number: a clear "not found" message, no stack trace.

## 2. Customer books a delivery (2 min)

1. Sign in as the customer. Open **Book a delivery**.
2. Fill the form: pickup city `colombo`, drop-off city `kandy`, size Small, weight 1.5 kg. Add the recipient's email so you can show the email later.
3. **Get price**: the fee comes from the server. Confirm with **Confirm booking**.
4. Note the tracking number (`SD…`). Open **View delivery**, then **Download receipt** (PDF).
5. Mailpit: a "booking confirmed" email arrived within seconds (event pipeline: outbox → RabbitMQ → worker).

_Say:_ the booking, its history row and the event are saved in one database transaction. A client-sent fee would be rejected.

## 3. Dispatcher assigns a courier (2 min)

1. In another window sign in as the dispatcher. `/dispatch` shows the new parcel in the queue (oldest first) and the fleet cards.
2. **Assign Courier** → pick **Chamal Courier** (couriers at full capacity are greyed out) → **Confirm Assignment**.
3. The parcel moves to **Active assignments**. Optional: click **Unassign**, show it return to the queue, then assign again.

_Say:_ assigning locks the parcel and courier rows, so two dispatchers can't double-assign. Each change writes an audit entry.

## 4. Courier delivers (3 min)

Use a phone-sized window (375 px wide) or a real phone.

1. Sign in as `courier1`. **My deliveries** shows the parcel as a large card.
2. Open it: the phone number is a `tel:` link and the address opens in maps.
3. Tap **Mark picked up**, then **Mark in transit**, then **Out for delivery**.
   - Switch to the customer's parcel page: the status badge changes **live** and the timeline grows. The customer also got an "out for delivery" email.
4. Tap **Report a problem**, choose _Recipient not available_, add a note. The parcel shows **Delivery failed**.
5. Tap **Re-attempt delivery** (the same courier may try up to three times).
6. Tap **Mark delivered**. Confirm with no photo to show the validation, then choose a photo and **Confirm delivery**.

_Say:_ the proof photo is checked by its content, not its file name, and stored privately; it is only ever streamed to people allowed to see it.

## 5. The result (1 min)

1. Customer's parcel page: **Delivered**, with the **proof of delivery** photo.
2. Public `/track/<number>`: Delivered, timeline including the failed attempt (reason code only).
3. Mailpit: "was delivered" email.
4. Courier: the parcel is in **History** and the workload on the dispatcher's courier card went down.

## 6. Merchant integration (3 min)

1. Sign in as the merchant. **API keys** → **Generate Key** → copy it (shown once).
2. In a terminal:

   ```bash
   curl -i -X POST http://localhost:8080/api/v1/merchant/parcels \
     -H "X-Api-Key: <the key>" -H "Content-Type: application/json" \
     -d '{"merchantReference":"DEMO-1001","senderName":"Lanka Books","senderPhone":"+94771234567",
          "pickupAddress":"123 Galle Road","pickupCity":"colombo","recipientName":"Demo Buyer",
          "recipientPhone":"+94777654321","dropoffAddress":"5 Temple Street","dropoffCity":"kandy",
          "size":"SMALL","weightKg":1.2}'
   ```

   `201` with a tracking number. **Run the same command again: `200` with the same parcel** (idempotent).

3. Change one character of the key: `401`. Show `/merchant/orders`: the order is listed.
4. **Webhooks** → add an endpoint (for example a free https://webhook.site URL) and copy the signing secret. Move the order along as in step 4; each status change is posted, signed with HMAC.
5. Open the endpoint's **delivery attempts**: status codes and timing. Point to the retry schedule (10 s, 1 min, 5 min, then the dead letter queue) in `docs/diagrams/sequences.md`.

## 7. Admin view (2 min)

1. Sign in as the admin. **Reports**: deliveries by status, daily volume, courier performance.
2. **Audit log**: the assignment, unassignment and any zone, key or webhook changes, with who did them. No secrets in the metadata.
3. **Event operations** (`/admin/ops`): outbox, queues and the dead letter queue.
4. **Users**: filter by role and status; disable and re-enable an account.

## Security checks worth showing (2 min)

- As the customer, open `/admin`: you are sent back to `/customer`. Call `/api/v1/admin/users` with the customer's cookie: `403`.
- As `courier2`, open the first courier's parcel URL: **404**, not 403 (we don't confirm that it exists).
- In the browser dev tools delete the `sd_access` cookie and reload: you stay signed in (the session refreshes itself).
- Swagger at http://localhost:8080/api/docs lists every endpoint with its schemas.

## If something goes wrong

- Page won't load: `make ps`, then `make logs s=web` or `s=api`.
- No emails: the worker may still be starting (`make logs s=worker`).
- The queue looks empty: the dev database keeps old demo parcels; use the tracking numbers above or book a new one.
