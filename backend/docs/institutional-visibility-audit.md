# Institutional order visibility audit

Audit date: follow-up phase (Institutional Order Storage).

## Intentional integration points

| Surface | Path / service | Behavior |
|---|---|---|
| Private institution pool | `GET /api/institution/orders/pool` | Members only; `visibility_scope='institution'` + storage membership |
| Membership probe | `GET /api/institution/membership` | Used for nav gating |
| Direct order detail / claim / bid | `poolOrderResolveService`, `ordersService` claim/bid | Membership check for institution scope |
| Admin institutional storage | `/api/admin/institutional-order-storage/*` | Staff + storage permissions |
| Admin institutions | `/api/admin/institutions/*` | Staff + institutions permission |
| Admin internal orders console | `listAdminInternalOrders` | Staff-gated; may include institutional releases for ops |
| Financial center payments | `financialCenterService` | Finance permission; includes paid institutional orders |
| Super-admin analytics | business metrics / dashboard intelligence | Staff-gated aggregates |

## Public / freelancer surfaces — protected

| Surface | Protection |
|---|---|
| Public marketplace list | `COALESCE(visibility_scope,'public')='public'` |
| Merged training+real pool | same filter on real branch |
| Homepage `available_real` | public scope filter |
| Homepage open/in-progress/completed aggregates | public scope filter (fixed this phase) |
| Freelancer marketplace count summary | public scope filter (fixed this phase) |
| Notifications / SSE | recipient-scoped only; no public order broadcast |
| Sitemap / SEO order endpoints | none found that list orders |

## Rules

- Institution-scoped orders must **not** appear in the normal public marketplace.
- After release they appear in the private institution pool and authorized admin/ops pages only.
- Removing institution membership immediately drops pool access on subsequent requests (`status='inactive'`).
