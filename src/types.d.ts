declare module "*.txt" {
  const value: string;
  export default value;
}

declare module "*.yaml" {
  const value: string;
  export default value;
}

declare module "turndown-plugin-gfm" {
  import type TurndownService from "turndown";

  export function gfm(service: TurndownService): void;
}
