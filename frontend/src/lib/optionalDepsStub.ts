/**
 * Stub for optional wallet-connector peer dependencies that this app never
 * uses. `@wagmi/connectors` ships a Safe (multisig) connector whose module
 * dynamically imports `@safe-global/safe-apps-sdk` and
 * `@safe-global/safe-apps-provider` (optional peer deps). This app only
 * configures the injected and Base Account connectors, so those imports are
 * never executed at runtime. Aliasing them to this module keeps production
 * builds reproducible even when the optional packages are absent — or
 * corrupted in a parent directory's node_modules — on the build machine.
 */
export default class OptionalDependencyStub {}
