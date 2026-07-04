-- Allow editors to delete monthly report drafts

create policy "monthly_reports_delete_editors"
on public.monthly_reports for delete
to authenticated
using (public.can_edit_events());
