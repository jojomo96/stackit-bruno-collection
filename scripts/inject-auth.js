const fs = require('fs');
const path = require('path');

const collectionDir = path.join(__dirname, '../stackit-collection');
const collectionBruPath = path.join(collectionDir, 'collection.bru');

// --- 1. INJECT AUTH & SCRIPTS INTO THE ROOT ---
let collectionMeta = '';

if (fs.existsSync(collectionBruPath)) {
    collectionMeta = fs.readFileSync(collectionBruPath, 'utf8');
    collectionMeta = collectionMeta.replace(/^auth\s*\{[\s\S]*?^\}\n*/gm, '');
    collectionMeta = collectionMeta.replace(/^auth:\w+\s*\{[\s\S]*?^\}\n*/gm, '');
    collectionMeta = collectionMeta.replace(/^script:pre-request\s*\{[\s\S]*?^\}\n*/gm, '');
} else {
    collectionMeta = `meta {\n  name: STACKIT APIs\n}\n`;
}

const authSnippet = `
auth {
  mode: oauth2
}

auth:oauth2 {
  grant_type: authorization_code
  callback_url: http://localhost:8000
  authorization_url: https://accounts.stackit.cloud/oauth/v2/authorize
  access_token_url: https://accounts.stackit.cloud/oauth/v2/token
  refresh_token_url: https://accounts.stackit.cloud/oauth/v2/token
  client_id: stackit-cli-0000-0000-000000000001
  client_secret: 
  scope: openid offline_access email
  state: PubSub
  pkce: true
  credentials_placement: basic_auth_header
  credentials_id: credentials
  token_placement: header
  token_header_prefix: Bearer
  auto_fetch_token: true
  auto_refresh_token: true
}
`;

const preRequestSnippet = `
script:pre-request {
  const crypto = require("crypto");
  const axios = require("axios");
  const { URLSearchParams } = require("url");

  const DEFAULT_TOKEN_URL = "https://service-account.api.stackit.cloud/token";
  const tokenUrl = bru.getEnvVar("STACKIT_TOKEN_URL") || DEFAULT_TOKEN_URL;
  const currentToken = bru.getEnvVar("STACKIT_ACCESS_TOKEN");
  const tokenExpiryRaw = bru.getEnvVar("STACKIT_TOKEN_EXPIRY");
  const configRaw = bru.getEnvVar("SERVICE_ACCOUNT_CONFIG");

  const REFRESH_THRESHOLD_SECONDS = 30;
  let needsRefresh = false;

  if (!currentToken || !tokenExpiryRaw) {
    needsRefresh = true;
  } else {
    const now = Math.floor(Date.now() / 1000);
    const expiry = parseInt(tokenExpiryRaw);
    if (now >= expiry - REFRESH_THRESHOLD_SECONDS) needsRefresh = true;
  }

  if (needsRefresh) {
    if (!configRaw) {
      return; 
    }
    
    console.log(\`🔄 Initiating token refresh against: \${tokenUrl}\`);
    const config = JSON.parse(configRaw);
    const creds = config.credentials;

    const now = Math.floor(Date.now() / 1000);
    const exp = now + 900;
    const header = { alg: "RS512", typ: "JWT", kid: creds.kid };
    const payload = { iss: creds.iss, sub: creds.sub, aud: creds.aud, jti: crypto.randomUUID(), iat: now, exp: exp };

    function base64url(str) {
      return Buffer.from(str).toString("base64").replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
    }

    const dataToSign = \`\${base64url(JSON.stringify(header))}.\${base64url(JSON.stringify(payload))}\`;
    const signer = crypto.createSign("RSA-SHA512");
    signer.update(dataToSign);
    const signature = signer.sign(creds.privateKey, "base64").replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");

    try {
      const response = await axios.post(
        tokenUrl,
        new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: \`\${dataToSign}.\${signature}\` }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );
      bru.setEnvVar("STACKIT_ACCESS_TOKEN", response.data.access_token);
      bru.setEnvVar("STACKIT_TOKEN_EXPIRY", Math.floor(Date.now() / 1000) + (response.data.expires_in || 3600));
      console.log("✅ Token refreshed successfully!");
    } catch (error) {
      console.error("❌ Failed to refresh token:", error.response ? error.response.data : error.message);
      throw error;
    }
  }
}
`;

fs.writeFileSync(collectionBruPath, collectionMeta.trim() + "\n\n" + authSnippet.trim() + "\n\n" + preRequestSnippet.trim() + "\n", 'utf8');
console.log("✅ Root collection.bru initialized with Auth & Scripts.");

// --- 2. ENFORCE INHERITANCE AND FIX EMPTY VARIABLES ---
function enforceAuthInheritance(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);

        if (fs.statSync(fullPath).isDirectory()) {
            enforceAuthInheritance(fullPath);
        }
        else if (fullPath.endsWith('.bru') && file !== 'collection.bru' && file !== 'folder.bru') {
            let content = fs.readFileSync(fullPath, 'utf8');

            // 1. Strip hardcoded auth
            content = content.replace(/^auth\s*\{[\s\S]*?^\}\n*/gm, '');
            content = content.replace(/^auth:\w+\s*\{[\s\S]*?^\}\n*/gm, '');

            // 2. Inject auth inheritance
            if (!content.includes('mode: inherit')) {
                content = content.replace(/^(meta\s*\{[\s\S]*?^\})/m, '$1\n\nauth {\n  mode: inherit\n}');
            }

            // 3. Auto-populate empty path variables (e.g., changing 'projectId: ' to 'projectId: {{projectId}}')
            let lines = content.split('\n');
            let inPathParams = false;

            for (let i = 0; i < lines.length; i++) {
                if (lines[i].trim() === 'params:path {') {
                    inPathParams = true;
                } else if (inPathParams && lines[i].trim() === '}') {
                    inPathParams = false;
                } else if (inPathParams) {
                    // Look for empty variables like "  projectId: " or "  region:"
                    let match = lines[i].match(/^( +)([a-zA-Z0-9_-]+):\s*$/);
                    if (match) {
                        lines[i] = `${match[1]}${match[2]}: {{${match[2]}}}`;
                    }
                }
            }
            content = lines.join('\n');

            fs.writeFileSync(fullPath, content);
        }
    }
}

enforceAuthInheritance(collectionDir);
console.log("✅ Enforced auth inheritance and populated empty variables.");