# Firebase Security Specification & TDD Spec

## 1. Data Invariants
- **Authentication**: Users must be authenticated to read or write any business data.
- **Strict User Scoping**: All business records (Inventory, Orders, Sales, Prescriptions, Team) live safely nested under `/users/{userId}/...` paths.
- **UID Matching**: Any write or read operation under `/users/{userId}` is strictly verified against `request.auth.uid == userId`.
- **Verified Pharmacists**: Where possible, data creation mandates that the token email verification is valid (`request.auth.token.email_verified == true`).
- **Immutable Fields**: Primary identifiers like database IDs (`id`, `invoiceId`) and ownership bounds (`userId`) must remain unchanged on update.
- **Bounded Values**: Numbers like prices, counts, and quantities must be greater than or equal to 0.

---

## 2. The "Dirty Dozen" Malicious Payloads
The following payloads simulate malicious cross-tenant or corrupted writes. The Firestore Security Rules must synchronously reject every single one of these with `PERMISSION_DENIED`.

1. **The Cross-Tenant Hijack**: User `Attacker` attempts to write a User document at path `/users/Victim` representing themselves.
2. **The Inventory Poisoning**: User `Attacker` attempts to add or edit stock at `/users/Victim/inventory/med1`.
3. **The Shadow Field Injection**: User attempts to create an inventory item with an unapproved key like `isCustomAdminApproved: true` to bypass clinical logic.
4. **The Price Inflation Exploitation**: User attempts to set a negative medicine price (`-5000 IQD`).
5. **The Negative Stock Loophole**: User attempts to write an available quantity below zero (`-50 bottles`).
6. **The Immutable Identifier Override**: User attempts to update a medicine ID (`id`) after it has been created to disconnect it from stock tables.
7. **The Arbitrary Order Spoofing**: Attacker attempts to write a fictitious restock invoice `/users/Victim/b2bOrders/order1`.
8. **The Unauthorized Narcotic Dispensing**: Unauthenticated API client attempts to register a controlled prescription at `/users/someUser/narcoticPrescriptions/presc1` without authorization headers.
9. **The Resource Exhaustion Attack**: Malicious client attempts to inject a huge 2MB garbage string as a custom document ID.
10. **The Self-Promoting Team Record**: User `Attacker` attempts to register themselves as a `صيدلاني رئيسي` in User `Victim`'s pharmacy team record at `/users/Victim/teamMembers/attacker`.
11. **The Timeless Record Hack**: Client attempts to submit a POS Sales record with a fabricated `timestamp` block pointing to next year, bypassing the server's `request.time` clock.
12. **The Splices and Gaps Attempt**: Pharmacist attempts to update a B2B order and modify the `userId` field to a different owner to escape payment accountability.

---

## 3. Test Cases (TDD Blueprint)
For verification, a complete Firestore Rules test mock-up ensures that under all configurations, cross-tenant or unauthenticated operations are blocked.

```typescript
// firestore.rules.test.ts mockup outline
describe('Capsula Iraq FireStore Security Rules', () => {
  it('blocks unauthenticated actions across all paths', () => {
    // Assert write/read is denied for anonymous clients
  });

  it('allows owner to fully write & read their private pharmacy store directories', () => {
    // Assert matching request.auth.uid works
  });

  it('rejects cross-tenant read or writing attempts', () => {
    // Auth sub-paths are fully isolated
  });
});
```
