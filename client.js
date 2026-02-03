const ResourceName = 'fivem-freecam';

class Logger {
    static _prepLog(messageArr) {
        return [`[${ResourceName}] `, ...messageArr];
    }

    static log(...message) {
        console.log(...Logger._prepLog(message));
    }

    static warn(...message) {
        console.warn(...Logger._prepLog(message));
    }

    static error(...message) {
        console.error(...Logger._prepLog(...message));
    }
}

function validateCamera(camera) {
    if(camera === null || !DoesCamExist(camera)) {
        Logger.error(`camera ${camera} does not exist`);
        return false;
    }

    return true;
}

const State = {
    camera: null,
    isEnabled: false,
    setCameraEnabled(enabled = true) {
        if(validateCamera(this.camera)) {
            const wasEnabled = this.isEnabled;
            this.isEnabled = enabled;

            if (enabled && !wasEnabled) {
                this.resetCameraPos();
            }

            SetCamActive(this.camera, enabled);

            if(!enabled && wasEnabled) {
                RenderScriptCams(false, false, 0, false, false);
            }
        }
    },
    resetCameraPos() {
        if(validateCamera(this.camera)) {
            const playerCamPos = GetGameplayCamCoord();
            const playerCamRot = GetGameplayCamRot(2);
            const playerCamFov = GetGameplayCamFov();

            SetCamCoord(this.camera, ...playerCamPos);
            SetCamRot(this.camera, ...playerCamRot, 2);
            SetCamFov(this.camera, playerCamFov);
        }
    }
};

/**
 * Creates a scripted camera.
 * @returns {number}
 */
function createCamera() {
    const camHandle = CreateCam('DEFAULT_SCRIPTED_CAMERA', false);

    return camHandle;
}

function vecToStr([x, y, z]) {
    return `X = ${x}, Y = ${y}, Z = ${z}`;
}

on('onClientResourceStart', (resource) => {
    if (resource === ResourceName) {
        Logger.log('resource started');
        State.camera = createCamera();

        RegisterCommand("cam", (source, [cmd]) => {
            let shouldEnable = !State.isEnabled;

            switch(cmd) {
                case 'on':
                    shouldEnable = true;
                    break;
                case 'off':
                    shouldEnable = false;
                    break;
                case 'info':
                    Logger.log(`current cam\n\tpos: ${vecToStr(GetCamCoord(State.camera))}\n\trot: ${vecToStr(GetCamRot(State.camera, 2))}\n\tfov: ${GetCamFov(State.camera)}`);
                    return;
            }

            State.setCameraEnabled(shouldEnable);
        })
    }
});

const Controls = Object.freeze({
    LookHoriz: 1,
    LookVert: 2,
    FovUp: 252,
    FovDown: 253,
    MoveUp: 206,
    MoveDown: 205,
    RollLeft: 189,
    RollRight: 190,
    MoveFwd: 196,
    MoveRight: 195,
});

const ControlsToDisable = Object.values(Controls);

const CameraLinearSpeed = 0.8;
const CameraAngularSpeed = 135;
const CameraFovSpeed = 40;

const DEG_TO_RAD = Math.PI / 180;

function crossProduct(aX, aY, aZ, bX, bY, bZ) {
    return [(aY * bZ) - (aZ * bY), (aZ * bX) - (aX * bZ), (aX * bY) - (aY * bX)];
}

setTick(() => {
    if(State.isEnabled) {
        for(const control of ControlsToDisable) {
            DisableControlAction(0, control, true);
        }

        const deltaTime = GetFrameTime();

        const forward = -GetDisabledControlNormal(0, Controls.MoveFwd);
        const right = -GetDisabledControlNormal(0, Controls.MoveRight);
        const lookRight = -GetDisabledControlNormal(0, Controls.LookHoriz);
        const lookUp = -GetDisabledControlNormal(0, Controls.LookVert);
        const rollRight = GetDisabledControlNormal(0, Controls.RollRight);
        const rollLeft = GetDisabledControlNormal(0, Controls.RollLeft);
        const up = -GetDisabledControlNormal(0, Controls.MoveUp) + GetDisabledControlNormal(0, Controls.MoveDown);
        const fovDelta = -GetDisabledControlNormal(0, Controls.FovUp) + GetDisabledControlNormal(0, Controls.FovDown);

        const [originX, originY, originZ] = GetCamCoord(State.camera);
        let [pitch, roll, yaw] = GetCamRot(State.camera, 2);
        const fov = GetCamFov(State.camera);

        yaw += CameraAngularSpeed * lookRight * deltaTime;
        pitch += CameraAngularSpeed * lookUp * deltaTime;
        roll += CameraAngularSpeed * (rollRight - rollLeft) * 0.5 * deltaTime;

        const yawRad = yaw * DEG_TO_RAD;
        const pitchRad = pitch * DEG_TO_RAD;
        const rollRad = roll * DEG_TO_RAD;

        const forwardX = Math.cos(yawRad) * Math.cos(pitchRad)
        const forwardY = Math.sin(yawRad) * -Math.cos(pitchRad);
        const forwardZ = Math.sin(pitchRad);

        const rightX = Math.cos(yawRad + Math.PI * 0.5) * Math.cos(pitchRad);
        const rightY = Math.sin(yawRad + Math.PI * 0.5) * -Math.cos(pitchRad);
        const rightZ = Math.sin(pitchRad) * Math.sin(rollRad);

        const [upX, upY, upZ] = crossProduct(forwardX, forwardY, forwardZ, rightX, rightY, rightZ);

        SetCamRot(State.camera, pitch, roll, yaw, 2);

        SetCamCoord(
            State.camera,
            originX + (forwardY * CameraLinearSpeed * forward) + (rightY * CameraLinearSpeed * right) + (upY * CameraLinearSpeed * up),
            originY + (forwardX * CameraLinearSpeed * forward) + (rightX * CameraLinearSpeed * right) + (upX * CameraLinearSpeed * up),
            originZ + (forwardZ * CameraLinearSpeed * forward) + (rightZ * CameraLinearSpeed * right) + (upZ * CameraLinearSpeed * up),
        );

        SetCamFov(State.camera, fov - fovDelta * deltaTime * CameraFovSpeed);

        RenderScriptCams(true, false, 0, false, false);
    }
})

on('onResourceStop', (resource) => {
    if (resource === ResourceName) {
        if(State.camera !== null && DoesCamExist(State.camera)) {
            DestroyCam(State.camera, true);
            Logger.log('Removed script camera');
        }

        Logger.log('resource stopped');
    }
});