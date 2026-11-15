declare module "virtual:studio3d-export-runtime" {
  const runtime: string;
  export default runtime;
}

declare module "virtual:studio3d-engine-bundles" {
  const bundles: { engineStatic: string; engineSim: string; standaloneStatic: string; standaloneSim: string };
  export default bundles;
}
