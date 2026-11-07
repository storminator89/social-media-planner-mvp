# YouTube UI browser verification

2026-11-07. A separate local QA copy used the actual default-off server routes and the new UI, no simulated status store and no added runtime configuration, credentials, media or grants.

Observed on desktop and a dedicated native Chromium window at 400 CSS px (ordinary 125% zoom):

- Actual YouTube readiness renders Einrichtung erforderlich. Link and private-upload buttons are disabled; existing LinkedIn default-off behavior remains intact.
- Read-only history opens a native dialog. Because runtime configuration is absent, the history/media requests fail safely; explicit error and unknown counts appear. No fake connection, zero-file success or provider success is shown.
- All file/metadata fields are disabled. Both yes/no groups have zero preselected radios. No upload, payment, public visibility, scheduling, password or token action was used.
- Mobile page client/scroll width 388 px. Dialog client/scroll width 368 px, overall width 382 px. No horizontal overflow; fields stack vertically, content scrolls normally.
- Keyboard Enter on history reload preserves focus after the response. Escape closes the dialog and returns focus to the history button. The native modal keeps the background inert.
- Browser zoom restored, only owned tabs and mobile window closed, Sites preview stopped. No QA database is included in the source artifact.

Limits: no enabled provider branch, actual login, file picker upload, Google call, channel verification, real private upload, live token expiry, production Sites authentication or deployed storage was tested. Active workflow coverage comes from explicitly synthetic unit tests. No screen-reader device test was performed beyond browser accessibility-tree/keyboard observations.
