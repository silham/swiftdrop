# Kubernetes deployment (Helm)

The whole system runs on Kubernetes from one Helm chart in
[`deploy/helm/swiftdrop`](../../deploy/helm/swiftdrop): frontend, API, worker, PostgreSQL, RabbitMQ,
object storage and Mailpit. Owner: M10 (chart by M1).

## What the chart creates

| Assignment requirement | In the chart                                                                                                                                                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ConfigMap**          | `<release>-config`: every non-secret setting (`APP_URL`, TTLs, rate limits, service host names, `LLM_MODEL`…), loaded with `envFrom`                                                                                                                            |
| **Secret**             | `<release>-secrets`: `DATABASE_URL`, `RABBITMQ_URL`, JWT secrets, webhook encryption key, storage key, Google and LLM secrets. Values you leave empty are **generated on first install and kept on upgrade** (`lookup`). Set `existingSecret` to bring your own |
| **Service**            | `api` (4000), `web` (3000), `postgres` (5432), `rabbitmq` (5672/15672), `storage` (9000), `mailpit` (1025/8025)                                                                                                                                                 |
| **Ingress**            | One host. `/api`, `/mcp` and `/.well-known` go to the api; `/` goes to web. Same single origin as the Caddy gateway, so cookies stay same-site and there is no CORS                                                                                             |
| Deployments            | `api` (2 replicas: each one has its own RabbitMQ SSE queue, see ADR-0004), `worker`, `web`, `mailpit`                                                                                                                                                           |
| StatefulSets + PVCs    | `postgres`, `rabbitmq`, `storage`                                                                                                                                                                                                                               |
| Migrations             | Init container in each api pod (`prisma migrate deploy`; Prisma's advisory lock makes parallel starts safe)                                                                                                                                                     |
| Demo data              | `seed` Job as a post-install/upgrade hook (`seed.enabled`)                                                                                                                                                                                                      |

The app pods run as non-root (uid 1000) with no added capabilities, plus readiness and liveness
probes (`/api/v1/health`, the worker's `/health`, the web root). A config change rolls the pods,
because the pod template has a checksum annotation.

## Run it locally (Docker Desktop, kind or minikube)

Prerequisites:

- a cluster: Docker Desktop → Settings → Kubernetes → Enable (kubeadm)
- `helm` (`brew install helm`)
- an ingress controller; Traefik is the default class:

```bash
helm repo add traefik https://traefik.github.io/charts
helm install traefik traefik/traefik -n traefik --create-namespace
```

Then build the images and install the chart:

```bash
make k8s-images          # docker build → swiftdrop/{api,worker,web,migrate}:local
make k8s-lint            # helm lint + kubeconform on every rendered manifest
make k8s-up              # helm upgrade --install swiftdrop … -n swiftdrop
kubectl get pods -n swiftdrop -w
```

Open http://swiftdrop.localhost (`*.localhost` resolves to your machine). Emails:
`kubectl port-forward -n swiftdrop svc/swiftdrop-mailpit 8025`, then open http://localhost:8025.

- **kind / minikube:** load the images first with `kind load docker-image swiftdrop/api:local …` or
  `minikube image load …`.
- **ingress-nginx instead of Traefik:** pass `--set ingress.className=nginx` and add the SSE
  annotations shown in `templates/ingress.yaml`.

## A real cluster

```bash
helm upgrade --install swiftdrop deploy/helm/swiftdrop -n swiftdrop --create-namespace \
  --set image.registry=ghcr.io/<org>/ --set image.tag=<git-sha> \
  --set appUrl=https://swiftdrop.example.com --set ingress.host=swiftdrop.example.com \
  --set 'ingress.tls[0].secretName=swiftdrop-tls' --set 'ingress.tls[0].hosts[0]=swiftdrop.example.com' \
  --set config.COOKIE_SECURE=true --set seed.enabled=false \
  --set config.GOOGLE_CLIENT_ID=… --set secrets.GOOGLE_CLIENT_SECRET=… \
  --set config.LLM_BASE_URL=… --set config.LLM_MODEL=… --set secrets.LLM_API_KEY=…
```

- Push the four images (`docker/Dockerfile` targets `api`, `worker`, `web`, `migrate`) to the registry
  first.
- In Google Cloud Console, add `https://<host>/api/v1/auth/google/callback` as a redirect URI.
- Claude and ChatGPT connect to `https://<host>/mcp` (see [coolify.md](coolify.md#connect-claude-and-chatgpt)).

## Limits (on purpose, for a course project)

- PostgreSQL, RabbitMQ and storage are single replicas. A production setup would use a managed
  database or operators such as CloudNativePG and the RabbitMQ Cluster Operator.
- `make k8s-down` keeps the PVCs. Delete them with `kubectl delete pvc -n swiftdrop --all` only when
  you mean to wipe the data.
- The chart is checked in CI-style with `helm lint` and kubeconform (schema validation for Kubernetes
  1.34). It has not been smoke-tested on a live cluster yet.
