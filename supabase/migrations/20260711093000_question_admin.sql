-- Host admin can now add/remove bank questions. Removal is a soft delete so
-- historical player_responses rows (FK -> questions.id) stay intact.
alter table questions add column if not exists is_active boolean not null default true;
