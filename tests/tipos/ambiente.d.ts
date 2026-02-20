declare const process: {
  env: Record<string, string | undefined>;
};

declare const __dirname: string;

declare module 'fs';
declare module 'path';
declare module 'xlsx';

declare module 'allure-playwright' {
  export const allure: {
    label: (name: string, value: string) => void;
    step: (name: string, body: () => Promise<void> | void) => Promise<void> | void;
    attachment: (name: string, content: unknown, contentType: string) => Promise<void> | void;
  };
}
