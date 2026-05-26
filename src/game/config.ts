import * as Phaser from 'phaser';
import { CemeteryScene } from './scenes/CemeteryScene';

export function createGameConfig(parent: HTMLElement, size: { width: number; height: number }): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    scale: {
      mode: Phaser.Scale.NONE,
      width: size.width,
      height: size.height,
    },
    backgroundColor: '#1a1918',
    scene: [CemeteryScene],
    input: { windowEvents: false, activePointers: 3 },
    audio: { noAudio: true },
    pixelArt: true,
    antialias: false,
  };
}
