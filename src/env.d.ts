/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ANNOTATION_SUPABASE_URL?: string;
  readonly VITE_ANNOTATION_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.css?inline" {
  const content: string;
  export default content;
}
