export const ROLE = {
    admin: "ADMIN",
    customer: "CUSTOMER"
}

// ─── Pricing Config ───────────────────────────────────────────────────────────
// Single source of truth for plan pricing.
// NEVER accept price from the frontend — define it here and import everywhere.
export const PLAN_PRICE = 500; // INR
