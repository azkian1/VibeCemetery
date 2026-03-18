import * as Phaser from 'phaser';
import { CemeteryScene } from './scenes/CemeteryScene';

export function createGameConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: '100%',
      height: '100%',
    },
    backgroundColor: '#1a1918',
    scene: [CemeteryScene],
    input: { windowEvents: false },
    audio: { noAudio: true },
    pixelArt: true,
    antialias: false,
  };
}
