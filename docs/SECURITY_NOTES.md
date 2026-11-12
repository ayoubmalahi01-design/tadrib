# Security model and verification notes

- The platform-owner account is bootstrapped only when the Auth email is `ayoubmalleh772@gmail.com`; it has no institution id.
- Institution data is scoped by `current_institution_id()` and RLS.
- Coach daily reports are readable by their owner coach and institution administration only.
- Coach notebook rows require `coach_id = auth.uid()` for all operations.
- Medical records are restricted to institution administration.
- Profile role, institution, and account status cannot be changed by the account owner itself; a trigger enforces privilege changes.
- Finalized daily reports cannot be updated or deleted.
- Audit snapshots are written by a database trigger.
- Private media is stored in private buckets; object paths begin with institution UUID / uploader UUID.
- Invitation uses a Supabase Edge Function. The service-role key must never be shipped to the browser.

## Important deployment caveats

1. The SQL file is intended for a fresh, dedicated Supabase project and is a one-time setup, not a migration for an existing database.
2. Run the SQL in a disposable Supabase project first and review the resulting policies before production data is entered.
3. Validate the owner bootstrap by inviting the exact owner email after the SQL trigger is installed.
4. Validate manager/admin/coach invitations with separate test users. Confirm a coach cannot select another coach's report or notebook using direct API requests.
5. Validate tenant isolation with two institutions and separate accounts.
6. The app currently provides text messages, file/image attachments, and browser audio recording. Push notification delivery is not implemented. Dictation uses the browser Web Speech API where supported and is not guaranteed on every device/browser.
7. A frontend build is not proof of backend security. Supabase RLS tests and real-device checks remain mandatory before production use.
- Platform-owner audit visibility is limited to institution-level audit events; it does not grant platform-wide access to student, medical, daily-report, or private-notebook content. Institution admins can read audit events for their own institution.
- Audit snapshots redact medical details, student free-text notes, report free-text notes, and student guardian contact/date-of-birth fields. Private coach notebook entries are not copied into audit snapshots.
- Medical attachments use a separate private `trainer-medical` bucket, not the shared chat-media bucket.
