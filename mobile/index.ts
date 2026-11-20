// Entry point. Metro picks src/boot.web.ts for the browser build (it has to
// load the Skia WebAssembly module first) and src/boot.ts everywhere else.
import './src/boot';
