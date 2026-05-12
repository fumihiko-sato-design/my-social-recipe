# Security Specification for My Social Recipe

## 1. Data Invariants
- A link must have a valid URL.
- A link must belong to a specific user (`userId`).
- Users can only read, update, or delete their own links.
- `createdAt` and `userId` are immutable after creation.
- `updatedAt` must be updated to the server time on every update.

## 2. The "Dirty Dozen" Payloads (Denial Tests)
1. **Identity Spoof**: Create a link with someone else's `userId`.
2. **Missing Auth**: Try to read/write without being logged in.
3. **Malicious ID**: Attempt to use a 2KB string as a document ID.
4. **Field Injection**: Add an `isVerified: true` field to a link document.
5. **PII Leak**: Attempt to list all links without a `userId` filter.
6. **Immutable Break**: Attempt to change the `userId` of an existing link.
7. **Type Poisoning**: Send `createdAt` as a boolean instead of a timestamp.
8. **Size Attack**: Send a `notes` field that is 2MB in size.
9. **Orphaned Link**: Create a link with an empty `url`.
10. **State Shortcut**: Attempt to set `updatedAt` to a future date from the client.
11. **Cross-User Delete**: Attempt to delete another user's link by knowing its ID.
12. **Bypass Validation**: Attempt to create a link with missing required fields.

## 3. Test Runner (Mock)
(The actual test runner would be in `firestore.rules.test.ts`, but we'll focus on the rules implementation first).
