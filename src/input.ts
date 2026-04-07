import type { Camera, MouseDrag } from "./types";

export const handleCameraKeyArrows = (event: KeyboardEvent, camera: Camera, step: number = 0.1): void => {
    const pitchLimit = Math.PI * 0.5 - 0.01;

    if (event.key === "ArrowLeft") {
        camera.yaw -= step;
        event.preventDefault();
    };

    if (event.key === "ArrowRight") {
        camera.yaw += step;
        event.preventDefault();
    };

    if (event.key === "ArrowUp") {
        camera.pitch += step;
        camera.pitch = Math.min(camera.pitch, pitchLimit);
        event.preventDefault();
    }

    if (event.key === "ArrowDown") {
        camera.pitch -= step;
        camera.pitch = Math.max(camera.pitch, -pitchLimit);
        event.preventDefault();
    }
}

export const handleCameraMouseDrag = (
    event: MouseEvent,
    camera: Camera,
    mouseDrag: MouseDrag,
    sensitivity: number = 0.005,
): void => {
    if (!mouseDrag.active) return;

    const dx = event.clientX - mouseDrag.lastX;
    const dy = event.clientY - mouseDrag.lastY;

    mouseDrag.lastX = event.clientX;
    mouseDrag.lastY = event.clientY;

    camera.yaw += dx * sensitivity;
    camera.pitch -= dy * sensitivity;

    const pitchLimit = Math.PI * 0.5 - 0.01;
    camera.pitch = Math.max(-pitchLimit, Math.min(camera.pitch, pitchLimit));
};

export const handleCameraWheelZoom = (
    event: WheelEvent,
    camera: Camera,
    minRadius: number,
    maxRadius: number,
    zoomStep: number = 1.1,
): void => {
    if (event.deltaY > 0) {
        camera.radius = Math.min(camera.radius * zoomStep, maxRadius);
    } else if (event.deltaY < 0) {
        camera.radius = Math.max(camera.radius / zoomStep, minRadius);
    }

    event.preventDefault();
};
