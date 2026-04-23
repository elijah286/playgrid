-- Strip the content-hiding keys (typeFilter, view) from filters_snapshot on
-- existing invites. These keys shouldn't have been snapshotted because they
-- hide plays (e.g. the coach was filtered to "offense" when creating the
-- invite, so the invitee lands on a playbook where defense/ST plays appear
-- missing). The action layer now sanitizes on write and read; this backfill
-- cleans up outstanding invites that were created before the fix.

update public.playbook_invites
set filters_snapshot = filters_snapshot - 'typeFilter' - 'view'
where filters_snapshot ? 'typeFilter' or filters_snapshot ? 'view';
