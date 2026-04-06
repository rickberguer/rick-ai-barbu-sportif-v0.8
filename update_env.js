const { spawnSync } = require('child_process');
const fs = require('fs');

const serviceAccountJson = fs.readFileSync('temp_key.json', 'utf8');

console.log("Updating Cloud Run service env var...");
const result = spawnSync('gcloud', [
  'run', 'services', 'update', 'barbusportif-ai',
  '--region', 'us-central1',
  '--update-env-vars', `DRIVE_SERVICE_ACCOUNT_JSON=${serviceAccountJson}`
], { encoding: 'utf8', shell: true });

console.log('stdout:', result.stdout);
console.error('stderr:', result.stderr);
if (result.error) {
  console.error("Execution error:", result.error);
}
