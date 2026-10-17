/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SIGNALING_URL: string;
  readonly VITE_APP_URL: string;
  readonly VITE_ENABLE_DEBUG_HOOKS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
