import { supabaseAdmin } from './services/supabaseAdmin';

async function checkUser() {
  const { data: users, error: userErr } = await supabaseAdmin.auth.admin.listUsers();
  if (userErr) {
    console.error('List users error:', userErr.message);
    return;
  }
  const targetUser = users.users.find(u => u.email === 'hausieucapvippro11@gmail.com');
  if (!targetUser) {
    console.log('User not found');
    return;
  }
  console.log('User ID:', targetUser.id);
  
  const { data: profile, error: profErr } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', targetUser.id)
    .single();
    
  if (profErr) {
    console.error('Profile query error:', profErr.message);
  } else {
    console.log('Profile Data:', profile);
  }
  
  const { count, error: countErr } = await supabaseAdmin
    .from('trips')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', targetUser.id);
    
  console.log('DB Trip Count:', count);
}

checkUser();
