# Additive text-only planning import

The existing JSON export uses UI schema 2 and is not a full database backup. It omits image bytes, separate working drafts, provider credentials and some canonical metadata.

Import accepts at most 1 MiB of UTF-8 JSON, 100 posts and 300 targets. It rejects duplicate or unsafe keys, unsupported fields, malformed text, IDs or timestamps, media, covers, unknown attachments and bound posting slots. Settings and channel definitions are checked but not applied. Existing planning is preserved.

Preview is read-only and tied to the complete current state and revision. Identical existing records are skipped; conflicting IDs block the entire import. The duplicate comparison ignores only server-generated updatedAt and target order. It retains strict content, variant, label, scheduling and media comparisons. Duplicate-only imports perform no write.

A single explicit confirmation appends new records through the existing revision-checked adapter. The adapter checks each imported UTC instant against the resolved local time before any write. Ambiguous or missing daylight-saving times and resolver disagreement are rejected. Canonical request expansion can still exceed the server request limit even when the file passed its initial size check; rejection is atomic.

Confirmed or uncertain save outcomes disable further attempts until reload and review. There is no automatic retry, overwrite, partial import, media upload or social publication. Import does not restore a database or guarantee byte-identical timestamps for retained records.
