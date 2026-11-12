import app from './app.js';
import { PORT } from './configs/index.js';
import { getUploadRoot } from './utils/mediaStorage.js';

// Probe UPLOAD_DIR (missing, unwritable, or inside backend/ or frontend/) so a misconfiguration
// is visible at boot, but do NOT take the whole API down for it: the rest of the portal keeps
// serving, media uploads and delivery answer 503 MEDIA_STORAGE_UNAVAILABLE, and each media
// request retries the check, so fixing the mount/permissions recovers without a restart.
try {
  await getUploadRoot();
} catch (error) {
  console.warn(
    '################################################################\n' +
      'WARNING: media storage is NOT usable. Uploads and media delivery are\n' +
      'disabled (HTTP 503) until UPLOAD_DIR is fixed; everything else keeps running.\n' +
      `Reason: ${error instanceof Error ? error.message : String(error)}\n` +
      '################################################################',
  );
}

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
