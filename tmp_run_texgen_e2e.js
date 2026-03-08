const backend = require('./apps/desktop/backend/dist/index.js');

async function main() {
  const imagePath = process.argv[2];
  if (!imagePath) {
    throw new Error('imagePath argument is required');
  }
  await backend.startBackend('dev');
  const result = await backend.runWorkflow('hunyuan_image_to_3d_textured.json', { imagePath });
  console.log('RUN_RESULT_JSON_START');
  console.log(JSON.stringify(result, null, 2));
  console.log('RUN_RESULT_JSON_END');
}

main().catch((error) => {
  console.error('RUN_ERROR');
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
