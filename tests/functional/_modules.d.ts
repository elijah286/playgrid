// gifsicle exposes the path to its bundled binary as the default export, but
// ships no type declarations. The functional-test reporter only needs the path.
declare module "gifsicle" {
  const path: string;
  export default path;
}
