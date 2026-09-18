const { createClient } = require('@supabase/supabase-js')

const supabaseUrl  = process.env.SUPABASE_URL
const supabaseKey  = process.env.SUPABASE_SERVICE_KEY   // service_role — nunca expor no frontend

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios.')
}

const supabase = createClient(supabaseUrl, supabaseKey)

module.exports = supabase
