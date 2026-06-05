import { EventEmitter } from 'events';

/**
 * Global game event bus.
 * gameLoop.js emits events here; the SSE server subscribes and forwards them to browsers.
 * In CLI mode nobody subscribes and events are silently dropped.
 */
export const gameEvents = new EventEmitter();
gameEvents.setMaxListeners(50);
