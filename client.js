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

on('onClientResourceStart', (resource) => {
    if (resource === ResourceName) {
        Logger.log('resource started');
        State.camera = createCamera();

        RegisterCommand("cam", (params) => {
            Logger.log('params', params);
            State.setCameraEnabled(!State.isEnabled);
        })
    }
});

const Controls = Object.freeze({
    LookHoriz: 1,
    LookVert: 2,
    FovUp: 252, // 314,
    FovDown: 253, // 315,
    MoveUp: 206, // 316,
    MoveDown: 205, // 317,
    RollLeft: 189,
    RollRight: 190,
    MoveFwd: 196,
    MoveRight: 195,
});

const ControlsToDisable = Object.values(Controls);

const CameraLinearSpeed = 4;
const CameraAngularSpeed = 135;

const DEG_TO_RAD = Math.PI / 180;
/*
function rotateVector(vecX, vecY, vecZ, yaw, pitch) {
    const yawRad = yaw * DEG_TO_RAD;
    const pitchRad = pitch * DEG_TO_RAD;

    const rotMat = [
        []
    ]
}*/

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
        const right = GetDisabledControlNormal(0, Controls.MoveRight);
        const lookRight = -GetDisabledControlNormal(0, Controls.LookHoriz);
        const lookUp = -GetDisabledControlNormal(0, Controls.LookVert);

        if(lookRight || lookUp) {
            Logger.log(`input: (${lookRight}, ${lookUp})`);
        }

        const [originX, originY, originZ] = GetCamCoord(State.camera);
        let [pitch, roll, yaw] = GetCamRot(State.camera, 2);
        yaw += CameraAngularSpeed * lookRight * deltaTime;
        pitch += CameraAngularSpeed * lookUp * deltaTime;
        const globalFwd = [1, 0, 0];
        const globalRgt = [0, 1, 0];

        const yawRad = yaw * DEG_TO_RAD;
        const pitchRad = pitch * DEG_TO_RAD;

        // TODO: sideways motion
        const forwardX = Math.cos(yawRad) * Math.cos(pitchRad)
        const forwardY = Math.sin(yawRad) * -Math.cos(pitchRad);
        const forwardZ = Math.sin(pitchRad);
        SetCamRot(State.camera, pitch, roll, yaw, 2);
        // PointCamAtCoord(State.camera, originX + offsetX * 10, originY + offsetY * 10, originZ + offsetZ * 10);

        SetCamCoord(
            State.camera,
            originX + (forwardY * CameraLinearSpeed * forward),
            originY + (forwardX * CameraLinearSpeed * forward),
            originZ + (forwardZ * CameraLinearSpeed * forward),
        );

        RenderScriptCams(true, false, 0, false, false);
        // const localFwd = globalFwd.map((c, i) => c * [Math.sin(yawRad), Math.cos(yawRad), 0][i])
        // const localRgt = globalRgt.map((c, i) => c * [Math.sin(pitchRad), Math.cos(pitchRad), 0])[i]
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