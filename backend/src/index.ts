import app from './app.js';
import { PORT } from './configs/index.js';
import { getUploadRoot } from './utils/mediaStorage.js';

// Fail fast on an unusable UPLOAD_DIR (missing, unwritable, or inside backend/ or frontend/)
// rather than discovering it on the first upload.
try {
  await getUploadRoot();
} catch (error) {
  console.error(
    `FATAL: media storage is not usable. ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
