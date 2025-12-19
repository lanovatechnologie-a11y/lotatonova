const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase credentials missing!');
  console.error('SUPABASE_URL:', supabaseUrl ? '✓' : '❌');
  console.error('SUPABASE_KEY:', supabaseKey ? '✓' : '❌');
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
