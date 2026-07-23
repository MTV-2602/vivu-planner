const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  console.log('Querying auth users...');
  const { data: { users }, error: authError } = await supabaseAdmin.auth.admin.listUsers();
  if (authError) {
    console.error('Auth error:', authError);
    return;
  }

  const vinhUser = users.find(u => u.email.toLowerCase() === 'vinhvip4508@gmail.com');
  const teamUser = users.find(u => u.email.toLowerCase() === 'team89a6@gmail.com');

  console.log('Vinh Auth User:', vinhUser ? { id: vinhUser.id, email: vinhUser.email } : 'Not found');
  console.log('Team Auth User:', teamUser ? { id: teamUser.id, email: teamUser.email } : 'Not found');

  if (vinhUser) {
    const { data: profile, error: pError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', vinhUser.id)
      .maybeSingle();
    console.log('Vinh Profile:', pError ? pError : profile);
  }

  if (teamUser) {
    const { data: profile, error: pError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', teamUser.id)
      .maybeSingle();
    console.log('Team Profile:', pError ? pError : profile);
  }
}

run();
