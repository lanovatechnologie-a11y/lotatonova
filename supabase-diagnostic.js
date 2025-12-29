// supabase-diagnostic.js
// Usage: set SUPABASE_URL, SUPABASE_ANON_KEY, TEST_TABLE then `node supabase-diagnostic.js`

const { execSync } = require('child_process');
const http = require('http');
const https = require('https');

async function run() {
  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
  const TEST_TABLE = process.env.TEST_TABLE || ''; // ex: users

  console.log('--- Supabase Diagnostic ---');
  console.log('SUPABASE_URL:', SUPABASE_URL ? SUPABASE_URL : '(non fourni)');
  console.log('TEST_TABLE:', TEST_TABLE ? TEST_TABLE : '(non fourni)');

  if (!SUPABASE_URL) {
    console.error('Erreur: SUPABASE_URL non fourni. Définissez la variable d\'environnement et relancez.');
    process.exitCode = 2;
    return;
  }
  try {
    // 1) DNS lookup (using system nslookup if available)
    try {
      console.log('\n1) DNS lookup (nslookup) :');
      const dom = new URL(SUPABASE_URL).hostname;
      const out = execSync(`nslookup ${dom} 2>&1`, { encoding: 'utf8', timeout: 5000 });
      console.log(out.trim());
    } catch (dnsErr) {
      console.warn('nslookup failed (non critique) :', dnsErr.message.trim());
      // fallback: try simple HTTPS request below which also checks resolution
    }

    // 2) HTTP(S) HEAD request to check host reachability
    console.log('\n2) HTTP(S) request to SUPABASE_URL:');
    await httpCheck(SUPABASE_URL);

    // 3) Test with supabase-js if key provided
    if (!SUPABASE_ANON_KEY) {
      console.warn('\n3) Clé non fournie : test supabase-js sauté. Fournissez SUPABASE_ANON_KEY pour un test complet.');
    } else {
      console.log('\n3) Test supabase-js simple (lecture) :');
      await supabaseTest(SUPABASE_URL, SUPABASE_ANON_KEY, TEST_TABLE);
    }

    console.log('\nDiagnostic terminé.');
  } catch (err) {
    console.error('\nErreur inattendue pendant le diagnostic :', err && err.message ? err.message : err);
  }
}

function httpCheck(urlStr) {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(urlStr);
      const lib = urlObj.protocol === 'https:' ? https : http;
      const options = {
        method: 'HEAD',
        timeout: 8000,
      };
      const req = lib.request(urlObj, options, (res) => {
        console.log(`HTTP ${res.statusCode} ${res.statusMessage}`);
        // print some headers
        console.log('Headers (partial):', {
          server: res.headers.server,
          date: res.headers.date,
          'content-type': res.headers['content-type'],
        });
        resolve();
      });
      req.on('timeout', () => {
        console.error('Requête HTTP timeout (8s).');
        req.destroy();
        resolve();
      });
      req.on('error', (e) => {
        console.error('Erreur HTTP:', e.message);
        resolve();
      });
      req.end();
    } catch (e) {
      console.error('httpCheck error:', e.message || e);
      resolve();
    }
  });
}

async function supabaseTest(url, key, table) {
  // lazy import to avoid requiring package if not installed
  let createClient;
  try {
    const pkg = require('@supabase/supabase-js');
    createClient = pkg.createClient;
  } catch (e) {
    console.warn('Le paquet @supabase/supabase-js n\'est pas installé. Tentative d\'installation locale...');
    try {
      execSync('npm install --no-audit --no-fund @supabase/supabase-js@2 --prefer-offline', { stdio: 'inherit', timeout: 120000 });
      const pkg2 = require('@supabase/supabase-js');
      createClient = pkg2.createClient;
    } catch (installErr) {
      console.error('Impossible d\'installer @supabase/supabase-js automatiquement :', installErr.message || installErr);
      console.error('Installez manuellement le package puis relancez : npm install @supabase/supabase-js');
      return;
    }
  }

  try {
    const supabase = createClient(url, key, { global: { headers: { 'x-client-info': 'diag-script' } } });
    // simple request: select 1 from table or fallback to RPC on pg_catalog
    if (table) {
      console.log(`Issuing: supabase.from('${table}').select().limit(1)`);
      const res = await supabase.from(table).select('*').limit(1);
      if (res.error) {
        console.error('supabase-js error:', res.error);
        console.log('status:', res.status, 'data:', res.data);
      } else {
        console.log('OK. Received data (truncated):', Array.isArray(res.data) ? res.data.slice(0, 3) : res.data);
      }
    } else {
      console.log('Aucune table de test fournie. Tentative d\'appel GET /rest/v1/ (root) pour vérifier l\'API.');
      try {
        const fetchRes = await supabase.rest.from('').select();
        console.log('REST root response:', fetchRes);
      } catch (e) {
        console.error('Erreur en appel REST root:', e && e.message ? e.message : e);
      }
    }
  } catch (e) {
    console.error('Erreur lors du test supabase-js :', e && e.message ? e.message : e);
  }
}

run();