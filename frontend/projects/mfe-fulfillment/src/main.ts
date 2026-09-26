// Shared packages are negotiated before Angular starts, so bootstrap from a dynamic import.
import('./bootstrap').catch((err: unknown) => console.error(err));
