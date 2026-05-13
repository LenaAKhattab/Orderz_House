<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the Orderz House backend. The `posthog-node` SDK was installed and a singleton client module was created at `src/config/posthog.js`. Event capture, user identification, and exception tracking were added across six files covering the full user lifecycle — from registration through order completion and financial claims. The global error middleware now captures all 5xx exceptions automatically.

| Event | Description | File |
|---|---|---|
| `signup_completed` | User verifies OTP and account is activated | `src/controllers/authController.js` |
| `user_logged_in` | User successfully logs in | `src/controllers/authController.js` |
| `client_order_created` | Client creates a new order (fixed or bidding) | `src/controllers/clientOrdersController.js` |
| `bid_approved` | Client accepts a freelancer bid and initiates payment | `src/controllers/clientOrdersController.js` |
| `order_completed` | Client approves a delivery — order is done | `src/controllers/clientOrdersController.js` |
| `delivery_revision_requested` | Client requests a revision on a submitted delivery | `src/controllers/clientOrdersController.js` |
| `fixed_order_taken` | Freelancer claims a fixed-price pool order | `src/controllers/ordersController.js` |
| `bid_submitted` | Freelancer submits a bid on a bidding order | `src/controllers/ordersController.js` |
| `order_delivered` | Freelancer submits a delivery for an assigned order | `src/controllers/ordersController.js` |
| `subscription_purchased` | Stripe webhook confirms freelancer subscription payment | `src/controllers/stripeWebhookController.js` |
| `first_subscription_started` | Freelancer's first subscription activates on bid payment | `src/controllers/stripeWebhookController.js` |
| `financial_claim_submitted` | Freelancer submits a financial claim for a completed project | `src/controllers/portalFinancialClaimsController.js` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics**: https://us.posthog.com/project/416521/dashboard/1563707
- **Signups over time**: https://us.posthog.com/project/416521/insights/zDdSXRbQ
- **Order creation to completion funnel**: https://us.posthog.com/project/416521/insights/TyROkDVz
- **Bid submission to approval funnel**: https://us.posthog.com/project/416521/insights/rCiq1GCs
- **Subscription purchases over time**: https://us.posthog.com/project/416521/insights/4H9jOVi5
- **Key business events trend**: https://us.posthog.com/project/416521/insights/gMHgrdYd

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
