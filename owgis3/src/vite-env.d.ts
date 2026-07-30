/// <reference types="vite/client" />

declare module "*.xml?raw" {
  const content: string;
  export default content;
}
