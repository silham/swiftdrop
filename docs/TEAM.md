# Team

Names below were **drafted from the git history** (the author of each member's merged PR). Check
them, add GitHub handles, then replace the `@swiftdrop-mNN` placeholders in `.github/CODEOWNERS`
with the real handles. Branch protection on `main` is a repository setting and still has to be
switched on by an admin. See [report/contributions.md](report/contributions.md) for who did what.

| #   | Role                                    | Brief                                               | Name                                                                             | GitHub |
| --- | --------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------- | ------ |
| M1  | Technical lead & backend foundation     | [M01](members/M01-tech-lead.md)                     | Shakil Ilham                                                                     | …      |
| M2  | Authentication & user management        | [M02](members/M02-auth-users.md)                    | Jisfaaz Ahmed                                                                    | …      |
| M3  | Customer portal & booking               | [M03](members/M03-customer-booking.md)              | Saajid Abdeen                                                                    | …      |
| M4  | Parcel lifecycle & live tracking        | [M04](members/M04-parcel-lifecycle-tracking.md)     | Mishal Safeek                                                                    | …      |
| M5  | Merchant portal & partner API           | [M05](members/M05-merchant-portal-api.md)           | Hashini Fernando                                                                 | …      |
| M6  | Courier application                     | [M06](members/M06-courier-app.md)                   | _No PR from this member; the courier module was built by M1 (see contributions)_ | …      |
| M7  | Dispatch, admin & pricing               | [M07](members/M07-dispatch-admin-pricing.md)        | Rassahi98                                                                        | …      |
| M8  | RabbitMQ, notifications & webhooks      | [M08](members/M08-events-notifications-webhooks.md) | Gishani Nethmini Kirillawala                                                     | …      |
| M9  | Reporting, audit & operational insights | [M09](members/M09-reporting-audit.md)               | Ilha-Sanoon                                                                      | …      |
| M10 | DevOps & quality engineering            | [M10](members/M10-devops-quality.md)                | _No PR from this member; CI, compose and e2e were scaffolded by M1_              | …      |

## Working agreements

- Each morning, post an async update with three lines: yesterday, today, blockers.
- Hold two integration checkpoints a week (suggested Tue + Fri). At each one, `main` must pass `make check` and the demo flow so far must work.
- Demo working software every week. Screenshots alone don't count.
- Raise a blocker within half a day. Don't wait several days for another module.
- Public API and event contracts freeze at the end of Week 2. After that, breaking changes need M1's approval.
