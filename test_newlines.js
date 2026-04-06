const fs = require('fs');

const envJson = `{   "type": "service_account",   "project_id": "barbu-sportif-ai-center",   "private_key_id": "9c1ceb22ada0e8d857b628b8085aa8a1b7fc8bed",   "private_key": "-----BEGIN PRIVATE KEY-----\\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCsNcfNeRMRuDr5\\nnhf4XNJdZ4T0/gvCDF91sT4PfDOGwb0Fyva/Qde/CsXrL62arjgmv4bL8kvTwiiXZ\\n-----END PRIVATE KEY-----\\n"}`;

const parsed = JSON.parse(envJson);
console.log("Original parsed:");
console.log(JSON.stringify(parsed.private_key));

const replaced1 = parsed.private_key.replace(/\\n/g, '\n');
console.log("With replace(/\\\\n/):");
console.log(JSON.stringify(replaced1));

// If the envvar contains true newline characters, the replace isn't needed. But what if the private key uses Windows newlines, or somehow is malformed?
// Another issue: `ERR_OSSL_UNSUPPORTED` might happen if the key size is weird, or if PKCS#8 vs PKCS#1.
