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

function coerceValue(value, expectedType) {
    if(typeof value === expectedType) {
        return value;
    }

    switch(expectedType) {
        case 'boolean':
            if(typeof value === 'string') {
                if(!isNaN(Number(value.trim())) && [0, 1].includes(Number(value.trim()))) {
                    return Number(value.trim()) === 1;
                }

                if(['true', 'false'].includes(value.trim().toLowerCase())) {
                    return value.trim().toLowerCase() === 'true';
                }
            }

            // If the user types `set <setting>` without a setting name, and the setting is a boolean, treat it as a shorthand for `true`.
            if(typeof value === 'undefined') {
                return true;
            }
            break;
        case 'number':
            if(typeof value === 'string') {
                if(!isNaN(Number(value.trim()))) {
                    return Number(value.trim());
                }
            }

            break;
    }

    throw new Error(`value ${value} does not fit type ${expectedType}`);
}

const State = {
    _needToRefocus: false,
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

                if(this._needToRefocus) {
                    this._needToRefocus = false;
                    if (PlayerPedId()) {
                        SetFocusEntity(PlayerPedId());
                    } else {
                        SetFocusPosAndVel(...GetGameplayCamCoord());
                    }
                }
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
    },
    setSetting(key, value) {
        if(!(key in this.settings)) {
            Logger.warn(`${key} is not a valid setting.`);
            return;
        }

        try {
            const typedValue = coerceValue(value, this.settingTypes[key]);
            this.settings[key] = typedValue;

            if(key === 'streamOn' && typedValue) {
                this._needToRefocus = true;
            }
        } catch (err) {
            Logger.error(`There was an error setting ${key}`, err);
        }

    },
    settings: {
        /**
         * If set to `true`, the script will set streaming focus to the current camera position.
         * @default false
         */
        streamOn: false,

        /**
         * If set to `true`, the script will smooth out the camera movement when input is let go of.
         */
        smooth: true,

        linearSpeed: 0.8,
        angularSpeed: 135,
        fovSpeed: 40,
    },
    inputState: {
        fwd: 0,
        up: 0,
        right: 0,
        pitch: 0,
        yaw: 0,
        roll: 0,
        fov: 0,
    },
    /** @type {Partial<Record<string, string>>} */
    get settingTypes() {
        return Object.fromEntries(Object.entries(this.settings).map(([k, v]) => [k, typeof v]));
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

        RegisterCommand("cam", (source, [cmd, settingName, settingVal]) => {
            let shouldEnable = !State.isEnabled;

            switch(cmd) {
                case 'on':
                    shouldEnable = true;
                    break;
                case 'off':
                    shouldEnable = false;
                    break;
                case 'set':
                    State.setSetting(settingName, settingVal);
                    return;
                case 'tp':
                    SetEntityCoords(PlayerPedId(), ...GetCamCoord(State.camera), false, false, false, false);
                    return;
                case 'info':
                    Logger.log(`current cam\n\tpos: ${vecToStr(GetCamCoord(State.camera))}\n\trot: ${vecToStr(GetCamRot(State.camera, 2))}\n\tfov: ${GetCamFov(State.camera)}`);
                    return;
            }

            if(shouldEnable !== State.isEnabled) {
                for (const key in State.inputState) {
                    State.inputState[key] = 0;
                }
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

const DEG_TO_RAD = Math.PI / 180;

function crossProduct(aX, aY, aZ, bX, bY, bZ) {
    return [(aY * bZ) - (aZ * bY), (aZ * bX) - (aX * bZ), (aX * bY) - (aY * bX)];
}

// % of speed to reduce by every tick
const DECAY_RATE = 4;

function processInput(input, currentValue, deltaTime, {smooth = false}) {
    /**
     * @type number
     */
    const finalInput = input;

    if(!smooth) {
        return finalInput;
    }

    const sign = Math.sign(input);

    // When direction changes, just return the input.
    if (sign > 0.1 || sign < -0.1) {
        if(sign !== Math.sign(currentValue)) {
            return input;
        }
    }

    return Math.sign(currentValue) * Math.max(Math.abs(input), Math.abs(currentValue) - (Math.abs(currentValue) * DECAY_RATE * deltaTime));
}

setTick(() => {
    if(State.isEnabled) {
        for(const control of ControlsToDisable) {
            DisableControlAction(0, control, true);
        }

        const deltaTime = GetFrameTime();
        const camLinearSpeed = State.settings.linearSpeed;
        const camAngularSpeed = State.settings.angularSpeed;
        const camFovSpeed = State.settings.fovSpeed;

        const forward = -GetDisabledControlNormal(0, Controls.MoveFwd);
        const right = -GetDisabledControlNormal(0, Controls.MoveRight);
        State.inputState.yaw = -GetDisabledControlNormal(0, Controls.LookHoriz);
        State.inputState.pitch = -GetDisabledControlNormal(0, Controls.LookVert);
        const rollRight = GetDisabledControlNormal(0, Controls.RollRight);
        const rollLeft = GetDisabledControlNormal(0, Controls.RollLeft);
        const up = -GetDisabledControlNormal(0, Controls.MoveUp) + GetDisabledControlNormal(0, Controls.MoveDown);
        const fovDelta = -GetDisabledControlNormal(0, Controls.FovUp) + GetDisabledControlNormal(0, Controls.FovDown);

        Object.entries({
            fwd: forward,
            right,
            roll: rollRight - rollLeft,
            up,
            fov: fovDelta
        }).forEach(([key, value]) => {
            State.inputState[key] = processInput(value, State.inputState[key], deltaTime, State.settings);
        });

        const [originX, originY, originZ] = GetCamCoord(State.camera);
        let [pitch, roll, yaw] = GetCamRot(State.camera, 2);
        const fov = GetCamFov(State.camera);

        if(State.settings.streamOn) {
            SetFocusPosAndVel(originX, originY, originZ, 0, 0, 0);
        }

        yaw += camAngularSpeed * State.inputState.yaw * deltaTime;
        pitch += camAngularSpeed * State.inputState.pitch * deltaTime;
        roll += camAngularSpeed * State.inputState.roll * 0.5 * deltaTime;

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
            originX + (forwardY * camLinearSpeed * State.inputState.fwd) + (rightY * camLinearSpeed * State.inputState.right) + (upY * camLinearSpeed * State.inputState.up),
            originY + (forwardX * camLinearSpeed * State.inputState.fwd) + (rightX * camLinearSpeed * State.inputState.right) + (upX * camLinearSpeed * State.inputState.up),
            originZ + (forwardZ * camLinearSpeed * State.inputState.fwd) + (rightZ * camLinearSpeed * State.inputState.right) + (upZ * camLinearSpeed * State.inputState.up),
        );

        SetCamFov(State.camera, fov - State.inputState.fov * deltaTime * camFovSpeed);

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