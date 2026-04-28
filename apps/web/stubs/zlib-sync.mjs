/**
 * Optional native dep for @discordjs/ws (faster zlib). Discord falls back if null.
 * Stub avoids a node-gyp build on Windows/CI; install `zlib-sync` in prod on Linux if desired.
 */
const noopZlibSync = null;
export default noopZlibSync;
