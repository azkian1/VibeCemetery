import * as Phaser from 'phaser';
import { CemeterySceneV2 } from './scenes/CemeterySceneV2';

export function createGameConfigV2(parent: HTMLElement, size: { width: number; height: number }): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    scale: {
      mode: Phaser.Scale.NONE,
      width: size.width,
      height: size.height,
    },
    backgroundColor: '#1a1918',
    scene: [CemeterySceneV2],
    input: { windowEvents: false, activePointers: 3 },
    audio: { noAudio: true },
    pixelArt: true,
    antialias: false,
  };
}
