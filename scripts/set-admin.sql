insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role
from auth.users
where email = ''
on conflict (user_id, role) do nothing;


# granting
insert into public.user_roles (user_id, role)
values ('<auth-user-uuid>', 'admin')
on conflict (user_id, role) do nothing;

$ Revoking
delete from public.user_roles
where user_id = '<auth-user-uuid>' and role = 'admin';
