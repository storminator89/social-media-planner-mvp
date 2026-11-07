-- Legacy approvals remain readable but cannot execute without a policy receipt.
ALTER TABLE planner_youtube_uploads ADD COLUMN policy_ack TEXT CHECK(policy_ack IS NULL OR policy_ack='youtube-guidelines-v1');
