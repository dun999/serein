import { defineConfig, devices } from "@playwright/test";

const address = (digit: string) => `0x${digit.repeat(40)}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "pnpm build && pnpm start --port 3100",
    url: "http://127.0.0.1:3100",
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      NEXT_PUBLIC_VAULT_FACTORY_ADDRESS: address("1"),
      NEXT_PUBLIC_INSTRUCTION_SENDER_ADDRESS: address("2"),
      NEXT_PUBLIC_FXRP_ADDRESS: address("3"),
      NEXT_PUBLIC_ASSET_MANAGER_ADDRESS: address("4"),
      NEXT_PUBLIC_FTSO_V2_ADDRESS: address("5"),
      NEXT_PUBLIC_TEE_MACHINE_REGISTRY_ADDRESS: address("6"),
      NEXT_PUBLIC_FCC_TEE_ADDRESS: address("7"),
      NEXT_PUBLIC_FCC_EXTENSION_ID: `0x${"8".repeat(64)}`,
      NEXT_PUBLIC_FCC_PROXY_URL: "https://fcc.test",
    },
  },
});
