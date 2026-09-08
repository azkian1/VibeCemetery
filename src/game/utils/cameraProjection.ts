export interface CameraViewport {
  width: number;
  height: number;
  zoom: number;
}

export interface CameraPosition extends CameraViewport {
  scrollX: number;
  scrollY: number;
}

/** Phaser's default camera origin is the viewport centre, even when zoomed. */
export function cameraWorldView(camera: CameraPosition, scrollX = camera.scrollX, scrollY = camera.scrollY) {
  const width = camera.width / camera.zoom;
  const height = camera.height / camera.zoom;
  return {
    x: scrollX + (camera.width - width) / 2,
    y: scrollY + (camera.height - height) / 2,
    width,
    height,
  };
}

/** Convert a world-space visible top-left back to Phaser's unscaled scroll. */
export function cameraScrollFromWorldView(camera: CameraViewport, x: number, y: number) {
  return {
    x: x - (camera.width - camera.width / camera.zoom) / 2,
    y: y - (camera.height - camera.height / camera.zoom) / 2,
  };
}

export function cameraScrollForCenter(camera: CameraViewport, x: number, y: number) {
  return { x: x - camera.width / 2, y: y - camera.height / 2 };
}

export function worldPointToCamera(camera: CameraPosition, x: number, y: number) {
  const view = cameraWorldView(camera);
  return { x: (x - view.x) * camera.zoom, y: (y - view.y) * camera.zoom };
}
