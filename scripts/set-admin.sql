insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role
from auth.users
where email = '<admin-email>'
on conflict (user_id, role) do nothing;

-- Grant by UUID instead of email.
-- insert into public.user_roles (user_id, role)
-- values ('<auth-user-uuid>'::uuid, 'admin'::public.app_role)
-- on conflict (user_id, role) do nothing;

-- Revoke by UUID. Run separately after replacing the placeholder.
-- delete from public.user_roles
-- where user_id = '<auth-user-uuid>'::uuid
--   and role = 'admin'::public.app_role;
