# Firebase Security Specification & TDD Spec

> **App:** انوار الحسن (ANWAR AL-HASSAN) — pharmacy B2B platform (React 19 + Vite + Firebase).
> Last reviewed: 2026-06-02.

## 1. Data Invariants
- **Authentication**: Users must be authenticated to read or write any business data.
- **Strict User Scoping**: All business records (Inventory, Orders, Sales, Team, Expenses, Payables, Receivables, Audit Log) live safely nested under `/users/{userId}/...` paths.
- **UID Matching**: Any write or read operation under `/users/{userId}` is strictly verified against `request.auth.uid == userId`.
- **Verified Pharmacists**: Where possible, data creation mandates that the token email verification is valid (`request.auth.token.email_verified == true`).
- **Immutable Fields**: Primary identifiers like database IDs (`id`, `invoiceId`) and ownership bounds (`userId`) must remain unchanged on update.
- **Bounded Values**: Numbers like prices, counts, and quantities must be greater than or equal to 0.
- **Settlement Ceiling**: On any debt record (Payable/Receivable), `paidAmount` must be `>= 0` AND `<= amount`. A settlement can never exceed (or go negative against) the original obligation.
- **Append-Only Ledgers**: The Sales Ledger (`salesLedger`), B2B Orders (`b2bOrders`), and the Audit Log (`auditLog`) are financial/legal records. Once written they may **never** be updated or deleted (B2B orders permit a `status`-only transition; sales and audit entries permit nothing).
- **Schema Enforcement at Scale**: Bulk operations (e.g. the full ES-PRO inventory import of ~7,000 items via `writeBatch`) confer **no** elevated trust — every document in a batch is validated independently against its entity schema.

---

## 2. The "Dirty Dozen+" Malicious Payloads
The following payloads simulate malicious cross-tenant, corrupted, or fraudulent writes. The Firestore Security Rules must synchronously reject every single one of these with `PERMISSION_DENIED`.

1. **The Cross-Tenant Hijack**: User `Attacker` attempts to write a User document at path `/users/Victim` representing themselves.
2. **The Inventory Poisoning**: User `Attacker` attempts to add or edit stock at `/users/Victim/inventory/med1`.
3. **The Shadow Field Injection**: User attempts to create an inventory item with an unapproved key like `isCustomAdminApproved: true` to bypass clinical logic.
4. **The Price Inflation Exploitation**: User attempts to set a negative medicine price (`-5000 IQD`).
5. **The Negative Stock Loophole**: User attempts to write an available quantity below zero (`-50 bottles`).
6. **The Immutable Identifier Override**: User attempts to update a medicine ID (`id`) after it has been created to disconnect it from stock tables.
7. **The Arbitrary Order Spoofing**: Attacker attempts to write a fictitious restock invoice `/users/Victim/b2bOrders/order1`.
8. **The Sales Ledger Rewrite**: Client attempts to **update or delete** an existing `salesLedger/{invoiceId}` document to erase or alter a recorded sale. _(Replaces the retired narcotics-registry payload — the controlled-prescription subsystem has been removed from the app.)_
9. **The Resource Exhaustion Attack**: Malicious client attempts to inject a huge 2MB garbage string as a custom document ID.
10. **The Self-Promoting Team Record**: User `Attacker` attempts to register themselves as a `صيدلاني رئيسي` in User `Victim`'s pharmacy team record at `/users/Victim/teamMembers/attacker`.
11. **The Timeless Record Hack**: Client attempts to submit a POS Sales record with a fabricated `timestamp` block pointing to next year, bypassing the server's `request.time` clock.
12. **The Splices and Gaps Attempt**: Pharmacist attempts to update a B2B order and modify the `userId` field to a different owner to escape payment accountability.
13. **The Overpayment Exploit**: User attempts to set `paidAmount > amount` on a Payable or Receivable, fabricating a credit balance or zeroing out a debt without a real transaction.
14. **The Negative Settlement**: User attempts a Payable/Receivable write with `paidAmount: -100000` to artificially inflate the outstanding balance (or generate phantom cash on collection).
15. **The Audit Log Tampering**: User attempts to **update or delete** an existing `auditLog/{entryId}` to cover the tracks of a prior financial action — the audit trail must be strictly append-only.
16. **The Bulk Import Flood**: During the ES-PRO bulk inventory import, the client batches a document that fails `isValidMedicine` (e.g. missing `userId`, negative price) alongside valid ones, assuming high volume bypasses per-doc validation. Every document must still be rejected individually.

---

## 3. Test Cases (TDD Blueprint)
For verification, a complete Firestore Rules test mock-up ensures that under all configurations, cross-tenant, unauthenticated, or fraudulent operations are blocked.

```typescript
// firestore.rules.test.ts mockup outline
describe('ANWAR AL-HASSAN FireStore Security Rules', () => {

  // --- Baseline access control ---
  it('blocks unauthenticated actions across all paths', () => {
    // Assert write/read is denied for anonymous clients
  });

  it('allows owner to fully write & read their private pharmacy store directories', () => {
    // Assert matching request.auth.uid works
  });

  it('rejects cross-tenant read or writing attempts', () => {
    // Auth sub-paths are fully isolated; non-owner write to /users/Victim/inventory/* denied
    // ...even when the payload is a fully valid medicine schema (#2)
  });

  // --- Schema & field integrity ---
  it('rejects shadow/unapproved fields on inventory writes', () => {});
  it('rejects negative price and negative availableQuantity', () => {});
  it('rejects mutation of immutable id / userId fields on update', () => {});

  // --- Append-only ledgers ---
  it('enforces append-only salesLedger (no update, no delete)', () => {});
  it('blocks update and delete on auditLog entries', () => {});
  it('permits ONLY a status transition on b2bOrders update', () => {});

  // --- Debt settlement bounds ---
  it('rejects paidAmount exceeding original amount on payables', () => {});
  it('rejects paidAmount exceeding original amount on receivables', () => {});
  it('rejects negative paidAmount on settlement/collection', () => {});

  // --- Bulk import integrity ---
  it('validates each document in a bulk inventory writeBatch independently', () => {
    // A single invalid medicine in the batch must fail; volume confers no trust
  });
});
```

---

## 4. Covered Collections (Rule Coverage Map)
Every business subcollection under `/users/{userId}/` and its mutability contract:

| Subcollection | Create | Update | Delete | Notes |
|---|---|---|---|---|
| `inventory` | ✅ schema | ✅ scoped fields | ✅ | stock/price OR clinical-metadata field sets only |
| `b2bOrders` | ✅ schema | ✅ `status` only | ❌ | restock invoices are audit records |
| `salesLedger` | ✅ schema | ❌ | ❌ | legally immutable sales |
| `teamMembers` | ✅ schema | ✅ `role`/`license`/`name` | ✅ | roster pruning allowed |
| `expenses` | ✅ schema | ✅ scoped fields | ✅ | operating-expense ledger |
| `payables` | ✅ schema | ✅ settlement fields | ✅ | supplier debts (الذمم الدائنة); `paidAmount <= amount` |
| `receivables` | ✅ schema | ✅ collection fields | ✅ | customer credit (الذمم المدينة); `paidAmount <= amount` |
| `auditLog` | ✅ schema | ❌ | ❌ | append-only financial trail |

> **Removed (2026-06-02):** the `narcoticPrescriptions` subcollection, its `isValidControlledPrescription` helper, and the `isControlled` field on `isValidSaleRecord` have been deleted from `firestore.rules` — the controlled-substance registry no longer exists in the application. Keeping the stale `isControlled` requirement would have rejected **every** POS sale write with `PERMISSION_DENIED`.
