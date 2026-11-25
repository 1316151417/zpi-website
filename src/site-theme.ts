export type SiteTheme = "light" | "dark";

declare global {
  interface Window {
    zpiAppearance?: {
      current(): SiteTheme;
      select(value: SiteTheme): void;
      apply(value: SiteTheme): void;
    };
  }
}

export const currentTheme = (): SiteTheme => window.zpiAppearance?.current() ?? "light";
